import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/database";
import { findContentForMuxAsset, saveWebhookContent } from "@/lib/content";
import { getMux } from "@/lib/mux";
import MuxWebhookEvent from "@/models/MuxWebhookEvent";

type MuxPlaybackId = { id: string; policy: string };
type MuxTrack = {
  id: string;
  type: string;
  status?: string;
  text_source?: string;
};
type MuxEventData = {
  // Asset events use `id` as the asset ID. Upload events use `id` as the upload ID.
  id: string;
  asset_id?: string;
  upload_id?: string;
  status?: "preparing" | "ready" | "errored";
  duration?: number;
  aspect_ratio?: string;
  playback_ids?: MuxPlaybackId[];
  errors?: { messages?: string[] };
  error?: { message?: string };
  tracks?: MuxTrack[];
};
type MuxEvent = { id: string; type: string; data: MuxEventData };

type VideoStatus =
  | "not_uploaded"
  | "waiting_upload"
  | "processing"
  | "ready"
  | "errored"
  | "cancelled"
  | "timed_out";

type VideoRecord = {
  muxUploadId?: string | null;
  muxAssetId?: string | null;
  muxPlaybackId?: string | null;
  playbackPolicy?: "signed" | null;
  status?: VideoStatus | null;
  processingError?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  readyAt?: Date | null;
};

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function transcriptSegmentsFromVtt(vtt: string) {
  return vtt.split(/\r?\n\r?\n/).flatMap((block) => {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const timing = lines.find((line) => line.includes("-->"));
    if (!timing) return [];
    const [start, end] = timing
      .split("-->")
      .map((value) => value.trim().split(" ")[0]);
    const toSeconds = (value: string | undefined) => {
      if (!value) return Number.NaN;
      const parts = value.replace(",", ".").split(":").map(Number);
      return parts.length === 3
        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
        : parts[0] * 60 + parts[1];
    };
    const startSeconds = toSeconds(start);
    const endSeconds = toSeconds(end);
    const text = lines
      .slice(lines.indexOf(timing) + 1)
      .join(" ")
      .trim();
    return Number.isFinite(startSeconds) &&
      Number.isFinite(endSeconds) &&
      endSeconds >= startSeconds &&
      text
      ? [{ startSeconds, endSeconds, text }]
      : [];
  });
}

/**
 * Claim one event atomically. A processed event is never run again. Failed
 * events and processing leases older than five minutes can be reclaimed, which
 * allows Mux retries to recover after a crashed/interrupted request.
 */
