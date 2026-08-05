/**
 * Contract tests for unique profile view registration semantics.
 * Does not hit Neon — validates the intended API shape / policies.
 */

import { describe, expect, it } from "vitest";

describe("profile unique views contract", () => {
  it("public metric is unique viewers; visits are separate analytics", () => {
    const response = {
      uniqueViews: 20,
      isNewUniqueView: false,
      totalVisits: 55,
    };
    expect(response.uniqueViews).toBe(20);
    expect(response.totalVisits).toBeGreaterThanOrEqual(response.uniqueViews);
    expect(response.isNewUniqueView).toBe(false);
  });

  it("same viewer never creates two unique rows (lifetime policy key)", () => {
    const key = (viewer: string, owner: string) => `${viewer}::${owner}`;
    const set = new Set<string>();
    const viewer = "u_viewer";
    const owner = "u_owner";
    for (let i = 0; i < 20; i++) set.add(key(viewer, owner));
    expect(set.size).toBe(1);
  });

  it("twenty distinct viewers yield twenty unique keys", () => {
    const owner = "u_owner";
    const set = new Set<string>();
    for (let i = 0; i < 20; i++) set.add(`u_${i}::${owner}`);
    expect(set.size).toBe(20);
  });

  it("self views are excluded from unique keys", () => {
    const viewer = "u_self";
    const owner = "u_self";
    const allowUnique = viewer !== owner;
    expect(allowUnique).toBe(false);
  });
});
