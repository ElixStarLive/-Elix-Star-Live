/**
 * Unit tests for shared sound-reuse eligibility.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
vi.mock("./postgres", () => ({
  getPool: () => ({ query }),
}));
vi.mock("./logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { canReuseSound, type SoundRow } from "./soundReuse";

function baseSound(over: Partial<SoundRow> = {}): SoundRow {
  return {
    id: "ugc_1",
    title: "Original sound",
    artist: "creator",
    audio_url: "https://cdn.example/a.mp4",
    duration_ms: 1000,
    allow_reuse: true,
    rights_confirmed: true,
    rights_confirmed_at: new Date(),
    rights_confirmation_version: "1.0",
    rights_confirmed_by_user_id: "u1",
    copyright_status: "ACTIVE",
    reuse_disabled_at: null,
    reuse_disabled_reason: null,
    removed_at: null,
    removed_reason: null,
    original_uploader_id: "u1",
    source_video_id: "v1",
    ...over,
  };
}

describe("canReuseSound", () => {
  beforeEach(() => {
    query.mockReset();
    process.env.SOUND_REUSE_RIGHTS_FLOW = "true";
  });

  it("returns false when allow_reuse is off", async () => {
    expect(await canReuseSound(baseSound({ allow_reuse: false }), "u2")).toBe(false);
  });

  it("returns false when rights not confirmed", async () => {
    expect(await canReuseSound(baseSound({ rights_confirmed: false }), "u2")).toBe(false);
  });

  it("returns false when under review / removed", async () => {
    expect(
      await canReuseSound(baseSound({ copyright_status: "UNDER_REVIEW" }), "u2"),
    ).toBe(false);
    expect(await canReuseSound(baseSound({ removed_at: new Date() }), "u2")).toBe(false);
  });

  it("returns true when all conditions pass and uploader active", async () => {
    query.mockResolvedValue({ rows: [{ banned_until: null, copyright_reuse_suspended_until: null }] });
    // uploader check + requester check + block check
    query
      .mockResolvedValueOnce({ rows: [{ banned_until: null }] })
      .mockResolvedValueOnce({ rows: [{ banned_until: null }] })
      .mockResolvedValueOnce({ rows: [] });
    expect(await canReuseSound(baseSound(), "u2")).toBe(true);
  });

  it("returns false when uploader banned", async () => {
    query.mockResolvedValueOnce({
      rows: [{ banned_until: new Date(Date.now() + 86400000) }],
    });
    expect(await canReuseSound(baseSound(), "u2")).toBe(false);
  });
});
