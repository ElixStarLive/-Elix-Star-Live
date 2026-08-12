import {
  Room,
  RoomEvent,
  ConnectionState,
  LocalVideoTrack,
  LocalAudioTrack,
  Track,
  type RemoteTrack,
  type RemoteParticipant,
  type Participant,
  type TrackPublication,
  type RemoteTrackPublication,
} from 'livekit-client';
import { getLiveMediaTierConfig, getLiveRoomOptions } from './live/liveMediaProfile';
import { detachParticipantTracks, detachRemoteTrack } from './live/liveTrackCleanup';
import { prepareLiveVideoEl } from './prepareLiveVideoEl';

/**
 * Shared LiveKit media lifecycle.
 *
 * A single wrapper owns connect / publish / subscribe / active-speaker /
 * cleanup so host, spectator, co-host, battle and call flows do not each
 * re-implement the media lifecycle. Product-specific composition (which tile a
 * remote track attaches to, battle panes, etc.) is layered on top by the live
 * feature via the exposed callbacks.
 *
 * Local preview and publish share the same getUserMedia tracks; the room is
 * configured with `stopLocalTrackOnUnpublish: false` so unpublish/disconnect
 * never blacks out the local preview.
 */

export interface RemoteTrackEvent {
  track: RemoteTrack;
  participant: RemoteParticipant;
  publication?: RemoteTrackPublication;
}

export interface LiveKitSessionHandlers {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onReconnecting?: () => void;
  onReconnected?: () => void;
  onTrackSubscribed?: (event: RemoteTrackEvent) => void;
  onTrackUnsubscribed?: (event: RemoteTrackEvent) => void;
  onTrackPublished?: (publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
  onTrackMuted?: (publication: TrackPublication, participant: Participant) => void;
  onTrackUnmuted?: (publication: TrackPublication, participant: Participant) => void;
  onActiveSpeakers?: (identities: string[]) => void;
  onParticipantConnected?: (participant: RemoteParticipant) => void;
  onParticipantDisconnected?: (participant: RemoteParticipant) => void;
}

export { detachRemoteTrack, detachParticipantTracks } from './live/liveTrackCleanup';

export class LiveKitSession {
  private room: Room | null = null;
  private handlers: LiveKitSessionHandlers = {};
  /** Monotonic generation so overlapping connect() calls cannot win after a newer connect/disconnect. */
  private connectGeneration = 0;

  constructor(handlers: LiveKitSessionHandlers = {}) {
    this.handlers = handlers;
  }

  get connected(): boolean {
    return this.room?.state === ConnectionState.Connected;
  }

  get raw(): Room | null {
    return this.room;
  }

