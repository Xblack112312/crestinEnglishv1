import Image from "next/image";
import Link from "next/link";
import { Award, CornerDownRight, GraduationCap, Quote } from "lucide-react";

/**
 * Public assets used by this section:
 *  /images/people.png -> avatar stack (set AVATARS_SIZE to the file's real size)
 *
 * Render inside your page's <main>. The h1 lives here, so keep exactly one per page.
 */

const AVATARS_SIZE = { width: 112, height: 28 } as const;

type QuoteData = {
  text: string;
  author: string;
  role: string;
};

const MENTOR_QUOTE: QuoteData = {
  text: "Every question got a clear answer within the hour.",
  author: "Mohamed",
  role: "Prep 3 Student",
};

type QuoteBlockProps = {
  quote: QuoteData;
  className?: string;
};

const QuoteBlock = ({ quote, className = "" }: QuoteBlockProps) => (
  <figure className={`rounded-sm bg-white p-5 shadow-sm ${className}`}>
    <Quote aria-hidden className="mb-3 h-5 w-5 text-black/40" />
    <blockquote className="text-lg font-medium leading-snug text-black lg:text-xl">
      <p>{quote.text}</p>
    </blockquote>
    <figcaption className="mt-4 text-sm text-black/70">
      <span className="font-semibold text-black">{quote.author}</span>, {quote.role}
    </figcaption>
  </figure>
);

/** Pinwheel mark used inside the headline: four squares, each with one large rounded corner */
const PinwheelMark = () => (
  <svg
    viewBox="0 0 48 48"
    aria-hidden
    focusable="false"
    className="mr-3 inline-block h-[0.85em] w-[0.85em] -translate-y-[0.05em] align-middle"
    fill="#10B981"
  >
    <path d="M0 0H24V24H16A16 16 0 0 1 0 8Z" />
    <path d="M40 0H48V24H24V16A16 16 0 0 1 40 0Z" />
    <path d="M24 24H32A16 16 0 0 1 48 40V48H24Z" />
    <path d="M0 24H24V32A16 16 0 0 1 8 48H0Z" />
  </svg>
);

const Avatars = ({ className }: { className?: string }) => (
  <Image
    src="/images/people.png"
    alt="Students learning with Crest"
    {...AVATARS_SIZE}
    className={className}
  />
);

const Hero = () => {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      {/* Faint tile grid behind the CTA */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[300px] hidden h-[260px] opacity-60 md:block"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(0,0,0,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />

      <div className="relative mx-auto max-w-[1280px] px-6 pt-12 sm:pt-16 lg:px-12">
        <GraduationCap
          aria-hidden
          strokeWidth={1.4}
          className="absolute left-[15%] top-[300px] hidden h-14 w-14 text-[#0DB87A] lg:block"
        />

        {/* Heading block */}
        <div className="relative mx-auto flex max-w-[880px] flex-col items-center text-center">
          <div className="flex items-center gap-2.5">
            <Avatars className="h-auto w-auto" />
            <p className="text-[15px] font-medium text-black/80">Trusted by 300 students</p>
          </div>

          <h1
            id="hero-title"
            className="mt-6 text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl lg:text-[76px]"
          >
            <span className="block">Learn. Grow. Succeed</span>
            <span className="block">
              <PinwheelMark />
              with Crest
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base text-black/70">
            Advance your career through accessible and flexible education.
          </p>

          <Link
            href="/courses"
            className="mt-8 inline-flex items-center gap-2 rounded-sm bg-zinc-900 px-6 py-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            <CornerDownRight aria-hidden className="h-4 w-4" />
            Explore All Courses
          </Link>
        </div>

        {/* Bento grid: green + blue stacked on the left, yellow spanning both rows on the right */}
        <div className="mx-auto mt-12 grid max-w-[800px] gap-4 pb-16 md:grid-cols-2 md:grid-rows-[minmax(230px,auto)_minmax(250px,auto)] lg:mt-14">
          {/* Green: mentors */}
          <article className="relative flex min-h-[200px] flex-col justify-end rounded-sm bg-[#0DB87A] p-6 md:col-start-1 md:row-start-1">
            <div className="absolute left-6 top-6 flex items-center">
              <Avatars className="h-auto w-auto" />
              <span className="-ml-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-[#BFEBDD] text-xs font-semibold text-black ring-2 ring-[#0DB87A]">
                50+
              </span>
            </div>
            <svg
              aria-hidden
              focusable="false"
              viewBox="0 0 40 50"
              className="absolute right-12 top-[62px] h-12 w-10 text-black"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M32 4C32 22 22 34 7 42" />
              <path d="M6 30l1 13 13-3" />
            </svg>
            <h2 className="text-2xl font-semibold leading-snug text-black">
              Expert Mentors &amp;
              <br />
              Live Support
            </h2>
          </article>

          {/* Yellow: personalized learning (spans both rows) */}
          <article className="relative flex min-h-[360px] flex-col justify-between gap-8 overflow-hidden rounded-sm bg-[#FBCB4F] p-6 md:col-start-2 md:row-span-2 md:row-start-1">
            <svg
              aria-hidden
              focusable="false"
              viewBox="0 0 300 160"
              preserveAspectRatio="none"
              className="absolute inset-x-0 bottom-0 w-full"
              fill="none"
              stroke="#F5B921"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                className="[vector-effect:non-scaling-stroke]"
                d="M14 158C20 90 40 70 70 78c30 8 45 70 85 74 40 4 80-40 105-120"
              />
              <path className="[vector-effect:non-scaling-stroke]" d="M244 52l16-24 16 26" />
            </svg>

            <h2 className="relative max-w-[320px] text-2xl font-semibold leading-snug text-black">
              Every student deserves engaging, personalized learning experiences.
            </h2>

            <QuoteBlock quote={MENTOR_QUOTE} className="relative" />
          </article>

          {/* Blue: award */}
          <article className="relative flex min-h-[200px] flex-col justify-end rounded-sm bg-[#17BEEC] p-6 md:col-start-1 md:row-start-2">
            <Award aria-hidden strokeWidth={1.6} className="absolute left-8 top-7 h-10 w-10 text-black" />
            <h2 className="text-xl font-semibold leading-snug text-black">
              Award-Winning
              <br />
              Learning Experience
            </h2>
          </article>
        </div>
      </div>
    </section>
  );
};

export default Hero;