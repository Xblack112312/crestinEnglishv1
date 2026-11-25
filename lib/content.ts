import { Types } from "mongoose";

import Content from "@/models/Content";

export const isObjectId = (value: string) => Types.ObjectId.isValid(value);

type LessonType = "reading" | "quiz" | "video";
type Timestamped = { updatedAt: Date };
type QuizOption = { _id: Types.ObjectId; text: string };
type QuizQuestion = { _id: Types.ObjectId; prompt: string; options: QuizOption[]; correctOptionId: Types.ObjectId | null; explanation: string };
type VideoRecord = Record<string, any> & { muxUploadId?: string | null; status?: string; processingError?: string | null };
type Lesson = Timestamped & { _id: Types.ObjectId; title: string; type: LessonType; order: number; estimatedMinutes: number | null; content: Record<string, any> };
type Module = Timestamped & { _id: Types.ObjectId; title: string; description: string; order: number; lessons: Lesson[] };
type ContentDocument = { courseId: Types.ObjectId; revision: number; modules: Module[]; createdBy: Types.ObjectId; updatedBy: Types.ObjectId | null; markModified(path: string): void; save(): Promise<unknown> };

function contentDocument(value: unknown): ContentDocument {
  return value as ContentDocument;
}

function isVersionError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "VersionError";
}

export async function ensureContent(courseId: string, userId: Types.ObjectId | string) {
  const content = await Content.findOneAndUpdate(
    { courseId },
    { $setOnInsert: { courseId, createdBy: userId, updatedBy: userId, revision: 0, modules: [] } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );
  return contentDocument(content);
}

export async function findContent(courseId: string) {
  const content = await Content.findOne({ courseId });
  return content ? contentDocument(content) : null;
}

export async function findContentForMuxAsset(assetId: string | null, uploadId: string | null) {
  const clauses = [
    ...(assetId ? [{ "modules.lessons.content.video.muxAssetId": assetId }] : []),
    ...(uploadId ? [{ "modules.lessons.content.video.muxUploadId": uploadId }] : []),
  ];
  if (clauses.length === 0) return null;
  const content = await Content.findOne({ $or: clauses });
  return content ? contentDocument(content) : null;
}

export async function saveWebhookContent(content: ContentDocument) {
  content.revision += 1;
  content.markModified("modules");
  await content.save();
}

export function findModule(content: ContentDocument, moduleId: string) {
  return content.modules.find((module) => module._id.toString() === moduleId) ?? null;
}

export function findLesson(module: Module, lessonId: string) {
  return module.lessons.find((lesson) => lesson._id.toString() === lessonId) ?? null;
}

export function touchContent(content: ContentDocument, userId: Types.ObjectId | string) {
  content.revision += 1;
  content.updatedBy = new Types.ObjectId(userId);
  content.markModified("modules");
}

export async function saveContent(content: ContentDocument, userId: Types.ObjectId | string) {
  touchContent(content, userId);
  await content.save();
}

export type StoredVideo = {
  playbackPolicy: "signed";
  status: "not_uploaded" | "waiting_upload" | "processing" | "ready" | "errored" | "cancelled" | "timed_out";
  muxUploadId: string | null;
  muxAssetId: string | null;
  muxPlaybackId: string | null;
  fileName: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
  aspectRatio: string | null;
  readyAt: Date | null;
  processingError: string | null;
};

/**
 * Stores the Mux upload reservation on the existing video lesson.
 * This deliberately uses a hydrated document save instead of a positional
 * $set on content.transcript/content.video. Mongoose does not consistently
 * resolve nested embedded-discriminator paths for filtered positional updates
 * under strict:"throw".
 */
export async function recordVideoUpload(input: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  userId: Types.ObjectId | string;
  video: StoredVideo;
}) {
  const content = await Content.findOne({ courseId: input.courseId });
  if (!content) return null;

  const document = contentDocument(content);
  const courseModule = findModule(document, input.moduleId);
  const lesson = courseModule && findLesson(courseModule, input.lessonId);
  if (!courseModule || !lesson || lesson.type !== "video") return null;

  const now = new Date();
  lesson.content.video = input.video;
  // A replacement video must not retain the previous asset's transcript.
  lesson.content.transcript = "";
  lesson.content.transcriptSegments = [];
  lesson.content.transcriptStatus = "not_requested";
  lesson.updatedAt = now;
  courseModule.updatedAt = now;

  touchContent(document, input.userId);
  try {
    await document.save();
  } catch (error) {
    if (isVersionError(error)) return null;
    throw error;
  }
  return now;
}

/** Marks a pending Mux Direct Upload as cancelled, without deleting the lesson. */
export async function markVideoUploadCancelled(input: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  uploadId: string;
  userId: Types.ObjectId | string;
}) {
  const content = await Content.findOne({ courseId: input.courseId });
  if (!content) return null;

  const document = contentDocument(content);
  const courseModule = findModule(document, input.moduleId);
  const lesson = courseModule && findLesson(courseModule, input.lessonId);
  if (!courseModule || !lesson || lesson.type !== "video") return null;

  const video = lesson.content.video as VideoRecord;
  if (video.muxUploadId !== input.uploadId || video.status !== "waiting_upload") return null;

  const now = new Date();
  video.status = "cancelled";
  video.processingError = null;
  lesson.content.video = video;
  lesson.updatedAt = now;
  courseModule.updatedAt = now;

  touchContent(document, input.userId);
  try {
    await document.save();
  } catch (error) {
    if (isVersionError(error)) return null;
    throw error;
  }
  return { video, lessonUpdatedAt: now };
}

