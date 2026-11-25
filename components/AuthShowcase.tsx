"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";

const AuthShowcase = () => {
  const path = usePathname();

  const CONTENT = {
    title:
      path === "/forgot-password" || path === "/reset-password"
        ? "Security is our Priority!"
        : "Think in English. Speak with Confidence. Get High Grades",
    description:
      path === "/forgot-password" || path === "/reset-password"
        ? "Forgot your password? Don't worry, we've got you. Your learning journey doesn't have to stop here. Simply enter the email address linked to your account, and we'll help you get back in so you can continue learning, growing, and achieving your goals."
        : "Go beyond memorizing words. Build real-world English skills through engaging lessons, meaningful practice, and learning that stays with you.",
  };

  return (
    <aside
      aria-label="Product highlights"
      className="relative hidden h-full w-1/2 overflow-hidden bg-[#07382A] lg:block"
    >
      <div className="relative flex h-full items-start flex-col px-14 py-10 xl:px-20 xl:py-12">
        {/* Message */}
        <div className="max-w-md">
          <h2 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-white xl:text-[44px]">
            {CONTENT.title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-emerald-50/70">
            {CONTENT.description}
          </p>
        </div>

        {/* Illustration */}
        <div className="absolute h-full mt-24 w-full overflow-hidden">
          {path === "/forgot-password" || path === "/reset-password" ? (
            <Image
              src="/images/p1.png"
              alt="Someone"
              fill
              priority
              sizes="(min-width: 1280px) 640px, 45vw"
              className="object-contain w-auto h-auto p-4 xl:p-6"
            />
          ) : (
            <Image
              src="/images/1SCENE.png"
              alt="Two graduates celebrating with their diplomas"
              fill
              priority
              sizes="(min-width: 1280px) 640px, 45vw"
              className="object-contain  p-4 xl:p-6"
            />
          )}
        </div>
      </div>
    </aside>
  );
};

export default AuthShowcase;
