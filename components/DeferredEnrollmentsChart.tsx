"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type { EnrollmentTrendPoint } from "@/constants";

const EnrollmentsChart = dynamic(
  () =>
    import("@/components/EnrollmentsChart").then(
      (module) => module.EnrollmentsChart,
    ),
  { ssr: false, loading: ChartPlaceholder },
);

function ChartPlaceholder() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading enrollments chart"
      className="h-[240px] w-full animate-pulse rounded-md bg-muted/60 sm:h-[280px]"
    />
  );
}

export function DeferredEnrollmentsChart({
  data,
}: {
  data: EnrollmentTrendPoint[];
}) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "256px 0px" },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef}>
      {shouldLoad ? <EnrollmentsChart data={data} /> : <ChartPlaceholder />}
    </div>
  );
}
