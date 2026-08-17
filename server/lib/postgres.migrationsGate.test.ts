import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { listRepoMigrationFilenames, missingRepoMigrations } from "./postgres";

describe("production migration gate", () => {
  it("lists every SQL file in server/migrations", () => {
    const files = listRepoMigrationFilenames();
    expect(files.length).toBeGreaterThan(50);
    expect(files.every((f) => f.endsWith(".sql"))).toBe(true);
    expect(files).toContain("20260817010000_refund_recoverable_and_google_consume.sql");
  });

  it("refuses a partial schema when any repo migration is missing from the DB", () => {
    const files = listRepoMigrationFilenames();
    const missingLast = missingRepoMigrations(files.slice(0, -1));
    expect(missingLast.length).toBe(1);
    expect(missingLast[0]).toBe(files[files.length - 1]);
    expect(missingRepoMigrations(files)).toEqual([]);
  });

  it("production boot compares repo filenames against applied rows", () => {
    const src = readFileSync(resolve(__dirname, "postgres.ts"), "utf8");
    expect(src).toContain("missingRepoMigrations(applied)");
    expect(src).toContain("MIGRATIONS_REQUIRED");
    expect(src).not.toMatch(/COUNT\(\*\)\s*>=\s*1/);
  });
});
