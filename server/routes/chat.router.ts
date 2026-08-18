import { Router } from "express";
import {
  handleEnsureChatThread, handleListChatThreads, handleGetChatThread,
  handleListChatMessages, handlePostChatMessage,
  handleMarkChatThreadRead, handleDeleteChatThread,
} from "./chat";
import { chatSendLimiter } from "../middleware/rateLimit";

const router = Router();
router.post("/threads/ensure", chatSendLimiter, handleEnsureChatThread);
router.get("/threads", handleListChatThreads);
router.get("/threads/:threadId/messages", handleListChatMessages);
router.post("/threads/:threadId/messages", chatSendLimiter, handlePostChatMessage);
router.post("/threads/:threadId/read", handleMarkChatThreadRead);
router.delete("/threads/:threadId", handleDeleteChatThread);
router.get("/threads/:threadId", handleGetChatThread);
export default router;
