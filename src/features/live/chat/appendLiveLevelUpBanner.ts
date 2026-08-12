/**
 * Shared live chat level-up banner + optional room chat echo.
 */

import type { Dispatch, SetStateAction } from 'react';
import { appendCapped, LIVE_CHAT_MESSAGE_CAP } from '../../../lib/liveRuntimeCaps';
import type { LiveMessage } from '../types';

export function appendLiveLevelUpBanner(args: {
  setMessages: Dispatch<SetStateAction<LiveMessage[]>>;
  username: string;
  avatar: string;
  level: number;
  /** When set, also echo to room chat. */
  liveChatSend?: (payload: { text: string; level: number; avatar: string }) => void;
}): void {
  const { setMessages, username, avatar, level, liveChatSend } = args;
  setMessages((prev) =>
    appendCapped(
      prev,
      {
        id: `levelup-${Date.now()}`,
        username,
        text: `reached Level ${level}`,
        level,
        isGift: false,
        avatar,
        isSystem: true,
      },
      LIVE_CHAT_MESSAGE_CAP,
    ),
  );
  liveChatSend?.({
    text: `reached Level ${level}`,
    level,
    avatar,
  });
}
