/** @vitest-environment jsdom */

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InlineLiveViewer from "./InlineLiveViewer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mocked = vi.hoisted(() => {
  const apiLiveToken = vi.fn();
  const connectLiveKitOnly = vi.fn();
  const wsConnect = vi.fn();
  const wsDisconnectIfOwner = vi.fn();
  const roomUnbind = vi.fn();
  const cohostUnbind = vi.fn();
  const battleUnbind = vi.fn();
  return {
    apiLiveToken,
    connectLiveKitOnly,
    wsConnect,
    wsDisconnectIfOwner,
    roomUnbind,
    cohostUnbind,
    battleUnbind,
  };
});

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../../lib/api", () => ({
  getLiveKitUrl: () => "wss://lk.test",
}));

vi.mock("../../../lib/liveKitSession", () => ({
  LiveKitTrack: { Kind: { Video: "video" } },
}));

vi.mock("../../../store/useAuthStore", () => ({
  useAuthStore: {
    getState: () => ({ session: { access_token: "auth-token" } }),
  },
}));

vi.mock("../../../lib/websocket", () => ({
  websocket: {
    connect: (...args: unknown[]) => mocked.wsConnect(...args),
    disconnectIfOwner: (...args: unknown[]) => mocked.wsDisconnectIfOwner(...args),
  },
}));

vi.mock("../../../lib/live", () => {
  class MockLiveRoomLifecycle {
    liveKit: { connected: boolean; disconnect: () => void } | null = null;
    async connectLiveKitOnly(...args: unknown[]) {
      return mocked.connectLiveKitOnly(...args);
    }
    async publishFromStream() {}
    async disconnect() {}
  }
  return {
    apiLiveToken: (...args: unknown[]) => mocked.apiLiveToken(...args),
    LiveRoomLifecycle: MockLiveRoomLifecycle,
  };
});

vi.mock("../ws/bindLiveRoomWs", () => ({
  bindLiveRoomWs: () => mocked.roomUnbind,
}));

vi.mock("../ws/bindLiveCohostWs", () => ({
  bindLiveCohostWs: () => mocked.cohostUnbind,
}));

vi.mock("../ws/bindLiveBattleWs", () => ({
  bindLiveBattleWs: () => mocked.battleUnbind,
}));

vi.mock("../../../lib/prepareLiveVideoEl", () => ({
  prepareLiveVideoEl: () => {},
  LIVE_WEBRTC_VIDEO_CLASS: "",
  LIVE_VIDEO_TRANSPARENT_POSTER:
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
}));

vi.mock("../cohost/cohostStageGeometry", () => ({
  FOR_YOU_COHOST_STAGE_TOP: "0px",
  LIVE_COHOST_STAGE_HEIGHT: "100%",
}));

vi.mock("lucide-react", () => ({
  Radio: () => null,
}));

