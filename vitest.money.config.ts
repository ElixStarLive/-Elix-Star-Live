import { defineConfig } from "vitest/config";

/** Isolated config so money IT is never silently excluded by the default suite. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["server/lib/moneyIntegration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
