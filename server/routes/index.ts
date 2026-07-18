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
import adminActionsRouter from "./adminActions";
import musicRouter from "./music.router";
import storiesRouter from "./stories.router";
import risingStarsRouter from "./risingStars.router";
import adminRisingStarsRouter from "./adminRisingStars.router";
import progressionRouter from "./progression.router";
import adminProgressionRouter from "./adminProgression.router";

export function mountRoutes(app: Express): void {
  app.use("/api/auth", authRouter);
  app.use("/api/live", liveRouter);
  app.use("/api/gifts", giftsRouter);
  app.use("/api/sounds", soundsRouter);
  app.use("/api/music", musicRouter);
  app.use("/api/feed", feedRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/profiles", profilesRouter);
  app.use("/api/wallet", walletRouter);
  app.use("/api/shop", shopRouter);
  app.use("/api/coin-packages", coinPackagesRouter);
  app.use("/api/creator", creatorRouter);
  app.use("/api/admin", adminPayoutRouter);
  app.use("/api/admin", adminActionsRouter);
  app.use("/api/admin/rising-stars", adminRisingStarsRouter);
  app.use("/api/admin/progression", adminProgressionRouter);
  app.use("/api/rising-stars", risingStarsRouter);
  app.use("/api/progression", progressionRouter);
  app.use("/api/videos", videosRouter);
  app.use("/api/stories", storiesRouter);
  app.use("/api/media", mediaRouter);

  // Misc (analytics, block, report, notifications, IAP, refunds, etc.)
  app.use("/api", miscRouter);
}
