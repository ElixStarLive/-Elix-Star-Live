import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // Defence-in-depth: never emit credentials/PII even if an object carrying them
  // is accidentally passed to the logger.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
      "authorization",
      "cookie",
      "password",
      "token",
      "receipt",
      "purchaseToken",
      "*.password",
      "*.token",
      "*.authorization",
    ],
    censor: "[redacted]",
  },
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty" }
      : undefined,
});
