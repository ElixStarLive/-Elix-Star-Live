/**
 * Processes Valkey queue jobs: retention cleanup, push, email.
 */
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
import type { JobPayload } from "../lib/jobQueue";
import { sendTransactionalEmail } from "../lib/email";
import { pushNotifyUser } from "../lib/push";

const ANALYTICS_RETENTION_DAYS = Math.max(30, Number(process.env.ANALYTICS_RETENTION_DAYS) || 90);
const NOTIFICATION_RETENTION_DAYS = Math.max(14, Number(process.env.NOTIFICATION_RETENTION_DAYS) || 60);

export async function processJob(job: JobPayload): Promise<void> {
  switch (job.type) {
    case "cleanup_retention":
      await runRetentionCleanup();
      break;
    case "push_notify":
      await pushNotifyUser(job.userId, job.title, job.body, job.data);
      break;
    case "email_send":
      await sendTransactionalEmail({ to: job.to, subject: job.subject, html: job.html });
      break;
    default:
      logger.warn({ job }, "Unknown job type");
  }
}

async function runRetentionCleanup(): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    const a = await pool.query(
      `DELETE FROM elix_analytics_events WHERE created_at < NOW() - ($1::integer * INTERVAL '1 day')`,
      [ANALYTICS_RETENTION_DAYS],
    );
    const n = await pool.query(
      `DELETE FROM elix_notifications WHERE created_at < NOW() - ($1::integer * INTERVAL '1 day')`,
      [NOTIFICATION_RETENTION_DAYS],
    );
    logger.info(
      { analytics_deleted: a.rowCount, notifications_deleted: n.rowCount },
      "Retention cleanup completed",
    );
  } catch (e) {
    logger.error({ err: e }, "Retention cleanup failed");
  }
}
