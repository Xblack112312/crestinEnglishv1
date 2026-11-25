import * as Sentry from "@sentry/nextjs";
import argon2 from "argon2";
import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { getAvatarForUserId } from "@/lib/avatar";
import { connectToDatabase } from "@/lib/database";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";
import { signUpSchema } from "@/lib/validation/auth";
import User from "@/models/User";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export async function POST(request: Request) {
  const rateLimitResponse = await enforceRateLimit(request, rateLimiters.register);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const parsed = signUpSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Please check your submitted information.",
        errors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    await connectToDatabase();

    const existingUser = await User.exists({ email: parsed.data.email });
    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          message: "An account with this email already exists.",
        },
        { status: 409 },
      );
    }

    const password = await argon2.hash(parsed.data.password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
    });

    const userId = new Types.ObjectId();

    await User.create({
      _id: userId,
      name: parsed.data.name,
      email: parsed.data.email,
      password,
      grade: parsed.data.grade,
      educationSystem: parsed.data.educationSystem,
      provider: "credentials",
      role: "student",
      onboardingComplete: true,
      avatar: getAvatarForUserId(userId.toString()),
    });

    return NextResponse.json(
      {
        success: true,
        message: "Your account has been created successfully.",
      },
      { status: 201 },
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        {
          success: false,
          message: "An account with this email already exists.",
        },
        { status: 409 },
      );
    }

    Sentry.captureException(error, {
      tags: { api: "auth/signup", operation: "registration" },
    });

    return NextResponse.json(
      { success: false, message: "Internal Server Error." },
      { status: 500 },
    );
  }
}
