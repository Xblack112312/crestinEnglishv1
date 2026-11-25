import { z } from "zod";

export const GRADES = [
  "grade-7",
  "grade-8",
  "grade-9",
  "grade-10",
  "grade-11",
  "grade-12",
] as const;

export const EDUCATION_SYSTEMS = ["azhar", "general"] as const;
export const MAX_PASSWORD_LENGTH = 128;

/** Shared by the password schema and recovery UI so policy cannot drift. */
export const PASSWORD_REQUIREMENTS = [
  {
    label: "At least 8 characters",
    isMet: (value: string) => value.length >= 8,
  },
  {
    label: "An uppercase letter",
    isMet: (value: string) => /[A-Z]/.test(value),
  },
  {
    label: "A lowercase letter",
    isMet: (value: string) => /[a-z]/.test(value),
  },
  {
    label: "A number",
    isMet: (value: string) => /[0-9]/.test(value),
  },
  {
    label: "A special character",
    isMet: (value: string) => /[^A-Za-z0-9\s]/.test(value),
  },
] as const;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address.")
  .max(100, "Email must be at most 100 characters.");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(MAX_PASSWORD_LENGTH, "Password must be at most 128 characters.")
  .refine(PASSWORD_REQUIREMENTS[1].isMet, "Password must include an uppercase letter.")
  .refine(PASSWORD_REQUIREMENTS[2].isMet, "Password must include a lowercase letter.")
  .refine(PASSWORD_REQUIREMENTS[3].isMet, "Password must include a number.")
  .refine(PASSWORD_REQUIREMENTS[4].isMet, "Password must include a special character.");

export const signInSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, "Password is required.").max(128),
  })
  .strict();

export const signUpSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(32, "Name must be at most 32 characters."),
    email: emailSchema,
    password: passwordSchema,
    grade: z.enum(GRADES),
    educationSystem: z.enum(EDUCATION_SYSTEMS),
  })
  .strict();

export const completeProfileSchema = z
  .object({
    grade: z.enum(GRADES),
    educationSystem: z.enum(EDUCATION_SYSTEMS),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(32).optional(),
    grade: z.enum(GRADES).optional(),
    educationSystem: z.enum(EDUCATION_SYSTEMS).optional(),
  })
  .strict();

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(32).max(256),
    password: passwordSchema,
  })
  .strict();
