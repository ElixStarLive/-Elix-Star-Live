/** @vitest-environment jsdom */

/**
 * A screen that stays open must keep telling the truth about who is live.
 *
 * These are the cases the old one-shot fetch got wrong: a creator who ended kept
 * their ring, a creator who started was invisible until reopen, and a snapshot
 * that failed or arrived late could contradict an end the server had announced.
 */

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mocked = vi.hoisted(() => ({
  apiLiveStreams: vi.fn(),
  presenceHandlers: {
    onStreamStarted: undefined as ((d: Record<string, unknown>) => void) | undefined,
    onStreamEnded: undefined as ((d: Record<string, unknown>) => void) | undefined,
  },
  disposed: 0,
}));

vi.mock("../lib/live/liveApi", () => ({
  apiLiveStreams: (...args: unknown[]) => mocked.apiLiveStreams(...args),
}));

vi.mock("../lib/live/liveFeedPresence", () => ({
  connectLiveFeedPresence: (
    _token: string,
    handlers: {
      onStreamStarted?: (d: Record<string, unknown>) => void;
      onStreamEnded?: (d: Record<string, unknown>) => void;
    },
  ) => {
    mocked.presenceHandlers.onStreamStarted = handlers.onStreamStarted;
    mocked.presenceHandlers.onStreamEnded = handlers.onStreamEnded;
    return () => {
      mocked.disposed += 1;
      mocked.presenceHandlers.onStreamStarted = undefined;
      mocked.presenceHandlers.onStreamEnded = undefined;
    };
  },
}));

import { useLivePresence } from "./useLivePresence";

let container: HTMLDivElement;
let root: Root;

/** Renders the hook's answer as text so a test reads what a ring would show. */
function Probe({ enabled = true }: { enabled?: boolean }) {
  const { creatorIds, streamKeys, ready } = useLivePresence("token", enabled);
  return (
    <div>
      <span id="creators">{[...creatorIds].sort().join(",")}</span>
      <span id="keys">{[...streamKeys].sort().join(",")}</span>
      <span id="ready">{ready ? "yes" : "no"}</span>
    </div>
  );
}

function creators(): string {
  return container.querySelector("#creators")?.textContent ?? "";
}

function keys(): string {
  return container.querySelector("#keys")?.textContent ?? "";
}

