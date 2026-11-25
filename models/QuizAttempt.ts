import { Schema, model, models } from "mongoose";

const submittedAnswerSchema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    selectedOptionId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    // Calculated by the backend.
    isCorrect: {
      type: Boolean,
      required: true,
    },
  },
  { _id: false, strict: "throw" },
);

const quizAttemptSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },

    courseReleaseId: {
      type: Schema.Types.ObjectId,
      ref: "CourseRelease",
      required: true,
    },

    moduleId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    lessonId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    // The exact released revision used for grading.
    contentRevision: {
      type: Number,
      required: true,
      min: 0,
    },

    answers: {
      type: [submittedAnswerSchema],
      required: true,
    },

    scorePercent: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },

    passingScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },

    passed: {
      type: Boolean,
      required: true,
    },

    startedAt: {
      type: Date,
      required: true,
    },

    submittedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    durationSeconds: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: "throw",
  },
);

// Retrieve the latest attempts for a particular student and lesson.
quizAttemptSchema.index({
  userId: 1,
  courseId: 1,
  lessonId: 1,
  submittedAt: -1,
});

quizAttemptSchema.index({
  userId: 1,
  courseId: 1,
  submittedAt: -1,
});

const QuizAttempt =
  models.QuizAttempt ||
  model("QuizAttempt", quizAttemptSchema);

export default QuizAttempt;