/**
 * Livestream engagement engine (MVP) — Valkey/mem room state.
 * Digital rewards only (XP, titles, badges). No coins or cash value.
 */
import {
  valkeyDel,
  valkeyGet,
  valkeySet,
  valkeySetNx,
  isValkeyConfigured,
} from "../lib/valkey";
import { logger } from "../lib/logger";

export const MILESTONES_MIN = [5, 10, 20, 30, 60] as const;
export const MILESTONE_BONUS_XP: Record<number, number> = {
  5: 5,
  10: 10,
  20: 20,
  30: 30,
  60: 60,
};
export const MILESTONE_TITLES: Record<number, string> = {
  5: "Warm-up Watcher",
  10: "Focused Fan",
  20: "Live Regular",
  30: "Streak Star",
  60: "Marathon Viewer",
};

const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const TICK_SECONDS = 20;
const XP_PER_MINUTE = 1;
const COMMUNITY_WATCH_PER_TICK = 0.4;
const COMMUNITY_LIKE = 0.8;
const COMMUNITY_COMMENT = 1.2;
const COMMUNITY_POLL = 2;
const SCORE_WATCH_PER_TICK = 2;
const SCORE_LIKE = 1;
const SCORE_COMMENT = 2;
const SCORE_POLL = 5;
const LIKE_CAP_PER_MIN = 3;
const COMMENT_CAP_PER_MIN = 5;

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

export type EngagementRoomState = {
  roomId: string;
  features: EngagementFeatures;
  communityProgress: number;
  communityStage: number;
  mystery: EngagementMystery | null;
  poll: EngagementPoll | null;
  users: Record<string, EngagementUser>;
};

export type EngagementPublicState = {
  roomId: string;
  features: EngagementFeatures;
  communityProgress: number;
  communityStage: number;
  mystery: EngagementMystery | null;
  poll: EngagementPoll | null;
  leaderboard: Array<{
    userId: string;
    username: string;
    avatarUrl: string;
    score: number;
    watchSeconds: number;
    title: string;
    badge: string;
  }>;
  me: EngagementUser | null;
  nextMilestoneMin: number | null;
};

const DEFAULT_FEATURES: EngagementFeatures = {
  watchXp: true,
  streak: true,
  mystery: true,
  community: true,
  leaderboard: true,
  poll: true,
};

const memRooms = new Map<string, EngagementRoomState>();
const memActiveRoom = new Map<string, string>();
const memTickClaims = new Set<string>();
const memActionClaims = new Set<string>();

function roomKey(roomId: string): string {
  return `engage:room:${roomId}`;
}

function activeKey(userId: string): string {
  return `engage:activeRoom:${userId}`;
}

function tickKey(roomId: string, userId: string, bucket: number): string {
  return `engage:tick:${roomId}:${userId}:${bucket}`;
}

function actionKey(
  roomId: string,
  userId: string,
  type: string,
  window: number,
): string {
  return `engage:action:${roomId}:${userId}:${type}:${window}`;
}

function emptyRoom(roomId: string): EngagementRoomState {
  return {
    roomId,
    features: { ...DEFAULT_FEATURES },
    communityProgress: 0,
    communityStage: 0,
    mystery: null,
    poll: null,
    users: {},
  };
}

function ensureUser(
  state: EngagementRoomState,
  userId: string,
  username: string,
  avatarUrl: string,
): EngagementUser {
  const existing = state.users[userId];
  if (existing) {
    existing.username = username || existing.username;
    existing.avatarUrl = avatarUrl || existing.avatarUrl;
    return existing;
  }
  const created: EngagementUser = {
    userId,
    username: username || "User",
    avatarUrl: avatarUrl || "",
    watchSeconds: 0,
    streakSeconds: 0,
    engagementScore: 0,
    claimedMilestones: [],
    sessionXp: 0,
    title: "",
    badge: "",
  };
  state.users[userId] = created;
  return created;
}

async function loadRoom(roomId: string): Promise<EngagementRoomState> {
  if (isValkeyConfigured()) {
    const raw = await valkeyGet(roomKey(roomId));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as EngagementRoomState;
        if (parsed && parsed.roomId === roomId) return parsed;
      } catch {
        /* fall through */
      }
    }
  }
  return memRooms.get(roomId) ?? emptyRoom(roomId);
}

async function saveRoom(state: EngagementRoomState): Promise<void> {
  memRooms.set(state.roomId, state);
  if (isValkeyConfigured()) {
    await valkeySet(roomKey(state.roomId), JSON.stringify(state), ROOM_TTL_MS);
  }
}

