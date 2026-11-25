import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireAuth } from "@/lib/server";
import { connectToDatabase } from "@/lib/database";
import { isObjectId } from "@/lib/content";
import { getMux } from "@/lib/mux";
import Course from "@/models/Course";
import CourseRelease from "@/models/CourseRelease";

type Context = { params: Promise<{ courseId: string }> };
const requestSchema = z.object({ moduleId: z.string().regex(/^[a-f\d]{24}$/i), lessonId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();

export async function POST(request: Request, context: Context) {
  try {
    await requireAuth();
    const { courseId } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!isObjectId(courseId) || !parsed.success) return NextResponse.json({ error: "Invalid playback request." }, { status: 400 });
    await connectToDatabase();
    const course = await Course.exists({ _id: courseId, status: "published" });
    const release = await CourseRelease.findOne({ courseId }).sort({ publishedAt: -1 }).lean();
    const courseModule = release?.modules.find((item: { _id: { toString(): string } }) => item._id.toString() === parsed.data.moduleId);
    const lesson = courseModule?.lessons.find((item: { _id: { toString(): string }; type: string }) => item._id.toString() === parsed.data.lessonId && item.type === "video");
    const video = lesson?.content?.video as { status?: string; muxPlaybackId?: string } | undefined;
    if (!course || !video || video.status !== "ready" || !video.muxPlaybackId) return NextResponse.json({ error: "Video is unavailable." }, { status: 404 });
    const playbackToken = await getMux().jwt.signPlaybackId(video.muxPlaybackId, { expiration: "15m" });
    return NextResponse.json({ playbackId: video.muxPlaybackId, playbackToken, expiresInSeconds: 900 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Mux playback token error:", error);
    return NextResponse.json({ error: "Unable to authorize playback." }, { status: 500 });
  }
}
