import { describe, expect, it } from "vitest";
import { computeForYouRankingScore } from "./foryouRanking";
import { defaultForYouConfig } from "./foryouConfig";

describe("For You ranking score", () => {
  it("does not rank by view count alone — engagement lifts score", () => {
    const cfg = defaultForYouConfig();
    const base = computeForYouRankingScore(
      {
        qualifiedUniqueViews: 100,
        watchTimeSeconds: 0,
        completions: 0,
        rewatchesUnique: 0,
        shares: 0,
        saves: 0,
        comments: 0,
        likes: 0,
        followsGenerated: 0,
        profileVisitsGenerated: 0,
        reportCount: 0,
        notInterestedCount: 0,
        retentionScore: 0,
        ageHours: 1,
        freshnessWindowHours: 72,
        creatorQualityScore: 1,
        guidelinesOk: true,
      },
      cfg,
    );
    const engaged = computeForYouRankingScore(
      {
        qualifiedUniqueViews: 100,
        watchTimeSeconds: 5000,
        completions: 80,
        rewatchesUnique: 20,
        shares: 30,
        saves: 25,
        comments: 40,
        likes: 200,
        followsGenerated: 15,
        profileVisitsGenerated: 50,
        reportCount: 0,
        notInterestedCount: 0,
        retentionScore: 0.8,
        ageHours: 1,
        freshnessWindowHours: 72,
        creatorQualityScore: 1.2,
        guidelinesOk: true,
      },
      cfg,
    );
    expect(engaged).toBeGreaterThan(base);
  });

  it("guidelines violation heavily penalizes", () => {
    const cfg = defaultForYouConfig();
    const ok = computeForYouRankingScore(
      {
        qualifiedUniqueViews: 5000,
        watchTimeSeconds: 1000,
        completions: 100,
        rewatchesUnique: 10,
        shares: 10,
        saves: 10,
        comments: 10,
        likes: 100,
        followsGenerated: 5,
        profileVisitsGenerated: 10,
        reportCount: 0,
        notInterestedCount: 0,
        retentionScore: 0.5,
        ageHours: 2,
        freshnessWindowHours: 72,
        creatorQualityScore: 1,
        guidelinesOk: true,
      },
      cfg,
    );
    const bad = computeForYouRankingScore(
      {
        qualifiedUniqueViews: 5000,
        watchTimeSeconds: 1000,
        completions: 100,
        rewatchesUnique: 10,
        shares: 10,
        saves: 10,
        comments: 10,
        likes: 100,
        followsGenerated: 5,
        profileVisitsGenerated: 10,
        reportCount: 0,
        notInterestedCount: 0,
        retentionScore: 0.5,
        ageHours: 2,
        freshnessWindowHours: 72,
        creatorQualityScore: 1,
        guidelinesOk: false,
      },
      cfg,
    );
    expect(bad).toBeLessThan(ok);
  });

  it("high report rate reduces score under fraud sensitivity", () => {
    const cfg = defaultForYouConfig();
    cfg.fraudSensitivity = 90;
    const clean = computeForYouRankingScore(
      {
        qualifiedUniqueViews: 1000,
        watchTimeSeconds: 500,
        completions: 50,
        rewatchesUnique: 5,
        shares: 5,
        saves: 5,
        comments: 5,
        likes: 50,
        followsGenerated: 2,
        profileVisitsGenerated: 5,
        reportCount: 0,
        notInterestedCount: 0,
        retentionScore: 0.4,
        ageHours: 5,
        freshnessWindowHours: 72,
        creatorQualityScore: 1,
        guidelinesOk: true,
      },
      cfg,
    );
    const reported = computeForYouRankingScore(
      {
        qualifiedUniqueViews: 1000,
        watchTimeSeconds: 500,
        completions: 50,
        rewatchesUnique: 5,
        shares: 5,
        saves: 5,
        comments: 5,
        likes: 50,
        followsGenerated: 2,
        profileVisitsGenerated: 5,
        reportCount: 50,
        notInterestedCount: 80,
        retentionScore: 0.4,
        ageHours: 5,
        freshnessWindowHours: 72,
        creatorQualityScore: 1,
        guidelinesOk: true,
      },
      cfg,
    );
    expect(reported).toBeLessThan(clean);
  });
});
