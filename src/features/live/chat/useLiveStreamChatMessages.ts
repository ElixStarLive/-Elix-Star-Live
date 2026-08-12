/**
 * Shared host↔spectator live chat store binding for one stream id.
 */

import { useCallback } from 'react';
import type { LiveMessage } from '../types';
import { EMPTY_LIVE_MESSAGES, useLiveChatStore } from './useLiveChatStore';

export function useLiveStreamChatMessages(effectiveStreamId: string) {
  const messages = useLiveChatStore(
    (s) => s.messagesByStream[effectiveStreamId] ?? EMPTY_LIVE_MESSAGES,
  );
  const updateMessagesForStream = useLiveChatStore((s) => s.updateMessagesForStream);
  const clearMessagesForStream = useLiveChatStore((s) => s.clearMessagesForStream);
  const setMessages = useCallback(
    (updater: (prev: LiveMessage[]) => LiveMessage[]) => {
      updateMessagesForStream(effectiveStreamId, updater);
    },
    [effectiveStreamId, updateMessagesForStream],
  );
  return { messages, setMessages, clearMessagesForStream };
}
