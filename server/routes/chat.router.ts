import { Router } from "express";
import {
  handleEnsureChatThread, handleListChatThreads, handleGetChatThread,
  handleListChatMessages, handlePostChatMessage,
} from "./chat";

const router = Router();
router.post("/threads/ensure", handleEnsureChatThread);
router.get("/threads", handleListChatThreads);
router.get("/threads/:threadId/messages", handleListChatMessages);
router.post("/threads/:threadId/messages", handlePostChatMessage);
router.get("/threads/:threadId", handleGetChatThread);
export default router;
