"use client";

/* =============================================================================
 * ALL COURSES — Admin Dashboard (single-file implementation)
 * =============================================================================
 *
 * HOW THIS FILE IS ORGANIZED (search for the "▌" banners to jump around)
 *
 *   1. ROUTES & CONFIG ........ the only place you need to touch for routes
 *   2. TYPES .................. Course (matches the admin courses API)
 *   3. LABELS ................. status and education-system labels
 *   4. HELPERS ................ date/grade formatting, hooks
 *   5. SMALL UI PIECES ........ status badge, thumbnail, empty state, skeletons
 *   6. LISTING ................ the course row (table/list hybrid)
 *   7. DETAILS PANEL .......... shared by the desktop Sheet AND the mobile Drawer
 *        - header, action bar, tabs (Overview / Content / Analytics / Notes)
 *        - edit form saved through the admin course API
 *   8. PAGE COMPONENT ......... state, filtering, Sheet/Drawer, confirm dialogs
 *
 * DESIGN NOTES
 *   - Only shadcn design tokens are used (border, muted, primary, foreground…)
 *     so the page inherits the exact same look as your Add Course page.
 *   - Animation is intentionally minimal (no motion libraries, no flourishes).
 *   - Course records come from GET /api/admin/courses.
 *   - Modules and lessons come from GET /api/admin/courses/:id/content.
 *   - Edit, publish, unpublish, and delete call the matching admin APIs.
 *
 * RESPONSIVE STRATEGY
 *   - < 768px  : compact rows + bottom Drawer (snap points: 60% → 96%)
 *   - ≥ 768px  : right-side Sheet
 *   - ≥ 1024px : listing gains full table columns (audience, status, etc.)
 * ========================================================================== */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  CircleDashed,
  CirclePlus,
  EyeOff,
  FilterX,
  ImageOff,
  Inbox,
  Layers,
  LibraryBig,
  Link2,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/* ▌1. ROUTES & CONFIG ======================================================= */

/**
 * ⚠️ I could not see your Add Course page or router, so these two paths are
 * PLACEHOLDERS. Replace them with your real routes (one-line change each).
 */
const ROUTES = {
  dashboard: "/dashboard",
  courses: "/dashboard/courses",
  addCourse: "/dashboard/courses/add-course",
} as const;

/**
 * No edit route was supplied, so this is `null` and the page uses the local
 * frontend-only edit form. If you later have a real edit page, set e.g.:
 *   const EDIT_ROUTE = (id: string) => `/dashboard/courses/${id}/edit`;
 * and the Edit button automatically becomes a link.
 */
const EDIT_ROUTE = null as ((courseId: string) => string) | null;

/** Mobile Drawer snap points: first = initial (60%), last = expanded (96%). */
const SNAP_POINTS = [0.6, 0.96] as const;

/** Height of the Drawer drag handle area (used to size the Drawer's content). */
const DRAWER_HANDLE_REM = 1.5;

const ALL_GRADES = [7, 8, 9, 10, 11, 12] as const;

/* ▌2. TYPES ================================================================= */

type CourseStatus = "draft" | "published" | "archived";
type EducationSystem = "general" | "azhar";

/** Mirrors your Mongoose Course model EXACTLY. Nothing extra is added here. */
interface Course {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  thumbnail: string;
  thumbnailPublicId: string;
  targetGrades: number[];
  targetEducationSystems: EducationSystem[];
  learningOutcomes: string[];
  requirements: string[];
  status: CourseStatus;
  publishedAt: string | null;
  publishedBy: AdminSummary | null;
  createdBy: AdminSummary | null;
  updatedBy: AdminSummary | null;
  createdAt: string;
  updatedAt: string;
  moduleCount: number;
  lessonCount: number;
}

type ContentLessonType = "reading" | "quiz" | "video";

interface ContentLesson {
  _id: string;
  moduleId: string;
  title: string;
  order: number;
  type: ContentLessonType;
}

interface ContentModule {
  _id: string;
  title: string;
  description: string;
  order: number;
  lessons: ContentLesson[];
}

interface AdminSummary {
  id: string;
  name: string;
  email: string;
}

/** The fields the edit form is allowed to change. */
type CoursePatch = Pick<
  Course,
  | "title"
  | "slug"
  | "shortDescription"
  | "description"
  | "targetGrades"
  | "targetEducationSystems"
  | "learningOutcomes"
  | "requirements"
>;

/* ▌3. LABELS ================================================================ */

const adminName = (admin: AdminSummary | null) => admin?.name ?? "—";

const SYSTEM_LABEL: Record<EducationSystem, string> = {
  general: "General",
  azhar: "Al-Azhar",
};

/* ▌4. HELPERS =============================================================== */

/* Dates are formatted in UTC with a fixed locale to avoid hydration mismatches. */
const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const formatDate = (iso: string | null) =>
  iso ? dateFmt.format(new Date(iso)) : "—";

/** [8,9,10] → "Grades 8–10"; [7,9] → "Grades 7, 9"; [11] → "Grade 11" */
function formatGrades(grades: number[]): string {
  const s = [...grades].sort((a, b) => a - b);
  if (s.length === 0) return "No grades";
  if (s.length === 1) return `Grade ${s[0]}`;
  const contiguous = s.every((g, i) => i === 0 || g === s[i - 1] + 1);
  return contiguous
    ? `Grades ${s[0]}–${s[s.length - 1]}`
    : `Grades ${s.join(", ")}`;
}

const formatSystems = (systems: EducationSystem[]) =>
  systems.length
    ? systems.map((s) => SYSTEM_LABEL[s]).join(", ")
    : "No systems";