/**
 * Saves video text without replacing the Mux asset subdocument. The hydrated
 * embedded discriminator knows the complete videoContentSchema, so transcript
 * is a valid path under strict:"throw".
 */
export async function saveVideoLessonMetadata(input: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  userId: Types.ObjectId | string;
  expectedUpdatedAt: string;
  title: string;
  estimatedMinutes: number | null;
  description: string;
  transcript: string;
}) {
  const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
  if (Number.isNaN(expectedUpdatedAt.getTime())) return null;

  const content = await Content.findOne({ courseId: input.courseId });
  if (!content) return null;

  const document = contentDocument(content);
  const courseModule = findModule(document, input.moduleId);
  const lesson = courseModule && findLesson(courseModule, input.lessonId);
  if (
    !courseModule ||
    !lesson ||
    lesson.type !== "video" ||
    lesson.updatedAt.getTime() !== expectedUpdatedAt.getTime()
  ) {
    return null;
  }

  const now = new Date();
  lesson.title = input.title;
  lesson.estimatedMinutes = input.estimatedMinutes;
  lesson.content.description = input.description;
  lesson.content.transcript = input.transcript;
  lesson.updatedAt = now;
  courseModule.updatedAt = now;

  touchContent(document, input.userId);
  try {
    await document.save();
  } catch (error) {
    if (isVersionError(error)) return null;
    throw error;
  }
  return document;
}

export function newLesson(type: LessonType, title: string, order: number): Lesson {
  const base = { _id: new Types.ObjectId(), title, type, order, estimatedMinutes: null, createdAt: new Date(), updatedAt: new Date() };
  if (type === "reading") return { ...base, content: { intro: "", sections: [] } };
  if (type === "quiz") return { ...base, content: { instructions: "", passingScore: 60, timeLimitMinutes: null, questions: [] } };
  return { ...base, content: { video: { playbackPolicy: "signed", status: "not_uploaded" }, description: "", transcript: "", transcriptStatus: "not_requested", transcriptSegments: [] } };
}

function serializeQuizContent(content: Record<string, unknown>, includeAnswers: boolean) {
  const questions = Array.isArray(content.questions) ? content.questions : [];
  return {
    instructions: typeof content.instructions === "string" ? content.instructions : "",
    passingScore: typeof content.passingScore === "number" ? content.passingScore : 60,
    timeLimitMinutes: typeof content.timeLimitMinutes === "number" ? content.timeLimitMinutes : null,
    questions: questions.map((question) => {
      const item = question as QuizQuestion;
      const serialized = {
        _id: item._id.toString(),
        prompt: item.prompt,
        options: item.options.map((option) => ({ _id: option._id.toString(), text: option.text })),
      };
      return includeAnswers ? { ...serialized, correctOptionId: item.correctOptionId?.toString() ?? null, explanation: item.explanation } : serialized;
    }),
  };
}

export function serializeLesson(lesson: Lesson, includeAnswers: boolean, includePrivateVideo: boolean) {
  const shared = { _id: lesson._id.toString(), title: lesson.title, type: lesson.type, order: lesson.order, estimatedMinutes: lesson.estimatedMinutes, updatedAt: lesson.updatedAt.toISOString() };
  if (lesson.type === "quiz") return { ...shared, content: serializeQuizContent(lesson.content, includeAnswers) };
  if (lesson.type === "video") {
    const video = (lesson.content.video ?? {}) as Record<string, unknown>;
    return {
      ...shared,
      content: {
        description: typeof lesson.content.description === "string" ? lesson.content.description : "",
        transcript: typeof lesson.content.transcript === "string" ? lesson.content.transcript : "",
        transcriptStatus: lesson.content.transcriptStatus ?? "not_requested",
        transcriptSegments: Array.isArray(lesson.content.transcriptSegments) ? lesson.content.transcriptSegments : [],
        video: includePrivateVideo
          ? video
          : { status: video.status ?? "not_uploaded", durationSeconds: video.durationSeconds ?? null },
      },
    };
  }
  return { ...shared, content: lesson.content };
}

export function serializeContent(content: ContentDocument, includeAnswers: boolean, includePrivateVideo: boolean) {
  const modules = content.modules.slice().sort((a, b) => a.order - b.order);
  return {
    revision: content.revision,
    modules: modules.map((module) => ({
      _id: module._id.toString(),
      title: module.title,
      description: module.description,
      order: module.order,
      updatedAt: module.updatedAt.toISOString(),
      lessons: module.lessons.slice().sort((a, b) => a.order - b.order).map((lesson) => serializeLesson(lesson, includeAnswers, includePrivateVideo)),
    })),
  };
}
