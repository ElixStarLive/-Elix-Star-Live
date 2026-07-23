/**
 * LiveKit service: generate access tokens for creators (publish) and viewers (subscribe).
 * Frontend uses token to connect to LIVEKIT_URL.
 * List active rooms from LiveKit so all server instances see the same streams (no per-instance memory).
 */

import { randomUUID } from 'node:crypto';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { logger } from '../lib/logger';

const API_KEY = (process.env.LIVEKIT_API_KEY || '').trim();
const API_SECRET = (process.env.LIVEKIT_API_SECRET || '').trim();
const LIVEKIT_URL = (process.env.LIVEKIT_URL || '').trim();

export function isLiveKitConfigured(): boolean {
  return Boolean(API_KEY && API_SECRET);
}

let roomService: RoomServiceClient | null = null;

function getRoomService(): RoomServiceClient | null {
  if (!LIVEKIT_URL || !API_KEY || !API_SECRET) return null;
  if (!roomService) {
    roomService = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);
  }
  return roomService;
}

/** List active room names from LiveKit (shared across all server instances). */
export async function listActiveRoomsFromLiveKit(): Promise<
  Array<{ name: string; numParticipants: number }>
> {
  const client = getRoomService();
  if (!client) return [];
  try {
    const rooms = await client.listRooms();
    return rooms.map((r: { name?: string; numParticipants?: number }) => ({
      name: r?.name ?? '',
      numParticipants: typeof r?.numParticipants === 'number' ? r.numParticipants : 0,
    }));
  } catch (err) {
    logger.error({ err }, 'listActiveRoomsFromLiveKit failed');
    return [];
  }
}

/**
 * True if the user is connected to the room AND actively publishing tracks
 * (camera/mic). This is the authoritative "is this user really broadcasting"
 * check — a spectator/subscriber never publishes, so they can never pass it.
 */
export async function isUserPublishingInRoom(
  roomName: string,
  userId: string,
): Promise<boolean> {
  const client = getRoomService();
  if (!client) return false;
  try {
    const participants = await client.listParticipants(roomName);
    return participants.some(
      (p) =>
        // Host/co-host publish tokens use stable identity = userId.
        // Spectator identities are `${userId}__v_<suffix>` — strip before compare.
        userIdFromLiveKitIdentity(p?.identity || '') === userId &&
        Array.isArray(p?.tracks) &&
        p.tracks.length > 0,
    );
  } catch (err) {
    // Missing room → not live. Transient LiveKit API failures must NOT hide
    // the card from every For You spectator (that looked like "only one can join").
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found|does not exist|404/i.test(msg)) return false;
    logger.warn({ err, roomName, userId }, "isUserPublishingInRoom transient failure — keeping stream listed");
    return true;
  }
}

/**
 * True if anyone in the room is publishing tracks (host, co-host, or battle).
 * Used for For You / Discover listing so a host identity mismatch cannot hide
 * a real live room from every spectator.
 */
export async function roomHasActivePublisher(roomName: string): Promise<boolean> {
  const client = getRoomService();
  if (!client) return false;
  try {
    const participants = await client.listParticipants(roomName);
    return participants.some(
      (p) => Array.isArray(p?.tracks) && p.tracks.length > 0,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found|does not exist|404/i.test(msg)) return false;
    logger.warn({ err, roomName }, "roomHasActivePublisher transient failure — keeping stream listed");
    return true;
  }
}

/** WebSocket URL for the LiveKit server (client connects here with token). */
export function getLiveKitUrl(): string {
  return LIVEKIT_URL;
}

export interface CreateTokenOptions {
  userId: string;
  roomName: string;
  /** Creator/host can publish; viewer only subscribes. Default false (viewer). */
  canPublish?: boolean;
  /** Display name for the participant. */
  name?: string;
  /** Token TTL. Default 6h. */
  ttl?: string | number;
}

/**
 * LiveKit allows one participant per identity per room. Publishers (host /
 * co-host / battle) keep a stable identity (= userId) so clients can find the
 * host. Subscribe-only viewers get a unique suffix so the same account on two
 * phones (or host + self-watch) does not DUPLICATE_IDENTITY-kick the other.
 */
function liveKitParticipantIdentity(userId: string, canPublish: boolean): string {
  if (canPublish) return userId;
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  return `${userId}__v_${suffix}`;
}

/** Resolve app user id from a LiveKit participant identity. */
export function userIdFromLiveKitIdentity(identity: string): string {
  const i = (identity || '').trim();
  const m = i.match(/^(.*)__v_[a-f0-9]{12}$/i);
  return m?.[1] || i;
}

/**
 * Create a LiveKit access token for a user to join a room.
 * Use canPublish: true for the stream host, false for viewers.
 */
export async function createLiveToken(options: CreateTokenOptions): Promise<string> {
  if (!API_KEY || !API_SECRET) {
    throw new Error('LiveKit is not configured (missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET)');
  }

  const { userId, roomName, canPublish = false, name = userId, ttl = '6h' } = options;
  const identity = liveKitParticipantIdentity(userId, canPublish);

  const at = new AccessToken(API_KEY, API_SECRET, {
    identity,
    name,
    ttl,
    metadata: JSON.stringify({ userId }),
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
  });

  return await at.toJwt();
}
