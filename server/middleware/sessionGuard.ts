import { Request, Response, NextFunction } from "express";
import {
  getTokenFromRequest,
  checkSessionState,
  stripAuthCredentials,
} from "../routes/auth";
import { logger } from "../lib/logger";

/**
 * Global session + ban enforcement for /api routes.
 *
 * - No token: pass through (public/anonymous endpoints).
 * - /api/auth/*: pass through (login/logout/refresh manage their own token lifecycle).
 * - Valid token + live session + not banned: pass through.
 * - Banned account: 403 everywhere.
 * - Revoked/expired session or bad JWT: strip credentials so the request is
 *   treated as anonymous (protected endpoints then return 401; public endpoints
 *   still serve public content).
 */
export async function sessionGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = getTokenFromRequest(req);
  if (!token) {
    next();
    return;
  }
  // Auth routes own their token lifecycle (e.g. logout must run with a revoked session).
  if (req.originalUrl.startsWith("/api/auth/")) {
    next();
    return;
  }
  let state: Awaited<ReturnType<typeof checkSessionState>>;
  try {
    state = await checkSessionState(token);
  } catch (err) {
    logger.warn({ err }, "sessionGuard: checkSessionState threw — failing open");
    next();
    return;
  }
  if (!state) {
    stripAuthCredentials(req);
    next();
    return;
  }
  if (state.state === "banned") {
    res.status(403).json({ error: "Account suspended." });
    return;
  }
  if (state.state === "revoked") {
    stripAuthCredentials(req);
    next();
    return;
  }
  next();
}
