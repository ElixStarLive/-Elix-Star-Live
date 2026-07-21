import { useCallback, useEffect, useRef, useState } from "react";
import { websocket } from "../lib/websocket";
import {
  parseEngagementState,
  type EngagementFeatures,
  type EngagementMilestoneEvent,
  type EngagementPublicState,
} from "../lib/liveEngagement";

const TICK_MS = 18_000;

type Options = {
  enabled?: boolean;
  isHost?: boolean;
};

const emptyState = (): EngagementPublicState => ({
  roomId: "",
  features: {
    watchXp: true,
    streak: true,
    mystery: true,
    community: true,
    leaderboard: true,
    poll: true,
  },
  communityProgress: 0,
  communityStage: 0,
  mystery: null,
  poll: null,
  leaderboard: [],
  me: null,
  nextMilestoneMin: 5,
});

export function useLiveEngagement(options: Options = {}) {
  const { enabled = true, isHost = false } = options;
  const [state, setState] = useState<EngagementPublicState>(emptyState);
  const [milestoneFlash, setMilestoneFlash] = useState<EngagementMilestoneEvent | null>(null);
  const [stageFlash, setStageFlash] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const visibleRef = useRef(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  );
  const meRef = useRef<EngagementPublicState["me"]>(null);

  useEffect(() => {
    meRef.current = state.me;
  }, [state.me]);

  useEffect(() => {
    if (!enabled) return;
    const onSync = (data: unknown) => {
      const parsed = parseEngagementState(data);
      if (!parsed) return;
      setState((prev) => {
        // Room broadcasts omit `me`; keep last personal snapshot.
        if (!parsed.me && meRef.current) {
          return { ...parsed, me: meRef.current, nextMilestoneMin: prev.nextMilestoneMin };
        }
        return parsed;
      });
    };
    const onMilestone = (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const evt: EngagementMilestoneEvent = {
        userId: String(d.userId || ""),
        username: String(d.username || ""),
        milestones: Array.isArray(d.milestones)
          ? d.milestones.map((n) => Math.floor(Number(n) || 0))
          : [],
        title: String(d.title || ""),
        badge: String(d.badge || ""),
      };
      setMilestoneFlash(evt);
      window.setTimeout(() => setMilestoneFlash(null), 4000);
    };
    const onStage = (data: unknown) => {
      const stage =
        data && typeof data === "object"
          ? Math.floor(Number((data as Record<string, unknown>).stage) || 0)
          : 0;
      setStageFlash(stage);
      window.setTimeout(() => setStageFlash(null), 4000);
    };

    websocket.on("engagement_sync", onSync);
    websocket.on("engagement_milestone", onMilestone);
    websocket.on("engagement_stage_unlock", onStage);
    websocket.send("engagement_get_state", {});

    return () => {
      websocket.off("engagement_sync", onSync);
      websocket.off("engagement_milestone", onMilestone);
      websocket.off("engagement_stage_unlock", onStage);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const syncVisibility = () => {
      visibleRef.current = document.visibilityState === "visible";
    };
    const onHide = () => {
      visibleRef.current = false;
    };
    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("blur", onHide);
    window.addEventListener("focus", syncVisibility);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("blur", onHide);
      window.removeEventListener("focus", syncVisibility);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (!visibleRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (!websocket.isConnected()) return;
      websocket.send("engagement_watch_tick", {});
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  const startMystery = useCallback(
    (durationMin: 5 | 10 | 15, kind: "poll" | "trivia" = "poll") => {
      if (!isHost) return;
      websocket.send("engagement_mystery_start", { durationMin, kind });
    },
    [isHost],
  );

  const startPoll = useCallback(
    (question: string, options: string[], kind: "poll" | "trivia" = "poll") => {
      if (!isHost) return;
      websocket.send("engagement_poll_set", { question, options, kind });
    },
    [isHost],
  );

  const votePoll = useCallback((optionIndex: number) => {
    websocket.send("engagement_poll_vote", { optionIndex });
  }, []);

  const setFeatures = useCallback(
    (features: Partial<EngagementFeatures>) => {
      if (!isHost) return;
      websocket.send("engagement_features_set", { features });
    },
    [isHost],
  );

  return {
    state,
    nowMs,
    milestoneFlash,
    stageFlash,
    startMystery,
    startPoll,
    votePoll,
    setFeatures,
  };
}