const pad = (n: number) => String(n).padStart(2, "0");
const pluralize = (n: number, word: string) =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function normalizeCourse(course: Course): Course {
  return {
    ...course,
    shortDescription: course.shortDescription ?? "",
    description: course.description ?? "",
    thumbnail: course.thumbnail ?? "",
    thumbnailPublicId: course.thumbnailPublicId ?? "",
    targetGrades: course.targetGrades ?? [],
    targetEducationSystems: course.targetEducationSystems ?? [],
    learningOutcomes: course.learningOutcomes ?? [],
    requirements: course.requirements ?? [],
    publishedAt: course.publishedAt ?? null,
    publishedBy: course.publishedBy ?? null,
    createdBy: course.createdBy ?? null,
    updatedBy: course.updatedBy ?? null,
    moduleCount: course.moduleCount ?? 0,
    lessonCount: course.lessonCount ?? 0,
  };
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

/**
 * Hydration-safe media query hook.
 * Server snapshot is always `false`; the client corrects it right after hydration.
 */
function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/* ---- Filter / sort options -------------------------------------------------- */

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];
const GRADE_OPTIONS = [
  { value: "all", label: "All grades" },
  ...ALL_GRADES.map((g) => ({ value: String(g), label: `Grade ${g}` })),
];
const SYSTEM_OPTIONS = [
  { value: "all", label: "All systems" },
  { value: "general", label: "General" },
  { value: "azhar", label: "Al-Azhar" },
];
const SORT_OPTIONS = [
  { value: "updated-desc", label: "Recently updated" },
  { value: "updated-asc", label: "Least recently updated" },
  { value: "title-asc", label: "Title A–Z" },
  { value: "title-desc", label: "Title Z–A" },
] as const;
type SortValue = (typeof SORT_OPTIONS)[number]["value"];

/* ▌5. SMALL UI PIECES ======================================================= */

/* ---- Status badge (icon + text, so it never relies on color alone) ---------- */
const STATUS_META: Record<
  CourseStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  published: {
    label: "Published",
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  draft: {
    label: "Draft",
    icon: CircleDashed,
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    className: "border-border bg-muted text-muted-foreground",
  },
};

function StatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const normalizedStatus =
    typeof status === "string" ? status.trim().toLowerCase() : "";

  const meta = STATUS_META[normalizedStatus as CourseStatus];

  // Prevent unexpected API values from crashing the page.
  if (!meta) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 rounded-md border-border bg-muted text-muted-foreground",
          className,
        )}
        title={`Unexpected course status: ${status ?? "undefined"}`}
      >
        {status?.trim() || "Unknown status"}
      </Badge>
    );
  }

  const { label, icon: Icon, className: tone } = meta;

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 rounded-md font-medium", tone, className)}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </Badge>
  );
}

/* ---- Thumbnail with placeholder (no image, or image failed to load) --------- */
function CourseThumb({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground",
        className,
      )}
    >
      {showImage ? (
        // Plain <img> keeps this file free of next.config image-domain setup.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <ImageOff className="size-4" aria-label="No thumbnail" />
      )}
    </div>
  );
}

/* ---- Reusable empty state (each usage passes its OWN specific copy) --------- */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-dashed text-center",
        compact ? "gap-1.5 px-4 py-5" : "gap-2 px-6 py-14",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
          compact ? "size-8" : "size-12",
        )}
      >
        <Icon className={compact ? "size-4" : "size-5"} aria-hidden />
      </div>
      <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>
        {title}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---- Section wrapper used inside the details panel -------------------------- */
