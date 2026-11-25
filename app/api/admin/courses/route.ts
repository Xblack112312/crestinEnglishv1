import { NextResponse } from "next/server";

import { AuthorizationError, requireAdmin } from "@/lib/server";
import { connectToDatabase } from "@/lib/database";
import Content from "@/models/Content";
import Course from "@/models/Course";

function serializeAdmin(
  value: { _id: { toString(): string }; name: string; email: string } | null,
) {
  return value
    ? { id: value._id.toString(), name: value.name, email: value.email }
    : null;
}

export async function GET() {
  try {
    await requireAdmin();

    await connectToDatabase();

    const [courses, counts] = await Promise.all([
      Course.find({})
        .select(
          "title slug shortDescription description thumbnail thumbnailPublicId targetGrades targetEducationSystems learningOutcomes requirements status publishedAt createdAt updatedAt",
        )
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .populate("publishedBy", "name email")
        .sort({ updatedAt: -1 })
        .lean(),

      Content.aggregate([
        {
          $project: {
            courseId: 1,
            moduleCount: { $size: "$modules" },
            lessonCount: {
              $sum: {
                $map: {
                  input: "$modules",
                  as: "courseModule",
                  in: { $size: "$$courseModule.lessons" },
                },
              },
            },
          },
        },
      ]),
    ]);

    const countByCourse = new Map(
      counts.map((item) => [item.courseId.toString(), item]),
    );

    return NextResponse.json(
      {
        success: true,
        courses: courses.map((course) => {
          const count = countByCourse.get(course._id.toString());
          return {
            id: course._id.toString(),
            title: course.title,
            slug: course.slug,
            shortDescription: course.shortDescription,
            description: course.description,
            thumbnail: course.thumbnail,
            thumbnailPublicId: course.thumbnailPublicId,
            targetGrades: course.targetGrades,
            targetEducationSystems: course.targetEducationSystems,
            learningOutcomes: course.learningOutcomes,
            requirements: course.requirements,
            status: course.status,
            publishedAt: course.publishedAt?.toISOString() ?? null,
            publishedBy: serializeAdmin(course.publishedBy),
            createdBy: serializeAdmin(course.createdBy),
            updatedBy: serializeAdmin(course.updatedBy),
            createdAt: course.createdAt.toISOString(),
            updatedAt: course.updatedAt.toISOString(),
            moduleCount: count?.moduleCount ?? 0,
            lessonCount: count?.lessonCount ?? 0,
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("Admin course listing failed:", error);
    return NextResponse.json(
      { error: "Unable to retrieve courses." },
      { status: 500 },
    );
  }
}
