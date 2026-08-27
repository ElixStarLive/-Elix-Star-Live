import type { Request, Response, NextFunction } from 'express';
import { resolveSession } from '../auth/sessions.js';
import { readBearerToken } from './sessionCookie.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ code: 'unauthenticated', message: 'Sign in to continue.' });
  }

  const session = await resolveSession(token);
  if (!session || session.expiresAt < new Date()) {
    return res.status(401).json({ code: 'unauthenticated', message: 'Session expired. Please sign in again.' });
  }

  req.userId = session.userId;
  return next();
}
