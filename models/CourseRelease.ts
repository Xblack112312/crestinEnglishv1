import { Schema, model, models } from "mongoose";

import { moduleSchema } from "@/models/Content";

const courseReleaseSchema = new Schema(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      immutable: true,
    },

    revision: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },

    // Snapshot of modules and their lessons.
    modules: {
      type: [moduleSchema],
      required: true,
      immutable: true,
    },

    publishedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    publishedAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: true,
    strict: "throw",
  },
);

courseReleaseSchema.index(
  { courseId: 1, revision: 1 },
  { unique: true },
);

const CourseRelease =
  models.CourseRelease ||
  model("CourseRelease", courseReleaseSchema);

export default CourseRelease;