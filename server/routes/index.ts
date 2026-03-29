import { Express } from "express";
import authRouter from "./auth.router";
import liveRouter from "./live.router";
import giftsRouter, { soundsRouter } from "./gifts.router";
import feedRouter from "./feed.router";
import chatRouter from "./chat.router";
import profilesRouter from "./profiles.router";
import walletRouter from "./wallet.router";
import shopRouter, { coinPackagesRouter } from "./shop.router";
import { creatorRouter, adminPayoutRouter } from "./payout.router";
import videosRouter from "./videos.router";
import mediaRouter from "./media.router";
import miscRouter from "./misc.router";

export function mountRoutes(app: Express): void {
  app.use("/api/auth", authRouter);
  app.use("/api/live", liveRouter);
  app.use("/api/gifts", giftsRouter);
  app.use("/api/sounds", soundsRouter);
  app.use("/api/feed", feedRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/profiles", profilesRouter);
  app.use("/api/wallet", walletRouter);
  app.use("/api/shop", shopRouter);
  app.use("/api/coin-packages", coinPackagesRouter);
  app.use("/api/creator", creatorRouter);
  app.use("/api/admin", adminPayoutRouter);
  app.use("/api/videos", videosRouter);
  app.use("/api/media", mediaRouter);

  if (process.env.NODE_ENV !== "production") {
    import("./testCoins").then(({ handleGetTestCoinBalance, handleMintTestCoins, handleSpendTestCoinsForScore }) => {
      app.get("/api/test-coins/balance", handleGetTestCoinBalance);
      app.post("/api/test-coins/mint", handleMintTestCoins);
      app.post("/api/test-coins/score", handleSpendTestCoinsForScore);
    });
  }

  // Misc (analytics, block, report, notifications, IAP, refunds, etc.)
  app.use("/api", miscRouter);
}
