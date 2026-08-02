/**
 * One Live room lifecycle owner: WebSocket room + LiveKitSession + end-live cleanup.
 * Pages must not open parallel Room() or bypass this for connect/disconnect/end.
 */

import { getLiveKitUrl } from '../api';
import { LiveKitSession, type LiveKitSessionHandlers } from '../liveKitSession';
import { websocket } from '../websocket';
import { apiLiveEnd, apiLiveStart, apiLiveToken, type LiveKitCreds } from './liveApi';

export type LiveRole = 'host' | 'spectator' | 'cohost' | 'battle_joiner' | 'preview';

export interface LiveRoomConnectOptions {
  roomId: string;
  role: LiveRole;
  authToken: string;
  /** Host start returns creds; otherwise fetched via /api/live/token */
  creds?: LiveKitCreds | null;
  persistentWs?: boolean;
  liveKitHandlers?: LiveKitSessionHandlers;
  /** Host-only display name for /api/live/start */
  displayName?: string;
  /** When true, skip stream_start (e.g. battle joiner already in host room). */
  skipStreamStart?: boolean;
}

/**
 * Owns a single LiveKitSession + websocket room binding for one live surface.
 */
export class LiveRoomLifecycle {
  private session: LiveKitSession | null = null;
  private roomId: string | null = null;
  private role: LiveRole | null = null;
  private registeredHost = false;

  get liveKit(): LiveKitSession | null {
    return this.session;
  }

  get rawRoom() {
    return this.session?.raw ?? null;
  }

  get currentRoomId(): string | null {
    return this.roomId;
  }

  get isHostRegistered(): boolean {
    return this.registeredHost;
  }

  markHostRegistered(): void {
    this.registeredHost = true;
  }

  async connect(opts: LiveRoomConnectOptions): Promise<{ error: string | null }> {
    await this.disconnect({ sendStreamEnd: false, restEnd: false });

    this.roomId = opts.roomId;
    this.role = opts.role;

    let creds = opts.creds ?? null;
    if (opts.role === 'host' && !creds) {
      const started = await apiLiveStart({
        room: opts.roomId,
        displayName: opts.displayName,
      });
      if (started.error || !started.creds) {
        return { error: started.error || 'Failed to start live' };
      }
      creds = started.creds;
      this.registeredHost = true;
    }
    if (!creds) {
      const publish =
        opts.role === 'host' ||
        opts.role === 'cohost' ||
        opts.role === 'battle_joiner';
      const tok = await apiLiveToken(opts.roomId, publish);
      if (tok.error || !tok.creds) {
        return { error: tok.error || 'Failed to get live token' };
      }
      creds = tok.creds;
    }

    const url = (creds.url || '').trim() || getLiveKitUrl();
    if (!url || !creds.token) {
      return { error: 'Missing LiveKit URL or token' };
    }

    const session = new LiveKitSession(opts.liveKitHandlers ?? {});
    this.session = session;
    try {
      await session.connect(url, creds.token);
    } catch (e) {
      this.session = null;
      return { error: e instanceof Error ? e.message : 'LiveKit connect failed' };
    }

    if (opts.authToken) {
      websocket.connect(opts.roomId, opts.authToken, {
        persistent:
          opts.persistentWs ?? (opts.role === 'host' || opts.role === 'battle_joiner'),
      });
    }

    if (opts.role === 'host' && !opts.skipStreamStart) {
      websocket.send('stream_start', { stream_key: opts.roomId });
    }

    return { error: null };
  }

  /**
   * Attach LiveKit only (caller already has creds). WS connect is optional.
   */
  async connectLiveKitOnly(
    creds: LiveKitCreds,
    handlers: LiveKitSessionHandlers = {},
  ): Promise<{ error: string | null; session: LiveKitSession | null }> {
    const url = (creds.url || '').trim() || getLiveKitUrl();
    if (!url || !creds.token) {
      return { error: 'Missing LiveKit URL or token', session: null };
    }
    this.session?.disconnect();
    const session = new LiveKitSession(handlers);
    this.session = session;
    try {
      await session.connect(url, creds.token);
      return { error: null, session };
    } catch (e) {
      this.session = null;
      return { error: e instanceof Error ? e.message : 'LiveKit connect failed', session: null };
    }
  }

  async publishFromStream(stream: MediaStream): Promise<void> {
    if (!this.session) throw new Error('LiveKit session not connected');
    await this.session.publishFromStream(stream);
  }

  /**
   * Full host end: WS stream_end + REST /api/live/end (retried) + LiveKit + WS teardown.
   */
  async endHostBroadcast(roomId: string): Promise<{ restEnded: boolean; error: string | null }> {
    if (websocket.getCurrentRoomId() === roomId || websocket.isConnected()) {
      websocket.send('stream_end', { stream_key: roomId });
    }

    let restEnded = false;
    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 3 && !restEnded; attempt += 1) {
      const r = await apiLiveEnd(roomId);
      if (r.ok) {
        restEnded = true;
        this.registeredHost = false;
      } else {
        lastErr = r.error;
        if (attempt < 2) {
          await new Promise((res) => window.setTimeout(res, 400 * (attempt + 1)));
        }
      }
    }

    await this.disconnect({ sendStreamEnd: false, restEnd: false });
    return { restEnded, error: restEnded ? null : lastErr };
  }

  async disconnect(opts?: {
    sendStreamEnd?: boolean;
    restEnd?: boolean;
  }): Promise<void> {
    const roomId = this.roomId;
    if (opts?.sendStreamEnd && roomId && this.role === 'host') {
      websocket.send('stream_end', { stream_key: roomId });
    }
    if (opts?.restEnd && roomId && this.registeredHost) {
      await apiLiveEnd(roomId);
      this.registeredHost = false;
    }

    this.session?.disconnect();
    this.session = null;

    if (roomId) {
      websocket.disconnectIfRoom(roomId);
    }

    this.roomId = null;
    this.role = null;
  }
}
