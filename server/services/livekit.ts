/**
 * LiveKit service: generate access tokens for creators (publish) and viewers (subscribe).
 * Frontend uses token to connect to LIVEKIT_URL.
 * List active rooms from LiveKit so all server instances see the same streams (no per-instance memory).
 */

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { logger } from '../lib/logger';
// #region agent log
function _dbgLK(loc:string,msg:string,data:Record<string,unknown>={}){fetch('http://127.0.0.1:7684/ingest/8c32b730-3e4a-4f4c-9502-6b305be695c7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6f8791'},body:JSON.stringify({sessionId:'6f8791',location:loc,message:msg,data,timestamp:Date.now()})}).catch(()=>{});}
// #endregion

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
    // #region agent log
    _dbgLK('livekit.ts:listRooms','LIVEKIT_LIST_ROOMS_FAILED_SILENT',{error:err instanceof Error?err.message:String(err),nodeEnv:process.env.NODE_ENV,hypothesisId:'E'});
    // #endregion
    logger.error({ err }, 'listActiveRoomsFromLiveKit failed');
    return [];
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
 * Create a LiveKit access token for a user to join a room.
 * Use canPublish: true for the stream host, false for viewers.
 */
export async function createLiveToken(options: CreateTokenOptions): Promise<string> {
  if (!API_KEY || !API_SECRET) {
    throw new Error('LiveKit is not configured (missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET)');
  }

  const { userId, roomName, canPublish = false, name = userId, ttl = '6h' } = options;

  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: userId,
    name,
    ttl,
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
  });

  return await at.toJwt();
}
