import { Request, Response, NextFunction } from "express";
import { getTokenFromRequest, verifyAuthToken } from "../routes/auth";

export interface AuthPayload {
  sub: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session." });
    return;
  }
  req.auth = payload;
  next();
}
