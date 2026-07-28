/**
 * Sound reuse endpoints — eligibility, confirmation, settings, use.
 */
import { Router } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import {
  canReuseSound,
  enrichOwnerUsername,
  getSoundById,
  publicSoundPayload,
  RIGHTS_CONFIRMATION_VERSION,
} from "../lib/soundReuse";
import {
  clientMeta,
  insertRightsConfirmation,
  recordReuseEvent,
  setReuseSetting,
} from "../lib/soundRights";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";

const router = Router();

router.get("/:soundId", async (req, res) => {
  try {
    const sound = await getSoundById(String(req.params.soundId));
    if (!sound || sound.removed_at) {
      return res.status(404).json({ error: "Sound not found." });
    }
    const token = getTokenFromRequest(req);
    const payload = token ? verifyAuthToken(token) : null;
    const ok = await canReuseSound(sound, payload?.sub || null);
    const isOwner = Boolean(payload?.sub && sound.original_uploader_id === payload.sub);
    const body = await enrichOwnerUsername(
      publicSoundPayload(sound, ok, { isOwner }),
    );
    if (isOwner) {
      (body as Record<string, unknown>).isOwner = true;
      (body as Record<string, unknown>).rightsConfirmed = Boolean(sound.rights_confirmed);
    }
    return res.json(body);
  } catch (err) {
    logger.error({ err }, "GET /api/sounds/:id failed");
    return res.status(500).json({ error: "Failed to load sound" });
  }
});

router.post("/:soundId/reuse-confirmation", async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    const user = token ? verifyAuthToken(token) : null;
    if (!user?.sub) return res.status(401).json({ error: "Unauthorized" });

    const sound = await getSoundById(String(req.params.soundId));
    if (!sound) return res.status(404).json({ error: "Sound not found." });
    if (sound.original_uploader_id !== user.sub) {
      return res.status(403).json({ error: "Only the original uploader may confirm rights." });
    }

    const body = req.body || {};
    if (!body.rightsConfirmed && body.confirmed !== true) {
      return res.status(400).json({
        error: "A valid rights confirmation is required before audio reuse can be enabled.",
      });
    }
    const version = String(body.rightsConfirmationVersion || RIGHTS_CONFIRMATION_VERSION);
    const meta = clientMeta(req);
    const confirmationId = await insertRightsConfirmation({
      soundId: sound.id,
      userId: user.sub,
      version,
      ipHash: meta.ipHash,
      userAgent: meta.userAgent,
      appVersion: meta.appVersion,
      platform: meta.platform,
    });

    const db = getPool();
    if (db) {
      await db.query(
        `UPDATE sounds SET
           rights_confirmed = TRUE,
           rights_confirmed_at = NOW(),
           rights_confirmation_version = $2,
           rights_confirmed_by_user_id = $3,
           rights_confirmation_ip_hash = $4,
           rights_confirmation_user_agent = $5,
           updated_at = NOW()
         WHERE id = $1`,
        [sound.id, version, user.sub, meta.ipHash, meta.userAgent],
      );
    }

    return res.json({ ok: true, confirmationId, rightsConfirmationVersion: version });
  } catch (err) {
    logger.error({ err }, "POST reuse-confirmation failed");
    return res.status(500).json({ error: "Failed to store confirmation" });
  }
});

router.patch("/:soundId/reuse-setting", async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    const user = token ? verifyAuthToken(token) : null;
    if (!user?.sub) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body || {};
    const allowReuse = Boolean(body.allowReuse ?? body.allowSoundReuse);
    const rightsConfirmed = Boolean(body.rightsConfirmed);
    const version = String(body.rightsConfirmationVersion || RIGHTS_CONFIRMATION_VERSION);

    const updated = await setReuseSetting({
      soundId: String(req.params.soundId),
      userId: user.sub,
      allowReuse,
      rightsConfirmed,
      rightsVersion: version,
      meta: clientMeta(req),
    });
    const ok = await canReuseSound(updated, user.sub);
    return res.json(await enrichOwnerUsername(publicSoundPayload(updated, ok)));
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    const message =
      (err as Error).message || "Failed to update reuse setting";
    if (status >= 400 && status < 500) return res.status(status).json({ error: message });
    logger.error({ err }, "PATCH reuse-setting failed");
    return res.status(500).json({ error: "Failed to update reuse setting" });
  }
});

/** Intent to use a sound in a new video — revalidates eligibility. */
router.post("/:soundId/use", async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    const user = token ? verifyAuthToken(token) : null;
    if (!user?.sub) return res.status(401).json({ error: "Unauthorized" });

    const sound = await getSoundById(String(req.params.soundId));
    if (!sound || sound.removed_at) {
      return res.status(409).json({ error: "This sound is no longer available for reuse." });
    }
    const ok = await canReuseSound(sound, user.sub);
    if (!ok) {
      return res.status(409).json({ error: "This sound is no longer available for reuse." });
    }

    await recordReuseEvent({ soundId: sound.id, userId: user.sub });

    const db = getPool();
    let username = "creator";
    if (db && sound.original_uploader_id) {
      const pr = await db.query(
        `SELECT username FROM profiles WHERE user_id = $1 LIMIT 1`,
        [sound.original_uploader_id],
      );
      username = String(pr.rows[0]?.username || "creator");
    }

    return res.json({
      ok: true,
      soundId: sound.id,
      canReuse: true,
      music: {
        id: sound.id,
        title: sound.title || "Original sound",
        artist: sound.artist || username,
        url: sound.audio_url || "",
        previewUrl: sound.audio_url || "",
        provider: "ugc",
        source: "original_sound",
        displayLabel: `Original sound — @${username}`,
        attribution: `Original sound — @${username}`,
        originalUploaderId: sound.original_uploader_id,
        sourceVideoId: sound.source_video_id,
      },
    });
  } catch (err) {
    logger.error({ err }, "POST /use failed");
    return res.status(500).json({ error: "Failed to start sound reuse" });
  }
});

export default router;
