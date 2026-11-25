"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { signInSchema } from "@/lib/validation/auth";

type SignInValues = z.infer<typeof signInSchema>;

const inputClassName =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-black focus:ring-2 focus:ring-black/15";

export default function SignInPage() {
  const router = useRouter();
  const [formError, setFormError] = useState("");
  const [isGooglePending, setIsGooglePending] = useState(false);
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const isPending = form.formState.isSubmitting || isGooglePending;

  async function handleCredentialsSubmit(values: SignInValues) {
    setFormError("");

    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (result?.error) {
      setFormError("Invalid email or password.");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function handleGoogleSignIn() {
    setFormError("");
    setIsGooglePending(true);
    await signIn("google", { callbackUrl: "/complete-profile" });
  };

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>

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

        <FieldSeparator>or continue with email</FieldSeparator>

        <form onSubmit={form.handleSubmit(handleCredentialsSubmit)} noValidate>
          <FieldGroup>
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
                  {fieldState.error && <FieldError errors={[fieldState.error]} />}
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
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    className={inputClassName}
                  />
                  {fieldState.error && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            {formError && <FieldError>{formError}</FieldError>}

            <Link href="/forgot-password" className="self-end text-sm underline underline-offset-4">
              Forgot password?
            </Link>

            <Button type="submit" size="lg" disabled={isPending}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </FieldGroup>
        </form>
      </FieldGroup>

      <p className="mt-4 text-sm text-muted-foreground">
        New here?{" "}
        <Link className="font-medium text-foreground underline underline-offset-4" href="/sign-up">
          Create an account
        </Link>
      </p>
    </div>
  );
}
