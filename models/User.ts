import mongoose, { Schema, type Model } from "mongoose";

import { AVATARS, type Avatar } from "@/lib/avatar";

// Available field values
export const GRADES = [
  "grade-7",
  "grade-8",
  "grade-9",
  "grade-10",
  "grade-11",
  "grade-12",
] as const;

export const EDUCATION_SYSTEMS = ["azhar", "general"] as const;

export const AUTH_PROVIDERS = ["credentials", "google"] as const;

export const USER_ROLES = ["admin", "student"] as const;

// TypeScript types
export type Grade = (typeof GRADES)[number];
export type EducationSystem = (typeof EDUCATION_SYSTEMS)[number];
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];
export type UserRole = (typeof USER_ROLES)[number];

export interface IUser {
  name: string;
  email: string;
  password?: string;
  avatar: Avatar;

  grade?: Grade;
  educationSystem?: EducationSystem;

  provider: AuthProvider;
  role: UserRole;
  onboardingComplete: boolean;
  sessionVersion: number;

  createdAt?: Date;
  updatedAt?: Date;
}

// Mongoose schema
const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Name is required."],
      trim: true,
      minlength: 2,
      maxlength: 32,
    },

    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 100,
    },

    password: {
      type: String,
      required: function (this: IUser) {
        return this.provider === "credentials";
      },
      select: false,
    },

    avatar: {
      type: String,
      required: true,
      enum: AVATARS,
    },

    grade: {
      type: String,
      enum: GRADES,
    },

    educationSystem: {
      type: String,
      enum: EDUCATION_SYSTEMS,
    },

    provider: {
      type: String,
      required: true,
      enum: AUTH_PROVIDERS,
      default: "credentials",
    },

    role: {
      type: String,
      required: true,
      enum: USER_ROLES,
      default: "student",
    },
    onboardingComplete: { type: Boolean, required: true, default: false },
    sessionVersion: { type: Number, required: true, default: 0, select: false },
  },
  {
    timestamps: true,
  },
);

// Prevent model recompilation during Next.js hot reloading
const User =
  (mongoose.models.User as Model<IUser>) ||
  mongoose.model<IUser>("User", userSchema);

export default User;
