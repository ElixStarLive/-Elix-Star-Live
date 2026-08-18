import { Router } from "express";
import { handleForYouFeed, handleFriendsFeed, handleFollowingFeed, handleTrackView, handleTrackInteraction } from "./feed";
import { validateBody } from "../middleware/validate";
import { trackViewSchema, trackInteractionSchema } from "../validation/schemas";
import { analyticsPostLimiter } from "../middleware/rateLimit";

const router = Router();
router.get("/foryou", handleForYouFeed);
router.get("/friends", handleFriendsFeed);
router.get("/following", handleFollowingFeed);
router.post(
  "/track-view",
  analyticsPostLimiter,
  validateBody(trackViewSchema),
  handleTrackView,
);
router.post(
  "/track-interaction",
  analyticsPostLimiter,
  validateBody(trackInteractionSchema),
  handleTrackInteraction,
);
export default router;
