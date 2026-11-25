"use client";

import { Check, CircleCheck, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { FieldError, FieldGroup } from "@/components/ui/field";
import {
  MAX_PASSWORD_LENGTH,
  PASSWORD_REQUIREMENTS,
  resetPasswordSchema,
} from "@/lib/validation/auth";

interface ResetPasswordFormProps {
  token: string;
}

type ResetPasswordResponse = { error?: string; ok?: boolean };

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isLinkUnavailable, setIsLinkUnavailable] = useState(false);
  const confirmationStarted = confirmation.length > 0;
  const confirmationError =
    confirmationStarted && password !== confirmation
      ? "Passwords don’t match yet."
      : "";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError("This reset link is missing. Request a new one to continue.");
      return;
    }
    if (confirmation !== password) {
      setError("Make sure both password fields match.");
      return;
    }

    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Choose a stronger password.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json().catch(() => null)) as ResetPasswordResponse | null;

      if (!response.ok || !body?.ok) {
        if (response.status === 400) {
          setIsLinkUnavailable(true);
          return;
        }

        setError(
          body?.error ??
            "We couldn't update your password. Please request a new link.",
        );
        return;
      }

      setIsComplete(true);
    } catch {
      setError(
        "We couldn't reach Crest right now. Please check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isComplete) {
    return (
      <section className="w-full max-w-md" aria-labelledby="password-updated-title">
        <div className="mb-6 flex size-11 items-center justify-center rounded-full bg-emerald-950 text-emerald-50">
          <CircleCheck aria-hidden="true" className="size-5" />
        </div>
        <h1 id="password-updated-title" className="text-3xl font-semibold tracking-tight">
          Password updated
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          Your password has been changed and your other Crest sessions have been
          signed out for security.
        </p>
        <Button asChild size="lg" className="mt-7 w-full bg-[#07382A] hover:bg-[#07382A]/90">
          <Link href="/sign-in">Continue to sign in</Link>
        </Button>
      </section>
    );
  }

  if (!token) {
    return <ResetLinkUnavailable message="This reset link is missing. Request a new one to continue." />;
  }

  if (isLinkUnavailable) {
    return <ResetLinkUnavailable message="This reset link is no longer available. It may have expired, already been used, or been replaced by a newer request." />;
  }

  return (
    <section className="w-full max-w-md" aria-labelledby="reset-password-title">
      <Link href="/sign-in" className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">
        Back to sign in
      </Link>
      <h1 id="reset-password-title" className="mt-7 text-3xl font-semibold tracking-tight">
        Create a new password
      </h1>
      <p className="mt-3 text-pretty leading-7 text-muted-foreground">
        You&apos;re almost back in. Choose a strong new password to secure your account and continue your learning journey with Crest.
      </p>
      <form onSubmit={submit} noValidate className="mt-8">
        <FieldGroup>
          <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} disabled={isSubmitting} autoComplete="new-password" />
          <ul className="grid gap-1.5 rounded-md bg-muted/60 p-3 text-sm text-muted-foreground" aria-label="Password requirements">
            {[...PASSWORD_REQUIREMENTS, { label: `At most ${MAX_PASSWORD_LENGTH} characters`, isMet: (value: string) => value.length <= MAX_PASSWORD_LENGTH }].map((requirement) => {
              const isMet = requirement.isMet(password);
              return <li key={requirement.label} className={isMet ? "flex items-center gap-2 text-emerald-800" : "flex items-center gap-2"}><Check aria-hidden="true" className={isMet ? "size-4" : "size-4 opacity-35"} />{requirement.label}</li>;
            })}
          </ul>
          <PasswordField id="confirm-password" label="Confirm new password" value={confirmation} onChange={setConfirmation} disabled={isSubmitting} error={confirmationError} hint={confirmationStarted && !confirmationError ? "Passwords match." : undefined} autoComplete="new-password" />
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full bg-[#07382A] hover:bg-[#07382A]/90">
            {isSubmitting && <Loader2 className="animate-spin" />}
            {isSubmitting ? "Updating password…" : "Update password"}
          </Button>
        </FieldGroup>
      </form>
    </section>
  );
}

function ResetLinkUnavailable({ message }: { message: string }) {
  return <section className="w-full max-w-md" aria-labelledby="reset-link-title"><h1 id="reset-link-title" className="text-3xl font-semibold tracking-tight">Request a new reset link</h1><p className="mt-3 leading-7 text-muted-foreground">{message}</p><Button asChild size="lg" className="mt-7 w-full bg-[#07382A] hover:bg-[#07382A]/90"><Link href="/forgot-password">Request a new link</Link></Button><Link href="/sign-in" className="mt-5 block text-center text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">Back to sign in</Link></section>;
}
