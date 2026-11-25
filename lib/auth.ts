import argon2 from "argon2";
import { Types } from "mongoose";
import type { AuthOptions, Profile } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import { getAvatarForUserId, isAvatar, type Avatar } from "@/lib/avatar";
import { connectToDatabase } from "@/lib/database";
import { signInSchema } from "@/lib/validation/auth";
import User from "@/models/User";

const INITIAL_SESSION_VERSION = 0;

class SessionRevokedError extends Error {
  constructor() {
    super("Session revoked");
    this.name = "SessionRevokedError";
  }
}

function isSessionRevokedError(metadata: unknown): boolean {
  const error =
    metadata instanceof Error
      ? metadata
      : typeof metadata === "object" && metadata !== null && "error" in metadata
        ? metadata.error
        : undefined;

  return error instanceof SessionRevokedError;
}

/**
 * Backfill only legacy accounts whose avatar is absent. Existing assignments,
 * including legacy invalid values, are intentionally not overwritten.
 */
async function getOrAssignAvatar(userId: string): Promise<Avatar | undefined> {
  await User.updateOne(
    {
      _id: userId,
      $or: [
        { avatar: { $exists: false } },
        { avatar: { $in: [null, "" as Avatar] } },
      ],
    },
    { $set: { avatar: getAvatarForUserId(userId) } },
  );

  const user = await User.findById(userId).select("avatar").lean();

  return isAvatar(user?.avatar) ? user.avatar : undefined;
}

function isSessionVersion(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= INITIAL_SESSION_VERSION
  );
}

function isVerifiedGoogleProfile(
  profile: Profile | undefined,
): profile is Profile & { email: string; email_verified: true } {
  if (!profile || typeof profile.email !== "string") {
    return false;
  }

  return "email_verified" in profile && profile.email_verified === true;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

/**
 * Legacy user documents may predate sessionVersion. Backfill only the document
 * being authenticated; sessions without a numeric JWT claim remain invalid.
 */
async function getSessionVersion(userId: string): Promise<number | null> {
  await User.updateOne(
    { _id: userId, sessionVersion: { $exists: false } },
    { $set: { sessionVersion: INITIAL_SESSION_VERSION } },
  );

  const user = await User.findById(userId).select("+sessionVersion").lean();

  return user && isSessionVersion(user.sessionVersion)
    ? user.sessionVersion
    : null;
}

async function findOrCreateGoogleUser(email: string, name: string) {
  const userId = new Types.ObjectId();

  try {
    return await User.findOneAndUpdate(
      { email, provider: "google" },
      {
        $setOnInsert: {
          _id: userId,
          name,
          email,
          provider: "google",
          role: "student",
          onboardingComplete: false,
          avatar: getAvatarForUserId(userId.toString()),
        },
      },
      {
        returnDocument: "after",
        upsert: true,
        setDefaultsOnInsert: true,
      },
    ).lean();
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    // Another request created the account after the account-linking check.
    return User.findOne({ email, provider: "google" }).lean();
  }
}

export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET!,
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // NextAuth includes csrfToken, callbackUrl, and redirect in this body.
        // Validate only the provider's credential fields with the strict schema.
        const parsed = signInSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
        });

        if (!parsed.success) {
          return null;
        }

        await connectToDatabase();

        const user = await User.findOne({
          email: parsed.data.email,
          provider: "credentials",
        }).select("+password");

        if (!user?.password) {
          return null;
        }

        try {
          if (!(await argon2.verify(user.password, parsed.data.password))) {
            return null;
          }
        } catch {
          // Treat a malformed legacy password hash as an invalid credential.
          return null;
        }

        const sessionVersion = await getSessionVersion(user.id);
        if (sessionVersion === null) {
          return null;
        }

        const avatar = await getOrAssignAvatar(user.id);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          grade: user.grade,
          educationSystem: user.educationSystem,
          provider: user.provider,
          onboardingComplete: user.onboardingComplete,
          sessionVersion,
          avatar,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") {
        return true;
      }

      // Only accept email addresses explicitly verified by Google.
      if (!isVerifiedGoogleProfile(profile)) {
        return false;
      }

      await connectToDatabase();

      const email = profile.email.trim().toLowerCase();
      const existingUser = await User.findOne({ email })
        .select("provider")
        .lean();

      // Never silently link a credentials account to a Google identity.
      if (existingUser && existingUser.provider !== "google") {
        return false;
      }

      const databaseUser = await findOrCreateGoogleUser(
        email,
        (user.name || "Student").trim().slice(0, 32),
      );

      if (!databaseUser || databaseUser.provider !== "google") {
        return false;
      }

      const sessionVersion = await getSessionVersion(databaseUser._id.toString());
      if (sessionVersion === null) {
        return false;
      }

      const avatar = await getOrAssignAvatar(databaseUser._id.toString());

      user.id = databaseUser._id.toString();
      user.role = databaseUser.role;
      user.grade = databaseUser.grade;
      user.educationSystem = databaseUser.educationSystem;
      user.provider = databaseUser.provider;
      user.onboardingComplete = databaseUser.onboardingComplete;
      user.sessionVersion = sessionVersion;
      user.avatar = avatar;
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.sessionVersion = user.sessionVersion;
        token.avatar = user.avatar;
      }

      return token;
    },
    async session({ session, token }) {
      if (!token.sub || !isSessionVersion(token.sessionVersion)) {
        throw new SessionRevokedError();
      }

      await connectToDatabase();

      // Also covers legacy users with an already-issued JWT session.
      await getOrAssignAvatar(token.sub);

      const user = await User.findById(token.sub)
        .select(
          "name email role grade educationSystem provider onboardingComplete avatar +sessionVersion",
        )
        .lean();

      if (!user || !isSessionVersion(user.sessionVersion)) {
        throw new SessionRevokedError();
      }

      if (user.sessionVersion !== token.sessionVersion) {
        throw new SessionRevokedError();
      }

      session.user = {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        grade: user.grade,
        educationSystem: user.educationSystem,
        provider: user.provider,
        onboardingComplete: user.onboardingComplete,
        avatar: isAvatar(user.avatar) ? user.avatar : undefined,
      };

      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }

      try {
        return new URL(url).origin === baseUrl ? url : baseUrl;
      } catch {
        return baseUrl;
      }
    },
  },
  logger: {
    error(code, metadata) {
      // A deliberately invalidated JWT is cleared by NextAuth. Avoid logging
      // that expected cleanup as an application error, while preserving logs
      // for decode, database, and other unexpected session failures.
      if (code === "JWT_SESSION_ERROR" && isSessionRevokedError(metadata)) {
        return;
      }

      console.error(`[next-auth][error][${code}]`, metadata);
    },
  },
};
