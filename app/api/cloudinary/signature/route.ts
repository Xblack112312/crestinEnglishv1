import { authOptions } from "@/lib/auth";
import { cloudinary } from "@/lib/cloudinary";
import { connectToDatabase } from "@/lib/database";
import User from "@/models/User";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // Authenticate the request.
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await connectToDatabase();

    const user = await User.findOne({
      email: session.user.email,
    })
      .select("role")
      .lean();

    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // 3. Read Cloudinary credentials.
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.error("Cloudinary environment variables are missing.");

      return NextResponse.json(
        { error: "Cloudinary is not configured." },
        { status: 500 },
      );
    }

    // 4. Define upload parameters on the server.
    const timestamp = Math.round(Date.now() / 1000);

    const paramsToSign = {
      timestamp,
      folder: "crestinenglish/course-thumbnails",
      public_id: `course-${randomUUID()}`,
      allowed_formats: "jpg,png,webp",
      overwrite: false,
    };

    // 5. Generate the signature.
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret,
    );

    // 6. Return only the information needed by the browser.
    return NextResponse.json({
      cloudName,
      apiKey,
      signature,
      ...paramsToSign,
    });
  } catch (error) {
    console.error("Cloudinary signature error:", error);

    return NextResponse.json(
      { error: "Could not authorize image upload." },
      { status: 500 },
    );
  }
}
