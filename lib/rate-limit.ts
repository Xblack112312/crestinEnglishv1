import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ipAddress } from "@vercel/functions";

const redis = Redis.fromEnv();

// Separate limits for different authentication operations.
export const rateLimiters = {
  login: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "15 m"),
    analytics: true,
    prefix: "crest:login",
  }),

  register: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    analytics: true,
    prefix: "crest:register",
  }),

  forgotPassword: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    analytics: true,
    prefix: "crest:forgot-password",
  }),

  resetPassword: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    analytics: true,
    prefix: "crest:reset-password",
  }),
};

// Get the visitor's IP address.
// Trust forwarded headers only when your hosting proxy
// sanitizes and sets them correctly.
export function getClientIp(request: Request): string {
  // Production: use Vercel's trusted proxy-provided IP.
  if (process.env.VERCEL === "1") {
    return ipAddress(request) ?? "unknown";
  }

  // Local development: localhost usually has no public client IP.
  return (
    request.headers.get("x-real-ip")?.trim() ||
    "127.0.0.1"
  );
}

// Reusable rate-limit checker.
export async function enforceRateLimit(
  request: Request,
  limiter: (typeof rateLimiters)[keyof typeof rateLimiters],
) {
  try {
    const identifier = getClientIp(request);

    const { success, limit, remaining, reset } =
      await limiter.limit(identifier);

    if (success) {
      return null;
    }

    const retryAfter = Math.max(
      1,
      Math.ceil((reset - Date.now()) / 1000),
    );

    return NextResponse.json(
      {
        success: false,
        message: "Too many requests. Please try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(Math.ceil(reset / 1000)),
        },
      },
    );
  } catch (error) {
    // Do not silently bypass rate limiting if Redis fails.
    Sentry.captureException(error);

    return NextResponse.json(
      {
        success: false,
        message: "Authentication services are temporarily unavailable.",
      },
      { status: 503 },
    );
  }
}
