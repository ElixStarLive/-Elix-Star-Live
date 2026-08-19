/**
 * Call Service — WebSocket signaling (call_invite, call_accepted, call_rejected, call_ended).
 */

import { websocket } from "./websocket";
import { useAuthStore } from "../store/useAuthStore";
import { useCallStore } from "../store/useCallStore";
import type { CallParticipant } from "../store/useCallStore";

/**
 * What the server actually relays for 1:1 call signalling
 * (`call_invite` / `call_accepted` / `call_rejected` / `call_ended` in
 * server/websocket/handlers.ts). Every one of them carries `callId`; only the
 * invite carries the caller's identity, and `call_rejected` arrives in two forms —
 * the relayed decline, and a `{ callId, reason: "blocked" }` refusal from the
 * server itself — so only `callId` may be relied on there.
 *
 * These arrive off a socket, so they are read as `unknown` and narrowed below
 * rather than asserted: a malformed frame must not reach the call store.
 */
type CallSignal = { callId: string };

type CallInviteSignal = CallSignal & {
  callerId: string;
  callerUsername: string;
  callerAvatar: string;
};

function readCallSignal(data: unknown): CallSignal | null {
  if (!data || typeof data !== "object") return null;
  const { callId } = data as { callId?: unknown };
  return typeof callId === "string" && callId ? { callId } : null;
}

function readCallInvite(data: unknown): CallInviteSignal | null {
  const base = readCallSignal(data);
  if (!base) return null;
  const raw = data as {
    callerId?: unknown;
    callerUsername?: unknown;
    callerAvatar?: unknown;
  };
  if (typeof raw.callerId !== "string" || !raw.callerId) return null;
  return {
    callId: base.callId,
    callerId: raw.callerId,
    // The server substitutes its own values for these before relaying, so an
    // absent one means a malformed frame, not a nameless caller.
    callerUsername: typeof raw.callerUsername === "string" ? raw.callerUsername : "",
    callerAvatar: typeof raw.callerAvatar === "string" ? raw.callerAvatar : "",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCurrentUser() {
  return useAuthStore.getState().user;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initiate an outgoing call to a remote user.
 * Sends a 'call_invite' event over the WebSocket to the Hetzner backend,
 * which forwards it to the callee's open socket.
 *
 * @returns callId — UUID for this call session.
 */
export async function initiateCall(
  remoteUser: CallParticipant,
): Promise<string> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const callId = crypto.randomUUID();

  websocket.send("call_invite", {
    callId,
    callerId: user.id,
    calleeId: remoteUser.id,
    callerUsername: user.username || user.name || "User",
    callerAvatar: user.avatar || "",
  });

  useCallStore.getState().startOutgoingCall(callId, remoteUser);
  useCallStore.getState().setCallRoomName(`call_${callId}`);
  return callId;
}

/**
 * Accept an incoming call.
 * Sends a 'call_accepted' event so the caller knows to connect LiveKit / media.
 */
export async function acceptCall(callId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const store = useCallStore.getState();
  if (!store.remoteUser) return;

  websocket.send("call_accepted", {
    callId,
    calleeId: user.id,
    callerId: store.remoteUser.id,
    calleeUsername: user.username || user.name || "User",
    calleeAvatar: user.avatar || "",
  });

  useCallStore.getState().setStatus("connecting");
  useCallStore.getState().setCallRoomName(`call_${callId}`);
}

/** Returns the LiveKit room name for a call */
export function getCallRoomName(callId: string): string {
  return `call_${callId}`;
}

/**
 * Reject an incoming call.
 * Sends a 'call_rejected' event and resets local call state.
 */
export async function rejectCall(callId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;

  const store = useCallStore.getState();
  const remoteId = store.remoteUser?.id;
  if (!remoteId) return;

  websocket.send("call_rejected", {
    callId,
    calleeId: user.id,
    callerId: remoteId,
  });

  useCallStore.getState().reset();
}

/**
 * End an active call.
 * Sends a 'call_ended' event to the server for relay to the remote peer.
 */
export async function endCall(callId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;

  const store = useCallStore.getState();
  const remoteId = store.remoteUser?.id;

  websocket.send("call_ended", {
    callId,
    userId: user.id,
    remoteId: remoteId || "",
  });

  useCallStore.getState().reset();
}

/**
 * Subscribe to incoming call events via WebSocket.
 * The Hetzner backend relays 'call_invite' events to connected clients.
 *
 * @returns Unsubscribe function — call it on component unmount.
 */
export function subscribeToIncomingCalls(userId: string): () => void {
  // Guard: only subscribe if WS is connected for this user
  if (!userId) return () => {};

  const handleInvite = (data: unknown) => {
    const invite = readCallInvite(data);
    if (!invite) return;

    // Ignore calls not addressed to this user (server should filter, but double-check)
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.id !== userId) return;

    const caller: CallParticipant = {
      id: invite.callerId,
      username: invite.callerUsername,
      avatar: invite.callerAvatar,
    };

    useCallStore.getState().receiveIncomingCall(invite.callId, caller);
  };

  const handleRemoteAccepted = (data: unknown) => {
    const signal = readCallSignal(data);
    const store = useCallStore.getState();
    if (signal && store.callId === signal.callId) {
      store.setStatus("connected");
    }
  };

  const handleRemoteRejected = (data: unknown) => {
    const signal = readCallSignal(data);
    const store = useCallStore.getState();
    if (signal && store.callId === signal.callId) {
      store.reset();
    }
  };

  const handleRemoteEnded = (data: unknown) => {
    const signal = readCallSignal(data);
    const store = useCallStore.getState();
    if (signal && store.callId === signal.callId) {
      store.reset();
    }
  };

  // Register WebSocket event listeners. `on`/`off` already accept these names, so
  // the handlers take the frame as it arrives and narrow it themselves.
  websocket.on("call_invite", handleInvite);
  websocket.on("call_accepted", handleRemoteAccepted);
  websocket.on("call_rejected", handleRemoteRejected);
  websocket.on("call_ended", handleRemoteEnded);

  // Return cleanup function
  return () => {
    websocket.off("call_invite", handleInvite);
    websocket.off("call_accepted", handleRemoteAccepted);
    websocket.off("call_rejected", handleRemoteRejected);
    websocket.off("call_ended", handleRemoteEnded);
  };
}
