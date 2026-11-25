"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { EnrollmentTrendPoint } from "@/constants";

// Zinc scale, matching the neutral palette. Literal values keep this
// independent of whether the theme stores colors as hsl() or oklch().
const chartConfig = {
  enrollments: {
    label: "Enrollments",
    theme: { light: "#27272A", dark: "#E4E4E7" },
  },
} satisfies ChartConfig;

export function EnrollmentsChart({ data }: { data: EnrollmentTrendPoint[] }) {
  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-[240px] w-full sm:h-[280px]"
    >
      <LineChart
        accessibilityLayer
        data={data}
        margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tick={{ fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={36}
          tickMargin={4}
          tick={{ fontSize: 12 }}
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={{ stroke: "currentColor", strokeOpacity: 0.15 }}
          content={<ChartTooltipContent indicator="line" />}
        />
        <Line
          type="monotone"
          dataKey="enrollments"
          stroke="var(--color-enrollments)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-enrollments)", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartContainer>
  );
}