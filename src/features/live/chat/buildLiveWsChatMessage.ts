/**
 * Shared host↔spectator live chat WS text → LiveMessage construction.
 * Identity cache updates stay role-specific; message shape is shared.
 */

import type { LiveMessage } from '../types';

export type ParsedLiveWsChatText = {
  parsedLevel: number;
  isLevelUp: boolean;
  isMembershipJoin: boolean;
  displayText: string;
};

export function parseLiveWsChatText(text: string): ParsedLiveWsChatText {
  const levelUpMatch = /^reached Level (\d+)/i.exec(text);
  const parsedLevel = levelUpMatch ? Number(levelUpMatch[1]) : NaN;
  const isMembershipJoin = /joined the team/i.test(text);
  return {
    parsedLevel,
    isLevelUp: !!levelUpMatch,
    isMembershipJoin,
    displayText: isMembershipJoin ? 'Joined the team!' : text,
  };
}

export function resolveLiveChatDisplayLevel(
  parsedLevel: number,
  dataLevel: unknown,
  cachedLevel?: number,
): number {
  if (Number.isFinite(parsedLevel)) return parsedLevel;
  if (Number.isFinite(Number(dataLevel)) && Number(dataLevel) >= 0) {
    return Math.floor(Number(dataLevel));
  }
  return cachedLevel || 1;
}

export function buildLiveWsChatMessage(opts: {
  username: string;
  avatar: string;
  text: string;
  dataLevel: unknown;
  cachedLevel?: number;
  stickerUrl?: unknown;
}): LiveMessage {
  const parsed = parseLiveWsChatText(opts.text);
  return {
    id: `ws-${Date.now()}-${Math.random()}`,
    username: opts.username,
    text: parsed.displayText,
    level: resolveLiveChatDisplayLevel(
      parsed.parsedLevel,
      opts.dataLevel,
      opts.cachedLevel,
    ),
    avatar: opts.avatar,
    stickerUrl: typeof opts.stickerUrl === 'string' ? opts.stickerUrl : undefined,
    isSystem: parsed.isLevelUp || parsed.isMembershipJoin,
    membershipIcon: parsed.isMembershipJoin ? 'heart' : undefined,
  };
}
