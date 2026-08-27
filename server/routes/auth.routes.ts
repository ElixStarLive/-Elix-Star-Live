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
import { decoyHash, hashPassword, verifyPassword } from '../auth/password.js';
import { clearFailures, isLockedOut, recordFailure } from '../auth/loginLockout.js';
import { createSession, resolveSession, revokeAllSessions, revokeSession } from '../auth/sessions.js';
import {
  confirmUserEmail,
  findAccountById,
  findAccountByIdentifier,
  isSuspended,
  updateUserPassword,
} from '../auth/users.repository.js';
import { verifyToken } from '../auth/tokens.js';
import { clearSessionCookie, readBearerToken, setSessionCookie } from '../http/sessionCookie.js';
import { registerAccount } from '../auth/registration.js';
import {
  passwordResetBinding,
  resendVerificationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  verificationBinding,
} from '../auth/mail.js';
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

authRouter.post('/verify-email', async (req: Request, res: Response) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    return res.status(400).json(apiError('invalid_request', 'Verification token is required.'));
  }

  const payload = await verifyToken(token, 'email_verify');
  if (!payload) {
    return res.status(401).json(apiError('invalid_request', 'Invalid or expired confirmation link.'));
  }

  try {
    const account = await findAccountById(payload.userId);
    if (!account) {
      return res.status(404).json(apiError('invalid_request', 'User not found.'));
    }

    if (isSuspended(account)) {
      return res.status(403).json(apiError('account_suspended', 'This account is suspended.'));
    }

    if (!payload.binding || payload.binding !== verificationBinding(account)) {
      return res.status(401).json(apiError('invalid_request', 'This confirmation link is no longer valid.'));
    }

    const confirmedAt = account.emailConfirmedAt === null ? await confirmUserEmail(account.id) : account.emailConfirmedAt.toISOString();
    if (!confirmedAt) {
      return res.status(500).json(apiError('server_error', 'Could not confirm email. Please try again.'));
    }

    const { token: sessionToken, expiresAt } = await createSession(account.id, String(req.headers['user-agent'] ?? ''));
    setSessionCookie(res, sessionToken, expiresAt);
    return res.status(200).json({
      ...authSuccessBody(account, sessionToken, expiresAt),
      alreadyConfirmed: account.emailConfirmedAt !== null,
    });
  } catch (err) {
    logger.error({ err }, 'verify-email failed');
    return res.status(500).json(apiError('server_error', 'Email confirmation failed. Please try again.'));
  }
});

authRouter.post('/resend-confirmation', async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) {
    return res.status(400).json(apiError('invalid_request', 'Email is required.'));
  }
  if (!isEmailConfigured()) {
    return res.status(501).json(apiError('server_error', 'Email service is not configured. Please contact support.'));
  }

  try {
    const sent = await resendVerificationEmail(email);
    if (!sent.ok) {
      return res.status(429).json(apiError('too_many_attempts', 'Please wait before requesting another email.'));
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err }, 'resend-confirmation failed');
    // Return 200 for unknown addresses to avoid account enumeration, but only when email is up.
    return res.status(200).json({ success: false });
  }
});

authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) {
    return res.status(400).json(apiError('invalid_request', 'Email is required.'));
  }
  if (!isEmailConfigured()) {
    return res.status(501).json(apiError('server_error', 'Email service is not configured. Please contact support.'));
  }

  try {
    await sendPasswordResetEmail(email);
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err }, 'forgot-password failed');
    return res.status(200).json({ success: true });
  }
});

authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!password || password.length < 8) {
    return res.status(400).json(apiError('weak_password', 'Password must be at least 8 characters.'));
  }
  if (!token) {
    return res.status(401).json(apiError('unauthenticated', 'Reset token is required.'));
  }

  const payload = await verifyToken(token, 'password_reset');
  if (!payload) {
    return res.status(401).json(apiError('unauthenticated', 'Invalid or expired reset link.'));
  }

  try {
    const account = await findAccountById(payload.userId);
    if (!account) {
      return res.status(404).json(apiError('invalid_request', 'User not found.'));
    }
    if (account.passwordHash === null) {
      return res.status(401).json(apiError('unauthenticated', 'This account does not use a password.'));
    }
    if (!payload.binding || payload.binding !== passwordResetBinding(account.passwordHash)) {
      return res.status(401).json(apiError('unauthenticated', 'This reset link has already been used or is no longer valid.'));
    }

    await updateUserPassword(account.id, await hashPassword(password));
    await revokeAllSessions(account.id);
    clearSessionCookie(res);
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err }, 'reset-password failed');
    return res.status(500).json(apiError('server_error', 'Password reset failed. Please try again.'));
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
