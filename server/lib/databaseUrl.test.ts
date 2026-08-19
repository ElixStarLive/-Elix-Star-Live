import { describe, expect, it } from "vitest";
import { directDatabaseUrl, normalizeDatabaseUrl } from "./databaseUrl";

describe("normalizeDatabaseUrl", () => {
  it("pins Neon connections to verify-full", () => {
    const out = normalizeDatabaseUrl(
      "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/elix_test?sslmode=require",
    );
    expect(out).toContain("sslmode=verify-full");
  });

  it("leaves an empty value alone", () => {
    expect(normalizeDatabaseUrl("   ")).toBe("");
  });
});

/**
 * Migrations take a *session* advisory lock. Neon's pooler is pgbouncer in
 * transaction pooling mode, so that lock lands on a backend pgbouncer hands to
 * the next client: mutual exclusion is not in force, the unlock releases nothing,
 * and the key stays granted to an idle backend, blocking every later migration
 * run — including the deploy's release command — forever.
 */
describe("directDatabaseUrl", () => {
  it("drops the -pooler label from a Neon host", () => {
    expect(
      directDatabaseUrl(
        "postgresql://u:p@ep-cool-name-123-pooler.eu-central-1.aws.neon.tech/elix?sslmode=verify-full",
      ),
    ).toBe(
      "postgresql://u:p@ep-cool-name-123.eu-central-1.aws.neon.tech/elix?sslmode=verify-full",
    );
  });

  it("keeps the database name, credentials and query string", () => {
    const out = new URL(
      directDatabaseUrl(
        "postgresql://user:secret@ep-a-b-pooler.us-east-2.aws.neon.tech/elix_money_it?sslmode=verify-full&application_name=migrate",
      ),
    );
    expect(out.pathname).toBe("/elix_money_it");
    expect(out.username).toBe("user");
    expect(out.searchParams.get("application_name")).toBe("migrate");
  });

  it("leaves an already-direct Neon host unchanged", () => {
    const url = "postgresql://u:p@ep-a-b.eu-central-1.aws.neon.tech/elix";
    expect(directDatabaseUrl(url)).toBe(url);
  });

  it("does not touch non-Neon hosts, even if 'pooler' appears in them", () => {
    const url = "postgresql://u:p@db-pooler.internal:5432/elix";
    expect(directDatabaseUrl(url)).toBe(url);
  });

  it("does not rewrite a host that merely contains 'pooler' mid-label", () => {
    const url = "postgresql://u:p@ep-pooler-x.eu-central-1.aws.neon.tech/elix";
    expect(directDatabaseUrl(url)).toBe(url);
  });

  it("returns empty and unparseable input unchanged", () => {
    expect(directDatabaseUrl("  ")).toBe("");
    expect(directDatabaseUrl("not-a-url")).toBe("not-a-url");
  });
});
