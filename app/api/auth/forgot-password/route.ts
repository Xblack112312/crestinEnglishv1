import { createHash, randomBytes } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/database";
import { sendPasswordResetEmail } from "@/lib/email";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import PasswordResetToken from "@/models/PasswordResetToken";
import User from "@/models/User";

const genericResponse = {
  message:
    "If an eligible account exists, a password reset email has been sent.",
};

export async function POST(request: Request) {
  const parsed = forgotPasswordSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(genericResponse);
  }

  const rateLimitResponse = await enforceRateLimit(
    request,
    rateLimiters.forgotPassword,
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    await connectToDatabase();

    const user = await User.findOne({
      email: parsed.data.email,
      provider: "credentials",
    }).select("_id");

    if (user) {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");

      // Updating the account's sole reset record is atomic. Consequently a
      // later request invalidates every previously issued raw token.
      await PasswordResetToken.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            tokenHash,
            expiresAt: new Date(Date.now() + 30 * 60_000),
          },
          $unset: { usedAt: 1 },
          $setOnInsert: { userId: user._id },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );

      await sendPasswordResetEmail(parsed.data.email, token);
    }
  } catch (error) {
    // Preserve the same response to avoid exposing whether an account exists.
    Sentry.captureException(error, {
      tags: {
        api: "auth/forgot-password",
        operation: "password-reset-request",
      },
    });
  }

  return NextResponse.json(genericResponse);
}
