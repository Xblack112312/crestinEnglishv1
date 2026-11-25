/* Dummy data for the Overview dashboard. Replace with real queries later. */

export type EnrollmentTrendPoint = {
  month: string;
  enrollments: number;
};

export type EnrollmentStatus = "Active" | "Completed" | "Pending";

export type Enrollment = {
  id: string;
  student: string;
  email: string;
  course: string;
  /** ISO date (YYYY-MM-DD) */
  enrolledAt: string;
  /** 0 – 100 */
  progress: number;
  status: EnrollmentStatus;
};

export const chartData: EnrollmentTrendPoint[] = [
  { month: "Jun", enrollments: 0 },
  { month: "Jul", enrollments: 0 },
  { month: "Aug", enrollments: 0 },
  { month: "Sep", enrollments: 0 },
  { month: "Oct", enrollments: 0 },
  { month: "Nov", enrollments: 0 },
  { month: "Dec", enrollments: 0 },
];

export const enrollments: Enrollment[] = [
  {
    id: "ENR-001",
    student: "Ahmed Hassan",
    email: "ahmed@example.com",
    course: "English Grammar",
    enrolledAt: "2026-11-09",
    progress: 75,
    status: "Active",
  },
  {
    id: "ENR-002",
    student: "Sara Mohamed",
    email: "sara@example.com",
    course: "German A2",
    enrolledAt: "2026-11-08",
    progress: 45,
    status: "Active",
  },
  {
    id: "ENR-003",
    student: "Omar Ali",
    email: "omar@example.com",
    course: "Mathematics",
    enrolledAt: "2026-11-07",
    progress: 100,
    status: "Completed",
  },
  {
    id: "ENR-004",
    student: "Mariam Khaled",
    email: "mariam.k@example.com",
    course: "Science: Physics & Chemistry Foundations",
    enrolledAt: "2026-11-06",
    progress: 12,
    status: "Pending",
  },
  {
    id: "ENR-005",
    student: "Youssef Ibrahim",
    email: "youssef@example.com",
    course: "ICT Fundamentals",
    enrolledAt: "2026-11-05",
    progress: 62,
    status: "Active",
  },
  {
    id: "ENR-006",
    student: "Nour El-Din Abdelrahman",
    email: "nour.abdelrahman@example.com",
    course: "English Grammar",
    enrolledAt: "2026-11-04",
    progress: 100,
    status: "Completed",
  },
  {
    id: "ENR-007",
    student: "Hana Mostafa",
    email: "hana@example.com",
    course: "German A2",
    enrolledAt: "2026-11-02",
    progress: 28,
    status: "Active",
  },
  {
    id: "ENR-008",
    student: "Karim Adel",
    email: "karim@example.com",
    course: "Mathematics",
    enrolledAt: "2026-11-01",
    progress: 0,
    status: "Pending",
  },
];