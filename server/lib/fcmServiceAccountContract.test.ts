/**
 * Contract: FIREBASE_SERVICE_ACCOUNT_JSON must be Admin SDK service-account shape.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const errors: { ctx: unknown; msg: string }[] = [];
vi.mock("./logger", () => ({
  logger: {
    error: (ctx: unknown, msg?: string) => {
      errors.push({ ctx, msg: msg ?? String(ctx) });
    },
    warn: () => {},
    info: () => {},
    fatal: () => {},
    debug: () => {},
  },
}));

import { checkFcmProjectAlignment } from "./push";

describe("FCM service account config contract", () => {
  const push = readFileSync(resolve(__dirname, "./push.ts"), "utf8");
  const helper = readFileSync(resolve(__dirname, "./serviceAccountEnv.ts"), "utf8");

  it("loads Firebase creds via Coolify-safe serviceAccountEnv helper", () => {
    expect(push).toContain("loadServiceAccountFromEnv");
    expect(push).toContain("FIREBASE_SERVICE_ACCOUNT_BASE64");
    expect(helper).toContain("tryBase64Json");
    expect(helper).toContain("client_email");
    expect(helper).toContain("private_key");
  });

  describe("project alignment", () => {
    afterEach(() => {
      errors.length = 0;
      vi.unstubAllEnvs();
    });

    const serviceAccount = (projectId: string) =>
      JSON.stringify({
        type: "service_account",
        project_id: projectId,
        client_email: `sa@${projectId}.iam.gserviceaccount.com`,
        private_key: "-----BEGIN PRIVATE KEY-----\nnot-parsed-here\n-----END PRIVATE KEY-----\n",
      });

    /**
     * The real defect this guards: the Android app is registered in one Firebase
     * project (so device tokens belong to it) while the service account key was
     * generated in another. `sendFcm` posts to FIREBASE_PROJECT_ID with a token
     * minted for the credential's project, FCM answers 403 for every device, and
     * the only symptom is `sent: 0`.
     */
    it("reports a credential generated in a different Firebase project", () => {
      vi.stubEnv("FIREBASE_PROJECT_ID", "elix-star-live-d99ee");
      vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", serviceAccount("elix-star-live-86271"));

      checkFcmProjectAlignment();

      expect(errors).toHaveLength(1);
      expect(errors[0].msg).toContain("different projects");
      expect(errors[0].ctx).toMatchObject({
        configuredProject: "elix-star-live-d99ee",
        serviceAccountProject: "elix-star-live-86271",
      });
    });

    it("stays silent when the credential belongs to the configured project", () => {
      vi.stubEnv("FIREBASE_PROJECT_ID", "elix-star-live-d99ee");
      vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", serviceAccount("elix-star-live-d99ee"));

      checkFcmProjectAlignment();

      expect(errors).toHaveLength(0);
    });

    it("stays silent with no FIREBASE_PROJECT_ID override to disagree with", () => {
      vi.stubEnv("FIREBASE_PROJECT_ID", "");
      vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", serviceAccount("elix-star-live-86271"));

      checkFcmProjectAlignment();

      expect(errors).toHaveLength(0);
    });

    it("stays silent when push is not configured at all", () => {
      vi.stubEnv("FIREBASE_PROJECT_ID", "elix-star-live-d99ee");
      vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "");
      vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_BASE64", "");

      checkFcmProjectAlignment();

      expect(errors).toHaveLength(0);
    });
  });
});
