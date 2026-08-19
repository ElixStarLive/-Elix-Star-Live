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
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "sa@elix.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----\n",
    }),
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
    CLIENT_URL: "https://www.elixstarlive.co.uk",
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

  /**
   * A service account that is present but unreadable verified no Android purchase
   * at all, and said nothing at boot — the money is taken and the entitlement
   * never lands.
   */
  describe("Google service account credibility", () => {
    it("production refuses to start when the service account is not valid JSON", () => {
      const failures = collectProductionEnvironmentFailures(
        prodEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email": "sa@x.com"' }),
      );
      expect(failures.some((m) => m.includes("not valid JSON"))).toBe(true);
    });

    it("production refuses to start when the service account has no signing key", () => {
      const failures = collectProductionEnvironmentFailures(
        prodEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "sa@x.com" }) }),
      );
      expect(failures.some((m) => m.includes("missing private_key"))).toBe(true);
    });

    it("production refuses to start when the service account has no client email", () => {
      const failures = collectProductionEnvironmentFailures(
        prodEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ private_key: "pem" }) }),
      );
      expect(failures.some((m) => m.includes("missing client_email"))).toBe(true);
    });
  });

  /**
   * Stripe shop checkout refuses to build return URLs from anything that is not
   * a public https origin. That check lived only in the request handler, so a
   * missing or local CLIENT_URL started cleanly and surfaced as a 500 at the
   * first attempt to buy something.
   */
  describe("shop checkout return origin", () => {
    it("production refuses to start with no CLIENT_URL", () => {
      const failures = collectProductionEnvironmentFailures(
        prodEnv({ PEX_API_KEY: "pex-live-key", CLIENT_URL: "" }),
      );
      expect(failures.some((m) => m.includes("CLIENT_URL is required"))).toBe(true);
    });

    it("production refuses to start when CLIENT_URL is local", () => {
      const failures = collectProductionEnvironmentFailures(
        prodEnv({ PEX_API_KEY: "pex-live-key", CLIENT_URL: "http://localhost:5173" }),
      );
      expect(failures.some((m) => m.includes("CLIENT_URL must be a public https"))).toBe(true);
    });

    it("production refuses to start when CLIENT_URL is not https", () => {
      const failures = collectProductionEnvironmentFailures(
        prodEnv({ PEX_API_KEY: "pex-live-key", CLIENT_URL: "http://www.elixstarlive.co.uk" }),
      );
      expect(failures.some((m) => m.includes("CLIENT_URL must be a public https"))).toBe(true);
    });
  });

  /**
   * This flag used to force NODE_ENV=development, which turned off this entire
   * boot gate, the Valkey requirement, shared rate limiting and the CORS
   * allowlist from one environment variable.
   */
  describe("local Valkey opt-out is development only", () => {
    it("production refuses to start when ELIX_LOCAL_NO_VALKEY is set", () => {
      const failures = collectProductionEnvironmentFailures(
        prodEnv({ PEX_API_KEY: "pex-live-key", ELIX_LOCAL_NO_VALKEY: "1" }),
      );
      expect(failures.some((m) => m.includes("ELIX_LOCAL_NO_VALKEY"))).toBe(true);
    });

    it("config never rewrites NODE_ENV to escape the production gate", () => {
      const configSrc = readFileSync(resolve(__dirname, "..", "config.ts"), "utf8");
      expect(configSrc).not.toMatch(/process\.env\.NODE_ENV\s*=\s*['"]development['"]/);
    });
  });
});
