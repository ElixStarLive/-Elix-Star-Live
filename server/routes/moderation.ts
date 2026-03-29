/**
 * Live AI moderation: flag dangerous behavior only; enforce warning → pause → suspend.
 * All actions logged for review. Do NOT flag: smoking, drinking, sitting in car, normal adult content.
 */

import { Request, Response } from 'express';
import { getPool } from '../lib/postgres';
import { getTokenFromRequest, verifyAuthToken } from './auth';
import { logger } from '../lib/logger';

const DANGEROUS_CATEGORIES = [
  'driving_while_live',
  'drunk_driving_encouragement',
  'dangerous_stunt',
  'illegal_activity_promotion',
  'self_harm_encouragement',
  'violent_challenge',
] as const;

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24h for "repeated"
const WARNING_MESSAGE = 'Your stream may violate our safety guidelines. Please avoid dangerous or illegal activity.';
const PAUSE_MESSAGE = 'Stream paused for safety. Please review our community guidelines.';
const SUSPEND_MESSAGE = 'Your account is under review. Contact support if you have questions.';

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface AIModerationResult {
  flagged: boolean;
  category?: string | null;
  severity?: Severity | null;
}

let tableReady = false;
async function ensureModerationTable(): Promise<void> {
  if (tableReady) return;
  const db = getPool();
  if (!db) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS live_moderation_log (
        id SERIAL PRIMARY KEY,
        stream_key TEXT NOT NULL,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        category TEXT,
        severity TEXT,
        action_taken TEXT NOT NULL,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    tableReady = true;
  } catch (err) {
    logger.error({ err }, 'Failed to ensure live_moderation_log table');
  }
}

async function classifyImageWithAI(imageBase64: string): Promise<AIModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { flagged: false };

  const prompt = `You are a safety classifier for live streaming. Output ONLY a JSON object with keys: "flagged" (boolean), "category" (string or null), "severity" ("low"|"medium"|"high"|"critical" or null).

Do NOT flag (treat as safe): smoking, drinking alcohol, sitting in a car as passenger, normal adult lifestyle, casual driving discussion off-camera.

DO flag only these dangerous behaviors if clearly present in the image:
- driving_while_live: person is clearly driving a vehicle while broadcasting
- drunk_driving_encouragement: promoting or encouraging driving under the influence
- dangerous_stunt: dangerous stunts or reckless physical challenges
- illegal_activity_promotion: promoting illegal activity
- self_harm_encouragement: encouraging self-harm
- violent_challenge: violent challenges or encouragement of violence

If the image shows only safe/neutral content (including smoking, drinking, or person in car as passenger), set "flagged": false and "category": null, "severity": null.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, 'OpenAI moderation API error');
      return { flagged: false };
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return { flagged: false };

    const parsed = JSON.parse(content) as AIModerationResult;
    if (typeof parsed.flagged !== 'boolean') return { flagged: false };
    if (!parsed.flagged) return { flagged: false };
    if (parsed.category && !DANGEROUS_CATEGORIES.includes(parsed.category as any)) return { flagged: false };
    return {
      flagged: true,
      category: parsed.category ?? 'unspecified',
      severity: parsed.severity ?? 'medium',
    };
  } catch (e) {
    logger.error({ err: e }, 'AI moderation classification error');
    return { flagged: false };
  }
}

export async function handleLiveModerationCheck(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });

  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  const payload = verifyAuthToken(token);
  if (!payload?.sub) return res.status(401).json({ error: 'Invalid auth token' });

  const userId = payload.sub;
  const { stream_key: streamKey, image_base64: imageBase64 } = req.body || {};

  if (!streamKey || typeof streamKey !== 'string') {
    return res.status(400).json({ error: 'Missing stream_key' });
  }

  await ensureModerationTable();

  const logEntry = async (kind: string, category: string | null, severity: string | null, action_taken: string, details: Record<string, unknown>) => {
    try {
      await db.query(
        `INSERT INTO live_moderation_log (stream_key, user_id, kind, category, severity, action_taken, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [streamKey, userId, kind, category, severity, action_taken, JSON.stringify(details)],
      );
    } catch (err) {
      logger.error({ err, streamKey, userId, kind }, 'Failed to log moderation entry');
    }
  };

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    await logEntry('check', null, null, 'none', { note: 'no_image' });
    return res.json({ action: 'none' });
  }

  try {
    const result = await classifyImageWithAI(imageBase64);

    if (!result.flagged) {
      await logEntry('check', null, null, 'none', { note: 'ai_no_flag' });
      return res.json({ action: 'none' });
    }

    const category = result.category ?? 'unspecified';
    const severity = (result.severity ?? 'medium') as Severity;

    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    let recentCount = 0;
    try {
      const r = await db.query(
        `SELECT COUNT(*)::int AS c FROM live_moderation_log
         WHERE user_id = $1 AND kind IN ('flag', 'warning', 'pause', 'suspend') AND created_at >= $2`,
        [userId, since],
      );
      recentCount = Number(r.rows[0]?.c ?? 0);
    } catch (err) {
      logger.error({ err, userId }, 'Failed to count recent moderation entries');
    }

    const isCritical = severity === 'critical';
    const shouldSuspend = isCritical || recentCount >= 2;

    if (shouldSuspend) {
      await logEntry('flag', category, severity, 'suspend', { recent_count: recentCount, reason: isCritical ? 'critical' : 'repeated' });
      try {
        await db.query(
          `UPDATE profiles SET is_verified = FALSE, updated_at = NOW() WHERE user_id = $1`,
          [userId],
        );
      } catch (err) {
        logger.error({ err, userId }, 'Failed to freeze account for moderation');
      }
      return res.json({ action: 'suspend', message: SUSPEND_MESSAGE });
    }

    if (recentCount >= 1) {
      await logEntry('flag', category, severity, 'pause', { recent_count: recentCount });
      return res.json({ action: 'pause', message: PAUSE_MESSAGE });
    }

    await logEntry('warning', category, severity, 'warning', {});
    return res.json({ action: 'warning', message: WARNING_MESSAGE });
  } catch (err) {
    logger.error({ err, streamKey: streamKey, userId }, 'handleLiveModerationCheck AI path failed');
    return res.status(500).json({ error: "MODERATION_ERROR" });
  }
}
