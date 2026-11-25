"use client";

/**
 * Course Content Studio — CrestInEnglish
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lets an admin build a course: Course → Modules → Lessons
 * (lesson types: video, reading, exercise).
 *
 * Video lessons use an UPLOADED VIDEO FILE (there is no video link field).
 *
 * Course content is loaded and saved through the admin content API.
 * Lesson edits are manual-save only; video uploads use a separate Mux workflow.
 *
 * HOW THE FILE IS ORGANISED (top to bottom)
 *   1. Imports & routes
 *   2. Types                   the data shapes; they double as your future schema contract
 *   3. Helpers                 small pure functions (ordering, validation, file sizes…)
 *   4. Demo data               the sample courses, modules and lessons
 *   5. api                     async functions that read/write the demo data
 *                              (the ONLY section to replace when the backend exists)
 *   6. Page                    picks a course, then shows the Studio
 *   7. Studio                  the main screen: state, save logic, ordering, deleting
 *   8. Header / Navigator      top bar and the left "course structure" tree
 *   9. Canvas & Editors        the centre editing area (module / lesson editors)
 *  10. Properties              the right-hand settings panel
 *  11. Shared UI & Course picker
 *
 * PHONE & TABLET BEHAVIOUR (below 1024px)
 *  - The whole page scrolls normally. There are no nested scroll areas, so
 *    one finger always scrolls the page.
 *  - A sticky bottom bar holds: Structure, the open item's title, Save, Settings.
 *  - Touch targets are 40px; rows of buttons stack instead of squeezing inputs.
 *  - From 1024px up it becomes a 3-panel app: structure | canvas | properties.
 *
 * ASSUMPTIONS
 *  - One fixed route. The admin picks a course first; the choice lives in
 *    component state, so the URL never changes.
 *  - shadcn/ui is installed: button, input, textarea, label, select, skeleton,
 *    sheet, alert-dialog, dropdown-menu, tooltip.
 *  - Ordering uses Move up / Move down buttons and a "Module" select (keyboard
 *    friendly, no drag-and-drop dependency).
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. IMPORTS & ROUTES
 * ═══════════════════════════════════════════════════════════════════════════ */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { createUpload } from "@mux/upchunk";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  ListChecks,
  ListTree,
  Loader2,
  PanelRight,
  PencilLine,
  Plus,
  RotateCw,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getAdminVideoPreviewToken } from "@/lib/actions/admin/videos";

import MuxAdminPreviewPlayer from "@/components/admin/content/MuxAdminPreviewPlayer";
import { Skeleton } from "@/components/ui/skeleton";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ROUTES = {
  dashboard: "/dashboard",
  courses: "/dashboard/courses",
  addCourse: "/dashboard/courses/add-course",
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. TYPES
 * ═══════════════════════════════════════════════════════════════════════════ */

type LessonType = "video" | "reading" | "quiz";
type CourseStatus = "draft" | "published" | "archived";

/** A course as shown in the picker and the studio header. */
interface CourseSummary {
  _id: string;
  title: string;
  slug: string;
  thumbnail?: string;
  status: CourseStatus;
  moduleCount?: number;
  lessonCount?: number;
}

/** A module groups lessons into one stage of a course. */
interface ModuleDTO {
  _id: string;
  courseId: string;
  title: string;
  description: string;
  order: number;
  /** Used to detect edit conflicts: a save must send the value it last saw. */
  updatedAt: string;
}

/* ── Lesson content (one shape per lesson type) ── */

/**
 * An uploaded video file. The fields match what a storage service (for example
 * Cloudinary) returns, so the real upload can fill them in later.
 */
interface VideoAsset {
  fileName: string;
  sizeBytes: number | null;
  status:
    | "not_uploaded"
    | "waiting_upload"
    | "processing"
    | "ready"
    | "errored"
    | "cancelled"
    | "timed_out";
  muxUploadId?: string | null;
  muxAssetId?: string | null;
  muxPlaybackId?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  processingError?: string | null;
  playbackPolicy?: "signed";
  readyAt?: string | null;
}

interface VideoContent {
  video: VideoAsset | null;
  description: string;
  transcript: string;
  transcriptStatus?: "not_requested" | "processing" | "ready" | "errored";
  transcriptSegments?: {
    startSeconds: number;
    endSeconds: number;
    text: string;
  }[];
}

interface ReadingContent {
  intro: string;
  sections: { _id: string; heading: string; body: string }[];
}

/** Exercises are scored question sets (quiz style). */
interface QuizContent {
  instructions: string;
  passingScore: number;
  timeLimitMinutes: number | null;
  questions: {
    _id: string;
    prompt: string;
    options: { _id: string; text: string }[];
    correctOptionId: string | null;
    explanation: string;
  }[];
}

/** Fields every lesson has, whatever its type. */
interface LessonBase {
  _id: string;
  courseId: string;
  moduleId: string;
  title: string;
  order: number;
  estimatedMinutes: number | null;
  updatedAt: string;
}

/** A lesson: the shared fields plus a `type` that decides the shape of `content`. */
type LessonDTO = LessonBase &
  (
    | { type: "video"; content: VideoContent }
    | { type: "reading"; content: ReadingContent }
    | { type: "quiz"; content: QuizContent }
  );

/** Everything the studio needs to render one course. */
interface ContentResponse {
  course: CourseSummary;
  modules: ModuleDTO[];
  lessons: LessonDTO[];
}

/* ── Payloads sent to the api ── */

interface ModulePatch {
  title: string;
  description: string;
  expectedUpdatedAt: string;
}
interface LessonPatch {
  title: string;
  type: LessonType;
  estimatedMinutes: number | null;
  content: LessonDTO["content"];
  expectedUpdatedAt: string;
}
interface OrderPayload {
  modules: { _id: string; order: number }[];
  lessons: { _id: string; moduleId: string; order: number }[];
}

/* ── UI state types ── */

/** Which item is selected in the left tree. */
type Selection = { kind: "module" | "lesson"; id: string };

/** The editable copy of the selected item. Edits go here first, then get saved. */
type Draft =
  | { kind: "module"; value: ModuleDTO }
  | { kind: "lesson"; value: LessonDTO };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

/** The pending question in the confirmation dialog. */
type Confirm =
  | { kind: "delete-module"; id: string }
  | { kind: "delete-lesson"; id: string }
  | { kind: "change-type"; type: LessonType };

type SaveState = "unsaved" | "saving" | "saved" | "failed";

/** Where the selected item sits among its siblings (index is 0-based). */
type Position = { index: number; total: number } | null;

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. HELPERS
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ── Errors ── */

/** An error carrying an HTTP-style status (409 = edit conflict, 404 = not found…). */
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Turns any error into a message that is safe to show an admin. */
const errMsg = (e: unknown) =>
  e instanceof ApiError
    ? e.message
    : "Couldn't reach the server. Check your connection and try again.";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch (error) {
    throw new ApiError(
      error instanceof TypeError
        ? "The application server could not be reached. Check that it is running and try again."
        : "The request could not be completed.",
      0,
    );
  }
  const data = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;
  if (!response.ok)
    throw new ApiError(
      data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "The server could not complete that request.",
      response.status,
    );
  return data as T;
}

/* ── Lesson types ── */

const TYPE_META: Record<
  LessonType,
  { label: string; icon: LucideIcon; blurb: string }
> = {
  video: { label: "Video", icon: Video, blurb: "A lesson students watch" },
  reading: { label: "Reading", icon: BookOpen, blurb: "Text students read" },
  quiz: {
    label: "Quiz",
    icon: ListChecks,
    blurb: "Questions with answers",
  },
};
const TYPES = Object.keys(TYPE_META) as LessonType[];

/** Dot colour shown next to a course's status. */
const STATUS_DOT: Record<CourseStatus, string> = {
  draft: "bg-muted-foreground",
  published: "bg-emerald-600",
  archived: "bg-amber-600",
};

/* ── IDs and ordering ── */

const uid = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

/** Returns a sorted copy (lowest `order` first). */
const byOrder = <T extends { order: number }>(items: T[]) =>
  [...items].sort((a, b) => a.order - b.order);

/** Rewrites `order` as 0, 1, 2… following the array's current sequence. */
const renumber = <T extends { order: number }>(items: T[]): T[] =>
  items.map((item, i) => ({ ...item, order: i }));

/** Renumbers lessons 0, 1, 2… separately inside each module. */
function renumberLessons(lessons: LessonDTO[]): LessonDTO[] {
  const countPerModule = new Map<string, number>();
  return byOrder(lessons).map((lesson) => {
    const next = countPerModule.get(lesson.moduleId) ?? 0;
    countPerModule.set(lesson.moduleId, next + 1);
    return { ...lesson, order: next };
  });
}

/* ── Immutable array helpers ── */

/** Swaps the item at `index` with its neighbour (-1 = up, 1 = down). */
function moveItem<T>(arr: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= arr.length) return arr;
  const copy = [...arr];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}
/** Returns a copy with the item at `index` partially updated. */
function patchAt<T>(arr: T[], index: number, patch: Partial<T>): T[] {
  return arr.map((item, i) => (i === index ? { ...item, ...patch } : item));
}
/** Returns a copy without the item at `index`. */
function removeAt<T>(arr: T[], index: number): T[] {
  return arr.filter((_, i) => i !== index);
}

/* ── Lessons ── */

/** Returns the same lesson converted to `type`, with empty content for that type. */
function withType(lesson: LessonDTO, type: LessonType): LessonDTO {
  const base: LessonBase = {
    _id: lesson._id,
    courseId: lesson.courseId,
    moduleId: lesson.moduleId,
    title: lesson.title,
    order: lesson.order,
    estimatedMinutes: lesson.estimatedMinutes,
    updatedAt: lesson.updatedAt,
  };
  switch (type) {
    case "video":
      return {
        ...base,
        type,
        content: {
          video: { fileName: "", sizeBytes: null, status: "not_uploaded" },
          description: "",
          transcript: "",
          transcriptStatus: "not_requested",
          transcriptSegments: [],
        },
      };
    case "reading":
      return { ...base, type, content: { intro: "", sections: [] } };
    case "quiz":
      return {
        ...base,
        type,
        content: {
          instructions: "",
          passingScore: 60,
          timeLimitMinutes: null,
          questions: [],
        },
      };
  }
}

/** A string of only the fields an admin can edit, used to compare two versions. */
const editableFingerprint = (l: LessonDTO) =>
  JSON.stringify([l.title, l.type, l.estimatedMinutes, l.content]);

/** True when the draft differs from the saved version of the same item. */
function isDraftDirty(
  draft: Draft | null,
  modules: ModuleDTO[],
  lessons: LessonDTO[],
): boolean {
  if (!draft) return false;

  if (draft.kind === "module") {
    const saved = modules.find((m) => m._id === draft.value._id);
    return (
      !!saved &&
      (saved.title !== draft.value.title ||
        saved.description !== draft.value.description)
    );
  }

  const saved = lessons.find((l) => l._id === draft.value._id);
  return (
    !!saved && editableFingerprint(saved) !== editableFingerprint(draft.value)
  );
}

/* ── Dates and file sizes ── */

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const formatDate = (iso: string) => dateFmt.format(new Date(iso));

/** 1536 → "2 KB", 5_242_880 → "5.0 MB". */
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/* ── Video upload rules ── */

const VIDEO_UPLOAD = {
  maxSizeMB: 500,
  /** Passed to the file picker so phones offer the camera roll. */
  accept: "video/mp4,video/webm,video/quicktime",
  label: "MP4, WebM or MOV",
};
const VIDEO_MIME_TYPES: string[] = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

/**
 * Returns a message when the file can't be used, or null when it is fine.
 * (The real API must repeat these checks on the server.)
 */
