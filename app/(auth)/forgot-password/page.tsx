"use client";

import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { forgotPasswordSchema } from "@/lib/validation/auth";

type ForgotPasswordResponse = { message?: string };

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please enter your email address.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json().catch(() => null)) as ForgotPasswordResponse | null;

      // The endpoint intentionally has the same public response for every
      // address. A failed transport is the only case that needs user action.
      if (!response.ok || !body?.message) {
        setError("We couldn't send the request right now. Please try again shortly.");
        return;
      }
      setIsComplete(true);
    } catch {
      setError("We couldn't reach Crest right now. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isComplete) {
    return (
      <section className="w-full max-w-md" aria-labelledby="reset-email-sent-title">
        <div className="mb-6 flex size-11 items-center justify-center rounded-full bg-emerald-950 text-emerald-50">
          <MailCheck aria-hidden="true" className="size-5" />
        </div>
        <h1 id="reset-email-sent-title" className="text-3xl font-semibold tracking-tight">
          Check your inbox
        </h1>
        <p className="mt-3 text-pretty leading-7 text-muted-foreground">
          If an eligible Crest account uses that email address, we&apos;ve sent instructions to reset its password.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The link expires in 30 minutes. If you don&apos;t see it soon, check your spam or junk folder.
        </p>
        <Button asChild size="lg" className="mt-7 w-full bg-[#07382A] hover:bg-[#07382A]/90">
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="w-full max-w-md" aria-labelledby="forgot-password-title">
      <Link href="/sign-in" className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">
        Back to sign in
      </Link>
      <h1 id="forgot-password-title" className="mt-7 text-3xl font-semibold tracking-tight">
        Forgot your password?
      </h1>
      <p className="mt-3 text-pretty leading-7 text-muted-foreground">
        Your learning journey doesn&apos;t have to stop here. Enter the email associated with your Crest account and we&apos;ll send secure instructions to get you back in.
      </p>
      <form onSubmit={submit} noValidate className="mt-8">
        <FieldGroup>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="email">Email address</FieldLabel>
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "email-error" : "email-help"}
              disabled={isSubmitting}
              placeholder="you@example.com"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-black focus:ring-2 focus:ring-black/15"
            />
            <p id="email-help" className="text-sm text-muted-foreground">We&apos;ll only use this to send reset instructions.</p>
            {error && <FieldError id="email-error">{error}</FieldError>}
          </Field>
          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full bg-[#07382A] hover:bg-[#07382A]/90">
            {isSubmitting && <Loader2 className="animate-spin" />}
            {isSubmitting ? "Sending reset link…" : "Send reset link"}
          </Button>
        </FieldGroup>
      </form>
    </section>
  );
}