async function claimWebhookEvent(
  event: MuxEvent,
  assetId: string | null,
  uploadId: string | null,
) {
  try {
    await MuxWebhookEvent.create({
      eventId: event.id,
      eventType: event.type,
      muxAssetId: assetId,
      muxUploadId: uploadId,
      status: "received",
      attempts: 0,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }

  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
  const claimed = await MuxWebhookEvent.findOneAndUpdate(
    {
      eventId: event.id,
      $or: [
        { status: "received" },
        { status: "failed" },
        { status: "processing", updatedAt: { $lt: staleBefore } },
      ],
    },
    {
      $set: {
        eventType: event.type,
        muxAssetId: assetId,
        muxUploadId: uploadId,
        status: "processing",
        lastError: null,
        processedAt: null,
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: "after" },
  );

  if (claimed) return { claimed: true as const };

  const existing = await MuxWebhookEvent.findOne({ eventId: event.id }).lean();
  if (existing?.status === "processed")
    return { claimed: false as const, processed: true as const };
  return { claimed: false as const, processed: false as const };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: MuxEvent;
  try {
    const mux = getMux();
    await mux.webhooks.verifySignature(rawBody, request.headers);
    event = JSON.parse(rawBody) as MuxEvent;
  } catch (error) {
    console.error(
      "Mux webhook signature or JSON validation failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json({ error: "Webhook rejected." }, { status: 400 });
  }

  if (!event.id || !event.type || !event.data?.id) {
    return NextResponse.json(
      { error: "Malformed Mux webhook." },
      { status: 400 },
    );
  }

  const isUploadEvent = event.type.startsWith("video.upload.");
  const assetId = isUploadEvent ? (event.data.asset_id ?? null) : event.data.id;
  const uploadId = isUploadEvent
    ? event.data.id
    : (event.data.upload_id ?? null);

  try {
    await connectToDatabase();
    const claim = await claimWebhookEvent(event, assetId, uploadId);
    if (!claim.claimed) {
      if (claim.processed)
        return NextResponse.json({ received: true, duplicate: true });
      // A concurrent request owns the event, or its lease has not expired yet.
      // A non-2xx response lets Mux retry if the owner fails before completion.
      return NextResponse.json(
        { received: true, retry: true },
        { status: 503 },
      );
    }

    const content = await findContentForMuxAsset(assetId, uploadId);
    if (!content) {
      await MuxWebhookEvent.updateOne(
        { eventId: event.id, status: "processing" },
        {
          $set: {
            status: "processed",
            processedAt: new Date(),
            lastError: null,
          },
        },
      );
      return NextResponse.json({ received: true });
    }

    const mux = getMux();
    let changed = false;
    const now = new Date();

    for (const courseModule of content.modules) {
      for (const lesson of courseModule.lessons) {
        if (lesson.type !== "video") continue;
        const video = (lesson.content.video ?? {}) as VideoRecord;

        const matchesUpload =
          isUploadEvent && video.muxUploadId === event.data.id;
        const matchesAsset =
          !isUploadEvent &&
          (video.muxAssetId === event.data.id ||
            (!!event.data.upload_id &&
              video.muxUploadId === event.data.upload_id));
        if (!matchesUpload && !matchesAsset) continue;

        if (isUploadEvent) {
          if (event.type === "video.upload.asset_created") {
            video.muxAssetId = event.data.asset_id ?? video.muxAssetId ?? null;
            // Webhooks can arrive out of order. Never move a finished asset
            // backwards from ready/errored to processing.
            if (
              !(
                ["ready", "errored", "cancelled", "timed_out"] as string[]
              ).includes(video.status ?? "")
            ) {
              video.status = "processing";
              lesson.content.transcriptStatus = "processing";
            }
            video.processingError = null;
          } else if (event.type === "video.upload.errored") {
            if (
              !(["ready", "cancelled", "timed_out"] as string[]).includes(
                video.status ?? "",
              )
            ) {
              video.status = "errored";
              video.processingError = (
                event.data.error?.message ??
                "Mux could not receive this video upload."
              ).slice(0, 500);
              lesson.content.transcriptStatus = "errored";
            }
          } else if (event.type === "video.upload.cancelled") {
            if (
              !(["ready", "errored", "timed_out"] as string[]).includes(
                video.status ?? "",
              )
            ) {
              video.status = "cancelled";
              video.processingError = null;
            }
          } else if (event.type === "video.upload.timed_out") {
            if (
              !(["ready", "errored", "cancelled"] as string[]).includes(
                video.status ?? "",
              )
            ) {
              video.status = "timed_out";
              video.processingError =
                "The upload URL expired before the file transfer completed.";
            }
          } else {
            continue;
          }
        } else {
          video.muxAssetId = event.data.id;
          video.muxUploadId = event.data.upload_id ?? video.muxUploadId ?? null;
          video.durationSeconds =
            event.data.duration ?? video.durationSeconds ?? null;
          video.aspectRatio =
            event.data.aspect_ratio ?? video.aspectRatio ?? null;
            
          if (event.data.playback_ids) {
            const signedPlaybackId = event.data.playback_ids.find(
              (item) => item.policy === "signed",
            );

            video.muxPlaybackId = signedPlaybackId?.id ?? null;
            video.playbackPolicy = signedPlaybackId ? "signed" : null;
          }

          if (
            event.type === "video.asset.errored" ||
            event.data.status === "errored"
          ) {
            // A late error delivery must never downgrade an already-ready asset.
            if (
              !(["ready", "cancelled", "timed_out"] as string[]).includes(
                video.status ?? "",
              )
            ) {
              video.status = "errored";
              video.processingError =
                event.data.errors?.messages?.join(" ").slice(0, 500) ??
                "Mux could not process this video.";
              lesson.content.transcriptStatus = "errored";
            }
          } else if (
            event.type === "video.asset.ready" ||
            event.data.status === "ready"
          ) {
            if (video.status !== "cancelled" && video.status !== "timed_out") {
              video.status = "ready";
              video.readyAt = video.readyAt ?? now;
              video.processingError = null;

              const transcriptTrack = event.data.tracks?.find(
                (track) =>
                  track.type === "text" &&
                  track.text_source === "generated_vod" &&
                  track.status === "ready",
              );
              if (transcriptTrack && video.muxPlaybackId) {
                try {
                  const [transcript, vtt] = await Promise.all([
                    mux.video.playback.transcript(
                      video.muxPlaybackId,
                      transcriptTrack.id,
                    ),
                    mux.video.playback.track(
                      video.muxPlaybackId,
                      transcriptTrack.id,
                    ),
                  ]);
                  lesson.content.transcript = transcript.slice(0, 200_000);
                  lesson.content.transcriptSegments =
                    transcriptSegmentsFromVtt(vtt);
                  lesson.content.transcriptStatus = "ready";
                } catch {
                  lesson.content.transcriptStatus = "processing";
                }
              } else {
                lesson.content.transcriptStatus = "processing";
              }
            }
          } else if (
            event.type === "video.asset.created" ||
            event.type === "video.asset.updated"
          ) {
            if (
              !(
                ["ready", "errored", "cancelled", "timed_out"] as string[]
              ).includes(video.status ?? "")
            ) {
              video.status = "processing";
            }
          } else {
            continue;
          }
        }

        lesson.content.video = video;
        lesson.updatedAt = now;
        changed = true;
      }
    }

    if (changed) await saveWebhookContent(content);

    await MuxWebhookEvent.updateOne(
      { eventId: event.id, status: "processing" },
      {
        $set: { status: "processed", processedAt: new Date(), lastError: null },
      },
    );

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = (
      error instanceof Error
        ? error.message
        : "Unknown webhook processing error."
    ).slice(0, 1000);
    console.error("Mux webhook processing failed:", message);
    try {
      await MuxWebhookEvent.updateOne(
        { eventId: event.id, status: "processing" },
        { $set: { status: "failed", lastError: message } },
      );
    } catch (updateError) {
      console.error("Unable to persist Mux webhook failure:", updateError);
    }
    return NextResponse.json(
      { error: "Webhook processing failed. Mux may retry this event." },
      { status: 500 },
    );
  }
}
