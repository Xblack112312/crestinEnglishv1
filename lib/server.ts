import { getServerSession } from "next-auth";
import { hasPermission, type Permission } from "@/lib/authorization";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/database";
import User, { type IUser, type UserRole } from "@/models/User";

export class AuthorizationError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  await connectToDatabase();
  return User.findById(session.user.id)
    .select("name email avatar role grade educationSystem provider onboardingComplete")
    .lean();
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError(401, "Unauthorized");
  return user;
}

/** Database is the authorization source of truth; session role is intentionally never read here. */
export async function requireRole(role: UserRole) {
  const user = await requireAuth();
  if (user.role !== role) throw new AuthorizationError(403, "Forbidden");
  return user;
}

export async function requireAdmin() {
  return requirePermission("admin:access");
}

/** The database role, rather than a client-visible session claim, is authoritative. */
export async function requirePermission(permission: Permission) {
  const user = await requireAuth();
  if (!hasPermission(user.role, permission)) {
    throw new AuthorizationError(403, "Forbidden");
  }
  return user;
}

export async function requireCompletedProfile() {
  const user = await requireAuth();
  if (!user.onboardingComplete)
    throw new AuthorizationError(403, "Profile completion required");
  return user;
}

export function safeUser(
  user: Pick<
    IUser,
    | "name"
    | "email"
    | "role"
    | "grade"
    | "educationSystem"
    | "provider"
    | "onboardingComplete"
  > & { _id: { toString(): string } },
) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    grade: user.grade,
    educationSystem: user.educationSystem,
    provider: user.provider,
    onboardingComplete: user.onboardingComplete,
  };
}
