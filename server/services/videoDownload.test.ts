import { describe, expect, it } from "vitest";
import { assertSafeMediaFetchUrl, isSafeMediaUrl } from "./videoDownload";

describe("assertSafeMediaFetchUrl", () => {
  it("allows https Bunny CDN hosts", () => {
    const u = assertSafeMediaFetchUrl("https://elixstorage.b-cdn.net/videos/u1/a.mp4");
    expect(u.hostname).toBe("elixstorage.b-cdn.net");
  });

  it("rejects http, localhost, metadata, and arbitrary hosts", () => {
    expect(isSafeMediaUrl("http://elixstorage.b-cdn.net/a.mp4")).toBe(false);
    expect(isSafeMediaUrl("https://127.0.0.1/secret")).toBe(false);
    expect(isSafeMediaUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isSafeMediaUrl("https://evil.example.com/a.mp4")).toBe(false);
    expect(isSafeMediaUrl("https://localhost/a.mp4")).toBe(false);
  });
});
