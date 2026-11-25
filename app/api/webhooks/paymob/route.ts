import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/database";

import Payment from "@/models/Payment";
import Enrollment from "@/models/Enrollment";
// Keep this import path if your model file is named PaymentWebhookEvent.ts.
import PaymobWebhookEvent from "@/models/PaymentWebhookEvent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type WebhookEventInput = {
  eventKey: string;
  eventType: string;
  payloadHash: string;
  paymentId?: string | null;
  enrollmentId?: string | null;
  transactionId?: string;
  orderId?: string;
  subscriptionId?: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ received: false, error: message }, { status });
}

function receivedResponse(extra: JsonRecord = {}) {
  return NextResponse.json({ received: true, ...extra }, { status: 200 });
}

function isDuplicateKeyError(error: unknown): boolean {
  return isRecord(error) && error.code === 11000;
}

function hmacValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "";
  return String(value);
}

function safeEqualHex(expectedHex: string, receivedHex: string): boolean {
  const normalized = receivedHex.trim().toLowerCase();
  if (!/^[a-f0-9]{128}$/.test(normalized)) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(normalized, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// Paymob transaction callback: HMAC-SHA512 over these exact 20 fields.
function verifyTransactionHmac(
  transaction: JsonRecord,
  receivedHmac: string,
  secret: string,
): boolean {
  const order = isRecord(transaction.order) ? transaction.order : {};
  const sourceData = isRecord(transaction.source_data) ? transaction.source_data : {};

  const fields = [
    transaction.amount_cents,
    transaction.created_at,
    transaction.currency,
    transaction.error_occured,
    transaction.has_parent_transaction,
    transaction.id,
    transaction.integration_id,
    transaction.is_3d_secure,
    transaction.is_auth,
    transaction.is_capture,
    transaction.is_refunded,
    transaction.is_standalone_payment,
    transaction.is_voided,
    order.id,
    transaction.owner,
    transaction.pending,
    sourceData.pan,
    sourceData.sub_type,
    sourceData.type,
    transaction.success,
  ];

  const message = fields.map(hmacValue).join("");
  const expected = createHmac("sha512", secret).update(message).digest("hex");
  return safeEqualHex(expected, receivedHmac);
}

// Paymob card-token callback has a separate 8-field HMAC.
function verifyCardTokenHmac(
  tokenObject: JsonRecord,
  receivedHmac: string,
  secret: string,
): boolean {
  const fields = [
    tokenObject.card_subtype,
    tokenObject.created_at,
    tokenObject.email,
    tokenObject.id,
    tokenObject.masked_pan,
    tokenObject.merchant_id,
    tokenObject.order_id,
    tokenObject.token,
  ];

  const message = fields.map(hmacValue).join("");
  const expected = createHmac("sha512", secret).update(message).digest("hex");
  return safeEqualHex(expected, receivedHmac);
}

// Paymob subscription callback has a separate HMAC formula. Its hmac
// arrives in the JSON body, not as a query-string parameter.
function verifySubscriptionHmac(
  triggerType: string,
  subscriptionId: string,
  receivedHmac: string,
  secret: string,
): boolean {
  const message = `${triggerType}for${subscriptionId}`;
  const expected = createHmac("sha512", secret).update(message).digest("hex");
  return safeEqualHex(expected, receivedHmac);
}

function getExpectedTransactionIntegrationId(
  paymentMethod: "card" | "wallet",
): number | null {
  const name = paymentMethod === "card"
    ? "PAYMOB_CARD_3DS_INTEGRATION_ID"
    : "PAYMOB_WALLET_INTEGRATION_ID";

  const raw = process.env[name]?.trim();
  if (!raw) return null;

  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function mapSubscriptionStatus(value: unknown):
  | "pending"
  | "active"
  | "past_due"
  | "cancelled"
  | "suspended"
  | "terminated"
  | "unknown" {
  const state = String(value ?? "").trim().toLowerCase();

  if (state === "active") return "active";
  if (state === "pending") return "pending";
  if (state === "past_due" || state === "past due") return "past_due";
  if (state === "cancelled" || state === "canceled") return "cancelled";
  if (state === "suspended") return "suspended";
  if (state === "terminated") return "terminated";
  return "unknown";
}

async function beginWebhookEvent(input: WebhookEventInput): Promise<{
  acquired: boolean;
  eventId?: string;
}> {
  try {
    const created = await PaymobWebhookEvent.create({
      eventKey: input.eventKey,
      eventType: input.eventType,
      status: "processing",
      paymentId: input.paymentId ?? null,
      enrollmentId: input.enrollmentId ?? null,
      paymobTransactionId: input.transactionId,
      paymobOrderId: input.orderId,
      paymobSubscriptionId: input.subscriptionId,
      payloadHash: input.payloadHash,
      attempts: 1,
      receivedAt: new Date(),
    });

    return { acquired: true, eventId: created._id.toString() };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }

  const existing = await PaymobWebhookEvent.findOne({ eventKey: input.eventKey });
  if (!existing || existing.status === "processed") return { acquired: false };

  const staleBefore = new Date(Date.now() - 2 * 60 * 1000);
  const reclaimed = await PaymobWebhookEvent.findOneAndUpdate(
    {
      _id: existing._id,
      $or: [
        { status: "failed" },
        { status: "received" },
        { status: "processing", updatedAt: { $lt: staleBefore } },
      ],
    },
    {
      $set: { status: "processing", processedAt: null },
      $unset: { lastError: 1 },
      $inc: { attempts: 1 },
    },
    { new: true },
  );

  return reclaimed
    ? { acquired: true, eventId: reclaimed._id.toString() }
    : { acquired: false };
}

async function markEventProcessed(eventId: string) {
  await PaymobWebhookEvent.updateOne(
    { _id: eventId },
    {
      $set: { status: "processed", processedAt: new Date() },
      $unset: { lastError: 1 },
    },
  );
}

async function handleSubscriptionCallback(body: JsonRecord, payloadHash: string, secret: string) {
  const triggerType = typeof body.trigger_type === "string" ? body.trigger_type : "";
  const subscriptionData = isRecord(body.subscription_data) ? body.subscription_data : null;
  const receivedHmac = typeof body.hmac === "string" ? body.hmac : "";
  const subscriptionId = subscriptionData?.id === undefined ? "" : String(subscriptionData.id);
  const planIdValue = subscriptionData?.plan_id ?? subscriptionData?.subscription_plan_id;
  const planId = planIdValue === undefined || planIdValue === null ? "" : String(planIdValue);

  if (!triggerType || !subscriptionData || !subscriptionId || !planId || !receivedHmac) {
    return errorResponse("Invalid subscription callback payload.", 400);
  }

  if (!verifySubscriptionHmac(triggerType, subscriptionId, receivedHmac, secret)) {
    console.warn("[PAYMOB WEBHOOK] Invalid subscription HMAC.");
    return errorResponse("Invalid subscription HMAC.", 401);
  }

  await connectToDatabase();

  const enrollment = await Enrollment.findOne({
    paymobPlanId: planId,
    billingType: "recurring",
    paymentMethod: "card",
  });

  if (!enrollment) {
    console.error("[PAYMOB WEBHOOK] No enrollment found for subscription plan.", { planId });
    return errorResponse("Enrollment for subscription plan not found.", 404);
  }

  const eventKey = `subscription:${subscriptionId}:${triggerType}:${payloadHash}`;
  const latestPayment = await Payment.findOne({ enrollmentId: enrollment._id })
    .sort({ createdAt: -1 })
    .select("_id");

  const event = await beginWebhookEvent({
    eventKey,
    eventType: triggerType,
    payloadHash,
    paymentId: latestPayment?._id?.toString() ?? null,
    enrollmentId: enrollment._id.toString(),
    subscriptionId,
  });

  if (!event.acquired || !event.eventId) {
    return receivedResponse({ duplicate: true, callbackType: "subscription" });
  }

  try {
    const nextBillingRaw = subscriptionData.next_billing;
    const nextBilling = typeof nextBillingRaw === "string" || typeof nextBillingRaw === "number"
      ? new Date(nextBillingRaw)
      : null;

    const update: JsonRecord = {
      paymobSubscriptionId: subscriptionId,
      paymobSubscriptionStatus: mapSubscriptionStatus(subscriptionData.state),
    };

    if (nextBilling && !Number.isNaN(nextBilling.getTime())) {
      update.nextBillingAt = nextBilling;
    }

    await Enrollment.updateOne({ _id: enrollment._id }, { $set: update });
    await markEventProcessed(event.eventId);

    console.info("[PAYMOB WEBHOOK] Subscription callback processed.", {
      enrollmentId: enrollment._id.toString(),
      subscriptionId,
      triggerType,
    });

    return receivedResponse({ callbackType: "subscription", processed: true });
  } catch (error) {
    await PaymobWebhookEvent.updateOne(
      { _id: event.eventId },
      {
        $set: {
          status: "failed",
          lastError: error instanceof Error ? error.message.slice(0, 1000) : "Unknown subscription callback error.",
        },
      },
    );
    throw error;
  }
}

async function handleTokenCallback(body: JsonRecord, request: Request, secret: string) {
  const tokenObject = isRecord(body.obj) ? body.obj : null;
  const receivedHmac = new URL(request.url).searchParams.get("hmac") ?? "";

  if (!tokenObject || !receivedHmac) {
    return errorResponse("Invalid card-token callback payload.", 400);
  }

  if (!verifyCardTokenHmac(tokenObject, receivedHmac, secret)) {
    console.warn("[PAYMOB WEBHOOK] Invalid card-token HMAC.");
    return errorResponse("Invalid card-token HMAC.", 401);
  }

  // Paymob's Subscription Module manages the card on its side. We do not
  // need to persist the raw token in CrestInEnglish for this architecture.
  return receivedResponse({ callbackType: "card_token", acknowledged: true });
}

async function handleTransactionCallback(
  body: JsonRecord,
  request: Request,
  payloadHash: string,
  secret: string,
) {
  const transaction = isRecord(body.obj) ? body.obj : null;
  const receivedHmac = new URL(request.url).searchParams.get("hmac") ?? "";

  if (!transaction || !receivedHmac) {
    return errorResponse("Invalid transaction callback payload.", 400);
  }

  if (!verifyTransactionHmac(transaction, receivedHmac, secret)) {
    console.warn("[PAYMOB WEBHOOK] Invalid transaction HMAC.");
    return errorResponse("Invalid transaction HMAC.", 401);
  }

  const order = isRecord(transaction.order) ? transaction.order : null;
  if (!order || order.id === undefined || transaction.id === undefined) {
    return errorResponse("Transaction callback is missing its order or transaction ID.", 400);
  }

  const transactionId = String(transaction.id);
  const orderId = String(order.id);
  const amountMinor = Number(transaction.amount_cents);
  const currency = String(transaction.currency ?? "").toUpperCase();
  const integrationId = Number(transaction.integration_id);

  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 1 ||
    !Number.isSafeInteger(integrationId) ||
    integrationId <= 0
  ) {
    return errorResponse("Invalid transaction information.", 400);
  }

  await connectToDatabase();

  const payment = await Payment.findOne({ provider: "paymob", paymobOrderId: orderId });
  if (!payment) {
    // Future automatic recurring charges are separate transactions and must
    // be correlated to their Paymob subscription before being booked as renewals.
    // We deliberately do not guess from amount, customer email, or course ID.
    console.error("[PAYMOB WEBHOOK] No local payment matches transaction order.", {
      orderId,
      transactionId,
      integrationId,
    });
    return errorResponse("Payment for this Paymob order was not found.", 404);
  }

  if (payment.amountMinor !== amountMinor || payment.currency !== currency || currency !== "EGP") {
    console.error("[PAYMOB WEBHOOK] Payment amount or currency mismatch.", {
      paymentId: payment._id.toString(),
      orderId,
    });
    return errorResponse("Payment amount or currency mismatch.", 400);
  }

  const expectedIntegrationId = getExpectedTransactionIntegrationId(payment.paymentMethod);
  if (expectedIntegrationId === null) {
    return errorResponse("Payment integration configuration is incomplete.", 503);
  }
  if (integrationId !== expectedIntegrationId) {
    console.error("[PAYMOB WEBHOOK] Integration ID mismatch.", {
      paymentId: payment._id.toString(),
      receivedIntegrationId: integrationId,
      expectedIntegrationId,
    });
    return errorResponse("Payment integration ID mismatch.", 400);
  }

  const enrollment = await Enrollment.findOne({
    _id: payment.enrollmentId,
    userId: payment.userId,
    courseId: payment.courseId,
  });

  if (!enrollment) return errorResponse("Enrollment not found.", 404);

  const eventKey = `transaction:${transactionId}:${payloadHash}`;
  const event = await beginWebhookEvent({
    eventKey,
    eventType: String(body.type ?? "TRANSACTION"),
    payloadHash,
    paymentId: payment._id.toString(),
    enrollmentId: enrollment._id.toString(),
    transactionId,
    orderId,
  });

  if (!event.acquired || !event.eventId) {
    return receivedResponse({ duplicate: true, callbackType: "transaction" });
  }

  try {
    // Full refunds revoke access only when this payment funded the current period.
    if (transaction.is_refunded === true) {
      const refundedAmount = Number(transaction.refunded_amount_cents ?? 0);
      if (Number.isSafeInteger(refundedAmount) && refundedAmount >= payment.amountMinor) {
        await Payment.updateOne(
          { _id: payment._id, status: "successful" },
          { $set: { status: "refunded" } },
        );
        await Enrollment.updateOne(
          { _id: enrollment._id, status: "active", lastSuccessfulPaymentId: payment._id },
          { $set: { status: "expired", accessRevokedAt: new Date() } },
        );
      } else {
        console.warn("[PAYMOB WEBHOOK] Partial refund needs manual review.", {
          paymentId: payment._id.toString(),
          refundedAmount,
        });
      }

      await markEventProcessed(event.eventId);
      return receivedResponse({ refunded: true });
    }

    if (transaction.is_voided === true) {
      await Payment.updateOne(
        { _id: payment._id, status: { $in: ["pending", "successful"] } },
        {
          $set: {
            status: "cancelled",
            failedAt: new Date(),
            failureCode: "PAYMOB_TRANSACTION_VOIDED",
            failureMessage: "The Paymob transaction was voided.",
          },
        },
      );
      await Enrollment.updateOne(
        { _id: enrollment._id, status: "active", lastSuccessfulPaymentId: payment._id },
        { $set: { status: "expired", accessRevokedAt: new Date() } },
      );
      await markEventProcessed(event.eventId);
      return receivedResponse({ voided: true });
    }

    if (transaction.pending === true) {
      await markEventProcessed(event.eventId);
      return receivedResponse({ pending: true });
    }

    if (transaction.success !== true || transaction.error_occured === true) {
      const failureMessage = isRecord(transaction.data) && typeof transaction.data.message === "string"
        ? transaction.data.message.slice(0, 500)
        : "Paymob reported an unsuccessful transaction.";

      await Payment.updateOne(
        { _id: payment._id, status: "pending" },
        {
          $set: {
            status: "failed",
            failedAt: new Date(),
            failureCode: String(transaction.txn_response_code ?? "PAYMENT_FAILED").slice(0, 100),
            failureMessage,
          },
        },
      );
      await markEventProcessed(event.eventId);
      return receivedResponse({ successful: false });
    }

    const currentPayment = await Payment.findById(payment._id);
    if (!currentPayment) throw new Error("Payment disappeared during processing.");

    if (["cancelled", "expired", "failed", "refunded"].includes(currentPayment.status)) {
      await markEventProcessed(event.eventId);
      return receivedResponse({
        ignored: true,
        reason: "Payment is no longer eligible for activation.",
      });
    }

    if (currentPayment.status === "successful") {
      if (currentPayment.paymobTransactionId !== transactionId) {
        throw new Error("Payment is already associated with a different transaction.");
      }
    } else if (currentPayment.status === "pending") {
      const paidAt = new Date();
      const periodEnd = new Date(paidAt);
      periodEnd.setUTCDate(periodEnd.getUTCDate() + enrollment.billingIntervalDays);

      const updated = await Payment.updateOne(
        { _id: currentPayment._id, status: "pending" },
        {
          $set: {
            status: "successful",
            paymobTransactionId: transactionId,
            paidAt,
            failedAt: null,
            failureCode: null,
            failureMessage: null,
            billingPeriodStart: paidAt,
            billingPeriodEnd: periodEnd,
          },
        },
      );

      if (updated.modifiedCount !== 1) {
        const latestPayment = await Payment.findById(currentPayment._id);
        if (
          latestPayment?.status !== "successful" ||
          latestPayment.paymobTransactionId !== transactionId
        ) {
          throw new Error("Could not safely confirm the payment record.");
        }
      }
    } else {
      throw new Error(`Unexpected payment status: ${currentPayment.status}`);
    }

    const confirmedPayment = await Payment.findById(currentPayment._id);
    if (!confirmedPayment || confirmedPayment.status !== "successful") {
      throw new Error("Payment was not confirmed after update.");
    }

    const alreadyActivated =
      enrollment.status === "active" &&
      enrollment.lastSuccessfulPaymentId?.toString() === confirmedPayment._id.toString();

    if (!alreadyActivated) {
      if (enrollment.status !== "pending_payment") {
        throw new Error(`Enrollment cannot be activated from status: ${enrollment.status}`);
      }

      const periodStart = confirmedPayment.billingPeriodStart ?? confirmedPayment.paidAt ?? new Date();
      const periodEnd = confirmedPayment.billingPeriodEnd ?? new Date(
        periodStart.getTime() + enrollment.billingIntervalDays * 24 * 60 * 60 * 1000,
      );

      const activated = await Enrollment.updateOne(
        { _id: enrollment._id, status: "pending_payment" },
        {
          $set: {
            status: "active",
            billingType: confirmedPayment.billingType,
            paymentMethod: confirmedPayment.paymentMethod,
            amountMinor: confirmedPayment.amountMinor,
            currency: "EGP",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            nextBillingAt: confirmedPayment.billingType === "recurring"
              ? (enrollment.nextBillingAt ?? periodEnd)
              : periodEnd,
            lastSuccessfulPaymentId: confirmedPayment._id,
            pendingCheckoutExpiresAt: null,
            cancelAtPeriodEnd: false,
            cancelledAt: null,
            accessRevokedAt: null,
            reminderSentForPeriodVersion: 0,
          },
          $inc: { periodVersion: 1 },
        },
      );

      if (activated.modifiedCount !== 1) {
        const latestEnrollment = await Enrollment.findById(enrollment._id);
        const activatedByThisPayment =
          latestEnrollment?.status === "active" &&
          latestEnrollment.lastSuccessfulPaymentId?.toString() === confirmedPayment._id.toString();
        if (!activatedByThisPayment) {
          throw new Error("Could not safely activate the enrollment.");
        }
      }
    }

    await markEventProcessed(event.eventId);
    console.info("[PAYMOB WEBHOOK] Initial payment confirmed.", {
      paymentId: confirmedPayment._id.toString(),
      enrollmentId: enrollment._id.toString(),
      transactionId,
      paymentMethod: confirmedPayment.paymentMethod,
    });

    return receivedResponse({ successful: true });
  } catch (error) {
    await PaymobWebhookEvent.updateOne(
      { _id: event.eventId },
      {
        $set: {
          status: "failed",
          lastError: error instanceof Error ? error.message.slice(0, 1000) : "Unknown webhook processing error.",
        },
      },
    );
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return errorResponse("Invalid JSON callback body.", 400);
    }

    if (!isRecord(body)) return errorResponse("Invalid callback body.", 400);

    const hmacSecret = process.env.PAYMOB_HMAC_SECRET?.trim();
    if (!hmacSecret) {
      console.error("[PAYMOB WEBHOOK] HMAC secret is not configured.");
      return errorResponse("Webhook configuration is incomplete.", 503);
    }

    const payloadHash = createHash("sha256").update(rawBody).digest("hex");

    // Subscription-level callbacks use a different payload and HMAC formula.
    if (typeof body.trigger_type === "string" && isRecord(body.subscription_data)) {
      return await handleSubscriptionCallback(body, payloadHash, hmacSecret);
    }

    // Card token callbacks are acknowledged after HMAC verification. Paymob
    // keeps and manages the card for its Subscription Module in this design.
    if (body.type === "TOKEN") {
      return await handleTokenCallback(body, request, hmacSecret);
    }

    // All remaining supported callbacks are transaction-processed callbacks.
    if (isRecord(body.obj)) {
      return await handleTransactionCallback(body, request, payloadHash, hmacSecret);
    }

    return errorResponse("Unsupported Paymob callback type.", 400);
  } catch (error) {
    console.error("[PAYMOB WEBHOOK ERROR]", error);
    return errorResponse("Webhook processing failed. Paymob may retry the callback.", 500);
  }
}
