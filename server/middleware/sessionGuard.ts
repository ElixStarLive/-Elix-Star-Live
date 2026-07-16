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
 * - Public auth endpoints pass through (login/register/reset flows).
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
  // Only endpoints that cannot rely on an existing session bypass the guard.
  // Authenticated routes such as /me, /logout, and /delete must validate the
  // server-side session row just like every other protected API endpoint.
  const pathname = req.originalUrl.split("?")[0];
  const publicAuthPaths = new Set([
    "/api/auth/login",
    "/api/auth/guest",
    "/api/auth/register",
    "/api/auth/resend-confirmation",
    "/api/auth/apple/start",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
  ]);
  if (publicAuthPaths.has(pathname)) {
    next();
    return;
  }
  let state: Awaited<ReturnType<typeof checkSessionState>>;
  try {
    state = await checkSessionState(token);
  } catch (err) {
    logger.error({ err }, "sessionGuard: checkSessionState threw");
    res.status(503).json({ error: "Session validation unavailable." });
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
  if (state.state === "unavailable") {
    res.status(503).json({ error: "Session validation unavailable." });
    return;
  }
  next();
}
