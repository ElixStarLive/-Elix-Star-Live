import { Router } from "express";
import { handleForYouFeed, handleFriendsFeed, handleTrackView, handleTrackInteraction, handleGetVideoScore } from "./feed";
import { validateBody } from "../middleware/validate";
import { trackViewSchema, trackInteractionSchema } from "../validation/schemas";
import { analyticsPostLimiter } from "../middleware/rateLimit";

const router = Router();
router.get("/foryou", handleForYouFeed);
router.get("/friends", handleFriendsFeed);
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
router.get("/score/:videoId", handleGetVideoScore);
export default router;
