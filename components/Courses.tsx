"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  GraduationCap,
  RefreshCw,
  School,
  BookMarked,
  CornerUpRight,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type EducationSystem = "general" | "azhar";

type EmptyReason = "grade" | "educationSystem" | "combination";

interface Course {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  thumbnail: string;
  targetGrades: number[];
  targetEducationSystems: EducationSystem[];
  publishedAt: string | null;
  updatedAt: string | null;
}

interface ApiResponse {
  success: boolean;
  message?: string;
  total?: number;
  courses?: Course[];
  emptyReasons?: EmptyReason[];
}

const normalizeCourse = (course: Course): Course => ({
  ...course,
  shortDescription: course.shortDescription ?? "",
  thumbnail: course.thumbnail ?? "",
  targetGrades: course.targetGrades ?? [],
  targetEducationSystems: course.targetEducationSystems ?? [],
  publishedAt: course.publishedAt ?? null,
  updatedAt: course.updatedAt ?? null,
});

function formatDate(date: string | null) {
  if (!date) return null;

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) return null;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsedDate);
}

function getEducationLabel(system: EducationSystem) {
  return system === "azhar" ? "Al-Azhar" : "General Education";
}

// Loading skeleton
function CourseSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#151515]">
      <div className="h-48 animate-pulse bg-gray-200 dark:bg-white/10" />

      <div className="space-y-4 p-5">
        <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-white/10" />

        <div className="h-6 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-white/10" />

        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-gray-200 dark:bg-white/10" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
        </div>

        <div className="flex gap-2 pt-3">
          <div className="h-7 w-20 animate-pulse rounded-lg bg-gray-200 dark:bg-white/10" />
          <div className="h-7 w-24 animate-pulse rounded-lg bg-gray-200 dark:bg-white/10" />
        </div>
      </div>
    </div>
  );
}

// Course thumbnail
function CourseImage({
  thumbnail,
  title,
}: {
  thumbnail: string;
  title: string;
}) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="relative h-48 overflow-hidden bg-gray-100 dark:bg-[#222]">
      {!thumbnail || imageError ? (
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-white/10">
            <BookOpen size={30} className="text-gray-400 dark:text-gray-300" />
          </div>
        </div>
      ) : (
        <img
          src={thumbnail}
          alt={title}
          loading="lazy"
          onError={() => setImageError(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

const Courses = () => {
  const { status } = useSession();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emptyReasons, setEmptyReasons] = useState<EmptyReason[]>([]);

  const fetchCourses = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/courses/getallcourses", {
        method: "GET",
        cache: "no-store",
      });

      const results: ApiResponse = await response.json();

      if (!response.ok || !results.success) {
        toast.error(results.message || "Unable to retrieve courses.", {
          description: "Something Went Wrong, Please try again.",
          descriptionClassName: "text-xs text-zinc-500",
        });
      }

      const normalizedCourses = (results.courses ?? []).map(normalizeCourse);

      setCourses(normalizedCourses);
      setEmptyReasons(results.emptyReasons ?? []);
    } catch (err) {
      console.error("Fetch courses error:", err);

      setCourses([]);
      setEmptyReasons([]);

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while loading your courses.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCourses();
  }, [fetchCourses]);

  const handleRedirectUserToDetails = (courseId: string) => {
    if (status === "unauthenticated") {
        router.replace("/sign-in");
        return;
    };

    router.push(`/courses/${courseId}`);
  }

  return (
    <section
      className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8"
      aria-busy={isLoading}
    >
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            Courses
          </h1>

          <p className="max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400 sm:text-base">
            Explore your available courses and discover new opportunities to
            improve your knowledge and skills.
          </p>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <CourseSkeleton key={index} />
          ))}
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div
          role="alert"
          className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-14 text-center dark:border-red-500/20 dark:bg-red-500/5"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10">
            <AlertCircle size={27} className="text-red-500" />
          </div>

          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Unable to load courses
          </h2>

          <p className="mt-2 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
            {error}
          </p>

          <button
            type="button"
            onClick={() => void fetchCourses()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-200"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && courses.length === 0 && (
        <div className="flex flex-col items-center justify-center border-b border-gray-200 bg-white px-6 py-16 text-center ">
          <Image src="/images/a1.svg" width={300} height={300} alt="n404" />

          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            No Courses Available
          </h2>

          <div className="mt-3 max-w-lg space-y-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {emptyReasons.includes("grade") && (
              <p>There are no any available courses for your grade.</p>
            )}

            {emptyReasons.includes("educationSystem") && (
              <p>
                There are no any available courses for your education system.
              </p>
            )}

            {emptyReasons.includes("combination") && (
              <p>
                There are no courses available for your grade and education
                system.
              </p>
            )}

            {emptyReasons.length === 0 && (
              <p>
                There are currently no courses available. Please check again
                later.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void fetchCourses()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
          >
            <RefreshCw size={16} />
            Refresh Courses
          </button>
        </div>
      )}

      {/* Course Grid */}
      {!isLoading && !error && courses.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => {
            return (
              <article
                key={course.id}
                className="group overflow-hidden rounded-md border bg-white transition-all duration-150"
              >
                {/* Thumbnail */}
                <CourseImage
                  thumbnail={course.thumbnail}
                  title={course.title}
                />

                {/* Content */}
                <div className="flex h-max flex-col p-5">
                  {/* Title */}
                  <h2 className="line-clamp-2 text-xl font-bold text-zinc-900">
                    {course.title}
                  </h2>

                  {/* Description */}
                  <p className="mt-2 line-clamp-3 min-h-[60px] text-sm leading-6 text-zinc-600">
                    {course.shortDescription ||
                      "Explore this course and start learning new skills."}
                  </p>
                </div>

                <button onClick={() => handleRedirectUserToDetails(course?.id)} className="bg-black uppercase text-white flex items-center justify-center text-center gap-2 transition-all ease-linear hover:bg-black/80 font-semibold cursor-pointer py-3 px-3 w-full rounded">
                  <CornerUpRight size={18} /> explore course
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default Courses;