function ready(): string {
  return container.querySelector("#ready")?.textContent ?? "";
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(enabled = true): Promise<void> {
  await act(async () => {
    root.render(<Probe enabled={enabled} />);
  });
  await flush();
}

beforeEach(() => {
  mocked.apiLiveStreams.mockReset();
  mocked.disposed = 0;
  mocked.presenceHandlers.onStreamStarted = undefined;
  mocked.presenceHandlers.onStreamEnded = undefined;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

describe("useLivePresence", () => {
  it("starts from the server snapshot", async () => {
    mocked.apiLiveStreams.mockResolvedValue({
      streams: [
        { hostUserId: "creator-a", stream_key: "room-a" },
        { userId: "creator-b", room_id: "room-b" },
      ],
      error: null,
    });

    await mount();

    expect(creators()).toBe("creator-a,creator-b");
    expect(keys()).toBe("room-a,room-b");
  });

  it("drops a creator the server says has ended, without reopening the screen", async () => {
    mocked.apiLiveStreams.mockResolvedValue({
      streams: [
        { hostUserId: "creator-a", stream_key: "room-a" },
        { hostUserId: "creator-b", stream_key: "room-b" },
      ],
      error: null,
    });
    await mount();
    expect(creators()).toBe("creator-a,creator-b");

    await act(async () => {
      mocked.presenceHandlers.onStreamEnded?.({
        stream_key: "room-a",
        host_user_id: "creator-a",
      });
    });

    expect(creators()).toBe("creator-b");
    expect(keys()).toBe("room-b");
  });

  it("ends only the named live when a room name is the only identity given", async () => {
    mocked.apiLiveStreams.mockResolvedValue({
      streams: [
        { hostUserId: "creator-a", stream_key: "room-a" },
        { hostUserId: "creator-b", stream_key: "room-b" },
      ],
      error: null,
    });
    await mount();

    await act(async () => {
      mocked.presenceHandlers.onStreamEnded?.({ stream_key: "room-b" });
    });

    expect(creators()).toBe("creator-a");
    expect(keys()).toBe("room-a");
  });

  it("shows a creator who goes live while the screen is open", async () => {
    mocked.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    await mount();
    expect(creators()).toBe("");

    await act(async () => {
      mocked.presenceHandlers.onStreamStarted?.({
        user_id: "creator-c",
        stream_key: "room-c",
      });
    });

    expect(creators()).toBe("creator-c");
    expect(keys()).toBe("room-c");
    expect(mocked.apiLiveStreams).toHaveBeenCalledTimes(1);
  });

  it("keeps the last authoritative answer when the snapshot request fails", async () => {
    mocked.apiLiveStreams.mockResolvedValueOnce({
      streams: [{ hostUserId: "creator-a", stream_key: "room-a" }],
      error: null,
    });
    await mount();
    expect(creators()).toBe("creator-a");

    // A failure is not a statement that nobody is live.
    mocked.apiLiveStreams.mockResolvedValue({ streams: [], error: "offline" });
    await act(async () => {
      mocked.presenceHandlers.onStreamStarted?.({
        user_id: "creator-d",
        stream_key: "room-d",
      });
    });
    await flush();

    expect(creators()).toBe("creator-a,creator-d");
  });

  it("does not let a snapshot taken before an end resurrect the ended creator", async () => {
    let release: (value: unknown) => void = () => {};
    mocked.apiLiveStreams.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    await act(async () => {
      root.render(<Probe />);
    });

    // The end arrives while the first snapshot is still in flight.
    await act(async () => {
      mocked.presenceHandlers.onStreamEnded?.({
        stream_key: "room-a",
        host_user_id: "creator-a",
      });
    });

    await act(async () => {
      release({
        streams: [{ hostUserId: "creator-a", stream_key: "room-a" }],
        error: null,
      });
      await Promise.resolve();
    });
    await flush();

    expect(creators()).toBe("");
  });

  it("does not claim to know who is live until the server answers", async () => {
    let release: (value: unknown) => void = () => {};
    mocked.apiLiveStreams.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    await act(async () => {
      root.render(<Probe />);
    });

    // An empty set here means "not known yet". A surface that filters its own rows
    // by presence would otherwise blank every row for the first frame.
    expect(creators()).toBe("");
    expect(ready()).toBe("no");

    await act(async () => {
      release({ streams: [{ hostUserId: "creator-a", stream_key: "room-a" }], error: null });
      await Promise.resolve();
    });
    await flush();

    expect(ready()).toBe("yes");
    expect(creators()).toBe("creator-a");
  });

  it("stays unknown while the snapshot is failing, then trusts an event", async () => {
    mocked.apiLiveStreams.mockResolvedValue({ streams: [], error: "offline" });
    await mount();

    expect(ready()).toBe("no");

    await act(async () => {
      mocked.presenceHandlers.onStreamStarted?.({
        user_id: "creator-e",
        stream_key: "room-e",
      });
    });

    expect(ready()).toBe("yes");
    expect(creators()).toBe("creator-e");
  });

  it("holds nothing and subscribes to nothing while disabled", async () => {
    mocked.apiLiveStreams.mockResolvedValue({
      streams: [{ hostUserId: "creator-a", stream_key: "room-a" }],
      error: null,
    });

    await mount(false);

    expect(creators()).toBe("");
    expect(ready()).toBe("no");
    expect(mocked.apiLiveStreams).not.toHaveBeenCalled();
    expect(mocked.presenceHandlers.onStreamEnded).toBeUndefined();
  });
});
