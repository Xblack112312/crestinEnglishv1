import argon2 from "argon2";
import { createHash } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/database";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";
import { resetPasswordSchema } from "@/lib/validation/auth";
import PasswordResetToken from "@/models/PasswordResetToken";
import User from "@/models/User";

const invalidResetResponse = { error: "Invalid or expired reset link." };

export async function POST(request: Request) {
  const parsed = resetPasswordSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(invalidResetResponse, { status: 400 });
  }

  const rateLimitResponse = await enforceRateLimit(
    request,
    rateLimiters.resetPassword,
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    await connectToDatabase();

    // Hash before consuming the token so an unexpected hashing failure cannot
    // invalidate a usable link. The subsequent conditional update is atomic.
    const password = await argon2.hash(parsed.data.password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
    });
    const tokenHash = createHash("sha256")
      .update(parsed.data.token)
      .digest("hex");
    const reset = await PasswordResetToken.findOneAndUpdate(
      {
        tokenHash,
        usedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      },
      { $set: { usedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!reset) {
      return NextResponse.json(invalidResetResponse, { status: 400 });
    }

    const user = await User.findOneAndUpdate(
      { _id: reset.userId, provider: "credentials" },
      { $set: { password }, $inc: { sessionVersion: 1 } },
    );

    if (!user) {
      return NextResponse.json(invalidResetResponse, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { api: "auth/reset-password", operation: "password-reset" },
    });
    return NextResponse.json(
      { error: "Unable to reset password." },
      { status: 500 },
    );
  }
}
