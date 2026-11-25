
import mongoose, { Document, Schema, Types } from "mongoose";

export type EnrollmentStatus =
  | "pending_payment"
  | "active"
  | "past_due"
  | "expired"
  | "cancelled"
  | "suspended";

export type BillingType = "recurring" | "manual";

export type EnrollmentPaymentMethod = "card" | "wallet";

export type PaymobSubscriptionStatus =
  | "not_created"
  | "pending"
  | "active"
  | "past_due"
  | "cancelled"
  | "suspended"
  | "terminated"
  | "unknown";

export interface IEnrollment extends Document {
  userId: Types.ObjectId;
  courseId: Types.ObjectId;

  status: EnrollmentStatus;

  billingType: BillingType;
  paymentMethod: EnrollmentPaymentMethod;

  amountMinor: number;
  currency: string;
  billingIntervalDays: number;

  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  nextBillingAt: Date | null;

  periodVersion: number;
  reminderSentForPeriodVersion: number;

  paymobSubscriptionId?: string;
  paymobPlanId?: string;
  paymobSubscriptionStatus: PaymobSubscriptionStatus;

  lastSuccessfulPaymentId: Types.ObjectId | null;

  pendingCheckoutExpiresAt: Date | null;

  cancelAtPeriodEnd: boolean;
  cancelledAt: Date | null;

  accessRevokedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const EnrollmentSchema = new Schema<IEnrollment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },

    status: {
      type: String,
      enum: [
        "pending_payment",
        "active",
        "past_due",
        "expired",
        "cancelled",
        "suspended",
      ],
      default: "pending_payment",
      required: true,
    },

    billingType: {
      type: String,
      enum: ["recurring", "manual"],
      required: true,
    },

    paymentMethod: {
      type: String,
      enum: ["card", "wallet"],
      required: true,
    },

    // Price snapshot at the time of enrollment.
    // EGP 300 = 30000 piastres.
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },

    currency: {
      type: String,
      default: "EGP",
      enum: ["EGP"],
      required: true,
    },

    billingIntervalDays: {
      type: Number,
      default: 30,
      min: 1,
      required: true,
    },

    currentPeriodStart: {
      type: Date,
      default: null,
    },

    currentPeriodEnd: {
      type: Date,
      default: null,
    },

    nextBillingAt: {
      type: Date,
      default: null,
    },

    // Increment after each confirmed successful billing period.
    // Used to invalidate old Inngest workflows.
    periodVersion: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Prevent sending duplicate reminders for the same period.
    reminderSentForPeriodVersion: {
      type: Number,
      default: 0,
      min: 0,
    },

    paymobSubscriptionId: {
      type: String,
      trim: true,
    },

    paymobPlanId: {
      type: String,
      trim: true,
    },

    paymobSubscriptionStatus: {
      type: String,
      enum: [
        "not_created",
        "pending",
        "active",
        "past_due",
        "cancelled",
        "suspended",
        "terminated",
        "unknown",
      ],
      default: "not_created",
    },

    lastSuccessfulPaymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },

    pendingCheckoutExpiresAt: {
      type: Date,
      default: null,
    },

    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    accessRevokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// A student should have only one enrollment record per course.
// Reuse that record when they renew or reactivate.
EnrollmentSchema.index(
  { userId: 1, courseId: 1 },
  { unique: true },
);

// Useful for finding enrollments approaching expiration.
EnrollmentSchema.index({
  status: 1,
  currentPeriodEnd: 1,
});

// Useful for retrieving all enrollments belonging to a student.
EnrollmentSchema.index({
  userId: 1,
  status: 1,
});

const Enrollment =
  mongoose.models.Enrollment ||
  mongoose.model<IEnrollment>("Enrollment", EnrollmentSchema);

export default Enrollment;
