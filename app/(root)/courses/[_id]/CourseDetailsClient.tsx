"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  ImageOff,
  Maximize2,
  RotateCw,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type EducationSystem = "general" | "azhar";

interface Course {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  thumbnail: string;
  targetGrades: number[];
  targetEducationSystems: EducationSystem[];
  learningOutcomes: string[];
  requirements: string[];
  publishedAt: string | null;
  updatedAt: string | null;
}

interface ApiResponse {
  success: boolean;
  code?: string;
  message?: string;
  course?: Course;
}

type SectionId = "overview" | "details" | "outcomes" | "requirements";

interface SectionDef {
  id: SectionId;
  index: string;
  label: string;
}

/* ------------------------------------------------------------------ */
/*  Utils                                                              */
/* ------------------------------------------------------------------ */

function formatDate(date: string | null): string {
  if (!date) return "Not available";

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Not available";

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** [7, 8, 9, 11] -> ["Grades 7–9", "Grade 11"] */
function formatGradeRanges(grades: number[]): string[] {
  if (grades.length === 0) return [];

  const sorted = Array.from(new Set(grades)).sort((a, b) => a - b);
  const ranges: string[] = [];

  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current === end + 1) {
      end = current;
      continue;
    }

    ranges.push(start === end ? `Grade ${start}` : `Grades ${start}–${end}`);

    if (current !== undefined) {
      start = current;
      end = current;
    }
  }

  return ranges;
}

/* ------------------------------------------------------------------ */
/*  Skeleton (exported so page.tsx can use it as the Suspense fallback) */
/* ------------------------------------------------------------------ */

const skeletonBar = "animate-pulse rounded-[2px] bg-neutral-200";