async function claimNx(key: string, ttlMs: number): Promise<boolean> {
  if (isValkeyConfigured()) {
    return valkeySetNx(key, "1", ttlMs);
  }
  if (memTickClaims.has(key) || memActionClaims.has(key)) return false;
  const set = key.includes(":tick:") ? memTickClaims : memActionClaims;
  set.add(key);
  setTimeout(() => set.delete(key), ttlMs).unref?.();
  return true;
}

async function getActiveRoom(userId: string): Promise<string | null> {
  if (isValkeyConfigured()) {
    return valkeyGet(activeKey(userId));
  }
  return memActiveRoom.get(userId) ?? null;
}

async function setActiveRoom(userId: string, roomId: string): Promise<void> {
  memActiveRoom.set(userId, roomId);
  if (isValkeyConfigured()) {
    await valkeySet(activeKey(userId), roomId, ROOM_TTL_MS);
  }
}

export async function clearEngagementActiveRoom(
  userId: string,
  roomId?: string,
): Promise<void> {
  const current = await getActiveRoom(userId);
  if (roomId && current && current !== roomId) return;
  memActiveRoom.delete(userId);
  if (isValkeyConfigured()) {
    await valkeyDel(activeKey(userId));
  }
}

function nextMilestoneMin(watchSeconds: number, claimed: number[]): number | null {
  const mins = Math.floor(watchSeconds / 60);
  for (const m of MILESTONES_MIN) {
    if (mins < m && !claimed.includes(m)) return m;
    if (mins >= m && !claimed.includes(m)) return m;
  }
  return null;
}

function buildLeaderboard(state: EngagementRoomState) {
  return Object.values(state.users)
    .sort((a, b) => b.engagementScore - a.engagementScore || b.watchSeconds - a.watchSeconds)
    .slice(0, 20)
    .map((u) => ({
      userId: u.userId,
      username: u.username,
      avatarUrl: u.avatarUrl,
      score: u.engagementScore,
      watchSeconds: u.watchSeconds,
      title: u.title,
      badge: u.badge,
    }));
}

export function toPublicEngagementState(
  state: EngagementRoomState,
  forUserId?: string | null,
): EngagementPublicState {
  const me = forUserId ? state.users[forUserId] ?? null : null;
  return {
    roomId: state.roomId,
    features: state.features,
    communityProgress: Math.min(100, Math.round(state.communityProgress * 10) / 10),
    communityStage: state.communityStage,
    mystery: state.mystery,
    poll: state.poll
      ? {
          ...state.poll,
          votedUserIds: forUserId
            ? state.poll.votedUserIds.filter((id) => id === forUserId)
            : [],
        }
      : null,
    leaderboard: state.features.leaderboard ? buildLeaderboard(state) : [],
    me,
    nextMilestoneMin: me
      ? nextMilestoneMin(me.watchSeconds, me.claimedMilestones)
      : null,
  };
}

export async function getEngagementPublicState(
  roomId: string,
  forUserId?: string | null,
): Promise<EngagementPublicState> {
  const state = await loadRoom(roomId);
  await maybeResolveMystery(state);
  await saveRoom(state);
  return toPublicEngagementState(state, forUserId);
}

async function bumpCommunity(
  state: EngagementRoomState,
  amount: number,
): Promise<{ stageUnlocked: boolean; stage: number }> {
  if (!state.features.community) return { stageUnlocked: false, stage: state.communityStage };
  const before = state.communityProgress;
  state.communityProgress = Math.min(100, before + amount);
  if (before < 100 && state.communityProgress >= 100) {
    state.communityStage += 1;
    state.communityProgress = 0;
    return { stageUnlocked: true, stage: state.communityStage };
  }
  return { stageUnlocked: false, stage: state.communityStage };
}

export type WatchTickResult = {
  ok: boolean;
  reason?: string;
  state: EngagementPublicState;
  milestonesReached: number[];
  xpAwarded: number;
  stageUnlocked: boolean;
  communityStage: number;
};

