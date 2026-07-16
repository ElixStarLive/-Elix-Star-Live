import { describe, expect, it } from "vitest";
import { reportSchema } from "./schemas";

describe("reportSchema", () => {
  it("accepts a reason with empty details string", () => {
    const parsed = reportSchema.safeParse({ reason: "spam", details: "" });
    expect(parsed.success).toBe(true);
  });

  it("rejects null details (the Report page bug)", () => {
    const parsed = reportSchema.safeParse({ reason: "spam", details: null });
    expect(parsed.success).toBe(false);
  });
});
