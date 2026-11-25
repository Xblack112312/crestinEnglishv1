import type { UserRole } from "@/models/User";

export const PERMISSIONS = ["admin:access"] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Explicit mappings keep authorization deny-by-default: an unknown role or
 * permission has no entry and therefore grants nothing.
 */
const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  admin: ["admin:access"],
  student: [],
};

export function hasPermission(
  role: UserRole | null | undefined,
  permission: Permission,
): boolean {
  return role !== undefined && role !== null
    ? ROLE_PERMISSIONS[role].includes(permission)
    : false;
}
