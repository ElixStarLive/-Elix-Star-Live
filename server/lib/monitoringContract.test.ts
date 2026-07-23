import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const indexSrc = readFileSync(resolve(__dirname, "../index.ts"), "utf8");
const sentry = readFileSync(resolve(__dirname, "sentryInit.ts"), "utf8");
const logger = readFileSync(resolve(__dirname, "logger.ts"), "utf8");
const gifts = readFileSync(resolve(__dirname, "../routes/gifts.ts"), "utf8");
const errorHandler = readFileSync(
  resolve(__dirname, "../middleware/errorHandler.ts"),
  "utf8",
);

/**
 * Contract checks for monitoring instrumentation.
 * Live dashboard/stream verification still requires Coolify/Sentry operator access.
 */
describe("Monitoring instrumentation contract", () => {
  it("registers health endpoints and Sentry init", () => {
    expect(indexSrc).toContain('app.get("/health"');
    expect(indexSrc).toContain("initSentry");
    expect(sentry).toContain("SENTRY_DSN");
    expect(sentry).toContain("Sentry.init");
  });

  it("emits structured http_request logs", () => {
    expect(indexSrc).toContain('"http_request"');
    expect(logger).toContain("pino");
  });

  it("forwards errors to Sentry with request correlation", () => {
    expect(errorHandler).toContain("captureExceptionToSentry");
    expect(errorHandler).toContain("requestId");
  });

  it("logs gift failures for wallet correlation", () => {
    expect(gifts).toContain("handleSendGift failed");
  });

  it("exposes deploy commit on health when Coolify sets SOURCE_COMMIT", () => {
    expect(indexSrc).toContain("SOURCE_COMMIT");
    expect(indexSrc).toContain("commit: DEPLOYED_COMMIT");
  });

  it("exposes push configured boolean on health (no secrets)", () => {
    expect(indexSrc).toContain("isPushConfigured");
    expect(indexSrc).toContain("push: isPushConfigured()");
  });
});

describe("Monitoring live verification gate", () => {
  it("documents that dashboard proof is external", () => {
    // This suite proves code hooks exist. Coolify logs / Sentry UI remain [~]
    // until an operator confirms streams for the event names below.
    const requiredEvents = [
      "http_request",
      "handleSendGift failed",
      "Sentry error reporting enabled",
      "Creator earnings matured to available",
    ];
    expect(requiredEvents.length).toBeGreaterThan(0);
  });
});
