import { Router } from "express";
import { handleGetStreams, handleLiveStart, handleLiveEnd, handleGetLiveToken } from "./livestream";

const router = Router();
router.get("/streams", handleGetStreams);
router.post("/start", handleLiveStart);
router.post("/end", handleLiveEnd);
router.get("/token", handleGetLiveToken);
export default router;
