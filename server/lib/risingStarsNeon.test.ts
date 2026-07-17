import { describe, expect, it } from "vitest";
import { extractVideoMusicTrackId } from "./risingStarsNeon";

describe("extractVideoMusicTrackId", () => {
  it("reads id from object", () => {
    expect(extractVideoMusicTrackId({ id: "track-1" })).toBe("track-1");
  });

  it("reads trackId / track_id / songId aliases", () => {
    expect(extractVideoMusicTrackId({ trackId: "a" })).toBe("a");
    expect(extractVideoMusicTrackId({ track_id: "b" })).toBe("b");
    expect(extractVideoMusicTrackId({ songId: "c" })).toBe("c");
  });

  it("parses JSON string", () => {
    expect(extractVideoMusicTrackId(JSON.stringify({ id: "json-1" }))).toBe("json-1");
  });

  it("returns null for missing or invalid music", () => {
    expect(extractVideoMusicTrackId(null)).toBeNull();
    expect(extractVideoMusicTrackId(undefined)).toBeNull();
    expect(extractVideoMusicTrackId("{}")).toBeNull();
    expect(extractVideoMusicTrackId("not-json")).toBeNull();
    expect(extractVideoMusicTrackId([])).toBeNull();
  });
});

describe("Rising Stars reward separation contract", () => {
  it("does not allow wallet credit reward kinds in allowed set", () => {
    const allowed = new Set([
      "badge",
      "cosmetic",
      "featured",
      "cash_off_platform",
      "creator_credit_manual",
      "none",
    ]);
    expect(allowed.has("credit_wallet_coins")).toBe(false);
    expect(allowed.has("iap")).toBe(false);
    expect(allowed.has("stripe")).toBe(false);
  });
});
