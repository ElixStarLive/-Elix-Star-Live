import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Rising Stars migration", () => {
  const sql = readFileSync(
    resolve(__dirname, "../migrations/20260717180000_rising_stars.sql"),
    "utf8",
  );

  it("creates vote uniqueness for free daily votes", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS rs_votes");
    expect(sql).toContain("UNIQUE (challenge_id, voter_user_id, vote_day)");
  });

  it("keeps entries unique per creator and video", () => {
    expect(sql).toContain("UNIQUE (challenge_id, creator_user_id)");
    expect(sql).toContain("UNIQUE (challenge_id, video_id)");
  });

  it("does not reference wallet ledger tables", () => {
    expect(sql.toLowerCase()).not.toContain("elix_wallet");
    expect(sql.toLowerCase()).not.toContain("stripe");
  });
});

describe("Rising Stars route mounts", () => {
  const indexSrc = readFileSync(
    resolve(__dirname, "../routes/index.ts"),
    "utf8",
  );

  it("mounts public and admin Rising Stars routers", () => {
    expect(indexSrc).toContain('app.use("/api/rising-stars", risingStarsRouter)');
    expect(indexSrc).toContain(
      'app.use("/api/admin/rising-stars", adminRisingStarsRouter)',
    );
  });
});
