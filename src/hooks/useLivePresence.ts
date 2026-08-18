/**
 * Who is live, kept correct for as long as a screen is open.
 *
 * Every live indicator outside For You and Live Discover — profile rings, live
 * circles, share rows, Watch Live, live alert rows — asked the same authority
 * (`/api/live/streams`) once when it opened and then never again. A creator who
 * ended while the screen stayed open kept a LIVE ring until it was reopened.
 *
 * This is not a second presence architecture: it is one consumer of the existing
 * one. The snapshot is `apiLiveStreams`, the events are `connectLiveFeedPresence`
 * on the shared `__feed__` singleton, and which of the two wins is decided by
 * `reconcileLivePresence` + `createLiveSnapshotGate` — the same ordering rule the
 * discovery surfaces use, so a slow in-flight snapshot cannot resurrect a creator
 * who has ended, and a creator who has just started is not dropped by a snapshot
 * the server built before they registered.
 *
 * Two sets, because a live is addressed two ways and they are not the same value:
 * rings and share rows are keyed by CREATOR id, while a live notification's
 * `/live/:room` link is keyed by ROOM name — `POST /api/live/start` accepts a
 * room, so it is not an identity. Unioning them would let one creator's room name
 * light up another creator's ring.
 *
 * No polling, no timers, no local live state: a creator is live here only because
 * the server said so.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiLiveStreams } from '../lib/live/liveApi';
import { connectLiveFeedPresence } from '../lib/live/liveFeedPresence';
import {
  createLiveSnapshotGate,
  pruneEndedBefore,
  reconcileLivePresence,
} from '../lib/live/liveCardReconcile';

export type LivePresence = {
  /** Creator user ids currently on air. */
  creatorIds: Set<string>;
  /** Room names / stream keys currently on air. */
  streamKeys: Set<string>;
};

/** One live, and when this client learned about it. */
type LiveEntry = {
  /** Identity of the live: the creator id when known, else the room. */
  key: string;
  creatorId: string;
  streamKeys: string[];
  discoveredAt: number;
};

function readField(data: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = data[name];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function entriesFromSnapshot(streams: unknown[], discoveredAt: number): LiveEntry[] {
  const out: LiveEntry[] = [];
  for (const raw of streams || []) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    const creatorId = readField(s, 'hostUserId', 'userId', 'user_id');
    const streamKeys = [
      readField(s, 'stream_key', 'streamKey'),
      readField(s, 'room_id', 'roomId'),
    ].filter(Boolean);
    const key = creatorId || streamKeys[0] || '';
    if (!key) continue;
    out.push({ key, creatorId, streamKeys, discoveredAt });
  }
  return out;
}

export function useLivePresence(
  token: string | null | undefined,
  enabled = true,
): LivePresence {
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  const endedAtRef = useRef<Map<string, number>>(new Map());
  const gateRef = useRef(createLiveSnapshotGate());

  const refresh = useCallback(async () => {
    const ticket = gateRef.current.begin();
    const requestedAt = Date.now();
    const { streams, error } = await apiLiveStreams();
    // A failed response is not a snapshot: the server could not verify who is
    // live, so the last authoritative answer stands rather than clearing rings.
    if (error) return;
    if (!gateRef.current.isCurrent(ticket)) return;
    const snapshot = entriesFromSnapshot(streams, requestedAt);
    setEntries((previous) =>
      reconcileLivePresence<LiveEntry>({
        snapshot,
        previous,
        keyOf: (item) => item.key,
        discoveredAtOf: (item) => item.discoveredAt,
        requestedAt,
        endedAt: endedAtRef.current,
      }),
    );
    pruneEndedBefore(endedAtRef.current, requestedAt);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      endedAtRef.current.clear();
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !token) return;
    return connectLiveFeedPresence(token, {
      onStreamStarted: (data) => {
        const creatorId = readField(data, 'user_id', 'userId', 'host_user_id');
        const streamKeys = [
          readField(data, 'stream_key', 'streamKey'),
          readField(data, 'room_id', 'roomId'),
        ].filter(Boolean);
        const key = creatorId || streamKeys[0] || '';
        if (!key) return;
        endedAtRef.current.delete(key);
        setEntries((previous) =>
          previous.some((e) => e.key === key)
            ? previous
            : [...previous, { key, creatorId, streamKeys, discoveredAt: Date.now() }],
        );
      },
      onStreamEnded: (data) => {
        // The server names the creator: a stream key is a room name, and
        // `POST /api/live/start` accepts one, so it cannot be read as an identity.
        const creatorId = readField(data, 'host_user_id', 'hostUserId', 'user_id');
        const streamKey = readField(data, 'stream_key', 'streamKey', 'room_id', 'roomId');
        const key = creatorId || streamKey;
        if (!key) return;
        endedAtRef.current.set(key, Date.now());
        setEntries((previous) =>
          previous.filter(
            (e) =>
              e.key !== key &&
              !(creatorId && e.creatorId === creatorId) &&
              !(streamKey && e.streamKeys.includes(streamKey)),
          ),
        );
      },
    });
  }, [enabled, token]);

  return useMemo(() => {
    const creatorIds = new Set<string>();
    const streamKeys = new Set<string>();
    for (const entry of entries) {
      if (entry.creatorId) creatorIds.add(entry.creatorId);
      for (const key of entry.streamKeys) streamKeys.add(key);
    }
    return { creatorIds, streamKeys };
  }, [entries]);
}
