import { NextResponse } from "next/server";

import { AuthorizationError, requireAuth } from "@/lib/server";
import { connectToDatabase } from "@/lib/database";
import { isObjectId, serializeContent } from "@/lib/content";
import Course from "@/models/Course";
import CourseRelease from "@/models/CourseRelease";

type Context = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireAuth();
    const { courseId } = await context.params;
    if (!isObjectId(courseId))
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    await connectToDatabase();
    const course = await Course.findOne({ _id: courseId, status: "published" })
      .select("title slug shortDescription thumbnail")
      .lean();
    const release = await CourseRelease.findOne({ courseId })
      .sort({ publishedAt: -1 })
      .lean();
    if (!course || !release)
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    const content = serializeContent(release as never, false, false);
    return NextResponse.json(
      {
        course: {
          id: course._id.toString(),
          title: course.title,
          slug: course.slug,
          shortDescription: course.shortDescription,
          thumbnail: course.thumbnail,
        },
        revision: release.revision,
        modules: content.modules,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("Student course content error:", error);
    return NextResponse.json(
      { error: "Unable to load course content." },
      { status: 500 },
    );
  }
}
