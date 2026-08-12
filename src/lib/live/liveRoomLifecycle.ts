/**
 * One LiveKit session owner per live surface.
 * Pages must not open parallel Room() or bypass this for connect/disconnect/end.
 * WebSocket room bind stays with the host/spectator/inline controllers.
 */

import { getLiveKitUrl } from '../api';
import { LiveKitSession, type LiveKitSessionHandlers } from '../liveKitSession';
import { websocket } from '../websocket';
import { apiLiveEnd, type LiveKitCreds } from './liveApi';

/**
 * Owns a single LiveKitSession for one live surface.
 */
export class LiveRoomLifecycle {
  private session: LiveKitSession | null = null;
  private registeredHost = false;

  get liveKit(): LiveKitSession | null {
    return this.session;
  }

  get rawRoom() {
    return this.session?.raw ?? null;
  }

  get isHostRegistered(): boolean {
    return this.registeredHost;
  }

  markHostRegistered(): void {
    this.registeredHost = true;
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

  async disconnect(_opts?: {
    sendStreamEnd?: boolean;
    restEnd?: boolean;
  }): Promise<void> {
    this.session?.disconnect();
    this.session = null;
  }
}
