import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), "utf8");

describe("Blocked-item NEW contracts (mount-only)", () => {
  it("GET /api/feed/following is mounted and separate from friends", () => {
    const feed = read("../routes/feed.ts");
    const router = read("../routes/feed.router.ts");
    expect(router).toContain('"/following"');
    expect(router).toContain("handleFollowingFeed");
    expect(router).toContain('"/friends"');
    expect(feed).toContain("export async function handleFollowingFeed");
    expect(feed).toContain("getFollowingIdsAsync");
    // Following feed must not union followers
    const start = feed.indexOf("export async function handleFollowingFeed");
    const end = feed.indexOf("export function invalidateFeedCache", start);
    const body = feed.slice(start, end);
    expect(body).not.toContain("getFollowerIdsAsync");
  });

  it("following profiles extend GET following without dropping id list", () => {
    const profiles = read("../routes/profiles.ts");
    expect(profiles).toContain("following_profiles");
    expect(profiles).toContain("following: followingIds");
  });

  it("live moderators REST + migration exist", () => {
    const router = read("../routes/live.router.ts");
    const mig = read("../migrations/20260810180000_live_stream_moderators.sql");
    expect(router).toContain("/:streamKey/moderators");
    expect(router).toContain("handleAddLiveModerator");
    expect(router).toContain("handleRemoveLiveModerator");
    expect(mig).toContain("live_stream_moderators");
    expect(mig).toContain("PRIMARY KEY (stream_key, user_id)");
  });

  it("consent POST + migration exist", () => {
    const router = read("../routes/auth.router.ts");
    const mig = read("../migrations/20260810180100_user_consents.sql");
    expect(router).toContain('"/consent"');
    expect(router).toContain("handlePostConsent");
    expect(mig).toContain("user_consents");
  });

  it("2FA routes + migration exist", () => {
    const router = read("../routes/auth.router.ts");
    const mig = read("../migrations/20260810180200_user_two_factor.sql");
    expect(router).toContain('"/2fa/status"');
    expect(router).toContain('"/2fa/enroll"');
    expect(router).toContain('"/2fa/verify"');
    expect(router).toContain('"/2fa/disable"');
    expect(mig).toContain("user_two_factor");
  });
});
