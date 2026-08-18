/** @vitest-environment jsdom */

/**
 * Live subscription continuity.
 *
 * The host and spectator controllers bind their live WS handlers in one effect
 * whose lifetime must be exactly `roomId + userId`. When that effect re-ran
 * because React gave a handler a new identity, the socket unbound mid-stream and
 * the server read a host unbind as the host leaving, which ended the live for
 * everyone. That is why both bind effects carried an `exhaustive-deps`
 * suppression with an omitted handler list.
 *
 * These tests render real React against the real binders and the real websocket
 * singleton, so they prove the behaviour the suppression used to protect: state
 * churn does not tear the subscription down, and events still run the current
 * handler logic rather than the closures captured at bind time.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStableLiveHandlers } from './useStableLiveHandlers';
import { bindLiveRoomWs } from './bindLiveRoomWs';
import { bindLiveBattleWs } from './bindLiveBattleWs';
import { bindLiveCohostWs } from './bindLiveCohostWs';
import { websocket } from '../../../lib/websocket';

vi.mock('../../../store/useAuthStore', () => ({
  useAuthStore: {
    getState: () => ({ session: { access_token: 'jwt' } }),
  },
}));

const sockets: MockWebSocket[] = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: { code?: number }) => void) | null = null;
  sent: string[] = [];

  constructor(readonly url: string) {
    sockets.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({});
    });
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000 });
  }

  emit(event: string, data: unknown) {
    this.onmessage?.({
      data: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
    });
  }
}

(globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** What the effect did, in order — the ledger the assertions read. */
type Ledger = {
  binds: string[];
  unbinds: string[];
  /** Anything a real controller would treat as leaving: none may fire on churn. */
  leaves: string[];
  events: string[];
};

type Controls = {
  bumpUnrelated: () => void;
  setRole: (role: string) => void;
  setBattle: (battle: string | null) => void;
};

let controls: Controls;

/**
 * Mirrors the shape of the real bind effect: handlers rebuilt on every render,
 * frozen through useStableLiveHandlers, and one subscription keyed on room+user.
 */
function LiveSubscriber({ roomId, userId, ledger }: { roomId: string; userId: string; ledger: Ledger }) {
  const [unrelated, setUnrelated] = useState(0);
  const [role, setRole] = useState('spectator');
  const [battle, setBattle] = useState<string | null>(null);

  controls = {
    bumpUnrelated: () => setUnrelated((n) => n + 1),
    setRole,
    setBattle,
  };

  // Recreated on every render, exactly like the controllers' useCallbacks whose
  // identity churn used to re-run the effect.
  const onChatMessage = () => ledger.events.push(`chat:${unrelated}:${role}:${battle ?? 'none'}`);
  const onGiftSent = () => ledger.events.push(`gift:${unrelated}:${role}:${battle ?? 'none'}`);
  const onRoomState = () => ledger.events.push(`room_state:${role}`);
  const onScore = () => ledger.events.push(`score:${battle ?? 'none'}`);
  const onTick = () => ledger.events.push(`tick:${battle ?? 'none'}`);
  const onEnded = () => ledger.events.push(`battle_ended:${battle ?? 'none'}`);
  const onInviteAccepted = () => ledger.events.push(`cohost_accepted:${role}`);

  const handlers = useStableLiveHandlers({
    onChatMessage,
    onGiftSent,
    onRoomState,
    onScore,
    onTick,
    onEnded,
    onInviteAccepted,
  });

  useEffect(() => {
    if (!roomId || !userId) return;
    const {
      onChatMessage,
      onGiftSent,
      onRoomState,
      onScore,
      onTick,
      onEnded,
      onInviteAccepted,
    } = handlers;

    websocket.connect(roomId, 'jwt', { ownerId: `owner-${userId}` });
    const unbindRoom = bindLiveRoomWs({ onChatMessage, onGiftSent, onRoomState });
    const unbindBattle = bindLiveBattleWs({ onScore, onTick, onEnded });
    const unbindCohost = bindLiveCohostWs({ onInviteAccepted });
    ledger.binds.push(roomId);

    return () => {
      ledger.unbinds.push(roomId);
      unbindRoom();
      unbindBattle();
      unbindCohost();
    };
  }, [roomId, userId, handlers, ledger]);

  return null;
}

