/**
 * Call Service — WebSocket signaling (call_invite, call_accepted, call_rejected, call_ended).
 */

import { websocket } from "./websocket";
import { useAuthStore } from "../store/useAuthStore";
import { useCallStore } from "../store/useCallStore";
import type { CallParticipant } from "../store/useCallStore";

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

  const handleInvite = (data: {
    callId: string;
    callerId: string;
    callerUsername: string;
    callerAvatar: string;
  }) => {
    // Ignore calls not addressed to this user (server should filter, but double-check)
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.id !== userId) return;

    const caller: CallParticipant = {
      id: data.callerId,
      username: data.callerUsername,
      avatar: data.callerAvatar,
    };

    useCallStore.getState().receiveIncomingCall(data.callId, caller);
  };

  const handleRemoteAccepted = (data: { callId: string }) => {
    const store = useCallStore.getState();
    if (store.callId === data.callId) {
      store.setStatus("connected");
    }
  };

  const handleRemoteRejected = (data: { callId: string }) => {
    const store = useCallStore.getState();
    if (store.callId === data.callId) {
      store.reset();
    }
  };

  const handleRemoteEnded = (data: { callId: string }) => {
    const store = useCallStore.getState();
    if (store.callId === data.callId) {
      store.reset();
    }
  };

  // Register WebSocket event listeners
  // These events are defined in websocket.ts WebSocketEvent union — cast as any
  // since call events are dynamic and handled here directly.
  (websocket as any).on("call_invite", handleInvite);
  (websocket as any).on("call_accepted", handleRemoteAccepted);
  (websocket as any).on("call_rejected", handleRemoteRejected);
  (websocket as any).on("call_ended", handleRemoteEnded);

  // Return cleanup function
  return () => {
    (websocket as any).off("call_invite", handleInvite);
    (websocket as any).off("call_accepted", handleRemoteAccepted);
    (websocket as any).off("call_rejected", handleRemoteRejected);
    (websocket as any).off("call_ended", handleRemoteEnded);
  };
}