describe("InlineLiveViewer connection ownership", () => {
  let el: HTMLDivElement;
  let root: Root;

  const render = async (props: {
    streamKey: string;
    isActive: boolean;
    hostUserId?: string;
  }) => {
    await act(async () => {
      root.render(
        <InlineLiveViewer
          streamKey={props.streamKey}
          isActive={props.isActive}
          hostUserId={props.hostUserId}
          creatorName="Creator"
        />,
      );
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mocked.apiLiveToken.mockReset();
    mocked.connectLiveKitOnly.mockReset();
    mocked.wsConnect.mockReset();
    mocked.wsDisconnectIfOwner.mockReset();
    mocked.roomUnbind.mockReset();
    mocked.cohostUnbind.mockReset();
    mocked.battleUnbind.mockReset();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    el.remove();
    vi.useRealTimers();
  });

  it("timeout before LiveKit resolves does not mark attempt stale", async () => {
    mocked.apiLiveToken.mockResolvedValue({
      creds: { token: "lk-token", url: "wss://lk.test" },
      error: null,
    });
    const staleSession = { raw: { remoteParticipants: new Map() }, disconnect: vi.fn() };
    const d = deferred<{ error: string | null; session: typeof staleSession | null }>();
    mocked.connectLiveKitOnly.mockReturnValue(d.promise);

    await render({ streamKey: "A", isActive: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10050);
    });
    await act(async () => {
      d.resolve({ error: null, session: staleSession });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocked.wsConnect).toHaveBeenCalledTimes(1);
    expect(staleSession.disconnect).toHaveBeenCalledTimes(0);
    expect(mocked.roomUnbind).toHaveBeenCalledTimes(0);
    expect(mocked.cohostUnbind).toHaveBeenCalledTimes(0);
    expect(mocked.battleUnbind).toHaveBeenCalledTimes(0);
  });

  it("unmount during token request prevents any connect", async () => {
    const tok = deferred<{ creds: { token: string; url: string } | null; error: string | null }>();
    mocked.apiLiveToken.mockReturnValue(tok.promise);
    mocked.connectLiveKitOnly.mockResolvedValue({
      error: null,
      session: { raw: { remoteParticipants: new Map() }, disconnect: vi.fn() },
    });

    await render({ streamKey: "A", isActive: true });
    await act(async () => {
      root.unmount();
    });
    await act(async () => {
      tok.resolve({ creds: { token: "lk-token", url: "wss://lk.test" }, error: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocked.connectLiveKitOnly).not.toHaveBeenCalled();
    expect(mocked.wsConnect).not.toHaveBeenCalled();
  });

  it("scroll A to B rejects stale A and only connects B", async () => {
    mocked.apiLiveToken.mockResolvedValue({
      creds: { token: "lk-token", url: "wss://lk.test" },
      error: null,
    });
    const sA = { raw: { remoteParticipants: new Map() }, disconnect: vi.fn() };
    const sB = { raw: { remoteParticipants: new Map() }, disconnect: vi.fn() };
    const dA = deferred<{ error: string | null; session: typeof sA | null }>();
    const dB = deferred<{ error: string | null; session: typeof sB | null }>();
    mocked.connectLiveKitOnly.mockReturnValueOnce(dA.promise).mockReturnValueOnce(dB.promise);

    await render({ streamKey: "A", isActive: true });
    await render({ streamKey: "B", isActive: true });

    await act(async () => {
      dA.resolve({ error: null, session: sA });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      dB.resolve({ error: null, session: sB });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sA.disconnect).toHaveBeenCalledTimes(1);
    expect(mocked.wsConnect).toHaveBeenCalledTimes(1);
    expect(mocked.wsConnect).toHaveBeenCalledWith(
      "B",
      "auth-token",
      expect.objectContaining({ ownerId: expect.any(String) }),
    );
  });

  it("A resolving after B connection cannot tear down B session", async () => {
    mocked.apiLiveToken.mockResolvedValue({
      creds: { token: "lk-token", url: "wss://lk.test" },
      error: null,
    });
    const sA = { raw: { remoteParticipants: new Map() }, disconnect: vi.fn() };
    const sB = { raw: { remoteParticipants: new Map() }, disconnect: vi.fn() };
    const dA = deferred<{ error: string | null; session: typeof sA | null }>();
    const dB = deferred<{ error: string | null; session: typeof sB | null }>();
    mocked.connectLiveKitOnly.mockReturnValueOnce(dA.promise).mockReturnValueOnce(dB.promise);

    await render({ streamKey: "A", isActive: true });
    await render({ streamKey: "B", isActive: true });

    await act(async () => {
      dB.resolve({ error: null, session: sB });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      dA.resolve({ error: null, session: sA });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocked.wsConnect).toHaveBeenCalledTimes(1);
    expect(sA.disconnect).toHaveBeenCalledTimes(1);
    expect(sB.disconnect).toHaveBeenCalledTimes(0);
  });

  it("stale attempt is invalidated before commit work", async () => {
    mocked.apiLiveToken.mockResolvedValue({
      creds: { token: "lk-token", url: "wss://lk.test" },
      error: null,
    });
    const staleSession = { raw: { remoteParticipants: new Map() }, disconnect: vi.fn() };
    const d = deferred<{ error: string | null; session: typeof staleSession | null }>();
    mocked.connectLiveKitOnly.mockReturnValue(d.promise);

    await render({ streamKey: "A", isActive: true });
    await render({ streamKey: "A", isActive: false });
    await act(async () => {
      d.resolve({ error: null, session: staleSession });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(staleSession.disconnect).toHaveBeenCalledTimes(1);
    expect(mocked.wsConnect).not.toHaveBeenCalled();
  });

  it("inactive card never starts token/livekit/websocket connect", async () => {
    mocked.apiLiveToken.mockResolvedValue({
      creds: { token: "lk-token", url: "wss://lk.test" },
      error: null,
    });

    await render({ streamKey: "A", isActive: false });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocked.apiLiveToken).not.toHaveBeenCalled();
    expect(mocked.connectLiveKitOnly).not.toHaveBeenCalled();
    expect(mocked.wsConnect).not.toHaveBeenCalled();
  });
});

