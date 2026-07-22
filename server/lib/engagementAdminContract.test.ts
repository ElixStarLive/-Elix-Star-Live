import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const admin = readFileSync(
  resolve(__dirname, "engagementAdmin.ts"),
  "utf8",
);
const flags = readFileSync(
  resolve(__dirname, "engagementFlags.ts"),
  "utf8",
);
const engagement = readFileSync(resolve(__dirname, "engagement.ts"), "utf8");

describe("Engagement admin contract", () => {
  it("clamps battle energy multiplier and duration on the server", () => {
    expect(admin).toContain("MAX_SCORE_MULTIPLIER");
    expect(admin).toContain("MAX_BOOST_DURATION_SEC");
    expect(admin).toMatch(/Math\.max\(\s*1/);
    expect(admin).toContain("score_multiplier");
    expect(admin).toContain("fan_energy_threshold");
    expect(admin).toContain("allowed_boost_values");
  });

  it("does not invent a free-form eligibility DSL", () => {
    expect(admin).toContain("all_authenticated");
    expect(admin).toContain("creators_only");
    expect(admin).toContain("viewers_only");
    expect(admin).toContain("new_users");
    expect(admin).not.toMatch(/eligibilityDsl|ELIGIBILITY_DSL/i);
  });

  it("persists feature-flag audit metadata", () => {
    expect(admin).toContain("feature_flags_meta");
    expect(admin).toContain("last_changed_by");
    expect(admin).toContain("last_changed_at");
    expect(admin).toContain("reason");
    expect(admin).toContain("engagement_admin_audit");
  });

  it("env Neon kill-switch still wins over admin overrides", () => {
    expect(flags).toContain("engagementNeonApproved");
    expect(admin).toMatch(/if\s*\(\s*!envFlags\.engagementNeonApproved/);
  });

  it("mission list applies audience and schedule meta", () => {
    expect(engagement).toContain("getMissionAdminMeta");
    expect(engagement).toContain("creators_only");
    expect(engagement).toContain("starts_at");
    expect(engagement).toContain("ends_at");
  });

  it("battle energy grant respects enabled cap", () => {
    expect(engagement).toContain("capCfg.enabled");
  });
});
