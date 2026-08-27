/**
 * All auth-related transactional email: verification, resend and password reset.
 *
 * Each token is purpose-bound and fingerprinted to server-side state, so a link
 * is single-use without a database table of spent tokens.
 */

import crypto from 'node:crypto';
import { config } from '../config.js';
import { sendEmail } from '../lib/email.js';
import { logger } from '../lib/logger.js';
import { valkeyDel, valkeySetNx } from '../lib/valkey.js';
import { signToken } from './tokens.js';
import { findAccountByEmail, type AccountRow } from './users.repository.js';

const VERIFY_TTL_SECONDS = 60 * 60 * 24;
const RESET_TTL_SECONDS = 60 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

/** Fingerprint of the state a verification link is valid against. */
export function verificationBinding(account: AccountRow): string {
  const state =
    account.emailConfirmedAt === null
      ? 'pending'
      : `confirmed:${account.emailConfirmedAt.toISOString()}`;
  return crypto
    .createHash('sha256')
    .update(`${account.id}|${state}|${account.passwordHash ?? ''}`)
    .digest('base64url')
    .slice(0, 22);
}

export async function sendVerificationEmail(account: AccountRow): Promise<{ ok: boolean }> {
  const token = await signToken(
    {
      userId: account.id,
      purpose: 'email_verify',
      binding: verificationBinding(account),
    },
    VERIFY_TTL_SECONDS,
  );
  const link = `${config.APP_ORIGIN}/auth/callback?token=${encodeURIComponent(token)}`;

  const result = await sendEmail({
    to: account.email,
    subject: 'Confirm your Elix Star Live account',
    text: [
      'Confirm your email address by opening this link:',
      '',
      link,
      '',
      'The link expires in 24 hours. If you did not create an account, ignore this message.',
    ].join('\n'),
    html: [
      '<p>Confirm your email address by opening the link below.</p>',
      `<p><a href="${link}">Confirm email</a></p>`,
      '<p>The link expires in 24 hours. If you did not create an account, you can ignore this message.</p>',
    ].join(''),
  });

  return { ok: result.ok };
}

export async function resendVerificationEmail(email: string): Promise<{ ok: boolean }> {
  const account = await findAccountByEmail(email);
  if (!account || account.emailConfirmedAt !== null) {
    // Account does not exist or already confirmed: respond 200 without leaking.
    return { ok: true };
  }

  const cooldownKey = `email:confirm-cooldown:${account.id}`;
  const cool = await valkeySetNx(cooldownKey, '1', RESEND_COOLDOWN_SECONDS);
  if (cool.status === 'unavailable') {
    // A rate-limiter outage is not a reason to spam email; refuse the send.
    return { ok: false };
  }
  if (cool.status === 'ok' && !cool.set) {
    // Already sent within the cooldown window; caller should tell the user to wait.
    return { ok: false };
  }

  const sent = await sendVerificationEmail(account);
  if (!sent.ok) {
    // Release the cooldown so a retry is not permanently blocked by a transient failure.
    await valkeyDel(cooldownKey);
  }
  return sent;
}

/** Fingerprint of the password hash a reset link is valid against. */
export function passwordResetBinding(passwordHash: string): string {
  return crypto.createHash('sha256').update(passwordHash).digest('base64url').slice(0, 22);
}

export async function sendPasswordResetEmail(email: string): Promise<{ ok: boolean }> {
  const account = await findAccountByEmail(email);
  if (!account || account.passwordHash === null) {
    // No account or no password (e.g. Apple-only): do not reveal by returning an error.
    return { ok: true };
  }

  const token = await signToken(
    {
      userId: account.id,
      purpose: 'password_reset',
      binding: passwordResetBinding(account.passwordHash),
    },
    RESET_TTL_SECONDS,
  );
  const link = `${config.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;

  const result = await sendEmail({
    to: account.email,
    subject: 'Reset your Elix Star Live password',
    text: [
      'Click this link to reset your password:',
      '',
      link,
      '',
      'The link expires in 1 hour. If you did not request this, ignore this email.',
    ].join('\n'),
    html: [
      '<p>Click the link below to reset your password.</p>',
      `<p><a href="${link}">Reset Password</a></p>`,
      '<p>The link expires in 1 hour. If you did not request this, you can ignore this email.</p>',
    ].join(''),
  });

  if (!result.ok) {
    logger.error({ email: account.email }, 'password reset email send failed');
  }
  return { ok: true };
}