/**
 * The shape the controllers had before the handler bundle was frozen: the effect
 * depends on handler identities directly. Kept here so the assertions above are
 * known to be able to detect a mid-stream rebind rather than passing vacuously.
 */
function NaiveSubscriber({
  roomId,
  onChatMessage,
  ledger,
}: {
  roomId: string;
  onChatMessage: () => void;
  ledger: Ledger;
}) {
  useEffect(() => {
    websocket.connect(roomId, 'jwt', { ownerId: 'owner-naive' });
    const unbind = bindLiveRoomWs({ onChatMessage });
    ledger.binds.push(roomId);
    return () => {
      ledger.unbinds.push(roomId);
      unbind();
    };
  }, [roomId, onChatMessage, ledger]);

  return null;
}

let container: HTMLDivElement;
let root: Root;
let ledger: Ledger;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const mount = async (roomId: string, userId = 'u1') => {
  await act(async () => {
    root.render(<LiveSubscriber roomId={roomId} userId={userId} ledger={ledger} />);
  });
  await flush();
};

const lastSocket = () => sockets[sockets.length - 1];

const emit = async (event: string, data: unknown = {}) => {
  await act(async () => {
    lastSocket().emit(event, data);
  });
};

beforeEach(() => {
  sockets.length = 0;
  websocket.disconnect();
  ledger = { binds: [], unbinds: [], leaves: [], events: [] };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  websocket.disconnect();
});

describe('host live continuity across handler identity churn', () => {
  it('keeps one subscription while component state and handlers change', async () => {
    await mount('room-1');
    expect(ledger.binds).toEqual(['room-1']);
    expect(websocket.isConnected()).toBe(true);
    const socketAtBind = lastSocket();

    await act(async () => controls.bumpUnrelated());
    await act(async () => controls.bumpUnrelated());
    await act(async () => controls.setBattle('battle-9'));

    // The contract the suppression protected: no teardown, no re-bind, and the
    // same transport in the same room.
    expect(ledger.unbinds).toEqual([]);
    expect(ledger.binds).toEqual(['room-1']);
    expect(lastSocket()).toBe(socketAtBind);
    expect(sockets).toHaveLength(1);
    expect(websocket.isConnected()).toBe(true);
    expect(ledger.leaves).toEqual([]);
  });

  it('runs the latest handler logic, not the closures captured at bind time', async () => {
    await mount('room-1');

    await emit('chat_message');
    expect(ledger.events).toEqual(['chat:0:spectator:none']);

    await act(async () => controls.bumpUnrelated());
    await act(async () => controls.setBattle('battle-9'));
    await emit('chat_message');

    // A stale closure would have pushed chat:0:spectator:none a second time.
    expect(ledger.events).toEqual(['chat:0:spectator:none', 'chat:1:spectator:battle-9']);
    expect(ledger.unbinds).toEqual([]);
  });

  it('delivers each event exactly once after repeated re-renders', async () => {
    await mount('room-1');
    for (let i = 0; i < 5; i++) {
      await act(async () => controls.bumpUnrelated());
    }

    await emit('gift_sent');

    expect(ledger.events).toEqual(['gift:5:spectator:none']);
  });

  it('still tears down and rebinds when the room identity changes', async () => {
    await mount('room-1');
    await mount('room-2');

    expect(ledger.unbinds).toEqual(['room-1']);
    expect(ledger.binds).toEqual(['room-1', 'room-2']);

    await emit('chat_message');
    expect(ledger.events).toEqual(['chat:0:spectator:none']);
  });

  it('tears down when the signed-in user changes', async () => {
    await mount('room-1', 'u1');
    await mount('room-1', 'u2');

    expect(ledger.unbinds).toEqual(['room-1']);
    expect(ledger.binds).toEqual(['room-1', 'room-1']);
  });
});

describe('the assertions can detect a mid-stream rebind', () => {
  it('shows the old shape tearing the subscription down when a handler is recreated', async () => {
    const render = async () => {
      await act(async () => {
        // A fresh handler identity per render, which is what the component body
        // produced before the bundle was frozen.
        root.render(
          <NaiveSubscriber
            roomId="room-old"
            onChatMessage={() => ledger.events.push('chat')}
            ledger={ledger}
          />,
        );
      });
      await flush();
    };

    await render();
    expect(ledger.binds).toEqual(['room-old']);

    await render();

    // This is the failure the frozen bundle removes: one re-render unbinds the
    // live room, which the server reads as the host leaving.
    expect(ledger.unbinds).toEqual(['room-old']);
    expect(ledger.binds).toEqual(['room-old', 'room-old']);
  });
});

