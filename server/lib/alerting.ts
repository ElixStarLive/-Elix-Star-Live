/**
 * Optional outbound alerts (Slack-compatible webhook) for critical signals.
 */
import { logger } from "./logger";

export async function postAlertWebhook(payload: {
  text: string;
  severity?: "info" | "warning" | "critical";
  context?: Record<string, unknown>;
}): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    const body = JSON.stringify({
      text: `[${payload.severity || "info"}] ${payload.text}`,
      ...(payload.context ? { attachments: [{ text: JSON.stringify(payload.context).slice(0, 3500) }] } : {}),
    });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "alert webhook non-OK");
    }
  } catch (e) {
    logger.warn({ err: e }, "alert webhook failed");
  }
}
