"use client";

// ============================================================================
// Imports
// ============================================================================
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ChangeEvent, DragEvent, FormEvent, KeyboardEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ImagePlus,
  Info,
  Landmark,
  LayoutDashboard,
  Link2,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  School,
  Target,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useRouter } from "next/navigation";

// ============================================================================
// Types and constants
// ============================================================================
type EducationSystem = "general" | "azhar";
type CourseStatus = "draft" | "published" | "archived";
type ListField = "learningOutcomes" | "requirements";

interface CourseFormValues {
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  price: string;
  billingIntervalDays: string;
  targetGrades: number[];
  targetEducationSystems: EducationSystem[];
  learningOutcomes: string[];
  requirements: string[];
  status: CourseStatus;
}

/**
 * Local-only thumbnail state. `thumbnail` / `thumbnailPublicId` strings on the
 * Course model are produced by a real upload later; this page only keeps the
 * selected File and its temporary object URL.
 */
interface ThumbnailSelection {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

type FormErrors = Partial<
  Record<
    | "title"
    | "slug"
    | "shortDescription"
    | "price"
    | "billingIntervalDays"
    | "targetGrades"
    | "targetEducationSystems",
    string
  >
>;

interface SubmittedSummary {
  title: string;
  slug: string;
  grades: number[];
  systems: EducationSystem[];
  price: number;
  billingIntervalDays: number;
  status: CourseStatus;
}

interface EducationSystemOption {
  value: EducationSystem;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface ListSectionConfig {
  field: ListField;
  label: string;
  description: string;
  placeholder: string;
  addLabel: string;
  itemNoun: string;
  emptyTitle: string;
  emptyHint: string;
  optional: boolean;
  icon: LucideIcon;
}

const GRADES = [7, 8, 9, 10, 11, 12] as const;

const EDUCATION_SYSTEMS: ReadonlyArray<EducationSystemOption> = [
  {
    value: "general",
    label: "General Education",
    description: "Ministry of Education curriculum",
    icon: School,
  },
  {
    value: "azhar",
    label: "Al-Azhar Education",
    description: "Al-Azhar schools curriculum",
    icon: Landmark,
  },
];

const LIST_SECTIONS: ReadonlyArray<ListSectionConfig> = [
  {
    field: "learningOutcomes",
    label: "Learning outcomes",
    description:
      "What students will be able to do after completing this course.",
    placeholder: "e.g. Use the present perfect tense accurately in writing",
    addLabel: "Add outcome",
    itemNoun: "outcome",
    emptyTitle: "No outcomes yet",
    emptyHint: "Three to five clear, measurable outcomes work best.",
    optional: true,
    icon: Target,
  },
  {
    field: "requirements",
    label: "Requirements",
    description:
      "What students should know or have before starting. Leave empty if there are none.",
    placeholder: "e.g. Basic familiarity with English sentence structure",
    addLabel: "Add requirement",
    itemNoun: "requirement",
    emptyTitle: "No prerequisites",
    emptyHint: "Students can start this course without any prior knowledge.",
    optional: true,
    icon: ListChecks,
  },
];

const TITLE_MIN = 3;
const TITLE_MAX = 120;
const SLUG_MAX = 120;
const SHORT_DESCRIPTION_MAX = 250;
const LIST_ITEM_MAX = 200;
const MAX_LIST_ITEMS = 12;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

const FIELD_ORDER: ReadonlyArray<keyof FormErrors> = [
  "title",
  "slug",
  "shortDescription",
  "price",
  "billingIntervalDays",
  "targetGrades",
  "targetEducationSystems",
];

const FIELD_FOCUS_IDS: Record<keyof FormErrors, string> = {
  title: "course-title",
  slug: "course-slug",
  shortDescription: "short-description",
  price: "course-price",
  billingIntervalDays: "billing-interval-days",
  targetGrades: `grade-option-${GRADES[0]}`,
  targetEducationSystems: `system-option-${EDUCATION_SYSTEMS[0].value}`,
};

const INITIAL_VALUES: CourseFormValues = {
  title: "",
  slug: "",
  shortDescription: "",
  description: "",
  price: "",
  billingIntervalDays: "30",
  targetGrades: [],
  targetEducationSystems: [],
  learningOutcomes: [],
  requirements: [],
  status: "draft",
};

const SECTION_CLASS =
  "grid gap-6 py-8 first:pt-0 xl:grid-cols-[240px_minmax(0,1fr)] xl:gap-12";

const DRAFT_PILL_CLASS =
  "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset ring-border";

const MOBILE_QUERY = "(max-width: 767px)";

// ============================================================================
// Plain helper functions (no components, no hooks)
// ============================================================================
function subscribeToMobileQuery(onChange: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getMobileSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

// Server render and hydration always start as "not mobile", so no mismatch.
function getServerMobileSnapshot() {
  return false;
}

/** Title -> slug: lowercase, ASCII, hyphen-separated, no repeats or edge hyphens. */
function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

/** Cleans manual slug typing without fighting the user (keeps a trailing hyphen). */
function sanitizeSlugInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** [7, 8, 9, 12] -> "Grades 7–9, 12" */
function formatGrades(grades: number[]): string {
  if (grades.length === 0) return "";
  const sorted = [...grades].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = 0;
  while (start < sorted.length) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) {
      end += 1;
    }
    parts.push(
      end - start >= 2
        ? `${sorted[start]}–${sorted[end]}`
        : sorted.slice(start, end + 1).join(", "),
    );
    start = end + 1;
  }
  return `${sorted.length === 1 ? "Grade" : "Grades"} ${parts.join(", ")}`;
}

function getSystemLabel(system: EducationSystem): string {
  return (
    EDUCATION_SYSTEMS.find((option) => option.value === system)?.label ?? system
  );
}

function validateCourse(values: CourseFormValues): FormErrors {
  const errors: FormErrors = {};
  const title = values.title.trim();

  if (!title) {
    errors.title = "Enter a course title.";
  } else if (title.length < TITLE_MIN) {
    errors.title = `Course title must be at least ${TITLE_MIN} characters.`;
  } else if (title.length > TITLE_MAX) {
    errors.title = `Course title must be ${TITLE_MAX} characters or fewer.`;
  }

  if (!values.slug) {
    errors.slug = "Enter a slug for the course URL.";
  } else if (!SLUG_PATTERN.test(values.slug)) {
    errors.slug =
      "Use lowercase letters and numbers separated by single hyphens, e.g. english-grammar-masterclass.";
  } else if (values.slug.length > SLUG_MAX) {
    errors.slug = `Slug must be ${SLUG_MAX} characters or fewer.`;
  }

  if (values.shortDescription.trim().length > SHORT_DESCRIPTION_MAX) {
    errors.shortDescription = `Short description must be ${SHORT_DESCRIPTION_MAX} characters or fewer.`;
  }

  // Price validation
  const price = Number(values.price);

  if (values.price.trim() === "" || !Number.isFinite(price) || price < 0) {
    errors.price = "Enter a valid course price.";
  }

  // Billing interval validation
  const billingIntervalDays = Number(values.billingIntervalDays);

  if (
    values.billingIntervalDays.trim() === "" ||
    !Number.isInteger(billingIntervalDays) ||
    billingIntervalDays < 1
  ) {
    errors.billingIntervalDays =
      "Billing interval must be a whole number of at least 1 day.";
  }

  if (values.targetGrades.length === 0) {
    errors.targetGrades = "Select at least one grade.";
  }

  if (values.targetEducationSystems.length === 0) {
    errors.targetEducationSystems = "Select at least one education system.";
  }

  return errors;
}

/** Plain function returning JSX (not a component) to keep error markup consistent. */
function renderFieldError(id: string, message?: string) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

interface CloudinarySignature {
  cloudName: string;
  apiKey: string;
  signature: string;
  timestamp: number;
  folder: string;
  public_id: string;
  allowed_formats: string;
  overwrite: boolean;
}

interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

async function uploadCourseThumbnail(
  file: File,
): Promise<CloudinaryUploadResult> {
  // Request a signature from your Next.js server.
  const signatureResponse = await fetch("/api/cloudinary/signature", {
    method: "POST",
  });

  const signatureData = await signatureResponse.json();

  if (!signatureResponse.ok) {
    throw new Error(
      signatureData?.error || "Could not authorize image upload.",
    );
  }

  const config = signatureData as CloudinarySignature;

  // Prepare the signed upload.
  const formData = new FormData();

  formData.append("file", file);
  formData.append("api_key", config.apiKey);
  formData.append("timestamp", String(config.timestamp));
  formData.append("signature", config.signature);
  formData.append("folder", config.folder);
  formData.append("public_id", config.public_id);
  formData.append("allowed_formats", config.allowed_formats);
  formData.append("overwrite", String(config.overwrite));

  // Upload directly to Cloudinary.
  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  const result = await uploadResponse.json();

  if (!uploadResponse.ok) {
    throw new Error(result.error?.message || "Image upload failed.");
  }

  if (!result.secure_url || !result.public_id) {
    throw new Error("Cloudinary returned an invalid upload response.");
  }

  return result as CloudinaryUploadResult;
}

interface CreateCourseResponse {
  success: boolean;
  message: string;
  course: {
    id: string;
    title: string;
    slug: string;
    status: "draft";
  };
}

// ============================================================================
// Main page component
// ============================================================================
const AddCoursePage = () => {
  // --------------------------------------------------------------------------
  // Form state
  // --------------------------------------------------------------------------
  const [values, setValues] = useState<CourseFormValues>(INITIAL_VALUES);
  const [slugEdited, setSlugEdited] = useState(false);
  const [touched, setTouched] = useState<
    Partial<Record<keyof FormErrors, boolean>>
  >({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const [submissionStage, setSubmissionStage] = useState<
    "idle" | "uploading-thumbnail" | "creating-course"
  >("idle");

  const [thumbnail, setThumbnail] = useState<ThumbnailSelection | null>(null);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [isProcessingThumbnail, setIsProcessingThumbnail] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [successOpen, setSuccessOpen] = useState(false);
  const [submittedSummary, setSubmittedSummary] =
    useState<SubmittedSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const topRef = useRef<HTMLElement>(null);

  const isMobile = useSyncExternalStore(
    subscribeToMobileQuery,
    getMobileSnapshot,
    getServerMobileSnapshot,
  );

  const router = useRouter();

  // Revoke the last preview URL when the page unmounts.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  // --------------------------------------------------------------------------
  // Validation logic
  // --------------------------------------------------------------------------
  const errors = useMemo(() => validateCourse(values), [values]);

  const showError = (field: keyof FormErrors): string | undefined =>
    submitAttempted || touched[field] ? errors[field] : undefined;

  const markTouched = (field: keyof FormErrors) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  const isDirty =
    values.title !== "" ||
    values.slug !== "" ||
    values.shortDescription !== "" ||
    values.description !== "" ||
    values.price !== INITIAL_VALUES.price ||
    values.billingIntervalDays !== INITIAL_VALUES.billingIntervalDays ||
    values.targetGrades.length > 0 ||
    values.targetEducationSystems.length > 0 ||
    values.learningOutcomes.length > 0 ||
    values.requirements.length > 0 ||
    thumbnail !== null;

  function setField<K extends keyof CourseFormValues>(
    key: K,
    value: CourseFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function focusIfPending(key: string) {
    return (element: HTMLElement | null) => {
      if (element && pendingFocusRef.current === key) {
        pendingFocusRef.current = null;
        element.focus();
      }
    };
  }

  // --------------------------------------------------------------------------
  // Slug generation and handling
  // --------------------------------------------------------------------------
  function handleTitleChange(event: ChangeEvent<HTMLInputElement>) {
    const title = event.target.value;
    setValues((prev) => ({
      ...prev,
      title,
      // Never overwrite a slug the administrator edited by hand.
      slug: slugEdited ? prev.slug : slugify(title),
    }));
  }

  function handleSlugChange(event: ChangeEvent<HTMLInputElement>) {
    setSlugEdited(true);
    setField("slug", sanitizeSlugInput(event.target.value));
  }

  function handleSlugBlur() {
    setField("slug", values.slug.replace(/-+$/, ""));
    markTouched("slug");
  }

  function regenerateSlug() {
    setSlugEdited(false);
    setField("slug", slugify(values.title));
  }

  // --------------------------------------------------------------------------
  // Image selection and preview handling
  // --------------------------------------------------------------------------
  async function processThumbnailFile(file: File) {
    if (isProcessingThumbnail) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setThumbnailError(
        "Unsupported file type. Choose a JPG, PNG or WebP image.",
      );
      return;
    }
    if (file.size > MAX_THUMBNAIL_BYTES) {
      setThumbnailError(
        `This image is ${formatBytes(file.size)}. The maximum size is ${formatBytes(MAX_THUMBNAIL_BYTES)}.`,
      );
      return;
    }

    setThumbnailError(null);
    setIsProcessingThumbnail(true);
    const nextUrl = URL.createObjectURL(file);

    try {
      const image = new Image();
      image.src = nextUrl;
      // Decode locally to read dimensions; the short minimum delay keeps the
      // loading state from flashing for small files.
      await Promise.all([
        image.decode(),
        new Promise<void>((resolve) => setTimeout(resolve, 350)),
      ]);

      const previousUrl = previewUrlRef.current;
      previewUrlRef.current = nextUrl;
      setThumbnail({
        file,
        previewUrl: nextUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      if (previousUrl) URL.revokeObjectURL(previousUrl);
    } catch {
      URL.revokeObjectURL(nextUrl);
      setThumbnailError("This image could not be read. Try a different file.");
    } finally {
      setIsProcessingThumbnail(false);
    }
  }

  function handleThumbnailInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file
    if (file) void processThumbnailFile(file);
  }

  function handleThumbnailDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (isProcessingThumbnail) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void processThumbnailFile(file);
  }

  function handleThumbnailDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!isProcessingThumbnail) setIsDragging(true);
  }

  function handleThumbnailDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  }