export function CourseSkeleton() {
  return (
    <div role="status" aria-busy="true" className="w-full">
      <span className="sr-only">Loading course details…</span>

      <div className="mx-auto max-w-[1400px] px-6 py-10 sm:px-10 sm:py-14 lg:px-16">
        <div className={`${skeletonBar} h-4 w-28`} />

        <div className="mt-10 grid grid-cols-1 gap-10 lg:mt-16 lg:grid-cols-12 lg:gap-6">
          <div className="space-y-4 lg:col-span-7">
            <div className={`${skeletonBar} h-14 w-[90%] sm:h-16`} />
            <div className={`${skeletonBar} h-14 w-[70%] sm:h-16`} />
            <div className={`${skeletonBar} mt-6 h-5 w-full max-w-md`} />
            <div className={`${skeletonBar} h-5 w-2/3 max-w-sm`} />
          </div>

          <div className="lg:col-span-5">
            <div className={`${skeletonBar} aspect-video w-full`} />
          </div>
        </div>

        <div className="mt-24 grid grid-cols-1 gap-12 lg:grid-cols-[160px_1fr] lg:gap-16">
          <div className="hidden lg:block">
            <div className={`${skeletonBar} h-4 w-16`} />
          </div>

          <div className="space-y-6">
            <div className={`${skeletonBar} h-4 w-full max-w-xl`} />
            <div className={`${skeletonBar} h-4 w-full max-w-lg`} />
            <div className={`${skeletonBar} h-4 w-2/3 max-w-md`} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error state                                                        */
/* ------------------------------------------------------------------ */

function CourseErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[1400px] flex-col justify-center px-6 py-16 sm:px-10 lg:px-16">
      <div role="alert" className="max-w-md">
        <AlertTriangle
          className="h-6 w-6 text-black"
          strokeWidth={1.5}
          aria-hidden="true"
        />

        <h2 className="mt-5 text-2xl font-medium tracking-tight text-black">
          Unable to load this course
        </h2>

        <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
          {message}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-11 items-center gap-2 bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>

          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 border border-neutral-300 px-5 text-sm font-medium text-black transition-colors hover:border-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Lightbox                                                           */
/* ------------------------------------------------------------------ */

function CourseLightbox({
  isOpen,
  src,
  alt,
  onClose,
}: {
  isOpen: boolean;
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} — enlarged image`}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 sm:p-10"
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close enlarged image"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center text-white/80 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-8 sm:top-8"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>

          <motion.img
            src={src}
            alt={alt}
            className="max-h-full max-w-full object-contain"
            initial={prefersReducedMotion ? false : { scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={(event) => event.stopPropagation()}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  Section nav                                                        */
/* ------------------------------------------------------------------ */

function SectionNav({ sections }: { sections: SectionDef[] }) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  const goTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;

    el.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });

    window.setTimeout(
      () => el.focus({ preventScroll: true }),
      prefersReducedMotion ? 0 : 400,
    );
  };

  return (
    <>
      <nav
        aria-label="Course sections"
        className="hidden lg:sticky lg:top-28 lg:block lg:self-start"
      >
        <ol className="space-y-5 border-l border-neutral-200 pl-5">
          {sections.map((section) => {
            const isActive = section.id === activeId;
            return (
              <li key={section.id} className="relative -ml-[21px] pl-[21px]">
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-[7px] h-[9px] w-[9px] -translate-x-1/2 rounded-full border transition-colors ${
                    isActive
                      ? "border-black bg-black"
                      : "border-neutral-300 bg-white"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => goTo(section.id)}
                  className={`text-left text-[13px] leading-tight tracking-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${
                    isActive
                      ? "font-medium text-black"
                      : "text-neutral-400 hover:text-neutral-700"
                  }`}
                >
                  <span className="mr-2 font-mono text-[11px] tabular-nums">
                    {section.index}
                  </span>
                  {section.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <nav
        aria-label="Course sections"
        className="sticky top-0 z-40 -mx-6 overflow-x-auto border-b border-neutral-200 bg-white/90 px-6 backdrop-blur sm:-mx-10 sm:px-10 lg:hidden"
      >
        <ul className="flex min-w-max gap-6">
          {sections.map((section) => {
            const isActive = section.id === activeId;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => goTo(section.id)}
                  className={`flex h-12 items-center border-b-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${
                    isActive
                      ? "border-black font-medium text-black"
                      : "border-transparent text-neutral-400"
                  }`}
                >
                  {section.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                                */
/* ------------------------------------------------------------------ */

function CourseHero({
  course,
  onEnlarge,
}: {
  course: Course;
  onEnlarge: () => void;
}) {
  const router = useRouter()

  const [imageFailed, setImageFailed] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const fadeUp = {
    initial: prefersReducedMotion ? undefined : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
  };

  return (
    <header className="mx-auto max-w-[1400px] px-6 pt-8 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-neutral-500 transition-colors hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All courses
      </Link>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:mt-16 lg:grid-cols-12 lg:items-start lg:gap-6">
        <motion.div
          className="lg:col-span-7"
          {...fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
            Course
          </p>

          <h1 className="mt-3 text-balance break-words text-[clamp(2.25rem,6.5vw,5rem)] font-medium leading-[0.98] tracking-[-0.02em] text-black">
            {course.title}
          </h1>

          {course.shortDescription && (
            <p className="mt-6 max-w-lg text-lg font-light italic leading-snug text-neutral-500 sm:text-xl">
              {course.shortDescription}
            </p>
          )}

          <button onClick={() => router.replace(`/checkout/${course?.id}`)} className="mt-3 flex items-center flex-row bg-black text-white font-medium py-3 px-3 gap-2 justify-center text-center cursor-pointer transition ease-linear hover:bg-black/80 rounded w-[180px]">
              <ArrowUpRight size={18} />
              Enroll Course
          </button>
        </motion.div>

        <motion.div
          className="lg:col-span-5 lg:justify-self-end lg:w-full lg:max-w-[560px]"
          {...fadeUp}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
        >
          {course.thumbnail && !imageFailed ? (
            <button
              type="button"
              onClick={onEnlarge}
              aria-label={`View full image for ${course.title}`}
              className="group relative block aspect-video w-full overflow-hidden border border-neutral-200 bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              <img
                src={course.thumbnail}
                alt={course.title}
                className="h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.025]"
                loading="eager"
                decoding="async"
                onError={() => setImageFailed(true)}
              />

              <span className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center bg-white text-black opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              </span>
            </button>
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 border border-dashed border-neutral-300 bg-neutral-50 text-neutral-400">
              {" "}
              <ImageOff className="h-6 w-6" aria-hidden="true" />
              <span className="text-xs">No image available</span>
            </div>
          )}
        </motion.div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Overview                                                            */
/* ------------------------------------------------------------------ */

function CourseOverview({ course }: { course: Course }) {
  return (
    <section
      id="overview"
      tabIndex={-1}
      className="scroll-mt-28 focus:outline-none"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
        About this course
      </p>

      {course.description ? (
        <p className="mt-4 max-w-[64ch] whitespace-pre-wrap text-[17px] leading-[1.7] text-neutral-700">
          {course.description}
        </p>
      ) : (
        <p className="mt-4 text-[15px] italic text-neutral-400">
          No description has been added for this course yet.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Meta (grades / education systems / dates / copy link)              */
/* ------------------------------------------------------------------ */

function CourseMeta({ course }: { course: Course }) {
  const [copied, setCopied] = useState(false);

  const gradeRanges = formatGradeRanges(course.targetGrades);
  const systemLabels = course.targetEducationSystems.map((system) =>
    system === "azhar" ? "Al-Azhar" : "General Education",
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — fail silently
    }
  };

  const rows: { label: string; value: string }[] = [
    {
      label: "Grades",
      value: gradeRanges.length > 0 ? gradeRanges.join(", ") : "Not specified",
    },
    {
      label: "Education system",
      value:
        systemLabels.length > 0 ? systemLabels.join(", ") : "Not specified",
    },
    { label: "Published", value: formatDate(course.publishedAt) },
    { label: "Last updated", value: formatDate(course.updatedAt) },
  ];

  return (
    <section
      id="details"
      tabIndex={-1}
      className="scroll-mt-28 focus:outline-none"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
        Course information
      </p>

      <dl className="mt-4 max-w-xl divide-y divide-neutral-200 border-t border-neutral-200">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[140px_1fr] gap-4 py-3 sm:grid-cols-[180px_1fr]"
          >
            <dt className="text-sm text-neutral-400">{row.label}</dt>
            <dd className="text-sm text-black">{row.value}</dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        onClick={handleCopy}
        className="mt-6 inline-flex h-10 items-center gap-2 border border-neutral-300 px-4 text-sm text-black transition-colors hover:border-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" aria-hidden="true" />
            Link copied
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy course link
          </>
        )}
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Learning outcomes                                                   */
/* ------------------------------------------------------------------ */

const TRUNCATE_AT = 160;

function CourseOutcomes({ outcomes }: { outcomes: string[] }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      id="outcomes"
      tabIndex={-1}
      className="scroll-mt-28 focus:outline-none"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
        Learning outcomes
      </p>

      {outcomes.length === 0 ? (
        <p className="mt-4 text-[15px] italic text-neutral-400">
          No learning outcomes have been added for this course yet.
        </p>
      ) : (
        <ol className="mt-5 divide-y divide-neutral-200 border-t border-neutral-200">
          {outcomes.map((outcome, index) => {
            const isLong = outcome.length > TRUNCATE_AT;
            const isExpanded = expanded[index] ?? false;

            return (
              <motion.li
                key={index}
                className="group flex gap-5 py-5"
                initial={
                  prefersReducedMotion ? undefined : { opacity: 0, y: 12 }
                }
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{ duration: 0.4, delay: Math.min(index, 6) * 0.05 }}
              >
                <span className="mt-0.5 font-mono text-sm tabular-nums text-neutral-300 transition-colors group-hover:text-black">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div className="flex-1">
                  <p
                    className={`text-[15px] leading-relaxed text-neutral-700 ${
                      isLong && !isExpanded ? "line-clamp-2" : ""
                    }`}
                  >
                    {outcome}
                  </p>

                  {isLong && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [index]: !prev[index],
                        }))
                      }
                      className="mt-1 text-xs font-medium text-neutral-400 underline-offset-2 hover:text-black hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                    >
                      {isExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Requirements                                                        */
/* ------------------------------------------------------------------ */

function CourseRequirements({ requirements }: { requirements: string[] }) {
  if (requirements.length === 0) return null;

  return (
    <section
      id="requirements"
      tabIndex={-1}
      className="scroll-mt-28 focus:outline-none"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
        Requirements
      </p>

      <ul className="mt-5 space-y-3">
        {requirements.map((requirement, index) => (
          <li
            key={index}
            className="flex items-start gap-3 text-[15px] text-neutral-700"
          >
            <span
              className="mt-[9px] h-1 w-1 flex-shrink-0 bg-black"
              aria-hidden="true"
            />
            {requirement}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

const CourseDetailsClient = () => {
  const params = useParams<{ _id: string }>();
  const id = params._id;

  const [course, setCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const fetchCourse = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setCourse(null);

        const response = await fetch(`/api/courses/${encodeURIComponent(id)}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        const contentType = response.headers.get("content-type");

        if (!contentType?.includes("application/json")) {
          const responseText = await response.text();

          throw new Error(
            `The API returned an unexpected response (${response.status}). Check your API route configuration.`,
          );
        }

        const result: ApiResponse = await response.json();

        if (!response.ok || !result.success || !result.course) {
          throw new Error(
            result.message || "Unable to retrieve course details.",
          );
        }

        setCourse(result.course);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong while retrieving the course.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    if (id) {
      void fetchCourse();
    }

    return () => controller.abort();
  }, [id, retryCount]);

  const sections: SectionDef[] = useMemo(() => {
    if (!course) return [];

    const base: SectionDef[] = [
      { id: "overview", index: "01", label: "Overview" },
      { id: "details", index: "02", label: "Course info" },
      { id: "outcomes", index: "03", label: "Outcomes" },
    ];

    if (course.requirements.length > 0) {
      base.push({ id: "requirements", index: "04", label: "Requirements" });
    }

    return base;
  }, [course]);

  if (isLoading) {
    return <CourseSkeleton />;
  }

  if (error) {
    return (
      <CourseErrorState
        message={error}
        onRetry={() => setRetryCount((prev) => prev + 1)}
      />
    );
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-16 sm:px-10 lg:px-16">
        <h2 className="text-2xl font-medium text-black">Course not found</h2>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-neutral-500 underline-offset-2 hover:text-black hover:underline"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <CourseHero course={course} onEnlarge={() => setIsLightboxOpen(true)} />

      <div className="mx-auto mt-12 max-w-[1400px] px-6 sm:mt-14 sm:px-10 lg:mt-16 lg:px-16">
        <div className="lg:grid lg:grid-cols-[160px_minmax(0,1fr)] lg:gap-16">
          <SectionNav sections={sections} />

          <div className="mt-8 space-y-14 lg:mt-0 lg:space-y-16">
            {/* Overview + Course Information */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.85fr)] lg:gap-12">
              <CourseOverview course={course} />

              <CourseMeta course={course} />
            </div>

            {/* Learning Outcomes */}
            <CourseOutcomes outcomes={course.learningOutcomes} />

            {/* Requirements */}
            <CourseRequirements requirements={course.requirements} />
          </div>
        </div>
      </div>

      <CourseLightbox
        isOpen={isLightboxOpen}
        src={course.thumbnail}
        alt={course.title}
        onClose={() => setIsLightboxOpen(false)}
      />
    </div>
  );
};

export default CourseDetailsClient;
