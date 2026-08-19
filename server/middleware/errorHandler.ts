import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { captureExceptionToSentry } from "../lib/sentryInit";

/**
 * The request-id middleware in `server/index.ts` stamps every non-load-test
 * request; error logs and API error bodies read it back here. Declared once so
 * both ends share one type instead of casting at each use site.
 */
declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

export interface ApiError {
  error: string;
  code?: string;
  requestId?: string;
}

export function errorHandler(
  err: Error & { statusCode?: number; code?: string },
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode || 500;
  const requestId = req.requestId;

  if (statusCode >= 500) {
    captureExceptionToSentry(err, { method: req.method, url: req.originalUrl, requestId });
  }

  const logStack =
    process.env.NODE_ENV !== "production" ||
    process.env.LOG_FULL_ERROR_STACKS === "1" ||
    (statusCode >= 500 && process.env.LOG_500_STACK === "1");

  logger.error(
    {
      err: err.message,
      stack: logStack ? err.stack : undefined,
      method: req.method,
      url: req.originalUrl,
      requestId,
      statusCode,
    },
    "Request error",
  );

  if (res.headersSent) return;

  const body: ApiError = {
    error:
      statusCode >= 500
        ? "Internal server error"
        : err.message || "Unknown error",
    requestId,
  };

  if (err.code) body.code = err.code;

  res.status(statusCode).json(body);
}

export class AppError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = "AppError";
  }
}

