"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Book,
  BookPlus,
  Box,
  ChevronDown,
  CirclePlus,
  Copy,
  Ellipsis,
  Hash,
  Inbox,
  Layers,
  LayoutDashboard,
  type LucideIcon,
  NotebookPen,
  ReceiptText,
  Search,
  UsersRound,
  SquareLibrary,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ---------- Reference measurements (screenshot px, 1:1) ---------- */
const SIDEBAR_WIDTH = 288; // measured from the reference; change only here

type Item = { label: string; href: string; icon: LucideIcon };

const TOP: Item[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Inbox", href: "/my-inbox", icon: Inbox },
];

const WORKSPACE: Item[] = [
  { label: "Projects", href: "/projects", icon: Box },
  { label: "Views", href: "/views", icon: Layers },
  { label: "More", href: "/more", icon: Ellipsis },
];

const TEAM: Item[] = [
  { label: "Issues", href: "/issues", icon: Copy },
  { label: "Projects", href: "/team/projects", icon: Box },
  { label: "Views", href: "/team/views", icon: Layers },
];

const TRY: Item[] = [
  { label: "Students", href: "/students", icon: UsersRound },
  { label: "Grades", href: "/students-grades", icon: NotebookPen },
];

/* ---------- Pieces ---------- */
const rowBase =
  "group flex h-[33px] w-full items-center rounded-md px-2 text-[15.5px] leading-none outline-none " +
  "transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-black/20";

type NavRowProps = {
  item: Item;
  active: boolean;
  indent?: boolean;
  iconVariant?: "default" | "workspace" | "team";
};

function NavRow({
  item,
  active,
  indent,
  iconVariant = "default",
}: NavRowProps) {
  const Icon = item.icon;
  const iconColor = active
    ? "text-[#3B3D42]"
    : "text-[#7A7E85] group-hover:text-[#3B3D42]";

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        rowBase,
        "gap-[10px]",
        indent && "pl-6",
        active
          ? "bg-black/[0.06] text-[#1B1C1F]"
          : "text-[#3B3D42] hover:bg-black/[0.04] active:bg-black/[0.07]",
      )}
    >
      {iconVariant === "workspace" ? (
        // Same 17px footprint as the default icon, so row size is unchanged.
        <span
          aria-hidden
          className={cn("relative h-[17px] w-[17px] shrink-0", iconColor)}
        >
          <ReceiptText
            size={15}
            strokeWidth={1.7}
            className="absolute left-0 top-0"
          />
          <Hash
            size={9}
            strokeWidth={2.6}
            className="absolute -bottom-[1px] -right-[2px]"
          />
        </span>
      ) : iconVariant === "team" ? (
        <span
          aria-hidden
          className={cn("relative h-[17px] w-[17px] shrink-0", iconColor)}
        >
          <Book
            size={16}
            strokeWidth={1.7}
            className="absolute bottom-0 left-0"
          />
          <span className="absolute -right-[2px] -top-[1px] h-[7px] w-[7px] rounded-full bg-[#2FB5B0]" />
        </span>
      ) : (
        <Icon
          size={17}
          strokeWidth={1.7}
          className={cn("shrink-0", iconColor)}
        />
      )}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SectionLabel({
  children,
  open,
  onToggle,
}: {
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="group mb-[3px] flex h-7 items-center gap-1 rounded-md px-[5px] text-[14px] text-[#80848B] outline-none transition-colors hover:text-[#3B3D42] focus-visible:ring-2 focus-visible:ring-black/20"
    >
      {children}
      <ChevronDown
        size={11}
        strokeWidth={2.6}
        className={cn(
          "transition-transform duration-150",
          !open && "-rotate-90",
        )}
      />
    </button>
  );
}

