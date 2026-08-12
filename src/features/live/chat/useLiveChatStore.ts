import { create } from 'zustand';
import type { LiveMessage } from '../types';

type LiveChatState = {
  messagesByStream: Record<string, LiveMessage[]>;
  updateMessagesForStream: (
    streamId: string,
    updater: (prev: LiveMessage[]) => LiveMessage[],
  ) => void;
  clearMessagesForStream: (streamId: string) => void;
};

export const useLiveChatStore = create<LiveChatState>((set) => ({
  messagesByStream: {},

  updateMessagesForStream: (streamId, updater) => {
    if (!streamId) return;
    set((state) => {
      const prev = state.messagesByStream[streamId] ?? [];
      const next = updater(prev);
      // Keep the reference stable if the caller returns `prev` unchanged.
      if (next === prev) return state;
      return {
        messagesByStream: {
          ...state.messagesByStream,
          [streamId]: next,
        },
      };
    });
  },

  clearMessagesForStream: (streamId) => {
    if (!streamId) return;
    set((state) => {
      if (!(streamId in state.messagesByStream)) return state;
      const nextByStream = { ...state.messagesByStream };
      delete nextByStream[streamId];
      return { messagesByStream: nextByStream };
    });
  },
}));

