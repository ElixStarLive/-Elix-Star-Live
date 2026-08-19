/**
 * Pure ranking score for For You — multi-signal, never view-count alone.
 */
import type { ForYouConfig } from "./foryouConfig";

export type RankingSignals = {
  qualifiedUniqueViews: number;
  watchTimeSeconds: number;
  completions: number;
  rewatchesUnique: number;
  shares: number;
  saves: number;
  comments: number;
  likes: number;
  followsGenerated: number;
  profileVisitsGenerated: number;
  reportCount: number;
  notInterestedCount: number;
  retentionScore: number;
  ageHours: number;
  freshnessWindowHours: number;
  creatorQualityScore: number;
  guidelinesOk: boolean;
};

function log1p(x: number): number {
  return Math.log1p(Math.max(0, x));
}

/**
 * Compute ranking score from signals + admin weights.
 * Fraudulent engagement must be removed before calling (caller responsibility).
 */
export function computeForYouRankingScore(signals: RankingSignals, cfg: ForYouConfig): number {
  const w = cfg.weights;
  const impressions = Math.max(1, signals.qualifiedUniqueViews);
  const reportRate = signals.reportCount / impressions;
  const notInterestedRate = signals.notInterestedCount / impressions;
  const freshnessNorm = Math.max(
    0,
    1 - signals.ageHours / Math.max(1, signals.freshnessWindowHours),
  );

  let score = 0;
  score += w.qualifiedViews * log1p(signals.qualifiedUniqueViews);
  score += w.watchTime * log1p(signals.watchTimeSeconds / 60);
  score += w.completion * log1p(signals.completions);
  score += w.rewatches * log1p(signals.rewatchesUnique);
  score += w.shares * log1p(signals.shares);
  score += w.saves * log1p(signals.saves);
  score += w.comments * log1p(signals.comments);
  score += w.likes * log1p(signals.likes);
  score += w.follows * log1p(signals.followsGenerated);
  score += w.profileVisits * log1p(signals.profileVisitsGenerated);
  score += w.reportRate * reportRate * 100;
  score += w.notInterested * notInterestedRate * 100;
  score += w.retention * Math.max(0, signals.retentionScore);
  score += w.freshness * freshnessNorm;
  score += w.creatorQuality * Math.max(0, signals.creatorQualityScore);

  if (!signals.guidelinesOk) {
    score += w.guidelines;
  }

  // Fraud sensitivity soft-damps when reports/not-interested are elevated.
  const sensitivity = cfg.fraudSensitivity / 100;
  if (reportRate > 0.02 || notInterestedRate > 0.05) {
    score *= Math.max(0.1, 1 - sensitivity * 0.5);
  }

  return Number.isFinite(score) ? score : 0;
}