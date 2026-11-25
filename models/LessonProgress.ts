import { Schema, model, models } from "mongoose";

const lessonProgressSchema = new Schema(
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

    status: {
      type: String,
      enum: ["in_progress", "completed"],
      default: "in_progress",
      required: true,
    },

    // Video progress. These values are never trusted for
    // course authorization or quiz grading.
    video: {
      lastPositionSeconds: {
        type: Number,
        min: 0,
        default: 0,
      },

      lastPositionUpdatedAt: {
        type: Date,
        default: null,
      },
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },

    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: "throw",
  },
);

// One progress record per student per lesson.
lessonProgressSchema.index(
  { userId: 1, courseId: 1, lessonId: 1 },
  { unique: true },
);

lessonProgressSchema.index({
  userId: 1,
  courseId: 1,
  status: 1,
});

const LessonProgress =
  models.LessonProgress ||
  model("LessonProgress", lessonProgressSchema);

export default LessonProgress;