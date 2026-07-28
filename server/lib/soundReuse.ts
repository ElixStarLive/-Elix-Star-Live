/**
 * Shared sound-reuse eligibility. Single source of truth for controllers.
 */
import { createHash } from "crypto";
import type { Pool } from "pg";
import { getPool } from "./postgres";
import { logger } from "./logger";

export type CopyrightStatus =
  | "ACTIVE"
  | "REUSE_DISABLED"
  | "UNDER_REVIEW"
  | "REMOVED";

export interface SoundRow {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  duration_ms: number;
  allow_reuse: boolean;
  rights_confirmed: boolean;
  rights_confirmed_at: Date | string | null;
  rights_confirmation_version: string | null;
  rights_confirmed_by_user_id: string | null;
  copyright_status: string;
  reuse_disabled_at: Date | string | null;
  reuse_disabled_reason: string | null;
  removed_at: Date | string | null;
  removed_reason: string | null;
  original_uploader_id: string | null;
  source_video_id: string | null;
  created_at?: Date | string;
}

export const RIGHTS_CONFIRMATION_VERSION = "1.0";

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip || !String(ip).trim()) return null;
  const salt = process.env.IP_HASH_SALT || process.env.JWT_SECRET || "elix-ip-hash";
  return createHash("sha256").update(`${salt}:${String(ip).trim()}`).digest("hex").slice(0, 64);
}

export function isFeatureEnabled(): boolean {
  const v = String(process.env.SOUND_REUSE_RIGHTS_FLOW || "true").toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

export async function getSoundById(soundId: string): Promise<SoundRow | null> {
  const db = getPool();
  if (!db) return null;
  const r = await db.query(`SELECT * FROM sounds WHERE id = $1 LIMIT 1`, [soundId]);
  return (r.rows[0] as SoundRow) || null;
}

async function isUploaderActive(db: Pool, uploaderId: string): Promise<boolean> {
  const r = await db.query(
    `SELECT banned_until, copyright_reuse_suspended_until
     FROM profiles WHERE user_id = $1 LIMIT 1`,
    [uploaderId],
  );
  const row = r.rows[0] as
    | { banned_until?: Date | string | null; copyright_reuse_suspended_until?: Date | string | null }
    | undefined;
  if (!row) return false;
  const now = Date.now();
  if (row.banned_until && new Date(row.banned_until).getTime() > now) return false;
  if (
    row.copyright_reuse_suspended_until &&
    new Date(row.copyright_reuse_suspended_until).getTime() > now
  ) {
    return false;
  }
  return true;
}

async function isBlockedBetween(
  db: Pool,
  a: string,
  b: string,
): Promise<boolean> {
  try {
    const r = await db.query(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
       LIMIT 1`,
      [a, b],
    );
    return r.rows.length > 0;
  } catch (err) {
    logger.warn({ err }, "isBlockedBetween query failed — treating as blocked");
    return true;
  }
}

/**
 * Returns true only when the sound may be reused by requestingUser.
 * Apply all eligibility rules here — do not duplicate in controllers.
 */
export async function canReuseSound(
  sound: SoundRow | null | undefined,
  requestingUserId: string | null | undefined,
): Promise<boolean> {
  if (!isFeatureEnabled()) return false;
  if (!sound) return false;
  if (!sound.allow_reuse) return false;
  if (!sound.rights_confirmed) return false;
  if (String(sound.copyright_status || "").toUpperCase() !== "ACTIVE") return false;
  if (sound.removed_at) return false;
  const uploaderId = sound.original_uploader_id ? String(sound.original_uploader_id) : "";
  if (!uploaderId) return false;

  const db = getPool();
  if (!db) return false;

  try {
    if (!(await isUploaderActive(db, uploaderId))) return false;

    if (requestingUserId) {
      if (!(await isUploaderActive(db, requestingUserId))) return false;
      if (await isBlockedBetween(db, requestingUserId, uploaderId)) return false;
    }
  } catch (err) {
    logger.warn({ err, soundId: sound.id }, "canReuseSound check failed");
    return false;
  }

  return true;
}

export function publicSoundPayload(
  sound: SoundRow,
  canReuse: boolean,
  opts?: { isOwner?: boolean },
): Record<string, unknown> {
  const isOwner = Boolean(opts?.isOwner);
  const exposeAudio = canReuse || isOwner;
  return {
    id: sound.id,
    title: sound.title || "Original sound",
    artist: sound.artist || "",
    audioUrl: exposeAudio ? sound.audio_url || "" : "",
    durationMs: sound.duration_ms || 0,
    owner: sound.original_uploader_id
      ? { id: sound.original_uploader_id }
      : null,
    canReuse,
    copyrightStatus: sound.copyright_status || "ACTIVE",
    allowReuse: Boolean(sound.allow_reuse),
    sourceVideoId: sound.source_video_id || null,
    attributionLabel: "Original sound",
  };
}

export async function enrichOwnerUsername(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const owner = payload.owner as { id?: string } | null;
  if (!owner?.id) return payload;
  const db = getPool();
  if (!db) return payload;
  try {
    const r = await db.query(
      `SELECT username, display_name FROM profiles WHERE user_id = $1 LIMIT 1`,
      [owner.id],
    );
    const row = r.rows[0] as { username?: string; display_name?: string } | undefined;
    return {
      ...payload,
      owner: {
        id: owner.id,
        username: row?.username || "creator",
        displayName: row?.display_name || row?.username || "Creator",
      },
    };
  } catch {
    return payload;
  }
}
