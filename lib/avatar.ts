export const AVATARS = [
  "/images/avatar.png",
  "/images/avatar1.png",
  "/images/avatar2.png",
  "/images/avatar3.png",
  "/images/avatar4.png",
  "/images/avatar5.png",
] as const;

export type Avatar = (typeof AVATARS)[number];

/**
 * Produces a stable avatar from an immutable account identifier. The selected
 * value is persisted on the user document and is never chosen in the client.
 */
export function getAvatarForUserId(userId: string): Avatar {
  let hash = 2166136261;

  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return AVATARS[(hash >>> 0) % AVATARS.length];
}

export function isAvatar(value: unknown): value is Avatar {
  return typeof value === "string" && AVATARS.includes(value as Avatar);
}
