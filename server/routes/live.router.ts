import { Router } from "express";
import { handleGetStreams, handleLiveStart, handleLiveEnd, handleGetLiveToken } from "./livestream";
import { validateBody } from "../middleware/validate";
import { liveStartSchema, liveEndSchema } from "../validation/schemas";

const router = Router();
router.get("/streams", handleGetStreams);
router.post("/start", validateBody(liveStartSchema), handleLiveStart);
router.post("/end", validateBody(liveEndSchema), handleLiveEnd);
router.get("/token", handleGetLiveToken);
export default router;
