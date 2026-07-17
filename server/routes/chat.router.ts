import { Router } from "express";
import {
  handleEnsureChatThread, handleListChatThreads, handleGetChatThread,
  handleListChatMessages, handlePostChatMessage,
  handleMarkChatThreadRead, handleDeleteChatThread,
} from "./chat";

const router = Router();
router.post("/threads/ensure", handleEnsureChatThread);
router.get("/threads", handleListChatThreads);
router.get("/threads/:threadId/messages", handleListChatMessages);
router.post("/threads/:threadId/messages", handlePostChatMessage);
router.post("/threads/:threadId/read", handleMarkChatThreadRead);
router.delete("/threads/:threadId", handleDeleteChatThread);
router.get("/threads/:threadId", handleGetChatThread);
export default router;
