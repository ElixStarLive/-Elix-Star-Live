import { Request, Response, NextFunction, RequestHandler } from "express";
import { logger } from "../lib/logger";

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

  logger.error(
    {
      err: err.message,
      stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
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

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
