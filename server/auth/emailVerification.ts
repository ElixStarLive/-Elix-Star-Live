/**
 * Email confirmation links.
 *
 * The token is bound to the account's current confirmation state and password
 * hash. Once the address is confirmed — or the password changes — the binding no
 * longer matches and the link stops working, which makes it single-use without
 * a table of spent tokens to keep and reap.
 *
 * PAGE-003 owns redeeming these links; this module owns issuing them.
 */

import crypto from 'node:crypto';
import { config } from '../config.js';
import { sendEmail, type EmailResult } from '../lib/email.js';
import { signToken } from './tokens.js';
import type { AccountRow } from './users.repository.js';

const VERIFY_TTL_SECONDS = 60 * 60 * 24;

/** Fingerprint of the state this link is valid against. */
export function verificationBinding(account: {
  id: string;
  emailConfirmedAt: Date | null;
  passwordHash: string | null;
}): string {
  const state = account.emailConfirmedAt === null ? 'pending' : `confirmed:${account.emailConfirmedAt.toISOString()}`;
  return crypto
    .createHash('sha256')
    .update(`${account.id}|${state}|${account.passwordHash ?? ''}`)
    .digest('base64url')
    .slice(0, 22);
}

export async function sendVerificationEmail(account: AccountRow): Promise<EmailResult> {
  const token = await signToken(
    { userId: account.id, purpose: 'email_verify', binding: verificationBinding(account) },
    VERIFY_TTL_SECONDS,
  );
  const link = `${config.APP_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`;

  return sendEmail({
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
}
