import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import {
  dbAppendChatMessage,
  dbEnsureChatThread,
  dbGetChatThread,
  dbListChatMessages,
  dbListChatThreadsForUser,
  dbUnreadCountForThread,
} from "../lib/postgres";
import { getOrCreateProfile } from "./profiles";

function requireAuth(req: Request, res: Response): { userId: string } | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session." });
    return null;
  }
  return { userId: payload.sub };
}

/** POST /api/chat/threads/ensure { otherUserId } */
export async function handleEnsureChatThread(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = requireAuth(req, res);
  if (!auth) return;
  const otherUserId =
    typeof (req.body as { otherUserId?: string }).otherUserId === "string"
      ? (req.body as { otherUserId: string }).otherUserId.trim()
      : "";
  if (!otherUserId) {
    return res.status(400).json({ error: "otherUserId is required" });
  }
  try {
    const thread = await dbEnsureChatThread(auth.userId, otherUserId);
    if (!thread) return res.status(400).json({ error: "Could not create thread" });
    return res.status(200).json({ threadId: thread.id, thread });
  } catch {
    return res.status(400).json({ error: "Could not create thread" });
  }
}

/** GET /api/chat/threads */
export async function handleListChatThreads(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = requireAuth(req, res);
  if (!auth) return;
  const threads = await dbListChatThreadsForUser(auth.userId, 50);
  const enriched = await Promise.all(threads.map(async (t) => {
    const otherId =
      t.user1_id === auth.userId ? t.user2_id : t.user1_id;
    const p = await getOrCreateProfile(otherId);
    return {
      id: t.id,
      user1_id: t.user1_id,
      user2_id: t.user2_id,
      last_at: t.last_at,
      last_message: t.last_message,
      created_at: t.created_at,
      otherUser: {
        username: p.username,
        display_name: p.displayName,
        avatar_url: p.avatarUrl,
      },
      hasUnread: (await dbUnreadCountForThread(t.id, auth.userId)) > 0,
    };
  }));
  return res.status(200).json({ threads: enriched });
}

/** GET /api/chat/threads/:threadId */
export async function handleGetChatThread(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = requireAuth(req, res);
  if (!auth) return;
  const threadId = req.params.threadId;
  const t = await dbGetChatThread(threadId, auth.userId);
  if (!t) return res.status(404).json({ error: "Not found" });
  const otherId =
    t.user1_id === auth.userId ? t.user2_id : t.user1_id;
  const p = await getOrCreateProfile(otherId);
  return res.status(200).json({
    thread: t,
    otherUser: {
      user_id: otherId,
      username: p.username,
      display_name: p.displayName,
      avatar_url: p.avatarUrl,
      level: p.level,
    },
  });
}

/** GET /api/chat/threads/:threadId/messages */
export async function handleListChatMessages(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = requireAuth(req, res);
  if (!auth) return;
  const threadId = req.params.threadId;
  const messages = await dbListChatMessages(threadId, auth.userId, 300);
  return res.status(200).json({ messages });
}

/** POST /api/chat/threads/:threadId/messages { text } */
export async function handlePostChatMessage(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = requireAuth(req, res);
  if (!auth) return;
  const threadId = req.params.threadId;
  const text = typeof (req.body as { text?: string }).text === "string"
    ? (req.body as { text: string }).text
    : "";
  const msg = await dbAppendChatMessage(threadId, auth.userId, text);
  if (!msg) {
    return res.status(400).json({ error: "Could not send message" });
  }
  return res.status(201).json({ message: msg });
}
