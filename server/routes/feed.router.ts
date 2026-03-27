import { Router } from "express";
import { handleForYouFeed, handleFriendsFeed, handleTrackView, handleTrackInteraction, handleGetVideoScore } from "./feed";

const router = Router();
router.get("/foryou", handleForYouFeed);
router.get("/friends", handleFriendsFeed);
router.post("/track-view", handleTrackView);
router.post("/track-interaction", handleTrackInteraction);
router.get("/score/:videoId", handleGetVideoScore);
export default router;
