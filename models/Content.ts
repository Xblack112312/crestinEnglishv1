import { Schema, model, models, type InferSchemaType } from "mongoose";

// ============================================================================
// ENUMS
// ============================================================================

export const LESSON_TYPES = ["video", "reading", "quiz"] as const;

export const VIDEO_STATUSES = [
  "not_uploaded",
  "waiting_upload",
  "processing",
  "ready",
  "errored",
  "cancelled",
  "timed_out",
] as const;

// ============================================================================
// VIDEO METADATA
// ============================================================================

const muxVideoSchema = new Schema(
  {
    // Mux identifiers. Never store API credentials or JWTs here.
    muxUploadId: {
      type: String,
      default: null,
    },

    muxAssetId: {
      type: String,
      default: null,
    },

    muxPlaybackId: {
      type: String,
      default: null,
    },

    playbackPolicy: {
      type: String,
      enum: ["signed"],
      default: "signed",
      required: true,
    },

    status: {
      type: String,
      enum: VIDEO_STATUSES,
      default: "not_uploaded",
      required: true,
    },

    // Display metadata.
    fileName: {
      type: String,
      trim: true,
      maxlength: 255,
      default: "",
    },

    sizeBytes: {
      type: Number,
      min: 0,
      default: null,
    },

    durationSeconds: {
      type: Number,
      min: 0,
      default: null,
    },

    aspectRatio: {
      type: String,
      default: null,
    },

    readyAt: {
      type: Date,
      default: null,
    },

    processingError: {
      type: String,
      maxlength: 500,
      default: null,
    },
  },
  {
    _id: false,
    strict: "throw",
  },
);

// ============================================================================
// LESSON CONTENT TYPES
// ============================================================================

const videoContentSchema = new Schema(
  {
    video: {
      type: muxVideoSchema,
      default: () => ({}),
      required: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },

    transcript: {
      type: String,
      default: "",
      maxlength: 200000,
    },

    transcriptStatus: {
      type: String,
      enum: ["not_requested", "processing", "ready", "errored"],
      default: "not_requested",
      required: true,
    },

    transcriptSegments: {
      type: [
        new Schema(
          {
            startSeconds: { type: Number, required: true, min: 0 },
            endSeconds: { type: Number, required: true, min: 0 },
            text: { type: String, required: true, maxlength: 5000 },
          },
          { _id: false, strict: "throw" },
        ),
      ],
      default: [],
      validate: {
        validator: (segments: unknown[]) => segments.length <= 10000,
        message: "A transcript cannot have more than 10,000 segments.",
      },
    },
  },
  { _id: false, strict: "throw" },
);

// Reading sections have their own MongoDB IDs.
const readingSectionSchema = new Schema(
  {
    heading: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },

    body: {
      type: String,
      maxlength: 50000,
      default: "",
    },
  },
  { strict: "throw" },
);

const readingContentSchema = new Schema(
  {
    intro: {
      type: String,
      maxlength: 10000,
      default: "",
    },

    sections: {
      type: [readingSectionSchema],
      default: [],
      validate: {
        validator: (sections: unknown[]) => sections.length <= 100,
        message: "A reading lesson cannot have more than 100 sections.",
      },
    },
  },
  { _id: false, strict: "throw" },
);

// ============================================================================
// EXERCISE / QUIZ CONTENT
// ============================================================================

const quizOptionSchema = new Schema(
  {
    text: {
      type: String,
      trim: true,
      required: true,
      maxlength: 1000,
    },
  },
  { strict: "throw" },
);

const quizQuestionSchema = new Schema(
  {
    prompt: {
      type: String,
      trim: true,
      required: true,
      maxlength: 5000,
    },

    options: {
      type: [quizOptionSchema],
      required: true,
      validate: {
        validator: (options: unknown[]) =>
          options.length >= 2 && options.length <= 6,
        message: "A question must have between 2 and 6 options.",
      },
    },

    // References the _id of one of the embedded option documents.
    correctOptionId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    timeLimitMinutes: {
      type: Number,
      min: 1,
      max: 600,
      default: null,
    },

    explanation: {
      type: String,
      maxlength: 5000,
      default: "",
    },
  },
  { strict: "throw" },
);

