/**
 * Role checks against profiles: admin (is_admin), creator (is_verified).
 */
import { Request, Response, NextFunction } from "express";
import { getTokenFromRequest, verifyAuthToken } from "../routes/auth";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
// #region agent log
function _dbgRBAC(loc:string,msg:string,data:Record<string,unknown>={}){fetch('http://127.0.0.1:7684/ingest/8c32b730-3e4a-4f4c-9502-6b305be695c7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6f8791'},body:JSON.stringify({sessionId:'6f8791',location:loc,message:msg,data,timestamp:Date.now()})}).catch(()=>{});}
// #endregion

export interface AuthContext {
  userId: string;
  isAdmin: boolean;
  isCreator: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

async function loadRoles(userId: string): Promise<{ isAdmin: boolean; isCreator: boolean }> {
  const db = getPool();
  if (!db) return { isAdmin: false, isCreator: false };
  try {
    const r = await db.query(
      `SELECT COALESCE(is_admin, false) AS is_admin, COALESCE(is_verified, false) AS is_verified FROM profiles WHERE user_id = $1`,
      [userId],
    );
    const row = r.rows[0] as { is_admin?: boolean; is_verified?: boolean } | undefined;
    return {
      isAdmin: Boolean(row?.is_admin),
      isCreator: Boolean(row?.is_verified),
    };
  } catch (err) {
    // #region agent log
    _dbgRBAC('rbac.ts:loadRoles','SILENT_ROLE_FAILURE',{error:err instanceof Error?err.message:String(err),userId,hypothesisId:'E'});
    // #endregion
    logger.error({ err, userId }, 'loadRoles failed — user treated as non-admin/non-creator');
    return { isAdmin: false, isCreator: false };
  }
}

export async function requireAuthWithRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const payload = verifyAuthToken(token);
    if (!payload?.sub) {
      res.status(401).json({ error: "Invalid session" });
      return;
    }
    const roles = await loadRoles(payload.sub);
    req.authContext = { userId: payload.sub, ...roles };
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.authContext?.isAdmin) {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  next();
}

export function requireCreator(req: Request, res: Response, next: NextFunction): void {
  const ctx = req.authContext;
  if (!ctx?.isCreator && !ctx?.isAdmin) {
    res.status(403).json({ error: "Creator or admin required" });
    return;
  }
  next();
}
