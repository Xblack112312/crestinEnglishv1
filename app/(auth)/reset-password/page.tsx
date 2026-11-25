import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Suspense } from "react";

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

/** Static shell; URL-dependent content streams below this boundary. */
export default function ResetPasswordPage(props: ResetPasswordPageProps) {
  return (
    <Suspense fallback={<ResetPasswordLoading />}>
      <ResetPasswordContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ResetPasswordContent({
  searchParams,
}: ResetPasswordPageProps) {
  const { token: searchToken } = await searchParams;
  const token = typeof searchToken === "string" ? searchToken : "";

  return <ResetPasswordForm token={token} />;
}

function ResetPasswordLoading() {
  return (
    <section className="w-full max-w-md" aria-busy="true" aria-label="Loading password reset">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-7 h-9 w-64 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-12 animate-pulse rounded bg-muted" />
      <div className="mt-8 h-10 animate-pulse rounded bg-muted" />
    </section>
  );
}
