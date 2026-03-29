/**
 * Transactional email — SMTP (nodemailer) or SendGrid HTTP API.
 */
import nodemailer from "nodemailer";
import { logger } from "./logger";

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_URL ||
      process.env.SMTP_HOST ||
      (process.env.SENDGRID_API_KEY && (process.env.EMAIL_FROM || process.env.SMTP_FROM)),
  );
}

export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sendgridKey = process.env.SENDGRID_API_KEY;
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || "noreply@example.com";

  if (sendgridKey) {
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: opts.to }] }],
          from: { email: from },
          subject: opts.subject,
          content: [
            { type: "text/plain", value: opts.text || opts.subject },
            { type: "text/html", value: opts.html },
          ],
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        logger.error({ status: res.status, t }, "SendGrid send failed");
        return { ok: false, error: "SENDGRID_ERROR" };
      }
      return { ok: true };
    } catch (e) {
      logger.error({ err: e }, "SendGrid send exception");
      return { ok: false, error: "SENDGRID_EXCEPTION" };
    }
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host && !process.env.SMTP_URL) {
    return { ok: false, error: "EMAIL_NOT_CONFIGURED" };
  }

  try {
    const transporter = process.env.SMTP_URL
      ? nodemailer.createTransport(process.env.SMTP_URL)
      : nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: user && pass ? { user, pass } : undefined,
        });

    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { ok: true };
  } catch (e) {
    logger.error({ err: e }, "SMTP send failed");
    return { ok: false, error: "SMTP_ERROR" };
  }
}
