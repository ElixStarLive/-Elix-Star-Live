/**
 * Sound rights confirmation, reuse settings, and UGC sound upsert on video create.
 */
import { randomBytes } from "crypto";
import type { Request } from "express";
import { getPool } from "./postgres";
import { logger } from "./logger";
import {
  RIGHTS_CONFIRMATION_VERSION,
  hashIp,
  getSoundById,
  type SoundRow,
} from "./soundReuse";

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

export function clientMeta(req: Request): {
  ipHash: string | null;
  userAgent: string | null;
  appVersion: string | null;
  platform: "IOS" | "ANDROID" | "WEB" | null;
} {
  const fwd = req.headers["x-forwarded-for"];
  const ip =
    (typeof fwd === "string" ? fwd.split(",")[0]?.trim() : null) ||
    req.socket?.remoteAddress ||
    null;
  const ua = String(req.headers["user-agent"] || "").slice(0, 500) || null;
  const appVersion = String(req.headers["x-app-version"] || "").slice(0, 40) || null;
  const platRaw = String(req.headers["x-platform"] || "").toUpperCase();
  const platform =
    platRaw === "IOS" || platRaw === "ANDROID" || platRaw === "WEB"
      ? (platRaw as "IOS" | "ANDROID" | "WEB")
      : ua?.includes("iPhone") || ua?.includes("iPad")
        ? "IOS"
        : ua?.includes("Android")
          ? "ANDROID"
          : "WEB";
  return { ipHash: hashIp(ip), userAgent: ua, appVersion, platform };
}

export async function insertRightsConfirmation(opts: {
  soundId: string;
  userId: string;
  version?: string;
  ipHash: string | null;
  userAgent: string | null;
  appVersion: string | null;
  platform: string | null;
}): Promise<string> {
  const db = getPool();
  if (!db) throw new Error("Database not configured");
  const id = newId("src");
  await db.query(
    `INSERT INTO sound_rights_confirmations
      (id, sound_id, user_id, confirmation_version, confirmed_at, ip_hash, user_agent, app_version, platform)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8)`,
    [
      id,
      opts.soundId,
      opts.userId,
      opts.version || RIGHTS_CONFIRMATION_VERSION,
      opts.ipHash,
      opts.userAgent,
      opts.appVersion,
      opts.platform,
    ],
  );
  return id;
}

export async function upsertOriginalSound(opts: {
  soundId: string;
  title: string;
  artist: string;
  audioUrl: string;
  durationMs: number;
  uploaderId: string;
  sourceVideoId: string;
  allowReuse: boolean;
  rightsConfirmed: boolean;
  rightsVersion: string | null;
  ipHash: string | null;
  userAgent: string | null;
}): Promise<SoundRow> {
  const db = getPool();
  if (!db) throw new Error("Database not configured");

  if (opts.allowReuse && !opts.rightsConfirmed) {
    throw new Error("RIGHTS_REQUIRED");
  }

  await db.query(
    `INSERT INTO sounds (
       id, title, artist, audio_url, duration_ms, created_at,
       allow_reuse, rights_confirmed, rights_confirmed_at, rights_confirmation_version,
       rights_confirmed_by_user_id, rights_confirmation_ip_hash, rights_confirmation_user_agent,
       copyright_status, original_uploader_id, source_video_id, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,NOW(),
       $6,$7, CASE WHEN $7 THEN NOW() ELSE NULL END, $8,
       CASE WHEN $7 THEN $9 ELSE NULL END, $10, $11,
       'ACTIVE', $9, $12, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       artist = EXCLUDED.artist,
       audio_url = COALESCE(NULLIF(EXCLUDED.audio_url,''), sounds.audio_url),
       duration_ms = CASE WHEN EXCLUDED.duration_ms > 0 THEN EXCLUDED.duration_ms ELSE sounds.duration_ms END,
       allow_reuse = EXCLUDED.allow_reuse,
       rights_confirmed = EXCLUDED.rights_confirmed,
       rights_confirmed_at = CASE WHEN EXCLUDED.rights_confirmed THEN NOW() ELSE NULL END,
       rights_confirmation_version = EXCLUDED.rights_confirmation_version,
       rights_confirmed_by_user_id = EXCLUDED.rights_confirmed_by_user_id,
       rights_confirmation_ip_hash = EXCLUDED.rights_confirmation_ip_hash,
       rights_confirmation_user_agent = EXCLUDED.rights_confirmation_user_agent,
       source_video_id = COALESCE(EXCLUDED.source_video_id, sounds.source_video_id),
       original_uploader_id = COALESCE(sounds.original_uploader_id, EXCLUDED.original_uploader_id),
       reuse_disabled_at = CASE WHEN EXCLUDED.allow_reuse THEN NULL ELSE sounds.reuse_disabled_at END,
       reuse_disabled_reason = CASE WHEN EXCLUDED.allow_reuse THEN NULL ELSE sounds.reuse_disabled_reason END,
       updated_at = NOW()`,
    [
      opts.soundId,
      opts.title || "Original sound",
      opts.artist || "",
      opts.audioUrl || "",
      opts.durationMs || 0,
      opts.allowReuse,
      opts.rightsConfirmed,
      opts.rightsConfirmed ? opts.rightsVersion || RIGHTS_CONFIRMATION_VERSION : null,
      opts.uploaderId,
      opts.ipHash,
      opts.userAgent,
      opts.sourceVideoId,
    ],
  );

  if (opts.allowReuse && opts.rightsConfirmed) {
    await insertRightsConfirmation({
      soundId: opts.soundId,
      userId: opts.uploaderId,
      version: opts.rightsVersion || RIGHTS_CONFIRMATION_VERSION,
      ipHash: opts.ipHash,
      userAgent: opts.userAgent,
      appVersion: null,
      platform: null,
    });
  }

  const sound = await getSoundById(opts.soundId);
  if (!sound) throw new Error("Sound upsert failed");
  return sound;
}

