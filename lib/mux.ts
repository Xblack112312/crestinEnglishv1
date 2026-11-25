import { Mux } from "@mux/ts";

let client: Mux | undefined;

function requireMuxEnvironment() {
  const required = ["MUX_TOKEN_ID", "MUX_TOKEN_SECRET", "MUX_SIGNING_KEY_ID", "MUX_SIGNING_PRIVATE_KEY", "MUX_WEBHOOK_SECRET"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Mux is not configured (${missing.join(", ")}).`);
}

export function getMux() {
  requireMuxEnvironment();
  client ??= new Mux({
    tokenId: process.env.MUX_TOKEN_ID,
    tokenSecret: process.env.MUX_TOKEN_SECRET,
    webhookSecret: process.env.MUX_WEBHOOK_SECRET,
    jwtSigningKey: process.env.MUX_SIGNING_KEY_ID,
    jwtPrivateKey: process.env.MUX_SIGNING_PRIVATE_KEY,
  });
  return client;
}

function isLoopback(origin: string) {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Origin Mux will echo in the upload URL's CORS headers. This must be the
 * browser origin that will PUT the file, not a configured URL the browser
 * is not actually using.
 */
export function getAppOrigin(request: Request) {
  const configuredOrigin = process.env.APP_ORIGIN?.replace(/\/$/, "");
  const requestOrigin = request.headers.get("origin")?.replace(/\/$/, "") ?? "";
  const urlOrigin = new URL(request.url).origin;
  const allowed = new Set([urlOrigin, configuredOrigin].filter((origin): origin is string => Boolean(origin)));

  if (requestOrigin && allowed.has(requestOrigin)) return requestOrigin;
  if (!requestOrigin) return configuredOrigin || urlOrigin;
  if (isLoopback(requestOrigin) && [...allowed].some(isLoopback)) return requestOrigin;

  throw new Error("The request origin does not match APP_ORIGIN.");
}
