/** @vitest-environment jsdom */

/**
 * The "is live now — tap to watch" banner offers a tap through to `/watch/:room`.
 * It used to sit out its dismiss timer even after the server announced that live
 * had ended, so the tap led to a room nobody could join.
 */

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mocked = vi.hoisted(() => {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  return {
    listeners,
    navigate: vi.fn(),
    emit(event: string, data: unknown) {
      for (const fn of listeners.get(event) ?? []) fn(data);
    },
  };
});

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocked.navigate,
  useLocation: () => ({ pathname: "/feed", state: null }),
}));

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      user: { id: "me", username: "me" },
      session: { access_token: "token" },
    }),
}));

vi.mock("../store/useSettingsStore", () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ liveNotifications: true }),
}));

vi.mock("../lib/websocket", () => ({
  websocket: {
    on: (event: string, fn: (data: unknown) => void) => {
      const set = mocked.listeners.get(event) ?? new Set();
      set.add(fn);
      mocked.listeners.set(event, set);
    },
    off: (event: string, fn: (data: unknown) => void) => {
      mocked.listeners.get(event)?.delete(fn);
    },
  },
}));

vi.mock("./StoryGoldRingAvatar", () => ({
  StoryGoldRingAvatar: () => <span data-testid="avatar" />,
}));

vi.mock("../features/feed/feedApi", () => ({
  apiFetchProfileById: vi.fn(async () => ({ body: null })),
}));

vi.mock("../lib/live/liveApi", () => ({
  apiLiveStreams: vi.fn(async () => ({ streams: [], error: null })),
  apiLiveToken: vi.fn(async () => ({ creds: null, error: "no" })),
}));

vi.mock("../lib/toast", () => ({ showToast: vi.fn() }));

vi.mock("../features/live/battle/liveBattleInviteHandshake", () => ({
  runBattleInviteAccept: vi.fn(),
  runBattleInviteDecline: vi.fn(),
}));

vi.mock("../features/live/cohost/liveCohostActions", () => ({
  cohostInviteAccept: vi.fn(),
  cohostInviteDecline: vi.fn(),
}));

import { LiveNotifyBanner } from "./LiveNotifyBanner";

let container: HTMLDivElement;
let root: Root;

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function raiseStartedBanner(): Promise<void> {
  await act(async () => {
    root.render(<LiveNotifyBanner />);
  });
  await act(async () => {
    mocked.emit("stream_started", {
      stream_key: "room-a",
      user_id: "creator-a",
      display_name: "Alpha",
    });
  });
  await flush();
}

beforeEach(() => {
  mocked.listeners.clear();
  mocked.navigate.mockReset();
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

describe("LiveNotifyBanner started banner", () => {
  it("shows a creator who just went live", async () => {
    await raiseStartedBanner();
    expect(container.textContent).toContain("is live now");
    expect(container.textContent).toContain("Alpha");
  });

  it("retires the banner when the server announces that live ended", async () => {
    await raiseStartedBanner();

    await act(async () => {
      mocked.emit("stream_ended", {
        stream_key: "room-a",
        host_user_id: "creator-a",
      });
    });
    await flush();

    expect(container.textContent).toBe("");
  });

  it("retires by creator id when the ended room name differs", async () => {
    await raiseStartedBanner();

    await act(async () => {
      mocked.emit("stream_ended", {
        stream_key: "some-other-room-name",
        host_user_id: "creator-a",
      });
    });
    await flush();

    expect(container.textContent).toBe("");
  });

  it("keeps the banner when a different live ends", async () => {
    await raiseStartedBanner();

    await act(async () => {
      mocked.emit("stream_ended", {
        stream_key: "room-b",
        host_user_id: "creator-b",
      });
    });
    await flush();

    expect(container.textContent).toContain("is live now");
  });
});
