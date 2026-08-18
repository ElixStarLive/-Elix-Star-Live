/**
 * Publish authority on an open LiveKit connection.
 *
 * A co-host is seated and released without ever reconnecting, so the client's
 * own publish permission arrives as a permission change on the live room. Three
 * answers have to stay distinguishable: granted, refused, and not stated. Only
 * a refusal may stand a publisher down, and a refusal must not be recoverable
 * from anything the client holds locally.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

type Listener = (...args: unknown[]) => void;

class FakeParticipant {
  permissions: { canPublish: boolean } | undefined;
  trackPublications = new Map<string, unknown>();
  constructor(
    public identity: string,
    permissions?: { canPublish: boolean },
  ) {
    this.permissions = permissions;
  }
}

class FakeRoom {
  static instances: FakeRoom[] = [];
  state = 'disconnected';
  localParticipant = new FakeParticipant('lk_user_a');
  remoteParticipants = new Map<string, FakeParticipant>();
  listeners = new Map<string, Listener[]>();
  connectCalls = 0;
  disconnectCalls = 0;
  removeAllCalls = 0;

  constructor() {
    FakeRoom.instances.push(this);
  }

  on(event: string, cb: Listener) {
    const list = this.listeners.get(event) ?? [];
    list.push(cb);
    this.listeners.set(event, list);
    return this;
  }

  removeAllListeners() {
    this.removeAllCalls += 1;
    this.listeners.clear();
  }

  async connect() {
    this.connectCalls += 1;
    this.state = 'connected';
  }

  disconnect() {
    this.disconnectCalls += 1;
    this.state = 'disconnected';
  }

  emit(event: string, ...args: unknown[]) {
    for (const cb of this.listeners.get(event) ?? []) cb(...args);
  }

  countListeners(event: string) {
    return (this.listeners.get(event) ?? []).length;
  }
}

vi.mock('livekit-client', () => ({
  Room: FakeRoom,
  RoomEvent: {
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    TrackPublished: 'trackPublished',
    TrackMuted: 'trackMuted',
    TrackUnmuted: 'trackUnmuted',
    ActiveSpeakersChanged: 'activeSpeakersChanged',
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    ParticipantPermissionsChanged: 'participantPermissionsChanged',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    Disconnected: 'disconnected',
  },
  ConnectionState: { Connected: 'connected', Disconnected: 'disconnected' },
  LocalVideoTrack: class {},
  LocalAudioTrack: class {},
  Track: { Source: { Camera: 'camera', Microphone: 'microphone' } },
}));

vi.mock('./live/liveMediaProfile', () => ({
  getLiveRoomOptions: () => ({}),
  getLiveMediaTierConfig: () => ({ publishPreset: { encoding: {} } }),
}));

const { LiveKitSession } = await import('./liveKitSession');

const URL_ = 'wss://livekit.test';
const TOKEN = 'signed.token.jwt';

beforeEach(() => {
  FakeRoom.instances = [];
});

describe('LiveKit publish permission on an open connection', () => {
  it('reports the granted permission the server put in the connection', async () => {
    const seen: (boolean | null)[] = [];
    const session = new LiveKitSession({
      onLocalPublishPermissionChanged: (v) => seen.push(v),
    });
    const room = () => FakeRoom.instances[0];
    await session.connect(URL_, TOKEN);
    room().localParticipant.permissions = { canPublish: true };
    room().emit('participantPermissionsChanged', undefined, room().localParticipant);

    expect(seen.at(-1)).toBe(true);
    expect(session.publishPermission).toBe(true);
  });

  it('reports a revoked permission as refused, not as unknown', async () => {
    const seen: (boolean | null)[] = [];
    const session = new LiveKitSession({
      onLocalPublishPermissionChanged: (v) => seen.push(v),
    });
    await session.connect(URL_, TOKEN);
    const room = FakeRoom.instances[0];
    room.localParticipant.permissions = { canPublish: true };
    room.emit('participantPermissionsChanged', undefined, room.localParticipant);
    expect(seen.at(-1)).toBe(true);

    // Host removes the seat: the server drops canPublish on this same session.
    room.localParticipant.permissions = { canPublish: false };
    room.emit('participantPermissionsChanged', undefined, room.localParticipant);

    expect(seen.at(-1)).toBe(false);
    expect(session.publishPermission).toBe(false);
    // Revocation is not a disconnect — the viewer keeps watching.
    expect(session.connected).toBe(true);
    expect(room.disconnectCalls).toBe(0);
  });

  it('reports "not stated" as null so it cannot be read as refused', async () => {
    const seen: (boolean | null)[] = [];
    const session = new LiveKitSession({
      onLocalPublishPermissionChanged: (v) => seen.push(v),
    });
    await session.connect(URL_, TOKEN);

    // The room carries no permission block at all.
    expect(seen.at(-1)).toBe(null);
    expect(session.publishPermission).toBe(null);
  });

  it('ignores permission changes belonging to another participant', async () => {
    const seen: (boolean | null)[] = [];
    const session = new LiveKitSession({
      onLocalPublishPermissionChanged: (v) => seen.push(v),
    });
    await session.connect(URL_, TOKEN);
    const room = FakeRoom.instances[0];
    room.localParticipant.permissions = { canPublish: false };
    seen.length = 0;

    const other = new FakeParticipant('lk_user_b', { canPublish: true });
    room.emit('participantPermissionsChanged', undefined, other);

    expect(seen).toEqual([]);
    expect(session.publishPermission).toBe(false);
  });

  it('binds one listener per event and does not multiply them across reconnects', async () => {
    const session = new LiveKitSession({});
    await session.connect(URL_, TOKEN);
    const first = FakeRoom.instances[0];
    expect(first.countListeners('participantPermissionsChanged')).toBe(1);
    expect(first.countListeners('activeSpeakersChanged')).toBe(1);

    // A retry replaces the room: the old one is unbound and closed, so its
    // handlers cannot keep answering for the new session.
    await session.connect(URL_, TOKEN);
    const second = FakeRoom.instances[1];
    expect(FakeRoom.instances).toHaveLength(2);
    expect(first.removeAllCalls).toBe(1);
    expect(first.disconnectCalls).toBe(1);
    expect(first.countListeners('participantPermissionsChanged')).toBe(0);
    expect(second.countListeners('participantPermissionsChanged')).toBe(1);

    session.disconnect();
    expect(second.removeAllCalls).toBe(1);
    expect(second.disconnectCalls).toBe(1);
  });

  it('drops a superseded room instead of leaving it connected', async () => {
    const session = new LiveKitSession({});
    const first = session.connect(URL_, TOKEN);
    session.disconnect();
    await first;

    const room = FakeRoom.instances[0];
    expect(room.disconnectCalls).toBeGreaterThan(0);
    expect(session.raw).toBe(null);
  });
});
