"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EDUCATION_SYSTEMS, GRADES, signUpSchema } from "@/lib/validation/auth";
import { toast, Toaster } from "sonner";

type SignUpValues = z.infer<typeof signUpSchema>;

const inputClassName =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-black focus:ring-2 focus:ring-black/15";

const selectClassName =
  "w-full border border-input bg-background text-sm focus-visible:border-black focus-visible:ring-2 focus-visible:ring-black/15";

export default function SignUpPage() {
  const router = useRouter();
  const [isGooglePending, setIsGooglePending] = useState(false);
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      grade: undefined,
      educationSystem: undefined,
    },
  });

  const isPending = form.formState.isSubmitting || isGooglePending;

  async function handleCredentialsSubmit(values: SignUpValues) {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        success: boolean;
        message?: string;
      } | null;

      Sentry.captureException(body?.message, {
        tags: {
          status: "Error",
          route: "sign-up",
          servicecode: "P9os0EM",
          side: "user",
        },
      });

      return;
    }

    const result = await signIn("credentials", {
      email: values?.email,
      password: values?.password,
      redirect: false,
    });

    if (result?.error) {
      router.replace("/sign-in");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function handleGoogleSignIn() {
    setIsGooglePending(true);
    await signIn("google", { callbackUrl: "/complete-profile" });
  };

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold">Create account</h1>

      <FieldGroup>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={isPending}
          onClick={handleGoogleSignIn}
        >
          {isGooglePending && <Loader2 className="animate-spin" />}
          Continue with Google
        </Button>

        <FieldSeparator>or create an account with email</FieldSeparator>

        <form onSubmit={form.handleSubmit(handleCredentialsSubmit)} noValidate>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="name">Full name</FieldLabel>
                  <input
                    {...field}
                    id="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    className={inputClassName}
                  />
                  {fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <input
                    {...field}
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="Email address"
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    className={inputClassName}
                  />
                  {fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <input
                    {...field}
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Create a password"
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    className={inputClassName}
                  />
                  {fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="grade"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="grade">Grade</FieldLabel>
                  <Select
                    disabled={isPending}
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      id="grade"
                      ref={field.ref}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}
                      className={selectClassName}
                    >
                      <SelectValue placeholder="Select your grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADES.map((grade) => (
                        <SelectItem key={grade} value={grade}>
                          {grade.replace("grade-", "Grade ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="educationSystem"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="education-system">
                    Education system
                  </FieldLabel>
                  <Select
                    disabled={isPending}
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      id="education-system"
                      ref={field.ref}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}
                      className={selectClassName}
                    >
                      <SelectValue placeholder="Select your education system" />
                    </SelectTrigger>
                    <SelectContent>
                      {EDUCATION_SYSTEMS.map((system) => (
                        <SelectItem key={system} value={system}>
                          {system === "azhar" ? "Azhar" : "General"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Button type="submit" size="lg" disabled={isPending}>
              {form.formState.isSubmitting && (
                <Loader2 className="animate-spin" />
              )}
              {form.formState.isSubmitting
                ? "Creating account…"
                : "Create account"}
            </Button>
          </FieldGroup>
        </form>
      </FieldGroup>

      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          className="font-medium text-foreground underline underline-offset-4"
          href="/sign-in"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
