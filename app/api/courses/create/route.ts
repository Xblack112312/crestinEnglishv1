
import { NextResponse } from "next/server";

import { cloudinary } from "@/lib/cloudinary";
import { getServerSession } from "next-auth";

import User from "@/models/User";
import Course from "@/models/Course";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/database";

// ============================================================================
// Types and constants
// ============================================================================

type EducationSystem = "general" | "azhar";

const ALLOWED_GRADES = [7, 8, 9, 10, 11, 12];

const ALLOWED_SYSTEMS: EducationSystem[] = ["general", "azhar"];

const ALLOWED_IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp"];

const CLOUDINARY_FOLDER = "crestinenglish/course-thumbnails";

const MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 20000;
const MAX_LIST_ITEMS = 12;
const MAX_LIST_ITEM_LENGTH = 200;

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface CloudinaryAsset {
  public_id?: string;
  secure_url?: string;
  asset_folder?: string;
  folder?: string;
  format?: string;
  bytes?: number;
  resource_type?: string;
  type?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getOptionalString(
  value: unknown,
  field: string,
): { value: string; error?: string } {
  if (value === undefined || value === null) {
    return { value: "" };
  }

  if (typeof value !== "string") {
    return {
      value: "",
      error: `${field} must be a string.`,
    };
  }

  return { value: value.trim() };
}

function validateStringArray(
  value: unknown,
  field: string,
): { items: string[]; error?: string } {
  if (value === undefined) {
    return { items: [] };
  }

  if (!Array.isArray(value)) {
    return {
      items: [],
      error: `${field} must be an array.`,
    };
  }

  if (value.length > MAX_LIST_ITEMS) {
    return {
      items: [],
      error: `${field} cannot contain more than ${MAX_LIST_ITEMS} items.`,
    };
  }

  if (value.some((item) => typeof item !== "string")) {
    return {
      items: [],
      error: `${field} must contain only strings.`,
    };
  }

  const items = (value as string[])
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.some((item) => item.length > MAX_LIST_ITEM_LENGTH)) {
    return {
      items: [],
      error: `${field} items cannot exceed ${MAX_LIST_ITEM_LENGTH} characters.`,
    };
  }

  return {
    items: [...new Set(items)],
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return isRecord(error) && error.code === 11000;
}

function getCloudinaryErrorCode(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;

  return typeof error.http_code === "number" ? error.http_code : undefined;
}

// ============================================================================
// POST /api/courses/create
// ============================================================================

export async function POST(request: Request) {
  try {
    // ------------------------------------------------------------------------
    // 1. Authentication
    // ------------------------------------------------------------------------

    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to create a course." },
        { status: 401 },
      );
    }

    // ------------------------------------------------------------------------
    // 2. Database connection and admin authorization
    // ------------------------------------------------------------------------

    await connectToDatabase();

    const user = await User.findOne({
      email: session.user.email,
    })
      .select("_id role")
      .lean();

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { error: "You are not authorized to create courses." },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------------
    // 3. Parse request body
    // ------------------------------------------------------------------------

    const contentLength = Number(
      request.headers.get("content-length") || 0,
    );

    if (contentLength > 64 * 1024) {
      return NextResponse.json(
        { error: "Request body is too large." },
        { status: 413 },
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 },
      );
    }

    if (!isRecord(body)) {
      return NextResponse.json(
        { error: "Invalid request data." },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------------
    // 4. Validate basic information
    // ------------------------------------------------------------------------

    const titleResult = getOptionalString(body.title, "Title");
    const slugResult = getOptionalString(body.slug, "Slug");

    const shortDescriptionResult = getOptionalString(
      body.shortDescription,
      "Short description",
    );

    const descriptionResult = getOptionalString(
      body.description,
      "Description",
    );

    const thumbnailResult = getOptionalString(
      body.thumbnail,
      "Thumbnail",
    );

    const thumbnailPublicIdResult = getOptionalString(
      body.thumbnailPublicId,
      "Thumbnail public ID",
    );

    const stringErrors = [
      titleResult.error,
      slugResult.error,
      shortDescriptionResult.error,
      descriptionResult.error,
      thumbnailResult.error,
      thumbnailPublicIdResult.error,
    ].filter(Boolean);

    if (stringErrors.length > 0) {
      return NextResponse.json(
        { error: stringErrors[0] },
        { status: 400 },
      );
    }

    const title = titleResult.value;
    const slug = slugResult.value.toLowerCase();
    const shortDescription = shortDescriptionResult.value;
    const description = descriptionResult.value;
    const thumbnail = thumbnailResult.value;
    const thumbnailPublicId = thumbnailPublicIdResult.value;

    if (title.length < 3 || title.length > 120) {
      return NextResponse.json(
        { error: "Title must contain between 3 and 120 characters." },
        { status: 400 },
      );
    }

    if (slug.length > 120 || !SLUG_REGEX.test(slug)) {
      return NextResponse.json(
        { error: "Please provide a valid course slug." },
        { status: 400 },
      );
    }

    if (shortDescription.length > 250) {
      return NextResponse.json(
        { error: "Short description cannot exceed 250 characters." },
        { status: 400 },
      );
    }

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: "Description is too long." },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------------
    // 5. Validate course price
    // ------------------------------------------------------------------------

    const price = body.price;

    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0 ||
      Number(price.toFixed(2)) !== price
    ) {
      return NextResponse.json(
        {
          error: "Course price must be a valid non-negative amount with at most two decimal places.",
        },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------------
    // 6. Validate billing interval
    // ------------------------------------------------------------------------

    const billingIntervalDays = body.billingIntervalDays;

    if (
      typeof billingIntervalDays !== "number" ||
      !Number.isInteger(billingIntervalDays) ||
      billingIntervalDays < 1
    ) {
      return NextResponse.json(
        {
          error: "Billing interval must be a whole number of at least 1 day.",
        },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------------
    // 7. Validate target grades
    // ------------------------------------------------------------------------

    const targetGrades = body.targetGrades;

    if (
      !Array.isArray(targetGrades) ||
      targetGrades.length === 0 ||
      targetGrades.some(
        (grade) =>
          typeof grade !== "number" ||
          !Number.isInteger(grade) ||
          !ALLOWED_GRADES.includes(grade),
      ) ||
      new Set(targetGrades).size !== targetGrades.length
    ) {
      return NextResponse.json(
        { error: "Select at least one valid and unique grade." },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------------
    // 8. Validate education systems
    // ------------------------------------------------------------------------

    const targetEducationSystems = body.targetEducationSystems;

    if (
      !Array.isArray(targetEducationSystems) ||
      targetEducationSystems.length === 0 ||
      targetEducationSystems.some(
        (system) =>
          typeof system !== "string" ||
          !ALLOWED_SYSTEMS.includes(system as EducationSystem),
      ) ||
      new Set(targetEducationSystems).size !== targetEducationSystems.length
    ) {
      return NextResponse.json(
        { error: "Select at least one valid education system." },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------------
    // 9. Validate learning outcomes and requirements
    // ------------------------------------------------------------------------

    const outcomesResult = validateStringArray(
      body.learningOutcomes,
      "Learning outcomes",
    );

    if (outcomesResult.error) {
      return NextResponse.json(
        { error: outcomesResult.error },
        { status: 400 },
      );
    }

    const requirementsResult = validateStringArray(
      body.requirements,
      "Requirements",
    );

    if (requirementsResult.error) {
      return NextResponse.json(
        { error: requirementsResult.error },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------------
    // 10. Validate Cloudinary thumbnail
    // ------------------------------------------------------------------------

    if (Boolean(thumbnail) !== Boolean(thumbnailPublicId)) {
      return NextResponse.json(
        {
          error: "Thumbnail URL and public ID must both be provided.",
        },
        { status: 400 },
      );
    }

    if (thumbnail) {
      let asset: CloudinaryAsset;

      try {
        asset = (await cloudinary.api.resource(thumbnailPublicId, {
          resource_type: "image",
          type: "upload",
        })) as CloudinaryAsset;
      } catch (error) {
        if (getCloudinaryErrorCode(error) === 404) {
          return NextResponse.json(
            {
              error: "The selected image does not exist in Cloudinary.",
            },
            { status: 400 },
          );
        }

        console.error("Cloudinary verification error:", error);

        return NextResponse.json(
          { error: "Unable to verify the course thumbnail." },
          { status: 502 },
        );
      }

      const validFolder =
        asset.asset_folder === CLOUDINARY_FOLDER ||
        asset.folder === CLOUDINARY_FOLDER ||
        asset.public_id?.startsWith(`${CLOUDINARY_FOLDER}/`);

      const validAsset =
        asset.public_id === thumbnailPublicId &&
        asset.secure_url === thumbnail &&
        asset.resource_type === "image" &&
        asset.type === "upload" &&
        validFolder;

      if (!validAsset) {
        return NextResponse.json(
          {
            error: "Invalid course thumbnail. Please upload it again.",
          },
          { status: 400 },
        );
      }

      if (
        !asset.format ||
        !ALLOWED_IMAGE_FORMATS.includes(asset.format.toLowerCase()) ||
        typeof asset.bytes !== "number" ||
        asset.bytes > MAX_THUMBNAIL_SIZE
      ) {
        return NextResponse.json(
          {
            error:
              "Thumbnail must be JPG, PNG or WebP and no larger than 5 MB.",
          },
          { status: 400 },
        );
      }
    }

    // ------------------------------------------------------------------------
    // 11. Create the course
    // ------------------------------------------------------------------------

    const course = await Course.create({
      // Basic information
      title,
      slug,
      shortDescription,
      description,

      // Pricing and billing
      price,
      billingIntervalDays,

      // Thumbnail
      thumbnail,
      thumbnailPublicId,

      // Target audience
      targetGrades: [...targetGrades].sort((a, b) => a - b),

      targetEducationSystems: ALLOWED_SYSTEMS.filter((system) =>
        targetEducationSystems.includes(system),
      ),

      // Learning information
      learningOutcomes: outcomesResult.items,
      requirements: requirementsResult.items,

      // Always create new courses as drafts.
      status: "draft",

      // Audit fields are controlled by the server.
      createdBy: user._id,
      updatedBy: null,

      publishedAt: null,
      publishedBy: null,
    });

    // ------------------------------------------------------------------------
    // 12. Return the created course
    // ------------------------------------------------------------------------

    return NextResponse.json(
      {
        success: true,
        message: "Course created successfully.",
        course: {
          id: course._id.toString(),

          // Basic information
          title: course.title,
          slug: course.slug,
          shortDescription: course.shortDescription,
          description: course.description,

          // Pricing and billing
          price: course.price,
          billingIntervalDays: course.billingIntervalDays,

          // Thumbnail
          thumbnail: course.thumbnail,
          thumbnailPublicId: course.thumbnailPublicId,

          // Target audience
          targetGrades: course.targetGrades,
          targetEducationSystems: course.targetEducationSystems,

          // Learning information
          learningOutcomes: course.learningOutcomes,
          requirements: course.requirements,

          // Status and timestamps
          status: course.status,
          createdAt: course.createdAt,
          updatedAt: course.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    // ------------------------------------------------------------------------
    // 13. Handle duplicate slug
    // ------------------------------------------------------------------------

    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { error: "A course with this slug already exists." },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------------
    // 14. Handle Mongoose validation errors
    // ------------------------------------------------------------------------

    if (isRecord(error) && error.name === "ValidationError") {
      console.error("Course database validation error:", error);

      return NextResponse.json(
        { error: "Course information failed database validation." },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------------
    // 15. Handle unexpected errors
    // ------------------------------------------------------------------------

    console.error("Course creation error:", error);

    return NextResponse.json(
      {
        error: "Something went wrong while creating the course.",
      },
      { status: 500 },
    );
  }
}
