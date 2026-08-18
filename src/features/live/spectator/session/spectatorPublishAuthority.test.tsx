/** @vitest-environment jsdom */

/**
 * Who decides that this viewer may publish.
 *
 * The seat lives on the server and reaches this client twice: once as the signed
 * token it joined with, and afterwards as the permission LiveKit states on that
 * same connection. The second one is the current answer, so a released seat has
 * to take publishing away here too — the token it arrived with may not keep the
 * client authorised for the rest of the session. A viewer whose publish request
 * is refused still has to land in the room as a spectator.
 */

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveKitSessionHandlers } from '../../../../lib/liveKitSession';

type ConnectContext = { publish?: boolean } | undefined;

class FakeSession {
  publishPermission: boolean | null = null;
  raw = { state: 'connected' };
  disconnect = vi.fn();
}

/**
 * Only the lifecycle that actually connected matters: the hook holds it in a
 * ref, and React re-evaluates that initialiser on every render, so counting
 * constructed objects would say nothing about connections.
 */
const connections: { lifecycle: FakeLifecycle; context: ConnectContext }[] = [];

class FakeLifecycle {
  handlers: LiveKitSessionHandlers | null = null;
  session = new FakeSession();

  get liveKit() {
    return this.session;
  }

  async connectLiveKitOnly(
    _creds: { url: string; token: string },
    handlers: LiveKitSessionHandlers,
    context?: ConnectContext,
  ) {
    this.handlers = handlers;
    connections.push({ lifecycle: this, context });
    return { error: null, session: this.session };
  }

  async publishFromStream() {}
}

const tokenRequests: boolean[] = [];
let publishTokenAllowed = true;

vi.mock('../../../../lib/live', () => ({
  LiveRoomLifecycle: FakeLifecycle,
  apiLiveToken: async (_room: string, publish: boolean) => {
    tokenRequests.push(publish);
    if (publish && !publishTokenAllowed) {
      return { creds: null, error: 'HTTP 403 forbidden' };
    }
    return { creds: { token: 'signed.token.jwt', url: 'wss://livekit.test' }, error: null };
  },
}));

vi.mock('../../../../lib/api', () => ({
  getLiveKitUrl: () => 'wss://livekit.test',
}));

const toasts: string[] = [];
vi.mock('../../../../lib/toast', () => ({
  showToast: (msg: string) => {
    toasts.push(msg);
  },
}));

const { useSpectatorLiveSession } = await import('./useSpectatorLiveSession');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Snapshot = { connected: boolean; canPublish: boolean; joinError: string | null };
let snapshot: Snapshot = { connected: false, canPublish: false, joinError: null };

function Probe({ publish }: { publish: boolean }) {
  const handlersRef = useRef<LiveKitSessionHandlers>({});
  const session = useSpectatorLiveSession({
    enabled: true,
    roomId: 'room-1',
    publish,
    liveKitHandlersRef: handlersRef,
  });
  snapshot = {
    connected: session.connected,
    canPublish: session.canPublish,
    joinError: session.joinError,
  };
  return null;
}

let container: HTMLDivElement;
let root: Root;

async function render(publish: boolean) {
  await act(async () => {
    root.render(<Probe publish={publish} />);
  });
}

/** Deliver the permission the server states on the open connection. */
async function statePermission(value: boolean | null) {
  const live = connections.at(-1);
  if (!live) throw new Error('nothing connected to state a permission on');
  live.lifecycle.session.publishPermission = value;
  await act(async () => {
    live.lifecycle.handlers?.onLocalPublishPermissionChanged?.(value);
  });
}

beforeEach(() => {
  connections.length = 0;
  tokenRequests.length = 0;
  toasts.length = 0;
  publishTokenAllowed = true;
  snapshot = { connected: false, canPublish: false, joinError: null };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('spectator publish authority', () => {
  it('joins as a subscriber and never claims publish for itself', async () => {
    await render(false);

    expect(tokenRequests).toEqual([false]);
    expect(snapshot.connected).toBe(true);
    expect(snapshot.canPublish).toBe(false);

    await statePermission(null);
    expect(snapshot.canPublish).toBe(false);
  });

  it('publishes on the server-signed token before LiveKit states a permission', async () => {
    await render(true);

    expect(tokenRequests).toEqual([true]);
    expect(snapshot.canPublish).toBe(true);

    // "Not stated" is not a refusal, so the signed grant still answers.
    await statePermission(null);
    expect(snapshot.canPublish).toBe(true);
  });

  it('loses publish when the server revokes it mid-session', async () => {
    await render(true);
    await statePermission(true);
    expect(snapshot.canPublish).toBe(true);

    await statePermission(false);

    expect(snapshot.canPublish).toBe(false);
    // Losing the seat is not losing the live.
    expect(snapshot.connected).toBe(true);
    expect(connections).toHaveLength(1);
    expect(connections[0].lifecycle.session.disconnect).not.toHaveBeenCalled();
  });

  it('cannot recover a revoked seat from the token it joined with', async () => {
    await render(true);
    await statePermission(false);
    expect(snapshot.canPublish).toBe(false);

    // Any further permission traffic must not resurrect the old grant.
    await statePermission(false);
    expect(snapshot.canPublish).toBe(false);
  });

  it('keeps one connection when the seat changes mid-session', async () => {
    await render(false);
    expect(connections).toHaveLength(1);
    expect(connections[0].context?.publish).toBe(false);

    // Seat granted while watching: a permission change, not a reconnect.
    await render(true);
    await statePermission(true);

    expect(connections).toHaveLength(1);
    expect(tokenRequests).toEqual([false]);
    expect(snapshot.canPublish).toBe(true);
  });

  it('still joins as a spectator when the server refuses a publish token', async () => {
    publishTokenAllowed = false;
    await render(true);

    expect(tokenRequests).toEqual([true, false]);
    expect(snapshot.connected).toBe(true);
    expect(snapshot.joinError).toBe(null);
    expect(snapshot.canPublish).toBe(false);
    expect(toasts).toContain('Host approval required before you can co-host');
  });
});
