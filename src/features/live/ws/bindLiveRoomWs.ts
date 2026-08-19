/**
 * Single bind site for core Live room WS (chat, gifts, hearts, presence).
 */

import { LIVE_WS_IN } from '../../../lib/live';
import { bindLiveWsEventPairs, type LiveWsEventPair } from './bindLiveWsEventPairs';

type LiveRoomWsHandlers = {
  onRoomState?: (data: unknown) => void;
  onUserJoined?: (data: unknown) => void;
  onUserLeft?: (data: unknown) => void;
  onChatMessage?: (data: unknown) => void;
  onGiftSent?: (data: unknown) => void;
  onGiftGoalSync?: (data: unknown) => void;
  onHeartSent?: (data: unknown) => void;
  onStreamEnded?: (data: unknown) => void;
  onViewerCount?: (data: unknown) => void;
  onConnected?: (data: unknown) => void;
};

export function bindLiveRoomWs(handlers: LiveRoomWsHandlers): () => void {
  const pairs: LiveWsEventPair[] = [];

  if (handlers.onRoomState) pairs.push([LIVE_WS_IN.room_state, handlers.onRoomState]);
  if (handlers.onUserJoined) pairs.push([LIVE_WS_IN.user_joined, handlers.onUserJoined]);
  if (handlers.onUserLeft) pairs.push([LIVE_WS_IN.user_left, handlers.onUserLeft]);
  if (handlers.onChatMessage) pairs.push([LIVE_WS_IN.chat_message, handlers.onChatMessage]);
  if (handlers.onGiftSent) pairs.push([LIVE_WS_IN.gift_sent, handlers.onGiftSent]);
  if (handlers.onGiftGoalSync) {
    pairs.push([LIVE_WS_IN.gift_goal_sync, handlers.onGiftGoalSync]);
  }
  if (handlers.onHeartSent) pairs.push([LIVE_WS_IN.heart_sent, handlers.onHeartSent]);
  if (handlers.onStreamEnded) {
    pairs.push([LIVE_WS_IN.stream_ended, handlers.onStreamEnded]);
  }
  if (handlers.onViewerCount) {
    pairs.push([LIVE_WS_IN.viewer_count, handlers.onViewerCount]);
  }
  if (handlers.onConnected) pairs.push([LIVE_WS_IN.connected, handlers.onConnected]);

  return bindLiveWsEventPairs(pairs);
}
