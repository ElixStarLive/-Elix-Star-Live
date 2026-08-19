import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The App Store Server API answers 401 — not 404 — when the credentials are not
 * accepted by the host being asked, which is what production returns while an
 * app is not yet live. `appleApiGet` stopped on any status other than 404, so
 * the second environment was never tried and a working key was reported to a
 * paying iOS customer as "Apple verification is temporarily unavailable".
 */

const PRODUCTION_HOST = "api.storekit.itunes.apple.com";
const SANDBOX_HOST = "api.storekit-sandbox.itunes.apple.com";

const originalFetch = globalThis.fetch;
const originalEnv = {
  issuer: process.env.APPLE_ISSUER_ID,
  keyId: process.env.APPLE_KEY_ID,
  privateKey: process.env.APPLE_PRIVATE_KEY,
  environment: process.env.APPLE_IAP_ENVIRONMENT,
};

// A throwaway ES256 key generated for this test only. It never signs anything
// Apple sees: fetch is stubbed, so this only has to satisfy jose's PKCS8 parse.
const TEST_P8 = [
  "-----BEGIN PRIVATE KEY-----",
  "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgevZzL1gdAFr88hb2",
  "OF/2NxApJCzGCEDdfSp6VQO30hyhRANCAAQRWz+jn65BtOMvdyHKcvjBeBSDZH2r",
  "1RTwjmYSi9R/zpBnuQ4EiMnCqfMPWiZqB4QdbAd0E7oH50VpuZ1P087G",
  "-----END PRIVATE KEY-----",
].join("\n");

function stubFetch(byHost: Record<string, { status: number; body?: unknown }>) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const host = Object.keys(byHost).find((h) => url.includes(h));
    const answer = host ? byHost[host] : { status: 500 };
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      text: async () => (answer.body === undefined ? "" : JSON.stringify(answer.body)),
    } as Response;
  }) as typeof globalThis.fetch;
  return calls;
}

beforeEach(() => {
  vi.resetModules();
  process.env.APPLE_ISSUER_ID = "11111111-2222-3333-4444-555555555555";
  process.env.APPLE_KEY_ID = "TESTKEYID1";
  process.env.APPLE_PRIVATE_KEY = TEST_P8;
  process.env.APPLE_IAP_ENVIRONMENT = "Production";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.APPLE_ISSUER_ID = originalEnv.issuer;
  process.env.APPLE_KEY_ID = originalEnv.keyId;
  process.env.APPLE_PRIVATE_KEY = originalEnv.privateKey;
  process.env.APPLE_IAP_ENVIRONMENT = originalEnv.environment;
  vi.resetModules();
});

describe("Apple App Store Server API environment retry", () => {
  it("tries the other environment after a 401 instead of reporting an outage", async () => {
    const calls = stubFetch({
      [PRODUCTION_HOST]: { status: 401 },
      // Reached only if the 401 did not end the loop. An empty 200 still fails
      // later on the missing JWS, which is enough to prove the host was asked.
      [SANDBOX_HOST]: { status: 200, body: {} },
    });

    const { fetchAppleTransaction } = await import("./appleIap");
    const result = await fetchAppleTransaction("2000000000000000");

    expect(calls.some((u) => u.includes(PRODUCTION_HOST))).toBe(true);
    expect(calls.some((u) => u.includes(SANDBOX_HOST))).toBe(true);
    // Apple answered, so this is the transaction's problem, not our outage.
    expect(result.valid).toBe(false);
    if (result.valid === false) expect(result.reason).toBe("invalid");
  });

  it("still reports a genuine outage when both environments are unusable", async () => {
    stubFetch({
      [PRODUCTION_HOST]: { status: 500 },
      [SANDBOX_HOST]: { status: 500 },
    });

    const { fetchAppleTransaction } = await import("./appleIap");
    const result = await fetchAppleTransaction("2000000000000000");

    expect(result.valid).toBe(false);
    if (result.valid === false) expect(result.reason).toBe("unavailable");
  });

  it("does not ask the second host once Apple has given a verdict", async () => {
    const calls = stubFetch({
      [PRODUCTION_HOST]: { status: 400 },
      [SANDBOX_HOST]: { status: 200, body: {} },
    });

    const { fetchAppleTransaction } = await import("./appleIap");
    await fetchAppleTransaction("2000000000000000");

    expect(calls.filter((u) => u.includes(SANDBOX_HOST))).toHaveLength(0);
  });
});