function Avatar({
  src,
  name,
  size,
}: {
  src?: string | null;
  name: string;
  size: number;
}) {
  const initials = name.trim().slice(0, 2).toUpperCase() || "?";
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-md object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-md bg-[#2FB5B0] text-[10px] font-semibold text-white"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

type CourseStatus = "draft" | "published" | "archived";
type EducationSystem = "general" | "azhar";

interface AdminSummary {
  id: string;
  name: string;
  email: string;
}

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

/* ---------- Sidebar ---------- */
export type SidebarUser = {
  name: string;
  email: string;
  avatar: string | null;
};

const Sidebar = ({ user }: { user: SidebarUser }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedCourseId = searchParams.get("course");

  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { name, email, avatar } = user;

  const [open, setOpen] = useState({ workspace: true, teams: true, try: true });
  const toggle = (k: keyof typeof open) =>
    setOpen((s) => ({ ...s, [k]: !s[k] }));

  const isActive = (href: string) => pathname === href;

  const fetchCourses = async () => {
    try {
      setIsLoading(true);

      const response = await fetch("/api/admin/courses", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(
          result.error || "Something went wrong. Please reload the page.",
        );

        return;
      }

      if (!Array.isArray(result.courses)) {
        throw new Error("Invalid courses response.");
      }

      const normalizedCourses = result.courses.map((course: Course) =>
        normalizeCourse(course),
      );

      setCourses(normalizedCourses);
    } catch (error) {
      console.error("[Admin Courses] Fetch failed:", error);

      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchCourses();
  }, []);

  return (
    <aside
      style={{ width: SIDEBAR_WIDTH }}
      className="flex h-screen shrink-0 flex-col bg-[#F8F9FB] px-3.75 text-[#1B1C1F]"
    >
      {/* Header */}
      <header className="mb-2.5 mt-2 flex h-10 items-center justify-between">
        <button
          type="button"
          title={email}
          aria-label={`${name} workspace menu${email ? `, ${email}` : ""}`}
          className="flex min-w-0 items-center gap-2 rounded-md py-1 pl-[5px] pr-1.5 outline-none transition-colors hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-black/20"
        >
          <Avatar src={avatar} name={name} size={23} />
          <span className="truncate text-[16px] font-semibold leading-none">
            {name}
          </span>
          <ChevronDown
            size={11}
            strokeWidth={2.6}
            className="shrink-0 text-[#80848B]"
          />
        </button>

        <div className="flex items-center gap-[14px]">
          <button
            type="button"
            aria-label="Search"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#7A7E85] outline-none transition-colors hover:bg-black/[0.04] hover:text-[#3B3D42] focus-visible:ring-2 focus-visible:ring-black/20"
          >
            <Search size={17} strokeWidth={1.7} />
          </button>
        </div>
      </header>

      <nav
        aria-label="Primary"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {/* Top */}
        <div className="flex flex-col gap-[1.5px]">
          {TOP.map((i) => (
            <NavRow key={i.href} item={i} active={isActive(i.href)} />
          ))}
        </div>

        {/* Workspace */}
        <div className="mt-5 flex flex-col">
          <SectionLabel
            open={open.workspace}
            onToggle={() => toggle("workspace")}
          >
            Enrollments
          </SectionLabel>
          {open.workspace && (
            <div className="flex flex-col gap-[1.5px]">
              {WORKSPACE.map((i) => (
                <NavRow
                  key={i.href}
                  item={i}
                  active={isActive(i.href)}
                  iconVariant="workspace"
                />
              ))}
            </div>
          )}
        </div>

        {/* Your teams */}
        <div className="mt-5 flex flex-col">
          <SectionLabel open={open.teams} onToggle={() => toggle("teams")}>
            All Courses
          </SectionLabel>
          {open.teams && (
            <div className="flex flex-col gap-[1.5px]">
              <NavRow
                item={{
                  label: "Courses",
                  href: "/dashboard/courses",
                  icon: SquareLibrary,
                }}
                active={isActive("/dashboard/courses") && !selectedCourseId}
              />

              <NavRow
                item={{
                  label: "Add Course",
                  href: "/dashboard/courses/add-course",
                  icon: CirclePlus,
                }}
                active={isActive("/dashboard/courses/add-course")}
              />

              <NavRow
                item={{
                  label: "Content",
                  href: "/dashboard/courses/content",
                  icon: BookPlus,
                }}
                active={isActive("/dashboard/courses/content")}
              />

              {isLoading && (
                <div className="flex items-center flex-row gap-2">
                  <Loader2 size={16} className="animate-spin text-black/70" />
                  <p className="text-sm text-black/70">Loading ...</p>
                </div>
              )}

              {courses.map((course) => (
                <NavRow
                  key={course.id}
                  item={{
                    label: course.title,
                    href: `/dashboard/courses?course=${encodeURIComponent(course.id)}`,
                    icon: Box,
                  }}
                  active={
                    pathname === "/dashboard/courses" &&
                    selectedCourseId === course.id
                  }
                  iconVariant="team"
                />
              ))}
            </div>
          )}
        </div>

        {/* Try */}
        <div className="mt-7 flex flex-col pb-4">
          <SectionLabel open={open.try} onToggle={() => toggle("try")}>
            Students
          </SectionLabel>
          {open.try && (
            <div className="flex flex-col gap-[1.5px]">
              {TRY.map((i) => (
                <NavRow key={i.href} item={i} active={isActive(i.href)} />
              ))}
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;
