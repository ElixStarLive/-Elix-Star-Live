/**
 * Shared host↔spectator ephemeral "joined the stream" chat banner.
 */

import type { Dispatch, SetStateAction } from 'react';
import { appendCapped, LIVE_CHAT_MESSAGE_CAP } from '../../../lib/liveRuntimeCaps';
import type { LiveMessage } from '../types';
import { apiFetchProfileById } from '../../feed/feedApi';
import { reportFailure } from '../../../lib/reportFailure';

type SetMessages = Dispatch<SetStateAction<LiveMessage[]>> | ((updater: (prev: LiveMessage[]) => LiveMessage[]) => void);

/** Append join banner if not already present (id or duplicate system text). */
export function appendLiveJoinStreamBanner(opts: {
  setMessages: SetMessages;
  joinMsgId: string;
  joinName: string;
  initialLevel: number;
  avatar?: string;
}): void {
  const { setMessages, joinMsgId, joinName, initialLevel, avatar = '' } = opts;
  setMessages((prev) => {
    if (
      prev.some(
        (m) =>
          m.id === joinMsgId ||
          (m.isSystem === true && m.text === 'joined the stream' && m.username === joinName),
      )
    ) {
      return prev;
    }
    return appendCapped(
      prev,
      {
        id: joinMsgId,
        username: joinName,
        text: 'joined the stream',
        isSystem: true,
        level: initialLevel,
        avatar,
      },
      LIVE_CHAT_MESSAGE_CAP,
    );
  });
}

/** Clear join banner after delay (ephemeral). */
export function scheduleLiveJoinBannerClear(
  setMessages: SetMessages,
  joinMsgId: string,
  clearAfterMs = 5000,
  isMounted?: () => boolean,
): void {
  window.setTimeout(() => {
    if (isMounted && !isMounted()) return;
    setMessages((prev) => prev.filter((m) => m.id !== joinMsgId));
  }, clearAfterMs);
}

/**
 * If join level looks default (<=1), fetch profile level and patch the join banner message.
 * `onLevelFixed` handles role-specific viewer/MVP caches.
 */
export function maybeFixJoinBannerLevelFromProfile(opts: {
  userId: string;
  joinMsgId: string;
  initialLevel: number;
  setMessages: SetMessages;
  isMounted: () => boolean;
  onLevelFixed?: (fixedLevel: number) => void;
}): void {
  const { userId, joinMsgId, initialLevel, setMessages, isMounted, onLevelFixed } = opts;
  if (initialLevel > 1) return;
  void apiFetchProfileById(userId)
    .then(({ body }) => {
      if (!isMounted()) return;
      const prof = (body?.profile || body?.data || {}) as Record<string, unknown>;
      const lvl = Number(prof.level);
      if (!Number.isFinite(lvl) || lvl <= 0) return;
      const fixed = Math.floor(lvl);
      setMessages((prev) =>
        prev.map((m) => (m.id === joinMsgId ? { ...m, level: fixed } : m)),
      );
      onLevelFixed?.(fixed);
    })
    .catch((err) => reportFailure('live_join_profile_level', err, { userId }));
}
