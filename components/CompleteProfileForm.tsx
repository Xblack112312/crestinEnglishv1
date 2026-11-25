"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  completeProfileSchema,
  EDUCATION_SYSTEMS,
  GRADES,
} from "@/lib/validation/auth";

type CompleteProfileValues = z.infer<typeof completeProfileSchema>;

const selectClassName =
  "w-full border border-input bg-background text-sm focus-visible:border-black focus-visible:ring-2 focus-visible:ring-black/15";

type ErrorResponse = {
  error?: string;
};

export default function CompleteProfileForm() {
  const router = useRouter();
  const { update } = useSession();
  const form = useForm<CompleteProfileValues>({
    resolver: zodResolver(completeProfileSchema),
    defaultValues: {
      grade: undefined,
      educationSystem: undefined,
    },
  });

  async function handleSubmit(values: CompleteProfileValues) {
    form.clearErrors("root");

    try {
      const response = await fetch("/api/auth/complete-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await response.json().catch(() => null)) as
        | ErrorResponse
        | null;

      if (!response.ok) {
        if (response.status === 401) {
          router.replace("/sign-in");
          return;
        }

        form.setError("root", {
          message:
            body?.error ?? "We could not save your profile. Please try again.",
        });
        return;
      }

      // Refresh the client session before navigating so onboarding guards see
      // the completed state immediately.
      await update();
      router.replace("/");
      router.refresh();
    } catch {
      form.setError("root", {
        message: "We could not save your profile. Check your connection and try again.",
      });
    }
  }

  const isPending = form.formState.isSubmitting;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Complete your profile
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Select your grade and education system to personalize your learning.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(handleSubmit)} noValidate>
        <FieldGroup>
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
                    aria-describedby={
                      fieldState.error ? "grade-error" : undefined
                    }
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
                  <FieldError id="grade-error" errors={[fieldState.error]} />
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
                    aria-describedby={
                      fieldState.error ? "education-system-error" : undefined
                    }
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
                  <FieldError
                    id="education-system-error"
                    errors={[fieldState.error]}
                  />
                )}
              </Field>
            )}
          />

          {form.formState.errors.root?.message && (
            <FieldError>{form.formState.errors.root.message}</FieldError>
          )}

          <Button type="submit" size="lg" disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            {isPending ? "Saving your profile…" : "Save & continue"}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