export async function setReuseSetting(opts: {
  soundId: string;
  userId: string;
  allowReuse: boolean;
  rightsConfirmed?: boolean;
  rightsVersion?: string;
  meta: ReturnType<typeof clientMeta>;
}): Promise<SoundRow> {
  const db = getPool();
  if (!db) throw new Error("Database not configured");
  const sound = await getSoundById(opts.soundId);
  if (!sound) throw Object.assign(new Error("Sound not found"), { status: 404 });
  if (sound.original_uploader_id !== opts.userId) {
    throw Object.assign(new Error("Only the original uploader may change reuse settings."), {
      status: 403,
    });
  }
  if (sound.removed_at) {
    throw Object.assign(new Error("This sound has been removed."), { status: 409 });
  }

  if (!opts.allowReuse) {
    await db.query(
      `UPDATE sounds SET
         allow_reuse = FALSE,
         rights_confirmed = FALSE,
         rights_confirmed_at = NULL,
         rights_confirmation_version = NULL,
         reuse_disabled_at = NOW(),
         reuse_disabled_reason = 'DISABLED_BY_UPLOADER',
         copyright_status = CASE
           WHEN copyright_status = 'REMOVED' THEN copyright_status
           ELSE 'REUSE_DISABLED'
         END,
         updated_at = NOW()
       WHERE id = $1`,
      [opts.soundId],
    );
  } else {
    if (!opts.rightsConfirmed) {
      throw Object.assign(
        new Error("A valid rights confirmation is required before audio reuse can be enabled."),
        { status: 400 },
      );
    }
    // Check uploader not suspended for copyright reuse
    const pr = await db.query(
      `SELECT banned_until, copyright_reuse_suspended_until FROM profiles WHERE user_id = $1`,
      [opts.userId],
    );
    const prow = pr.rows[0] as
      | { banned_until?: Date | string | null; copyright_reuse_suspended_until?: Date | string | null }
      | undefined;
    const now = Date.now();
    if (prow?.banned_until && new Date(prow.banned_until).getTime() > now) {
      throw Object.assign(new Error("Account suspended."), { status: 403 });
    }
    if (
      prow?.copyright_reuse_suspended_until &&
      new Date(prow.copyright_reuse_suspended_until).getTime() > now
    ) {
      throw Object.assign(new Error("Sound reuse is temporarily restricted on this account."), {
        status: 403,
      });
    }

    await db.query(
      `UPDATE sounds SET
         allow_reuse = TRUE,
         rights_confirmed = TRUE,
         rights_confirmed_at = NOW(),
         rights_confirmation_version = $2,
         rights_confirmed_by_user_id = $3,
         rights_confirmation_ip_hash = $4,
         rights_confirmation_user_agent = $5,
         reuse_disabled_at = NULL,
         reuse_disabled_reason = NULL,
         copyright_status = CASE
           WHEN copyright_status IN ('REMOVED', 'UNDER_REVIEW') THEN copyright_status
           ELSE 'ACTIVE'
         END,
         updated_at = NOW()
       WHERE id = $1`,
      [
        opts.soundId,
        opts.rightsVersion || RIGHTS_CONFIRMATION_VERSION,
        opts.userId,
        opts.meta.ipHash,
        opts.meta.userAgent,
      ],
    );

    await insertRightsConfirmation({
      soundId: opts.soundId,
      userId: opts.userId,
      version: opts.rightsVersion || RIGHTS_CONFIRMATION_VERSION,
      ipHash: opts.meta.ipHash,
      userAgent: opts.meta.userAgent,
      appVersion: opts.meta.appVersion,
      platform: opts.meta.platform,
    });
  }

  const updated = await getSoundById(opts.soundId);
  if (!updated) throw new Error("Update failed");
  logger.info(
    { soundId: opts.soundId, allowReuse: opts.allowReuse, userId: opts.userId },
    "sound reuse setting updated",
  );
  return updated;
}

export async function recordReuseEvent(opts: {
  soundId: string;
  userId: string;
  videoId?: string | null;
}): Promise<void> {
  const db = getPool();
  if (!db) return;
  try {
    await db.query(
      `INSERT INTO sound_reuse_events (id, sound_id, user_id, video_id, created_at)
       VALUES ($1,$2,$3,$4,NOW())`,
      [newId("sre"), opts.soundId, opts.userId, opts.videoId || null],
    );
  } catch (err) {
    logger.warn({ err }, "recordReuseEvent failed");
  }
}

export async function logModerationAction(opts: {
  reportId?: string | null;
  soundId?: string | null;
  actorUserId: string;
  action: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const db = getPool();
  if (!db) return;
  try {
    await db.query(
      `INSERT INTO copyright_moderation_actions (id, report_id, sound_id, actor_user_id, action, details, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW())`,
      [
        newId("cma"),
        opts.reportId || null,
        opts.soundId || null,
        opts.actorUserId,
        opts.action,
        JSON.stringify(opts.details || {}),
      ],
    );
  } catch (err) {
    logger.warn({ err }, "logModerationAction failed");
  }
}