export async function claimWatchTick(input: {
  roomId: string;
  userId: string;
  username: string;
  avatarUrl: string;
}): Promise<WatchTickResult> {
  const { roomId, userId, username, avatarUrl } = input;
  const state = await loadRoom(roomId);

  if (!state.features.watchXp && !state.features.streak) {
    return {
      ok: false,
      reason: "disabled",
      state: toPublicEngagementState(state, userId),
      milestonesReached: [],
      xpAwarded: 0,
      stageUnlocked: false,
      communityStage: state.communityStage,
    };
  }

  const active = await getActiveRoom(userId);
  if (active && active !== roomId) {
    return {
      ok: false,
      reason: "other_room",
      state: toPublicEngagementState(state, userId),
      milestonesReached: [],
      xpAwarded: 0,
      stageUnlocked: false,
      communityStage: state.communityStage,
    };
  }
  if (!active) await setActiveRoom(userId, roomId);

  const bucket = Math.floor(Date.now() / (TICK_SECONDS * 1000));
  const claimed = await claimNx(tickKey(roomId, userId, bucket), TICK_SECONDS * 1000 + 2000);
  if (!claimed) {
    return {
      ok: false,
      reason: "rate",
      state: toPublicEngagementState(state, userId),
      milestonesReached: [],
      xpAwarded: 0,
      stageUnlocked: false,
      communityStage: state.communityStage,
    };
  }

  await maybeResolveMystery(state);

  const user = ensureUser(state, userId, username, avatarUrl);
  const prevMins = Math.floor(user.watchSeconds / 60);
  user.watchSeconds += TICK_SECONDS;
  if (state.features.streak) user.streakSeconds += TICK_SECONDS;
  user.engagementScore += SCORE_WATCH_PER_TICK;

  const newMins = Math.floor(user.watchSeconds / 60);
  let xpAwarded = 0;
  if (state.features.watchXp && newMins > prevMins) {
    xpAwarded = (newMins - prevMins) * XP_PER_MINUTE;
    user.sessionXp += xpAwarded;
  }

  const milestonesReached: number[] = [];
  for (const m of MILESTONES_MIN) {
    if (user.watchSeconds >= m * 60 && !user.claimedMilestones.includes(m)) {
      user.claimedMilestones.push(m);
      milestonesReached.push(m);
      const bonus = MILESTONE_BONUS_XP[m] || 0;
      if (bonus > 0 && state.features.watchXp) {
        xpAwarded += bonus;
        user.sessionXp += bonus;
      }
      user.title = MILESTONE_TITLES[m] || user.title;
      user.badge = `streak_${m}m`;
    }
  }

  const community = await bumpCommunity(state, COMMUNITY_WATCH_PER_TICK);
  await saveRoom(state);

  return {
    ok: true,
    state: toPublicEngagementState(state, userId),
    milestonesReached,
    xpAwarded,
    stageUnlocked: community.stageUnlocked,
    communityStage: community.stage,
  };
}

export async function recordEngagementAction(input: {
  roomId: string;
  userId: string;
  username: string;
  avatarUrl: string;
  type: "like" | "comment" | "poll";
}): Promise<{
  state: EngagementPublicState;
  stageUnlocked: boolean;
  communityStage: number;
}> {
  const { roomId, userId, username, avatarUrl, type } = input;
  const state = await loadRoom(roomId);
  const window = Math.floor(Date.now() / 60_000);
  const cap = type === "like" ? LIKE_CAP_PER_MIN : type === "comment" ? COMMENT_CAP_PER_MIN : 1;

  if (type !== "poll") {
    let allowed = false;
    for (let i = 0; i < cap; i++) {
      const ok = await claimNx(`${actionKey(roomId, userId, type, window)}:${i}`, 65_000);
      if (ok) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      return {
        state: toPublicEngagementState(state, userId),
        stageUnlocked: false,
        communityStage: state.communityStage,
      };
    }
  }

  const user = ensureUser(state, userId, username, avatarUrl);
  let communityAmt = 0;
  if (type === "like") {
    user.engagementScore += SCORE_LIKE;
    communityAmt = COMMUNITY_LIKE;
  } else if (type === "comment") {
    user.engagementScore += SCORE_COMMENT;
    communityAmt = COMMUNITY_COMMENT;
  } else {
    user.engagementScore += SCORE_POLL;
    communityAmt = COMMUNITY_POLL;
  }
  const community = await bumpCommunity(state, communityAmt);
  await saveRoom(state);
  return {
    state: toPublicEngagementState(state, userId),
    stageUnlocked: community.stageUnlocked,
    communityStage: community.stage,
  };
}

export async function setEngagementFeatures(
  roomId: string,
  features: Partial<EngagementFeatures>,
): Promise<EngagementPublicState> {
  const state = await loadRoom(roomId);
  state.features = { ...state.features, ...features };
  await saveRoom(state);
  return toPublicEngagementState(state);
}

export async function startMysteryCountdown(
  roomId: string,
  durationMin: 5 | 10 | 15,
  kind: "poll" | "trivia" = "poll",
): Promise<EngagementPublicState> {
  const state = await loadRoom(roomId);
  if (!state.features.mystery) return toPublicEngagementState(state);
  const mins = durationMin === 5 || durationMin === 10 || durationMin === 15 ? durationMin : 5;
  state.mystery = {
    endsAt: Date.now() + mins * 60_000,
    durationMin: mins,
    kind,
    triggered: false,
  };
  await saveRoom(state);
  return toPublicEngagementState(state);
}