function videoContentType(file: File): string | null {
  if (VIDEO_MIME_TYPES.includes(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "mp4" || extension === "m4v") return "video/mp4";
  if (extension === "webm") return "video/webm";
  if (extension === "mov") return "video/quicktime";
  return null;
}

function validateVideoFile(file: File): string | null {
  if (!videoContentType(file))
    return `This file type isn't supported. Use ${VIDEO_UPLOAD.label}.`;
  if (file.size <= 0) return "This video file is empty.";
  if (file.size > VIDEO_UPLOAD.maxSizeMB * 1024 * 1024)
    return `This video is ${formatBytes(file.size)}. The limit is ${VIDEO_UPLOAD.maxSizeMB} MB.`;
  return null;
}

/* ── Responsive layout ── */

/** Returns true while the browser matches the CSS media query. */
function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false, // server render: assume the query does not match
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. DEMO DATA
 * ═══════════════════════════════════════════════════════════════════════════
 * The sample content the page starts with. Edits made in the studio change this
 * object in memory, so they survive switching courses but not a page refresh.
 */

/** Errors the "Demo: simulate" dropdown can trigger, to test the error states. */

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. API (in-memory)
 * ═══════════════════════════════════════════════════════════════════════════
 * Every function is async and works directly on the `demo` object above.
 * Each call waits a moment first so the loading states are visible.
 *
 * BACKEND HANDOFF — when you build the real API
 * ───────────────────────────────────────────────
 * Only this section needs to change. The types in section 2 are the contract:
 * the screens keep working as long as each function returns the same shape.
 *
 *   api function     suggested endpoint
 *   ───────────────  ──────────────────────────────────────────────────────────
 *   getCourses       GET    /api/courses
 *   getContent       GET    /api/courses/:courseId/content
 *   createModule     POST   /api/courses/:courseId/modules
 *   updateModule     PATCH  /api/courses/:courseId/modules/:moduleId
 *   deleteModule     DELETE /api/courses/:courseId/modules/:moduleId
 *   createLesson     POST   /api/courses/:courseId/modules/:moduleId/lessons
 *   updateLesson     PATCH  .../lessons/:lessonId
 *   deleteLesson     DELETE .../lessons/:lessonId
 *   reorder          PATCH  /api/courses/:courseId/content/order
 *   uploadVideo      POST   .../lessons/:lessonId/video  (or a signed upload)
 *
 * Suggested collections (ModuleDTO / LessonDTO are the shapes to store):
 *   Module  { courseId, title, description, order }              + timestamps
 *   Lesson  { courseId, moduleId, title, type, order,
 *             estimatedMinutes, content: Mixed }                 + timestamps
 *   (`content` follows the lesson's `type`: VideoContent, ReadingContent or
 *    ExerciseContent. `updatedAt` comes from the timestamps option.)
 *
 * Rules the real routes must follow (the demo already behaves this way):
 *   - Every handler checks admin auth and that the module / lesson belongs to :courseId.
 *   - Updates send `expectedUpdatedAt`; answer 409 when it is stale.
 *   - Reordering or moving a lesson must NOT change `updatedAt`.
 *   - Deleting a module also deletes its lessons; the server renumbers `order`.
 *   - Validate uploads on the server (type and size, see VIDEO_UPLOAD).
 *   - Errors are JSON `{ error: string }`; the UI shows that text to the admin.
 */

type ApiOperation =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "order"
  | "upload";

async function uploadVideoOnce(
  courseId: string,
  moduleId: string,
  lessonId: string,
  file: File,
  contentType: string,
  options: {
    onProgress?: (percent: number) => void;
    onPhase?: (phase: "preparing" | "uploading") => void;
    onUploadCreated?: (video: VideoAsset, lessonUpdatedAt: string) => void;
    signal?: AbortSignal;
  },
) {
  if (options.signal?.aborted) throw new ApiError("Upload cancelled.", 499);
  options.onPhase?.("preparing");
  const authorization = await requestJson<{
    uploadUrl: string;
    uploadId: string;
    lessonUpdatedAt: string;
  }>(`/api/admin/courses/${courseId}/video-upload`, {
    method: "POST",
    body: JSON.stringify({
      moduleId,
      lessonId,
      fileName: file.name,
      contentType,
      sizeBytes: file.size,
    }),
  });

  if (options.signal?.aborted) throw new ApiError("Upload cancelled.", 499);
  const reservedVideo: VideoAsset = {
    fileName: file.name,
    sizeBytes: file.size,
    status: "waiting_upload",
    muxUploadId: authorization.uploadId,
  };
  options.onUploadCreated?.(reservedVideo, authorization.lessonUpdatedAt);
  options.onPhase?.("uploading");

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let abortUpload: (() => void) | null = null;
    const cleanup = () => {
      if (abortUpload)
        options.signal?.removeEventListener("abort", abortUpload);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const upload = createUpload({
      endpoint: authorization.uploadUrl,
      file,
      // 8 MiB, a multiple of 256 KiB. Mux rejects smaller non-final chunks.
      chunkSize: 8192,
      attempts: 6,
      delayBeforeAttempt: 2,
      retryCodes: [400, 403, 404, 408, 409, 425, 429, 500, 502, 503, 504],
      // Safari can fail the first stream read and succeed on the fallback reader.
      useLargeFileWorkaround: true,
    });
    abortUpload = () => {
      upload.abort();
      finish(new ApiError("Upload cancelled.", 499));
    };
    options.signal?.addEventListener("abort", abortUpload, { once: true });
    if (options.signal?.aborted) {
      abortUpload();
      return;
    }
    upload.on("progress", (event) => {
      const detail = event.detail as number | { percentage?: number };
      const percent =
        typeof detail === "number" ? detail : (detail?.percentage ?? 0);
      options.onProgress?.(Math.max(0, Math.min(100, Math.round(percent))));
    });
    upload.on("error", (event) => {
      const detail = event.detail as { message?: string } | undefined;
      finish(
        new ApiError(
          detail?.message
            ? `Mux upload failed: ${detail.message}`
            : "Mux could not upload this video. Check your network and try again.",
          502,
        ),
      );
    });
    upload.on("success", () => finish());
  });

  return {
    video: reservedVideo,
    lessonUpdatedAt: authorization.lessonUpdatedAt,
  };
}

