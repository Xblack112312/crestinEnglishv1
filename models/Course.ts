import { Schema, model, models, type InferSchemaType } from "mongoose";

const courseSchema = new Schema(
  {
    // Basic information
    title: {
      type: String,
      required: [true, "Course title is required."],
      trim: true,
      minlength: 3,
      maxlength: 120,
    },

    slug: {
      type: String,
      required: [true, "Course slug is required."],
      lowercase: true,
      trim: true,
    },

    shortDescription: {
      type: String,
      trim: true,
      maxlength: 250,
      default: "",
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    billingIntervalDays: {
      type: Number,
      enum: [7, 15, 30, 60, 90, 180, 360],
      required: true,
      default: 30,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    // Course thumbnail
    thumbnail: {
      type: String,
      trim: true,
      default: "",
    },

    thumbnailPublicId: {
      type: String,
      trim: true,
      default: "",
    },

    // Target audience
    targetGrades: {
      type: [
        {
          type: Number,
          enum: [7, 8, 9, 10, 11, 12],
        },
      ],
      required: [true, "At least one target grade is required."],
      default: undefined,
      validate: {
        validator: (grades: number[]) =>
          Array.isArray(grades) &&
          grades.length > 0 &&
          new Set(grades).size === grades.length,
        message: "Target grades must contain at least one unique grade.",
      },
    },

    targetEducationSystems: {
      type: [
        {
          type: String,
          enum: ["general", "azhar"],
        },
      ],
      required: [true, "At least one target education system is required."],
      default: undefined,
      validate: {
        validator: (systems: string[]) =>
          Array.isArray(systems) &&
          systems.length > 0 &&
          new Set(systems).size === systems.length,
        message:
          "Target education systems must contain at least one unique value.",
      },
    },

    // Educational information
    learningOutcomes: {
      type: [
        {
          type: String,
          trim: true,
        },
      ],
      default: [],
    },

    requirements: {
      type: [
        {
          type: String,
          trim: true,
        },
      ],
      default: [],
    },

    // Publication
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      required: true,
      index: true,
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    publishedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Audit information
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
  },
);

// Indexes
courseSchema.index({ slug: 1 }, { unique: true });
courseSchema.index({ status: 1, updatedAt: -1 });
courseSchema.index({ targetGrades: 1 });
courseSchema.index({ targetEducationSystems: 1 });

export type CourseType = InferSchemaType<typeof courseSchema>;

const Course = models.Course || model("Course", courseSchema);

export default Course;