  function removeThumbnail() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setThumbnail(null);
    setThumbnailError(null);
  }

  // --------------------------------------------------------------------------
  // Target audience handling
  // --------------------------------------------------------------------------
  function toggleGrade(grade: number) {
    markTouched("targetGrades");
    setValues((prev) => ({
      ...prev,
      targetGrades: prev.targetGrades.includes(grade)
        ? prev.targetGrades.filter((item) => item !== grade)
        : [...prev.targetGrades, grade].sort((a, b) => a - b),
    }));
  }

  function setAllGrades(selectAll: boolean) {
    markTouched("targetGrades");
    setField("targetGrades", selectAll ? [...GRADES] : []);
  }

  function toggleSystem(system: EducationSystem) {
    markTouched("targetEducationSystems");
    setValues((prev) => {
      const next = prev.targetEducationSystems.includes(system)
        ? prev.targetEducationSystems.filter((item) => item !== system)
        : [...prev.targetEducationSystems, system];
      // Keep a stable, duplicate-free order.
      return {
        ...prev,
        targetEducationSystems: EDUCATION_SYSTEMS.map(
          (option) => option.value,
        ).filter((value) => next.includes(value)),
      };
    });
  }

  const audienceCount =
    values.targetGrades.length * values.targetEducationSystems.length;

  // --------------------------------------------------------------------------
  // Dynamic list handling
  // --------------------------------------------------------------------------
  function addListItem(field: ListField) {
    if (values[field].length >= MAX_LIST_ITEMS) return;
    pendingFocusRef.current = `${field}-${values[field].length}`;
    setValues((prev) => ({ ...prev, [field]: [...prev[field], ""] }));
  }

  function updateListItem(field: ListField, index: number, value: string) {
    setValues((prev) => ({
      ...prev,
      [field]: prev[field].map((item, i) => (i === index ? value : item)),
    }));
  }

  function removeListItem(field: ListField, index: number) {
    const remaining = values[field].length - 1;
    pendingFocusRef.current =
      remaining > 0 ? `${field}-${Math.max(0, index - 1)}` : `add-${field}`;
    setValues((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  }

  function handleListItemKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    field: ListField,
    index: number,
  ) {
    if (event.key !== "Enter") return;
    event.preventDefault(); // Enter must not submit the whole form.
    const inputs = event.currentTarget
      .closest("ul")
      ?.querySelectorAll<HTMLInputElement>("input");
    const next = inputs?.[index + 1];
    if (next) {
      next.focus();
      return;
    }
    if (values[field][index].trim() !== "") addListItem(field);
  }

  // --------------------------------------------------------------------------
  // Form submission and reset
  // --------------------------------------------------------------------------
  function focusField(field: keyof FormErrors) {
    const element = document.getElementById(FIELD_FOCUS_IDS[field]);
    if (!element) return;
    element.scrollIntoView({ block: "center" });
    element.focus({ preventScroll: true });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || isProcessingThumbnail) return;

    setSubmitAttempted(true);
    setSubmissionError(null);

    const currentErrors = validateCourse(values);
    const firstInvalid = FIELD_ORDER.find((field) => currentErrors[field]);

    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Prepare clean course information.
      const cleaned: CourseFormValues = {
        ...values,
        title: values.title.trim(),
        slug: values.slug.trim(),
        shortDescription: values.shortDescription.trim(),
        description: values.description.trim(),

        learningOutcomes: values.learningOutcomes
          .map((item) => item.trim())
          .filter(Boolean),

        requirements: values.requirements
          .map((item) => item.trim())
          .filter(Boolean),

        status: "draft",
      };

      // 2. Upload thumbnail to Cloudinary if one was selected.
      let uploadedThumbnail: CloudinaryUploadResult | null = null;

      if (thumbnail) {
        setSubmissionStage("uploading-thumbnail");

        uploadedThumbnail = await uploadCourseThumbnail(thumbnail.file);
      }

      // 3. Prepare the actual API payload.
      setSubmissionStage("creating-course");

      const payload = {
        title: cleaned.title,
        slug: cleaned.slug,
        shortDescription: cleaned.shortDescription,
        description: cleaned.description,

        price: Number(cleaned.price),
        billingIntervalDays: Number(cleaned.billingIntervalDays),

        thumbnail: uploadedThumbnail?.secure_url ?? "",
        thumbnailPublicId: uploadedThumbnail?.public_id ?? "",

        targetGrades: cleaned.targetGrades,
        targetEducationSystems: cleaned.targetEducationSystems,

        learningOutcomes: cleaned.learningOutcomes,
        requirements: cleaned.requirements,
      };

      // 4. Create course in MongoDB through your API.
      const response = await fetch("/api/courses/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as
        | CreateCourseResponse
        | { error?: string };

      // 5. Handle API errors.
      if (!response.ok) {
        throw new Error(
          "error" in result && result.error
            ? result.error
            : "Failed to create the course.",
        );
      }

      // 6. Verify the successful API response.
      if (
        !("course" in result) ||
        result.success !== true ||
        !result.course?.id
      ) {
        throw new Error("The server returned an invalid response.");
      }

      // 7. Update the page with the created course information.
      setValues(cleaned);

      setSubmittedSummary({
        title: result.course.title,
        slug: result.course.slug,
        grades: [...cleaned.targetGrades],
        systems: [...cleaned.targetEducationSystems],
        price: Number(cleaned.price),
        billingIntervalDays: Number(cleaned.billingIntervalDays),
        status: "draft",
      });

      // 8. Open success interface only after database creation.
      setSuccessOpen(true);
    } catch (error) {
      console.error("Course creation failed:", error);

      setSubmissionError(
        error instanceof Error
          ? error.message
          : "Something went wrong while creating the course.",
      );
    } finally {
      setIsSubmitting(false);
      setSubmissionStage("idle");
    }
  }

  function resetForm() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setValues(INITIAL_VALUES);
    setSlugEdited(false);
    setTouched({});
    setSubmitAttempted(false);
    setThumbnail(null);
    setThumbnailError(null);
    setIsDragging(false);
    setSubmissionError(null);
    setSubmissionStage("idle");
    setSubmittedSummary(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleCreateAnother() {
    setSuccessOpen(false);
    resetForm();
    topRef.current?.scrollIntoView({ block: "start" });
  }

  // --------------------------------------------------------------------------
  // Responsive success Dialog and Drawer
  // --------------------------------------------------------------------------
  // One summary element, rendered inside both the Dialog and the Drawer.
  const summaryBlock = submittedSummary ? (
    <div className="space-y-3">
      <dl className="divide-y rounded-lg border text-sm">
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 px-4 py-3 sm:grid-cols-[104px_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Course</dt>
          <dd className="min-w-0">
            <p className="break-words font-medium">{submittedSummary.title}</p>
            <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
              /{submittedSummary.slug}
            </p>
          </dd>
        </div>
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 px-4 py-3 sm:grid-cols-[104px_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Grades</dt>
          <dd className="flex min-w-0 flex-wrap gap-1.5">
            {submittedSummary.grades.map((grade) => (
              <span
                key={grade}
                className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
              >
                Grade {grade}
              </span>
            ))}
          </dd>
        </div>
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 px-4 py-3 sm:grid-cols-[104px_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Systems</dt>
          <dd className="flex min-w-0 flex-wrap gap-1.5">
            {submittedSummary.systems.map((system) => (
              <span
                key={system}
                className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
              >
                {getSystemLabel(system)}
              </span>
            ))}
          </dd>
        </div>
        <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 px-4 py-3 sm:grid-cols-[104px_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <span className={DRAFT_PILL_CLASS}>
              <span className="size-1.5 rounded-full bg-muted-foreground" />
              Draft
            </span>
          </dd>
        </div>
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 px-4 py-3 sm:grid-cols-[104px_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Price</dt>
          <dd className="font-medium">
            EGP{" "}
            {submittedSummary.price.toLocaleString("en-EG", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}
          </dd>
        </div>

        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 px-4 py-3 sm:grid-cols-[104px_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Billing</dt>
          <dd className="font-medium">
            Every {submittedSummary.billingIntervalDays} days
          </dd>
        </div>
      </dl>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          This is a local demonstration. Nothing has been saved to a database,
          and the course is not published.
        </span>
      </p>
    </div>
  ) : null;

  const successIcon = (
    <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-black text-white">
      <CheckCircle2 className="size-6" aria-hidden="true" />
    </span>
  );

  // --------------------------------------------------------------------------
  // Main JSX
  // --------------------------------------------------------------------------
  const titleLength = values.title.length;
  const shortDescriptionLength = values.shortDescription.length;
  const titleError = showError("title");
  const slugError = showError("slug");
  const shortDescriptionError = showError("shortDescription");
  const gradesError = showError("targetGrades");
  const systemsError = showError("targetEducationSystems");
  const priceError = showError("price");
  const billingIntervalDaysError = showError("billingIntervalDays");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
      {/* ---------------------------------------------------------------- */}
      {/* Page header                                                      */}
      {/* ---------------------------------------------------------------- */}
      <header ref={topRef} className="mb-8 space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem
              onClick={() => router.replace("/dashboard")}
              className="cursor-pointer! hover:text-black/70!"
            >
              <LayoutDashboard size={14} /> Dashboard
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem
              onClick={() => router.replace("/dashboard/courses")}
              className="cursor-pointer! hover:text-black/70"
            >
              All Courses
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Add Course</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create a Course
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Set up your course, define its target audience, and provide students
            with the information they need to get started.
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit} noValidate aria-label="Create course">
        <fieldset
          disabled={isSubmitting}
          className="m-0 min-w-0 divide-y border-0 p-0"
        >
          {/* ============================================================ */}
          {/* SECTION A — BASIC INFORMATION                                 */}
          {/* ============================================================ */}
          <section aria-labelledby="section-basic" className={SECTION_CLASS}>
            <div className="space-y-1">
              <h2 id="section-basic" className="text-base font-semibold">
                Basic information
              </h2>
              <p className="text-sm text-muted-foreground">
                The name and description students see first.
              </p>
            </div>

            <div className="min-w-0 space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <Label htmlFor="course-title" className="text-sm font-medium">
                    Course title{" "}
                    <span className="text-destructive" aria-hidden="true">
                      *
                    </span>
                  </Label>
                  <span
                    id="course-title-count"
                    className={cn(
                      "text-xs tabular-nums",
                      titleLength > TITLE_MAX
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {titleLength}/{TITLE_MAX}
                  </span>
                </div>
                <Input
                  id="course-title"
                  value={values.title}
                  maxLength={TITLE_MAX}
                  onChange={handleTitleChange}
                  onBlur={() => markTouched("title")}
                  placeholder="e.g. English Grammar Masterclass"
                  autoComplete="off"
                  aria-required="true"
                  aria-invalid={Boolean(titleError)}
                  aria-describedby={cn(
                    "course-title-count",
                    titleError && "course-title-error",
                  )}
                  className={cn(
                    "h-12 text-base font-medium",
                    titleError &&
                      "border-destructive focus-visible:ring-destructive/30",
                  )}
                />
                {renderFieldError("course-title-error", titleError)}
              </div>

              {/* Slug */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="course-slug" className="text-sm font-medium">
                    Course slug{" "}
                    <span className="text-destructive" aria-hidden="true">
                      *
                    </span>
                  </Label>
                  {slugEdited && values.title.trim() ? (
                    <button
                      type="button"
                      onClick={regenerateSlug}
                      className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <RefreshCw className="size-3" aria-hidden="true" />
                      Regenerate from title
                    </button>
                  ) : null}
                </div>
                <div className="flex">
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">
                    <Link2 className="size-4" aria-hidden="true" />
                    <span aria-hidden="true">…/</span>
                  </span>
                  <Input
                    id="course-slug"
                    value={values.slug}
                    onChange={handleSlugChange}
                    maxLength={SLUG_MAX}
                    onBlur={handleSlugBlur}
                    placeholder="english-grammar-masterclass"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-required="true"
                    aria-invalid={Boolean(slugError)}
                    aria-describedby={cn(
                      "course-slug-help",
                      slugError && "course-slug-error",
                    )}
                    className={cn(
                      "min-w-0 rounded-l-none font-mono text-sm",
                      slugError &&
                        "border-destructive focus-visible:ring-destructive/30",
                    )}
                  />
                </div>
                <p
                  id="course-slug-help"
                  className="text-xs text-muted-foreground"
                >
                  Used at the end of the course URL. Generated from the title
                  until you edit it. Uniqueness is not checked in this preview.
                </p>
                {renderFieldError("course-slug-error", slugError)}
              </div>

              {/* Short description */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <Label
                    htmlFor="short-description"
                    className="text-sm font-medium"
                  >
                    Short description{" "}
                    <span className="font-normal text-muted-foreground">
                      · Optional
                    </span>
                  </Label>
                  <span
                    id="short-description-count"
                    className={cn(
                      "text-xs tabular-nums",
                      shortDescriptionLength > SHORT_DESCRIPTION_MAX
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {shortDescriptionLength}/{SHORT_DESCRIPTION_MAX}
                  </span>
                </div>
                <Textarea
                  id="short-description"
                  value={values.shortDescription}
                  maxLength={SHORT_DESCRIPTION_MAX}
                  onChange={(event) =>
                    setField("shortDescription", event.target.value)
                  }
                  onBlur={() => markTouched("shortDescription")}
                  placeholder="One or two sentences that summarize the course."
                  rows={3}
                  aria-invalid={Boolean(shortDescriptionError)}
                  aria-describedby={cn(
                    "short-description-help short-description-count",
                    shortDescriptionError && "short-description-error",
                  )}
                  className={cn(
                    "min-h-24 resize-y",
                    shortDescriptionError &&
                      "border-destructive focus-visible:ring-destructive/30",
                  )}
                />
                <p
                  id="short-description-help"
                  className="text-xs text-muted-foreground"
                >
                  Shown on course listings, so keep it brief and clear.
                </p>
                {renderFieldError(
                  "short-description-error",
                  shortDescriptionError,
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">
                  Description{" "}
                  <span className="font-normal text-muted-foreground">
                    · Optional
                  </span>
                </Label>
                <Textarea
                  id="description"
                  value={values.description}
                  onChange={(event) =>
                    setField("description", event.target.value)
                  }
                  placeholder="Describe what the course covers, how it is structured, and who it is designed for."
                  className="min-h-44 resize-y leading-relaxed"
                />
              </div>

              {/* Course Price */}
              <div className="space-y-2">
                <Label htmlFor="course-price" className="text-sm font-medium">
                  Course Price (EGP){" "}
                  <span className="text-destructive" aria-hidden="true">
                    *
                  </span>
                </Label>

                <Input
                  id="course-price"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={values.price}
                  onChange={(event) => setField("price", event.target.value)}
                  onBlur={() => markTouched("price")}
                  placeholder="e.g. 499"
                  autoComplete="off"
                  aria-required="true"
                  aria-invalid={Boolean(priceError)}
                  aria-describedby={cn(
                    "course-price-help",
                    priceError && "course-price-error",
                  )}
                  className={cn(
                    "h-12 text-base font-medium",
                    priceError &&
                      "border-destructive focus-visible:ring-destructive/30",
                  )}
                />

                <p
                  id="course-price-help"
                  className="text-xs text-muted-foreground"
                >
                  Enter 0 for a free course.
                </p>

                {renderFieldError("course-price-error", priceError)}
              </div>

              {/* Billing Interval */}
              <div className="space-y-2">
                <Label
                  htmlFor="billing-interval-days"
                  className="text-sm font-medium"
                >
                  Billing Interval (Days){" "}
                  <span className="text-destructive" aria-hidden="true">
                    *
                  </span>
                </Label>

                <Input
                  id="billing-interval-days"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={values.billingIntervalDays}
                  onChange={(event) =>
                    setField("billingIntervalDays", event.target.value)
                  }
                  onBlur={() => markTouched("billingIntervalDays")}
                  placeholder="e.g. 30"
                  autoComplete="off"
                  aria-required="true"
                  aria-invalid={Boolean(billingIntervalDaysError)}
                  aria-describedby={cn(
                    "billing-interval-help",
                    billingIntervalDaysError && "billing-interval-error",
                  )}
                  className={cn(
                    "h-12 text-base font-medium",
                    billingIntervalDaysError &&
                      "border-destructive focus-visible:ring-destructive/30",
                  )}
                />

                <p
                  id="billing-interval-help"
                  className="text-xs text-muted-foreground"
                >
                  Number of days between recurring payments. For example, 30
                  means students are billed every 30 days.
                </p>

                {renderFieldError(
                  "billing-interval-error",
                  billingIntervalDaysError,
                )}
              </div>
            </div>
          </section>

          {/* ============================================================ */}
          {/* SECTION B — COURSE THUMBNAIL                                  */}
          {/* ============================================================ */}
          <section
            aria-labelledby="section-thumbnail"
            className={SECTION_CLASS}
          >
            <div className="space-y-1">
              <h2 id="section-thumbnail" className="text-base font-semibold">
                Course thumbnail
              </h2>
              <p className="text-sm text-muted-foreground">
                The cover image shown on course cards. You can add it later.
              </p>
            </div>

            <div className="min-w-0 space-y-3">
              <div
                onDragEnter={handleThumbnailDragOver}
                onDragOver={handleThumbnailDragOver}
                onDragLeave={handleThumbnailDragLeave}
                onDrop={handleThumbnailDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  onChange={handleThumbnailInputChange}
                  className="hidden"
                  tabIndex={-1}
                  aria-hidden="true"
                />

                {thumbnail ? (
                  <div
                    className={cn(
                      "flex flex-col gap-4 rounded-xl border p-3 transition-colors sm:flex-row sm:items-center",
                      isDragging && "border-primary bg-primary/5",
                    )}
                  >
                    <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border bg-muted sm:w-64">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbnail.previewUrl}
                        alt="Selected course thumbnail preview"
                        className="size-full object-cover"
                      />
                      {isProcessingThumbnail ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                          <Loader2
                            className="size-5 animate-spin text-muted-foreground"
                            aria-label="Processing image"
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-medium">
                          {thumbnail.file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(thumbnail.file.size)} · {thumbnail.width}
                          ×{thumbnail.height}px
                        </p>
                        <p className="text-xs text-muted-foreground">
                          This course will be saved as a draft. Add your
                          learning content first, then publish it when
                          you&apos;re ready.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 sm:h-9"
                          disabled={isProcessingThumbnail}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <ImagePlus aria-hidden="true" />
                          Replace
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-10 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-9"
                          disabled={isProcessingThumbnail}
                          onClick={removeThumbnail}
                        >
                          <Trash2 aria-hidden="true" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isProcessingThumbnail}
                    onClick={() => fileInputRef.current?.click()}
                    aria-describedby="thumbnail-help"
                    className={cn(
                      "flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center transition-colors",
                      "hover:border-foreground/30 hover:bg-muted/40",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      "disabled:cursor-wait disabled:opacity-80",
                      isDragging && "border-primary bg-primary/5",
                      thumbnailError && "border-destructive/60",
                    )}
                  >
                    <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      {isProcessingThumbnail ? (
                        <Loader2
                          className="size-5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <UploadCloud className="size-5" aria-hidden="true" />
                      )}
                    </span>
                    <span className="space-y-1">
                      <span className="block text-sm font-medium">
                        {isProcessingThumbnail
                          ? "Reading image…"
                          : isDragging
                            ? "Drop the image to select it"
                            : "Click to choose an image, or drag and drop"}
                      </span>
                      <span
                        id="thumbnail-help"
                        className="block text-xs text-muted-foreground"
                      >
                        JPG, PNG or WebP · up to{" "}
                        {formatBytes(MAX_THUMBNAIL_BYTES)} · 16:9 recommended
                      </span>
                    </span>
                  </button>
                )}
              </div>
              {renderFieldError("thumbnail-error", thumbnailError ?? undefined)}
            </div>
          </section>

          {/* ============================================================ */}
          {/* SECTION C — TARGET AUDIENCE                                   */}
          {/* ============================================================ */}
          <section aria-labelledby="section-audience" className={SECTION_CLASS}>
            <div className="space-y-1">
              <h2 id="section-audience" className="text-base font-semibold">
                Target audience
              </h2>
              <p className="text-sm text-muted-foreground">
                Choose which grades and education systems this course is for.
                You can select several of each.
              </p>
            </div>

            <div className="min-w-0 space-y-8">
              {/* Grades */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p id="grades-label" className="text-sm font-medium">
                    Grades{" "}
                    <span className="text-destructive" aria-hidden="true">
                      *
                    </span>
                  </p>
                  <div className="flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setAllGrades(true)}
                      disabled={values.targetGrades.length === GRADES.length}
                      className="rounded-sm px-1.5 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
                    >
                      Select all
                    </button>
                    <span className="text-border" aria-hidden="true">
                      |
                    </span>
                    <button
                      type="button"
                      onClick={() => setAllGrades(false)}
                      disabled={values.targetGrades.length === 0}
                      className="rounded-sm px-1.5 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div
                  role="group"
                  aria-labelledby="grades-label"
                  aria-describedby={gradesError ? "grades-error" : undefined}
                  className="grid grid-cols-3 gap-2 sm:grid-cols-6"
                >
                  {GRADES.map((grade) => {
                    const selected = values.targetGrades.includes(grade);
                    return (
                      <button
                        key={grade}
                        id={`grade-option-${grade}`}
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        onClick={() => toggleGrade(grade)}
                        className={cn(
                          "relative flex h-16 flex-col items-center justify-center gap-1 rounded-lg border bg-background text-center transition-colors sm:h-[72px]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          selected
                            ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                            : "hover:border-foreground/30 hover:bg-muted/50",
                        )}
                      >
                        {selected ? (
                          <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check
                              className="size-3"
                              strokeWidth={3}
                              aria-hidden="true"
                            />
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            "text-[11px] font-medium uppercase leading-none tracking-wide",
                            selected
                              ? "text-primary/70"
                              : "text-muted-foreground",
                          )}
                        >
                          Grade
                        </span>
                        <span className="text-xl font-semibold leading-none tabular-nums">
                          {grade}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p aria-live="polite" className="text-xs text-muted-foreground">
                  {values.targetGrades.length > 0 ? (
                    <>
                      Selected:{" "}
                      <span className="font-medium text-foreground">
                        {formatGrades(values.targetGrades)}
                      </span>
                    </>
                  ) : (
                    "No grades selected."
                  )}
                </p>
                {renderFieldError("grades-error", gradesError)}
              </div>

              {/* Education systems */}
              <div className="space-y-3">
                <p id="systems-label" className="text-sm font-medium">
                  Education systems{" "}
                  <span className="text-destructive" aria-hidden="true">
                    *
                  </span>
                </p>

                <div
                  role="group"
                  aria-labelledby="systems-label"
                  aria-describedby={systemsError ? "systems-error" : undefined}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {EDUCATION_SYSTEMS.map((option) => {
                    const selected = values.targetEducationSystems.includes(
                      option.value,
                    );
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        id={`system-option-${option.value}`}
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        onClick={() => toggleSystem(option.value)}
                        className={cn(
                          "flex min-h-[68px] items-center gap-3 rounded-lg border bg-background p-3.5 text-left transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:border-foreground/30 hover:bg-muted/50",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-10 shrink-0 items-center justify-center rounded-md transition-colors",
                            selected
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">
                            {option.label}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input",
                          )}
                        >
                          {selected ? (
                            <Check
                              className="size-3"
                              strokeWidth={3}
                              aria-hidden="true"
                            />
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p aria-live="polite" className="text-xs text-muted-foreground">
                  {values.targetEducationSystems.length > 0 ? (
                    <>
                      Selected:{" "}
                      <span className="font-medium text-foreground">
                        {values.targetEducationSystems
                          .map(getSystemLabel)
                          .join(", ")}
                      </span>
                    </>
                  ) : (
                    "No education systems selected."
                  )}
                </p>
                {renderFieldError("systems-error", systemsError)}
              </div>

              {/* Targeting explanation */}
              <div className="flex gap-3 rounded-lg bg-muted/50 p-4">
                <Info
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-1.5 text-sm">
                  <p className="font-medium">How targeting works</p>
                  <p className="text-muted-foreground">
                    Grades and education systems are chosen independently, then
                    combined. For example, Grades 8 and 9 with General and
                    Al-Azhar targets four groups: Grade 8 General, Grade 8
                    Al-Azhar, Grade 9 General and Grade 9 Al-Azhar.
                  </p>
                  {audienceCount > 0 ? (
                    <p aria-live="polite">
                      Your selection targets{" "}
                      <span className="font-semibold">{audienceCount}</span>{" "}
                      {audienceCount === 1
                        ? "audience group"
                        : "audience groups"}
                      : {formatGrades(values.targetGrades)} ×{" "}
                      {values.targetEducationSystems
                        .map(getSystemLabel)
                        .join(" + ")}
                      .
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {/* ============================================================ */}
          {/* SECTION D — LEARNING INFORMATION                              */}
          {/* ============================================================ */}
          <section aria-labelledby="section-learning" className={SECTION_CLASS}>
            <div className="space-y-1">
              <h2 id="section-learning" className="text-base font-semibold">
                Learning information
              </h2>
              <p className="text-sm text-muted-foreground">
                Help students decide if this course is right for them.
              </p>
            </div>

            <div className="min-w-0 space-y-8">
              {LIST_SECTIONS.map((config) => {
                const items = values[config.field];
                const Icon = config.icon;
                const atLimit = items.length >= MAX_LIST_ITEMS;
                return (
                  <div key={config.field} className="space-y-3">
                    <div className="space-y-0.5">
                      <p
                        id={`${config.field}-label`}
                        className="text-sm font-medium"
                      >
                        {config.label}
                        {config.optional ? (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · Optional
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {config.description}
                      </p>
                    </div>

                    {items.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-5 text-center sm:flex-row sm:text-left">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {config.emptyTitle}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {config.emptyHint}
                          </p>
                        </div>
                        <Button
                          ref={focusIfPending(`add-${config.field}`)}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 w-full sm:h-9 sm:w-auto"
                          onClick={() => addListItem(config.field)}
                        >
                          <Plus aria-hidden="true" />
                          {config.addLabel}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <ul
                          aria-labelledby={`${config.field}-label`}
                          className="space-y-2"
                        >
                          {items.map((item, index) => (
                            <li
                              key={`${config.field}-${index}`}
                              className="flex items-center gap-2"
                            >
                              <span
                                className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
                                aria-hidden="true"
                              >
                                {index + 1}
                              </span>
                              <Input
                                ref={focusIfPending(`${config.field}-${index}`)}
                                value={item}
                                onChange={(event) =>
                                  updateListItem(
                                    config.field,
                                    index,
                                    event.target.value,
                                  )
                                }
                                onKeyDown={(event) =>
                                  handleListItemKeyDown(
                                    event,
                                    config.field,
                                    index,
                                  )
                                }
                                maxLength={LIST_ITEM_MAX}
                                placeholder={config.placeholder}
                                aria-label={`${config.label}, item ${index + 1}`}
                                autoComplete="off"
                                className="h-11 min-w-0 flex-1 text-base sm:h-10 sm:text-sm"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-11 shrink-0 text-muted-foreground hover:text-destructive sm:size-10"
                                onClick={() =>
                                  removeListItem(config.field, index)
                                }
                                aria-label={`Remove ${config.itemNoun} ${index + 1}`}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 w-full sm:h-9 sm:w-auto"
                          disabled={atLimit}
                          onClick={() => addListItem(config.field)}
                        >
                          <Plus aria-hidden="true" />
                          {atLimit
                            ? `Limit of ${MAX_LIST_ITEMS} reached`
                            : `Add another ${config.itemNoun}`}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ============================================================ */}
          {/* STATUS                                                        */}
          {/* ============================================================ */}
          <section aria-labelledby="section-status" className={SECTION_CLASS}>
            <div className="space-y-1">
              <h2 id="section-status" className="text-base font-semibold">
                Status
              </h2>
              <p className="text-sm text-muted-foreground">
                Publishing is a separate step.
              </p>
            </div>
            <div className="min-w-0 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={DRAFT_PILL_CLASS}>
                  <span className="size-1.5 rounded-full bg-muted-foreground" />
                  Draft
                </span>
                <span className="text-muted-foreground">
                  Course setup always starts as a draft.
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                A draft is not visible to students. Add your learning content
                first, then publish when you are ready. This page is a frontend
                demonstration: creating a course builds a local summary and does
                not save or send anything.
              </p>
            </div>
          </section>
        </fieldset>

        {/* -------------------------------------------------------------- */}
        {/* Sticky action bar                                              */}
        {/* -------------------------------------------------------------- */}
        <div className="sticky bottom-0 z-10 border-t bg-background/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto w-full max-w-5xl">
            {submissionError && (
              <div
                role="alert"
                className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p>{submissionError}</p>
              </div>
            )}

            <div className="flex items-center gap-3 sm:justify-end">
              <div className="flex items-center gap-3 sm:justify-end">
                {" "}
                <p className="mr-auto hidden text-xs text-muted-foreground md:block">
                  {" "}
                  New courses are created as drafts
                </p>{" "}
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 sm:h-10"
                  disabled={!isDirty || isSubmitting}
                  onClick={resetForm}
                >
                  {" "}
                  <RotateCcw aria-hidden="true" /> Reset{" "}
                </Button>{" "}
                <Button
                  type="submit"
                  disabled={isSubmitting || isProcessingThumbnail}
                  aria-busy={isSubmitting}
                  className="h-11 flex-1 sm:h-10 sm:min-w-40 sm:flex-none"
                >
                  {" "}
                  {isSubmitting ? (
                    <>
                      {" "}
                      <Loader2
                        className="animate-spin"
                        aria-hidden="true"
                      />{" "}
                      {submissionStage === "uploading-thumbnail"
                        ? "Uploading image…"
                        : "Creating course…"}{" "}
                    </>
                  ) : (
                    "Create Course"
                  )}{" "}
                </Button>{" "}
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* ---------------------------------------------------------------- */}
      {/* Success — Dialog (desktop and tablet, 768px and up)              */}
      {/* ---------------------------------------------------------------- */}
      <Dialog open={successOpen && !isMobile} onOpenChange={setSuccessOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="space-y-6 px-6 pb-6 pt-8">
            <DialogHeader className="items-center text-center sm:text-center">
              {successIcon}
              <DialogTitle className="text-xl">
                Course Created Successfully!
              </DialogTitle>
              <DialogDescription>
                Your course has been created and saved as a draft. You can now
                start adding its learning content.
              </DialogDescription>
            </DialogHeader>
            {summaryBlock}
          </div>
          <DialogFooter className="gap-2 border-t bg-muted/30 px-6 py-4 sm:justify-end">
            <Button variant="outline" onClick={handleCreateAnother}>
              Create Another Course
            </Button>
            <Button asChild>
              <Link href="/courses/content">
                Manage Course Content
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------------------- */}
      {/* Success — Drawer (mobile, below 768px)                           */}
      {/* ---------------------------------------------------------------- */}
      <Drawer open={successOpen && isMobile} onOpenChange={setSuccessOpen}>
        <DrawerContent className="max-h-[90dvh]">
          <div className="flex min-h-0 w-full flex-1 flex-col">
            <DrawerHeader className="items-center px-5 text-center">
              {successIcon}
              <DrawerTitle className="text-xl">
                Course Created Successfully!
              </DrawerTitle>
              <DialogDescription>
                Your course has been created and saved as a draft. You can now
                start adding its learning content.
              </DialogDescription>
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
              {summaryBlock}
            </div>
            <DrawerFooter className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button asChild className="h-12 w-full text-base">
                <Link href="/courses/content">
                  Manage Course Content
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full text-base"
                onClick={handleCreateAnother}
              >
                Create Another Course
              </Button>
              <DrawerClose asChild>
                <Button variant="ghost" className="h-11 w-full">
                  Close
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default AddCoursePage;
