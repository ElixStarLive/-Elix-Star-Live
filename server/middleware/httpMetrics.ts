import { Request, Response, NextFunction } from "express";
import { recordHttpRequest } from "../lib/metrics";

export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    recordHttpRequest(res.statusCode, Date.now() - start);
  });
  next();
}
