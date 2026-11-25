
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/database";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Course from "@/models/Course";

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
};

type EmptyReason = "grade" | "educationSystem" | "combination";

interface CourseSessionUser {
  id?: string;
  grade?: string | number;
  educationSystem?: string;
}

interface CourseSession {
  user?: CourseSessionUser;
}

type NullableCourseSession = CourseSession | null;

function isSessionDecryptionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const errorWithCode = error as Error & {
    code?: string;
  };

  return (
    error.name === "JWEDecryptionFailed" ||
    errorWithCode.code === "ERR_JWE_DECRYPTION_FAILED"
  );
}

export async function GET() {
  try {
    // Authentication is optional because the catalogue is public.
    let session: NullableCourseSession = null;

    try {
      const resolvedSession: unknown =
        await getServerSession(authOptions);

      session = resolvedSession as NullableCourseSession;
    } catch (error) {
      if (!isSessionDecryptionError(error)) {
        throw error;
      }

      console.warn(
        "Invalid NextAuth session cookie. Serving public catalogue as guest.",
      );

      session = null;
    }

    await connectToDatabase();

    const publishedFilter = {
      status: "published",
    };

    const courseFilter: {
      status: string;
      targetGrades?: number;
      targetEducationSystems?: "general" | "azhar";
    } = {
      ...publishedFilter,
    };

    let emptyReasons: EmptyReason[] = [];

    const user = session?.user;

    // CASE 1: Guests can see all published courses.
    if (user?.id) {
      const rawGrade = user.grade;

      const grade =
        typeof rawGrade === "number"
          ? rawGrade
          : typeof rawGrade === "string"
            ? Number(
                rawGrade.trim().match(/^(?:grade-)?(\d+)$/i)?.[1],
              )
            : NaN;

      const educationSystem = user.educationSystem;

      const allowedGrades = new Set([7, 8, 9, 10, 11, 12]);

      const isValidProfile =
        Number.isInteger(grade) &&
        allowedGrades.has(grade) &&
        (educationSystem === "general" ||
          educationSystem === "azhar");

      // CASE 2: Authenticated users need a valid profile.
      if (!isValidProfile) {
        return NextResponse.json(
          {
            success: false,
            code: "PROFILE_INCOMPLETE",
            message:
              "Your student profile is incomplete or invalid. Please complete your profile to see available courses.",
          },
          {
            status: 422,
            headers: noStoreHeaders,
          },
        );
      }

      // Filter according to the student's profile.
      courseFilter.targetGrades = grade;
      courseFilter.targetEducationSystems = educationSystem;

      // Check each targeting condition independently.
      const [gradeMatches, educationMatches] = await Promise.all([
        Course.countDocuments({
          ...publishedFilter,
          targetGrades: grade,
        }),

        Course.countDocuments({
          ...publishedFilter,
          targetEducationSystems: educationSystem,
        }),
      ]);

      if (gradeMatches === 0) {
        emptyReasons.push("grade");
      }

      if (educationMatches === 0) {
        emptyReasons.push("educationSystem");
      }
    }

    // CASE 3: Retrieve published courses.
    const courses = await Course.find(courseFilter)
      .select(
        "title slug shortDescription thumbnail targetGrades targetEducationSystems publishedAt updatedAt",
      )
      .sort({ updatedAt: -1 })
      .lean();

    // Determine why the authenticated student's catalogue is empty.
    if (user?.id && courses.length === 0) {
      if (emptyReasons.length === 0) {
        emptyReasons.push("combination");
      }
    } else {
      emptyReasons = [];
    }

    return NextResponse.json(
      {
        success: true,
        total: courses.length,
        emptyReasons,

        courses: courses.map((course) => ({
          id: course._id.toString(),
          title: course.title,
          slug: course.slug,
          shortDescription: course.shortDescription ?? "",
          thumbnail: course.thumbnail ?? "",
          targetGrades: course.targetGrades ?? [],
          targetEducationSystems:
            course.targetEducationSystems ?? [],
          publishedAt: course.publishedAt?.toISOString() ?? null,
          updatedAt: course.updatedAt?.toISOString() ?? null,
        })),
      },
      {
        headers: noStoreHeaders,
      },
    );
  } catch (error) {
    console.error("Published course listing failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to retrieve courses.",
      },
      {
        status: 500,
        headers: noStoreHeaders,
      },
    );
  }
}
