import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireAdmin } from "@/lib/server";
import { connectToDatabase } from "@/lib/database";
import { isObjectId } from "@/lib/content";
import Course from "@/models/Course";

type Context = { params: Promise<{ courseId: string }> };

const SUPPORTED_BILLING_INTERVALS = [7, 15, 30, 60, 90, 180, 360] as const;

const priceSchema = z
  .number()
  .finite()
  .min(0)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
    "Price must have no more than two decimal places.",
  );

const updateSchema = z
  .object({
    action: z.literal("update"),

    title: z.string().trim().min(3).max(120),

    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(120),

    shortDescription: z.string().trim().max(250),

    description: z.string().max(20_000),

    // Pricing
    price: priceSchema,

    // Paymob-supported recurring frequencies
    billingIntervalDays: z
      .number()
      .int()
      .refine(
        (value) =>
          SUPPORTED_BILLING_INTERVALS.includes(
            value as (typeof SUPPORTED_BILLING_INTERVALS)[number],
          ),
        "Unsupported billing interval.",
      ),

    targetGrades: z.array(z.number().int().min(7).max(12)).min(1).max(6),

    targetEducationSystems: z
      .array(z.enum(["general", "azhar"]))
      .min(1)
      .max(2),

    learningOutcomes: z.array(z.string().trim().min(1).max(200)).max(12),

    requirements: z.array(z.string().trim().min(1).max(200)).max(12),
  })
  .strict();

const actionSchema = z.union([
  updateSchema,
  z.object({ action: z.literal("delete") }).strict(),
  z.object({ action: z.literal("unpublish") }).strict(),
]);

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireAdmin();
    const { courseId } = await context.params;
    const parsed = actionSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!isObjectId(courseId) || !parsed.success)
      return NextResponse.json(
        { error: "Invalid course request." },
        { status: 400 },
      );
    await connectToDatabase();
    if (parsed.data.action === "delete") {
      const course = await Course.findByIdAndDelete(courseId);
      if (!course)
        return NextResponse.json(
          { error: "Course not found." },
          { status: 404 },
        );
      return NextResponse.json({ success: true });
    }
    if (parsed.data.action === "unpublish") {
      const course = await Course.findByIdAndUpdate(
        courseId,
        {
          $set: {
            status: "draft",
            publishedAt: null,
            publishedBy: null,
            updatedBy: user._id,
          },
        },
        { new: true },
      );
      if (!course)
        return NextResponse.json(
          { error: "Course not found." },
          { status: 404 },
        );
      return NextResponse.json({ success: true, status: course.status });
    }
    const { action: _action, ...updates } = parsed.data;

    const course = await Course.findByIdAndUpdate(
      courseId,
      {
        $set: {
          ...updates,
          updatedBy: user._id,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );
    if (!course)
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    return NextResponse.json({
      course: {
        id: course._id.toString(),
        title: course.title,
        slug: course.slug,
        status: course.status,
        updatedAt: course.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    )
      return NextResponse.json(
        { error: "A course with that slug already exists." },
        { status: 409 },
      );
    console.error("Course action failed:", error);
    return NextResponse.json(
      { error: "Unable to update course." },
      { status: 500 },
    );
  }
}
