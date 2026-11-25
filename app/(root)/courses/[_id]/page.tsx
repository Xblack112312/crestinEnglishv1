import { Suspense } from "react";
import CourseDetailsClient, { CourseSkeleton } from "./CourseDetailsClient";

export default function CourseDetailsPage() {
  return (
    <main className="min-h-screen bg-white">
      <Suspense fallback={<CourseSkeleton />}>
        <CourseDetailsClient />
      </Suspense>
    </main>
  );
}