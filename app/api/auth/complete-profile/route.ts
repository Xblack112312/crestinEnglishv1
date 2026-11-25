import { NextResponse } from "next/server";

import { AuthorizationError, requireAuth, safeUser } from "@/lib/server";
import User from "@/models/User";
import { completeProfileSchema } from "@/lib/validation/auth";

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = completeProfileSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please select a grade and education system." },
      { status: 400 },
    );
  }

  try {
    const current = await requireAuth();
    if (current.onboardingComplete) {
      return NextResponse.json(
        { error: "Profile is already complete." },
        { status: 409 },
      );
    }

    // Include the onboarding state in the update filter. This makes concurrent
    // requests safe and prevents a stale request from rewriting a completed profile.
    const user = await User.findByIdAndUpdate(
      { _id: current._id, onboardingComplete: false },
      { $set: { ...parsed.data, onboardingComplete: true } },
      { new: true },
    )
      .select(
        "name email role grade educationSystem provider onboardingComplete",
      )
      .lean();

    if (!user) {
      return NextResponse.json(
        { error: "Profile is already complete." },
        { status: 409 },
      );
    }

    return NextResponse.json({ user: safeUser(user) });
  } catch (error) {
    return error instanceof AuthorizationError
      ? NextResponse.json({ error: error.message }, { status: error.status })
      : NextResponse.json(
          { error: "Unable to complete profile." },
          { status: 500 },
        );
  }
}
