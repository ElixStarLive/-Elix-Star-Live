/**
 * Contract: FIREBASE_SERVICE_ACCOUNT_JSON must be Admin SDK service-account shape.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("FCM service account config contract", () => {
  const push = readFileSync(resolve(__dirname, "./push.ts"), "utf8");

  it("rejects google-services.json-shaped env and requires client_email + private_key", () => {
    expect(push).toContain("looksLikeGoogleServicesJson");
    expect(push).toContain("client_email");
    expect(push).toContain("private_key");
    expect(push).toContain("FCM disabled");
  });
});
