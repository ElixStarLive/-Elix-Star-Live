/**
 * Optional Sentry — initialized only when SENTRY_DSN is set.
 */
import * as Sentry from "@sentry/node";
import { logger } from "./logger";

let inited = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || inited) return;
  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: Math.min(1, Math.max(0, Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1)),
      maxBreadcrumbs: 50,
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