const api = {
  /* ── Reading ── */

  /** All courses, with module and lesson counts for the picker. */
  async getCourses(): Promise<{ courses: CourseSummary[] }> {
    const data = await requestJson<{
      courses: Array<
        Omit<CourseSummary, "_id"> & { id?: string; _id?: string }
      >;
    }>("/api/admin/courses");
    return {
      courses: data.courses.map((course) => ({
        ...course,
        _id: course._id || course.id || "",
      })),
    };
  },

  /** One course with all of its modules and lessons. */
  async getContent(
    courseId: string,
    signal?: AbortSignal,
  ): Promise<ContentResponse> {
    return requestJson(`/api/admin/courses/${courseId}/content`, { signal });
  },

  /* ── Modules ── */

  async createModule(courseId: string, title: string) {
    return requestJson<{ module: ModuleDTO }>(
      `/api/admin/courses/${courseId}/content`,
      {
        method: "POST",
        body: JSON.stringify({ action: "create-module", data: { title } }),
      },
    );
  },

  async updateModule(courseId: string, moduleId: string, patch: ModulePatch) {
    return requestJson<{ module: ModuleDTO }>(
      `/api/admin/courses/${courseId}/content`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "update-module",
          moduleId,
          data: patch,
        }),
      },
    );
  },

  /** Deleting a module also deletes all of its lessons. */
  async deleteModule(courseId: string, moduleId: string) {
    await requestJson(`/api/admin/courses/${courseId}/content`, {
      method: "POST",
      body: JSON.stringify({ action: "delete-module", moduleId }),
    });
  },

  /* ── Lessons ── */

  async createLesson(
    courseId: string,
    moduleId: string,
    title: string,
    type: LessonType,
  ) {
    return requestJson<{ lesson: LessonDTO }>(
      `/api/admin/courses/${courseId}/content`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "create-lesson",
          moduleId,
          data: { title, type },
        }),
      },
    );
  },

  async updateLesson(
    courseId: string,
    moduleId: string,
    lessonId: string,
    patch: LessonPatch,
  ) {
    const content =
      patch.type === "video"
        ? {
            description: (patch.content as VideoContent).description,
            transcript: (patch.content as VideoContent).transcript,
          }
        : patch.content;
    return requestJson<{ lesson: LessonDTO }>(
      `/api/admin/courses/${courseId}/content`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "update-lesson",
          moduleId,
          lessonId,
          data: { ...patch, content },
        }),
      },
    );
  },

  async deleteLesson(courseId: string, moduleId: string, lessonId: string) {
    await requestJson(`/api/admin/courses/${courseId}/content`, {
      method: "POST",
      body: JSON.stringify({ action: "delete-lesson", moduleId, lessonId }),
    });
  },

  /* ── Ordering ── */

  /** Saves new positions for modules and lessons (and lesson → courseModule moves). */
  async reorder(courseId: string, payload: OrderPayload) {
    await requestJson(`/api/admin/courses/${courseId}/content`, {
      method: "POST",
      body: JSON.stringify({ action: "reorder", data: payload }),
    });
  },

  async cancelVideoUpload(
    courseId: string,
    moduleId: string,
    lessonId: string,
    uploadId: string,
  ) {
    return requestJson<{ video: VideoAsset; lessonUpdatedAt: string }>(
      `/api/admin/courses/${courseId}/video-upload/cancel`,
      {
        method: "POST",
        body: JSON.stringify({ moduleId, lessonId, uploadId }),
      },
    );
  },

  /* ── Video upload ── */

  /**
   * Uploads one video file for a lesson and returns the stored asset.
   *
   * Creates one authenticated Mux Direct Upload and transfers the file with
   * UpChunk. The server persists the upload reservation before bytes are sent.
   */
  async uploadVideo(
    courseId: string,
    moduleId: string,
    lessonId: string,
    file: File,
    options: {
      onProgress?: (percent: number) => void;
      onPhase?: (phase: "preparing" | "uploading") => void;
      onUploadCreated?: (video: VideoAsset, lessonUpdatedAt: string) => void;
      signal?: AbortSignal;
    } = {},
  ): Promise<{ video: VideoAsset; lessonUpdatedAt: string }> {
    const contentType = videoContentType(file);
    if (!contentType) {
      throw new ApiError(
        `This file type isn't supported. Use ${VIDEO_UPLOAD.label}.`,
        400,
      );
    }
    const typedFile =
      file.type === contentType
        ? file
        : new File([file], file.name, {
            type: contentType,
            lastModified: file.lastModified,
          });

    // UpChunk retries individual chunks against this one Direct Upload URL.
    // Do not create a second Mux upload automatically after an ambiguous failure.
    return uploadVideoOnce(
      courseId,
      moduleId,
      lessonId,
      typedFile,
      contentType,
      options,
    );
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. PAGE
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function CourseContentStudioPage() {
  // The admin picks a course first. It is held in state so the route never changes.
  const [courseId, setCourseId] = useState<string | null>(null);

  if (!courseId) return <CoursePicker onPick={setCourseId} />;

  return (
    <Studio
      key={courseId} // a new course remounts the studio with fresh state
      courseId={courseId}
      onExit={() => setCourseId(null)}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 7. STUDIO (main screen)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Builds the title / body / button text for the confirmation dialog. */
function buildConfirmCopy(
  confirm: Confirm | null,
  modules: ModuleDTO[],
  lessons: LessonDTO[],
  lessonsByModule: Map<string, LessonDTO[]>,
) {
  if (!confirm) return null;

  if (confirm.kind === "delete-module") {
    const courseModule = modules.find((m) => m._id === confirm.id);
    const lessonCount = lessonsByModule.get(confirm.id)?.length ?? 0;
    const lessonWord = lessonCount === 1 ? "lesson" : "lessons";
    return {
      title: `Delete “${courseModule?.title || "Untitled module"}”?`,
      body:
        lessonCount > 0
          ? `This also permanently deletes its ${lessonCount} ${lessonWord}. This can't be undone.`
          : "This module has no lessons. This can't be undone.",
      action:
        lessonCount > 0
          ? `Delete module and ${lessonCount} ${lessonWord}`
          : "Delete module",
    };
  }

  if (confirm.kind === "delete-lesson") {
    const lesson = lessons.find((l) => l._id === confirm.id);
    return {
      title: `Delete “${lesson?.title || "Untitled lesson"}”?`,
      body: "The lesson and everything written in it will be permanently deleted. This can't be undone.",
      action: "Delete lesson",
    };
  }

  // change-type
  const label = TYPE_META[confirm.type].label;
  return {
    title: `Switch to ${label}?`,
    body: "This lesson's current content doesn't carry over to the new type and will be replaced when you save.",
    action: `Switch to ${label}`,
  };
}

function Studio({
  courseId,
  onExit,
}: {
  courseId: string;
  onExit: () => void;
}) {
  /* ── State: the course data ── */
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [course, setCourse] = useState<CourseSummary | null>(null);
  const [modules, setModules] = useState<ModuleDTO[]>([]);
  const [lessons, setLessons] = useState<LessonDTO[]>([]);

  /* ── State: what is being edited ── */
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null); // new item whose title gets focus

  /* ── State: saving and errors ── */
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const videoUploadLock = useRef(0);
  const [videoUploadLocked, setVideoUploadLockedState] = useState(false);
  const [notice, setNotice] = useState<string | null>(null); // non-save errors (add, delete, reorder)
  const [busy, setBusy] = useState<"create" | "order" | "delete" | null>(null);

  /* ── State: layout and navigator ── */
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [navSheet, setNavSheet] = useState(false); // left drawer (small screens)
  const [propsSheet, setPropsSheet] = useState(false); // right drawer (below xl)
  const [propsOpen, setPropsOpen] = useState(true); // right panel (xl screens)
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const isLg = useMediaQuery("(min-width: 1024px)");
  const isXl = useMediaQuery("(min-width: 1280px)");

  /**
   * Always holds the newest draft / modules / lessons. Async functions read from
   * here so they never act on stale values captured when they were created.
   */
  const latest = useRef({ draft, modules, lessons });

  useEffect(() => {
    latest.current = { draft, modules, lessons };
  });

  /** The save currently running, so a second save waits for it. */
  const inflight = useRef<Promise<boolean> | null>(null);

  const dirty = useMemo(
    () => isDraftDirty(draft, modules, lessons),
    [draft, modules, lessons],
  );

  const showError = (what: string, e: unknown) =>
    setNotice(`Couldn't ${what}. ${errMsg(e)}`);

  /* ───────────── Loading the course ───────────── */

  const applyContent = useCallback((data: ContentResponse) => {
    setCourse(data.course);
    setModules(byOrder(data.modules));
    setLessons(byOrder(data.lessons));
  }, []);

  const loadContent = useCallback(
    async (signal?: AbortSignal) => {
      setLoad({ status: "loading" });
      try {
        applyContent(await api.getContent(courseId, signal));
        setLoad({ status: "ready" });
      } catch (e) {
        if (signal?.aborted) return;
        setLoad({ status: "error", message: errMsg(e) });
      }
    },
    [courseId, applyContent],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadContent(controller.signal);
    return () => controller.abort();
  }, [loadContent]);

  /* ───────────── Drafts: the editable copy of the selected item ───────────── */

  /** Selects an item and copies it into `draft` (or clears both when `sel` is null). */
  const openDraft = useCallback(
    (sel: Selection | null, ms: ModuleDTO[], ls: LessonDTO[]) => {
      setSelection(sel);
      if (!sel) return setDraft(null);

      if (sel.kind === "module") {
        const found = ms.find((m) => m._id === sel.id);
        setDraft(found ? { kind: "module", value: found } : null);
      } else {
        const found = ls.find((l) => l._id === sel.id);
        setDraft(found ? { kind: "lesson", value: found } : null);
      }
    },
    [],
  );

  const editLesson = (value: LessonDTO) => {
    setSaveError(null);
    setDraft({ kind: "lesson", value });
  };
  const editModule = (value: ModuleDTO) => {
    setSaveError(null);
    setDraft({ kind: "module", value });
  };

  /* ───────────── Saving ───────────── */

  /**
   * Saves the current draft. Returns true when there is nothing left to save
   * (success, or nothing changed) and false when saving failed.
   */
  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (videoUploadLock.current > 0) {
      setSaveError(
        "Wait for the video upload to finish before saving this lesson.",
      );
      return false;
    }
    if (inflight.current) return inflight.current;

    const { draft: d, modules: ms, lessons: ls } = latest.current;
    if (!d || !isDraftDirty(d, ms, ls)) return true;

    if (!d.value.title.trim()) {
      setSaveError(
        d.kind === "module"
          ? "Give this module a title to save it."
          : "Give this lesson a title to save it.",
      );
      return false;
    }

    const run = (async () => {
      setSaving(true);
      setSaveError(null);
      try {
        if (d.kind === "module") {
          const { module: saved } = await api.updateModule(
            courseId,
            d.value._id,
            {
              title: d.value.title.trim(),
              description: d.value.description,
              expectedUpdatedAt: d.value.updatedAt,
            },
          );
          // Store the saved module, and keep the draft's timestamp in sync
          // so the next save passes the conflict check.
          const current = latest.current;
          const nextModules = current.modules.map((m) =>
            m._id === saved._id ? saved : m,
          );
          const nextDraft =
            current.draft?.kind === "module" &&
            current.draft.value._id === saved._id
              ? {
                  kind: "module" as const,
                  value: { ...current.draft.value, updatedAt: saved.updatedAt },
                }
              : current.draft;
          latest.current = {
            ...current,
            modules: nextModules,
            draft: nextDraft,
          };
          setModules(nextModules);
          setDraft(nextDraft);
        } else {
          const lesson = d.value;
          const { lesson: saved } = await api.updateLesson(
            courseId,
            lesson.moduleId,
            lesson._id,
            {
              title: lesson.title.trim(),
              type: lesson.type,
              estimatedMinutes: lesson.estimatedMinutes,
              content: lesson.content,
              expectedUpdatedAt: lesson.updatedAt,
            },
          );
          const current = latest.current;
          const nextLessons = current.lessons.map((l) =>
            l._id === saved._id ? saved : l,
          );
          const nextDraft =
            current.draft?.kind === "lesson" &&
            current.draft.value._id === saved._id
              ? {
                  kind: "lesson" as const,
                  value: { ...current.draft.value, updatedAt: saved.updatedAt },
                }
              : current.draft;
          latest.current = {
            ...current,
            lessons: nextLessons,
            draft: nextDraft,
          };
          setLessons(nextLessons);
          setDraft(nextDraft);
        }
        return true;
      } catch (e) {
        setSaveError(
          e instanceof ApiError && e.status === 409
            ? "This item was changed somewhere else. Reload the latest version to keep editing."
            : errMsg(e),
        );
        return false;
      } finally {
        setSaving(false);
      }
    })();

    inflight.current = run;
    const ok = await run;
    inflight.current = null;
    return ok;
  }, [courseId]);

  const setVideoUploadLocked = useCallback((active: boolean) => {
    videoUploadLock.current = active
      ? videoUploadLock.current + 1
      : Math.max(0, videoUploadLock.current - 1);
    setVideoUploadLockedState(videoUploadLock.current > 0);
  }, []);

  const syncVideoUploadComplete = useCallback(
    (lessonId: string, uploadedContent: VideoContent, updatedAt: string) => {
      const current = latest.current;
      const savedLesson = current.lessons.find(
        (item) => item._id === lessonId && item.type === "video",
      );
      if (!savedLesson || savedLesson.type !== "video") return;

      const activeDraft =
        current.draft?.kind === "lesson" &&
        current.draft.value._id === lessonId &&
        current.draft.value.type === "video"
          ? current.draft.value
          : null;
      const draftTranscript =
        activeDraft?.content.transcript ?? uploadedContent.transcript;
      const hasUnsavedTranscript =
        draftTranscript !== savedLesson.content.transcript;

      // The new upload invalidates the transcript stored for the previous asset.
      // Keep that cleared value in the saved baseline, but do not discard text the
      // administrator has typed and not yet saved in the active draft.
      const savedContent: VideoContent = {
        ...savedLesson.content,
        video: uploadedContent.video,
        transcript: "",
        transcriptStatus: "not_requested",
        transcriptSegments: [],
      };
      const nextLessons = current.lessons.map((item) =>
        item._id === lessonId && item.type === "video"
          ? { ...item, content: savedContent, updatedAt }
          : item,
      );
      const nextDraft: Draft | null = activeDraft
        ? {
            kind: "lesson",
            value: {
              ...activeDraft,
              content: {
                ...activeDraft.content,
                video: uploadedContent.video,
                transcript: hasUnsavedTranscript ? draftTranscript : "",
                transcriptStatus: hasUnsavedTranscript
                  ? ("ready" as const)
                  : ("not_requested" as const),
                transcriptSegments: hasUnsavedTranscript
                  ? (activeDraft.content.transcriptSegments ?? [])
                  : [],
              },
              updatedAt,
            },
          }
        : current.draft;

      latest.current = { ...current, lessons: nextLessons, draft: nextDraft };
      setLessons(nextLessons);
      setDraft(nextDraft);
    },
    [],
  );

  const syncVideoStatusUpdate = useCallback(
    (lessonId: string, serverContent: VideoContent, updatedAt: string) => {
      const current = latest.current;
      const savedLesson = current.lessons.find(
        (item) => item._id === lessonId && item.type === "video",
      );
      if (!savedLesson || savedLesson.type !== "video") return;

      const activeDraft =
        current.draft?.kind === "lesson" &&
        current.draft.value._id === lessonId &&
        current.draft.value.type === "video"
          ? current.draft.value
          : null;

      const descriptionIsDirty =
        !!activeDraft &&
        activeDraft.content.description !== savedLesson.content.description;
      const transcriptIsDirty =
        !!activeDraft &&
        activeDraft.content.transcript !== savedLesson.content.transcript;
      const nextSavedContent: VideoContent = {
        ...savedLesson.content,
        ...serverContent,
      };
      const nextSavedLessons = current.lessons.map((item) =>
        item._id === lessonId && item.type === "video"
          ? { ...item, content: nextSavedContent, updatedAt }
          : item,
      );

      const nextDraft: Draft | null = activeDraft
        ? {
            kind: "lesson",
            value: {
              ...activeDraft,
              content: {
                ...activeDraft.content,
                video: serverContent.video,
                description: descriptionIsDirty
                  ? activeDraft.content.description
                  : serverContent.description,
                transcript: transcriptIsDirty
                  ? activeDraft.content.transcript
                  : serverContent.transcript,
                transcriptStatus: serverContent.transcriptStatus,
                transcriptSegments: serverContent.transcriptSegments ?? [],
              },
              updatedAt,
            },
          }
        : current.draft;

      // Avoid rendering on every five-second status poll when nothing changed.
      const draftIsAlreadySynced =
        !activeDraft ||
        (activeDraft.updatedAt === updatedAt &&
          JSON.stringify(activeDraft.content) ===
            JSON.stringify(
              nextDraft && nextDraft.kind === "lesson"
                ? nextDraft.value.content
                : activeDraft.content,
            ));
      if (
        savedLesson.updatedAt === updatedAt &&
        JSON.stringify(savedLesson.content) ===
          JSON.stringify(nextSavedContent) &&
        draftIsAlreadySynced
      )
        return;

      latest.current = {
        ...current,
        lessons: nextSavedLessons,
        draft: nextDraft,
      };
      setLessons(nextSavedLessons);
      setDraft(nextDraft);
    },
    [],
  );

  /** Warn before closing the tab with unsaved work. */
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  /** After an edit conflict: throw away the local draft and load the newest version. */
  const reloadLatest = async () => {
    try {
      const data = await api.getContent(courseId);
      applyContent(data);
      setSaveError(null);
      openDraft(selection, data.modules, data.lessons);
    } catch (e) {
      setSaveError(errMsg(e));
    }
  };

  /* ───────────── Selecting ───────────── */

  /** Opens an item. The previous draft is saved first; if that fails we stay put. */
  const select = async (sel: Selection) => {
    if (selection?.id === sel.id) return setNavSheet(false);
    if (videoUploadLocked) {
      setNotice(
        "Wait for the video upload to finish before opening another item.",
      );
      return;
    }
    if (dirty) {
      setNotice("Save your current changes before opening another item.");
      return;
    }

    const { modules: ms, lessons: ls } = latest.current;
    setNotice(null);
    openDraft(sel, ms, ls);
    setNavSheet(false);
  };

  /* ───────────── Creating ───────────── */

  const addModule = async () => {
    if (videoUploadLocked) {
      setNotice("Wait for the video upload to finish before adding a module.");
      return;
    }
    if (dirty) {
      setNotice("Save your current changes before adding a module.");
      return;
    }
    setBusy("create");
    try {
      const { module: created } = await api.createModule(
        courseId,
        "Untitled module",
      );
      const nextModules = [...latest.current.modules, created];
      setModules(nextModules);
      setFocusId(created._id);
      openDraft(
        { kind: "module", id: created._id },
        nextModules,
        latest.current.lessons,
      );
      setNavSheet(false);
    } catch (e) {
      showError("add the module", e);
    } finally {
      setBusy(null);
    }
  };

  const addLesson = async (moduleId: string, type: LessonType) => {
    if (videoUploadLocked) {
      setNotice("Wait for the video upload to finish before adding a lesson.");
      return;
    }
    if (dirty) {
      setNotice("Save your current changes before adding a lesson.");
      return;
    }
    setBusy("create");
    try {
      const { lesson } = await api.createLesson(
        courseId,
        moduleId,
        "Untitled lesson",
        type,
      );
      const nextLessons = [...latest.current.lessons, lesson];
      setLessons(nextLessons);

      // Make sure the module is expanded so the new lesson is visible.
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(moduleId);
        return next;
      });

      setFocusId(lesson._id);
      openDraft(
        { kind: "lesson", id: lesson._id },
        latest.current.modules,
        nextLessons,
      );
      setNavSheet(false);
    } catch (e) {
      showError("add the lesson", e);
    } finally {
      setBusy(null);
    }
  };

  /* ───────────── Ordering (the UI only changes after the api confirms) ───────────── */

  const commitOrder = async (
    nextModules: ModuleDTO[],
    nextLessons: LessonDTO[],
  ) => {
    setBusy("order");
    setNotice(null);
    try {
      await api.reorder(courseId, {
        modules: nextModules.map(({ _id, order }) => ({ _id, order })),
        lessons: nextLessons.map(({ _id, moduleId, order }) => ({
          _id,
          moduleId,
          order,
        })),
      });
      setModules(nextModules);
      setLessons(nextLessons);
    } catch (e) {
      showError("save the new order", e);
    } finally {
      setBusy(null);
    }
  };

  /** Moves the selected module (among modules) or lesson (inside its module) up or down. */
  const moveSelected = async (direction: -1 | 1) => {
    if (!selection) return;
    if (videoUploadLocked) {
      setNotice(
        "Wait for the video upload to finish before reordering content.",
      );
      return;
    }
    if (dirty) {
      setNotice("Save your current changes before reordering content.");
      return;
    }
    const { modules: ms, lessons: ls } = latest.current;

    if (selection.kind === "module") {
      const sorted = byOrder(ms);
      const index = sorted.findIndex((m) => m._id === selection.id);
      await commitOrder(renumber(moveItem(sorted, index, direction)), ls);
      return;
    }

    const lesson = ls.find((l) => l._id === selection.id);
    if (!lesson) return;

    const siblings = byOrder(ls.filter((l) => l.moduleId === lesson.moduleId));
    const index = siblings.findIndex((l) => l._id === lesson._id);
    const reordered = renumber(moveItem(siblings, index, direction));
    const newOrderById = new Map(reordered.map((l) => [l._id, l.order]));

    await commitOrder(
      ms,
      ls.map((l) =>
        newOrderById.has(l._id)
          ? { ...l, order: newOrderById.get(l._id) ?? l.order }
          : l,
      ),
    );
  };

  /** Moves the selected lesson to the end of another module. */
  const moveLessonTo = async (targetModuleId: string) => {
    if (selection?.kind !== "lesson") return;
    if (videoUploadLocked) {
      setNotice(
        "Wait for the video upload to finish before moving this lesson.",
      );
      return;
    }
    if (dirty) {
      setNotice("Save your current changes before moving this lesson.");
      return;
    }
    const { modules: ms, lessons: ls } = latest.current;

    // MAX_SAFE_INTEGER puts it last; renumberLessons then turns it into a real position.
    const nextLessons = renumberLessons(
      ls.map((l) =>
        l._id === selection.id
          ? { ...l, moduleId: targetModuleId, order: Number.MAX_SAFE_INTEGER }
          : l,
      ),
    );

    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(targetModuleId);
      return next;
    });
    await commitOrder(ms, nextLessons);
  };

  /* ───────────── Deleting ───────────── */

  const runDelete = async (target: Confirm) => {
    if (target.kind === "change-type") return;
    if (videoUploadLocked) {
      setNotice("Wait for the video upload to finish before deleting content.");
      setConfirm(null);
      return;
    }
    if (dirty) {
      setNotice("Save your current changes before deleting content.");
      setConfirm(null);
      return;
    }
    setBusy("delete");
    try {
      const { modules: ms, lessons: ls } = latest.current;

      if (target.kind === "delete-module") {
        await api.deleteModule(courseId, target.id);

        const removedLessonIds = new Set(
          ls.filter((l) => l.moduleId === target.id).map((l) => l._id),
        );
        setModules(renumber(byOrder(ms.filter((m) => m._id !== target.id))));
        setLessons(ls.filter((l) => l.moduleId !== target.id));

        // Close the editor if the open item was deleted along with the module.
        const selectionRemoved =
          selection &&
          (selection.id === target.id || removedLessonIds.has(selection.id));
        if (selectionRemoved) openDraft(null, [], []);
      } else {
        const lesson = ls.find((l) => l._id === target.id);
        if (!lesson) return;

        await api.deleteLesson(courseId, lesson.moduleId, target.id);
        setLessons(renumberLessons(ls.filter((l) => l._id !== target.id)));
        if (selection?.id === target.id) openDraft(null, [], []);
      }
    } catch (e) {
      showError(
        target.kind === "delete-module"
          ? "delete the module"
          : "delete the lesson",
        e,
      );
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  /* ───────────── Lesson type switching ───────────── */

  /** Switches the draft's type. Asks first if that would throw away typed content. */
  const requestType = (type: LessonType) => {
    if (draft?.kind !== "lesson" || draft.value.type === type) return;

    const emptyContent = withType(draft.value, draft.value.type).content;
    const hasContent =
      JSON.stringify(emptyContent) !== JSON.stringify(draft.value.content);

    if (hasContent) setConfirm({ kind: "change-type", type });
    else editLesson(withType(draft.value, type));
  };

  const onConfirm = () => {
    if (!confirm) return;

    if (confirm.kind === "change-type") {
      if (draft?.kind === "lesson")
        editLesson(withType(draft.value, confirm.type));
      setConfirm(null);
    } else {
      void runDelete(confirm);
    }
  };

  /* ───────────── Values derived from state ───────────── */

  /** Lessons grouped by module, each group sorted by order. */
  const lessonsByModule = useMemo(() => {
    const map = new Map<string, LessonDTO[]>();
    for (const lesson of byOrder(lessons)) {
      map.set(lesson.moduleId, [...(map.get(lesson.moduleId) ?? []), lesson]);
    }
    return map;
  }, [lessons]);

  const selectedModule =
    selection?.kind === "module"
      ? modules.find((m) => m._id === selection.id)
      : undefined;
  const selectedLesson =
    selection?.kind === "lesson"
      ? lessons.find((l) => l._id === selection.id)
      : undefined;
  const parentModule = selectedLesson
    ? modules.find((m) => m._id === selectedLesson.moduleId)
    : undefined;

  /** Position of the selected item among its siblings, e.g. "2 of 5". */
  const position: Position = (() => {
    if (selectedModule) {
      return {
        index: byOrder(modules).findIndex((m) => m._id === selectedModule._id),
        total: modules.length,
      };
    }
    if (selectedLesson) {
      const siblings = lessonsByModule.get(selectedLesson.moduleId) ?? [];
      return {
        index: siblings.findIndex((l) => l._id === selectedLesson._id),
        total: siblings.length,
      };
    }
    return null;
  })();

  const saveState: SaveState = saving
    ? "saving"
    : saveError
      ? "failed"
      : dirty
        ? "unsaved"
        : "saved";

  const confirmCopy = buildConfirmCopy(
    confirm,
    modules,
    lessons,
    lessonsByModule,
  );
  const loading = load.status === "loading";

  const toggleCollapsed = (moduleId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });

  /** On wide screens the properties panel toggles; on smaller ones it opens as a drawer. */
  const toggleProps = () =>
    isXl ? setPropsOpen((open) => !open) : setPropsSheet(true);

  /* ───────────── Pieces reused in the layout ───────────── */

  const navigator = (
    <Navigator
      loading={loading}
      modules={modules}
      lessonsByModule={lessonsByModule}
      draft={draft}
      selection={selection}
      query={query}
      setQuery={setQuery}
      collapsed={collapsed}
      toggle={toggleCollapsed}
      onSelect={select}
      onAddModule={addModule}
      onAddLesson={addLesson}
      busy={busy !== null}
    />
  );

  const properties = (
    <Properties
      loading={loading}
      draft={draft}
      modules={modules}
      position={position}
      parentModule={parentModule}
      lessonCount={
        selectedModule
          ? (lessonsByModule.get(selectedModule._id)?.length ?? 0)
          : 0
      }
      onType={requestType}
      onMinutes={(minutes) =>
        draft?.kind === "lesson" &&
        editLesson({ ...draft.value, estimatedMinutes: minutes })
      }
      onMoveTo={moveLessonTo}
      busy={busy !== null}
    />
  );

  /** Decides what the centre area shows. */
  const renderCanvas = () => {
    // 1. Loading failed
    if (load.status === "error") {
      return (
        <EmptyState
          icon={AlertCircle}
          title="We couldn't load this course's content"
          body={load.message}
          action={
            <Button onClick={() => void loadContent()}>
              <RotateCw className="size-4" /> Try again
            </Button>
          }
        />
      );
    }

    // 2. Still loading
    if (loading) return <CanvasSkeleton />;

    // 3. Course has no modules yet
    if (modules.length === 0) {
      return (
        <EmptyState
          icon={ListTree}
          title="Start with the first module"
          body="Modules group lessons into the stages of your course. Add one, then fill it with videos, readings and exercises."
          action={
            <Button onClick={() => void addModule()} disabled={busy !== null}>
              {busy === "create" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add module
            </Button>
          }
        />
      );
    }

    // 4. A module is open
    if (draft?.kind === "module" && selectedModule) {
      return (
        <ModuleCanvas
          key={draft.value._id}
          module={draft.value}
          autoFocus={focusId === draft.value._id}
          lessons={lessonsByModule.get(draft.value._id) ?? []}
          position={position}
          busy={busy !== null}
          onChange={editModule}
          onMove={moveSelected}
          onDelete={() =>
            setConfirm({ kind: "delete-module", id: draft.value._id })
          }
          onOpenLesson={(id) => void select({ kind: "lesson", id })}
          onAddLesson={(type) => void addLesson(draft.value._id, type)}
        />
      );
    }

    // 5. A lesson is open
    if (draft?.kind === "lesson" && selectedLesson) {
      return (
        <LessonCanvas
          key={draft.value._id}
          lesson={draft.value}
          moduleTitle={parentModule?.title ?? ""}
          autoFocus={focusId === draft.value._id}
          position={position}
          busy={busy !== null}
          onChange={editLesson}
          onMove={moveSelected}
          onDelete={() =>
            setConfirm({ kind: "delete-lesson", id: draft.value._id })
          }
          onVideoUploadComplete={syncVideoUploadComplete}
          onVideoStatusUpdate={syncVideoStatusUpdate}
          onUploadActivity={setVideoUploadLocked}
        />
      );
    }

    // 6. Nothing selected yet
    const moduleWord = modules.length === 1 ? "module" : "modules";
    const lessonWord = lessons.length === 1 ? "lesson" : "lessons";
    return (
      <EmptyState
        icon={PencilLine}
        title="Choose something to edit"
        body={`This course has ${modules.length} ${moduleWord} and ${lessons.length} ${lessonWord}. Select a module or lesson in the course structure to start editing.`}
        action={
          !isLg ? (
            <Button variant="secondary" onClick={() => setNavSheet(true)}>
              <ListTree className="size-4" /> Open course structure
            </Button>
          ) : undefined
        }
      />
    );
  };

  /* ───────────── Layout ───────────── */

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-[calc(100dvh-var(--admin-header-height,0px))] flex-col bg-background lg:h-[calc(100dvh-var(--admin-header-height,0px))] lg:min-h-0 lg:overflow-hidden">
        <Header
          course={course}
          loading={loading}
          saveState={saveState}
          saveError={saveError}
          onRetry={() => void saveDraft()}
          onReload={() => void reloadLatest()}
          onSaveNow={() => void saveDraft()}
          canSaveNow={dirty && !saving && !videoUploadLocked}
          onToggleProps={toggleProps}
          propsActive={isXl && propsOpen}
          notice={notice}
          onDismissNotice={() => setNotice(null)}
          onSwitchCourse={() => {
            if (videoUploadLocked) {
              setNotice(
                "Wait for the video upload to finish before switching courses.",
              );
              return;
            }
            if (dirty) {
              setNotice("Save your current changes before switching courses.");
              return;
            }
            onExit();
          }}
        />

        <div className="flex flex-1 lg:min-h-0">
          {/* Left: course structure (desktop) */}
          {isLg && (
            <aside
              className="w-72 shrink-0 border-r bg-muted/30"
              aria-label="Course structure"
            >
              {navigator}
            </aside>
          )}

          {/* Centre: editing canvas */}
          <main
            className="min-w-0 flex-1 lg:overflow-y-auto lg:overscroll-contain"
            id="canvas"
          >
            {renderCanvas()}
          </main>

          {/* Right: properties (extra-wide screens) */}
          {isXl && propsOpen && (
            <aside
              className="w-80 shrink-0 overflow-y-auto border-l"
              aria-label="Properties"
            >
              {properties}
            </aside>
          )}
        </div>

        {/* Mobile and tablet action bar */}
        {!isLg && (
          <div className="sticky bottom-0 z-30 flex items-center gap-2 border-t bg-background px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <Button
              variant="secondary"
              className="h-10 shrink-0"
              onClick={() => setNavSheet(true)}
            >
              <ListTree className="size-4" /> Structure
            </Button>
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {draft?.value.title || (draft ? "Untitled" : "Nothing selected")}
            </p>
            <SaveIndicator state={saveState} />
            {dirty && !saving && !videoUploadLocked && (
              <Button
                className="h-10 shrink-0"
                onClick={() => void saveDraft()}
              >
                Save
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0"
              aria-label="Open properties"
              onClick={() => setPropsSheet(true)}
              disabled={!draft}
            >
              <SlidersHorizontal className="size-4" />
            </Button>
          </div>
        )}

        {/* Drawer: course structure (below lg) */}
        <Sheet open={navSheet && !isLg} onOpenChange={setNavSheet}>
          <SheetContent side="left" className="w-[min(88vw,22rem)] gap-0 p-0">
            <SheetTitle className="sr-only">Course structure</SheetTitle>
            <SheetDescription className="sr-only">
              Browse modules and lessons.
            </SheetDescription>
            {navigator}
          </SheetContent>
        </Sheet>

        {/* Drawer: properties (below xl) */}
        <Sheet open={propsSheet && !isXl} onOpenChange={setPropsSheet}>
          <SheetContent
            side="right"
            className="w-[min(92vw,24rem)] gap-0 overflow-y-auto p-0"
          >
            <SheetTitle className="sr-only">Properties</SheetTitle>
            <SheetDescription className="sr-only">
              Settings for the selected item.
            </SheetDescription>
            {properties}
          </SheetContent>
        </Sheet>

        {/* Confirmation dialog (delete module / delete lesson / change type) */}
        <AlertDialog
          open={confirm !== null}
          onOpenChange={(open) =>
            !open && busy !== "delete" && setConfirm(null)
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmCopy?.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmCopy?.body}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy === "delete"}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={busy === "delete"}
                className={cn(
                  confirm?.kind !== "change-type" &&
                    "bg-destructive text-white hover:bg-destructive/90",
                )}
                onClick={(e) => {
                  e.preventDefault(); // keep the dialog open until the delete finishes
                  onConfirm();
                }}
              >
                {busy === "delete" && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {confirmCopy?.action}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 8. HEADER & NAVIGATOR
 * ═══════════════════════════════════════════════════════════════════════════ */

/** A ghost icon button with a tooltip. `label` is also the accessible name. */
function IconButton({
  label,
  onClick,
  disabled,
  children,
  active,
  className,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-10 sm:size-9", active && "bg-accent", className)}
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The lesson types offered when adding a lesson. Use inside a <DropdownMenu>. */
function LessonTypeMenu({ onPick }: { onPick: (type: LessonType) => void }) {
  return (
    <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
      {TYPES.map((type) => {
        const Icon = TYPE_META[type].icon;
        return (
          <DropdownMenuItem
            key={type}
            className="min-h-11 gap-3"
            onSelect={() => onPick(type)}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex flex-col">
              <span>{TYPE_META[type].label}</span>
              <span className="text-xs text-muted-foreground">
                {TYPE_META[type].blurb}
              </span>
            </span>
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  );
}

function Header({
  course,
  loading,
  saveState,
  saveError,
  onRetry,
  onReload,
  onSaveNow,
  canSaveNow,
  onToggleProps,
  propsActive,
  notice,
  onDismissNotice,
  onSwitchCourse,
}: {
  course: CourseSummary | null;
  loading: boolean;
  saveState: SaveState;
  saveError: string | null;
  onRetry: () => void;
  onReload: () => void;
  onSaveNow: () => void;
  canSaveNow: boolean;
  onToggleProps: () => void;
  propsActive: boolean;
  notice: string | null;
  onDismissNotice: () => void;
  onSwitchCourse: () => void;
}) {
  const [isPublishing, setIsPublishing] = useState(false);

  // After an edit conflict the button reloads the latest version instead of retrying.
  const isConflict = saveError?.includes("changed somewhere else");

  const handlePublishing = async () => {
    try {
      setIsPublishing(true);

      const response = await fetch(
        `/api/admin/courses/${course?._id}/publish`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      const result = await response?.json();

      if (result?.success) {
        setIsPublishing(false);
        toast.success("The Course Published Successfully.");
      } else {
        setIsPublishing(false);
        toast.error(result?.message);
      }
    } catch (error) {
      toast.error("Something Went Wrong", {
        description:
          "Something Whent Wrong While Publishing the Course, Please try again later.",
      });
    }
  };

  return (
    <header className="border-b bg-background px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-2 hidden sm:block">
        <ol className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <li className="hidden shrink-0 sm:block">
            <Link
              href={ROUTES.dashboard}
              className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Dashboard
            </Link>
          </li>
          <ChevronRight
            className="hidden size-3 shrink-0 sm:block"
            aria-hidden
          />
          <li className="shrink-0">
            <Link
              href={ROUTES.courses}
              className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              All Courses
            </Link>
          </li>
          <ChevronRight className="size-3 shrink-0" aria-hidden />
          <li className="min-w-0 truncate">{course?.title ?? "…"}</li>
          <ChevronRight className="size-3 shrink-0" aria-hidden />
          <li
            className="shrink-0 font-medium text-foreground"
            aria-current="page"
          >
            Content
          </li>
        </ol>
      </nav>

      {/* Course title, status, save state and actions */}
      <div className="flex items-center gap-3">
        {loading ? (
          <Skeleton className="size-10 shrink-0 rounded-md" />
        ) : (
          <CourseThumb src={course?.thumbnail} />
        )}

        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-3.5 w-32" />
            </div>
          ) : (
            <>
              <h1 className="truncate text-base font-semibold tracking-tight">
                {course?.title}
              </h1>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    course && STATUS_DOT[course.status],
                  )}
                  aria-hidden
                />
                <span className="capitalize">{course?.status}</span>
                <span aria-hidden>·</span>
                <span>Editing course content</span>
              </p>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* <div className="mr-2 hidden xl:block">
            <DemoControls />
          </div> */}
          <SaveIndicator state={saveState} />
          {canSaveNow && (
            <Button
              variant="secondary"
              size="sm"
              className="hidden lg:inline-flex"
              onClick={onSaveNow}
            >
              Save changes
            </Button>
          )}

          {saveState === "saved" && (
            <button
              type="button"
              onClick={handlePublishing}
              disabled={isPublishing}
              aria-busy={isPublishing}
              className="flex items-center flex-row gap-1 bg-black w-max disabled:bg-black/50! disabled:cursor-not-allowed! py-1.5 px-2.5 text-white text-sm rounded cursor-pointer transition hover:bg-black/80"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Publishing...</span>
                </>
              ) : (
                <>
                  <span className="text-sm">Publish</span>
                  <ArrowUpRight className="h-4 w-4" />
                </>
              )}
            </button>
          )}
          <IconButton label="Switch course" onClick={onSwitchCourse}>
            <ArrowLeftRight className="size-4" />
          </IconButton>
          <IconButton
            label="Toggle properties"
            onClick={onToggleProps}
            active={propsActive}
            className="hidden lg:inline-flex"
          >
            <PanelRight className="size-4" />
          </IconButton>
        </div>
      </div>

      {/* Error banner: add / delete / reorder failures */}
      {notice && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">{notice}</p>
          <Button size="sm" variant="outline" onClick={onDismissNotice}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Error banner: save failures */}
      {saveState === "failed" && saveError && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">{saveError}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={isConflict ? onReload : onRetry}
          >
            {isConflict ? "Reload latest" : "Try saving again"}
          </Button>
        </div>
      )}
    </header>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const display = {
    unsaved: {
      icon: <span className="size-2 rounded-full bg-amber-500" />,
      text: "Unsaved changes",
    },
    saving: {
      icon: (
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
      ),
      text: "Saving…",
    },
    saved: {
      icon: <Check className="size-3.5 text-zinc-900!" />,
      text: "Saved",
    },
    failed: {
      icon: <AlertCircle className="size-3.5 text-destructive" />,
      text: "Save failed",
    },
  }[state];

  return (
    <p
      role="status"
      aria-live="polite"
      className="mr-1 flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground"
    >
      {display.icon}
      <span className="max-sm:sr-only">{display.text}</span>
    </p>
  );
}

/* ── Navigator: the left-hand tree of modules and lessons ── */

function Navigator({
  loading,
  modules,
  lessonsByModule,
  draft,
  selection,
  query,
  setQuery,
  collapsed,
  toggle,
  onSelect,
  onAddModule,
  onAddLesson,
  busy,
}: {
  loading: boolean;
  modules: ModuleDTO[];
  lessonsByModule: Map<string, LessonDTO[]>;
  draft: Draft | null;
  selection: Selection | null;
  query: string;
  setQuery: (q: string) => void;
  collapsed: Set<string>;
  toggle: (moduleId: string) => void;
  onSelect: (s: Selection) => void;
  onAddModule: () => void;
  onAddLesson: (moduleId: string, type: LessonType) => void;
  busy: boolean;
}) {
  const search = query.trim().toLowerCase();

  /** Shows the title being typed in the draft instead of the last saved title. */
  const liveTitle = (id: string, savedTitle: string) =>
    draft && draft.value._id === id ? draft.value.title : savedTitle;

  const totalLessons = [...lessonsByModule.values()].reduce(
    (sum, list) => sum + list.length,
    0,
  );

  // One row per module that matches the search (by its own title or a lesson's title).
  const rows = byOrder(modules)
    .map((module) => {
      const allLessons = lessonsByModule.get(module._id) ?? [];
      const moduleMatches = liveTitle(module._id, module.title)
        .toLowerCase()
        .includes(search);
      const shownLessons =
        search && !moduleMatches
          ? allLessons.filter((l) =>
              liveTitle(l._id, l.title).toLowerCase().includes(search),
            )
          : allLessons;
      return {
        module,
        allLessons,
        shownLessons,
        visible: !search || moduleMatches || shownLessons.length > 0,
      };
    })
    .filter((row) => row.visible);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Title, counts and search box */}
      <div className="space-y-3 p-4 pb-3">
        <div>
          <h2 className="text-sm font-semibold">Course structure</h2>
          <p className="text-xs text-muted-foreground">
            {loading
              ? "Loading…"
              : `${modules.length} ${modules.length === 1 ? "module" : "modules"} · ${totalLessons} ${totalLessons === 1 ? "lesson" : "lessons"}`}
          </p>
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search modules and lessons"
            placeholder="Search structure"
            className="h-9 pl-8"
            disabled={loading || modules.length === 0}
          />
        </div>
      </div>

      {/* The tree */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="space-y-4 px-2 pt-1" aria-hidden>
            {[3, 2, 3].map((lessonRows, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-5 w-4/5" />
                {Array.from({ length: lessonRows }).map((_, k) => (
                  <Skeleton key={k} className="ml-5 h-4 w-3/5" />
                ))}
              </div>
            ))}
          </div>
        ) : modules.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No modules yet. Add the first one to begin building.
          </p>
        ) : rows.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm">
            <p className="font-medium">No results for “{query}”</p>
            <p className="mt-1 text-muted-foreground">
              Check the spelling or try a shorter word.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setQuery("")}
            >
              Clear search
            </Button>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {rows.map(({ module, allLessons, shownLessons }) => {
              const isOpen = search ? true : !collapsed.has(module._id);
              const isSelected =
                selection?.kind === "module" && selection.id === module._id;
              const title =
                liveTitle(module._id, module.title) || "Untitled module";

              return (
                <li key={module._id}>
                  {/* Module row: expand toggle, title, lesson count, add-lesson menu */}
                  <div
                    className={cn(
                      "flex items-center rounded-md",
                      isSelected && "bg-accent",
                    )}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10 shrink-0 sm:size-9"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Collapse" : "Expand"} ${title}`}
                      onClick={() => toggle(module._id)}
                    >
                      <ChevronRight
                        className={cn(
                          "size-4 transition-transform motion-reduce:transition-none",
                          isOpen && "rotate-90",
                        )}
                      />
                    </Button>

                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() =>
                        onSelect({ kind: "module", id: module._id })
                      }
                      className="flex min-h-10 min-w-0 flex-1 items-center rounded-md text-left text-sm font-medium sm:min-h-9 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="truncate">{title}</span>
                    </button>

                    <span
                      className="px-1.5 text-xs text-muted-foreground tabular-nums"
                      aria-label={`${allLessons.length} lessons`}
                    >
                      {allLessons.length}
                    </span>

                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-10 shrink-0 sm:size-9"
                              aria-label={`Add lesson to ${title}`}
                              disabled={busy}
                            >
                              <Plus className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent>Add lesson</TooltipContent>
                      </Tooltip>
                      <LessonTypeMenu
                        onPick={(type) => onAddLesson(module._id, type)}
                      />
                    </DropdownMenu>
                  </div>

                  {/* Lesson rows */}
                  {isOpen && (
                    <ul className="mt-0.5 ml-[1.125rem] space-y-0.5 border-l pl-1.5">
                      {allLessons.length === 0 && (
                        <li className="px-2 py-1.5 text-xs text-muted-foreground">
                          No lessons yet
                        </li>
                      )}
                      {shownLessons.map((lesson) => {
                        const Icon = TYPE_META[lesson.type].icon;
                        const lessonSelected =
                          selection?.kind === "lesson" &&
                          selection.id === lesson._id;
                        return (
                          <li key={lesson._id}>
                            <button
                              type="button"
                              aria-current={lessonSelected ? "true" : undefined}
                              onClick={() =>
                                onSelect({ kind: "lesson", id: lesson._id })
                              }
                              className={cn(
                                "flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm sm:min-h-9 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                                lessonSelected && "bg-accent font-medium",
                              )}
                            >
                              <Icon
                                className={cn(
                                  "size-4 shrink-0",
                                  lessonSelected
                                    ? "text-primary"
                                    : "text-muted-foreground",
                                )}
                                aria-hidden
                              />
                              <span className="sr-only">
                                {TYPE_META[lesson.type].label}:
                              </span>
                              <span className="truncate">
                                {liveTitle(lesson._id, lesson.title) ||
                                  "Untitled lesson"}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add module */}
      <div className="border-t p-3">
        <Button
          variant="secondary"
          className="h-10 w-full"
          onClick={onAddModule}
          disabled={loading || busy}
        >
          <Plus className="size-4" /> Add module
        </Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 9. CANVAS & EDITORS (the centre area)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Makes the big title input look like a heading until it is hovered or focused. */
const titleInputClass =
  "h-auto rounded-none border-0 border-b border-transparent bg-transparent px-0 py-1 text-2xl font-semibold tracking-tight shadow-none hover:border-border focus-visible:border-ring focus-visible:ring-0 md:text-2xl";

/** Top row of a canvas: a label on the left, move up / down / delete on the right. */
function Toolbar({
  position,
  busy,
  onMove,
  onDelete,
  noun,
  children,
}: {
  position: Position;
  busy: boolean;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  noun: string; // "module" or "lesson", used in button labels
  children: React.ReactNode;
}) {
  const isFirst = !position || position.index <= 0;
  const isLast = !position || position.index >= position.total - 1;

  return (
    <div className="mb-6 flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
        {children}
      </div>
      <div className="flex shrink-0 items-center">
        <IconButton
          label={`Move ${noun} up`}
          onClick={() => onMove(-1)}
          disabled={busy || isFirst}
        >
          <ArrowUp className="size-4" />
        </IconButton>
        <IconButton
          label={`Move ${noun} down`}
          onClick={() => onMove(1)}
          disabled={busy || isLast}
        >
          <ArrowDown className="size-4" />
        </IconButton>
        <IconButton
          label={`Delete ${noun}`}
          onClick={onDelete}
          disabled={busy}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

/* ── Module canvas ── */

function ModuleCanvas({
  module,
  lessons,
  autoFocus,
  position,
  busy,
  onChange,
  onMove,
  onDelete,
  onOpenLesson,
  onAddLesson,
}: {
  module: ModuleDTO;
  lessons: LessonDTO[];
  autoFocus: boolean;
  position: Position;
  busy: boolean;
  onChange: (module: ModuleDTO) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onOpenLesson: (lessonId: string) => void;
  onAddLesson: (type: LessonType) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <Toolbar
        position={position}
        busy={busy}
        onMove={onMove}
        onDelete={onDelete}
        noun="module"
      >
        <ListTree className="size-4" aria-hidden /> Module{" "}
        {position ? position.index + 1 : ""}
      </Toolbar>

      <Input
        value={module.title}
        onChange={(e) => onChange({ ...module, title: e.target.value })}
        aria-label="Module title"
        placeholder="Module title"
        autoFocus={autoFocus}
        maxLength={120}
        className={titleInputClass}
      />

      <div className="mt-6 space-y-2">
        <Label htmlFor="module-description">What students will cover</Label>
        <Textarea
          id="module-description"
          value={module.description}
          onChange={(e) => onChange({ ...module, description: e.target.value })}
          rows={3}
          className="max-w-prose"
        />
        <p className="text-xs text-muted-foreground">
          A sentence or two that sets expectations for this module.
        </p>
      </div>

      {/* The module's lessons */}
      <section className="mt-10" aria-labelledby="module-lessons">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="module-lessons" className="text-sm font-semibold">
            Lessons ({lessons.length})
          </h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" disabled={busy}>
                <Plus className="size-4" /> Add lesson
              </Button>
            </DropdownMenuTrigger>
            <LessonTypeMenu onPick={onAddLesson} />
          </DropdownMenu>
        </div>

        {lessons.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-8 text-center">
            <p className="text-sm font-medium">This module has no lessons</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Start with a video or a reading to introduce the topic, then add
              an exercise so students can practise.
            </p>
          </div>
        ) : (
          <ul className="divide-y border-y">
            {lessons.map((lesson) => {
              const Icon = TYPE_META[lesson.type].icon;
              return (
                <li key={lesson._id}>
                  <button
                    type="button"
                    onClick={() => onOpenLesson(lesson._id)}
                    className="flex min-h-11 w-full items-center gap-3 px-1 text-left text-sm hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Icon
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {lesson.title || "Untitled lesson"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {TYPE_META[lesson.type].label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ── Lesson canvas ── */

function LessonCanvas({
  lesson,
  moduleTitle,
  autoFocus,
  position,
  busy,
  onChange,
  onMove,
  onDelete,
  onVideoUploadComplete,
  onVideoStatusUpdate,
  onUploadActivity,
}: {
  lesson: LessonDTO;
  moduleTitle: string;
  autoFocus: boolean;
  position: Position;
  busy: boolean;
  onChange: (lesson: LessonDTO) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onVideoUploadComplete: (
    lessonId: string,
    content: VideoContent,
    updatedAt: string,
  ) => void;
  onVideoStatusUpdate: (
    lessonId: string,
    content: VideoContent,
    updatedAt: string,
  ) => void;
  onUploadActivity?: (active: boolean) => void;
}) {
  const Icon = TYPE_META[lesson.type].icon;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <Toolbar
        position={position}
        busy={busy}
        onMove={onMove}
        onDelete={onDelete}
        noun="lesson"
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="shrink-0 font-medium text-foreground">
          {TYPE_META[lesson.type].label}
        </span>
        <span className="truncate">in {moduleTitle || "Untitled module"}</span>
      </Toolbar>

      <Input
        value={lesson.title}
        onChange={(e) => onChange({ ...lesson, title: e.target.value })}
        aria-label="Lesson title"
        placeholder="Lesson title"
        autoFocus={autoFocus}
        maxLength={140}
        className={titleInputClass}
      />

      {/* The editor that matches the lesson's type */}
      <div className="mt-8 space-y-8">
        {lesson.type === "video" && (
          <VideoEditor
            courseId={lesson.courseId}
            moduleId={lesson.moduleId}
            lessonId={lesson._id}
            content={lesson.content}
            onChange={(content) => onChange({ ...lesson, content })}
            onUploadComplete={(content, updatedAt) =>
              onVideoUploadComplete(lesson._id, content, updatedAt)
            }
            onVideoStatusUpdate={(content, updatedAt) =>
              onVideoStatusUpdate(lesson._id, content, updatedAt)
            }
            onUploadActivity={onUploadActivity}
          />
        )}
        {lesson.type === "reading" && (
          <ReadingEditor
            content={lesson.content}
            onChange={(content) => onChange({ ...lesson, content })}
          />
        )}
        {lesson.type === "quiz" && (
          <ExerciseEditor
            content={lesson.content}
            onChange={(content) => onChange({ ...lesson, content })}
          />
        )}
      </div>
    </div>
  );
}

/* ── Small building blocks shared by the editors ── */

/** A label + input + optional hint line. */
function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Move up / move down / remove buttons for one item in a list. */
function ItemBar({
  label,
  index,
  total,
  onMove,
  onRemove,
}: {
  label: string;
  index: number;
  total: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center">
      <IconButton
        label={`Move ${label} up`}
        onClick={() => onMove(-1)}
        disabled={index === 0}
      >
        <ArrowUp className="size-4" />
      </IconButton>
      <IconButton
        label={`Move ${label} down`}
        onClick={() => onMove(1)}
        disabled={index === total - 1}
      >
        <ArrowDown className="size-4" />
      </IconButton>
      <IconButton
        label={`Remove ${label}`}
        onClick={onRemove}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </IconButton>
    </div>
  );
}

/** "Sections (3)" heading with an add button. */
function ListHeader({
  title,
  count,
  addLabel,
  onAdd,
}: {
  title: string;
  count: number;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold">
        {title} ({count})
      </h2>
      <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
        <Plus className="size-4" /> {addLabel}
      </Button>
    </div>
  );
}

function EmptyList({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed px-4 py-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

/* ── Video editor ── */

function VideoEditor({
  courseId,
  moduleId,
  lessonId,
  content,
  onChange,
  onUploadComplete,
  onVideoStatusUpdate,
  onUploadActivity,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  content: VideoContent;
  onChange: (content: VideoContent) => void;
  onUploadComplete: (content: VideoContent, updatedAt: string) => void;
  onVideoStatusUpdate: (content: VideoContent, updatedAt: string) => void;
  onUploadActivity?: (active: boolean) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  /** Upload progress in percent, or null when nothing is uploading. */
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadPhase, setUploadPhase] = useState<
    "preparing" | "uploading" | null
  >(null);
  const [serverVideo, setServerVideo] = useState<VideoAsset | null>(
    content.video,
  );
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<{
    playbackId: string;
    playbackToken: string;
  } | null>(null);

  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  /**
   * The upload finishes later, so it must use the newest content and onChange,
   * not the ones from the render that started it (the admin may have typed
   * a description in the meantime).
   */
  const latest = useRef({
    content,
    onChange,
    onUploadComplete,
    onVideoStatusUpdate,
  });
  // Async upload and polling callbacks must retain the latest editor values.
  // eslint-disable-next-line react-hooks/refs
  latest.current = { content, onChange, onUploadComplete, onVideoStatusUpdate };

  // Cancel an unfinished upload when this editor closes (for example another lesson is opened).
  useEffect(() => () => abort.current?.abort(), []);

  // The file transfer and Mux processing are separate. Poll the admin content
  // endpoint while Mux is processing so the UI changes to Ready/Failed without
  // requiring a page refresh. This is status polling, not autosave.
  useEffect(() => {
    const shouldPollVideo =
      !!serverVideo &&
      (["waiting_upload", "processing"].includes(serverVideo.status) ||
        content.transcriptStatus === "processing");
    if (!shouldPollVideo) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await api.getContent(courseId);
        const remote = response.lessons.find(
          (item) => item._id === lessonId && item.type === "video",
        );
        if (remote && remote.type === "video" && !disposed) {
          setServerVideo(remote.content.video);
          latest.current.onVideoStatusUpdate(remote.content, remote.updatedAt);
        }
      } catch {
        // A temporary status-read failure must not interrupt an active upload.
      }
      if (!disposed) timer = setTimeout(poll, 5000);
    };

    timer = setTimeout(poll, 2500);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [courseId, lessonId, serverVideo?.status, content.transcriptStatus]);

  useEffect(() => {
    if (
      content.video &&
      (!serverVideo || content.video.status !== serverVideo.status)
    ) {
      setServerVideo(content.video);
    }
  }, [content.video?.status, content.video?.fileName]);

  const pickFile = () => fileInput.current?.click();

  const upload = async (file: File) => {
    const problem = validateVideoFile(file);
    if (problem) return setError(problem);

    setError(null);
    setProgress(0);
    setPreview(null);
    setPreviewError(null);
    setUploadPhase("preparing");
    const controller = new AbortController();
    abort.current = controller;
    onUploadActivity?.(true);

    try {
      const { video, lessonUpdatedAt } = await api.uploadVideo(
        courseId,
        moduleId,
        lessonId,
        file,
        {
          onProgress: setProgress,
          onPhase: setUploadPhase,
          onUploadCreated: (video, updatedAt) => {
            setServerVideo(video);
            setActiveUploadId(video.muxUploadId ?? null);
            latest.current.onUploadComplete(
              { ...latest.current.content, video },
              updatedAt,
            );
          },
          signal: controller.signal,
        },
      );
      setServerVideo(video);
    } catch (e) {
      if (!controller.signal.aborted) setError(errMsg(e));
    } finally {
      onUploadActivity?.(false);
      setProgress(null);
      setUploadPhase(null);
      setActiveUploadId(null);
      if (abort.current === controller) abort.current = null;
    }
  };

  const handlePreview = async () => {
    if (isLoadingPreview) return;

    setIsLoadingPreview(true);
    setPreviewError(null);

    try {
      const result = await getAdminVideoPreviewToken({
        courseId,
        moduleId,
        lessonId,
      });

      setPreview(result);
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error?.message
          : "Could not load video preview.",
      );
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const cancelUpload = async () => {
    const uploadId = activeUploadId;
    if (!uploadId || isCancelling) return;

    setIsCancelling(true);
    // Keep Save and navigation blocked until the server confirms the cancellation.
    onUploadActivity?.(true);
    abort.current?.abort();
    setProgress(null);
    setUploadPhase(null);

    try {
      const result = await api.cancelVideoUpload(
        courseId,
        moduleId,
        lessonId,
        uploadId,
      );
      setServerVideo(result.video);
      latest.current.onUploadComplete(
        { ...latest.current.content, video: result.video },
        result.lessonUpdatedAt,
      );
    } catch (e) {
      setError(
        `The browser upload was stopped, but Mux could not confirm cancellation. ${errMsg(e)}`,
      );
    } finally {
      setActiveUploadId(null);
      setIsCancelling(false);
      onUploadActivity?.(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the admin pick the same file again later
    if (file) void upload(file);
  };

  const percent = progress ?? 0;

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept={VIDEO_UPLOAD.accept}
        className="hidden"
        onChange={handleFile}
      />

      <div className="space-y-3">
        {progress !== null || isCancelling ? (
          /* 1. Preparing, uploading or cancelling */
          <div className="flex aspect-video min-h-44 w-full flex-col items-center justify-center gap-3 rounded-md bg-muted px-6 text-center">
            <Loader2
              className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none"
              aria-hidden
            />
            <p className="text-sm font-medium">
              {isCancelling
                ? "Cancelling upload…"
                : uploadPhase === "preparing"
                  ? "Preparing secure upload…"
                  : `Uploading… ${percent}%`}
            </p>
            <div
              role="progressbar"
              aria-label={
                uploadPhase === "preparing"
                  ? "Preparing upload"
                  : "Upload progress"
              }
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-background"
            >
              <div
                className="h-full bg-primary transition-[width] motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={cancelUpload}
              disabled={!activeUploadId || isCancelling}
            >
              {isCancelling
                ? "Cancelling…"
                : activeUploadId
                  ? "Cancel upload"
                  : "Preparing…"}
            </Button>
          </div>
        ) : serverVideo && serverVideo.status !== "not_uploaded" ? (
          /* 2. A video is attached or processing */
          <>
            {serverVideo.status === "ready" && preview ? (
              <MuxAdminPreviewPlayer
                playbackId={preview.playbackId}
                playbackToken={preview.playbackToken}
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-md bg-muted text-center">
                <div>
                  <Video
                    className="mx-auto size-8 text-muted-foreground"
                    aria-hidden
                  />

                  <p className="mt-2 text-sm font-medium">
                    {serverVideo.status === "ready"
                      ? "Video is ready"
                      : serverVideo.status === "errored"
                        ? "Video processing failed"
                        : "Video is processing"}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Only authorized administrators can preview this video.
                  </p>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate text-sm font-medium">
                  {serverVideo.fileName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {serverVideo.sizeBytes
                    ? formatBytes(serverVideo.sizeBytes)
                    : "Processing video metadata"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10"
                  onClick={pickFile}
                >
                  <Upload className="size-4" /> Replace
                </Button>
                {serverVideo.status === "ready" &&
                  serverVideo.muxPlaybackId && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10"
                      onClick={preview ? () => setPreview(null) : handlePreview}
                      disabled={isLoadingPreview}
                    >
                      {isLoadingPreview
                        ? "Loading preview..."
                        : preview
                          ? "Close preview"
                          : "Preview video"}
                    </Button>
                  )}
              </div>
              {previewError && (
                <p role="alert" className="text-sm text-destructive">
                  {previewError}
                </p>
              )}
            </div>
          </>
        ) : (
          /* 3. No video yet */
          <button
            type="button"
            onClick={pickFile}
            className="flex aspect-video min-h-44 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed bg-muted/40 px-6 text-center transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Upload className="size-6 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Upload a video</span>
            <span className="max-w-xs text-sm text-muted-foreground">
              {VIDEO_UPLOAD.label}, up to {VIDEO_UPLOAD.maxSizeMB} MB. Tap to
              choose a file.
            </span>
          </button>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <Field
        label="About this video"
        id="v-desc"
        hint="A short summary students read before they press play."
      >
        <Textarea
          id="v-desc"
          rows={3}
          value={content.description}
          className="max-w-prose"
          onChange={(e) =>
            onChange({ ...content, description: e.target.value })
          }
        />
      </Field>

      <Field
        label="Transcript (optional)"
        id="v-tr"
        hint="Helps students who can't listen and lets them search the lesson."
      >
        <Textarea
          id="v-tr"
          rows={8}
          value={content.transcript}
          className="max-w-prose leading-relaxed"
          onChange={(e) => onChange({ ...content, transcript: e.target.value })}
        />
      </Field>
    </>
  );
}

/* ── Reading editor ── */

function ReadingEditor({
  content,
  onChange,
}: {
  content: ReadingContent;
  onChange: (content: ReadingContent) => void;
}) {
  const setSections = (sections: ReadingContent["sections"]) =>
    onChange({ ...content, sections });

  return (
    <>
      <Field
        label="Introduction"
        id="r-intro"
        hint="Tell students what they'll learn and why it matters."
      >
        <Textarea
          id="r-intro"
          rows={3}
          value={content.intro}
          className="max-w-prose"
          onChange={(e) => onChange({ ...content, intro: e.target.value })}
        />
      </Field>

      <section className="space-y-6" aria-label="Sections">
        <ListHeader
          title="Sections"
          count={content.sections.length}
          addLabel="Add section"
          onAdd={() =>
            setSections([
              ...content.sections,
              { _id: uid(), heading: "", body: "" },
            ])
          }
        />

        {content.sections.length === 0 && (
          <EmptyList
            title="No sections yet"
            body="Break the reading into sections, each with its own heading and text."
          />
        )}

        {content.sections.map((section, i) => (
          // min-w-0: a <fieldset> otherwise grows wider than a phone screen.
          <fieldset
            key={section._id}
            className="min-w-0 space-y-3 border-l-2 pl-3 sm:pl-4"
          >
            <legend className="sr-only">Section {i + 1}</legend>

            {/* Row 1: the section's number and its move / remove buttons */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Section {i + 1}</p>
              <ItemBar
                label={`section ${i + 1}`}
                index={i}
                total={content.sections.length}
                onMove={(direction) =>
                  setSections(moveItem(content.sections, i, direction))
                }
                onRemove={() => setSections(removeAt(content.sections, i))}
              />
            </div>

            <Field label="Heading" id={`r-h-${section._id}`}>
              <Input
                id={`r-h-${section._id}`}
                value={section.heading}
                onChange={(e) =>
                  setSections(
                    patchAt(content.sections, i, { heading: e.target.value }),
                  )
                }
              />
            </Field>

            <Field label="Text" id={`r-b-${section._id}`}>
              <Textarea
                id={`r-b-${section._id}`}
                rows={8}
                value={section.body}
                className="max-w-prose leading-relaxed"
                onChange={(e) =>
                  setSections(
                    patchAt(content.sections, i, { body: e.target.value }),
                  )
                }
              />
            </Field>
          </fieldset>
        ))}
      </section>
    </>
  );
}

/* ── Exercise editor ── */

function ExerciseEditor({
  content,
  onChange,
}: {
  content: QuizContent;
  onChange: (content: QuizContent) => void;
}) {
  const setQuestions = (questions: QuizContent["questions"]) =>
    onChange({ ...content, questions });

  /** A blank question with two empty options and no correct answer chosen. */
  const newQuestion = (): QuizContent["questions"][number] => ({
    _id: uid(),
    prompt: "",
    options: [
      { _id: uid(), text: "" },
      { _id: uid(), text: "" },
    ],
    correctOptionId: null,
    explanation: "",
  });

  return (
    <>
      <Field
        label="Instructions"
        id="q-ins"
        hint="Explain how students should answer and how the exercise is scored."
      >
        <Textarea
          id="q-ins"
          rows={3}
          value={content.instructions}
          className="max-w-prose"
          onChange={(e) =>
            onChange({ ...content, instructions: e.target.value })
          }
        />
      </Field>

      <Field
        label="Passing score (%)"
        id="q-pass"
        hint="Students need at least this percentage of correct answers to pass."
      >
        <Input
          id="q-pass"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          className="w-32"
          value={content.passingScore}
          onChange={(e) =>
            onChange({
              ...content,
              // Keep the score between 0 and 100; treat invalid input as 0.
              passingScore: Math.min(
                100,
                Math.max(0, Number(e.target.value) || 0),
              ),
            })
          }
        />
      </Field>

      <Field
        label="Time limit (minutes)"
        id="q-time-limit"
        hint="Leave empty for an untimed quiz."
      >
        <Input
          id="q-time-limit"
          type="number"
          inputMode="numeric"
          min={1}
          max={600}
          className="w-32"
          value={content.timeLimitMinutes ?? ""}
          onChange={(e) => {
            const value = e.target.value.trim();
            onChange({
              ...content,
              timeLimitMinutes:
                value === ""
                  ? null
                  : Math.min(600, Math.max(1, Number(value) || 1)),
            });
          }}
        />
      </Field>

      <section className="space-y-8" aria-label="Questions">
        <ListHeader
          title="Questions"
          count={content.questions.length}
          addLabel="Add question"
          onAdd={() => setQuestions([...content.questions, newQuestion()])}
        />

        {content.questions.length === 0 && (
          <EmptyList
            title="No questions yet"
            body="Add a question, write its options, then mark the correct one."
          />
        )}

        {content.questions.map((question, i) => {
          /** Updates just this question. */
          const updateQuestion = (patch: Partial<typeof question>) =>
            setQuestions(patchAt(content.questions, i, patch));

          return (
            // min-w-0: a <fieldset> otherwise grows wider than a phone screen.
            <fieldset
              key={question._id}
              className="min-w-0 space-y-4 border-l-2 pl-3 sm:pl-4"
            >
              <legend className="sr-only">Question {i + 1}</legend>

              {/* Row 1: the question's number and its move / remove buttons */}
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Question {i + 1}</p>
                <ItemBar
                  label={`question ${i + 1}`}
                  index={i}
                  total={content.questions.length}
                  onMove={(direction) =>
                    setQuestions(moveItem(content.questions, i, direction))
                  }
                  onRemove={() => setQuestions(removeAt(content.questions, i))}
                />
              </div>

              <Field label="Question text" id={`q-p-${question._id}`}>
                <Textarea
                  id={`q-p-${question._id}`}
                  rows={2}
                  value={question.prompt}
                  onChange={(e) => updateQuestion({ prompt: e.target.value })}
                />
              </Field>

              {/* Options: choose the correct one with the radio button */}
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Options — select the correct answer
                </p>

                {question.options.map((option, k) => (
                  <div key={option._id} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${question._id}`}
                      checked={question.correctOptionId === option._id}
                      onChange={() =>
                        updateQuestion({ correctOptionId: option._id })
                      }
                      aria-label={`Mark option ${k + 1} as correct`}
                      className="size-5 shrink-0 accent-[var(--primary)]"
                    />
                    <Input
                      className="min-w-0 flex-1"
                      value={option.text}
                      aria-label={`Option ${k + 1}`}
                      onChange={(e) =>
                        updateQuestion({
                          options: patchAt(question.options, k, {
                            text: e.target.value,
                          }),
                        })
                      }
                    />
                    <IconButton
                      label={`Remove option ${k + 1}`}
                      disabled={question.options.length <= 2}
                      onClick={() =>
                        updateQuestion({
                          options: removeAt(question.options, k),
                          // If the removed option was the correct one, clear the answer.
                          correctOptionId:
                            question.correctOptionId === option._id
                              ? null
                              : question.correctOptionId,
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  className="h-10"
                  disabled={question.options.length >= 6}
                  onClick={() =>
                    updateQuestion({
                      options: [...question.options, { _id: uid(), text: "" }],
                    })
                  }
                >
                  <Plus className="size-4" /> Add option
                </Button>

                {question.correctOptionId === null && (
                  <p className="text-xs text-amber-700">
                    Select the correct option before publishing this course.
                  </p>
                )}
              </div>

              <Field
                label="Explanation"
                id={`q-x-${question._id}`}
                hint="Shown to students after they answer."
              >
                <Textarea
                  id={`q-x-${question._id}`}
                  rows={2}
                  value={question.explanation}
                  onChange={(e) =>
                    updateQuestion({ explanation: e.target.value })
                  }
                />
              </Field>
            </fieldset>
          );
        })}
      </section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 10. PROPERTIES (right-hand settings panel)
 * ═══════════════════════════════════════════════════════════════════════════ */

function Properties({
  loading,
  draft,
  modules,
  position,
  parentModule,
  lessonCount,
  onType,
  onMinutes,
  onMoveTo,
  busy,
}: {
  loading: boolean;
  draft: Draft | null;
  modules: ModuleDTO[];
  position: Position;
  parentModule?: ModuleDTO;
  lessonCount: number;
  onType: (type: LessonType) => void;
  onMinutes: (minutes: number | null) => void;
  onMoveTo: (moduleId: string) => void;
  busy: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-5 p-4" aria-hidden>
        <Skeleton className="h-5 w-28" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="p-4">
        <h2 className="text-sm font-semibold">Properties</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a module or lesson to see its settings.
        </p>
      </div>
    );
  }

  const positionText = position
    ? `${position.index + 1} of ${position.total}`
    : "—";

  return (
    <div className="space-y-5 p-4">
      <h2 className="text-sm font-semibold">
        {draft.kind === "lesson" ? "Lesson settings" : "Module settings"}
      </h2>

      {draft.kind === "lesson" ? (
        <>
          <Field label="Lesson type" id="p-type">
            <Select
              value={draft.value.type}
              onValueChange={(value) => onType(value as LessonType)}
            >
              <SelectTrigger id="p-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {TYPE_META[type].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Module"
            id="p-mod"
            hint="Moving a lesson places it last in the new module."
          >
            <Select
              value={parentModule?._id}
              onValueChange={onMoveTo}
              disabled={busy}
            >
              <SelectTrigger id="p-mod" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {byOrder(modules).map((module) => (
                  <SelectItem key={module._id} value={module._id}>
                    {module.title || "Untitled module"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Estimated minutes" id="p-min">
            <Input
              id="p-min"
              type="number"
              inputMode="numeric"
              min={0}
              max={600}
              value={draft.value.estimatedMinutes ?? ""}
              onChange={(e) =>
                onMinutes(
                  e.target.value === ""
                    ? null
                    : Math.max(0, Number(e.target.value)),
                )
              }
            />
          </Field>
        </>
      ) : (
        <dl className="text-sm">
          <dt className="text-muted-foreground">Lessons</dt>
          <dd className="mb-3 font-medium">{lessonCount}</dd>
        </dl>
      )}

      <dl className="space-y-3 border-t pt-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Position</dt>
          <dd className="font-medium">{positionText}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last saved</dt>
          <dd className="font-medium">{formatDate(draft.value.updatedAt)}</dd>
        </div>
      </dl>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 11. SHARED UI & COURSE PICKER
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Centred icon + title + text + optional button, for empty and error states. */
function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
      <Icon className="mb-4 size-6 text-muted-foreground" aria-hidden />
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Grey placeholder blocks shown in the centre area while the course loads. */
function CanvasSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-8 sm:py-10"
      aria-busy="true"
      aria-label="Loading content"
    >
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-3/4" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-20 w-full max-w-prose" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-40 w-full max-w-prose" />
      </div>
    </div>
  );
}

/** The course's thumbnail, or a book icon when it has none. */
function CourseThumb({ src, className }: { src?: string; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        className={cn(
          "size-10 shrink-0 rounded-md bg-muted object-cover",
          className,
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
        className,
      )}
      aria-hidden
    >
      <BookOpen className="size-4" />
    </div>
  );
}

/* ── Course picker: the first screen ── */

type PickerState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; courses: CourseSummary[] };

function CoursePicker({ onPick }: { onPick: (courseId: string) => void }) {
  const [state, setState] = useState<PickerState>({ status: "loading" });
  const [query, setQuery] = useState("");

  const loadCourses = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const { courses } = await api.getCourses();
      setState({ status: "ready", courses });
    } catch (e) {
      setState({ status: "error", message: errMsg(e) });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCourses();
  }, [loadCourses]);

  const search = query.trim().toLowerCase();
  const courses = state.status === "ready" ? state.courses : [];
  const shown = search
    ? courses.filter((c) => c.title.toLowerCase().includes(search))
    : courses;

  return (
    <div className="flex min-h-[calc(100dvh-var(--admin-header-height,0px))] flex-col bg-background">
      {/* Breadcrumbs + demo controls */}
      <header className="flex items-center justify-between gap-3 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <li className="hidden sm:block">
              <Link
                href={ROUTES.dashboard}
                className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Dashboard
              </Link>
            </li>
            <ChevronRight className="hidden size-3 sm:block" aria-hidden />
            <li>
              <Link
                href={ROUTES.courses}
                className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                All Courses
              </Link>
            </li>
            <ChevronRight className="size-3" aria-hidden />
            <li className="font-medium text-foreground" aria-current="page">
              Content
            </li>
          </ol>
        </nav>
        {/* <div className="hidden sm:block">
          <DemoControls />
        </div> */}
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          Choose a course
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Pick the course whose modules and lessons you want to edit. You can
          switch to another course at any time.
        </p>

        {/* Search */}
        <div className="relative mt-6">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search courses"
            placeholder="Search courses"
            className="h-10 pl-8"
            disabled={state.status !== "ready" || courses.length === 0}
          />
        </div>

        <div className="mt-4">
          {/* Loading */}
          {state.status === "loading" && (
            <ul
              className="divide-y border-y"
              aria-busy="true"
              aria-label="Loading courses"
            >
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <Skeleton className="size-12 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Error */}
          {state.status === "error" && (
            <EmptyState
              icon={AlertCircle}
              title="We couldn't load your courses"
              body={state.message}
              action={
                <Button onClick={() => void loadCourses()}>
                  <RotateCw className="size-4" /> Try again
                </Button>
              }
            />
          )}

          {/* No courses exist */}
          {state.status === "ready" && courses.length === 0 && (
            <EmptyState
              icon={BookOpen}
              title="You haven't created a course yet"
              body="Content lives inside a course. Create your first course, then come back here to add modules and lessons."
              action={
                <Button asChild>
                  <Link href={ROUTES.addCourse}>
                    <Plus className="size-4" /> Create a course
                  </Link>
                </Button>
              }
            />
          )}

          {/* Search has no matches */}
          {state.status === "ready" &&
            courses.length > 0 &&
            shown.length === 0 && (
              <div className="py-10 text-center text-sm">
                <p className="font-medium">No courses match “{query}”</p>
                <p className="mt-1 text-muted-foreground">
                  Check the spelling or try a shorter word.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setQuery("")}
                >
                  Clear search
                </Button>
              </div>
            )}

          {/* The list */}
          {state.status === "ready" && shown.length > 0 && (
            <ul className="divide-y border-y">
              {shown.map((course) => (
                <li key={course._id}>
                  <button
                    type="button"
                    onClick={() => course._id && onPick(course._id)}
                    className="flex min-h-16 w-full items-center gap-3 px-1 py-2 text-left hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <CourseThumb src={course.thumbnail} className="size-12" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {course.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            STATUS_DOT[course.status],
                          )}
                          aria-hidden
                        />
                        <span className="capitalize">{course.status}</span>
                        {course.moduleCount !== undefined &&
                          course.lessonCount !== undefined && (
                            <>
                              <span aria-hidden>·</span>
                              <span>
                                {course.moduleCount}{" "}
                                {course.moduleCount === 1
                                  ? "module"
                                  : "modules"}
                                , {course.lessonCount}{" "}
                                {course.lessonCount === 1
                                  ? "lesson"
                                  : "lessons"}
                              </span>
                            </>
                          )}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
