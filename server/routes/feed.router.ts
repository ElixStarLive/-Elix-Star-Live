import { Router } from "express";
import { handleForYouFeed, handleFriendsFeed, handleTrackView, handleTrackInteraction, handleGetVideoScore } from "./feed";
import { validateBody } from "../middleware/validate";
import { trackViewSchema, trackInteractionSchema } from "../validation/schemas";

const router = Router();
router.get("/foryou", handleForYouFeed);
router.get("/friends", handleFriendsFeed);
router.post("/track-view", validateBody(trackViewSchema), handleTrackView);
router.post("/track-interaction", validateBody(trackInteractionSchema), handleTrackInteraction);
router.get("/score/:videoId", handleGetVideoScore);
export default router;
