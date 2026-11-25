
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/database";

import Course from "@/models/Course";
import User from "@/models/User";
import Enrollment from "@/models/Enrollment";

import CheckoutClient from "./CheckoutClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

function normalizeGrade(value: unknown): string {
  return String(value ?? "").match(/\d+/)?.[0] ?? "";
}

export default async function CheckoutPage({ params }: PageProps) {
  const { id } = await params;

  // Validate MongoDB ObjectId.
  if (!/^[a-f\d]{24}$/i.test(id) || !mongoose.Types.ObjectId.isValid(id)) {
    notFound();
  }

  // Require authentication.
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/checkout/${id}`)}`);
  }

  await connectToDatabase();

  // Load the student profile from the database.
  const student = await User.findById(session.user.id)
    .select("grade educationSystem role")
    .lean();

  if (!student) {
    redirect("/signin");
  }

  // Validate student profile.
  const grade = normalizeGrade(student.grade);
  const gradeNumber = Number(grade);
  const educationSystem = String(student.educationSystem ?? "")
    .trim()
    .toLowerCase();

  const validGrade =
    Number.isInteger(gradeNumber) &&
    gradeNumber >= 7 &&
    gradeNumber <= 12;

  const validEducationSystem = ["general", "azhar"].includes(
    educationSystem
  );

  if (!validGrade || !validEducationSystem) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Complete your student profile
          </h1>

          <p className="mt-3 text-sm leading-6 text-neutral-500">
            Please complete your grade and education system before enrolling
            in a course.
          </p>

          <Link
            href="/dashboard"
            className="mt-7 inline-flex rounded-full bg-neutral-950 px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Return to dashboard
          </Link>
        </div>
      </main>
    );
  }

  // Retrieve only a published course.
  const course = await Course.findOne({
    _id: id,
    status: "published",
  })
    .select(
      "title shortDescription description thumbnail price billingIntervalDays targetGrades targetEducationSystems"
    )
    .lean();

  if (!course) {
    notFound();
  }

  // Check whether the course is available to this student.
  const courseGrades = Array.isArray(course.targetGrades)
    ? course.targetGrades
    : [];

  const courseEducationSystems = Array.isArray(
    course.targetEducationSystems
  )
    ? course.targetEducationSystems
    : [];

  const gradeEligible = courseGrades.some(
    (target: unknown) => normalizeGrade(target) === grade
  );

  const educationEligible = courseEducationSystems.some(
    (target: unknown) =>
      String(target).trim().toLowerCase() === educationSystem
  );

  if (!gradeEligible || !educationEligible) {
    notFound();
  }

  // Validate checkout pricing information.
  const price = Number(course.price);
  const billingIntervalDays = Number(course.billingIntervalDays);

  if (
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isInteger(billingIntervalDays) ||
    billingIntervalDays < 1
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-neutral-950">
            Checkout is unavailable
          </h1>
          <p className="mt-3 text-sm text-neutral-500">
            This course does not currently have valid pricing information.
            Please contact the administrator.
          </p>
        </div>
      </main>
    );
  }

  // Check for an existing active enrollment.
  const existingEnrollment = await Enrollment.findOne({
    userId: student._id,
    courseId: course._id,
    status: "active",
    currentPeriodEnd: { $gt: new Date() },
  }).lean();

  if (existingEnrollment) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            You are already enrolled
          </h1>

          <p className="mt-3 text-sm leading-6 text-neutral-500">
            You already have active access to this course.
          </p>

          <Link
            href="/dashboard/courses"
            className="mt-7 inline-flex rounded-full bg-neutral-950 px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Go to my courses
          </Link>
        </div>
      </main>
    );
  }

  // Pass only the information the client needs.
  const checkoutCourse = {
    id: course._id.toString(),
    title: course.title,
    shortDescription: course.shortDescription ?? "",
    thumbnail: course.thumbnail ?? "",
    price,
    billingIntervalDays,
  };

  return <CheckoutClient course={checkoutCourse} />;
}
