import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireAdmin } from "@/lib/server";
import { connectToDatabase } from "@/lib/database";
import { findContent, findLesson, findModule, isObjectId, markVideoUploadCancelled } from "@/lib/content";
import { getMux } from "@/lib/mux";

type Context = { params: Promise<{ courseId: string }> };

const requestSchema = z.object({
  moduleId: z.string().regex(/^[a-f\d]{24}$/i),
  lessonId: z.string().regex(/^[a-f\d]{24}$/i),
  uploadId: z.string().trim().min(1).max(255),
}).strict();

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireAdmin();
    const { courseId } = await context.params;
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));

    if (!isObjectId(courseId) || !parsed.success) {
      return NextResponse.json({ error: "Invalid video cancellation request." }, { status: 400 });
    }

    await connectToDatabase();
    const content = await findContent(courseId);
    const courseModule = content && findModule(content, parsed.data.moduleId);
    const lesson = courseModule && findLesson(courseModule, parsed.data.lessonId);
    const video = lesson?.type === "video" ? lesson.content.video as { muxUploadId?: string | null; status?: string } : null;

    if (!video || video.muxUploadId !== parsed.data.uploadId) {
      return NextResponse.json({ error: "This upload is no longer attached to the lesson." }, { status: 404 });
    }

    if (video.status !== "waiting_upload") {
      return NextResponse.json(
        { error: "This upload has already finished transferring or is no longer cancellable." },
        { status: 409 },
      );
    }

    // Mux only cancels a Direct Upload while its status is still `waiting`.
    await getMux().video.uploads.cancel(parsed.data.uploadId);

    const result = await markVideoUploadCancelled({
      courseId,
      moduleId: parsed.data.moduleId,
      lessonId: parsed.data.lessonId,
      uploadId: parsed.data.uploadId,
      userId: user._id,
    });

    if (!result) {
      return NextResponse.json(
        { error: "The lesson changed while the upload was being cancelled. Reload the lesson." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        video: result.video,
        lessonUpdatedAt: result.lessonUpdatedAt.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Mux video upload cancellation failed:", error);
    return NextResponse.json({ error: "Unable to cancel this video upload." }, { status: 502 });
  }
}
