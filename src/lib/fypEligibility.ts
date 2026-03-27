/**
 * FYP Eligibility Engine — Hetzner backend.
 *
 * Calculates an engagement score for a video and decides whether it
 * should appear on the For You Page.
 *
 * Score formula:
 *   watch_time × 2  +  likes × 5  +  comments × 6  +  shares × 8
 *   + completions × 10  +  views × 1
 *
 * Threshold:
 *   A video becomes FYP-eligible when its score ≥ FYP_THRESHOLD.
 *   New uploads start with a small "new-video boost" so they get
 *   initial impressions before organic engagement kicks in.
 *
 * Persistence via PATCH /api/videos/:id/fyp on the Node backend.
 */

import { apiUrl } from "./api";
import { useAuthStore } from "../store/useAuthStore";

// ── Weights ──────────────────────────────────────────────────────────────────

const WEIGHT_WATCH_TIME = 2;
const WEIGHT_LIKE = 5;
const WEIGHT_COMMENT = 6;
const WEIGHT_SHARE = 8;
const WEIGHT_COMPLETION = 10;
const WEIGHT_VIEW = 1;

/** Score a video must reach before the algorithm shows it on FYP. */
export const FYP_THRESHOLD = 50;

/** Boost given to every newly-uploaded video so it gets initial exposure. */
export const NEW_VIDEO_BOOST = 50;

// ── Auth helpers ─────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().session?.access_token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Calculate raw engagement score from video stats. */
export function calculateEngagementScore(stats: {
  likes: number;
  comments: number;
  shares: number;
  views: number;
  watch_time?: number;
  completions?: number;
}): number {
  return (
    (stats.watch_time ?? 0) * WEIGHT_WATCH_TIME +
    stats.likes * WEIGHT_LIKE +
    stats.comments * WEIGHT_COMMENT +
    stats.shares * WEIGHT_SHARE +
    (stats.completions ?? 0) * WEIGHT_COMPLETION +
    stats.views * WEIGHT_VIEW
  );
}

/** Return true when a score qualifies for the For You Page. */
export function isEligibleForFyp(score: number): boolean {
  return score >= FYP_THRESHOLD;
}

// ── Backend helpers ───────────────────────────────────────────────────────────

/**
 * PATCH /api/videos/:id/fyp
 * Internal helper — sends an FYP status update to the Hetzner backend.
 */
async function patchVideoFyp(
  videoId: string,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    const res = await fetch(apiUrl(`/api/videos/${videoId}/fyp`), {
      method: "PATCH",
      headers: getAuthHeaders(),
      credentials: "include",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      console.warn(
        `[FYP] PATCH /api/videos/${videoId}/fyp failed:`,
        err.error ?? res.status,
      );
    }
  } catch (err) {
    // Non-critical — FYP score updates should never crash the upload flow
    console.warn("[FYP] Network error updating FYP status:", err);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Recalculate engagement_score + is_eligible_for_fyp for a single video
 * and persist the result to the Hetzner backend.
 *
 * Safe to call frequently — single PATCH request.
 */
export async function refreshVideoFypStatus(
  videoId: string,
  stats: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
    watch_time?: number;
    completions?: number;
  },
): Promise<void> {
  const score = calculateEngagementScore(stats);
  const eligible = isEligibleForFyp(score);

  await patchVideoFyp(videoId, {
    engagementScore: score,
    isEligibleForFyp: eligible,
  });
}

/**
 * Give a freshly-uploaded video an initial engagement boost so it starts
 * appearing in FYP feeds right away before organic engagement accumulates.
 *
 * Called automatically by VideoUploadService after a successful upload.
 */
export async function boostNewVideo(videoId: string): Promise<void> {
  await patchVideoFyp(videoId, {
    engagementScore: NEW_VIDEO_BOOST,
    isEligibleForFyp: NEW_VIDEO_BOOST >= FYP_THRESHOLD,
    boost: true,
  });
}
