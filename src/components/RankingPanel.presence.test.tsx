/** @vitest-environment jsdom */

/**
 * "Creators live right now" has to still be true a minute after the panel opened.
 *
 * LIVE Popular is opened from inside a live, so its connection owns a live room.
 * Presence used to be delivered only to feed connections, which meant this list
 * was frozen at the snapshot taken when the panel opened: a creator who ended
 * stayed in a list whose own subtitle claims they are on air.
 *
 * These tests drive the real hook, so they fail if the panel goes back to a
 * one-shot fetch or if it starts trusting an empty presence set before the server
 * has answered.
 */

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mocked = vi.hoisted(() => ({
  /** The panel's own snapshot: who to list, with names and viewer counts. */
  panelStreams: vi.fn(),
  /** The presence hook's snapshot: who the server says is on air. */
  presenceStreams: vi.fn(),
  presenceHandlers: {
    onStreamStarted: undefined as ((d: Record<string, unknown>) => void) | undefined,
    onStreamEnded: undefined as ((d: Record<string, unknown>) => void) | undefined,
  },
  connections: 0,
}));

vi.mock("../lib/live", () => ({
  apiLiveStreams: (...args: unknown[]) => mocked.panelStreams(...args),
}));

vi.mock("../lib/live/liveApi", () => ({
  apiLiveStreams: (...args: unknown[]) => mocked.presenceStreams(...args),
}));

vi.mock("../lib/live/liveFeedPresence", () => ({
  connectLiveFeedPresence: (
    _token: string,
    handlers: {
      onStreamStarted?: (d: Record<string, unknown>) => void;
      onStreamEnded?: (d: Record<string, unknown>) => void;
    },
  ) => {
    mocked.connections += 1;
    mocked.presenceHandlers.onStreamStarted = handlers.onStreamStarted;
    mocked.presenceHandlers.onStreamEnded = handlers.onStreamEnded;
    return () => {
      mocked.presenceHandlers.onStreamStarted = undefined;
      mocked.presenceHandlers.onStreamEnded = undefined;
    };
  },
}));

vi.mock("../features/live/engagement/liveEngagementApi", () => ({
  apiLiveRankingsWeekly: async () => ({ data: { rankings: [] } }),
  apiLiveRankingsDaily: async () => ({ data: { rankings: [] } }),
}));

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ session: { access_token: "token" } }),
}));

vi.mock("../lib/toast", () => ({ showToast: vi.fn() }));

import { RankingPanel } from "./RankingPanel";

let container: HTMLDivElement;
let root: Root;

/** Names currently listed under LIVE Popular. */
function listed(): string[] {
  return [...container.querySelectorAll("h4")].map((el) => el.textContent ?? "");
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mocked.panelStreams.mockReset();
  mocked.presenceStreams.mockReset();
  mocked.presenceHandlers.onStreamStarted = undefined;
  mocked.presenceHandlers.onStreamEnded = undefined;
  mocked.connections = 0;

  mocked.panelStreams.mockResolvedValue({
    streams: [
      {
        user_id: "creator-ada",
        stream_key: "room-ada",
        display_name: "Ada",
        viewer_count: 40,
      },
      {
        user_id: "creator-bo",
        stream_key: "room-bo",
        display_name: "Bo",
        viewer_count: 10,
      },
    ],
    error: null,
  });
  mocked.presenceStreams.mockResolvedValue({
    streams: [
      { hostUserId: "creator-ada", stream_key: "room-ada" },
      { hostUserId: "creator-bo", stream_key: "room-bo" },
    ],
    error: null,
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

async function openLiveTab(): Promise<void> {
  await act(async () => {
    root.render(<RankingPanel onClose={() => {}} initialTab="live" />);
  });
  await flush();
}

describe("LIVE Popular while the panel stays open", () => {
  it("lists the creators the server has on air", async () => {
    await openLiveTab();

    expect(listed()).toEqual(["Ada", "Bo"]);
  });

  it("drops a creator who ends, without reopening or refetching", async () => {
    await openLiveTab();
    const snapshots = mocked.panelStreams.mock.calls.length;

    await act(async () => {
      mocked.presenceHandlers.onStreamEnded?.({
        stream_key: "room-ada",
        host_user_id: "creator-ada",
      });
    });

    expect(listed()).toEqual(["Bo"]);
    expect(mocked.panelStreams.mock.calls.length).toBe(snapshots);
    expect(mocked.connections).toBe(1);
  });

  it("keeps the other creators when one ends, and restores a creator who starts again", async () => {
    await openLiveTab();

    await act(async () => {
      mocked.presenceHandlers.onStreamEnded?.({
        stream_key: "room-bo",
        host_user_id: "creator-bo",
      });
    });
    expect(listed()).toEqual(["Ada"]);

    await act(async () => {
      mocked.presenceHandlers.onStreamStarted?.({
        user_id: "creator-bo",
        stream_key: "room-bo",
      });
    });

    expect(listed()).toEqual(["Ada", "Bo"]);
  });

  it("does not drop a creator because another creator's room ended", async () => {
    await openLiveTab();

    // Someone else's room name, and no creator named: nothing here is that live.
    await act(async () => {
      mocked.presenceHandlers.onStreamEnded?.({ stream_key: "room-cy" });
    });

    expect(listed()).toEqual(["Ada", "Bo"]);
  });

  it("shows the snapshot rather than an empty list while presence is unknown", async () => {
    // The panel's list arrives; the server has not yet said who is on air.
    let releasePresence: (value: unknown) => void = () => {};
    mocked.presenceStreams.mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePresence = resolve;
        }),
    );

    await openLiveTab();
    expect(listed()).toEqual(["Ada", "Bo"]);

    await act(async () => {
      releasePresence({
        streams: [{ hostUserId: "creator-ada", stream_key: "room-ada" }],
        error: null,
      });
      await Promise.resolve();
    });
    await flush();

    // Only once the server has answered does an absence mean "ended".
    expect(listed()).toEqual(["Ada"]);
  });

  it("keeps listing a live the server cannot name", async () => {
    mocked.panelStreams.mockResolvedValue({
      streams: [{ display_name: "Cy", viewer_count: 5 }],
      error: null,
    });
    mocked.presenceStreams.mockResolvedValue({ streams: [], error: null });

    await openLiveTab();

    // No creator id and no room: the row cannot be checked against presence, so it
    // is left as the snapshot gave it rather than removed on a guess.
    expect(listed()).toEqual(["Cy"]);
  });
});
