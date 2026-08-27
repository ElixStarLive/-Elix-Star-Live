/**
 * Authentication routes.
 *
 * PAGE-001 owns POST /api/auth/login. Sibling endpoints (register, verify,
 * forgot/reset) are added by their own pages onto this same router so there is
 * one auth surface, not several.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { apiError, authSuccessBody } from '../auth/contract.js';
import { decoyHash, verifyPassword } from '../auth/password.js';
import { clearFailures, isLockedOut, recordFailure } from '../auth/loginLockout.js';
import { createSession, resolveSession, revokeSession } from '../auth/sessions.js';
import { findAccountById, findAccountByIdentifier, isSuspended } from '../auth/users.repository.js';
import { clearSessionCookie, readBearerToken, setSessionCookie } from '../http/sessionCookie.js';

const loginSchema = z.object({
  // One field accepts an email address or a username; the repository decides
  // which it is. Only trimmed here — normalising case is the database's job via
  // citext, and doing it twice invites the two rules to drift apart.
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(200),
});

export const authRouter: Router = Router();

authRouter.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json(apiError('invalid_request', 'Please enter both your email or username and your password.'));
  }
  const { identifier, password } = parsed.data;

  try {
    // Checked before the password is examined and keyed on what was typed
    // rather than a resolved account, so a locked account and an unknown one
    // behave identically and nothing here reveals which addresses exist.
    if (await isLockedOut(identifier)) {
      return res
        .status(429)
        .json(apiError('too_many_attempts', 'Too many failed sign-in attempts. Please try again later.'));
    }

    const account = await findAccountByIdentifier(identifier);

    // An unknown identifier still pays the scrypt cost, otherwise the response
    // time alone distinguishes accounts that exist from ones that do not.
    const storedHash = account?.passwordHash ?? (await decoyHash());
    const passwordMatches = await verifyPassword(password, storedHash);

    if (!account || account.passwordHash === null || !passwordMatches) {
      await recordFailure(identifier);
      return res
        .status(401)
        .json(apiError('invalid_credentials', 'Incorrect email/username or password.'));
    }

    if (account.emailConfirmedAt === null) {
      return res
        .status(403)
        .json(apiError('email_not_confirmed', 'Please verify your email address before logging in.'));
    }

    if (isSuspended(account)) {
      return res.status(403).json(apiError('account_suspended', 'This account is suspended.'));
    }

    await clearFailures(identifier);

    const { token, expiresAt } = await createSession(account.id, String(req.headers['user-agent'] ?? ''));
    setSessionCookie(res, token, expiresAt);

    return res.status(200).json(authSuccessBody(account, token, expiresAt));
  } catch (err) {
    logger.error({ err }, 'login failed');
    return res
      .status(500)
      .json(apiError('server_error', 'Sign-in is temporarily unavailable. Please try again.'));
  }
});

authRouter.post('/logout', async (req: Request, res: Response) => {
  const token = readBearerToken(req);
  try {
    if (token) await revokeSession(token);
    clearSessionCookie(res);
    return res.status(204).end();
  } catch (err) {
    logger.error({ err }, 'logout failed');
    return res.status(500).json(apiError('server_error', 'Sign-out failed. Please try again.'));
  }
});

authRouter.get('/me', async (req: Request, res: Response) => {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json(apiError('unauthenticated', 'Not signed in.'));
  }

  try {
    const session = await resolveSession(token);
    if (!session) {
      clearSessionCookie(res);
      return res.status(401).json(apiError('unauthenticated', 'Your session has expired.'));
    }

    const account = await findAccountById(session.userId);
    if (!account) {
      // The session outlived the account it belonged to.
      await revokeSession(token);
      clearSessionCookie(res);
      return res.status(401).json(apiError('unauthenticated', 'Your session has expired.'));
    }

    if (isSuspended(account)) {
      return res.status(403).json(apiError('account_suspended', 'This account is suspended.'));
    }

    // `/me` reports the session it was given; it does not mint a new one.
    return res.status(200).json(authSuccessBody(account, token, session.expiresAt));
  } catch (err) {
    logger.error({ err }, 'session lookup failed');
    return res.status(500).json(apiError('server_error', 'Could not load your session.'));
  }
});
