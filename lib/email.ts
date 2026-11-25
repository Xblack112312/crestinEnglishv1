import * as Sentry from "@sentry/nextjs";

import { resend } from "@/lib/resend";

const senderPattern = /^(?:[^<>@\r\n]+\s<)?[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>?$/;

function getResetUrl(token: string): URL {
  const appUrl = process.env.NEXTAUTH_URL;
  if (!appUrl) {
    throw new Error("Password reset email is not configured: NEXTAUTH_URL is missing.");
  }

  const url = new URL("/reset-password", appUrl);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Password reset email requires an HTTPS application URL.");
  }

  url.searchParams.set("token", token);
  return url;
}

export async function sendPasswordResetEmail(email: string, token: string) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      "Password reset email is not configured: RESEND_API_KEY is missing.",
    );
  }

  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!from || !senderPattern.test(from)) {
    throw new Error(
      "Password reset email is not configured: RESEND_FROM_EMAIL is invalid.",
    );
  }

  const response = await resend.emails.send({
    from,
    to: [email],
    subject: "Reset your CrestInEnglish password",
    html: `<p>We received a password-reset request.</p><p><a href="${getResetUrl(token).toString()}">Reset password</a></p><p>This link expires in 30 minutes. If you did not make this request, you can ignore this email.</p>`,
  });

  if (response.error) {
    Sentry.captureException(response.error, {
      tags: { service: "resend", operation: "password-reset-email" },
    });
    throw new Error("Password reset email delivery failed.");
  }
}
