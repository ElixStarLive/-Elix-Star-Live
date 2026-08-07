/**
 * Persist in-app notifications and optionally enqueue push delivery.
 * Rising Stars is the first writer into elix_notifications.
 */
import { getPool } from "./postgres";
import { enqueueJob } from "./jobQueue";
import { logger } from "./logger";

export async function insertNotification(opts: {
  userId: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string;
  data?: Record<string, string>;
  push?: boolean;
}): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  const actionUrl =
    opts.actionUrl ||
    (opts.data?.path ? String(opts.data.path) : "") ||
    "";
  try {
    await pool.query(
      `INSERT INTO elix_notifications (user_id, type, title, body, action_url, read, created_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, NOW())`,
      [opts.userId, opts.type, opts.title, opts.body, actionUrl],
    );
  } catch (err) {
    logger.warn({ err, userId: opts.userId }, "insertNotification failed");
    return false;
  }

  if (opts.push !== false) {
    await enqueueJob({
      type: "push_notify",
      userId: opts.userId,
      title: opts.title,
      body: opts.body,
      data: opts.data,
    });
  }
  return true;
}

/**
 * Remove inbox "is live" rows for a room when the stream ends (or before a fresh one-shot notify).
 * Does not touch live-share / DM / other notification types.
 */
export async function deleteLiveStartedNotificationsForRoom(roomName: string): Promise<number> {
  const room = String(roomName || "").trim();
  if (!room) return 0;
  const pool = getPool();
  if (!pool) return 0;
  const livePath = `/live/${encodeURIComponent(room)}`;
  const livePathRaw = `/live/${room}`;
  const roomEncoded = encodeURIComponent(room);
  try {
    const r = await pool.query(
      `DELETE FROM elix_notifications
       WHERE type = 'live_started'
         AND (
           action_url = $1
           OR action_url LIKE $2
           OR action_url = $3
           OR action_url LIKE $4
           OR action_url LIKE $5
           OR action_url LIKE $6
         )`,
      [
        livePath,
        `${livePath}?%`,
        livePathRaw,
        `${livePathRaw}?%`,
        `%/live/${roomEncoded}?%`,
        `%/live/${roomEncoded}`,
      ],
    );
    return Number(r.rowCount || 0);
  } catch (err) {
    logger.warn({ err, room }, "deleteLiveStartedNotificationsForRoom failed");
    return 0;
  }
}

/** Room id from a live inbox action URL (`/live/:room`). */
function roomIdFromLiveActionUrl(actionUrl: string | null | undefined): string | null {
  if (!actionUrl) return null;
  try {
    const path = actionUrl.startsWith("http")
      ? new URL(actionUrl).pathname
      : String(actionUrl).split("?")[0];
    const m = path.match(/\/live\/([^/]+)/i);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Drop every "is live" inbox row whose room is no longer live.
 * Called when Inbox loads so ended streams (incl. QA probe) disappear completely.
 */
export async function pruneEndedLiveStartedNotifications(
  activeRoomIds: Iterable<string>,
): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  const active = new Set(
    [...activeRoomIds].map((id) => String(id || "").trim()).filter(Boolean),
  );
  try {
    const r = await pool.query<{ id: string; action_url: string | null }>(
      `SELECT id, action_url
         FROM elix_notifications
        WHERE type = 'live_started'
        ORDER BY created_at DESC
        LIMIT 500`,
    );
    const staleIds: string[] = [];
    for (const row of r.rows) {
      const room = roomIdFromLiveActionUrl(row.action_url);
      if (!room || !active.has(room)) staleIds.push(String(row.id));
    }
    if (staleIds.length === 0) return 0;
    const del = await pool.query(
      `DELETE FROM elix_notifications WHERE id = ANY($1::text[])`,
      [staleIds],
    );
    return Number(del.rowCount || 0);
  } catch (err) {
    logger.warn({ err }, "pruneEndedLiveStartedNotifications failed");
    return 0;
  }
}
