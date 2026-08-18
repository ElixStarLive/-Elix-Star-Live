import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectProductionEnvironmentFailures } from "./envValidate";

const envValidateSrc = readFileSync(resolve(__dirname, "envValidate.ts"), "utf8");

function prodEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://x",
    JWT_SECRET: "x".repeat(32),
    VALKEY_URL: "redis://valkey",
    GOOGLE_SERVICE_ACCOUNT_JSON: "{}",
    STRIPE_SECRET_KEY: "sk_live_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    LIVEKIT_URL: "wss://livekit.example",
    LIVEKIT_API_KEY: "key",
    LIVEKIT_API_SECRET: "secret",
    BUNNY_STORAGE_ZONE: "zone",
    BUNNY_STORAGE_API_KEY: "bunny",
    GOOGLE_PLAY_PACKAGE_NAME: "com.elixstarlive.app",
    APPLE_ISSUER_ID: "issuer",
    APPLE_KEY_ID: "kid",
    APPLE_PRIVATE_KEY: "pem",
    APPLE_BUNDLE_ID: "com.elixstarlive.app",
    APPLE_IAP_NOTIFICATION_SECRET: "assn",
    GOOGLE_RTDN_WEBHOOK_SECRET: "rtdn",
    ...overrides,
  };
}

describe("production environment boot gate", () => {
  it("does not keep Apple IAP as an opt-in workaround", () => {
    expect(envValidateSrc).not.toContain("APPLE_IAP_REQUIRED");
  });

  it("production refuses to start when Apple IAP credentials are missing", () => {
    const failures = collectProductionEnvironmentFailures(
      prodEnv({
        APPLE_ISSUER_ID: "",
        APPLE_KEY_ID: "",
        APPLE_PRIVATE_KEY: "",
        APPLE_BUNDLE_ID: "",
        APPLE_IAP_NOTIFICATION_SECRET: "",
      }),
    );
    expect(failures.some((m) => m.includes("APPLE_ISSUER_ID"))).toBe(true);
    expect(failures.some((m) => m.includes("APPLE_BUNDLE_ID"))).toBe(true);
    expect(failures.some((m) => m.includes("APPLE_IAP_NOTIFICATION_SECRET"))).toBe(true);
  });

  it("production refuses to start when Google RTDN secret is missing", () => {
    const failures = collectProductionEnvironmentFailures(
      prodEnv({ GOOGLE_RTDN_WEBHOOK_SECRET: "" }),
    );
    expect(failures.some((m) => m.includes("GOOGLE_RTDN_WEBHOOK_SECRET"))).toBe(true);
  });

  it("non-production does not fail the boot gate", () => {
    expect(collectProductionEnvironmentFailures({ NODE_ENV: "development" })).toEqual([]);
  });

  /**
   * With no provider key the upload fingerprint scan allows every video without
   * looking at it, so shipping without the key has to be a decision someone
   * typed, not the default nobody notices.
   */
  describe("upload audio fingerprint scan", () => {
    it("production refuses to start with no Pex key and no explicit opt-out", () => {
      const failures = collectProductionEnvironmentFailures(prodEnv());
      expect(failures.some((m) => m.includes("PEX_API_KEY"))).toBe(true);
    });

    it("starts when the key is configured", () => {
      const failures = collectProductionEnvironmentFailures(
        prodEnv({ PEX_API_KEY: "pex-live-key" }),
      );
      expect(failures.some((m) => m.includes("PEX_API_KEY"))).toBe(false);
    });

    it("starts when scanning is explicitly turned off", () => {
      const failures = collectProductionEnvironmentFailures(
        prodEnv({ AUDIO_SCAN_ENABLED: "0" }),
      );
      expect(failures.some((m) => m.includes("PEX_API_KEY"))).toBe(false);
    });

    it("a healthy production environment has nothing left to report", () => {
      expect(
        collectProductionEnvironmentFailures(prodEnv({ PEX_API_KEY: "pex-live-key" })),
      ).toEqual([]);
    });
  });
});
