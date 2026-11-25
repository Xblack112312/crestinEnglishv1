import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Enrollment, EnrollmentStatus } from "@/constants";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<EnrollmentStatus, string> = {
  Active:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  Completed:
    "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Pending:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
};

// Fixed locale + UTC so server and client always render the same string.
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const formatDate = (iso: string) => dateFormatter.format(new Date(`${iso}T00:00:00Z`));

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export function RecentEnrollments({ data }: { data: Enrollment[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Recent Enrollments
        </CardTitle>
        <CardDescription>
          View the latest students enrolled in your courses.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-0">
        {/* The Table component already wraps itself in an overflow-x container. */}
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4 text-xs font-medium text-muted-foreground sm:pl-6">
                Student
              </TableHead>
              <TableHead className="hidden text-xs font-medium text-muted-foreground md:table-cell">
                Course
              </TableHead>
              <TableHead className="hidden text-xs font-medium text-muted-foreground xl:table-cell">
                Enrolled
              </TableHead>
              <TableHead className="hidden text-xs font-medium text-muted-foreground sm:table-cell">
                Progress
              </TableHead>
              <TableHead className="pr-4 text-right text-xs font-medium text-muted-foreground sm:pr-6">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-[200px] py-3 pl-4 sm:max-w-[280px] sm:pl-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback className="text-xs font-medium">
                        {getInitials(row.student)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.student}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {/* Course moves under the name when its column is hidden */}
                        <span className="md:hidden">{row.course}</span>
                        <span className="hidden md:inline">{row.email}</span>
                      </p>
                    </div>
                  </div>
                </TableCell>

                <TableCell className="hidden max-w-[220px] md:table-cell">
                  <span className="block truncate text-sm">{row.course}</span>
                </TableCell>

                <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground xl:table-cell">
                  <time dateTime={row.enrolledAt}>
                    {formatDate(row.enrolledAt)}
                  </time>
                </TableCell>

                <TableCell className="hidden sm:table-cell">
                  <div className="flex items-center gap-2">
                    <Progress
                      value={row.progress}
                      aria-label={`${row.student} progress`}
                      className="h-1.5 w-16 lg:w-24"
                    />
                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                      {row.progress}%
                    </span>
                  </div>
                </TableCell>

                <TableCell className="pr-4 text-right sm:pr-6">
                  <Badge
                    variant="outline"
                    className={cn("font-medium", STATUS_STYLES[row.status])}
                  >
                    {row.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}