import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/database";

import Course from "@/models/Course";
import User from "@/models/User";
import Enrollment from "@/models/Enrollment";
import Payment from "@/models/Payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentMethod = "card" | "wallet";
type JsonRecord = Record<string, unknown>;

interface PaymobIntentionResponse {
  id?: string;
  intention_order_id?: string | number;
  client_secret?: string;
  payment_keys?: Array<{
    order_id?: string | number;
  }>;
}

interface PaymobAuthResponse {
  token?: string;
}

interface PaymobPlanResponse {
  id?: string | number;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getIntegrationId(name: string): number {
  const value = Number(getRequiredEnv(name));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must contain a valid positive integer.`);
  }
  return value;
}

function getUrl(value: string, name: string, requireHttps: boolean): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !requireHttps)) {
    throw new Error(`${name} must use HTTPS.`);
  }
  return url.toString().replace(/\/+$/, "");
}

function normalizeEgyptianPhone(value: string): string | null {
  const phone = value.replace(/[\s()-]/g, "");

  if (/^01[0125]\d{8}$/.test(phone)) return `+2${phone}`;
  if (/^201[0125]\d{8}$/.test(phone)) return `+${phone}`;
  if (/^\+201[0125]\d{8}$/.test(phone)) return phone;

  return null;
}

function getNameParts(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || "Student";
  const lastName = parts.join(" ") || firstName;
  return { firstName, lastName };
}

async function readJson(response: Response): Promise<JsonRecord | null> {
  const value: unknown = await response.json().catch(() => null);
  return isRecord(value) ? value : null;
}

async function createPaymobAuthToken(apiKey: string): Promise<string> {
  const response = await fetch("https://accept.paymob.com/api/auth/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  const data = (await readJson(response)) as PaymobAuthResponse | null;
  if (!response.ok || typeof data?.token !== "string" || !data.token) {
    console.error("[PAYMOB AUTH TOKEN ERROR]", {
      status: response.status,
      response: data,
    });
    throw new Error("Paymob could not issue an authentication token.");
  }

  return data.token;
}

async function createPaymobSubscriptionPlan(args: {
  apiKey: string;
  motoIntegrationId: number;
  frequency: number;
  amountMinor: number;
  courseTitle: string;
  enrollmentReference: string;
  webhookUrl: string;
}): Promise<string> {
  const authToken = await createPaymobAuthToken(args.apiKey);

  const planPayload = {
    frequency: args.frequency,
    name: `CrestInEnglish - ${args.courseTitle}`.slice(0, 200),
    webhook_url: args.webhookUrl,
    reminder_days: "",
    retrial_days: "",
    plan_type: "rent",
    number_of_deductions: null,
    amount_cents: args.amountMinor,
    use_transaction_amount: false,
    is_active: true,
    integration: args.motoIntegrationId,
    fee: "",
  };

  const response = await fetch(
    "https://accept.paymob.com/api/acceptance/subscription-plans",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(planPayload),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );

  const data = (await readJson(response)) as PaymobPlanResponse | null;
  if (!response.ok || data?.id === undefined || data?.id === null) {
    console.error("[PAYMOB SUBSCRIPTION PLAN ERROR]", {
      status: response.status,
      response: data,
      enrollmentReference: args.enrollmentReference,
    });
    throw new Error("Paymob could not create the subscription plan.");
  }

  return String(data.id);
}

function jsonError(error: string, message: string, status: number) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(request: Request) {
  try {
    // ---------------------------------------------------------
    // 1. Parse and validate the request
    // ---------------------------------------------------------
    const rawBody: unknown = await request.json().catch(() => null);
    if (!isRecord(rawBody)) {
      return jsonError("INVALID_REQUEST", "Invalid request body.", 400);
    }

    const courseId = typeof rawBody.courseId === "string" ? rawBody.courseId.trim() : "";
    const paymentMethod = rawBody.paymentMethod as PaymentMethod;
    const recurringConsent = rawBody.recurringConsent;
    const rawPhoneNumber = typeof rawBody.phoneNumber === "string" ? rawBody.phoneNumber.trim() : "";

    if (!/^[a-f\d]{24}$/i.test(courseId)) {
      return jsonError("INVALID_COURSE_ID", "Invalid course identifier.", 400);
    }

    if (paymentMethod !== "card" && paymentMethod !== "wallet") {
      return jsonError("INVALID_PAYMENT_METHOD", "Invalid payment method.", 400);
    }

    if (paymentMethod === "card" && recurringConsent !== true) {
      return jsonError(
        "RECURRING_CONSENT_REQUIRED",
        "You must authorize recurring card payments to continue.",
        400,
      );
    }

    const phoneNumber = normalizeEgyptianPhone(rawPhoneNumber);
    if (!phoneNumber) {
      return jsonError(
        "INVALID_PHONE_NUMBER",
        "Enter a valid Egyptian mobile number, such as 01012345678.",
        400,
      );
    }

    // ---------------------------------------------------------
    // 2. Authenticate the student and connect to MongoDB
    // ---------------------------------------------------------
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return jsonError("UNAUTHENTICATED", "Authentication required.", 401);
    }

    await connectToDatabase();

    const student = await User.findOne({
      email: session.user.email.toLowerCase(),
    }).select("name email role grade educationSystem onboardingComplete");

    if (!student) {
      return jsonError("STUDENT_NOT_FOUND", "Student account not found.", 404);
    }

    if (student.role !== "student") {
      return jsonError("FORBIDDEN", "Only student accounts can purchase courses.", 403);
    }

    // ---------------------------------------------------------
    // 3. Validate the student's profile
    // ---------------------------------------------------------
    const gradeNumber = Number(student.grade?.replace("grade-", ""));
    const educationSystem = student.educationSystem;

    if (
      !student.onboardingComplete ||
      !Number.isInteger(gradeNumber) ||
      gradeNumber < 7 ||
      gradeNumber > 12 ||
      !educationSystem
    ) {
      return jsonError(
        "PROFILE_INCOMPLETE",
        "Complete your grade and education system before enrolling.",
        422,
      );
    }

    // ---------------------------------------------------------
    // 4. Load the published course and calculate price server-side
    // ---------------------------------------------------------
    const course = await Course.findOne({
      _id: courseId,
      status: "published",
      targetGrades: gradeNumber,
      targetEducationSystems: educationSystem,
    });

    if (!course) {
      return jsonError(
        "COURSE_NOT_AVAILABLE",
        "This course is unavailable or is not intended for your student profile.",
        404,
      );
    }

    const price = Number(course.price);
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      Math.abs(price * 100 - Math.round(price * 100)) > 0.000001
    ) {
      return jsonError(
        "INVALID_COURSE_PRICE",
        "This course does not have valid pricing information.",
        400,
      );
    }

    const amountMinor = Math.round(price * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) {
      return jsonError("INVALID_AMOUNT", "Invalid payment amount.", 400);
    }

    const billingIntervalDays = Number(course.billingIntervalDays);
    if (![7, 15, 30, 60, 90, 180, 360].includes(billingIntervalDays)) {
      return jsonError("INVALID_BILLING_INTERVAL", "Invalid course billing interval.", 400);
    }

    // ---------------------------------------------------------
    // 5. Validate Paymob configuration
    //    MOTO is required only for card subscription setup.
    // ---------------------------------------------------------
    let secretKey: string;
    let publicKey: string;
    let initialIntegrationId: number;
    let appUrl: string;
    let transactionNotificationUrl: string;
    let subscriptionWebhookUrl: string;

    try {
      secretKey = getRequiredEnv("PAYMOB_SECRET_KEY");
      publicKey = getRequiredEnv("PAYMOB_PUBLIC_KEY");

      initialIntegrationId = getIntegrationId(
        paymentMethod === "card"
          ? "PAYMOB_CARD_3DS_INTEGRATION_ID"
          : "PAYMOB_WALLET_INTEGRATION_ID",
      );

      appUrl = getUrl(getRequiredEnv("APP_URL"), "APP_URL", false);
      transactionNotificationUrl = getUrl(
        getRequiredEnv("PAYMOB_NOTIFICATION_URL"),
        "PAYMOB_NOTIFICATION_URL",
        true,
      );
      subscriptionWebhookUrl = getUrl(
        process.env.PAYMOB_SUBSCRIPTION_WEBHOOK_URL?.trim() || transactionNotificationUrl,
        "PAYMOB_SUBSCRIPTION_WEBHOOK_URL",
        true,
      );

      // Payment activation depends on verified callbacks for both methods.
      getRequiredEnv("PAYMOB_HMAC_SECRET");
    } catch (error) {
      console.error("[CHECKOUT CONFIGURATION]", error);
      return jsonError(
        "PAYMOB_NOT_CONFIGURED",
        "Payment checkout is not fully configured. Check your Paymob environment variables.",
        503,
      );
    }

    // ---------------------------------------------------------
    // 6. Check the existing enrollment
    // ---------------------------------------------------------
    const now = new Date();
    let enrollment = await Enrollment.findOne({
      userId: student._id,
      courseId: course._id,
    });

    if (enrollment) {
      const hasActiveAccess =
        enrollment.status === "active" &&
        (!enrollment.currentPeriodEnd || enrollment.currentPeriodEnd > now);

      if (hasActiveAccess) {
        return jsonError("ALREADY_ENROLLED", "You already have access to this course.", 409);
      }

      if (enrollment.status === "suspended") {
        return jsonError(
          "ENROLLMENT_SUSPENDED",
          "Your enrollment is suspended. Please contact support.",
          403,
        );
      }

      if (
        enrollment.paymobSubscriptionId &&
        ["pending", "active", "past_due"].includes(enrollment.paymobSubscriptionStatus)
      ) {
        return jsonError(
          "EXISTING_SUBSCRIPTION",
          "An existing Paymob subscription needs to be resolved before starting another one.",
          409,
        );
      }
    }

    const billingType = paymentMethod === "card" ? "recurring" : "manual";
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const checkoutReference = `crest_${randomUUID()}`;

    // ---------------------------------------------------------
    // 7. Create or reuse the Paymob subscription plan for cards
    // ---------------------------------------------------------
    let paymobPlanId: string | undefined;

    if (paymentMethod === "card") {
      try {
        const motoIntegrationId = getIntegrationId("PAYMOB_CARD_MOTO_INTEGRATION_ID");
        const apiKey = getRequiredEnv("PAYMOB_API_KEY");

        const existingPlanMatches =
          Boolean(enrollment?.paymobPlanId) &&
          enrollment?.amountMinor === amountMinor &&
          enrollment?.billingIntervalDays === billingIntervalDays;

        if (existingPlanMatches && enrollment?.paymobPlanId) {
          paymobPlanId = enrollment.paymobPlanId;
        } else {
          paymobPlanId = await createPaymobSubscriptionPlan({
            apiKey,
            motoIntegrationId,
            frequency: billingIntervalDays,
            amountMinor,
            courseTitle: course.title,
            enrollmentReference: `${student._id}:${course._id}`,
            webhookUrl: subscriptionWebhookUrl,
          });
        }
      } catch (error) {
        console.error("[CHECKOUT SUBSCRIPTION PLAN]", error);
        return jsonError(
          "PAYMOB_SUBSCRIPTION_SETUP_FAILED",
          "We could not prepare the card subscription. Please try again or use a mobile wallet.",
          502,
        );
      }
    }

    // ---------------------------------------------------------
    // 8. Create or reuse the enrollment record
    // ---------------------------------------------------------
    if (enrollment) {
      enrollment.status = "pending_payment";
      enrollment.billingType = billingType;
      enrollment.paymentMethod = paymentMethod;
      enrollment.amountMinor = amountMinor;
      enrollment.currency = "EGP";
      enrollment.billingIntervalDays = billingIntervalDays;

      enrollment.currentPeriodStart = null;
      enrollment.currentPeriodEnd = null;
      enrollment.nextBillingAt = null;
      enrollment.pendingCheckoutExpiresAt = expiresAt;

      enrollment.cancelAtPeriodEnd = false;
      enrollment.cancelledAt = null;
      enrollment.accessRevokedAt = now;
      enrollment.periodVersion += 1;

      enrollment.paymobPlanId = paymobPlanId;
      enrollment.paymobSubscriptionId = undefined;
      enrollment.paymobSubscriptionStatus = paymentMethod === "card" ? "pending" : "not_created";

      await enrollment.save();
    } else {
      enrollment = await Enrollment.create({
        userId: student._id,
        courseId: course._id,
        status: "pending_payment",
        billingType,
        paymentMethod,
        amountMinor,
        currency: "EGP",
        billingIntervalDays,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        nextBillingAt: null,
        periodVersion: 0,
        reminderSentForPeriodVersion: 0,
        paymobPlanId,
        paymobSubscriptionStatus: paymentMethod === "card" ? "pending" : "not_created",
        lastSuccessfulPaymentId: null,
        pendingCheckoutExpiresAt: expiresAt,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        accessRevokedAt: now,
      });
    }

    // ---------------------------------------------------------
    // 9. Cancel older pending attempts for this enrollment
    // ---------------------------------------------------------
    await Payment.updateMany(
      { enrollmentId: enrollment._id, status: "pending" },
      {
        $set: {
          status: "cancelled",
          failureCode: "REPLACED_BY_NEW_CHECKOUT",
          failureMessage: "A newer checkout attempt was created.",
          failedAt: now,
        },
      },
    );

    // ---------------------------------------------------------
    // 10. Create the local payment record
    // ---------------------------------------------------------
    const payment = await Payment.create({
      userId: student._id,
      courseId: course._id,
      enrollmentId: enrollment._id,
      kind: "initial",
      billingType,
      paymentMethod,
      provider: "paymob",
      amountMinor,
      currency: "EGP",
      status: "pending",
      checkoutReference,
      idempotencyKey: checkoutReference,
      billingPeriodStart: null,
      billingPeriodEnd: null,
      paidAt: null,
      failedAt: null,
      expiresAt,
    });

    // ---------------------------------------------------------
    // 11. Build the Paymob Intention
    // ---------------------------------------------------------
    const { firstName, lastName } = getNameParts(student.name);
    const resultUrl = new URL("/checkout/result", appUrl);
    resultUrl.searchParams.set("reference", checkoutReference);

    const intentionPayload: JsonRecord = {
      amount: amountMinor,
      currency: "EGP",
      payment_methods: [initialIntegrationId],
      items: [
        {
          name: course.title,
          amount: amountMinor,
          description: course.shortDescription || course.title,
          quantity: 1,
        },
      ],
      billing_data: {
        apartment: "NA",
        first_name: firstName,
        last_name: lastName,
        street: "NA",
        building: "NA",
        phone_number: phoneNumber,
        city: "Cairo",
        country: "EGY",
        email: student.email,
        floor: "NA",
        postal_code: "NA",
        state: "Cairo",
      },
      extras: {
        crest_payment_id: payment._id.toString(),
        crest_enrollment_id: enrollment._id.toString(),
        crest_course_id: course._id.toString(),
        crest_user_id: student._id.toString(),
        billing_type: billingType,
        payment_method: paymentMethod,
      },
      special_reference: checkoutReference,
      expiration: 1800,
      notification_url: transactionNotificationUrl,
      redirection_url: resultUrl.toString(),
    };

    // Paymob's Subscription Module attaches the plan to the initial
    // customer-present 3DS transaction through subscription_plan_id.
    if (paymentMethod === "card") {
      if (!paymobPlanId) throw new Error("Card checkout has no Paymob plan ID.");
      intentionPayload.subscription_plan_id = Number(paymobPlanId);
    }

    // ---------------------------------------------------------
    // 12. Create the Paymob Intention
    // ---------------------------------------------------------
    let paymobResponse: Response;
    let paymobData: PaymobIntentionResponse | null;

    try {
      paymobResponse = await fetch("https://accept.paymob.com/v1/intention/", {
        method: "POST",
        headers: {
          Authorization: `Token ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(intentionPayload),
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });

      paymobData = (await readJson(paymobResponse)) as PaymobIntentionResponse | null;
    } catch (error) {
      console.error("[PAYMOB INTENTION REQUEST]", error);
      await Payment.updateOne(
        { _id: payment._id, status: "pending" },
        {
          $set: {
            status: "failed",
            failedAt: new Date(),
            failureCode: "PAYMOB_REQUEST_FAILED",
            failureMessage: "Unable to contact Paymob.",
          },
        },
      );
      await Enrollment.updateOne(
        { _id: enrollment._id, status: "pending_payment" },
        { $set: { pendingCheckoutExpiresAt: new Date() } },
      );
      return jsonError(
        "PAYMOB_UNAVAILABLE",
        "We could not connect to the payment provider. Please try again.",
        502,
      );
    }

    if (!paymobResponse.ok || !paymobData?.client_secret || !paymobData?.id) {
      console.error("[PAYMOB INTENTION ERROR]", {
        status: paymobResponse.status,
        response: paymobData,
      });

      await Payment.updateOne(
        { _id: payment._id, status: "pending" },
        {
          $set: {
            status: "failed",
            failedAt: new Date(),
            failureCode: `PAYMOB_${paymobResponse.status}`,
            failureMessage: "Paymob could not create the payment intention.",
          },
        },
      );
      await Enrollment.updateOne(
        { _id: enrollment._id, status: "pending_payment" },
        { $set: { pendingCheckoutExpiresAt: new Date() } },
      );

      return jsonError(
        "PAYMOB_INTENTION_FAILED",
        "The payment provider could not prepare your checkout. Please try again.",
        502,
      );
    }

    const paymobOrderId =
      paymobData.intention_order_id ?? paymobData.payment_keys?.[0]?.order_id;

    if (paymobOrderId === undefined || paymobOrderId === null) {
      console.error("[PAYMOB INTENTION] Response did not include an order ID.");
      await Payment.updateOne(
        { _id: payment._id, status: "pending" },
        {
          $set: {
            status: "failed",
            failedAt: new Date(),
            failureCode: "PAYMOB_ORDER_ID_MISSING",
            failureMessage: "Paymob did not return an order ID.",
          },
        },
      );
      return jsonError(
        "PAYMOB_INVALID_RESPONSE",
        "The payment provider returned an incomplete checkout response.",
        502,
      );
    }

    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: {
          paymobIntentionId: String(paymobData.id),
          paymobOrderId: String(paymobOrderId),
        },
      },
    );

    // ---------------------------------------------------------
    // 13. Return Unified Checkout URL
    // ---------------------------------------------------------
    const checkoutUrl = new URL("https://accept.paymob.com/unifiedcheckout/");
    checkoutUrl.searchParams.set("publicKey", publicKey);
    checkoutUrl.searchParams.set("clientSecret", paymobData.client_secret);

    return NextResponse.json(
      {
        success: true,
        checkoutUrl: checkoutUrl.toString(),
        reference: checkoutReference,
        paymentMethod,
        billingType,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[CHECKOUT CREATE ERROR]", error);

    if (isRecord(error) && error.code === 11000) {
      return jsonError(
        "CHECKOUT_CONFLICT",
        "A checkout for this course is already being processed. Please refresh and try again.",
        409,
      );
    }

    return jsonError(
      "INTERNAL_SERVER_ERROR",
      "Unable to create checkout. Please try again.",
      500,
    );
  }
}
