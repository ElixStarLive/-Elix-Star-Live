import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(
  resolve(__dirname, "../../src/components/LiveMarkedTopUi.tsx"),
  "utf8",
);

describe("Live marked UI demo gate", () => {
  it("store builds force demo off; opt-in only via localStorage === 1", () => {
    expect(src).toContain("if (isStoreBuild) return false");
    expect(src).toContain("=== '1'");
    expect(src).not.toContain("if (v === '0') return false");
  });

  it("demo toggle is hidden on store builds", () => {
    expect(src).toContain("if (storeBuild) return null");
  });
});