function defaultMysteryPoll(kind: "poll" | "trivia"): EngagementPoll {
  if (kind === "trivia") {
    return {
      id: `trivia_${Date.now()}`,
      question: "Trivia: How long have you been watching?",
      options: ["Just joined", "A few minutes", "Over 10 minutes", "Over 30 minutes"],
      votes: [0, 0, 0, 0],
      votedUserIds: [],
      endsAt: Date.now() + 2 * 60_000,
      kind: "trivia",
    };
  }
  return {
    id: `poll_${Date.now()}`,
    question: "Mystery event: What should we do next?",
    options: ["Dance", "Sing", "Q&A", "Shoutouts"],
    votes: [0, 0, 0, 0],
    votedUserIds: [],
    endsAt: Date.now() + 2 * 60_000,
    kind: "poll",
  };
}

async function maybeResolveMystery(state: EngagementRoomState): Promise<boolean> {
  if (!state.mystery || state.mystery.triggered) return false;
  if (Date.now() < state.mystery.endsAt) return false;
  state.mystery.triggered = true;
  if (state.features.poll && !state.poll) {
    state.poll = defaultMysteryPoll(state.mystery.kind);
  }
  return true;
}

export async function endEngagementPoll(
  roomId: string,
): Promise<EngagementPublicState> {
  const state = await loadRoom(roomId);
  if (state.poll) {
    state.poll = {
      ...state.poll,
      endsAt: Date.now(),
    };
    await saveRoom(state);
  }
  return toPublicEngagementState(state);
}

export async function setEngagementPoll(
  roomId: string,
  question: string,
  options: string[],
  kind: "poll" | "trivia" = "poll",
  durationSec = 120,
): Promise<EngagementPublicState> {
  const state = await loadRoom(roomId);
  if (!state.features.poll) return toPublicEngagementState(state);
  const opts = options.map((o) => String(o).slice(0, 80)).filter(Boolean).slice(0, 4);
  if (opts.length < 2) return toPublicEngagementState(state);
  const q = String(question || "").trim().slice(0, 160) || "Quick poll";
  state.poll = {
    id: `poll_${Date.now()}`,
    question: q,
    options: opts,
    votes: opts.map(() => 0),
    votedUserIds: [],
    endsAt: Date.now() + Math.max(30, durationSec) * 1000,
    kind,
  };
  await saveRoom(state);
  return toPublicEngagementState(state);
}

export async function voteEngagementPoll(input: {
  roomId: string;
  userId: string;
  username: string;
  avatarUrl: string;
  optionIndex: number;
}): Promise<{
  ok: boolean;
  reason?: string;
  state: EngagementPublicState;
  stageUnlocked: boolean;
  communityStage: number;
}> {
  const { roomId, userId, username, avatarUrl, optionIndex } = input;
  const state = await loadRoom(roomId);
  await maybeResolveMystery(state);

  if (!state.poll || !state.features.poll) {
    await saveRoom(state);
    return {
      ok: false,
      reason: "no_poll",
      state: toPublicEngagementState(state, userId),
      stageUnlocked: false,
      communityStage: state.communityStage,
    };
  }
  if (state.poll.endsAt && Date.now() > state.poll.endsAt) {
    return {
      ok: false,
      reason: "ended",
      state: toPublicEngagementState(state, userId),
      stageUnlocked: false,
      communityStage: state.communityStage,
    };
  }
  if (state.poll.votedUserIds.includes(userId)) {
    return {
      ok: false,
      reason: "already_voted",
      state: toPublicEngagementState(state, userId),
      stageUnlocked: false,
      communityStage: state.communityStage,
    };
  }
  const idx = Math.floor(optionIndex);
  if (idx < 0 || idx >= state.poll.options.length) {
    return {
      ok: false,
      reason: "bad_option",
      state: toPublicEngagementState(state, userId),
      stageUnlocked: false,
      communityStage: state.communityStage,
    };
  }

  const voteNx = await claimNx(
    `engage:pollvote:${roomId}:${state.poll.id}:${userId}`,
    30 * 60_000,
  );
  if (!voteNx) {
    return {
      ok: false,
      reason: "already_voted",
      state: toPublicEngagementState(state, userId),
      stageUnlocked: false,
      communityStage: state.communityStage,
    };
  }

  state.poll.votes[idx] = (state.poll.votes[idx] || 0) + 1;
  state.poll.votedUserIds.push(userId);
  const user = ensureUser(state, userId, username, avatarUrl);
  user.engagementScore += SCORE_POLL;
  const community = await bumpCommunity(state, COMMUNITY_POLL);
  await saveRoom(state);

  return {
    ok: true,
    state: toPublicEngagementState(state, userId),
    stageUnlocked: community.stageUnlocked,
    communityStage: community.stage,
  };
}

export async function clearRoomEngagement(roomId: string): Promise<void> {
  memRooms.delete(roomId);
  if (isValkeyConfigured()) {
    await valkeyDel(roomKey(roomId));
  }
  logger.info({ roomId }, "engagement room cleared");
}
