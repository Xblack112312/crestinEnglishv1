import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense } from "react";

import { AuthorizationError, requireAdmin } from "@/lib/server";
import { DashboardShell } from "./dashboard-shell";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <AuthorizedDashboard>{children}</AuthorizedDashboard>
    </Suspense>
  );
}

async function AuthorizedDashboard({ children }: DashboardLayoutProps) {
  let user: Awaited<ReturnType<typeof requireAdmin>>;

  try {
    user = await requireAdmin();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect(error.status === 401 ? "/sign-in" : "/not-found");
    }

    throw error;
  }

  return (
    <DashboardShell
      user={{
        name: user.name,
        email: user.email,
        avatar: user.avatar ?? null,
      }}
    >
      {children}
    </DashboardShell>
  );
}

function DashboardLoading() {
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Desktop sidebar skeleton */}
      <aside className="hidden border-r border-border p-5 lg:block">
        <div className="mb-10 h-9 w-40 animate-pulse rounded-lg bg-muted" />

        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-11 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      </aside>

      {/* Main content skeleton */}
      <main className="min-w-0">
        <div className="flex h-16 items-center border-b border-border px-4 lg:hidden">
          <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
          <div className="ml-3 h-5 w-36 animate-pulse rounded bg-muted" />
        </div>

        <div
          className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8"
          aria-busy="true"
          aria-label="Loading dashboard"
        >
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-5 w-64 max-w-full animate-pulse rounded bg-muted" />

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-xl border border-border bg-muted/40"
              />
            ))}
          </div>

          <div className="mt-6 h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
        </div>
      </main>
    </div>
  );
}
