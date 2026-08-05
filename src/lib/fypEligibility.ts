/**
 * Legacy client FYP score helpers — DEPRECATED for For You ranking.
 *
 * For You visibility and ranking are backend-owned
 * (`elix_video_foryou_state` + GET /api/feed/foryou). Clients must not
 * decide eligibility. These helpers remain as no-ops so call sites compile
 * without hitting the broken PATCH /api/videos/:id/fyp path.
 */

/** @deprecated Score is not used for For You ranking. */
export const FYP_THRESHOLD = 50;

/** @deprecated Boost is handled by enrollVideoInForYou on upload. */
export const NEW_VIDEO_BOOST = 50;

/** @deprecated Pure helper kept for any unit tests that still import it. */
export function calculateEngagementScore(stats: {
  likes: number;
  comments: number;
  shares: number;
  views: number;
  watch_time?: number;
  completions?: number;
}): number {
  return (
    (stats.watch_time ?? 0) * 2 +
    stats.likes * 5 +
    stats.comments * 6 +
    stats.shares * 8 +
    (stats.completions ?? 0) * 10 +
    stats.views * 1
  );
}

/** @deprecated For You does not use client eligibility. */
export function isEligibleForFyp(score: number): boolean {
  return score >= FYP_THRESHOLD;
}

/**
 * No-op — For You ranking is server-owned. Do not PATCH /api/videos/:id/fyp.
 */
export async function refreshVideoFypStatus(
  _videoId: string,
  _stats: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
    watch_time?: number;
    completions?: number;
  },
): Promise<void> {
  /* intentionally empty */
}

/**
 * No-op — enrollment happens in postgres save → enrollVideoInForYou.
 */
export async function boostNewVideo(_videoId: string): Promise<void> {
  /* intentionally empty */
}
