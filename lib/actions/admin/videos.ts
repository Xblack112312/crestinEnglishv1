"use server";

import Mux from "@mux/ts";

import { connectToDatabase } from "@/lib/database";
import { requireAdmin } from "@/lib/server";
import Content from "@/models/Content";

interface PreviewInput {
  courseId: string;
  moduleId: string;
  lessonId: string;
}

export async function getAdminVideoPreviewToken({
  courseId,
  moduleId,
  lessonId,
}: PreviewInput) {
  // 1. Authenticate and authorize.
  await requireAdmin();

  // 2. Connect to MongoDB.
  await connectToDatabase();

  // 3. Find the course content.
  const document = await Content.findOne({ courseId }).select("modules");

  if (!document) {
    throw new Error("Course content not found.");
  }

  // Your Content model uses embedded modules and lessons.
  const module = document.modules.id(moduleId);
  const lesson = module?.lessons.id(lessonId);

  if (!lesson || lesson.type !== "video") {
    throw new Error("Video lesson not found.");
  }

  const video = lesson.content.video;

  if (!video || video.status !== "ready") {
    throw new Error("Video is not ready for playback.");
  }

  if (
    video.playbackPolicy !== "signed" ||
    !video.muxPlaybackId
  ) {
    throw new Error("This video does not have signed playback configured.");
  }

  // 4. Validate Mux credentials.
  const {
    MUX_TOKEN_ID,
    MUX_TOKEN_SECRET,
    MUX_SIGNING_KEY_ID,
    MUX_SIGNING_PRIVATE_KEY,
  } = process.env;

  if (
    !MUX_TOKEN_ID ||
    !MUX_TOKEN_SECRET ||
    !MUX_SIGNING_KEY_ID ||
    !MUX_SIGNING_PRIVATE_KEY
  ) {
    throw new Error("Mux signing credentials are not configured.");
  }

  // 5. Generate a temporary playback token.
  const mux = new Mux({
    tokenId: MUX_TOKEN_ID,
    tokenSecret: MUX_TOKEN_SECRET,
    jwtSigningKey: MUX_SIGNING_KEY_ID,
    jwtPrivateKey: MUX_SIGNING_PRIVATE_KEY,
  });

  const playbackToken = await mux.jwt.signPlaybackId(
    video.muxPlaybackId,
    {
      expiration: "4h",
    },
  );

  // 6. Return only the information needed by the player.
  return {
    playbackId: video.muxPlaybackId,
    playbackToken,
  };
}