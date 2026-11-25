import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { AuthorizationError, requireAdmin } from "@/lib/server";
import { connectToDatabase } from "@/lib/database";
import { contentActionSchema } from "@/lib/validation/content";
import { ensureContent, findLesson, findModule, isObjectId, newLesson, saveContent, saveVideoLessonMetadata, serializeContent } from "@/lib/content";
import Course from "@/models/Course";

type Context = { params: Promise<{ courseId: string }> };

function failure(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  if (error instanceof Error && error.name === "VersionError") {
    return NextResponse.json(
      {
        error:
          "This course content was changed by another request. Reload the course and try again.",
      },
      { status: 409 },
    );
  }

  if (
    error instanceof Error &&
    ["ValidationError", "StrictModeError", "CastError"].includes(error.name)
  ) {
    console.error("Course content validation failed:", error);
    return NextResponse.json(
      { error: error.message.slice(0, 1000) },
      { status: 400 },
    );
  }

  console.error("Course content API error:", error);
  return NextResponse.json(
    { error: "Unable to manage course content." },
    { status: 500 },
  );
}

function courseSummary(course: { _id: Types.ObjectId; title: string; slug: string; thumbnail: string; status: "draft" | "published" | "archived" }) {
  return { _id: course._id.toString(), title: course.title, slug: course.slug, thumbnail: course.thumbnail, status: course.status };
}

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireAdmin();
    const { courseId } = await context.params;
    if (!isObjectId(courseId)) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    await connectToDatabase();
    const course = await Course.findById(courseId).select("title slug thumbnail status createdBy").lean();
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    const content = await ensureContent(courseId, user._id);
    const serialized = serializeContent(content, true, true);
    return NextResponse.json({ course: courseSummary(course), modules: serialized.modules.map(({ lessons: _lessons, ...courseModule }) => ({ ...courseModule, courseId })), lessons: serialized.modules.flatMap((courseModule) => courseModule.lessons.map((lesson) => ({ ...lesson, courseId, moduleId: courseModule._id }))) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireAdmin();
    const { courseId } = await context.params;
    if (!isObjectId(courseId)) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    const body = await request.json().catch(() => null);
    const parsed = contentActionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid content request.", details: parsed.error.flatten() }, { status: 400 });
    await connectToDatabase();
    if (!(await Course.exists({ _id: courseId }))) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    const content = await ensureContent(courseId, user._id);
    const action = parsed.data;
    const timestamp = new Date();

    if (action.action === "create-module") {
      const courseModule = { _id: new Types.ObjectId(), title: action.data.title, description: "", order: content.modules.length, lessons: [], createdAt: timestamp, updatedAt: timestamp };
      content.modules.push(courseModule);
      await saveContent(content, user._id);
      return NextResponse.json({ module: { _id: courseModule._id.toString(), courseId, title: courseModule.title, description: courseModule.description, order: courseModule.order, updatedAt: courseModule.updatedAt.toISOString() } }, { status: 201 });
    }

    if (action.action === "update-module" || action.action === "delete-module") {
      const courseModule = findModule(content, action.moduleId);
      if (!courseModule) return NextResponse.json({ error: "Module not found." }, { status: 404 });
      if (action.action === "delete-module") {
        content.modules = content.modules.filter((item) => item !== courseModule);
        content.modules.forEach((item, index) => { item.order = index; });
        await saveContent(content, user._id);
        return NextResponse.json({ success: true });
      }
      if (courseModule.updatedAt.toISOString() !== action.data.expectedUpdatedAt) return NextResponse.json({ error: "This courseModule was changed elsewhere. Reload and try again." }, { status: 409 });
      courseModule.title = action.data.title;
      courseModule.description = action.data.description;
      courseModule.updatedAt = timestamp;
      await saveContent(content, user._id);
      return NextResponse.json({ module: { _id: courseModule._id.toString(), courseId, title: courseModule.title, description: courseModule.description, order: courseModule.order, updatedAt: courseModule.updatedAt.toISOString() } });
    }

    if (action.action === "reorder") {
      const moduleIds = new Set(content.modules.map((item) => item._id.toString()));
      if (action.data.modules.length !== content.modules.length || action.data.lessons.length !== content.modules.reduce((total, item) => total + item.lessons.length, 0)) return NextResponse.json({ error: "The complete course structure is required to reorder content." }, { status: 400 });
      if (new Set(action.data.modules.map((item) => item._id)).size !== action.data.modules.length || action.data.modules.some((item) => !moduleIds.has(item._id))) return NextResponse.json({ error: "Invalid courseModule order." }, { status: 400 });
      const lessonsById = new Map(content.modules.flatMap((item) => item.lessons.map((lesson) => [lesson._id.toString(), lesson] as const)));
      if (new Set(action.data.lessons.map((item) => item._id)).size !== action.data.lessons.length || action.data.lessons.some((item) => !lessonsById.has(item._id) || !moduleIds.has(item.moduleId))) return NextResponse.json({ error: "Invalid lesson order." }, { status: 400 });
      action.data.modules.forEach((item) => { const moduleItem = findModule(content, item._id); if (moduleItem) moduleItem.order = item.order; });
      const nextLessons = new Map(content.modules.map((item) => [item._id.toString(), [] as typeof item.lessons]));
      action.data.lessons.forEach((item) => { const lesson = lessonsById.get(item._id); if (lesson) { lesson.order = item.order; nextLessons.get(item.moduleId)?.push(lesson); } });
      content.modules.forEach((item) => { item.lessons = nextLessons.get(item._id.toString()) ?? []; });
      await saveContent(content, user._id);
      return NextResponse.json({ success: true });
    }

    const courseModule = findModule(content, action.moduleId);
    if (!courseModule) return NextResponse.json({ error: "Module not found." }, { status: 404 });
    if (action.action === "create-lesson") {
      const lesson = newLesson(action.data.type, action.data.title, courseModule.lessons.length);
      courseModule.lessons.push(lesson);
      courseModule.updatedAt = timestamp;
      await saveContent(content, user._id);
      return NextResponse.json({ lesson: { ...serializeContent(content, true, true).modules.find((item) => item._id === courseModule._id.toString())!.lessons.find((item) => item._id === lesson._id.toString())!, courseId, moduleId: courseModule._id.toString() } }, { status: 201 });
    }

    if (action.action === "update-lesson" || action.action === "delete-lesson") {
      const lesson = findLesson(courseModule, action.lessonId);
      if (!lesson) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
      if (action.action === "delete-lesson") {
        courseModule.lessons = courseModule.lessons.filter((item) => item !== lesson);
        courseModule.lessons.forEach((item, index) => { item.order = index; });
        courseModule.updatedAt = timestamp;
        await saveContent(content, user._id);
        return NextResponse.json({ success: true });
      }
      if (lesson.updatedAt.toISOString() !== action.data.expectedUpdatedAt) return NextResponse.json({ error: "This lesson was changed elsewhere. Reload and try again." }, { status: 409 });
      if (action.data.type === "video") {
        const saved = await saveVideoLessonMetadata({
          courseId,
          moduleId: courseModule._id.toString(),
          lessonId: lesson._id.toString(),
          userId: user._id,
          expectedUpdatedAt: action.data.expectedUpdatedAt,
          title: action.data.title,
          estimatedMinutes: action.data.estimatedMinutes,
          description: action.data.content.description,
          transcript: action.data.content.transcript,
        });
        if (!saved) return NextResponse.json({ error: "This lesson was changed elsewhere. Reload and try again." }, { status: 409 });
        const serialized = serializeContent(saved, true, true).modules.find((item) => item._id === courseModule._id.toString())!.lessons.find((item) => item._id === lesson._id.toString())!;
        return NextResponse.json({ lesson: { ...serialized, courseId, moduleId: courseModule._id.toString() } });
      }
      lesson.title = action.data.title;
      lesson.estimatedMinutes = action.data.estimatedMinutes;
      lesson.type = action.data.type;
      lesson.content = action.data.content;
      lesson.updatedAt = timestamp;
      courseModule.updatedAt = timestamp;
      await saveContent(content, user._id);
      const serialized = serializeContent(content, true, true).modules.find((item) => item._id === courseModule._id.toString())!.lessons.find((item) => item._id === lesson._id.toString())!;
      return NextResponse.json({ lesson: { ...serialized, courseId, moduleId: courseModule._id.toString() } });
    }

    return NextResponse.json({ error: "Unsupported content action." }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}
