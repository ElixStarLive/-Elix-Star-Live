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
import { apiError, authSuccessBody, toAuthUserBody } from '../auth/contract.js';
import { decoyHash, verifyPassword } from '../auth/password.js';
import { clearFailures, isLockedOut, recordFailure } from '../auth/loginLockout.js';
import { createSession, resolveSession, revokeSession } from '../auth/sessions.js';
import { findAccountById, findAccountByIdentifier, isSuspended } from '../auth/users.repository.js';
import { clearSessionCookie, readBearerToken, setSessionCookie } from '../http/sessionCookie.js';
import { registerAccount } from '../auth/registration.js';
import { sendVerificationEmail } from '../auth/emailVerification.js';
import { isEmailConfigured } from '../lib/email.js';

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

const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.')
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  username: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

authRouter.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json(apiError('invalid_request', first?.message ?? 'Invalid registration details.'));
  }
  const { email, password, username } = parsed.data;

  try {
    const emailConfigured = isEmailConfigured();
    const userAgent = String(req.headers['user-agent'] ?? '');
    const ipAddress = (req.ip as string | undefined) ?? null;

    const result = await registerAccount({
      email,
      password,
      username: username ?? undefined,
      requireEmailConfirmation: emailConfigured,
      consent: {
        type: 'terms_privacy_and_age_13_plus',
        version: '2026-07-21',
        ipAddress,
        userAgent: userAgent.slice(0, 400),
      },
    });

    if (result.status === 'email_taken') {
      return res.status(409).json(apiError('email_taken', 'An account with this email already exists.'));
    }
    if (result.status === 'username_taken') {
      return res.status(409).json(apiError('username_taken', 'This username is already taken.'));
    }

    if (emailConfigured) {
      const emailResult = await sendVerificationEmail(result.account);
      return res.status(201).json({
        status: 'verification_required',
        user: toAuthUserBody(result.account),
        verificationEmailSent: emailResult.ok,
      });
    }

    const { token, expiresAt } = await createSession(result.account.id, userAgent);
    setSessionCookie(res, token, expiresAt);
    return res.status(201).json({
      status: 'signed_in',
      user: toAuthUserBody(result.account),
      session: { accessToken: token, expiresAt: expiresAt.toISOString() },
    });
  } catch (err) {
    logger.error({ err }, 'registration failed');
    return res.status(500).json(apiError('server_error', 'Could not create account. Please try again.'));
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
