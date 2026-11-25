import type { DefaultSession } from "next-auth";

import type {
  AuthProvider,
  EducationSystem,
  Grade,
  UserRole,
} from "@/models/User";
import type { Avatar } from "@/lib/avatar";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      grade?: Grade;
      educationSystem?: EducationSystem;
      provider: AuthProvider;
      onboardingComplete: boolean;
      avatar?: Avatar;
    };
  }

  interface User {
    id: string;
    role: UserRole;
    grade?: Grade;
    educationSystem?: EducationSystem;
    provider: AuthProvider;
    onboardingComplete: boolean;
    sessionVersion: number;
    avatar?: Avatar;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    sessionVersion?: number;
    avatar?: Avatar;
  }
}
