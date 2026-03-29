import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = "issues" in err && Array.isArray((err as ZodError).issues) ? (err as ZodError).issues : [];
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          details: issues.map((e: { path: (string | number)[]; message: string }) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        });
      }
      next(err);
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = "issues" in err && Array.isArray((err as ZodError).issues) ? (err as ZodError).issues : [];
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          details: issues.map((e: { path: (string | number)[]; message: string }) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        });
      }
      next(err);
    }
  };
}
