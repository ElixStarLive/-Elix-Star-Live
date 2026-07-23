/**
 * Contract: FIREBASE_SERVICE_ACCOUNT_JSON must be Admin SDK service-account shape.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
});
