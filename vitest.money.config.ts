import { defineConfig } from "vitest/config";

/** Isolated config so money IT is never silently excluded by the default suite. */
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "server/lib/moneyIntegration.test.ts",
      "server/lib/monetisation/monetisation.db.test.ts",
      "server/lib/monetisation/paidGift.db.test.ts",
      "server/lib/monetisation/appleIapPaidLot.db.test.ts",
      "server/lib/monetisation/googleIapPaidLot.db.test.ts",
      "server/lib/monetisation/monetisationMatrix.db.test.ts",
      "server/lib/monetisation/creatorPayout.db.test.ts",
      "server/lib/feed/foryou.db.test.ts",
      "server/websocket/battleResults.db.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