describe('spectator live continuity', () => {
  it('keeps watching through unrelated state changes without reconnecting', async () => {
    await mount('room-7');
    const socketAtBind = lastSocket();

    await act(async () => controls.bumpUnrelated());
    await emit('room_state');
    await act(async () => controls.bumpUnrelated());
    await emit('room_state');

    expect(ledger.unbinds).toEqual([]);
    expect(sockets).toHaveLength(1);
    expect(lastSocket()).toBe(socketAtBind);
    expect(websocket.isConnected()).toBe(true);
    expect(ledger.events).toEqual(['room_state:spectator', 'room_state:spectator']);
  });
});

describe('co-host transitions keep the same subscription', () => {
  it('survives spectator to co-host and back', async () => {
    await mount('room-3');
    const socketAtBind = lastSocket();

    await emit('cohost_invite_accepted');
    await act(async () => controls.setRole('cohost'));
    await emit('cohost_invite_accepted');
    await act(async () => controls.setRole('spectator'));
    await emit('cohost_invite_accepted');

    // Role is not part of the subscription's identity, so nothing rebinds — but
    // each event still sees the role that is current when it arrives.
    expect(ledger.unbinds).toEqual([]);
    expect(ledger.binds).toEqual(['room-3']);
    expect(lastSocket()).toBe(socketAtBind);
    expect(ledger.events).toEqual([
      'cohost_accepted:spectator',
      'cohost_accepted:cohost',
      'cohost_accepted:spectator',
    ]);
  });
});

describe('both live controllers use this subscription architecture', () => {
  const read = (relative: string) =>
    readFileSync(resolve(__dirname, relative), 'utf8').replace(/\r\n/g, '\n');
  const host = read('../host/useLiveHostController.tsx');
  const spectator = read('../spectator/useLiveSpectatorController.tsx');

  it('freezes the WS handler bundle in host and spectator', () => {
    for (const source of [host, spectator]) {
      expect(source).toContain("import { useStableLiveHandlers } from '../ws/useStableLiveHandlers'");
      expect(source).toContain('const liveWsHandlers = useStableLiveHandlers({');
      expect(source).toContain('} = liveWsHandlers;');
    }
  });

  it('keeps the bind effect keyed on room and user with only stable dependencies', () => {
    const anchor = 'Every dependency below is stable for the life of this room';
    // Anything that changes while the stream runs — battle state, seats, chat,
    // viewers — must not appear here, or the room unbinds mid-stream.
    const volatile = ['spectatorBattle', 'coHosts', 'messages', 'activeViewers', 'battleSlots'];

    for (const source of [host, spectator]) {
      const at = source.indexOf(anchor);
      expect(at).toBeGreaterThan(-1);
      const deps = source.slice(at, source.indexOf(']);', at) + 3);
      expect(deps).toContain('effectiveStreamId');
      expect(deps).toContain('user?.id');
      expect(deps).toContain('liveWsHandlers');
      for (const name of volatile) expect(deps).not.toContain(name);
    }
  });

  it('carries no exhaustive-deps suppression on either controller', () => {
    for (const source of [host, spectator]) {
      expect(source).not.toContain('react-hooks/exhaustive-deps');
    }
  });
});

describe('battle lifecycle keeps the same subscription', () => {
  it('runs invite, active, ticks, score and end on one binding', async () => {
    await mount('room-4');
    const socketAtBind = lastSocket();

    await act(async () => controls.setBattle('battle-1'));
    await emit('battle_tick', { timeLeft: 120 });
    await emit('battle_score');
    await act(async () => controls.setBattle('battle-1-active'));
    await emit('battle_tick', { timeLeft: 60 });
    await emit('battle_score');
    await emit('battle_ended');
    await act(async () => controls.setBattle(null));

    expect(ledger.unbinds).toEqual([]);
    expect(ledger.binds).toEqual(['room-4']);
    expect(lastSocket()).toBe(socketAtBind);
    expect(websocket.isConnected()).toBe(true);
    expect(ledger.events).toEqual([
      'tick:battle-1',
      'score:battle-1',
      'tick:battle-1-active',
      'score:battle-1-active',
      'battle_ended:battle-1-active',
    ]);
  });
});
