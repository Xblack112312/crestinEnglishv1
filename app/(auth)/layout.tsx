"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";

import AuthShowcase from "@/components/AuthShowcase";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    // Google accounts are created without grade/system details. Let them stay
    // on this route until those required fields are saved instead of sending
    // every authenticated user to the home page.
    const destination = session.user.onboardingComplete
      ? "/"
      : "/complete-profile";

    if (pathname !== destination) {
      router.replace(destination);
    }
  }, [pathname, router, session?.user.onboardingComplete, status]);

  return (
    <div className="flex h-screen flex-row overflow-y-hidden">
      <section className="h-full w-full px-10 py-5 lg:w-1/2">
        <Link href="/">
          <h1 className="text-xl font-bold">CrestInEnglish.</h1>
        </Link>

        <main className="flex h-full items-center justify-center">
          {children}
        </main>
      </section>

      <AuthShowcase />
    </div>
  );
}
