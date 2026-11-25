import { Resend } from "resend";

// The SDK reports a provider error when this is absent; email.ts turns that
// into an operational failure without ever exposing provider details publicly.
export const resend = new Resend(process.env.RESEND_API_KEY);
