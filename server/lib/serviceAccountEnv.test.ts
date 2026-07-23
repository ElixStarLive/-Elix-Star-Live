import { describe, expect, it } from "vitest";
import {
  loadServiceAccountFromEnv,
} from "./serviceAccountEnv";

describe("serviceAccountEnv Coolify-safe parsing", () => {
  it("parses compact JSON", () => {
    process.env.TEST_SA_JSON = JSON.stringify({
      type: "service_account",
      project_id: "demo",
      client_email: "a@demo.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n",
    });
    delete process.env.TEST_SA_B64;
    const creds = loadServiceAccountFromEnv("TEST_SA_JSON", "TEST_SA_B64");
    expect(creds?.client_email).toContain("@demo.");
    expect(creds?.private_key).toContain("BEGIN PRIVATE KEY");
  });

  it("parses multiline JSON (Coolify real multiline env)", () => {
    process.env.TEST_SA_JSON = `{
  "type": "service_account",
  "project_id": "demo",
  "client_email": "a@demo.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n"
}`;
    delete process.env.TEST_SA_B64;
    const creds = loadServiceAccountFromEnv("TEST_SA_JSON", "TEST_SA_B64");
    expect(creds?.project_id).toBe("demo");
  });

  it("parses base64 companion env", () => {
    const json = JSON.stringify({
      type: "service_account",
      project_id: "demo",
      client_email: "a@demo.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n",
    });
    delete process.env.TEST_SA_JSON;
    process.env.TEST_SA_B64 = Buffer.from(json, "utf8").toString("base64");
    const creds = loadServiceAccountFromEnv("TEST_SA_JSON", "TEST_SA_B64");
    expect(creds?.client_email).toBe("a@demo.iam.gserviceaccount.com");
  });

  it("rejects google-services.json shape", () => {
    process.env.TEST_SA_JSON = JSON.stringify({
      project_info: { project_id: "x" },
      client: [],
    });
    delete process.env.TEST_SA_B64;
    expect(loadServiceAccountFromEnv("TEST_SA_JSON", "TEST_SA_B64")).toBeNull();
  });
});
