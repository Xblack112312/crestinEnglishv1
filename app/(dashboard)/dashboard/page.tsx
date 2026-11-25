import Link from "next/link";
import { PlusCircle } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DeferredEnrollmentsChart } from "@/components/DeferredEnrollmentsChart";
import { chartData, enrollments } from "@/constants";
import { RecentEnrollments } from "@/components/RecentEnrollments";

const OverviewPage = () => {
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Overview</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
            <p className="text-sm text-muted-foreground">
              Monitor your courses and student enrollments.
            </p>
          </div>

          <Button asChild className="h-11 w-full hover:underline sm:h-9 sm:w-auto">
            <Link href="/dashboard/courses/add-course">
              <PlusCircle aria-hidden />
              Add Course
            </Link>
          </Button>
        </div>
      </header>

      {/* Chart */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">
            Course Enrollments
          </CardTitle>
          <CardDescription>
            Track student enrollments across your courses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeferredEnrollmentsChart data={chartData} />
        </CardContent>
      </Card>

      {/* Table */}
      <RecentEnrollments data={enrollments} />
    </div>
  );
};

export default OverviewPage;