// A selected correct option must actually exist in this question.
quizQuestionSchema.pre("validate", function () {
  const correctOptionId = this.correctOptionId?.toString();
  if (
    correctOptionId &&
    !this.options.some((option) => option._id.toString() === correctOptionId)
  ) {
    this.invalidate(
      "correctOptionId",
      "The correct option does not belong to this question.",
    );
  }
});

const quizContentSchema = new Schema(
  {
    instructions: {
      type: String,
      maxlength: 10000,
      default: "",
    },

    passingScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 60,
      required: true,
    },

    // Optional quiz time limit. null means the quiz is untimed.
    timeLimitMinutes: {
      type: Number,
      min: 1,
      max: 600,
      default: null,
    },

    questions: {
      type: [quizQuestionSchema],
      default: [],
      validate: {
        validator: (questions: unknown[]) => questions.length <= 100,
        message: "A quiz cannot have more than 100 questions.",
      },
    },
  },
  { _id: false, strict: "throw" },
);

// ============================================================================
// LESSON SCHEMA
// ============================================================================

// Common fields shared by every type of lesson.
const lessonBaseSchema = new Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
      maxlength: 140,
    },

    order: {
      type: Number,
      min: 0,
      required: true,
      default: 0,
    },

    estimatedMinutes: {
      type: Number,
      min: 0,
      max: 600,
      default: null,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    discriminatorKey: "type",
    strict: "throw",
  },
);

// ============================================================================
// MODULE SCHEMA
// ============================================================================

export const moduleSchema = new Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
      maxlength: 120,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },

    order: {
      type: Number,
      min: 0,
      required: true,
      default: 0,
    },

    lessons: {
      type: [lessonBaseSchema],
      default: [],
      validate: {
        validator: (lessons: unknown[]) => lessons.length <= 200,
        message: "A module cannot have more than 200 lessons.",
      },
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    strict: "throw",
  },
);

// ============================================================================
// EMBEDDED LESSON DISCRIMINATORS
// ============================================================================

const lessonArray = moduleSchema.path<Schema.Types.DocumentArray>("lessons");

// VIDEO LESSON
lessonArray.discriminator(
  "video",
  new Schema(
    {
      content: {
        type: videoContentSchema,
        required: true,
      },
    },
    { _id: false, strict: "throw" },
  ),
);

// READING LESSON
lessonArray.discriminator(
  "reading",
  new Schema(
    {
      content: {
        type: readingContentSchema,
        required: true,
      },
    },
    { _id: false, strict: "throw" },
  ),
);

// QUIZ LESSON
lessonArray.discriminator(
  "quiz",
  new Schema(
    {
      content: {
        type: quizContentSchema,
        required: true,
      },
    },
    { _id: false, strict: "throw" },
  ),
);

// ============================================================================
// CONTENT SCHEMA
// ============================================================================

const contentSchema = new Schema(
  {
    // One Content document per course.
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      unique: true,
      index: true,
    },

    // Increment this on every successful content mutation.
    revision: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    modules: {
      type: [moduleSchema],
      default: [],
      validate: {
        validator: (modules: unknown[]) => modules.length <= 100,
        message: "A course cannot have more than 100 modules.",
      },
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    strict: "throw",
    // Content is a single document containing nested lesson discriminators.
    // Reject stale document saves instead of silently overwriting concurrent
    // video webhook, upload-metadata, or admin edits.
    optimisticConcurrency: true,
  },
);

export type ContentType = InferSchemaType<typeof contentSchema>;

const Content = models.Content || model("Content", contentSchema);

export default Content;
