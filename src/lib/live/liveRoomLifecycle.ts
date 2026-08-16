/**
 * One LiveKit session owner per live surface.
 * Pages must not open parallel Room() or bypass this for connect/disconnect/end.
 * WebSocket room bind stays with the host/spectator/inline controllers.
 */

import { getLiveKitUrl } from '../api';
import { LiveKitSession, type LiveKitSessionHandlers } from '../liveKitSession';
import { websocket } from '../websocket';
import { apiLiveEnd, type LiveKitCreds } from './liveApi';
import {
  normalizeLiveKitSignalUrl,
  probeLiveKitSignalReason,
  summarizeLiveKitConnectError,
  summarizeLiveKitEndpoint,
  summarizeLiveKitToken,
} from './liveKitDiagnostics';

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
    context?: {
      surface?: 'host' | 'spectator' | 'inline' | 'battle' | 'unknown';
      roomId?: string;
      publish?: boolean;
    },
  ): Promise<{ error: string | null; session: LiveKitSession | null }> {
    const rawUrl = (creds.url || '').trim() || getLiveKitUrl();
    const url = normalizeLiveKitSignalUrl(rawUrl);
    if (!url || !creds.token) {
      return { error: 'Missing LiveKit URL or token', session: null };
    }
    const endpoint = summarizeLiveKitEndpoint(url);
    const token = summarizeLiveKitToken(creds.token);
    const surface = context?.surface || 'unknown';
    const roomId = (context?.roomId || '').trim() || token.room || null;
    // #region agent log
    void fetch('http://127.0.0.1:7890/ingest/cb808dfb-207c-422d-a0a1-8b9841f6ae4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d739cc'},body:JSON.stringify({sessionId:'d739cc',runId:'pre-fix',hypothesisId:'H5',location:'src/lib/live/liveRoomLifecycle.ts:63',message:'LiveKit signal connect attempted',data:{surface,endpointHost:endpoint.host,endpointProtocol:endpoint.protocol,secure:endpoint.isSecureWss,localhost:endpoint.isLocalhost,tokenRoomMatchesContext:token.room===roomId,canPublish:token.canPublish,canSubscribe:token.canSubscribe,roomJoin:token.roomJoin,publishRequested:context?.publish??null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    console.info('[LiveKit] connect attempt', {
      surface,
      roomId,
      endpointHost: endpoint.host,
      endpointProtocol: endpoint.protocol,
      endpointSecure: endpoint.isSecureWss,
      endpointLocalhost: endpoint.isLocalhost,
      identity: token.identity,
      issuer: token.issuer,
      tokenRoom: token.room,
      canPublish: token.canPublish,
      canSubscribe: token.canSubscribe,
      roomJoin: token.roomJoin,
      expiresAtIso: token.expiresAtIso,
      publishRequested: context?.publish ?? null,
    });
    this.session?.disconnect();
    const session = new LiveKitSession(handlers);
    this.session = session;
    try {
      await session.connect(url, creds.token);
      const state = session.raw?.state ?? 'disconnected';
      // #region agent log
      void fetch('http://127.0.0.1:7890/ingest/cb808dfb-207c-422d-a0a1-8b9841f6ae4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d739cc'},body:JSON.stringify({sessionId:'d739cc',runId:'post-fix',hypothesisId:'H5',location:'src/lib/live/liveRoomLifecycle.ts:85',message:'LiveKit signal connect succeeded',data:{surface,endpointHost:endpoint.host,state},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      console.info('[LiveKit] connect success', { surface, roomId, state });
      return { error: null, session };
    } catch (e) {
      this.session = null;
      const err = summarizeLiveKitConnectError(e);
      const probe = await probeLiveKitSignalReason(url, creds.token);
      console.error('[LiveKit] connect failed', {
        surface,
        roomId,
        endpointHost: endpoint.host,
        endpointProtocol: endpoint.protocol,
        endpointSecure: endpoint.isSecureWss,
        endpointLocalhost: endpoint.isLocalhost,
        identity: token.identity,
        issuer: token.issuer,
        tokenRoom: token.room,
        canPublish: token.canPublish,
        canSubscribe: token.canSubscribe,
        roomJoin: token.roomJoin,
        error: err,
        signalRejectStatus: probe.status,
        signalRejectReason: probe.reason,
      });
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
