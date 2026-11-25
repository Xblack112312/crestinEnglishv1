import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid identifier.");

export const lessonTypeSchema = z.enum(["reading", "quiz", "video"]);

const readingSectionSchema = z
  .object({
    _id: objectIdSchema.optional(),
    heading: z.string().trim().max(200),
    body: z.string().max(50_000),
  })
  .strict();
export const readingContentSchema = z
  .object({
    intro: z.string().max(10_000),
    sections: z.array(readingSectionSchema).max(100),
  })
  .strict();

const quizOptionSchema = z
  .object({
    _id: objectIdSchema.optional(),
    text: z.string().trim().min(1).max(1_000),
  })
  .strict();
const quizQuestionSchema = z
  .object({
    _id: objectIdSchema.optional(),
    prompt: z.string().trim().min(1).max(5_000),
    options: z.array(quizOptionSchema).min(2).max(6),
    correctOptionId: objectIdSchema.nullable(),
    explanation: z.string().max(5_000),
  })
  .strict()
  .superRefine((question, context) => {
    if (
      question.correctOptionId &&
      !question.options.some(
        (option) => option._id === question.correctOptionId,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "correctOptionId must reference an option in this question.",
        path: ["correctOptionId"],
      });
    }
  });
export const quizContentSchema = z
  .object({
    instructions: z.string().max(10_000),
    passingScore: z.number().int().min(0).max(100),
    timeLimitMinutes: z.number().int().min(1).max(600).nullable().default(null),
    questions: z.array(quizQuestionSchema).max(100),
  })
  .strict();

export const videoMetadataSchema = z
  .object({
    description: z.string().max(5_000),
    transcript: z.string().max(200_000),
  })
  .strict();
export const newModuleSchema = z
  .object({ title: z.string().trim().min(1).max(120) })
  .strict();
export const modulePatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().max(5_000),
    expectedUpdatedAt: z.string().datetime(),
  })
  .strict();
export const createLessonSchema = z
  .object({ title: z.string().trim().min(1).max(140), type: lessonTypeSchema })
  .strict();

export const lessonPatchSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("reading"),
      title: z.string().trim().min(1).max(140),
      estimatedMinutes: z.number().int().min(1).max(600).nullable(),
      content: readingContentSchema,
      expectedUpdatedAt: z.string().datetime(),
    })
    .strict(),
  z
    .object({
      type: z.literal("quiz"),
      title: z.string().trim().min(1).max(140),
      estimatedMinutes: z.number().int().min(1).max(600).nullable(),
      content: quizContentSchema,
      expectedUpdatedAt: z.string().datetime(),
    })
    .strict(),
  z
    .object({
      type: z.literal("video"),
      title: z.string().trim().min(1).max(140),
      estimatedMinutes: z.number().int().min(1).max(600).nullable(),
      content: videoMetadataSchema,
      expectedUpdatedAt: z.string().datetime(),
    })
    .strict(),
]);

const orderItemSchema = z
  .object({ _id: objectIdSchema, order: z.number().int().min(0) })
  .strict();
export const orderSchema = z
  .object({
    modules: z.array(orderItemSchema).max(100),
    lessons: z
      .array(orderItemSchema.extend({ moduleId: objectIdSchema }))
      .max(20_000),
  })
  .strict();

export const videoUploadRequestSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    contentType: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(500 * 1024 * 1024),
    languageCode: z
      .string()
      .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/)
      .optional(),
  })
  .strict();

export const contentActionSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("create-module"), data: newModuleSchema })
    .strict(),
  z
    .object({
      action: z.literal("update-module"),
      moduleId: objectIdSchema,
      data: modulePatchSchema,
    })
    .strict(),
  z
    .object({ action: z.literal("delete-module"), moduleId: objectIdSchema })
    .strict(),
  z
    .object({
      action: z.literal("create-lesson"),
      moduleId: objectIdSchema,
      data: createLessonSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update-lesson"),
      moduleId: objectIdSchema,
      lessonId: objectIdSchema,
      data: lessonPatchSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("delete-lesson"),
      moduleId: objectIdSchema,
      lessonId: objectIdSchema,
    })
    .strict(),
  z.object({ action: z.literal("reorder"), data: orderSchema }).strict(),
]);

export type LessonType = z.infer<typeof lessonTypeSchema>;
