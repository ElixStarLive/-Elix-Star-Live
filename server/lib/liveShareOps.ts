import { dbGetStreamOwnerUserId, upsertLiveShareInbox } from "./postgres";
import { notifyLiveShareRecipient } from "./liveShareNotify";
import { logger } from "./logger";

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

  // Who is live in this room is the server's answer, not the sender's. Taking
  // hostUserId/hostName/hostAvatar straight from the request let a sharer put any
  // creator's identity on a live they do not own, so the recipient's inbox row
  // named the wrong person. The room's real owner is looked up here; the sender's
  // host display fields are kept only when they describe that same owner.
  let hostUserId = input.hostUserId || "";
  try {
    const owner = await dbGetStreamOwnerUserId(streamKey);
    if (owner) hostUserId = owner;
  } catch (err) {
    logger.warn({ err, streamKey }, "executeLiveShareSend: stream owner lookup failed");
    // Room ids are the creator's own id (see handleLiveStart), so the key itself
    // is a server-derived answer — better than trusting the claim in the request.
    hostUserId = streamKey;
  }
  const hostVerified = !input.hostUserId || input.hostUserId === hostUserId;

  const createdAt = new Date().toISOString();
  const payload: LiveSharePayload = {
    sharerUserId: input.sharerId,
    sharerName: input.sharerName || "Someone",
    sharerAvatar: input.sharerAvatar || "",
    streamKey,
    hostUserId,
    hostName: hostVerified ? input.hostName || "" : "",
    hostAvatar: hostVerified ? input.hostAvatar || "" : "",
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
