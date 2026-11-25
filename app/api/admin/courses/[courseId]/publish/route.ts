import { isObjectId } from "@/lib/content";
import { connectToDatabase } from "@/lib/database";
import { AuthorizationError, requireAdmin } from "@/lib/server";
import Content from "@/models/Content";
import Course from "@/models/Course";
import CourseRelease from "@/models/CourseRelease";
import mongoose, { Types } from "mongoose";
import { NextResponse } from "next/server";

type Context = {
  params: Promise<{ courseId: string }>;
};

class PublishError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

function validateModules(modules: any[]) {
  if (!modules.length) {
    throw new PublishError("Add at least one module before publishing.");
  }

  const lessons = modules.flatMap((module) => module.lessons ?? []);

  if (!lessons.length) {
    throw new PublishError("Add at least one lesson before publishing.");
  }

  for (const module of modules) {
    if (!module.title?.trim()) {
      throw new PublishError("Every module must have a title.");
    }

    if (!Array.isArray(module.lessons)) {
      throw new PublishError(`The lessons in "${module.title}" are invalid.`);
    }

    for (const lesson of module.lessons) {
      if (!lesson.title?.trim()) {
        throw new PublishError("Every lesson must have a title.");
      }

      const content = lesson.content;

      if (!content) {
        throw new PublishError(`The lesson "${lesson.title}" has no content.`);
      }

      // Video validation
      if (lesson.type === "video") {
        const video = content.video;

        if (
          video?.status !== "ready" ||
          !video?.muxAssetId ||
          !video?.muxPlaybackId ||
          video?.playbackPolicy !== "signed"
        ) {
          throw new PublishError(
            `The video "${lesson.title}" is not ready for publication. Make sure processing is complete and signed playback is configured.`,
            409,
          );
        }
      }

      // Reading validation
      else if (lesson.type === "reading") {
        const intro =
          typeof content.intro === "string" ? content.intro.trim() : "";

        const sections = Array.isArray(content.sections)
          ? content.sections
          : [];

        const hasValidSection = sections.some(
          (section: any) =>
            typeof section.heading === "string" &&
            section.heading.trim().length > 0 &&
            typeof section.body === "string" &&
            section.body.trim().length > 0,
        );

        if (!intro && !hasValidSection) {
          throw new PublishError(
            `The reading lesson "${lesson.title}" needs an introduction or at least one completed section.`,
          );
        }

        if (
          sections.some(
            (section: any) => !section.heading?.trim() || !section.body?.trim(),
          )
        ) {
          throw new PublishError(
            `Every section in "${lesson.title}" must have a heading and body.`,
          );
        }
      }

      // Quiz validation
      else if (lesson.type === "quiz") {
        const questions = Array.isArray(content.questions)
          ? content.questions
          : [];

        if (!questions.length) {
          throw new PublishError(
            `The quiz "${lesson.title}" needs at least one question.`,
          );
        }

        for (let index = 0; index < questions.length; index++) {
          const question = questions[index];

          if (!question.prompt?.trim()) {
            throw new PublishError(
              `Question ${index + 1} in "${lesson.title}" needs a prompt.`,
            );
          }

          if (!Array.isArray(question.options) || question.options.length < 2) {
            throw new PublishError(
              `Question ${index + 1} in "${lesson.title}" needs at least two options.`,
            );
          }

          if (question.options.some((option: any) => !option.text?.trim())) {
            throw new PublishError(
              `Every option in "${lesson.title}" must contain text.`,
            );
          }

          const hasCorrectAnswer =
            question.correctOptionId &&
            question.options.some(
              (option: any) =>
                option._id?.toString() === question.correctOptionId.toString(),
            );

          if (!hasCorrectAnswer) {
            throw new PublishError(
              `Question ${index + 1} in "${lesson.title}" needs a valid correct answer.`,
            );
          }
        }
      } else {
        throw new PublishError(
          `The lesson "${lesson.title}" has an unsupported lesson type.`,
        );
      }
    }
  }
}

export async function POST(_request: Request, context: Context) {
  let session: mongoose.ClientSession | null = null;

  try {
    const user = await requireAdmin();
    const { courseId } = await context.params;

    if (!isObjectId(courseId)) {
      return NextResponse.json(
        { success: false, message: "Course not found" },
        { status: 404 },
      );
    }

    await connectToDatabase();

    session = await mongoose.startSession();
    const activeSession = session;

    let publishedRevision = 0;
    let publishedAt = new Date();
    let releaseCreated = false;

    await activeSession.withTransaction(async () => {
      // Reset values in case MongoDB retries the transaction.
      releaseCreated = false;

      const course = await Course.findById(courseId).session(activeSession);

      if (!course) {
        throw new PublishError("Course not found.", 404);
      }

      if (course.status === "archived") {
        throw new PublishError(
          "Archived courses cannot be published. Restore the course first.",
          409,
        );
      }

      const content = await Content.findOne({
        courseId: new Types.ObjectId(courseId),
      }).session(activeSession);

      if (!content) {
        throw new PublishError(
          "This course has no content yet. Add modules and lessons before publishing.",
        );
      }

      if (!Number.isInteger(content.revision) || content.revision < 0) {
        throw new PublishError("The course content revision is invalid.", 409);
      }

      // The correct field is modules, not module.
      const modules = content.modules ?? [];

      validateModules(modules);

      const revision = content.revision;
      const now = new Date();

      // Prevent duplicate releases for the same revision.
      const existingRelease = await CourseRelease.findOne({
        courseId: course._id,
        revision,
      }).session(activeSession);

      if (!existingRelease) {
        const snapshot = modules.map((module: any) =>
          module.toObject ? module.toObject({ depopulate: true }) : module,
        );

        const release = new CourseRelease({
          courseId: course._id,
          revision,
          modules: snapshot,
          publishedAt: now,
          publishedBy: user._id,
        });

        await release.save({ session: activeSession });

        releaseCreated = true;
      }

      course.status = "published";
      course.publishedAt = now;
      course.publishedBy = user._id;
      course.updatedBy = user._id;

      await course.save({ session: activeSession });

      publishedRevision = revision;
      publishedAt = now;
    });

    return NextResponse.json({
      success: true,
      message: "Course published successfully.",
      revision: publishedRevision,
      publishedAt: publishedAt.toISOString(),
      releaseCreated,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    if (error instanceof PublishError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("Course publication failed:", error);

    return NextResponse.json(
      { error: "Unable to publish this course." },
      { status: 500 },
    );
  } finally {
    await session?.endSession();
  }
}
