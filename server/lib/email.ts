/**
 * Transactional email.
 *
 * Sending either succeeds or reports why it failed. There is no path that
 * swallows a failure and lets a caller tell someone a message is on its way
 * when nothing was sent — verification and password reset are unusable if that
 * is allowed to happen quietly.
 *
 * Configuration is mandatory in production (enforced in `config.ts`), so the
 * "not configured" result can only occur in development.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';
import { logger } from './logger.js';

export type EmailResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'send_failed' };

let transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(config.SMTP_URL) && Boolean(config.EMAIL_FROM);
}

function getTransporter(url: string): Transporter {
  // Pooled: registration bursts otherwise open a new SMTP connection per message.
  transporter ??= nodemailer.createTransport(url, { pool: true, maxConnections: 3 });
  return transporter;
}

export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<EmailResult> {
  const url = config.SMTP_URL;
  const from = config.EMAIL_FROM;
  if (!url || !from) return { ok: false, reason: 'not_configured' };

  try {
    await getTransporter(url).sendMail({ from, ...message });
    return { ok: true };
  } catch (err) {
    // The address is not logged: it is personal data and the message id is
    // enough to correlate with the provider's own logs.
    logger.error({ err, subject: message.subject }, 'transactional email send failed');
    return { ok: false, reason: 'send_failed' };
  }
}

export async function closeEmail(): Promise<void> {
  transporter?.close();
  transporter = null;
}
