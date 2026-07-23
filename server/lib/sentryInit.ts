/**
 * Optional Sentry — initialized only when SENTRY_DSN is set.
 */
import * as Sentry from "@sentry/node";
import { logger } from "./logger";

let inited = false;

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-elix-webhook-secret",
  "x-loadtest-key",
  "proxy-authorization",
]);

/**
 * Strip PII / secrets from an outgoing Sentry event before it leaves the
 * process: auth headers, cookies, request bodies/query, and user email/ip.
 */
function scrubEventPii<T extends Record<string, unknown>>(event: T): T {
  try {
    const ev = event as Record<string, unknown>;
    const request = ev.request as Record<string, unknown> | undefined;
    if (request) {
      const headers = request.headers as Record<string, unknown> | undefined;
      if (headers) {
        for (const key of Object.keys(headers)) {
          if (SENSITIVE_HEADERS.has(key.toLowerCase())) headers[key] = "[redacted]";
        }
      }
      delete request.cookies;
      delete request.data;
      if (typeof request.query_string === "object") delete request.query_string;
    }
    const user = ev.user as Record<string, unknown> | undefined;
    if (user) {
      delete user.email;
      delete user.ip_address;
      delete user.username;
    }
  } catch {
    /* never block delivery on scrub failure */
  }
  return event;
}

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || inited) return;
  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: Math.min(1, Math.max(0, Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1)),
      maxBreadcrumbs: 50,
      // Never attach IP/cookies/user PII automatically.
      sendDefaultPii: false,
      beforeSend: (event) => scrubEventPii(event as unknown as Record<string, unknown>) as typeof event,
      beforeSendTransaction: (event) =>
        scrubEventPii(event as unknown as Record<string, unknown>) as typeof event,
    });
    inited = true;
    logger.info("Sentry error reporting enabled");
  } catch (e) {
    logger.warn({ err: e }, "Sentry init failed");
  }
}

export function captureExceptionToSentry(err: unknown, context?: Record<string, unknown>): void {
  if (!inited) return;
  try {
    Sentry.withScope((scope) => {
      if (context) {
        for (const [k, v] of Object.entries(context)) {
          scope.setExtra(k, v);
        }
      }
      Sentry.captureException(err);
    });
  } catch {
    /* ignore */
  }
}

export function getSentry(): typeof Sentry | null {
  return inited ? Sentry : null;
}
