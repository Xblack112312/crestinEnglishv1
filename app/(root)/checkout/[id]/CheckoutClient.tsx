"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Check,
  CreditCard,
  Wallet,
  ShieldCheck,
  Loader2,
} from "lucide-react";

export interface CheckoutCourse {
  id: string;
  title: string;
  shortDescription: string;
  thumbnail: string;
  price: number;
  billingIntervalDays: number;
}

interface CheckoutClientProps {
  course: CheckoutCourse;
}

type PaymentMethod = "card" | "wallet";

export default function CheckoutClient({ course }: CheckoutClientProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");

  const [recurringConsent, setRecurringConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  const formattedPrice = new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(course.price);

  const handleCheckout = async () => {
    if (isSubmitting) return;

    if (paymentMethod === "card" && !recurringConsent) {
      setError("Please authorize recurring card payments to continue.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: course.id,
          paymentMethod,
          recurringConsent: paymentMethod === "card" ? recurringConsent : false,
          phoneNumber,
        }),
      });

      const result = (await response.json().catch(() => null)) as {
        checkoutUrl?: string;
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          result?.message ||
            result?.error ||
            "Unable to create your checkout session.",
        );
      }

      if (!result?.checkoutUrl) {
        throw new Error("The payment provider did not return a checkout URL.");
      }

      // Only redirect to HTTPS payment destinations.
      const checkoutUrl = new URL(result.checkoutUrl);

      if (checkoutUrl.protocol !== "https:") {
        throw new Error("Invalid payment destination.");
      }

      window.location.assign(checkoutUrl.toString());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );

      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-white text-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-end px-6 sm:px-10">

          <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
            <ShieldCheck size={15} />
            Secure checkout
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10 sm:px-10 lg:py-16">
        {/* Back link */}
        <Link
          href={`/courses/${course.id}`}
          className="inline-flex items-center gap-2 text-sm text-neutral-500 transition hover:text-neutral-950"
        >
          <ArrowLeft size={16} />
          Back to course
        </Link>

        <div className="mt-9 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_390px] lg:gap-20">
          {/* Checkout form */}
          <section>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                Checkout
              </p>

              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Complete your enrollment.
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-500">
                Choose your preferred payment method to get started with your
                course.
              </p>
            </div>

            <div className="mt-8">
              <label htmlFor="phoneNumber" className="text-sm font-semibold">
                Mobile phone number
              </label>

              <input
                id="phoneNumber"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="01012345678"
                className="mt-3 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-neutral-950"
              />

              <p className="mt-2 text-xs text-neutral-400">
                Enter the Egyptian mobile number you want to use for payment.
              </p>
            </div>

            {/* Payment methods */}
            <div className="mt-10">
              <h2 className="text-sm font-semibold">Select payment method</h2>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod("card");
                    setError("");
                  }}
                  className={`flex items-start gap-4 rounded-xl border p-5 text-left transition ${
                    paymentMethod === "card"
                      ? "border-neutral-950 bg-neutral-50"
                      : "border-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  <CreditCard size={21} className="mt-0.5 shrink-0" />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Credit / Debit Card</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">
                      Automatic recurring payments
                    </p>
                  </div>

                  {paymentMethod === "card" && (
                    <Check size={18} className="shrink-0" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod("wallet");
                    setError("");
                  }}
                  className={`flex items-start gap-4 rounded-xl border p-5 text-left transition ${
                    paymentMethod === "wallet"
                      ? "border-neutral-950 bg-neutral-50"
                      : "border-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  <Wallet size={21} className="mt-0.5 shrink-0" />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Mobile Wallet</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">
                      Pay manually for each billing period
                    </p>
                  </div>

                  {paymentMethod === "wallet" && (
                    <Check size={18} className="shrink-0" />
                  )}
                </button>
              </div>
            </div>

            {/* Payment-specific information */}
            <div className="mt-7">
              {paymentMethod === "card" ? (
                <div className="rounded-xl border border-neutral-200 p-5">
                  <h3 className="text-sm font-semibold">
                    Recurring payment authorization
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-neutral-500">
                    Your card will be charged automatically every{" "}
                    {course.billingIntervalDays} days. By continuing, you
                    authorize recurring charges through Paymob until you cancel
                    your subscription.
                  </p>

                  <label className="mt-5 flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={recurringConsent}
                      onChange={(event) =>
                        setRecurringConsent(event.target.checked)
                      }
                      className="mt-1 size-4 accent-neutral-950"
                    />

                    <span className="text-sm leading-6 text-neutral-700">
                      I authorize automatic recurring card payments for this
                      course and understand that I can cancel my subscription.
                    </span>
                  </label>
                </div>
              ) : (
                <div className="rounded-xl border border-neutral-200 p-5">
                  <h3 className="text-sm font-semibold">
                    Manual wallet payments
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-neutral-500">
                    Your wallet payment covers one billing period. Automatic
                    wallet renewal is not included. You will need to complete
                    another payment when your current period ends.
                  </p>
                </div>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div
                role="alert"
                className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            {/* Checkout button */}
            <button
              type="button"
              onClick={handleCheckout}
              disabled={
                isSubmitting || (paymentMethod === "card" && !recurringConsent)
              }
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-full bg-neutral-950 px-6 py-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  Preparing checkout...
                </>
              ) : (
                <>
                  Continue to secure payment
                  <span aria-hidden="true">→</span>
                </>
              )}
            </button>

            <p className="mt-4 text-center text-xs leading-5 text-neutral-400">
              You will be redirected to Paymob to complete your payment. Your
              enrollment is activated only after payment confirmation.
            </p>
          </section>

          {/* Order summary */}
          <aside>
            <div className="lg:sticky lg:top-10">
              <h2 className="text-sm font-semibold">Order summary</h2>

              <div className="mt-5 overflow-hidden rounded-xl border border-neutral-200">
                {course.thumbnail ? (
                  <img
                    src={course.thumbnail}
                    alt={course.title}
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="aspect-video w-full bg-neutral-100" />
                )}

                <div className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                    Course enrollment
                  </p>

                  <h3 className="mt-2 text-lg font-semibold tracking-tight">
                    {course.title}
                  </h3>

                  {course.shortDescription && (
                    <p className="mt-2 text-sm leading-6 text-neutral-500">
                      {course.shortDescription}
                    </p>
                  )}

                  <div className="my-6 border-t border-neutral-200" />

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-500">Billing period</span>
                    <span className="font-medium">
                      {course.billingIntervalDays} days
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-neutral-500">Payment method</span>
                    <span className="font-medium">
                      {paymentMethod === "card" ? "Card" : "Wallet"}
                    </span>
                  </div>

                  <div className="my-6 border-t border-neutral-200" />

                  <div className="flex items-end justify-between gap-4">
                    <span className="text-sm font-semibold">Total</span>
                    <span className="text-2xl font-semibold tracking-tight tabular-nums">
                      {formattedPrice}
                    </span>
                  </div>

                  <p className="mt-3 text-xs leading-5 text-neutral-400">
                    All prices are displayed in Egyptian Pounds (EGP).
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-3 text-xs leading-5 text-neutral-500">
                <ShieldCheck size={17} className="mt-0.5 shrink-0" />
                <p>
                  Your payment is processed securely through Paymob.
                  CrestInEnglish does not store your complete card details.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