function Section({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/* ---- Skeletons -------------------------------------------------------------- */

/** Skeleton row — same proportions as <CourseRow />, so nothing jumps on load. */
function CourseRowSkeleton() {
  return (
    <li className="flex items-center gap-3 px-3 py-3 sm:px-4">
      <Skeleton className="size-12 shrink-0 rounded-md sm:size-14" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3 max-w-xs" />
        <Skeleton className="h-3 w-full max-w-md" />
        <div className="flex gap-2 lg:hidden">
          <Skeleton className="h-5 w-20 rounded-md" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="hidden h-3 w-40 lg:block" />
      </div>
      <div className="hidden items-center gap-4 lg:flex">
        <Skeleton className="h-5 w-24 rounded-md" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
    </li>
  );
}

/** Header skeleton for the details panel. */
function HeaderSkeleton({ withActions }: { withActions: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Skeleton className="size-14 shrink-0 rounded-md sm:size-16" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded-md" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
      {withActions && (
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
        </div>
      )}
    </div>
  );
}

/** Body skeleton: glance strip + tabs + overview/audience/outcomes shapes. */
function BodySkeleton() {
  return (
    <div
      className="space-y-6"
      aria-busy="true"
      aria-label="Loading course details"
    >
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-20 rounded-md" />
          <Skeleton className="h-6 w-20 rounded-md" />
          <Skeleton className="h-6 w-20 rounded-md" />
          <Skeleton className="h-6 w-24 rounded-md" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/* ▌6. LISTING =============================================================== */

/** Shared column widths so the header row and every course row line up (lg+). */
const COL = {
  status: "w-28",
  students: "w-28",
  content: "w-24",
  updated: "w-28",
} as const;

/** Header row for the table/list hybrid (hidden below lg). */
function ListHeader() {
  return (
    <div className="hidden items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground lg:flex">
      <div className="w-14 shrink-0" aria-hidden />
      <div className="flex-1">Course</div>
      <div className={COL.status}>Status</div>
      <div className={COL.students}>Audience</div>
      <div className={COL.content}>Content</div>
      <div className={COL.updated}>Updated</div>
      <div className="w-4" aria-hidden />
    </div>
  );
}

/**
 * One course row.
 *
 * ACCESSIBILITY: the title is a real <button>. Its ::after pseudo-element is
 * stretched over the whole row, so clicking ANYWHERE opens the details while
 * keyboard users get a single, properly-labelled tab stop. (No nested
 * interactive elements → no invalid HTML.)
 */
function CourseRow({
  course,
  selected,
  onOpen,
}: {
  course: Course;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <li
      className={cn(
        "group relative flex items-center gap-3 px-3 py-3 transition-colors sm:px-4",
        "hover:bg-muted/50 focus-within:bg-muted/50",
        selected && "bg-muted/70",
      )}
    >
      <CourseThumb src={course.thumbnail} className="size-12 sm:size-14" />

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(course.id)}
          aria-haspopup="dialog"
          aria-label={`Open details for ${course.title}`}
          className={cn(
            "block max-w-full truncate text-left text-sm font-medium outline-none",
            // stretched click target + visible keyboard focus ring
            "after:absolute after:inset-0 after:content-['']",
            "focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring",
          )}
        >
          {course.title}
        </button>

        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:text-sm">
          {course.shortDescription}
        </p>

        {/* Audience — always visible, compact */}
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {formatGrades(course.targetGrades)} ·{" "}
          {formatSystems(course.targetEducationSystems)}
        </p>

        {/* Mobile / tablet meta line (replaced by columns at lg+) */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground lg:hidden">
          <StatusBadge status={course.status} />
          <span>
            {course.moduleCount}M · {course.lessonCount}L
          </span>
        </div>
      </div>

      {/* Desktop columns */}
      <div className={cn("hidden lg:block", COL.status)}>
        <StatusBadge status={course?.status} />
      </div>
      <div className={cn("hidden text-sm lg:block", COL.students)}>
        <p className="truncate">{formatGrades(course.targetGrades)}</p>
      </div>
      <div className={cn("hidden text-sm lg:block", COL.content)}>
        <p className="tabular-nums">
          {pluralize(course.moduleCount, "module")}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {pluralize(course.lessonCount, "lesson")}
        </p>
      </div>
      <div
        className={cn(
          "hidden text-xs text-muted-foreground lg:block",
          COL.updated,
        )}
      >
        {formatDate(course.updatedAt)}
      </div>

      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
        aria-hidden
      />
    </li>
  );
}

/** Compact labelled <Select> used by the toolbar. */
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ▌7. DETAILS PANEL ========================================================= */
/* One panel component is rendered inside BOTH the Sheet and the Drawer, so the
 * two experiences always show identical information.                          */

/* ---- Action bar: Edit / status action / Delete ------------------------------ */
function ActionBar({
  course,
  compact,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  course: Course;
  /** compact = 3 equal buttons for the mobile sticky footer */
  compact: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: () => void;
}) {
  const btn = compact ? "h-10 w-full px-2 text-xs" : "";
  const editHref = EDIT_ROUTE ? EDIT_ROUTE(course.id) : null;

  return (
    <div
      className={cn(
        compact
          ? "grid grid-cols-3 gap-2"
          : "flex flex-wrap items-center gap-2",
      )}
    >
      {/* Edit: real link if you configured EDIT_ROUTE, otherwise local edit mode */}
      {editHref ? (
        <Button asChild variant="outline" size="sm" className={btn}>
          <Link href={editHref}>
            <Pencil aria-hidden /> {compact ? "Edit" : "Edit Course"}
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" className={btn} onClick={onEdit}>
          <Pencil aria-hidden /> {compact ? "Edit" : "Edit Course"}
        </Button>
      )}

      {/* Status action adapts to the current status */}
      {course.status === "published" && (
        <Button
          variant="outline"
          size="sm"
          className={btn}
          onClick={onStatusChange}
        >
          <EyeOff aria-hidden /> {compact ? "Draft" : "Set to Draft"}
        </Button>
      )}
      {course.status === "archived" && (
        <Button
          variant="outline"
          size="sm"
          className={btn}
          onClick={onStatusChange}
        >
          <ArchiveRestore aria-hidden />{" "}
          {compact ? "Restore" : "Restore as Draft"}
        </Button>
      )}
      {course.status === "draft" && (
        <Button
          variant="outline"
          size="sm"
          className={btn}
          onClick={onStatusChange}
        >
          <CheckCircle2 aria-hidden /> {compact ? "Publish" : "Publish Course"}
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        className={cn(
          "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive",
          btn,
        )}
        onClick={onDelete}
      >
        <Trash2 aria-hidden /> {compact ? "Delete" : "Delete Course"}
      </Button>
    </div>
  );
}

/* ---- Overview tab ----------------------------------------------------------- */
function OverviewTab({ course }: { course: Course }) {
  const combos =
    course.targetGrades.length * course.targetEducationSystems.length;

  return (
    <div className="space-y-7">
      {/* Basic information */}
      <Section title="Basic information">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Title</dt>
            <dd className="font-medium">{course.title}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Slug</dt>
            <dd className="break-all font-mono text-xs">{course.slug}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Short description</dt>
            <dd>{course.shortDescription || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Full description</dt>
            <dd className="whitespace-pre-line text-muted-foreground">
              {course.description ||
                "No full description has been written yet."}
            </dd>
          </div>
        </dl>
      </Section>

      <hr />

      {/* Target audience: arrays are INDEPENDENT → every grade × system combo */}
      <Section
        title="Target audience"
        description={
          combos > 0
            ? `Applies to every combination: ${pluralize(course.targetGrades.length, "grade")} × ${pluralize(course.targetEducationSystems.length, "system")} = ${pluralize(combos, "audience")}.`
            : "No audience selected yet."
        }
      >
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Grades</p>
            <div className="flex flex-wrap gap-1.5">
              {[...course.targetGrades]
                .sort((a, b) => a - b)
                .map((g) => (
                  <Badge key={g} variant="secondary" className="rounded-md">
                    Grade {g}
                  </Badge>
                ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Education systems
            </p>
            <div className="flex flex-wrap gap-1.5">
              {course.targetEducationSystems.map((s) => (
                <Badge key={s} variant="outline" className="rounded-md">
                  {SYSTEM_LABEL[s]}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <hr />

      {/* Learning outcomes */}
      <Section
        title="Learning outcomes"
        description="What students will be able to do."
      >
        {course.learningOutcomes.length === 0 ? (
          <EmptyState
            compact
            icon={ListChecks}
            title="No learning outcomes yet"
            description="Add outcomes so students know what they will achieve before they enroll."
          />
        ) : (
          <ul className="space-y-2">
            {course.learningOutcomes.map((o, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Requirements */}
      <Section
        title="Requirements"
        description="What students should know first."
      >
        {course.requirements.length === 0 ? (
          <EmptyState
            compact
            icon={CheckCircle2}
            title="No prerequisites"
            description="Students can start this course without any prior knowledge."
          />
        ) : (
          <ul className="space-y-2">
            {course.requirements.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/60"
                  aria-hidden
                />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <hr />

      {/* Publication & audit information */}
      <Section title="Publication and audit">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {[
            ["Status", STATUS_META[course.status]?.label],
            ["Published", formatDate(course.publishedAt)],
            ["Published by", adminName(course.publishedBy)],
            ["Created", formatDate(course.createdAt)],
            ["Created by", adminName(course.createdBy)],
            ["Last updated", formatDate(course.updatedAt)],
            ["Last updated by", adminName(course.updatedBy)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

/* ---- Content tab: expandable curriculum outline (NO video players) ---------- */

const LESSON_TYPE_META: Record<
  ContentLessonType,
  { label: string; icon: LucideIcon }
> = {
  reading: { label: "Reading", icon: BookOpen },
  quiz: { label: "Quiz", icon: ListChecks },
  video: { label: "Video", icon: Video },
};

function ContentTab({ courseId }: { courseId: string }) {
  const [modules, setModules] = useState<ContentModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadContent() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/courses/${courseId}/content`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          error?: string;
          modules?: Array<Omit<ContentModule, "lessons">>;
          lessons?: ContentLesson[];
        };
        if (!response.ok || !data.modules || !data.lessons) {
          throw new Error(data.error ?? "Unable to load course content.");
        }

        const lessonsByModule = new Map<string, ContentLesson[]>();
        for (const lesson of data.lessons) {
          const lessons = lessonsByModule.get(lesson.moduleId) ?? [];
          lessons.push(lesson);
          lessonsByModule.set(lesson.moduleId, lessons);
        }
        setModules(
          data.modules.map((courseModule) => ({
            ...courseModule,
            lessons: lessonsByModule.get(courseModule._id) ?? [],
          })),
        );
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load course content.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadContent();
    return () => controller.abort();
  }, [courseId]);

  const orderedModules = useMemo(
    () => [...modules].sort((a, b) => a.order - b.order),
    [modules],
  );
  const totalLessons = orderedModules.reduce((n, m) => n + m.lessons.length, 0);

  // First module is open by default; admins can expand/collapse any module.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const allOpen =
    orderedModules.length > 0 && expanded.size === orderedModules.length;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Couldn't load content"
        description={error}
      />
    );
  }

  if (orderedModules.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No modules yet"
        description="This course has no content structure. Modules and lessons will appear here once they are added."
      />
    );
  }

  return (
    <Section
      title="Course content"
      description={`${pluralize(orderedModules.length, "module")} · ${pluralize(totalLessons, "lesson")}`}
      aside={
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setExpanded(
              allOpen ? new Set() : new Set(orderedModules.map((m) => m._id)),
            )
          }
        >
          {allOpen ? <ChevronsUp aria-hidden /> : <ChevronsDown aria-hidden />}
          {allOpen ? "Collapse all" : "Expand all"}
        </Button>
      }
    >
      <ol className="space-y-2">
        {orderedModules.map((m, moduleIndex) => {
          const isOpen = expanded.has(m._id);
          return (
            <li key={m._id} className="rounded-lg border">
              <button
                type="button"
                onClick={() => toggle(m._id)}
                aria-expanded={isOpen}
                aria-controls={`${m._id}-panel`}
                className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground",
                    isOpen && "rotate-90",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted-foreground">
                    Module {pad(moduleIndex + 1)}
                  </span>
                  <span className="block break-words text-sm font-medium">
                    {m.title}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {pluralize(m.lessons.length, "lesson")}
                </span>
              </button>

              {isOpen && (
                <div
                  id={`${m._id}-panel`}
                  className="space-y-3 border-t px-3 pb-3 pt-3"
                >
                  {m.description && (
                    <p className="text-xs text-muted-foreground">
                      {m.description}
                    </p>
                  )}
                  {m.lessons.length === 0 ? (
                    <EmptyState
                      compact
                      icon={BookOpen}
                      title="No lessons in this module"
                      description="Lessons added to this module will be listed here in order."
                    />
                  ) : (
                    <ol className="divide-y rounded-md border">
                      {[...m.lessons]
                        .sort((a, b) => a.order - b.order)
                        .map((l, lessonIndex) => {
                          const meta = LESSON_TYPE_META[l.type] ?? {
                            label: l.type,
                            icon: BookOpen,
                          };
                          return (
                            <li
                              key={l._id}
                              className="flex items-center gap-3 px-3 py-2.5"
                            >
                              <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">
                                {pad(lessonIndex + 1)}
                              </span>
                              <span className="min-w-0 flex-1 break-words text-sm">
                                {l.title}
                              </span>
                              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                <meta.icon className="size-3.5" aria-hidden />
                                <span className="hidden min-[400px]:inline">
                                  {meta.label}
                                </span>
                              </span>
                            </li>
                          );
                        })}
                    </ol>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

/* ---- Analytics tab ---------------------------------------------------------- */

function AnalyticsTab() {
  return (
    <EmptyState
      icon={BarChart3}
      title="No student activity yet"
      description="Enrollment and progress figures will appear here once a student analytics API is connected. Course details and lesson content on this page already come from the live course APIs."
    />
  );
}

/* ---- Notes tab -------------------------------------------------------------- */
function NotesTab() {
  return (
    <Section
      title="Administrative notes"
      description="Internal only. Notes are never shown to students."
    >
      <EmptyState
        compact
        icon={StickyNote}
        title="No internal notes yet"
        description="There is no notes API yet, so this course has no stored administrative notes to show."
      />
    </Section>
  );
}

/* ---- Frontend-only edit form ------------------------------------------------ */
function CourseEditForm({
  course,
  onCancel,
  onSave,
}: {
  course: Course;
  onCancel: () => void;
  onSave: (patch: CoursePatch) => Promise<void>;
}) {
  // Local draft state, initialised once from the selected course.
  const [title, setTitle] = useState(course.title);
  const [slug, setSlug] = useState(course.slug);
  const [shortDescription, setShortDescription] = useState(
    course.shortDescription,
  );
  const [description, setDescription] = useState(course.description);
  const [outcomes, setOutcomes] = useState(course.learningOutcomes.join("\n"));
  const [requirements, setRequirements] = useState(
    course.requirements.join("\n"),
  );
  const [grades, setGrades] = useState<number[]>(course.targetGrades);
  const [systems, setSystems] = useState<EducationSystem[]>(
    course.targetEducationSystems,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleGrade = (g: number) =>
    setGrades((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  const toggleSystem = (s: EducationSystem) =>
    setSystems((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  const lines = (text: string) =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug = slugify(slug || title);
    if (title.trim().length < 3)
      return setError("Title must be at least 3 characters.");
    if (!cleanSlug) return setError("Slug is required.");
    if (grades.length === 0) return setError("Select at least one grade.");
    if (systems.length === 0)
      return setError("Select at least one education system.");
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        slug: cleanSlug,
        shortDescription: shortDescription.trim(),
        description: description.trim(),
        targetGrades: [...grades].sort((a, b) => a - b),
        targetEducationSystems: systems,
        learningOutcomes: lines(outcomes),
        requirements: lines(requirements),
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save this course.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="edit-title">Title</Label>
        <Input
          id="edit-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-slug">Slug</Label>
        <Input
          id="edit-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="font-mono text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-short">Short description</Label>
        <Textarea
          id="edit-short"
          rows={2}
          value={shortDescription}
          onChange={(e) => setShortDescription(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-desc">Full description</Label>
        <Textarea
          id="edit-desc"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Target grades</legend>
        <div className="flex flex-wrap gap-2">
          {ALL_GRADES.map((g) => (
            <Button
              key={g}
              type="button"
              size="sm"
              variant={grades.includes(g) ? "default" : "outline"}
              aria-pressed={grades.includes(g)}
              onClick={() => toggleGrade(g)}
            >
              {g}
            </Button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Education systems</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SYSTEM_LABEL) as EducationSystem[]).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={systems.includes(s) ? "default" : "outline"}
              aria-pressed={systems.includes(s)}
              onClick={() => toggleSystem(s)}
            >
              {SYSTEM_LABEL[s]}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="edit-outcomes">Learning outcomes</Label>
        <Textarea
          id="edit-outcomes"
          rows={4}
          value={outcomes}
          onChange={(e) => setOutcomes(e.target.value)}
          placeholder="One outcome per line"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-req">Requirements</Label>
        <Textarea
          id="edit-req"
          rows={3}
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          placeholder="One requirement per line"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Sticky Save / Cancel so they're always reachable while scrolling */}
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background px-4 py-3 sm:-mx-6 sm:px-6">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

/* ---- The details panel itself ----------------------------------------------- */
interface DetailsPanelProps {
  variant: "sheet" | "drawer";
  course: Course;
  editing: boolean;
  scrollable: boolean;
  headerActions?: React.ReactNode;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: CoursePatch) => Promise<void>;
  onDelete: () => void;
  onStatusChange: () => void;
}

function DetailsPanel({
  variant,
  course,
  editing,
  scrollable,
  headerActions,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onStatusChange,
}: DetailsPanelProps) {
  const TitleComp = variant === "sheet" ? SheetTitle : DrawerTitle;
  const DescComp = variant === "sheet" ? SheetDescription : DrawerDescription;

  const glance = [
    { label: "Modules", value: course.moduleCount },
    { label: "Lessons", value: course.lessonCount },
    { label: "Grades", value: course.targetGrades.length },
    { label: "Outcomes", value: course.learningOutcomes.length },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="relative shrink-0 border-b px-4 pb-4 pt-3 sm:px-6 sm:pt-6">
        {headerActions && (
          <div className="absolute right-3 top-2 flex items-center gap-1">
            {headerActions}
          </div>
        )}

        <div className="space-y-4">
          <div
            className={cn(
              "flex gap-3",
              variant === "drawer" ? "pr-20" : "pr-8",
            )}
          >
            <CourseThumb
              src={course.thumbnail}
              className="size-14 sm:size-16"
            />
            <div className="min-w-0 flex-1">
              <TitleComp className="break-words text-base font-semibold leading-snug sm:text-lg">
                {course.title}
              </TitleComp>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <StatusBadge status={course.status} />
                <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <Link2 className="size-3 shrink-0" aria-hidden />
                  <span className="truncate font-mono">{course.slug}</span>
                </span>
              </div>
              <DescComp className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                {course.shortDescription}
              </DescComp>
            </div>
          </div>

          {variant === "sheet" && !editing && (
            <ActionBar
              course={course}
              compact={false}
              onEdit={onEdit}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
            />
          )}
        </div>
      </div>

      {/* ── Scrollable body ────────────────────────────────────── */}
      <div
        className={cn(
          "min-h-0 flex-1 overscroll-contain px-4 py-5 sm:px-6",
          scrollable ? "overflow-y-auto" : "overflow-hidden",
        )}
      >
        {editing ? (
          <CourseEditForm
            course={course}
            onCancel={onCancelEdit}
            onSave={onSave}
          />
        ) : (
          <div className="space-y-6">
            <dl className="grid grid-cols-4 divide-x rounded-lg border">
              {glance.map((g) => (
                <div key={g.label} className="px-2 py-2.5 text-center sm:px-3">
                  <dd className="text-lg font-semibold tabular-nums sm:text-xl">
                    {g.value}
                  </dd>
                  <dt className="truncate text-[11px] text-muted-foreground sm:text-xs">
                    {g.label}
                  </dt>
                </div>
              ))}
            </dl>

            <Tabs defaultValue="overview" className="gap-5">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger
                  value="overview"
                  className="px-1 text-xs sm:text-sm"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="content"
                  className="px-1 text-xs sm:text-sm"
                >
                  Content
                </TabsTrigger>
                <TabsTrigger
                  value="analytics"
                  className="px-1 text-xs sm:text-sm"
                >
                  Analytics
                </TabsTrigger>
                <TabsTrigger value="notes" className="px-1 text-xs sm:text-sm">
                  Notes
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <OverviewTab course={course} />
              </TabsContent>
              <TabsContent value="content">
                <ContentTab courseId={course.id} />
              </TabsContent>
              <TabsContent value="analytics">
                <AnalyticsTab />
              </TabsContent>
              <TabsContent value="notes">
                <NotesTab />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* ── Mobile sticky action footer ─────────────────────────── */}
      {variant === "drawer" && !editing && (
        <div className="shrink-0 border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <ActionBar
            course={course}
            compact
            onEdit={onEdit}
            onDelete={onDelete}
            onStatusChange={onStatusChange}
          />
        </div>
      )}
    </div>
  );
}

/* ▌8. PAGE COMPONENT ======================================================== */

export default function AllCoursesPage() {
  /* ---- Data ---- */
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  /* ---- Toolbar state ---- */
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [systemFilter, setSystemFilter] = useState("all");
  const [sort, setSort] = useState<SortValue>("updated-desc");
  const [showFilters, setShowFilters] = useState(false); // mobile filter panel

  /* ---- Details state (shared by Sheet + Drawer) ---- */
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedId = searchParams.get("course");

  const [editing, setEditing] = useState(false);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);

  /* ---- Confirmation dialogs ---- */
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [statusTarget, setStatusTarget] = useState<Course | null>(null);
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  /** Desktop/tablet (≥768px) → Sheet. Below → Drawer. */
  const isWide = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    const controller = new AbortController();

    async function fetchCourses() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch("/api/admin/courses", {
          cache: "no-store",
          signal: controller.signal,
        });

        const result = (await response.json()) as {
          error?: string;
          courses?: Course[];
        };

        if (!response.ok) {
          throw new Error(result.error || "Failed to load courses.");
        }

        if (!Array.isArray(result.courses)) {
          throw new Error("Invalid courses response.");
        }

        setCourses(result.courses.map(normalizeCourse));
      } catch (error) {
        if (controller.signal.aborted) return;

        setLoadError(
          error instanceof Error
            ? error.message
            : "Something went wrong while loading courses.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void fetchCourses();

    return () => controller.abort();
  }, [reloadKey]);

  /* ---- Derived: the selected course always comes from the live list ---- */
  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedId) ?? null,
    [courses, selectedId],
  );

  const detailsOpen = Boolean(selectedId && selectedCourse);

  useEffect(() => {
    if (isLoading || loadError || !selectedId) {
      return;
    }

    const courseExists = courses.some((course) => course.id === selectedId);

    if (!courseExists) {
      router.replace(ROUTES.courses, { scroll: false });
    }
  }, [courses, isLoading, loadError, selectedId, router]);

  /* ---- Derived: filtered + sorted list ---- */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = courses.filter((c) => {
      if (q && !c.title.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (
        gradeFilter !== "all" &&
        !c.targetGrades.includes(Number(gradeFilter))
      )
        return false;
      if (
        systemFilter !== "all" &&
        !c.targetEducationSystems.includes(systemFilter as EducationSystem)
      )
        return false;
      return true;
    });

    return list.sort((a, b) => {
      switch (sort) {
        case "updated-asc":
          return a.updatedAt.localeCompare(b.updatedAt);
        case "title-asc":
          return a.title.localeCompare(b.title);
        case "title-desc":
          return b.title.localeCompare(a.title);
        default:
          return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
  }, [courses, search, statusFilter, gradeFilter, systemFilter, sort]);

  const hasFilters =
    statusFilter !== "all" || gradeFilter !== "all" || systemFilter !== "all";
  const activeFilterCount = [statusFilter, gradeFilter, systemFilter].filter(
    (v) => v !== "all",
  ).length;

  const resetFilters = () => {
    setStatusFilter("all");
    setGradeFilter("all");
    setSystemFilter("all");
    setSearch("");
  };

  /* ---- Details handlers ---- */
  const openCourse = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());

      params.set("course", id);

      router.push(`${ROUTES.courses}?${params.toString()}`, {
        scroll: false,
      });

      setEditing(false);
      setSnap(SNAP_POINTS[0]);
    },
    [router, searchParams],
  );

  const closeDetails = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());

    params.delete("course");

    const query = params.toString();

    router.replace(query ? `${ROUTES.courses}?${query}` : ROUTES.courses, {
      scroll: false,
    });

    setEditing(false);
  }, [router, searchParams]);

  const saveEdit = async (patch: CoursePatch) => {
    if (!selectedId) return;
    const data = await postJson<{
      course?: {
        title: string;
        slug: string;
        status: CourseStatus;
        updatedAt: string;
      };
    }>(`/api/admin/courses/${selectedId}`, { action: "update", ...patch });
    setCourses((prev) =>
      prev.map((course) =>
        course.id === selectedId
          ? normalizeCourse({
              ...course,
              ...patch,
              title: data.course?.title ?? patch.title,
              slug: data.course?.slug ?? patch.slug,
              status: data.course?.status ?? course.status,
              updatedAt: data.course?.updatedAt ?? new Date().toISOString(),
            })
          : course,
      ),
    );
    setEditing(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || mutating) return;
    const id = deleteTarget.id;
    setMutating(true);
    setMutationError(null);
    try {
      await postJson(`/api/admin/courses/${id}`, { action: "delete" });
      setCourses((prev) => prev.filter((course) => course.id !== id));
      closeDetails();
      setDeleteTarget(null);
    } catch (error) {
      setMutationError(
        error instanceof Error
          ? error.message
          : "Unable to delete this course.",
      );
    } finally {
      setMutating(false);
    }
  };

  const confirmStatusChange = async () => {
    if (!statusTarget || mutating) return;
    const id = statusTarget.id;
    const publishing = statusTarget.status === "draft";
    setMutating(true);
    setMutationError(null);
    try {
      if (publishing) {
        const data = await postJson<{ publishedAt?: string }>(
          `/api/admin/courses/${id}/publish`,
        );
        setCourses((prev) =>
          prev.map((course) =>
            course.id === id
              ? {
                  ...course,
                  status: "published",
                  publishedAt: data.publishedAt ?? new Date().toISOString(),
                  updatedAt: data.publishedAt ?? new Date().toISOString(),
                }
              : course,
          ),
        );
      } else {
        await postJson(`/api/admin/courses/${id}`, { action: "unpublish" });
        setCourses((prev) =>
          prev.map((course) =>
            course.id === id
              ? {
                  ...course,
                  status: "draft",
                  publishedAt: null,
                  publishedBy: null,
                  updatedAt: new Date().toISOString(),
                }
              : course,
          ),
        );
      }
      setStatusTarget(null);
    } catch (error) {
      setMutationError(
        error instanceof Error
          ? error.message
          : "Unable to update this course.",
      );
    } finally {
      setMutating(false);
    }
  };

  /* ---- Drawer helpers ---- */
  const snapNumber = typeof snap === "number" ? snap : SNAP_POINTS[0];
  const lastSnap = SNAP_POINTS[SNAP_POINTS.length - 1];
  const drawerExpanded = snapNumber === lastSnap;

  /** Props shared by the Sheet and Drawer versions of the panel. */
  const panelHandlers = {
    editing,
    onEdit: () => setEditing(true),
    onCancelEdit: () => setEditing(false),
    onSave: saveEdit,
    onDelete: () => {
      if (!selectedCourse) return;
      setMutationError(null);
      setDeleteTarget(selectedCourse);
    },
    onStatusChange: () => {
      if (!selectedCourse) return;
      setMutationError(null);
      setStatusTarget(selectedCourse);
    },
  };

  /* ---- Render ---- */
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-4 sm:p-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="space-y-3">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>
              <Link href={ROUTES.dashboard} className="hover:text-foreground">
                Dashboard
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3.5" />
            </li>
            <li aria-current="page" className="font-medium text-foreground">
              All Courses
            </li>
          </ol>
        </nav>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              All Courses
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              Manage your courses, explore student activity, and keep track of
              your learning content.
            </p>
          </div>
          <Button asChild className="w-full sm:w-auto">
            <Link href={ROUTES.addCourse}>
              <CirclePlus aria-hidden /> Add Course
            </Link>
          </Button>
        </div>
      </header>

      {/* ── Toolbar: search, filters, sort ─────────────────────── */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search courses by title"
              aria-label="Search courses by title"
              className="px-9"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Mobile-only toggle for the filter panel */}
          <Button
            variant="outline"
            className="sm:hidden"
            aria-expanded={showFilters}
            aria-controls="course-filters"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal aria-hidden /> Filters
            {activeFilterCount > 0 && (
              <Badge className="ml-0.5 size-5 justify-center rounded-full p-0">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* 2 columns on mobile (collapsible), 4 columns from sm+ (always visible) */}
        <div
          id="course-filters"
          className={cn(
            "grid-cols-2 gap-2 sm:grid sm:grid-cols-4",
            showFilters ? "grid" : "hidden",
          )}
        >
          <FilterSelect
            label="Filter by status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            label="Filter by grade"
            value={gradeFilter}
            onChange={setGradeFilter}
            options={GRADE_OPTIONS}
          />
          <FilterSelect
            label="Filter by education system"
            value={systemFilter}
            onChange={setSystemFilter}
            options={SYSTEM_OPTIONS}
          />
          <FilterSelect
            label="Sort courses"
            value={sort}
            onChange={(v) => setSort(v as SortValue)}
            options={SORT_OPTIONS}
          />
        </div>
      </div>

      {/* ── Listing ────────────────────────────────────────────── */}
      <section aria-label="Courses" className="space-y-2">
        {!isLoading && courses.length > 0 && (
          <p aria-live="polite" className="text-xs text-muted-foreground">
            Showing {filtered.length} of {courses.length} courses
          </p>
        )}

        {isLoading ? (
          <div
            className="overflow-hidden rounded-lg border"
            aria-busy="true"
            aria-label="Loading courses"
          >
            <ListHeader />
            <ul className="divide-y">
              {Array.from({ length: 6 }).map((_, i) => (
                <CourseRowSkeleton key={i} />
              ))}
            </ul>
          </div>
        ) : loadError ? (
          <EmptyState
            icon={Inbox}
            title="Couldn't load courses"
            description={loadError}
            action={
              <Button
                variant="outline"
                onClick={() => setReloadKey((current) => current + 1)}
              >
                <RefreshCw className="size-4" />
                Try Again
              </Button>
            }
          />
        ) : courses.length === 0 ? (
          /* No courses at all */
          <EmptyState
            icon={LibraryBig}
            title="No courses yet."
            description="Create your first course to start building lessons and reaching students."
            action={
              <Button asChild>
                <Link href={ROUTES.addCourse}>
                  <Plus aria-hidden /> Add Course
                </Link>
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          hasFilters ? (
            /* Filters (± search) matched nothing */
            <EmptyState
              icon={FilterX}
              title="No courses match these filters"
              description="Try a different status, grade, or education system, or reset the filters."
              action={
                <Button variant="outline" onClick={resetFilters}>
                  Reset Filters
                </Button>
              }
            />
          ) : (
            /* Search alone matched nothing */
            <EmptyState
              icon={SearchX}
              title="No courses match your search"
              description={`Nothing found for “${search.trim()}”. Check the spelling or try a shorter title.`}
              action={
                <Button variant="outline" onClick={() => setSearch("")}>
                  Clear Search
                </Button>
              }
            />
          )
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <ListHeader />
            <ul className="divide-y">
              {filtered.map((course) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  selected={detailsOpen && course.id === selectedId}
                  onOpen={openCourse}
                />
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── DESKTOP / TABLET: right-side Sheet ───────────────────
          The default shadcn SheetContent sets a narrow max width, so the
          width is overridden for the right side (680px → 720px at lg).  */}
      {isWide && (
        <Sheet
          open={detailsOpen}
          onOpenChange={(open) => {
            if (!open) closeDetails();
          }}
        >
          <SheetContent
            side="right"
            className="flex w-full flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[680px] data-[side=right]:lg:max-w-[720px] sm:max-w-[680px] lg:max-w-[720px]"
          >
            {selectedCourse && (
              <DetailsPanel
                variant="sheet"
                course={selectedCourse}
                scrollable
                {...panelHandlers}
              />
            )}
          </SheetContent>
        </Sheet>
      )}

      {/* ── MOBILE: bottom Drawer with snap points (vaul) ─────────
          - snapPoints: starts at 60% height, drag up to 96%.
          - fadeFromIndex={0}: keeps the dim overlay at the first snap.
          - The Drawer content is full height; we size the INNER wrapper to the
            visible part so the sticky footer is never hidden below the fold.
          - If your installed Drawer is not vaul-based (no snapPoints prop),
            the Drawer still opens, but without drag-to-expand.             */}
      {!isWide && (
        <Drawer
          open={detailsOpen}
          onOpenChange={(open) => {
            if (!open) closeDetails();
          }}
          snapPoints={[...SNAP_POINTS]}
          activeSnapPoint={snap}
          setActiveSnapPoint={setSnap}
          fadeFromIndex={0}
        >
          <DrawerContent className="h-[100dvh] max-h-[100dvh] data-[vaul-drawer-direction=bottom]:max-h-[100dvh]">
            {selectedCourse && (
              <div
                className="flex flex-col"
                style={{
                  height: `calc(${snapNumber * 100}dvh - ${DRAWER_HANDLE_REM}rem)`,
                }}
              >
                <DetailsPanel
                  variant="drawer"
                  course={selectedCourse}
                  scrollable={drawerExpanded}
                  headerActions={
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={
                          drawerExpanded ? "Collapse details" : "Expand details"
                        }
                        onClick={() =>
                          setSnap(drawerExpanded ? SNAP_POINTS[0] : lastSnap)
                        }
                      >
                        {drawerExpanded ? (
                          <ChevronsDown aria-hidden />
                        ) : (
                          <ChevronsUp aria-hidden />
                        )}
                      </Button>
                      <DrawerClose asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label="Close"
                        >
                          <X aria-hidden />
                        </Button>
                      </DrawerClose>
                    </>
                  }
                  {...panelHandlers}
                />
              </div>
            )}
          </DrawerContent>
        </Drawer>
      )}

      {/* ── Confirm: delete ───────────────────────────────────── */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !mutating) {
            setDeleteTarget(null);
            setMutationError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the course. Students will no longer be
              able to open it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mutationError && (
            <p role="alert" className="text-sm text-destructive">
              {mutationError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutating}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {mutating ? "Deleting…" : "Delete Course"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm: publish / unpublish ──────────────────────── */}
      <AlertDialog
        open={statusTarget !== null}
        onOpenChange={(open) => {
          if (!open && !mutating) {
            setStatusTarget(null);
            setMutationError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.status === "draft"
                ? `Publish “${statusTarget.title}”?`
                : statusTarget?.status === "archived"
                  ? `Restore “${statusTarget.title}” as a draft?`
                  : `Set “${statusTarget?.title}” to draft?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.status === "draft"
                ? "Publishing makes this course available to students. Every video must be finished processing, and every quiz needs a correct answer."
                : statusTarget?.status === "archived"
                  ? "The course will move from Archived to Draft so you can review it before publishing again. Its content and settings stay as they are."
                  : "The course will no longer be available to students. Its content and audience stay as they are, and you can publish it again later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mutationError && (
            <p role="alert" className="text-sm text-destructive">
              {mutationError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutating}
              onClick={(event) => {
                event.preventDefault();
                void confirmStatusChange();
              }}
            >
              {mutating
                ? "Saving…"
                : statusTarget?.status === "draft"
                  ? "Publish Course"
                  : statusTarget?.status === "archived"
                    ? "Restore as Draft"
                    : "Set to Draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
