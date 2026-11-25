import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireAdmin } from "@/lib/server";
import { connectToDatabase } from "@/lib/database";
import {
  findContent,
  findLesson,
  findModule,
  isObjectId,
  recordVideoUpload,
} from "@/lib/content";
import { getAppOrigin, getMux } from "@/lib/mux";
import { videoUploadRequestSchema } from "@/lib/validation/content";

type Context = { params: Promise<{ courseId: string }> };

async function createDirectUpload(request: Request, passthrough: string) {
  const upload = await getMux().video.uploads.create({
    cors_origin: getAppOrigin(request),
    timeout: 3600,
    new_asset_settings: {
      playback_policies: ["signed"],
      passthrough,
      // Mux's current API uses `inputs` (the older `input` property is deprecated).
      inputs: [
        {
          generated_subtitles: [
            { language_code: "en", name: "Generated transcript" },
          ],
        },
      ],
    },
  });

  if (!upload.url || !upload.id) {
    throw new Error("Mux did not create a complete direct upload.");
  }

  return upload;
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireAdmin();
    const { courseId } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = videoUploadRequestSchema
      .extend({
        moduleId: z.string().regex(/^[a-f\d]{24}$/i),
        lessonId: z.string().regex(/^[a-f\d]{24}$/i),
      })
      .strict()
      .safeParse(body);

    if (!isObjectId(courseId) || !parsed.success) {
      return NextResponse.json(
        { error: "Invalid video upload request." },
        { status: 400 },
      );
    }

    await connectToDatabase();
    const content = await findContent(courseId);
    const courseModule = content && findModule(content, parsed.data.moduleId);
    const lesson =
      courseModule && findLesson(courseModule, parsed.data.lessonId);

    if (!content || !courseModule || !lesson || lesson.type !== "video") {
      return NextResponse.json(
        { error: "Video lesson not found." },
        { status: 404 },
      );
    }

    const upload = await createDirectUpload(
      request,
      `${courseId}:${courseModule._id.toString()}:${lesson._id.toString()}`,
    );

    // Persist the upload ID before returning the signed URL to the browser.
    // The browser can now upload independently of unsaved lesson text fields.
    const lessonUpdatedAt = await recordVideoUpload({
      courseId,
      moduleId: courseModule._id.toString(),
      lessonId: lesson._id.toString(),
      userId: user._id,
      video: {
        playbackPolicy: "signed",
        status: "waiting_upload",
        muxUploadId: upload.id,
        muxAssetId: null,
        muxPlaybackId: null,
        fileName: parsed.data.fileName,
        sizeBytes: parsed.data.sizeBytes,
        durationSeconds: null,
        aspectRatio: null,
        readyAt: null,
        processingError: null,
      },
    });

    if (!lessonUpdatedAt) {
      // Avoid leaving an unused Direct Upload behind if the database reservation
      // loses a concurrency race after Mux has already created the upload.
      try {
        await getMux().video.uploads.cancel(upload.id);
      } catch (cleanupError) {
        console.error(
          "Unable to cancel an unclaimed Mux upload:",
          cleanupError,
        );
      }
      return NextResponse.json(
        {
          error:
            "The video lesson changed while the upload was being prepared. Reload the lesson and try again.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        uploadId: upload.id,
        uploadUrl: upload.url,
        expiresInSeconds: upload.timeout,
        status: "waiting_upload",
        lessonUpdatedAt: lessonUpdatedAt.toISOString(),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (
      error instanceof Error &&
      error.message === "The request origin does not match APP_ORIGIN."
    ) {
      return NextResponse.json(
        {
          error:
            "Video uploads are not configured for this site origin. Set APP_ORIGIN to the exact public application URL.",
        },
        { status: 503 },
      );
    }
    console.error("Mux direct upload creation failed:", error);
    return NextResponse.json(
      { error: "Unable to create the video upload." },
      { status: 502 },
    );
  }
}
