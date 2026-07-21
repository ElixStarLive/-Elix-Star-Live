export type EngagementFeatures = {
  watchXp: boolean;
  streak: boolean;
  mystery: boolean;
  community: boolean;
  leaderboard: boolean;
  poll: boolean;
};

export type EngagementUser = {
  userId: string;
  username: string;
  avatarUrl: string;
  watchSeconds: number;
  streakSeconds: number;
  engagementScore: number;
  claimedMilestones: number[];
  sessionXp: number;
  title: string;
  badge: string;
};

export type EngagementPoll = {
  id: string;
  question: string;
  options: string[];
  votes: number[];
  votedUserIds: string[];
  endsAt: number | null;
  kind: "poll" | "trivia";
};

export type EngagementMystery = {
  endsAt: number;
  durationMin: number;
  kind: "poll" | "trivia";
  triggered: boolean;
};

export type EngagementLeaderRow = {
  userId: string;
  username: string;
  avatarUrl: string;
  score: number;
  watchSeconds: number;
  title: string;
  badge: string;
};

export type EngagementPublicState = {
  roomId: string;
  features: EngagementFeatures;
  communityProgress: number;
  communityStage: number;
  mystery: EngagementMystery | null;
  poll: EngagementPoll | null;
  leaderboard: EngagementLeaderRow[];
  me: EngagementUser | null;
  nextMilestoneMin: number | null;
};

export type EngagementMilestoneEvent = {
  userId: string;
  username: string;
  milestones: number[];
  title: string;
  badge: string;
};

const DEFAULT_FEATURES: EngagementFeatures = {
  watchXp: true,
  streak: true,
  mystery: true,
  community: true,
  leaderboard: true,
  poll: true,
};

export function parseEngagementState(data: unknown): EngagementPublicState | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const featuresRaw = (d.features && typeof d.features === "object"
    ? d.features
    : {}) as Record<string, unknown>;
  const features: EngagementFeatures = {
    watchXp: featuresRaw.watchXp !== false,
    streak: featuresRaw.streak !== false,
    mystery: featuresRaw.mystery !== false,
    community: featuresRaw.community !== false,
    leaderboard: featuresRaw.leaderboard !== false,
    poll: featuresRaw.poll !== false,
  };

  const meRaw = d.me && typeof d.me === "object" ? (d.me as Record<string, unknown>) : null;
  const me: EngagementUser | null = meRaw
    ? {
        userId: String(meRaw.userId || ""),
        username: String(meRaw.username || "User"),
        avatarUrl: String(meRaw.avatarUrl || ""),
        watchSeconds: Math.max(0, Math.floor(Number(meRaw.watchSeconds) || 0)),
        streakSeconds: Math.max(0, Math.floor(Number(meRaw.streakSeconds) || 0)),
        engagementScore: Math.max(0, Math.floor(Number(meRaw.engagementScore) || 0)),
        claimedMilestones: Array.isArray(meRaw.claimedMilestones)
          ? meRaw.claimedMilestones.map((n) => Math.floor(Number(n) || 0))
          : [],
        sessionXp: Math.max(0, Math.floor(Number(meRaw.sessionXp) || 0)),
        title: String(meRaw.title || ""),
        badge: String(meRaw.badge || ""),
      }
    : null;

  let mystery: EngagementMystery | null = null;
  if (d.mystery && typeof d.mystery === "object") {
    const m = d.mystery as Record<string, unknown>;
    mystery = {
      endsAt: Math.floor(Number(m.endsAt) || 0),
      durationMin: Math.floor(Number(m.durationMin) || 5),
      kind: m.kind === "trivia" ? "trivia" : "poll",
      triggered: !!m.triggered,
    };
  }

  let poll: EngagementPoll | null = null;
  if (d.poll && typeof d.poll === "object") {
    const p = d.poll as Record<string, unknown>;
    const options = Array.isArray(p.options) ? p.options.map((o) => String(o)) : [];
    const votes = Array.isArray(p.votes)
      ? p.votes.map((v) => Math.max(0, Math.floor(Number(v) || 0)))
      : options.map(() => 0);
    poll = {
      id: String(p.id || ""),
      question: String(p.question || ""),
      options,
      votes,
      votedUserIds: Array.isArray(p.votedUserIds)
        ? p.votedUserIds.map((id) => String(id))
        : [],
      endsAt: p.endsAt == null ? null : Math.floor(Number(p.endsAt) || 0),
      kind: p.kind === "trivia" ? "trivia" : "poll",
    };
  }

  const leaderboard: EngagementLeaderRow[] = Array.isArray(d.leaderboard)
    ? d.leaderboard.map((row) => {
        const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        return {
          userId: String(r.userId || ""),
          username: String(r.username || "User"),
          avatarUrl: String(r.avatarUrl || ""),
          score: Math.max(0, Math.floor(Number(r.score) || 0)),
          watchSeconds: Math.max(0, Math.floor(Number(r.watchSeconds) || 0)),
          title: String(r.title || ""),
          badge: String(r.badge || ""),
        };
      })
    : [];

  return {
    roomId: String(d.roomId || ""),
    features: { ...DEFAULT_FEATURES, ...features },
    communityProgress: Math.min(100, Math.max(0, Number(d.communityProgress) || 0)),
    communityStage: Math.max(0, Math.floor(Number(d.communityStage) || 0)),
    mystery,
    poll,
    leaderboard,
    me,
    nextMilestoneMin:
      d.nextMilestoneMin == null || d.nextMilestoneMin === ""
        ? null
        : Math.floor(Number(d.nextMilestoneMin) || 0),
  };
}

export function formatWatchClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function mysteryRemainingMs(mystery: EngagementMystery | null, now = Date.now()): number {
  if (!mystery || mystery.triggered) return 0;
  return Math.max(0, mystery.endsAt - now);
}
