import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  collectProductionEnvironmentFailures,
  collectProductionEnvironmentWarnings,
} from "./envValidate";

const envValidateSrc = readFileSync(resolve(__dirname, "envValidate.ts"), "utf8");

function pkcs8(type: "ec" | "rsa"): string {
  const { privateKey } =
    type === "ec"
      ? generateKeyPairSync("ec", { namedCurve: "P-256" })
      : generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

/** What App Store Connect issues: an ES256 key, so an EC PKCS8 PEM. */
const APPLE_ES256_PKCS8 = pkcs8("ec");
/** What a Google service account carries in `private_key`: an RSA PKCS8 PEM. */
const GOOGLE_RSA_PKCS8 = pkcs8("rsa");

function prodEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://x",
    JWT_SECRET: "x".repeat(32),
    VALKEY_URL: "redis://valkey",
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "sa@elix.iam.gserviceaccount.com",
      private_key: GOOGLE_RSA_PKCS8,
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
    APPLE_PRIVATE_KEY: APPLE_ES256_PKCS8,
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

    it("production refuses to start when the signing key is present but unreadable", () => {
      // Valid JSON with both fields filled in still verified nothing when the key
      // itself was a truncated paste.
      const failures = collectProductionEnvironmentFailures(
        prodEnv({
          PEX_API_KEY: "pex-live-key",
          GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
            client_email: "sa@elix.iam.gserviceaccount.com",
            private_key: "-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----\n",
          }),
        }),
      );
      expect(failures.some((m) => m.includes("private_key is not a readable private key"))).toBe(
        true,
      );
    });
  });

  /**
   * `appleIap.ts` needs `jose.importPKCS8(key, "ES256")` to succeed. Anything it
   * cannot import makes every iOS purchase verification report "unavailable"
   * while the charge stands, so the paste is proven at boot instead of at the
   * first purchase.
   */
  describe("Apple signing key credibility", () => {
    it("accepts the ES256 PKCS8 key App Store Connect issues", () => {
      const warnings = collectProductionEnvironmentWarnings(
        prodEnv({ PEX_API_KEY: "pex-live-key" }),
      );
      expect(warnings).toHaveLength(0);
    });

    it("accepts the same key pasted with escaped newlines", () => {
      // The consumer normalises through the same helper before importing, so boot
      // must judge the value the same way or it would reject a key that works.
      const warnings = collectProductionEnvironmentWarnings(
        prodEnv({
          PEX_API_KEY: "pex-live-key",
          APPLE_PRIVATE_KEY: APPLE_ES256_PKCS8.replace(/\n/g, "\\n"),
        }),
      );
      expect(warnings).toHaveLength(0);
    });

    /**
     * The shape a Coolify paste actually delivered in production: the PEM's line
     * breaks were deleted, not escaped, so the value still opens with
     * -----BEGIN PRIVATE KEY----- and every presence check passed while jose
     * could never import it. The signer and this gate share one normaliser, so
     * repairing the wrapping here means the key really does sign.
     */
    it("accepts a key whose newlines the env UI stripped", () => {
      const warnings = collectProductionEnvironmentWarnings(
        prodEnv({
          PEX_API_KEY: "pex-live-key",
          APPLE_PRIVATE_KEY: APPLE_ES256_PKCS8.replace(/\n/g, ""),
        }),
      );
      expect(warnings).toHaveLength(0);
    });

    it("accepts the whole PEM handed over as base64 without warning", () => {
      const warnings = collectProductionEnvironmentWarnings(
        prodEnv({
          PEX_API_KEY: "pex-live-key",
          APPLE_PRIVATE_KEY: Buffer.from(APPLE_ES256_PKCS8, "utf8").toString("base64"),
        }),
      );
      expect(warnings).toHaveLength(0);
    });

    /**
     * An unusable Apple key must not take the platform down with it. iOS purchase
     * verification fails closed on its own path — it reports "unavailable", which
     * grants no coins — so nothing settles on an unverified receipt, while live
     * streaming, gifts and the web app keep serving. Reported every boot instead.
     */
    it("reports, but does not refuse to start on, a truncated key", () => {
      const stripped = APPLE_ES256_PKCS8.replace(/\n/g, "");
      const env = prodEnv({
        PEX_API_KEY: "pex-live-key",
        APPLE_PRIVATE_KEY: `${stripped.slice(0, 70)}-----END PRIVATE KEY-----`,
      });

      expect(collectProductionEnvironmentFailures(env)).toHaveLength(0);
      expect(
        collectProductionEnvironmentWarnings(env).some((m) =>
          m.includes("not a readable private key"),
        ),
      ).toBe(true);
    });

    /** The shape must name the damage, without leaking any key material. */
    it("reports the non-secret shape of a rejected key", () => {
      const env = prodEnv({
        PEX_API_KEY: "pex-live-key",
        APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
      });

      const [warning] = collectProductionEnvironmentWarnings(env);
      expect(warning).toContain("bodyChars=0");
      expect(warning).toContain("footer=false");
      expect(warning).toContain("rawChars=27");
    });

    it("reports a placeholder that is not a PEM at all", () => {
      const env = prodEnv({
        PEX_API_KEY: "pex-live-key",
        APPLE_PRIVATE_KEY: "your_apple_private_key",
      });

      expect(collectProductionEnvironmentFailures(env)).toHaveLength(0);
      expect(
        collectProductionEnvironmentWarnings(env).some((m) => m.includes("must be the PKCS8 PEM")),
      ).toBe(true);
    });

    it("reports an RSA key where App Store Connect issues ES256", () => {
      const env = prodEnv({ PEX_API_KEY: "pex-live-key", APPLE_PRIVATE_KEY: GOOGLE_RSA_PKCS8 });

      expect(
        collectProductionEnvironmentWarnings(env).some((m) =>
          m.includes("must be the EC (ES256) key"),
        ),
      ).toBe(true);
    });

    /** Absent credentials stay fatal: that contract predates the warning split. */
    it("still refuses to start when the key is missing entirely", () => {
      const failures = collectProductionEnvironmentFailures(
        prodEnv({ PEX_API_KEY: "pex-live-key", APPLE_PRIVATE_KEY: "" }),
      );
      expect(failures.some((m) => m.includes("APPLE_PRIVATE_KEY are required"))).toBe(true);
    });

    it("a usable key produces no warning", () => {
      expect(
        collectProductionEnvironmentWarnings(prodEnv({ PEX_API_KEY: "pex-live-key" })),
      ).toHaveLength(0);
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
