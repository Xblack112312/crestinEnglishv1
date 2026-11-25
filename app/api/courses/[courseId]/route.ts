
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/database";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Course from "@/models/Course";

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
};

type EducationSystem = "general" | "azhar";

interface CourseRouteContext {
  params: Promise<{
    courseId: string;
  }>;
}

export async function GET(
  _request: Request,
  { params }: CourseRouteContext,
) {
  try {
    // Read the parameter using the exact dynamic folder name.
    const { courseId } = await params;

    if (!courseId?.trim()) {
      return NextResponse.json(
        {
          success: false,
          message: "Course ID is required.",
        },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const session = await getServerSession(authOptions);

    await connectToDatabase();

    // Support MongoDB ObjectIds and slugs.
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(courseId);

    const identifierFilter = isObjectId
      ? { _id: courseId }
      : { slug: courseId };

    // Only published courses are accessible.
    const publishedFilter = {
      status: "published",
    };

    const isAuthenticated = Boolean(session?.user?.id);
    const isAdmin = session?.user?.role === "admin";

    let eligibilityFilter: {
      targetGrades?: number;
      targetEducationSystems?: EducationSystem;
    } = {};

    // Guests can view published courses.
    // Admins can view any published course.
    // Students must match the course's targeting.
    if (isAuthenticated && !isAdmin) {
      const rawGrade = session?.user.grade;

      const grade =
        typeof rawGrade === "number"
          ? rawGrade
          : typeof rawGrade === "string"
            ? Number(
                rawGrade.trim().match(/^(?:grade-)?(\d+)$/i)?.[1],
              )
            : NaN;

      const educationSystem = session?.user.educationSystem;

      const allowedGrades = new Set([7, 8, 9, 10, 11, 12]);

      const validEducationSystem =
        educationSystem === "general" ||
        educationSystem === "azhar";

      if (
        !Number.isInteger(grade) ||
        !allowedGrades.has(grade) ||
        !validEducationSystem
      ) {
        return NextResponse.json(
          {
            success: false,
            code: "PROFILE_INCOMPLETE",
            message:
              "Your student profile is incomplete or invalid. Please complete your profile to see available courses.",
          },
          { status: 422, headers: noStoreHeaders },
        );
      }

      eligibilityFilter = {
        targetGrades: grade,
        targetEducationSystems: educationSystem,
      };
    }

    // Retrieve the course.
    const course = await Course.findOne({
      ...publishedFilter,
      ...identifierFilter,
      ...eligibilityFilter,
    })
      .select(
        "title slug shortDescription description thumbnail targetGrades targetEducationSystems learningOutcomes requirements publishedAt updatedAt",
      )
      .lean();

    if (!course) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Course not found or is not available for your profile.",
        },
        { status: 404, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        success: true,
        course: {
          id: course._id.toString(),
          title: course.title,
          slug: course.slug,
          shortDescription: course.shortDescription ?? "",
          description: course.description ?? "",
          thumbnail: course.thumbnail ?? "",
          targetGrades: course.targetGrades ?? [],
          targetEducationSystems:
            course.targetEducationSystems ?? [],
          learningOutcomes: course.learningOutcomes ?? [],
          requirements: course.requirements ?? [],
          publishedAt: course.publishedAt?.toISOString() ?? null,
          updatedAt: course.updatedAt?.toISOString() ?? null,
        },
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Course details retrieval failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to retrieve course details.",
      },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
