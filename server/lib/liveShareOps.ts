import { upsertLiveShareInbox } from "./postgres";
import { notifyLiveShareRecipient } from "./liveShareNotify";

export type LiveSharePayload = {
  sharerUserId: string;
  sharerName: string;
  sharerAvatar: string;
  streamKey: string;
  hostUserId: string;
  hostName: string;
  hostAvatar: string;
  createdAt: string;
};

function normalizeStreamKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
}

export async function executeLiveShareSend(input: {
  sharerId: string;
  sharerName: string;
  sharerAvatar: string;
  targetUserId: string;
  streamKey: string;
  hostUserId: string;
  hostName: string;
  hostAvatar: string;
}): Promise<{ ok: boolean; persisted: boolean; payload: LiveSharePayload }> {
  const streamKey = normalizeStreamKey(input.streamKey);
  if (!streamKey || !input.targetUserId || input.targetUserId === input.sharerId) {
    return {
      ok: false,
      persisted: false,
      payload: {} as LiveSharePayload,
    };
  }

  const createdAt = new Date().toISOString();
  const payload: LiveSharePayload = {
    sharerUserId: input.sharerId,
    sharerName: input.sharerName || "Someone",
    sharerAvatar: input.sharerAvatar || "",
    streamKey,
    hostUserId: input.hostUserId || "",
    hostName: input.hostName || "",
    hostAvatar: input.hostAvatar || "",
    createdAt,
  };

  const persisted = await upsertLiveShareInbox({
    recipientId: input.targetUserId,
    sharerId: input.sharerId,
    streamKey,
    hostUserId: payload.hostUserId,
    hostName: payload.hostName,
    hostAvatar: payload.hostAvatar,
    sharerName: payload.sharerName,
    sharerAvatar: payload.sharerAvatar,
  });

  notifyLiveShareRecipient(input.targetUserId, payload);

  return { ok: true, persisted, payload };
}