  async connect(url: string, token: string): Promise<void> {
    const generation = ++this.connectGeneration;
    // Tear down any prior room without bumping generation again (disconnect() would).
    const previous = this.room;
    this.room = null;
    if (previous) {
      previous.removeAllListeners();
      try {
        previous.disconnect();
      } catch {
        /* already disconnected */
      }
    }

    const room = new Room(getLiveRoomOptions());
    if (generation !== this.connectGeneration) {
      try {
        room.disconnect();
      } catch {
        /* superseded */
      }
      return;
    }
    this.room = room;

    room
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onTrackSubscribed?.({ track, participant, publication });
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (generation !== this.connectGeneration) return;
        detachRemoteTrack(track);
        this.handlers.onTrackUnsubscribed?.({ track, participant, publication });
      })
      .on(RoomEvent.ParticipantDisconnected, (p) => {
        if (generation !== this.connectGeneration) return;
        detachParticipantTracks(p);
        try {
          for (const pub of p.videoTrackPublications.values()) {
            if (pub.isSubscribed) pub.setSubscribed(false);
          }
        } catch {
          /* participant already gone */
        }
        this.handlers.onParticipantDisconnected?.(p);
      })
      .on(RoomEvent.TrackPublished, (publication, participant) => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onTrackPublished?.(publication, participant);
      })
      .on(RoomEvent.TrackMuted, (publication, participant) => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onTrackMuted?.(publication, participant);
      })
      .on(RoomEvent.TrackUnmuted, (publication, participant) => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onTrackUnmuted?.(publication, participant);
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onActiveSpeakers?.(speakers.map((s) => s.identity));
      })
      .on(RoomEvent.ParticipantConnected, (p) => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onParticipantConnected?.(p);
      })
      .on(RoomEvent.Reconnecting, () => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onReconnecting?.();
      })
      .on(RoomEvent.Reconnected, () => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onReconnected?.();
      })
      .on(RoomEvent.Disconnected, () => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onDisconnected?.();
      });

    await room.connect(url, token);
    if (generation !== this.connectGeneration) {
      try {
        room.removeAllListeners();
        room.disconnect();
      } catch {
        /* superseded */
      }
      if (this.room === room) this.room = null;
      return;
    }
    this.handlers.onConnected?.();
  }

  /**
   * Publish (or re-publish) the camera + mic tracks from a shared MediaStream.
   * Already-published live tracks are left untouched to avoid black flicker.
   */
  async publishFromStream(stream: MediaStream): Promise<void> {
    const room = this.room;
    if (!room || room.state !== ConnectionState.Connected) return;

    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    const wantVideoId = videoTrack?.readyState === 'live' ? videoTrack.id : null;
    const wantAudioId = audioTrack?.readyState === 'live' ? audioTrack.id : null;

    const pubs = [...room.localParticipant.trackPublications.values()];
    const pubVideo = pubs.find((p) => p.kind === 'video');
    const pubAudio = pubs.find((p) => p.kind === 'audio');
    const publishedVideoId = pubVideo?.track?.mediaStreamTrack?.id ?? null;
    const publishedAudioId = pubAudio?.track?.mediaStreamTrack?.id ?? null;

    if (
      publishedVideoId === wantVideoId &&
      publishedAudioId === wantAudioId &&
      wantVideoId &&
      (wantAudioId || !audioTrack)
    ) {
      return;
    }

    try {
      if (pubVideo?.track && publishedVideoId !== wantVideoId) {
        await room.localParticipant.unpublishTrack(pubVideo.track, false);
      }
      if (pubAudio?.track && publishedAudioId !== wantAudioId) {
        await room.localParticipant.unpublishTrack(pubAudio.track, false);
      }
      if (wantVideoId && videoTrack) {
        const publishPreset = getLiveMediaTierConfig().publishPreset;
        await room.localParticipant.publishTrack(new LocalVideoTrack(videoTrack), {
          name: 'camera',
          source: Track.Source.Camera,
          simulcast: true,
          videoEncoding: publishPreset.encoding,
          degradationPreference: 'balanced',
        });
      }
      if (wantAudioId && audioTrack) {
        await room.localParticipant.publishTrack(new LocalAudioTrack(audioTrack), {
          name: 'mic',
          source: Track.Source.Microphone,
        });
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error('LiveKit publish failed');
    }
  }

  /** Enable/disable the published microphone without unpublishing or stopping the track. */
  async setMicEnabled(enabled: boolean): Promise<void> {
    const room = this.room;
    if (!room) return;
    const pub =
      room.localParticipant.getTrackPublication(Track.Source.Microphone) ??
      room.localParticipant.getTrackPublicationByName('mic');
    const track = pub?.track;
    if (track && 'mute' in track) {
      if (enabled) await (track as LocalAudioTrack).unmute();
      else await (track as LocalAudioTrack).mute();
    }
  }

  /** Enable/disable the published camera without unpublishing or stopping the track. */
  async setCamEnabled(enabled: boolean): Promise<void> {
    const room = this.room;
    if (!room) return;
    const pub =
      room.localParticipant.getTrackPublication(Track.Source.Camera) ??
      room.localParticipant.getTrackPublicationByName('camera');
    const track = pub?.track;
    if (track && 'mute' in track) {
      if (enabled) await (track as LocalVideoTrack).unmute();
      else await (track as LocalVideoTrack).mute();
    }
  }

  /** Mute/unmute a remote participant's audio volume (co-host / battle tile mute). */
  setRemoteAudioVolume(identity: string, volume: number): void {
    const room = this.room;
    if (!room || !identity) return;
    const want = identity.trim().toLowerCase();
    const v = Math.max(0, Math.min(1, volume));
    for (const p of room.remoteParticipants.values()) {
      if (p.identity.trim().toLowerCase() !== want) continue;
      for (const pub of p.audioTrackPublications.values()) {
        const t = pub.track as { setVolume?: (n: number) => void } | null;
        t?.setVolume?.(v);
      }
    }
  }

  /**
   * Attach a remote (or local) camera track for `identity` onto `el`.
   * Returns false when no video publication is available yet.
   */
  attachVideoByIdentity(identity: string, el: HTMLVideoElement | null): boolean {
    const room = this.room;
    if (!room || !el || !identity) return false;
    const want = identity.trim().toLowerCase();
    const local = room.localParticipant;
    if (local.identity.trim().toLowerCase() === want) {
      const pub = [...local.trackPublications.values()].find((p) => p.kind === 'video' && p.track);
      if (!pub?.track) return false;
      pub.track.attach(el);
      prepareLiveVideoEl(el);
      void el.play().catch(() => {});
      return true;
    }
    for (const p of room.remoteParticipants.values()) {
      if (p.identity.trim().toLowerCase() !== want) continue;
      const pub = [...p.trackPublications.values()].find((p0) => p0.kind === 'video' && p0.track);
      if (!pub?.track) return false;
      pub.track.attach(el);
      prepareLiveVideoEl(el);
      void el.play().catch(() => {});
      return true;
    }
    return false;
  }

  /**
   * Spectator/lobby fallback: attach the first remote camera when identity
   * matching is late or the host publishes under a different identity string.
   */
  attachFirstRemoteVideo(el: HTMLVideoElement | null): boolean {
    const room = this.room;
    if (!room || !el) return false;
    for (const p of room.remoteParticipants.values()) {
      const pub = [...p.trackPublications.values()].find((p0) => p0.kind === 'video' && p0.track);
      if (!pub?.track) continue;
      pub.track.attach(el);
      prepareLiveVideoEl(el);
      void el.play().catch(() => {});
      return true;
    }
    return false;
  }

  disconnect(): void {
    this.connectGeneration += 1;
    const room = this.room;
    this.room = null;
    if (room) {
      room.removeAllListeners();
      try {
        room.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }
}

export { Track as LiveKitTrack };
