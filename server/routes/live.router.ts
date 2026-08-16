import { Router } from "express";
import { handleGetStreams, handleLiveStart, handleLiveEnd, handleGetLiveStatus, handleGetLiveToken } from "./livestream";
import {
  handleListLiveModerators,
  handleAddLiveModerator,
  handleRemoveLiveModerator,
} from "./liveModerators";
import { validateBody } from "../middleware/validate";
import { liveStartSchema, liveEndSchema } from "../validation/schemas";

const router = Router();
router.get("/streams", handleGetStreams);
router.post("/start", validateBody(liveStartSchema), handleLiveStart);
router.post("/end", validateBody(liveEndSchema), handleLiveEnd);
router.get("/status", handleGetLiveStatus);
router.get("/token", handleGetLiveToken);
router.get("/:streamKey/moderators", handleListLiveModerators);
router.post("/:streamKey/moderators", handleAddLiveModerator);
router.delete("/:streamKey/moderators/:userId", handleRemoveLiveModerator);
export default router;
