import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { RoyceCloseIcon } from '../../../components/royce';
import { showToast } from '../../../lib/toast';
import {
  prepareLiveVideoEl,
  LIVE_WEBRTC_VIDEO_CLASS,
  LIVE_VIDEO_TRANSPARENT_POSTER,
} from '../../../lib/prepareLiveVideoEl';
import {
  Send,
  Search,
  Heart,
  Share2,
  Gift,
  MoreVertical,
  Copy,
  UserPlus,
  Eye,
  MessageCircle,
  Flag,
  TrendingUp,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Coins,
  Lock,
  Crown,
  PlusCircle,
  Play,
  CloudFog,
  BarChart3,
  ArrowLeftRight,
} from 'lucide-react';
import { GiftPanel } from '../../../components/GiftPanel';
import { GiftGoalGallery } from '../../../components/GiftGoalGallery';
import { LiveGiftGoalBar } from '../../../components/LiveGiftGoalBar';
import { LiveEngagementOverlay } from '../../../components/LiveEngagementOverlay';
import { useLiveEngagement } from '../../../hooks/useLiveEngagement';
import { earnBattleEnergyQuiet } from '../../../components/BattleEnergyBoostControls';
import {
  EngagementDrawer,
  type EngagementPanel,
} from '../../../components/engagement/EngagementDrawer';
import { engagementFlags } from '../../../config/engagementFlags';
import { GiftUiItem, GIFT_COMBO_MAX, resolveGiftAssetUrl, preferPlayableGiftVideoUrl, fetchGiftsFromDatabase, pickGiftVideoUrl, formatGiftDisplayName } from '../../../lib/giftsCatalog';
import { appendCapped, LIVE_CHAT_MESSAGE_CAP, LIVE_GIFT_QUEUE_CAP } from '../../../lib/liveRuntimeCaps';
import { BattleVfxOverlays, GloveIcon, type BattleMistSide, type GloveBurst } from '../../../components/BattleVfxOverlays';
import { BattleTauntOverlays } from '../../../components/BattleTauntOverlays';
import {
  announceMvpName,
  createTauntBurst,
  maybeTauntLeadChange,
  playBattleTauntSound,
  type TauntBurst,
} from '../../../lib/battleTaunts';
import {
  addPersistedTestCoins,
  addTestGiftXp,
  debitTestCoinsForGift,
  displayBalanceAfterTestSpend,
  getPersistedTestCoinsBalance,
  getSpendableGiftBalance,
  getTestLevel,
  resolveGiftUiBalance,
  shouldUseTestCoinsForGifts,
  areTestCoinsEnabled,
} from '../../../lib/testCoins';
import { GiftOverlay } from '../../../components/GiftOverlay';
import GiftAnimationOverlay, { pushLocalGiftPill } from '../../../components/GiftAnimationOverlay';
import { LiveGiftFeedStack } from '../../../components/LiveGiftFeedStack';
import { ChatOverlay } from '../../../components/ChatOverlay';
import { AvatarRing } from '../../../components/AvatarRing';
import { LevelBadge } from '../../../components/LevelBadge';
import {
  BATTLE_MVP_ROW_EDGE_OFFSET_MM,
  SPECTATOR_MVP_PROFILE_RING_PX,
  LIVE_MVP_PROFILE_RING_PX,
  LIVE_BATTLE_VIDEO_HEIGHT,
  LIVE_BATTLE_CHAT_HEIGHT,
  LIVE_BATTLE_CHAT_SHIFT_Y,
  LIVE_TOP_AVATAR_RING_PX,
  LIVE_BOTTOM_ACTION_PADDING,
  LIVE_BOTTOM_ACTION_RESERVE,
} from '../../../lib/profileFrame';
import { useAuthStore } from '../../../store/useAuthStore';
import { useVideoStore } from '../../../store/useVideoStore';
import { getLiveKitUrl } from '../../../lib/api';
import {
  fetchAllSharePanelContacts,
  SHARE_PANEL_ACTION_DISC_PX,
  SHARE_PANEL_ACTION_ICON_PX,
  SHARE_PANEL_AVATAR_PX,
  SHARE_PANEL_ITEM_WIDTH_PX,
} from '../../../lib/sharePanelContacts';
import { openExternalLink } from '../../../lib/platform';
import ReportModal from '../../../components/ReportModal';
import PromotePanel from '../../../components/PromotePanel';
import { RankingPanel } from '../../../components/RankingPanel';
import { type LiveRankTab } from '../../../components/CyclingRankBadge';
import {
  LiveComboMissionDock,
  LiveHostProfileHeader,
  LiveJoinPill,
  LiveMarkedSubHeaderBar,
} from '../../../components/LiveMarkedTopUi';
import {
  LiveSideMissionStack,
} from '../../../components/LiveSideMissionStack';
import { websocket } from '../../../lib/websocket';
import { bindLiveBattleWs } from '../ws/bindLiveBattleWs';
import { bindLiveBattleInviteWs } from '../ws/bindLiveBattleInviteWs';
import { bindLiveRoomWs } from '../ws/bindLiveRoomWs';
import { bindLiveCohostWs } from '../ws/bindLiveCohostWs';
import { normalizeBattleGiftTarget } from '../../../lib/liveBattleGiftTarget';
import { parseLiveGiftGoal, type LiveGiftGoal } from '../../../lib/liveGiftGoal';
import { resolveUiAvatarUrl } from '../../../lib/royceAssets';
import { getMembershipStatus, purchaseMembership } from '../../../lib/iap';
import {
  apiLiveEngagementMissions,
  apiLiveGetDailyHearts,
  apiLiveEngagementProgress,
  apiLiveEngagementWallet,
  apiLiveProgressionMe,
  apiLiveRankingsWeekly,
} from '../engagement/liveEngagementApi';
import {
  apiFetchFollowingIds,
  apiFetchProfileById,
  apiToggleFollow,
} from '../../feed/feedApi';
import type { Room } from 'livekit-client';
import { RoomEvent, ConnectionState } from 'livekit-client';
import { apiLiveStreams, apiLiveToken, LiveRoomLifecycle } from '../../../lib/live';
import { giftSendErrorToast } from '../../../lib/giftSend';
import { sendLivePaidGift } from '../gifts/sendLiveGift';
import { useLiveGiftsCatalog } from '../hooks/useLiveGiftsCatalog';
import { useSpectatorLiveSession } from './session/useSpectatorLiveSession';
import type { LiveKitSessionHandlers } from '../../../lib/liveKitSession';
import {
  battleGetState,
  battleSpectatorVote,
} from '../battle/liveBattleActions';
import { applyBattleTickTime } from '../battle/liveBattleScore';
import { runBattleInviteAccept, runBattleInviteDecline } from '../battle/liveBattleInviteHandshake';
import { cohostRequestSend } from '../cohost/liveCohostActions';
import { liveChatSend, liveHeartSend } from '../chat/liveChatActions';
import { liveGiftSentWs } from '../gifts/liveGiftWsActions';
import { apiFetchWallet } from '../../wallet/walletApi';

function formatBattleScoreShort(coins: number) {
  const n = typeof coins === 'number' && Number.isFinite(coins) ? coins : 0;
  return n.toLocaleString();
}

/** Co-host tile gift totals — 15K / 100K / 500K style. */
function formatCohostGiftScore(coins: number) {
  const c = typeof coins === 'number' && Number.isFinite(coins) ? coins : 0;
  if (c >= 1_000_000) {
    const m = Math.round((c / 1_000_000) * 10) / 10;
    return `${Number.isInteger(m) ? Math.trunc(m) : m}M`;
  }
  if (c >= 1000) {
    const k = Math.round((c / 1000) * 10) / 10;
    return `${Number.isInteger(k) ? Math.trunc(k) : k}K`;
  }
  return String(c);
}

function AnimatedScore({ value, className = '', durationMs = 300, format }: { value: number; className?: string; durationMs?: number; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number>(0);
  const startRef = useRef(display);
  const targetRef = useRef(value);
  const fmt = format ?? ((n: number) => n.toLocaleString());
  useEffect(() => {
    if (durationMs <= 0) {
      cancelAnimationFrame(rafRef.current);
      setDisplay(value);
      targetRef.current = value;
      return;
    }
    if (value === display) { targetRef.current = value; return; }
    cancelAnimationFrame(rafRef.current);
    startRef.current = display;
    targetRef.current = value;
    const start = performance.now();
    const duration = durationMs;
    const from = startRef.current;
    const to = targetRef.current;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setDisplay(Math.round(from + (to - from) * ease));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);
  return <span className={className}>{fmt(display)}</span>;
}

function battleTeamLabelsFromPayload(data: Record<string, unknown>): { red: string; blue: string } {
  const h = typeof data.hostName === 'string' ? data.hostName.trim() : '';
  const o = typeof data.opponentName === 'string' ? data.opponentName.trim() : '';
  const p3 = typeof data.player3Name === 'string' ? data.player3Name.trim() : '';
  const p4 = typeof data.player4Name === 'string' ? data.player4Name.trim() : '';
  const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const red = p3 ? `${h || 'Host'} + ${p3}` : (h || 'Host');
  const blue = p4 ? `${o || 'Guest'} + ${p4}` : (o || 'Guest');
  return { red: cap(red, 24), blue: cap(blue, 24) };
}

type LiveMessage = {
  id: string;
  username: string;
  text: string;
  level?: number;
  isGift?: boolean;
  avatar?: string;
  isSystem?: boolean;
  membershipIcon?: string;
  isMod?: boolean;
  stickerUrl?: string;
};

function normalizeUserId(id: string | null | undefined): string {
  return typeof id === 'string' ? id.trim().toLowerCase() : '';
}

function sameUserId(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeUserId(a);
  const nb = normalizeUserId(b);
  return !!na && !!nb && na === nb;
}

export function useLiveSpectatorController() {
  const { streamId } = useParams<{ streamId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const effectiveStreamId = streamId || '';

  const {
    giftsCatalog,
    giftsCatalogRef,
    seenGiftTxnRef,
    setGiftsCatalog,
  } = useLiveGiftsCatalog();
  const [hostName, setHostName] = useState('Creator');
  const [hostAvatar, setHostAvatar] = useState('');
  const [hostLevel, setHostLevel] = useState(1);
  const [hostUserId, setHostUserId] = useState('');
  const hostUserIdRef = useRef('');
  const [streamIsLive, setStreamIsLive] = useState<boolean | null>(null);
  const [pageExiting, setPageExiting] = useState(false);
  const [streamRetryKey, setStreamRetryKey] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [activeLikes, setActiveLikes] = useState(0);

  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [coinBalance, setCoinBalance] = useState(0);
  /** Real wallet coins — never overwritten by test-coin display balance. */
  const walletCoinBalanceRef = useRef(0);
  const [starterCoinBalance, setStarterCoinBalance] = useState(0);
  const [promotionalCoinBalance, setPromotionalCoinBalance] = useState(0);
  const [giftSource, setGiftSource] = useState<
    "starter_coins" | "paid_coins" | "promotional_coins"
  >("paid_coins");

  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [giftGoal, setGiftGoal] = useState<LiveGiftGoal | null>(null);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showPromotePanel, setShowPromotePanel] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [engagementPanel, setEngagementPanel] = useState<EngagementPanel>('hub');
  const [showRankingPanel, setShowRankingPanel] = useState(false);
  const [rankingInitialTab, setRankingInitialTab] = useState<LiveRankTab>('weekly');
  const [showFanClub, setShowFanClub] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  // Point Multiplier Booster (glove) — the spectator's own active booster
  // (server-driven window), transient glove-send animations (fly to the weekly-
  // ranking corner when any spectator sends one), and transient "caught" popups.
  const [activeBooster, setActiveBooster] = useState<{ multiplier: number; expiresAt: number } | null>(null);
  const [boosterActivations, setBoosterActivations] = useState<{ id: string; userId: string; multiplier: number; username: string; expiresAt: number }[]>([]);
  const [boosterCatches, setBoosterCatches] = useState<{ id: string; multiplier: number; finalPoints: number; username: string }[]>([]);
  // Mist Fog booster — server-driven window that hides the battle score for
  // everyone EXCEPT the supported creator (supportedUserId). Purely visual.
  const [mistFog, setMistFog] = useState<{ supportedUserId: string; supportedSide: 'host' | 'opponent'; expiresAt: number } | null>(null);

  const [streamEndedReceived, setStreamEndedReceived] = useState(false);

  const {
    state: engagementState,
    nowMs: engagementNowMs,
    milestoneFlash,
    stageFlash,
    votePoll,
  } = useLiveEngagement({ enabled: streamIsLive === true, isHost: false });

  const [showTestCoinsModal, setShowTestCoinsModal] = useState(false);
  const [testCoinsStep, setTestCoinsStep] = useState<'password' | 'amount'>('password');
  const TEST_COINS_PWD_KEY = 'elix_test_coins_pwd_saved';
  const TEST_COINS_VERIFIED_KEY = 'elix_test_coins_verified';
  const [testCoinsPwd, setTestCoinsPwd] = useState('');
  const [testCoinsAmount, setTestCoinsAmount] = useState('');
  const [testCoinsError, setTestCoinsError] = useState('');
  const [testCoinsSavePwd, setTestCoinsSavePwd] = useState(!!(typeof localStorage !== 'undefined' && localStorage.getItem(TEST_COINS_PWD_KEY)));
  const testCoinsPwdRef = useRef<HTMLInputElement>(null);
  const TEST_COINS_HASH = '169a9bfc269089e14090ad2e393b17e945d798598c33993bcab5feef93e68508';
  const [currentGift, setCurrentGift] = useState<{video: string} | null>(null);
  const [giftQueue, setGiftQueue] = useState<{video: string}[]>([]);
  const [shareQuery, setShareQuery] = useState('');
  const [shareContacts, setShareContacts] = useState<{ id: string; name: string; avatar: string }[]>([]);
  const [lastSentGift, setLastSentGift] = useState<GiftUiItem | null>(null);
  const [comboCount, setComboCount] = useState(0);
  const [showComboButton, setShowComboButton] = useState(false);
  /** Recent combo gifts (icon + real xN), capped to last 3 — red-circle combo column. */
  const [comboStack, setComboStack] = useState<{ key: string; icon: string; count: number; gift: GiftUiItem }[]>([]);
  const [missionWatchMin, setMissionWatchMin] = useState(0);
  const [missionGiftsSent, setMissionGiftsSent] = useState(0);
  const [missionWatchGoal, setMissionWatchGoal] = useState(10);
  const [missionGiftsGoal, setMissionGiftsGoal] = useState(10);
  const [userXP, setUserXP] = useState(0);
  useEffect(() => {
    if (!user?.id) return;
    const loadMissions = () => {
      void apiLiveEngagementMissions()
        .then(({ data }) => {
          const missions = (data?.missions as Array<{
            metric_key?: string;
            progress?: number;
            goal_count?: number;
          }>) || [];
          const watch = missions.find((m) => m.metric_key === 'watch_minutes');
          const gifts = missions.find((m) => m.metric_key === 'gifts_sent');
          if (watch) {
            setMissionWatchMin(Math.max(0, Number(watch.progress) || 0));
            if (watch.goal_count) setMissionWatchGoal(Math.max(1, Number(watch.goal_count)));
          }
          if (gifts) {
            setMissionGiftsSent(Math.max(0, Number(gifts.progress) || 0));
            if (gifts.goal_count) setMissionGiftsGoal(Math.max(1, Number(gifts.goal_count)));
          }
        })
        .catch(() => {});
    };
    loadMissions();
    const refresh = window.setInterval(loadMissions, 60_000);
    return () => window.clearInterval(refresh);
  }, [user?.id]);
  useEffect(() => {
    const id = window.setInterval(() => {
      setMissionWatchMin((m) => Math.min(missionWatchGoal, m + 1));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [missionWatchGoal]);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetComboTimer = () => {
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    comboTimerRef.current = setTimeout(() => {
      setShowComboButton(false);
      setComboCount(0);
      setComboStack([]);
    }, 8000);
  };
  const pushComboStack = useCallback((gift: GiftUiItem, nextCount: number) => {
    const key = String(gift.id || gift.name || 'gift');
    setComboStack((prev) => {
      const without = prev.filter((i) => i.key !== key);
      return [...without, { key, icon: typeof gift.icon === 'string' ? gift.icon : '', count: nextCount, gift }].slice(-3);
    });
  }, []);

  const [spectatorCoHostRequestSent, setSpectatorCoHostRequestSent] = useState(false);
  const [showViewersPanel, setShowViewersPanel] = useState(false);
  const [viewersList, setViewersList] = useState<{ id: string; name: string; avatar: string; level?: number; points?: number }[]>([]);
  const actualViewersRef = useRef<Map<string, { name: string; avatar: string; level: number }>>(new Map());
  /** Gift coins — global (top bar #1–3), host team, opponent team (battle rows). */
  const mvpGiftScoresRef = useRef<Record<string, number>>({});
  const mvpGiftScoresHostRef = useRef<Record<string, number>>({});
  const mvpGiftScoresOpponentRef = useRef<Record<string, number>>({});
  /** Keep gifter identity for top MVP even when room list excludes self. */
  const mvpIdentityRef = useRef<Map<string, { name: string; avatar: string; level: number }>>(new Map());

  type MvpSlotRow = { id: string; name: string; avatar: string; level: number; points: number };
  const [mvpSlots, setMvpSlots] = useState<{
    global: MvpSlotRow[];
    host: MvpSlotRow[];
    opponent: MvpSlotRow[];
  }>({ global: [], host: [], opponent: [] });
  /** Host weekly ranking position for Diamond League capsule (null = unknown / not listed). */
  const [diamondLeagueRank, setDiamondLeagueRank] = useState<number | null>(null);
  const resolveCircleAvatar = useCallback(
    (avatar: string | null | undefined, name: string | null | undefined) =>
      resolveUiAvatarUrl(avatar, name, SPECTATOR_MVP_PROFILE_RING_PX * 2),
    [],
  );

  const syncMvpSlots = useCallback(() => {
    const hid = hostUserIdRef.current || hostUserId || effectiveStreamId || '';
    const byId = new Map<string, MvpSlotRow>();

    actualViewersRef.current.forEach((v, id) => {
      if (!id || id === hid || id === effectiveStreamId) return;
      byId.set(id, { id, name: v.name, avatar: v.avatar, level: v.level, points: 0 });
      mvpIdentityRef.current.set(id, v);
    });

    // Include self so top MVP circles match what the creator sees for this spectator.
    const selfId = user?.id || '';
    if (selfId && selfId !== hid && selfId !== effectiveStreamId && !byId.has(selfId)) {
      const selfName = user?.username || user?.name || 'You';
      const selfAvatar = user?.avatar || '';
      const selfLevel = Math.max(1, Number(user?.level) || 1);
      byId.set(selfId, { id: selfId, name: selfName, avatar: selfAvatar, level: selfLevel, points: 0 });
      mvpIdentityRef.current.set(selfId, { name: selfName, avatar: selfAvatar, level: selfLevel });
    }

    const addFromScores = (scores: Record<string, number>) => {
      for (const id of Object.keys(scores)) {
        if (!id || id === hid || id === effectiveStreamId || byId.has(id)) continue;
        const cached = mvpIdentityRef.current.get(id);
        byId.set(id, {
          id,
          name: cached?.name || 'User',
          avatar: cached?.avatar || '',
          level: cached?.level || 1,
          points: 0,
        });
      }
    };
    addFromScores(mvpGiftScoresRef.current);
    addFromScores(mvpGiftScoresHostRef.current);
    addFromScores(mvpGiftScoresOpponentRef.current);

    const base = Array.from(byId.values());
    const sortBy = (scores: Record<string, number>) => (a: MvpSlotRow, b: MvpSlotRow) => {
      const sa = scores[a.id] ?? 0;
      const sb = scores[b.id] ?? 0;
      if (sb !== sa) return sb - sa;
      return (b.level ?? 0) - (a.level ?? 0);
    };
    const withPoints = (scores: Record<string, number>, list: MvpSlotRow[]) =>
      list.map((s) => ({ ...s, points: scores[s.id] ?? 0 }));

    // Battle sides: scorers exclusive to that side, then fill remaining of 3 from viewers.
    const pickSide = (side: 'host' | 'opponent', excludeIds?: Set<string>) => {
      const scores = side === 'host' ? mvpGiftScoresHostRef.current : mvpGiftScoresOpponentRef.current;
      const other = side === 'host' ? mvpGiftScoresOpponentRef.current : mvpGiftScoresHostRef.current;
      const exclusive = base.filter((s) => {
        const mine = scores[s.id] ?? 0;
        if (mine <= 0) return false;
        const theirs = other[s.id] ?? 0;
        if (side === 'host') return mine >= theirs;
        return mine > theirs;
      });
      const rankedExclusive = withPoints(scores, [...exclusive].sort(sortBy(scores))).slice(0, 3);
      if (rankedExclusive.length >= 3) return rankedExclusive;
      const seen = new Set(rankedExclusive.map((s) => s.id));
      const fillers = [...base]
        .filter((s) => {
          if (seen.has(s.id) || excludeIds?.has(s.id)) return false;
          const mine = scores[s.id] ?? 0;
          const theirs = other[s.id] ?? 0;
          if (side === 'host') return theirs <= mine;
          return mine >= theirs;
        })
        .sort(sortBy(scores));
      const out = [...rankedExclusive];
      for (const s of fillers) {
        if (out.length >= 3) break;
        out.push({ ...s, points: scores[s.id] ?? 0 });
        seen.add(s.id);
      }
      return out;
    };

    const hostSlots = pickSide('host');
    setMvpSlots({
      global: withPoints(mvpGiftScoresRef.current, [...base].sort(sortBy(mvpGiftScoresRef.current)).slice(0, 3)),
      host: hostSlots,
      opponent: pickSide('opponent', new Set(hostSlots.map((s) => s.id))),
    });
  }, [effectiveStreamId, hostUserId, user?.id, user?.username, user?.name, user?.avatar, user?.level]);

  const syncMvpSlotsRef = useRef(syncMvpSlots);
  syncMvpSlotsRef.current = syncMvpSlots;

  useEffect(() => {
    mvpGiftScoresRef.current = {};
    mvpGiftScoresHostRef.current = {};
    mvpGiftScoresOpponentRef.current = {};
    mvpIdentityRef.current.clear();
    syncMvpSlotsRef.current();
  }, [effectiveStreamId]);

  // Re-sync top MVP when self identity is ready (match creator circles).
  useEffect(() => {
    syncMvpSlotsRef.current();
  }, [user?.id, user?.avatar, user?.username, user?.name, user?.level]);

  const [joinRequested, setJoinRequested] = useState(false);

  const sendCohostJoinRequest = useCallback(() => {
    if (!user?.id || joinRequested || spectatorCoHostRequestSent) return false;
    const targetHostId = hostUserIdRef.current || hostUserId || effectiveStreamId;
    if (!targetHostId) return false;
    setJoinRequested(true);
    setSpectatorCoHostRequestSent(true);
    cohostRequestSend({
      hostUserId: targetHostId,
      requesterName: user?.username || user?.name || 'Someone',
      requesterAvatar: user?.avatar || '',
    });
    showToast('Co-host request sent!');
    return true;
  }, [user?.id, user?.username, user?.name, user?.avatar, joinRequested, spectatorCoHostRequestSent, hostUserId, effectiveStreamId]);

  const [userLevel, setUserLevel] = useState(() => Math.max(1, Number(user?.level) || 0));

  const viewerName = user?.username || user?.name || 'Viewer';
  const viewerAvatar = user?.avatar || '';

  const [moderators, _setModerators] = useState<Set<string>>(new Set());
  const isModerator = moderators.has(user?.id || '');

  const [hasJoinedToday, setHasJoinedToday] = useState(false);
  const [_myHeartCount, setMyHeartCount] = useState(0);
  const [_dailyHeartCount, setDailyHeartCount] = useState(0);
  const dailyHeartFetchedRef = useRef(false);

  useEffect(() => {
    dailyHeartFetchedRef.current = false;
    if (!hostUserId) return;
    dailyHeartFetchedRef.current = true;
    apiLiveGetDailyHearts(hostUserId).then(({ data: d }) => {
      if (d) {
        if (typeof d.todayCount === 'number') setDailyHeartCount(d.todayCount);
        if (typeof d.totalCount === 'number') setMyHeartCount(d.totalCount);
        if (d.hasSent) setHasJoinedToday(true);
      }
    }).catch(() => {});
  }, [hostUserId]);

  // ═══════════════════════════════════════════════════
  // BATTLE STATE (spectator sees host's battle status)
  // ═══════════════════════════════════════════════════
  const [spectatorBattle, setSpectatorBattle] = useState<{
    /** True while creator is in battle layout (WAITING invite OR ACTIVE fight). */
    active: boolean;
    /** Server battle status — layout follows WAITING+ACTIVE; timer/votes only ACTIVE. */
    status: 'WAITING' | 'ACTIVE' | 'ENDED';
    hostScore: number;
    opponentScore: number;
    player3Score?: number;
    player4Score?: number;
    timeLeft: number;
    opponentName?: string;
    opponentRoomId?: string;
    winner?: string;
    redTeamLabel?: string;
    blueTeamLabel?: string;
  } | null>(null);
  const spectatorBattleRef = useRef(spectatorBattle);
  spectatorBattleRef.current = spectatorBattle;
  const _lastBattleScoreUpdateTraceSigRef = useRef('');

  // SPEED CHALLENGE (spectator) — auto unlock only; appears alone (not in More).
  const SPEED_CHALLENGE_ENABLED = true;
  const [speedChallengeActive, setSpeedChallengeActive] = useState(false);
  const [speedChallengeTime, setSpeedChallengeTime] = useState(60);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const speedMultiplierRef = useRef(1);
  const roseCountRef = useRef(0);
  const [roseCount, setRoseCount] = useState(0);
  const battleScreenTapCountRef = useRef(0);
  const [battleScreenTapCount, setBattleScreenTapCount] = useState(0);
  const reachedThresholdsRef = useRef<Set<number>>(new Set());
  useEffect(() => { speedMultiplierRef.current = speedMultiplier; }, [speedMultiplier]);

  const resetSpectatorSpeed = useCallback(() => {
    reachedThresholdsRef.current.clear();
    roseCountRef.current = 0;
    setRoseCount(0);
    battleScreenTapCountRef.current = 0;
    setBattleScreenTapCount(0);
    setSpeedChallengeActive(false);
    setSpeedChallengeTime(60);
    setSpeedMultiplier(1);
    speedMultiplierRef.current = 1;
  }, []);

  const startSpeedChallenge = useCallback(() => {
    if (!SPEED_CHALLENGE_ENABLED) return;
    if (speedChallengeActive) return;
    const b = spectatorBattleRef.current;
    if (!b?.active || b.status !== 'ACTIVE' || b.winner) return;
    setSpeedChallengeActive(true);
    setSpeedChallengeTime(60);
  }, [speedChallengeActive, SPEED_CHALLENGE_ENABLED]);

  useEffect(() => {
    if (!speedChallengeActive) return;
    if (speedChallengeTime <= 0) {
      setSpeedChallengeActive(false);
      setSpeedMultiplier(1);
      speedMultiplierRef.current = 1;
      return;
    }
    const t = setTimeout(() => setSpeedChallengeTime((prev) => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [speedChallengeActive, speedChallengeTime]);

  // Auto unlock x2 / x3 / x5 from gift points OR rose gifts OR lots of screen taps.
  useEffect(() => {
    if (!SPEED_CHALLENGE_ENABLED) return;
    const b = spectatorBattle;
    if (!b?.active || b.status !== 'ACTIVE' || b.winner) return;
    if (speedChallengeActive) return;

    const totalScore =
      (b.hostScore || 0) + (b.opponentScore || 0) + (b.player3Score ?? 0) + (b.player4Score ?? 0);
    const flowers = roseCountRef.current;
    const taps = battleScreenTapCountRef.current;

    const tryUnlock = (
      threshold: number,
      mult: number,
      flowerNeed: number,
      tapNeed: number,
      markLower: number[],
    ) => {
      if (reachedThresholdsRef.current.has(threshold)) return false;
      const byPoints = totalScore >= threshold;
      const byFlower = flowers >= flowerNeed;
      const byTaps = taps >= tapNeed;
      if (!byPoints && !byFlower && !byTaps) return false;
      reachedThresholdsRef.current.add(threshold);
      for (const m of markLower) reachedThresholdsRef.current.add(m);
      setSpeedMultiplier(mult);
      speedMultiplierRef.current = mult;
      startSpeedChallenge();
      return true;
    };

    if (tryUnlock(5000, 5, 5, 80, [1000, 200])) return;
    if (tryUnlock(1000, 3, 3, 40, [200])) return;
    tryUnlock(200, 2, 1, 15, []);
  }, [
    spectatorBattle?.hostScore,
    spectatorBattle?.opponentScore,
    spectatorBattle?.player3Score,
    spectatorBattle?.player4Score,
    spectatorBattle?.active,
    spectatorBattle?.status,
    spectatorBattle?.winner,
    roseCount,
    battleScreenTapCount,
    speedChallengeActive,
    startSpeedChallenge,
    SPEED_CHALLENGE_ENABLED,
  ]);

  /** When battle is active, gifts credit host (red) or opponent (blue) MVP tallies. */
  const [spectatorGiftBattleTarget, setSpectatorGiftBattleTarget] = useState<'host' | 'opponent'>('host');
  /** From battle_state_sync — map /watch/:streamId to red vs blue team for gifts (defaults were always host). */
  const [battleStreamIds, setBattleStreamIds] = useState<{
    hostRoomId: string;
    hostUserId: string;
    opponentRoomId: string;
    opponentUserId: string;
  } | null>(null);
  const [battleMistSide, setBattleMistSide] = useState<BattleMistSide>(null);
  const [battleHideScores, setBattleHideScores] = useState(false);
  /** Tap PK score bar to hide it so battle video + chat stay visible. */
  const [battleScoreBarHidden, setBattleScoreBarHidden] = useState(false);
  const [battleGloves, setBattleGloves] = useState<GloveBurst[]>([]);
  const [battleTauntBursts, setBattleTauntBursts] = useState<TauntBurst[]>([]);
  const prevMvpHostSpectatorRef = useRef<string | null>(null);
  const prevMvpOpponentSpectatorRef = useRef<string | null>(null);
  const pushBattleTaunt = useCallback((burst: TauntBurst) => {
    setBattleTauntBursts((prev) => [...prev.slice(-10), burst]);
  }, []);
  const battleMistTimerRef = useRef<number | null>(null);
  const gloveIdRef = useRef(0);

  const triggerBattleVfx = useCallback((side: 'red' | 'blue', strength: number) => {
    setBattleMistSide(side);
    if (battleMistTimerRef.current != null) window.clearTimeout(battleMistTimerRef.current);
    battleMistTimerRef.current = window.setTimeout(() => setBattleMistSide(null), 2200);
    if (strength < 15) return;
    const bursts: GloveBurst[] = [0, 1, 2].map((i) => ({
      id: ++gloveIdRef.current,
      side,
      x: 4 + i * 12 + Math.random() * 10,
      delay: i * 110,
    }));
    setBattleGloves((prev) => [...prev.slice(-5), ...bursts]);
    window.setTimeout(() => {
      setBattleGloves((prev) => prev.filter((g) => !bursts.some((b) => b.id === g.id)));
    }, 1700);
  }, []);

  useEffect(() => {
    const t = spectatorBattle?.timeLeft ?? 0;
    setBattleHideScores(
      !!spectatorBattle?.active &&
        spectatorBattle?.status === 'ACTIVE' &&
        t > 0 &&
        t <= 10 &&
        !spectatorBattle?.winner,
    );
  }, [spectatorBattle?.active, spectatorBattle?.status, spectatorBattle?.timeLeft, spectatorBattle?.winner]);

  useEffect(() => {
    if (!spectatorBattle?.active) {
      prevMvpHostSpectatorRef.current = null;
      prevMvpOpponentSpectatorRef.current = null;
      setBattleScoreBarHidden(false);
      return;
    }
    const hostMvp = mvpSlots.host[0];
    if (hostMvp?.id) {
      if (prevMvpHostSpectatorRef.current && prevMvpHostSpectatorRef.current !== hostMvp.id) {
        announceMvpName(hostMvp.name, 'host');
        pushBattleTaunt(createTauntBurst('host', 'mvp'));
      }
      prevMvpHostSpectatorRef.current = hostMvp.id;
    }
    const oppMvp = mvpSlots.opponent[0];
    if (oppMvp?.id) {
      if (prevMvpOpponentSpectatorRef.current && prevMvpOpponentSpectatorRef.current !== oppMvp.id) {
        announceMvpName(oppMvp.name, 'opponent');
        pushBattleTaunt(createTauntBurst('opponent', 'mvp'));
        playBattleTauntSound('boo');
      }
      prevMvpOpponentSpectatorRef.current = oppMvp.id;
    }
  }, [mvpSlots, pushBattleTaunt, spectatorBattle?.active]);

  const opponentVideoRef = useRef<HTMLVideoElement>(null);
  const opponentLkRoomRef = useRef<Room | null>(null);
  const opponentLifecycleRef = useRef(new LiveRoomLifecycle());
  const spectatorLiveKitHandlersRef = useRef<LiveKitSessionHandlers>({});
  const [hasOpponentStream, setHasOpponentStream] = useState(false);
  const [showOpponentPanel, setShowOpponentPanel] = useState(false);
  const [lastOpponentGift, setLastOpponentGift] = useState<string | null>(null);
  /** Tap a co-host tile to gift them (null = gift goes to the stream host). */
  const [selectedCohostGiftUserId, setSelectedCohostGiftUserId] = useState<string | null>(null);
  const [cohostGiftScores, setCohostGiftScores] = useState<Record<string, number>>({});
  const [cohostLastGifts, setCohostLastGifts] = useState<Record<string, string>>({});
  const [opponentProfile, setOpponentProfile] = useState<{
    displayName: string; username: string; avatarUrl: string;
    followers: number; following: number; level: number; bio: string;
  } | null>(null);
  const opponentProfileFetchedRef = useRef('');
  /** One +5 PK vote per spectator per full match — resets when a new match goes ACTIVE. */
  const spectatorBattleVoteRemainingRef = useRef(1);
  const prevSpectatorBattleActiveRef = useRef(false);
  useEffect(() => {
    const active = !!spectatorBattle?.active && spectatorBattle.status === 'ACTIVE';
    if (active && !prevSpectatorBattleActiveRef.current) {
      spectatorBattleVoteRemainingRef.current = 1;
      void apiLiveEngagementProgress({
        metric: 'battles_joined',
        delta: 1,
        roomId: effectiveStreamId || undefined,
      }).catch(() => {});
    }
    prevSpectatorBattleActiveRef.current = active;
  }, [spectatorBattle?.active, spectatorBattle?.status, effectiveStreamId]);

  const _openOpponentPanel = useCallback(() => {
    const oppId = battleStreamIds?.opponentUserId;
    if (!oppId) return;
    setShowOpponentPanel(true);
    if (opponentProfileFetchedRef.current === oppId) return;
    opponentProfileFetchedRef.current = oppId;
    (async () => {
      try {
        const { body, error } = await apiFetchProfileById(oppId);
        if (error || !body) return;
        const p = (body?.profile || body?.data || {}) as Record<string, unknown>;
        const displayName =
          (typeof p.displayName === 'string' && p.displayName) ||
          (typeof p.username === 'string' && p.username) ||
          spectatorBattle?.opponentName ||
          'Opponent';
        const username = typeof p.username === 'string' ? p.username : '';
        const avatarUrl = typeof p.avatarUrl === 'string' ? p.avatarUrl : '';
        const bio = typeof p.bio === 'string' ? p.bio : '';
        setOpponentProfile({
          displayName,
          username,
          avatarUrl,
          followers: Number(p.followersCount ?? p.followers ?? 0),
          following: Number(p.followingCount ?? p.following ?? 0),
          level: Number(p.level ?? 0),
          bio,
        });
      } catch { /* non-fatal */ }
    })();
  }, [battleStreamIds?.opponentUserId, spectatorBattle?.opponentName]);

  // Stay on the host stream during battle. Dual LiveKit already shows both
  // creators — navigating away mixes WS/LiveKit rooms and kills the live.

  // Tap vote goes to BATTLE SCORE only (server-scored) — never to the like
  // counter under the profile. +5 once per full match, resets next match.
  const handleSpectatorVote = useCallback((target: 'host' | 'opponent' | 'player3' | 'player4') => {
    if (!spectatorBattle?.active || spectatorBattle.status !== 'ACTIVE') return;
    if (spectatorBattleVoteRemainingRef.current <= 0) return;
    if (!websocket.isConnected()) return;
    spectatorBattleVoteRemainingRef.current = 0;
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12);
    } catch {
      /* ignore */
    }
    battleSpectatorVote({ target });
  }, [spectatorBattle?.active, spectatorBattle?.status]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Accept a battle invite received while watching. Mirrors LiveStream's flow:
  // real server handshake (battle_invite_accept -> battle_accept_ack) then move
  // onto the live battle page as a player. Never leaves the creator as a spectator.
  const acceptBattleInviteFromWatch = async () => {
    if (!pendingBattleInvite || !user?.id || battleInviteJoining) return;
    const invite = pendingBattleInvite;
    if (!invite.streamKey) {
      showToast('Missing stream key');
      return;
    }
    setBattleInviteJoining(true);
    setShowGiftPanel(false);
    setShowCoHostPanel(false);
    showToast(`Joining @${invite.hostName}'s battle...`);
    const granted = await runBattleInviteAccept({
      invite,
      requesterName: user?.username || user?.name || 'User',
      requesterAvatar: user?.avatar || '',
      streamKey: user?.id || effectiveStreamId,
    });
    setBattleInviteJoining(false);
    if (!granted) {
      showToast('Could not join the battle — invite is no longer valid');
      return;
    }
    setPendingBattleInvite(null);
    navigate(`/live/${invite.streamKey}?battle=1`, {
      state: { battleHost: { userId: invite.hostUserId, name: invite.hostName, avatar: invite.hostAvatar } },
    });
  };

  const declineBattleInviteFromWatch = () => {
    if (!pendingBattleInvite) return;
    runBattleInviteDecline(pendingBattleInvite);
    setPendingBattleInvite(null);
    setShowGiftPanel(false);
    setShowCoHostPanel(false);
  };

  // Battle countdown only while the fight is ACTIVE (not during WAITING invite).
  useEffect(() => {
    if (!spectatorBattle?.active || spectatorBattle.status !== 'ACTIVE') return;
    const id = window.setInterval(() => {
      setSpectatorBattle((prev) => {
        if (!prev?.active || prev.status !== 'ACTIVE') return prev;
        return { ...prev, timeLeft: Math.max(0, prev.timeLeft - 1) };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [spectatorBattle?.active, spectatorBattle?.status]);

  // Connect to opponent's LiveKit room so spectators see both battle videos.
  // Also keep host-room attach below — after accept the opponent may publish there.
  useEffect(() => {
    const roomId = spectatorBattle?.opponentRoomId;
    if (!spectatorBattle?.active || !roomId) {
      void opponentLifecycleRef.current.disconnect();
      opponentLkRoomRef.current = null;
      if (!spectatorBattle?.active) setHasOpponentStream(false);
      return;
    }
    // Opponent room id may equal host room when they already joined the battle room.
    if (roomId === effectiveStreamId) return;

    let mounted = true;
    const opponentLifecycle = opponentLifecycleRef.current;
    (async () => {
      try {
        const tok = await apiLiveToken(roomId, false);
        if (tok.error || !tok.creds || !mounted) return;
        const token = tok.creds.token;
        const url = tok.creds.url.trim() || getLiveKitUrl();
        if (!token || !url || !mounted) return;
        const { error, session } = await opponentLifecycle.connectLiveKitOnly(
          { url, token },
          {
            onTrackSubscribed: ({ track }) => {
              if (!mounted || track.kind !== 'video') return;
              const el = opponentVideoRef.current;
              if (el) {
                track.attach(el);
                void el.play().catch(() => {});
                setHasOpponentStream(true);
              }
            },
          },
        );
        if (!mounted) {
          opponentLifecycle.liveKit?.disconnect();
          return;
        }
        if (error || !session) return;
        const room = session.raw;
        opponentLkRoomRef.current = room;
        if (!room) return;
        for (const [, p] of room.remoteParticipants) {
          for (const [, pub] of p.videoTrackPublications) {
            if (pub.track && pub.isSubscribed && opponentVideoRef.current) {
              pub.track.attach(opponentVideoRef.current);
              void opponentVideoRef.current.play().catch(() => {});
              setHasOpponentStream(true);
            }
          }
        }
      } catch {
        /* opponent solo room may already have ended — host-room path still applies */
      }
    })();
    return () => {
      mounted = false;
      const raw = opponentLifecycle.rawRoom;
      opponentLifecycle.liveKit?.disconnect();
      if (opponentLkRoomRef.current === raw) opponentLkRoomRef.current = null;
      // Connection-bug fix only: do not clear hasOpponentStream on reconnect cleanup.
    };
  }, [spectatorBattle?.active, spectatorBattle?.opponentRoomId, effectiveStreamId]);

  // ═══════════════════════════════════════════════════
  // CO-HOST STATE (synced from host so spectators see same layout)
  // ═══════════════════════════════════════════════════
  type SpectatorCoHost = { id: string; userId: string; name: string; avatar: string; status: string };
  const [spectatorCoHosts, setSpectatorCoHosts] = useState<SpectatorCoHost[]>([]);
  const coHostVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [selectedSpectatorUserId, _setSelectedSpectatorUserId] = useState<string | null>(null);
  const currentMainTrackRef = useRef<import('livekit-client').Track | null>(null);
  // A non-host track shown provisionally in the big/main box, kept only until the
  // host's track is identified or the co-host's own tile mounts. This guarantees a
  // co-host is never rendered in BOTH the big box and their small tile.
  const mainProvisionalTrackRef = useRef<import('livekit-client').RemoteTrack | null>(null);
  // Identities currently speaking (LiveKit ActiveSpeakersChanged) — drives the box pulse.
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  // Co-host identities whose camera is off (video track muted) — show their avatar instead.
  const [remoteCamOff, setRemoteCamOff] = useState<Set<string>>(new Set());
  /** Co-host userId on the left big screen (null = creator/host). Synced from creator when present. */
  const [featuredUserId, setFeaturedUserId] = useState<string | null>(null);
  const featuredUserIdRef = useRef<string | null>(null);
  const featuredBigVideoRef = useRef<HTMLVideoElement | null>(null);
  const hostSmallVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    featuredUserIdRef.current = featuredUserId;
  }, [featuredUserId]);

  const findCoHostVideoEl = useCallback((identity: string): HTMLVideoElement | null => {
    const direct = coHostVideoRefs.current.get(identity);
    if (direct) return direct;
    for (const [uid, el] of coHostVideoRefs.current) {
      if (sameUserId(uid, identity)) return el;
    }
    return null;
  }, []);

  const isSpeakingUser = useCallback(
    (userId?: string | null) =>
      !!userId && [...speakingIds].some((id) => sameUserId(id, userId)),
    [speakingIds],
  );

  const toggleFeaturedUser = useCallback((userId: string) => {
    setFeaturedUserId((prev) => (sameUserId(prev, userId) ? null : userId));
  }, []);

  // Attach featured co-host / host-small tracks when big-screen switch changes.
  useEffect(() => {
    const room = liveKitRoomRef.current;
    if (!room) return;
    const hostId = hostUserIdRef.current || hostUserId || effectiveStreamId;

    if (featuredUserId && featuredBigVideoRef.current) {
      for (const [, p] of room.remoteParticipants) {
        if (!sameUserId(p.identity, featuredUserId)) continue;
        for (const [, pub] of p.videoTrackPublications) {
          if (pub.track && pub.isSubscribed) {
            pub.track.attach(featuredBigVideoRef.current);
            prepareLiveVideoEl(featuredBigVideoRef.current);
          }
        }
      }
    }

    if (featuredUserId && hostSmallVideoRef.current && hostId) {
      for (const [, p] of room.remoteParticipants) {
        if (!sameUserId(p.identity, hostId) && !sameUserId(p.identity, effectiveStreamId)) continue;
        for (const [, pub] of p.videoTrackPublications) {
          if (pub.track && pub.isSubscribed) {
            pub.track.attach(hostSmallVideoRef.current);
            prepareLiveVideoEl(hostSmallVideoRef.current);
          }
        }
      }
    }
  }, [featuredUserId, hostUserId, effectiveStreamId, spectatorCoHosts]);

  const markRemoteCam = useCallback((identity: string, off: boolean) => {
    if (!identity) return;
    setRemoteCamOff((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (sameUserId(id, identity)) {
          changed = true;
          continue;
        }
        next.add(id);
      }
      if (off) {
        next.add(identity);
        changed = true;
      }
      return changed || off ? next : prev;
    });
  }, []);

  const [isCoHosting, setIsCoHosting] = useState(false);
  const [coHostStream, setCoHostStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!featuredUserId) return;
    const still = spectatorCoHosts.some(
      (h) =>
        sameUserId(h.userId, featuredUserId) &&
        (h.status === 'live' || h.status === 'accepted'),
    );
    const selfFeatured = !!user?.id && sameUserId(user.id, featuredUserId) && isCoHosting;
    if (!still && !selfFeatured) setFeaturedUserId(null);
  }, [spectatorCoHosts, featuredUserId, user?.id, isCoHosting]);

  const coHostChanRef = useRef<unknown>(null);
  const [pendingCoHostInvite, setPendingCoHostInvite] = useState<{ notifId: string; hostName: string; hostAvatar: string; streamKey: string; hostUserId: string } | null>(null);
  const [showCoHostPanel, setShowCoHostPanel] = useState(false);
  // A creator watching another creator can be invited into a BATTLE. That invite
  // must move them onto the live battle page as a player — not leave them here as
  // a spectator. (Co-host is a separate normal-live flow handled above.)
  const [pendingBattleInvite, setPendingBattleInvite] = useState<{ hostName: string; hostAvatar: string; streamKey: string; hostUserId: string } | null>(null);
  const [battleInviteJoining, setBattleInviteJoining] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    // Cohost invite uses explicit navigation / WebSocket.
    return () => {};
  }, [user?.id]);
  const myVideoRef = useRef<HTMLVideoElement>(null);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [isCamOff, setIsCamOff] = useState(false);

  // Co-host publish is invite/accept only — URL alone is not enough.
  const cohostState = (location.state as Record<string, unknown>) || {};
  const isCoHostFromUrl =
    new URLSearchParams(location.search).get('cohost') === '1' &&
    cohostState.fromCohostInvite === true;

  // Spectators should not create their own co-host layout; co-hosting is controlled by the creator's room.
  // We intentionally do NOT auto-start co-hosting on ?cohost=1 for the spectator route.
  // Spectators on ?cohost=1 stay on watch page; no auto co-host start.
  useEffect(() => {
    if (isCoHostFromUrl) {
      // Optional: could show a one-time toast that co-host is request-only from here.
    }
  }, [isCoHostFromUrl, effectiveStreamId, location.pathname]);

  const _startCoHosting = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = false;
      setCoHostStream(stream);
      setIsCoHosting(true);

      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
        myVideoRef.current.play().catch(() => {});
      }

      showToast('You are now co-hosting!');
      setMessages(prev => appendCapped(prev, {
        id: `cohost-${Date.now()}`,
        username: 'System',
        text: 'You joined as co-host',
        isSystem: true,
      }, LIVE_CHAT_MESSAGE_CAP));
    } catch {
      showToast('Camera access denied');
    }
  };

  const stopCoHosting = useCallback(() => {
    if (coHostStream) {
      coHostStream.getTracks().forEach((t) => t.stop());
      setCoHostStream(null);
    }
    if (coHostChanRef.current) {
      coHostChanRef.current = null;
    }
    setIsCoHosting(false);
    setIsMicMuted(true);
    setIsCamOff(false);
  }, [coHostStream]);

  // Host removed this co-host from the table — leave publish mode.
  const wasCohostSeatedRef = useRef(false);
  useEffect(() => {
    if (!user?.id) return;
    const stillSeated = spectatorCoHosts.some(
      (h) =>
        sameUserId(h.userId, user.id) &&
        (h.status === 'live' ||
          h.status === 'accepted' ||
          h.status === 'invited' ||
          h.status === 'pending_accept'),
    );
    if (stillSeated) wasCohostSeatedRef.current = true;
    if (isCoHosting && wasCohostSeatedRef.current && !stillSeated) {
      wasCohostSeatedRef.current = false;
      stopCoHosting();
      showToast('Removed from co-host');
      if (featuredUserId && sameUserId(featuredUserId, user.id)) {
        setFeaturedUserId(null);
      }
    }
  }, [spectatorCoHosts, isCoHosting, user?.id, stopCoHosting, featuredUserId]);

  const toggleMic = () => {
    if (!coHostStream) return;
    const audioTrack = coHostStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = isMicMuted;
      setIsMicMuted(!isMicMuted);
    }
  };

  const toggleCam = () => {
    if (!coHostStream) return;
    const videoTrack = coHostStream.getVideoTracks()[0];
    if (!videoTrack) return;
    const nextCamOff = !isCamOff;
    videoTrack.enabled = !nextCamOff;
    setIsCamOff(nextCamOff);
    const room = liveKitRoomRef.current;
    if (room?.state === ConnectionState.Connected) {
      void room.localParticipant.setCameraEnabled(!nextCamOff).catch(() => {});
    }
  };

  // Cleanup co-host camera on unmount
  useEffect(() => {
    return () => {
      if (coHostStream) {
        coHostStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [coHostStream]);

  // Attach co-host stream to my video ref
  useEffect(() => {
    if (isCoHosting && coHostStream && myVideoRef.current) {
      myVideoRef.current.srcObject = coHostStream;
      prepareLiveVideoEl(myVideoRef.current);
    }
  }, [isCoHosting, coHostStream]);

  // Video ref for live stream (LiveKit)
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Tap-to-like / floating hearts — rendered in chat panel (right side), not over video. */
  const spectatorStageRef = useRef<HTMLDivElement>(null);
  const spectatorChatHeartsRef = useRef<HTMLDivElement>(null);
  const [floatingHearts, setFloatingHearts] = useState<
    Array<{ id: string; x: number; y: number; dx: number; rot: number; size: number; color: string; username?: string; avatar?: string }>
  >([]);

  const spawnHeartAt = useCallback((x: number, y: number, colorOverride?: string, likerName?: string, likerAvatar?: string) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const dx = Math.round((Math.random() * 2 - 1) * 120);
    const rot = Math.round((Math.random() * 2 - 1) * 45);
    const size = Math.round(24 + Math.random() * 12);
    const colors = ['#FF0000', '#ffffff', '#E60026', '#DC143C', '#FF1744', '#CC0000'];
    const color = colorOverride ?? colors[Math.floor(Math.random() * colors.length)];
    setFloatingHearts((prev) => [...prev.slice(-40), { id, x, y, dx, rot, size, color, username: likerName, avatar: likerAvatar }]);
    window.setTimeout(() => {
      setFloatingHearts((prev) => prev.filter((h) => h.id !== id));
    }, 500);
  }, []);

  const spawnHeartFromClient = useCallback((clientX: number, clientY: number, colorOverride?: string, likerName?: string, likerAvatar?: string) => {
    const layer = spectatorChatHeartsRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    if (inside) {
      spawnHeartAt(clientX - rect.left, clientY - rect.top, colorOverride, likerName, likerAvatar);
      return;
    }
    const w = rect.width;
    const h = rect.height;
    const x = w * (0.58 + Math.random() * 0.35);
    const y = h * (0.12 + Math.random() * 0.68);
    spawnHeartAt(x, y, colorOverride ?? '#ffffff', likerName, likerAvatar);
  }, [spawnHeartAt]);

  const spawnHeartAtSideSpectator = useCallback(() => {
    const layer = spectatorChatHeartsRef.current;
    if (!layer) return;
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    if (w <= 0 || h <= 0) return;
    const x = w * (0.58 + Math.random() * 0.35);
    const y = h * (0.2 + Math.random() * 0.55);
    spawnHeartAt(x, y, '#ffffff', viewerName, viewerAvatar);
  }, [spawnHeartAt, viewerName, viewerAvatar]);

  /** Tap / double-tap video to send `heart_sent` — top bar Aprecieri updates via `room_state` + `heart_sent` (same as creator live). */
  const handleLikeTap = useCallback((e?: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    if (e) {
      let clientX: number | undefined;
      let clientY: number | undefined;
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      }
      if (clientX !== undefined && clientY !== undefined) {
        spawnHeartFromClient(clientX, clientY, undefined, viewerName, viewerAvatar);
      } else {
        spawnHeartAtSideSpectator();
      }
    } else {
      spawnHeartAtSideSpectator();
    }
    setActiveLikes((prev) => prev + 1);
    // Battle screen taps unlock Speed automatically (x2/x3/x5).
    if (spectatorBattleRef.current?.active && spectatorBattleRef.current.status === 'ACTIVE') {
      battleScreenTapCountRef.current += 1;
      setBattleScreenTapCount(battleScreenTapCountRef.current);
    }
    if (websocket.isConnected()) {
      liveHeartSend({ username: viewerName, avatar: viewerAvatar });
    }
  }, [viewerName, viewerAvatar, spawnHeartFromClient, spawnHeartAtSideSpectator]);

  const [hasStream, setHasStream] = useState(false);
  const hasStreamRef = useRef(false);
  useEffect(() => {
    hasStreamRef.current = hasStream;
  }, [hasStream]);
  const [liveConnectRetryKey, setLiveConnectRetryKey] = useState(0);
  const spectatorSession = useSpectatorLiveSession({
    enabled: streamIsLive === true && !!effectiveStreamId && !!user?.id,
    roomId: effectiveStreamId,
    publish: isCoHostFromUrl,
    retryKey: liveConnectRetryKey,
    liveKitHandlersRef: spectatorLiveKitHandlersRef,
  });
  const spectatorLifecycleRef = spectatorSession.lifecycleRef;
  const liveKitRoomRef = spectatorSession.liveKitRoomRef;
  const retryJoinRoom = () => {
    setHasStream(false);
    setLiveConnectRetryKey((k) => k + 1);
  };
  const [showRetryButton, setShowRetryButton] = useState(false);
  useEffect(() => {
    if (hasStream) { setShowRetryButton(false); return; }
    const t = setTimeout(() => { if (!hasStream) setShowRetryButton(true); }, 10000);
    return () => clearTimeout(t);
  }, [hasStream]);

  // Engagement Phase 1: capped Battle Energy from watching (server enforces daily caps).
  const engagementWatchKeyedRef = useRef<string>('');
  useEffect(() => {
    if (!effectiveStreamId || !hasStream) return;
    earnBattleEnergyQuiet('watch', effectiveStreamId);
    if (engagementWatchKeyedRef.current !== effectiveStreamId) {
      engagementWatchKeyedRef.current = effectiveStreamId;
      void apiLiveEngagementProgress({
        metric: 'lives_watched',
        delta: 1,
        roomId: effectiveStreamId,
      }).catch(() => {});
      void apiLiveEngagementProgress({
        metric: 'unique_creators',
        delta: 1,
        roomId: effectiveStreamId,
      }).catch(() => {});
    }
    const id = window.setInterval(() => {
      earnBattleEnergyQuiet('watch', effectiveStreamId);
      void apiLiveEngagementProgress({
        metric: 'watch_minutes',
        delta: 1,
        roomId: effectiveStreamId,
      }).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(id);
  }, [effectiveStreamId, hasStream]);

  // Fetch host / stream state. Join must NOT depend only on /api/live/streams —
  // that list is publishing-gated and can be stale, so other spectators would
  // see "offline" while one device that got a fresh list can watch. Token
  // issuance is the source of truth for whether the room is joinable.
  useEffect(() => {
    if (!effectiveStreamId) return;
    let cancelled = false;
    (async () => {
      try {
        const applyHostMeta = async (uid: string, titleHint?: string) => {
          if (cancelled) return;
          setHostUserId(uid);
          hostUserIdRef.current = uid;
          actualViewersRef.current.delete(uid);
          const label = uid.slice(0, 8);
          const initialName = titleHint || label || 'Creator';
          setHostName(initialName);
          setHostAvatar('');
          try {
            const { body: profileBody } = await apiFetchProfileById(uid);
            if (cancelled || !profileBody) return;
            const profile = (profileBody?.profile || profileBody?.data || {}) as Record<string, unknown>;
            const profileName =
              (typeof profile.displayName === 'string' && profile.displayName.trim()) ||
              (typeof profile.username === 'string' && profile.username.trim()) ||
              initialName;
            const profileAvatar =
              (typeof profile.avatarUrl === 'string' && profile.avatarUrl.trim()) || '';
            setHostName(profileName);
            if (profileAvatar) setHostAvatar(profileAvatar);
            const lvl = Math.max(1, Number(profile.level ?? profile.current_level) || 1);
            if (Number.isFinite(lvl)) setHostLevel(lvl);
          } catch {
            /* Non-fatal: keep initialName/empty avatar */
          }
        };

        const { streams, error: streamsErr } = await apiLiveStreams();
        if (streamsErr) {
          setStreamIsLive(false);
          showToast('Stream is offline');
          return;
        }
        const streamRows = streams as Array<any>;
        const stream =
          streamRows.find((s) => s.stream_key === effectiveStreamId) ||
          streamRows.find((s) => s.room_id === effectiveStreamId);

        if (stream) {
          if (cancelled) return;
          setStreamIsLive(true);
          setViewerCount(stream.viewer_count || 0);
          syncMvpSlotsRef.current();
          if (stream.user_id) {
            await applyHostMeta(String(stream.user_id), stream.title);
          } else {
            await applyHostMeta(effectiveStreamId, stream.title);
          }
          return;
        }

        // Not in the public list — still try to join if the room is live.
        const { creds, error: tokenErr } = await apiLiveToken(effectiveStreamId, false);
        if (cancelled) return;
        if (tokenErr || !creds?.token) {
          setStreamIsLive(false);
          showToast('Stream is offline');
          return;
        }
        setStreamIsLive(true);
        setViewerCount(0);
        syncMvpSlotsRef.current();
        await applyHostMeta(effectiveStreamId);
      } catch {
        if (!cancelled) {
          setStreamIsLive(false);
          showToast('Stream is offline');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveStreamId, navigate, streamRetryKey]);

  // Track attach handlers for useSpectatorLiveSession (connect owner). No parallel Room().
  const coHostPublishStreamRef = useRef<MediaStream | null>(null);
  const mainVideoAttachedRef = useRef(false);
  {
    const hostId = () => hostUserIdRef.current || effectiveStreamId;
    const isHostIdentity = (identity: string) =>
      sameUserId(identity, hostId()) || sameUserId(identity, effectiveStreamId);
    const attachHostVideo = (track: import('livekit-client').RemoteTrack) => {
      if (!videoRef.current) return;
      if (mainProvisionalTrackRef.current && mainProvisionalTrackRef.current !== track) {
        try { mainProvisionalTrackRef.current.detach(videoRef.current); } catch { /* noop */ }
      }
      mainProvisionalTrackRef.current = null;
      track.attach(videoRef.current);
      prepareLiveVideoEl(videoRef.current);
      if (featuredUserIdRef.current && hostSmallVideoRef.current) {
        track.attach(hostSmallVideoRef.current);
        prepareLiveVideoEl(hostSmallVideoRef.current);
      }
      currentMainTrackRef.current = track;
      mainVideoAttachedRef.current = true;
      setHasStream(true);
    };
    const attachCoHostVideo = (track: import('livekit-client').RemoteTrack, identity: string) => {
      if (featuredUserIdRef.current && sameUserId(identity, featuredUserIdRef.current) && featuredBigVideoRef.current) {
        track.attach(featuredBigVideoRef.current);
        prepareLiveVideoEl(featuredBigVideoRef.current);
      }
      const el = findCoHostVideoEl(identity);
      if (!el) return !!featuredUserIdRef.current && sameUserId(identity, featuredUserIdRef.current);
      track.attach(el);
      prepareLiveVideoEl(el);
      if (mainProvisionalTrackRef.current === track && videoRef.current) {
        try { track.detach(videoRef.current); } catch { /* noop */ }
        mainProvisionalTrackRef.current = null;
        mainVideoAttachedRef.current = false;
      }
      return true;
    };
    spectatorLiveKitHandlersRef.current = {
      onTrackSubscribed: ({ track, participant, publication }) => {
        const identity = participant?.identity || '';
        const room = liveKitRoomRef.current;
        const myIdentity = room?.localParticipant?.identity ?? '';
        if (track.kind === 'video') {
          if (publication?.isMuted && identity) markRemoteCam(identity, true);
          else if (identity) markRemoteCam(identity, false);
        }
        const isSelf = sameUserId(identity, myIdentity);
        if (track.kind === 'audio') {
          if (isSelf) return;
          if (isHostIdentity(identity)) track.attach();
          return;
        }
        if (track.kind === 'video' && participant && videoRef.current) {
          if (isSelf) return;
          if (isHostIdentity(identity)) {
            attachHostVideo(track);
            return;
          }
          if (attachCoHostVideo(track, identity)) return;
          if (!mainVideoAttachedRef.current) {
            track.attach(videoRef.current);
            prepareLiveVideoEl(videoRef.current);
            currentMainTrackRef.current = track;
            mainProvisionalTrackRef.current = track as import('livekit-client').RemoteTrack;
            mainVideoAttachedRef.current = true;
            setHasStream(true);
          }
        }
      },
      onActiveSpeakers: (identities) => {
        setSpeakingIds(new Set(identities.filter(Boolean)));
      },
      onTrackMuted: (pub, participant) => {
        if (pub.kind !== 'video') return;
        const id = participant?.identity;
        if (!id) return;
        markRemoteCam(id, true);
      },
      onTrackUnmuted: (pub, participant) => {
        if (pub.kind !== 'video') return;
        const id = participant?.identity;
        if (!id) return;
        markRemoteCam(id, false);
      },
    };
  }

  // Attach already-subscribed remotes once session connects; cohost publish if invited.
  useEffect(() => {
    if (!spectatorSession.connected) return;
    const room = liveKitRoomRef.current;
    if (!room) return;
    const hostId = () => hostUserIdRef.current || effectiveStreamId;
    const isHostIdentity = (identity: string) =>
      sameUserId(identity, hostId()) || sameUserId(identity, effectiveStreamId);
    const myIdentity = room.localParticipant?.identity ?? '';
    for (const [, participant] of room.remoteParticipants) {
      const identity = participant.identity || '';
      if (sameUserId(identity, myIdentity)) continue;
      for (const [, publication] of participant.videoTrackPublications) {
        if (publication.track && publication.isSubscribed) {
          spectatorLiveKitHandlersRef.current.onTrackSubscribed?.({
            track: publication.track,
            participant,
            publication,
          });
        }
      }
      for (const [, publication] of participant.audioTrackPublications) {
        if (publication.track && publication.isSubscribed && isHostIdentity(identity)) {
          publication.track.attach();
        }
      }
    }
  }, [spectatorSession.connected, effectiveStreamId, liveKitRoomRef]);

  useEffect(() => {
    if (!spectatorSession.connected || !isCoHostFromUrl) return;
    let mounted = true;
    const lifecycle = spectatorLifecycleRef.current;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        coHostPublishStreamRef.current = stream;
        const mic = stream.getAudioTracks()[0];
        if (mic) mic.enabled = false;
        await lifecycle.publishFromStream(stream);
        await lifecycle.liveKit?.setMicEnabled(false);
        setCoHostStream(stream);
        setIsCoHosting(true);
        showToast('You are co-hosting. Unmute to speak.');
      } catch (e) {
        console.warn('[LiveKit] Co-host publish failed:', e);
        showToast('Could not start camera. Host will not see your video.');
      }
    })();
    return () => {
      mounted = false;
      if (coHostPublishStreamRef.current) {
        coHostPublishStreamRef.current.getTracks().forEach((t) => t.stop());
        coHostPublishStreamRef.current = null;
      }
    };
  }, [spectatorSession.connected, isCoHostFromUrl, spectatorLifecycleRef]);

  // When user selects a spectator slot, show that participant on the main (big) screen; otherwise show creator.
  useEffect(() => {
    const room = liveKitRoomRef.current;
    const videoEl = videoRef.current;
    if (!room || !videoEl || !hasStream) return;
    const hostId = hostUserIdRef.current || effectiveStreamId;
    const targetIdentity = selectedSpectatorUserId != null ? selectedSpectatorUserId : hostId;
    const participant = targetIdentity === room.localParticipant?.identity
      ? room.localParticipant
      : room.remoteParticipants.get(targetIdentity);
    if (!participant) return;
    let videoTrack: import('livekit-client').Track | null = null;
    participant.videoTrackPublications.forEach((pub) => {
      if (pub.track && pub.isSubscribed) videoTrack = pub.track;
    });
    if (!videoTrack) return;
    const current = currentMainTrackRef.current;
    if (current === videoTrack) return;
    if (current) current.detach(videoEl);
    videoTrack.attach(videoEl);
    prepareLiveVideoEl(videoEl);
    currentMainTrackRef.current = videoTrack;
  }, [selectedSpectatorUserId, hasStream, effectiveStreamId]);

  // Re-attach host LiveKit track when DOM video element is recreated (e.g. battle mode toggle)
  useEffect(() => {
    const room = liveKitRoomRef.current;
    const videoEl = videoRef.current;
    if (!room || !videoEl) return;
    const hostId = hostUserIdRef.current || effectiveStreamId;
    for (const [, participant] of room.remoteParticipants) {
      const identity = participant.identity || '';
      if (!sameUserId(identity, hostId) && !sameUserId(identity, effectiveStreamId)) continue;
      for (const [, pub] of participant.videoTrackPublications) {
        if (pub.track && pub.isSubscribed) {
          pub.track.attach(videoEl);
          prepareLiveVideoEl(videoEl);
          currentMainTrackRef.current = pub.track;
          setHasStream(true);
          if (pub.isMuted) markRemoteCam(identity, true);
          else markRemoteCam(identity, false);
          return;
        }
      }
    }
  }, [spectatorBattle?.active, effectiveStreamId, markRemoteCam]);

  // Battle: the opponent publishes into the HOST's LiveKit room (their solo room
  // ends when they join the battle). Route their host-room track to the opponent
  // panel so spectators always see both fighters.
  useEffect(() => {
    const oppId = battleStreamIds?.opponentUserId;
    const room = liveKitRoomRef.current;
    if (!room || !spectatorBattle?.active) return;
    const tryAttach = () => {
      const el = opponentVideoRef.current;
      if (!el) return;
      for (const [, p] of room.remoteParticipants) {
        const identity = p.identity || '';
        const isHost =
          identity === (hostUserIdRef.current || '') ||
          identity === effectiveStreamId;
        if (isHost) continue;
        if (oppId && identity !== oppId) continue;
        for (const [, pub] of p.videoTrackPublications) {
          if (pub.track && pub.isSubscribed) {
            pub.track.attach(el);
            void el.play().catch(() => {});
            setHasOpponentStream(true);
            return;
          }
        }
      }
    };
    tryAttach();
    const onSub = (
      track: import('livekit-client').RemoteTrack,
      _pub: import('livekit-client').TrackPublication,
      participant: import('livekit-client').RemoteParticipant,
    ) => {
      if (track.kind !== 'video') return;
      const identity = participant?.identity || '';
      const isHost =
        identity === (hostUserIdRef.current || '') ||
        identity === effectiveStreamId;
      if (isHost) return;
      if (oppId && identity !== oppId) return;
      tryAttach();
    };
    room.on(RoomEvent.TrackSubscribed, onSub);
    room.on(RoomEvent.ParticipantConnected, tryAttach);
    const poll = window.setInterval(tryAttach, 2000);
    return () => {
      room.off(RoomEvent.TrackSubscribed, onSub);
      room.off(RoomEvent.ParticipantConnected, tryAttach);
      window.clearInterval(poll);
    };
  }, [battleStreamIds?.opponentUserId, spectatorBattle?.active, hasStream, effectiveStreamId]);

  // If we're still "connecting" after 18s, hint that host may not be publishing
  useEffect(() => {
    if (!streamIsLive || hasStream) return;
    const t = setTimeout(() => {
      showToast('Stream not loading? Make sure the host is live and try again.');
    }, 18000);
    return () => clearTimeout(t);
  }, [streamIsLive, hasStream]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    setUserLevel(user.level ?? 0);
    setUserXP(0);

    Promise.all([
      apiFetchWallet(),
      apiLiveProgressionMe(),
      apiLiveEngagementWallet(),
    ])
      .then(([wallet, progression, engagementWallet]) => {
        if (cancelled) return;
        const walletBal =
          !wallet.error && wallet.balances != null
            ? Math.max(0, wallet.balances.paid)
            : 0;
        walletCoinBalanceRef.current = walletBal;
        setCoinBalance(resolveGiftUiBalance(walletBal, user.id));
        const p = (progression.data?.progression ?? null) as Record<string, unknown> | null;
        const starter = Math.max(0, Number(p?.starter_coin_balance) || 0);
        setStarterCoinBalance(starter);
        const ew = engagementWallet.data?.wallet as Record<string, number> | undefined;
        const promo = Math.max(
          0,
          Number(ew?.promotionalCoins ?? ew?.promotional_coins ?? 0) || 0,
        );
        setPromotionalCoinBalance(promo);
        if (promo > 0 && engagementFlags.promoGiftSpendEnabled) {
          setGiftSource('promotional_coins');
        } else if (starter > 0) {
          setGiftSource('starter_coins');
        } else {
          setGiftSource('paid_coins');
        }
        {
          const serverLevel = Math.max(0, Number(p?.current_level) || 0);
          const testLvl = shouldUseTestCoinsForGifts(user.id) ? getTestLevel(user.id) : 0;
          const resolvedLevel = Math.max(serverLevel, testLvl, Number(user.level) || 0);
          setUserLevel(resolvedLevel);
          if (serverLevel > 0) updateUser({ level: serverLevel });
        }
        setUserXP(Math.max(0, Number(p?.total_xp) || 0));
      })
      .catch(() => {
        if (cancelled) return;
        if (shouldUseTestCoinsForGifts(user.id)) {
          setCoinBalance(getPersistedTestCoinsBalance(user.id));
        }
      });
    return () => { cancelled = true; };
  }, [user?.id, user?.level, updateUser]);

  useEffect(() => {
    if (showTestCoinsModal) {
      const verified = localStorage.getItem(TEST_COINS_VERIFIED_KEY);
      const ts = verified ? parseInt(verified, 10) : NaN;
      if (ts && Date.now() - ts < 24 * 60 * 60 * 1000) {
        setTestCoinsStep('amount');
      } else {
        setTestCoinsStep('password');
        setTimeout(() => testCoinsPwdRef.current?.focus(), 100);
      }
    }
  }, [showTestCoinsModal]);

  useEffect(() => {
    if (!showGiftPanel || !user?.id) return;
    const testBal = getPersistedTestCoinsBalance(user.id);
    if (testBal > 0) {
      setCoinBalance(testBal);
      // Still refresh real wallet in the background so paid gifts work when test hits 0.
      void apiFetchWallet().then(({ balances, error: walletErr }) => {
        if (!walletErr && balances) {
          walletCoinBalanceRef.current = Math.max(0, balances.paid);
        }
      });
    } else {
      void apiFetchWallet().then(({ balances, error: walletErr }) => {
        if (!walletErr && balances) {
          const walletBal = Math.max(0, balances.paid);
          walletCoinBalanceRef.current = walletBal;
          setCoinBalance(walletBal);
        }
      });
    }
    apiLiveProgressionMe().then(({ data, error }) => {
      if (!error && data?.progression) {
        const progression = data.progression as Record<string, unknown>;
        const starter = Math.max(
          0,
          Number(progression.starter_coin_balance) || 0,
        );
        setStarterCoinBalance(starter);
      }
    }).catch(() => {});
    apiLiveEngagementWallet().then(({ data, error }) => {
      if (!error && data?.wallet) {
        const ew = data.wallet as Record<string, number>;
        const promo = Math.max(
          0,
          Number(ew.promotionalCoins ?? ew.promotional_coins ?? 0) || 0,
        );
        setPromotionalCoinBalance(promo);
      }
    }).catch(() => {});
  }, [showGiftPanel, user?.id]);

  const handleSubscribe = async () => {
    setIsSubscribing(true);
    try {
      if (!user?.id) {
        navigate('/login');
        return;
      }
      const creatorId = hostUserIdRef.current || hostUserId;
      if (!creatorId || creatorId === user.id) {
        showToast('Creator unavailable');
        return;
      }
      const result = await purchaseMembership(creatorId);
      if (result.success && result.status?.active) {
        setIsMember(true);
        showToast('Membership activated!');
        setShowFanClub(false);
      } else if (result.error !== 'Purchase cancelled') {
        showToast(result.error || 'Membership purchase failed');
      }
    } catch {
      showToast('Membership purchase failed');
    } finally {
      setIsSubscribing(false);
    }
  };

  useEffect(() => {
    const creatorId = hostUserIdRef.current || hostUserId;
    if (!user?.id || !creatorId || creatorId === user.id) {
      setIsMember(false);
      return;
    }
    let cancelled = false;
    void getMembershipStatus(creatorId).then(({ status }) => {
      if (!cancelled) setIsMember(status?.active === true);
    });
    return () => {
      cancelled = true;
    };
  }, [hostUserId, user?.id]);

  // Join tracking
  useEffect(() => {
    if (user?.id && effectiveStreamId) {
      const today = new Date().toISOString().split('T')[0];
      const storageKey = `joined_stream_${effectiveStreamId}_${user.id}_${today}`;
      if (localStorage.getItem(storageKey)) setHasJoinedToday(true);
      const heartKey = `my_heart_count_${effectiveStreamId}_${user.id}`;
      const saved = localStorage.getItem(heartKey);
      if (saved) setMyHeartCount(parseInt(saved, 10));
    }
  }, [user?.id, effectiveStreamId]);

  // WebSocket: spectators join the creator's live room (same room id = effectiveStreamId) for real-time chat, gifts, join/leave
  useEffect(() => {
    if (!effectiveStreamId || !user?.id || !streamIsLive) return;

    let mounted = true;

    const connect = async () => {
      const token = useAuthStore.getState().session?.access_token || '';
      if (!token || !mounted) return;
      // Persistent reconnect: brief mobile blips must not synthesize stream_ended
      // ("The host has ended the stream") for this spectator only.
      websocket.connect(effectiveStreamId, token, { persistent: true });
    };

    let hostFoundInRoom = false;

    const handleRoomState = (data) => {
      if (!mounted) return;
      const viewers = data.viewers;
      const hid = hostUserIdRef.current;
      if (Array.isArray(viewers)) {
        actualViewersRef.current.clear();
        // Host is often omitted from the WS viewers list. Never wipe a prior
        // "host found" (or live video) just because another spectator joined
        // and we got a fresh room snapshot without the host id.
        let foundHostInList = false;
        let count = 0;
        for (const v of viewers) {
          if (v.user_id === hid || v.user_id === effectiveStreamId || v.is_host) {
            foundHostInList = true;
          } else if (v.user_id && v.user_id !== user?.id) {
            actualViewersRef.current.set(v.user_id, {
              name: v.display_name || v.username || 'User',
              avatar: v.avatar_url || '',
              level: v.level || 1,
            });
            count++;
          }
        }
        if (foundHostInList || hasStreamRef.current || !hid) {
          hostFoundInRoom = true;
        }
        setViewerCount(Math.max(count, viewers.length - 1));
        syncMvpSlots();
      }
      if (typeof data.live_likes === 'number' && Number.isFinite(data.live_likes)) {
        setActiveLikes(Math.max(0, data.live_likes));
      }
    };

    const handleUserJoined = (data) => {
      if (!mounted) return;
      if (data.user_id === user?.id) return;
      if (data.user_id === hostUserIdRef.current || data.user_id === effectiveStreamId) {
        hostFoundInRoom = true;
        return;
      }
      const wsLevel = Number(data.level);
      const initialLevel = Number.isFinite(wsLevel) && wsLevel >= 0 ? Math.floor(wsLevel) : 1;
      const uid = typeof data.user_id === 'string' ? data.user_id : String(data.user_id ?? '');
      if (data.user_id) {
        actualViewersRef.current.set(data.user_id, {
          name: data.display_name || data.username || 'User',
          avatar: data.avatar_url || '',
          level: initialLevel,
        });
      }
      const joinName = data.username || 'User';
      const joinMsgId = `join-${Date.now()}`;
      setMessages(prev => appendCapped(prev, {
        id: joinMsgId,
        username: joinName,
        text: 'joined the stream',
        isSystem: true,
        level: initialLevel,
        avatar: typeof data.avatar_url === 'string' ? data.avatar_url : '',
      }, LIVE_CHAT_MESSAGE_CAP));
      if (uid && initialLevel <= 1) {
        void apiFetchProfileById(uid).then(({ body }) => {
          if (!mounted) return;
          const prof = (body?.profile || body?.data || {}) as Record<string, unknown>;
          const lvl = Number(prof.level);
          if (!Number.isFinite(lvl) || lvl <= 0) return;
          const fixed = Math.floor(lvl);
          setMessages((prev) => prev.map((m) => (m.id === joinMsgId ? { ...m, level: fixed } : m)));
          if (data.user_id) {
            const cached = actualViewersRef.current.get(data.user_id);
            if (cached) actualViewersRef.current.set(data.user_id, { ...cached, level: fixed });
          }
          syncMvpSlotsRef.current();
        }).catch(() => {});
      }
      // The join banner is ephemeral: it appears only when someone joins, then
      // clears itself so it never stays permanently in the chat feed.
      window.setTimeout(() => {
        if (!mounted) return;
        setMessages(prev => prev.filter(m => m.id !== joinMsgId));
      }, 5000);
      setViewerCount(prev => prev + 1);
      syncMvpSlots();
    };

    const handleUserLeft = (data) => {
      if (!mounted) return;
      if (data.user_id) actualViewersRef.current.delete(data.user_id);
      setViewerCount(prev => Math.max(0, prev - 1));
      syncMvpSlots();
    };

    const handleChatMessage = (data) => {
      if (!mounted) return;
      if (data.user_id === user?.id) return;
      const text = typeof data.text === 'string' ? data.text : '';
      const levelUpMatch = /^reached Level (\d+)/i.exec(text);
      const parsedLevel = levelUpMatch ? Number(levelUpMatch[1]) : NaN;
      const uid = typeof data.user_id === 'string' ? data.user_id : '';
      const cached = uid ? mvpIdentityRef.current.get(uid) || actualViewersRef.current.get(uid) : undefined;
      const username =
        (typeof data.username === 'string' && data.username.trim()) ||
        cached?.name ||
        'User';
      const avatar =
        (typeof data.avatar === 'string' && data.avatar.trim()) ||
        (typeof data.avatar_url === 'string' && data.avatar_url.trim()) ||
        cached?.avatar ||
        '';
      if (uid && avatar) {
        const level =
          Number.isFinite(Number(data.level)) && Number(data.level) >= 0
            ? Math.floor(Number(data.level))
            : cached?.level || 1;
        mvpIdentityRef.current.set(uid, { name: username, avatar, level });
        const existing = actualViewersRef.current.get(uid);
        actualViewersRef.current.set(uid, {
          name: username,
          avatar,
          level: existing?.level || level,
        });
      }
      const msg: LiveMessage = {
        id: `ws-${Date.now()}-${Math.random()}`,
        username,
        text,
        level: Number.isFinite(parsedLevel)
          ? parsedLevel
          : Number.isFinite(Number(data.level)) && Number(data.level) >= 0
            ? Math.floor(Number(data.level))
            : cached?.level || 1,
        avatar,
        stickerUrl: typeof data.stickerUrl === 'string' ? data.stickerUrl : undefined,
        isSystem: !!levelUpMatch,
      };
      setMessages(prev => appendCapped(prev, msg, LIVE_CHAT_MESSAGE_CAP));
    };

    const handleGiftSent = (data) => {
      if (!mounted) return;
      const txnId =
        (typeof data.transactionId === 'string' && data.transactionId) ||
        (typeof data.transaction_id === 'string' && data.transaction_id) ||
        '';
      if (txnId) {
        if (seenGiftTxnRef.current.has(txnId)) return;
        seenGiftTxnRef.current.add(txnId);
        if (seenGiftTxnRef.current.size > 200) {
          const keep = [...seenGiftTxnRef.current].slice(-100);
          seenGiftTxnRef.current = new Set(keep);
        }
      }
      const wsGiftId =
        (typeof data.giftId === 'string' && data.giftId) ||
        (typeof data.gift_id === 'string' && data.gift_id) ||
        '';
      const giftDef = wsGiftId
        ? giftsCatalogRef.current.find((g) => g.id === wsGiftId)
        : undefined;
      const gifterId = typeof data.user_id === 'string' ? data.user_id : '';
      const giftCoins =
        giftDef?.coins ??
        (typeof data.coins === 'number' && Number.isFinite(data.coins) ? data.coins : 0);
      // Co-host tile corner scores must update for the sender too (own gift echo
      // returns early below for chat/video — scores still need to land here).
      const cohostTarget =
        (typeof data.cohostTargetUserId === 'string' && data.cohostTargetUserId.trim()) ||
        (typeof data.cohost_target_user_id === 'string' && data.cohost_target_user_id.trim()) ||
        '';
      if (cohostTarget && giftCoins > 0) {
        setCohostGiftScores((prev) => ({
          ...prev,
          [cohostTarget]: (prev[cohostTarget] || 0) + giftCoins,
        }));
        const iconRaw =
          (typeof data.gift_icon === 'string' && data.gift_icon) ||
          (typeof giftDef?.icon === 'string' ? giftDef.icon : '');
        const iconUrl =
          iconRaw && (iconRaw.startsWith('http://') || iconRaw.startsWith('https://') || iconRaw.startsWith('/'))
            ? (iconRaw.startsWith('http') ? iconRaw : resolveGiftAssetUrl(iconRaw.startsWith('/') ? iconRaw : `/${iconRaw}`))
            : null;
        if (iconUrl) {
          setCohostLastGifts((prev) => ({ ...prev, [cohostTarget]: iconUrl }));
        }
      }
      // Skip echo of our own gift — sender already queued local animation/chat.
      if (gifterId && user?.id && gifterId === user.id) return;
      if (gifterId && giftCoins > 0) {
        const gifterName =
          (typeof data.username === 'string' && data.username.trim()) ||
          mvpIdentityRef.current.get(gifterId)?.name ||
          'User';
        const gifterAvatar =
          (typeof data.avatar === 'string' && data.avatar) ||
          mvpIdentityRef.current.get(gifterId)?.avatar ||
          '';
        const gifterLevel =
          (Number.isFinite(Number(data.level)) && Number(data.level) >= 0 ? Math.floor(Number(data.level)) : null) ??
          mvpIdentityRef.current.get(gifterId)?.level ??
          1;
        mvpIdentityRef.current.set(gifterId, {
          name: gifterName,
          avatar: gifterAvatar,
          level: gifterLevel,
        });
        mvpGiftScoresRef.current[gifterId] = (mvpGiftScoresRef.current[gifterId] || 0) + giftCoins;
        if (spectatorBattleRef.current?.active) {
          const side = normalizeBattleGiftTarget(data.battleTarget);
          if (side === 'host') {
            mvpGiftScoresHostRef.current[gifterId] = (mvpGiftScoresHostRef.current[gifterId] || 0) + giftCoins;
          } else if (side === 'opponent') {
            mvpGiftScoresOpponentRef.current[gifterId] = (mvpGiftScoresOpponentRef.current[gifterId] || 0) + giftCoins;
          }
        }
        syncMvpSlots();
      }
      {
        const giftName = formatGiftDisplayName(
          giftDef?.name ||
          (typeof data.giftName === 'string' && data.giftName.trim()) ||
          (typeof data.gift_name === 'string' && data.gift_name.trim()) ||
          'Gift',
        );
        const msg: LiveMessage = {
          id: `gift-ws-${txnId || Date.now()}-${Math.random()}`,
          username: typeof data.username === 'string' ? data.username : 'User',
          text: `sent ${giftName}`,
          level: Number.isFinite(Number(data.level)) && Number(data.level) >= 0
            ? Math.floor(Number(data.level))
            : 1,
          avatar: typeof data.avatar === 'string' ? data.avatar : '',
          isGift: true,
        };
        setMessages(prev => appendCapped(prev, msg, LIVE_CHAT_MESSAGE_CAP));
        {
          const flowerKey = giftName.toLowerCase();
          if (
            spectatorBattleRef.current?.active &&
            (flowerKey.includes('rose') || flowerKey.includes('flower'))
          ) {
            roseCountRef.current += 1;
            setRoseCount(roseCountRef.current);
          }
        }
        if (spectatorBattleRef.current?.active) {
          const side = normalizeBattleGiftTarget(data.battleTarget);
          if (side === 'opponent') {
            const iconRaw =
              (typeof data.gift_icon === 'string' && data.gift_icon) ||
              (typeof giftDef?.icon === 'string' ? giftDef.icon : '');
            const iconUrl =
              iconRaw && (iconRaw.startsWith('http://') || iconRaw.startsWith('https://') || iconRaw.startsWith('/'))
                ? (iconRaw.startsWith('http') ? iconRaw : resolveGiftAssetUrl(iconRaw.startsWith('/') ? iconRaw : `/${iconRaw}`))
                : null;
            if (iconUrl) setLastOpponentGift(iconUrl);
          }
        }
      }
      // Play gift video for other users' gifts (sender already queued locally).
      // Same resolve path as creator LiveStream so Spectator GiftOverlay matches.
      {
        const resolvePlayUrl = (catalog: GiftUiItem[]) =>
          pickGiftVideoUrl(data, catalog) ||
          (wsGiftId
            ? pickGiftVideoUrl({ giftId: wsGiftId, gift_id: wsGiftId }, catalog)
            : null) ||
          pickGiftVideoUrl(
            {
              giftId: wsGiftId,
              gift_id: wsGiftId,
              video: typeof data?.video === 'string' ? data.video : '',
              animation_url:
                typeof data?.animation_url === 'string' ? data.animation_url : '',
            },
            catalog,
          );

        const enqueueSpectatorGiftVideo = (url: string) => {
          if (!url) return;
          setGiftQueue((prev) => appendCapped(prev, { video: url }, LIVE_GIFT_QUEUE_CAP));
        };

        const playUrl = resolvePlayUrl(giftsCatalogRef.current);
        if (playUrl) {
          enqueueSpectatorGiftVideo(playUrl);
        } else if (wsGiftId) {
          void fetchGiftsFromDatabase().then((gifts) => {
            if (!mounted) return;
            if (gifts.length) {
              giftsCatalogRef.current = gifts;
              setGiftsCatalog(gifts);
            }
            const retryUrl = resolvePlayUrl(giftsCatalogRef.current);
            if (retryUrl) enqueueSpectatorGiftVideo(retryUrl);
          });
        }
      }
    };

    const handleStreamEnded = (data?: Record<string, unknown>) => {

      if (!mounted) return;
      const reason =
        data && typeof data.reason === 'string' ? data.reason : '';
      // Client-only reconnect exhaustion — never treat as host ending the live.
      if (reason === 'max_reconnect_attempts') {
        showToast('Connection lost. Trying to reconnect…');
        return;
      }
      // Creator moved into a battle room — follow them into the battle instead
      // of closing the live for every spectator.
      const battleRoom =
        data && typeof data.battle_room_id === 'string' ? data.battle_room_id : '';
      if (battleRoom) {
        if (battleRoom !== effectiveStreamId) {
          navigate(`/watch/${battleRoom}`, { replace: true });
          return;
        }
        // Same room is the battle room — stay; do not show "Stream ended".
        return;
      }
      if (reason === 'host_joined_battle') {
        return;
      }
      // Host WS grace races during battle must not kick spectators while PK UI
      // is active, or while LiveKit still has the host after a brief disconnect.
      const inBattle = !!spectatorBattleRef.current?.active;
      if (inBattle) return;
      if (reason === 'host_disconnected' && hasStreamRef.current) {
        const lkRoom = liveKitRoomRef.current;
        if (lkRoom?.state === ConnectionState.Connected) return;
      }
      setStreamEndedReceived(true);
      setStreamIsLive(false);
      websocket.disconnect();
      setTimeout(() => { if (mounted) navigate('/feed', { replace: true }); }, 2000);
    };

    const handleBattleStateSync = (data) => {
      if (!mounted) return;
      const toScore = (value: unknown, fallback = 0) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
      };
      const rawStatus = String(data.status || '').toUpperCase();
      // Creator entered battle layout (invite/WAITING) OR fight is ACTIVE →
      // spectators must mirror battle UI. Only ENDED returns them to normal live.
      const inBattleLayout =
        rawStatus === 'WAITING' ||
        rawStatus === 'ACTIVE' ||
        rawStatus === 'IN_BATTLE';
      if (rawStatus === 'ENDED') {
        setBattleStreamIds(null);
      } else if (inBattleLayout) {
        setBattleStreamIds({
          hostRoomId: typeof data.hostRoomId === 'string' ? data.hostRoomId : '',
          hostUserId: typeof data.hostUserId === 'string' ? data.hostUserId : '',
          opponentRoomId: typeof data.opponentRoomId === 'string' ? data.opponentRoomId : '',
          opponentUserId: typeof data.opponentUserId === 'string' ? data.opponentUserId : '',
        });
      }
      if (inBattleLayout) {
        const labels = battleTeamLabelsFromPayload(data);
        const status: 'WAITING' | 'ACTIVE' =
          rawStatus === 'WAITING' ? 'WAITING' : 'ACTIVE';
        const prevBattle = spectatorBattleRef.current;
        if (!prevBattle?.active || prevBattle.status === 'ENDED') {
          resetSpectatorSpeed();
        }
        setSpectatorBattle((prev) => ({
          active: true,
          status,
          hostScore: toScore(data.hostScore ?? data.host_score, prev?.hostScore ?? 0),
          opponentScore: toScore(data.opponentScore ?? data.opponent_score, prev?.opponentScore ?? 0),
          player3Score: toScore(data.player3Score ?? data.player3_score, prev?.player3Score ?? 0),
          player4Score: toScore(data.player4Score ?? data.player4_score, prev?.player4Score ?? 0),
          timeLeft: toScore(data.timeLeft, status === 'WAITING' ? 300 : (prev?.timeLeft ?? 300)),
          opponentName: data.opponentName || data.opponent_name || prev?.opponentName,
          opponentRoomId: data.opponentRoomId || prev?.opponentRoomId,
          redTeamLabel: labels.red || prev?.redTeamLabel || '',
          blueTeamLabel: labels.blue || prev?.blueTeamLabel || '',
          winner: undefined,
        }));
      } else if (rawStatus === 'ENDED') {
        setSpectatorBattle((prev) =>
          prev ? { ...prev, active: false, status: 'ENDED' } : null,
        );
        resetSpectatorSpeed();
        setTimeout(() => setSpectatorBattle(null), 2500);
      }
    };

    const handleBattleScore = (data) => {
      if (!mounted) return;
      const toScore = (value: unknown, fallback = 0) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
      };
      setBattleStreamIds(prev => {
        if (!prev) return prev;
        const newHostUid = typeof data.hostUserId === 'string' && data.hostUserId ? data.hostUserId : prev.hostUserId;
        const newOppUid = typeof data.opponentUserId === 'string' && data.opponentUserId ? data.opponentUserId : prev.opponentUserId;
        if (newHostUid === prev.hostUserId && newOppUid === prev.opponentUserId) return prev;
        return { ...prev, hostUserId: newHostUid, opponentUserId: newOppUid };
      });
      const labels = battleTeamLabelsFromPayload(data);
      const prev = spectatorBattleRef.current;
      const newH = toScore(data.hostScore, prev?.hostScore ?? 0);
      const newO = toScore(data.opponentScore, prev?.opponentScore ?? 0);
      const newP3 = toScore(data.player3Score ?? data.player3_score, prev?.player3Score ?? 0);
      const newP4 = toScore(data.player4Score ?? data.player4_score, prev?.player4Score ?? 0);
      const redDelta = (newH - (prev?.hostScore ?? 0)) + (newP3 - (prev?.player3Score ?? 0));
      const blueDelta = (newO - (prev?.opponentScore ?? 0)) + (newP4 - (prev?.player4Score ?? 0));
      if (redDelta > blueDelta && redDelta > 0) triggerBattleVfx('red', redDelta);
      else if (blueDelta > 0) triggerBattleVfx('blue', blueDelta);

      const redTotal = newH + newP3;
      const blueTotal = newO + newP4;
      const prevRedTotal = (prev?.hostScore ?? 0) + (prev?.player3Score ?? 0);
      const prevBlueTotal = (prev?.opponentScore ?? 0) + (prev?.player4Score ?? 0);
      if (redTotal > blueTotal && redTotal - prevRedTotal >= 25) {
        maybeTauntLeadChange('host', redTotal - prevRedTotal);
        pushBattleTaunt(createTauntBurst('opponent', 'lead'));
      } else if (blueTotal > redTotal && blueTotal - prevBlueTotal >= 25) {
        maybeTauntLeadChange('opponent', blueTotal - prevBlueTotal);
        pushBattleTaunt(createTauntBurst('host', 'lead'));
      }

      setSpectatorBattle(prevState => {
        const newOppName = (typeof data.opponentName === 'string' && data.opponentName) || prevState?.opponentName;
        const newOppRoom = (typeof data.opponentRoomId === 'string' && data.opponentRoomId) || prevState?.opponentRoomId;
        if (prevState?.active && newH === prevState.hostScore && newO === prevState.opponentScore &&
            newP3 === (prevState.player3Score ?? 0) && newP4 === (prevState.player4Score ?? 0) &&
            newOppName === prevState.opponentName && newOppRoom === prevState.opponentRoomId &&
            labels.red === prevState.redTeamLabel && labels.blue === prevState.blueTeamLabel) {
          return prevState;
        }
        return {
          active: true,
          status: 'ACTIVE' as const,
          timeLeft: prevState?.timeLeft ?? 300,
          hostScore: newH,
          opponentScore: newO,
          player3Score: newP3,
          player4Score: newP4,
          opponentName: newOppName,
          opponentRoomId: newOppRoom,
          winner: prevState?.winner,
          redTeamLabel: labels.red || prevState?.redTeamLabel || '',
          blueTeamLabel: labels.blue || prevState?.blueTeamLabel || '',
        };
      });
    };

    const handleBattleEnded = (data) => {
      if (!mounted) return;
      const toScore = (value: unknown, fallback = 0) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
      };
      setBattleStreamIds(null);
      const prev = spectatorBattleRef.current;
      const h = toScore(data.hostScore ?? data.host_score, prev?.hostScore ?? 0);
      const o = toScore(data.opponentScore ?? data.opponent_score, prev?.opponentScore ?? 0);
      const p3 = toScore(data.player3Score ?? data.player3_score, prev?.player3Score ?? 0);
      const p4 = toScore(data.player4Score ?? data.player4_score, prev?.player4Score ?? 0);
      const teamA = h + p3;
      const teamB = o + p4;
      const winner =
        (typeof data.winner === 'string' && data.winner) ||
        (teamA > teamB ? 'host' : teamA < teamB ? 'opponent' : 'draw');
      if (winner === 'host') {
        playBattleTauntSound('win');
        pushBattleTaunt(createTauntBurst('host', 'win'));
      } else if (winner === 'opponent') {
        playBattleTauntSound('win');
        pushBattleTaunt(createTauntBurst('opponent', 'win'));
      }
      const labels = battleTeamLabelsFromPayload(data);
      setSpectatorBattle((prevState) => {
        if (!prevState) return null;
        return {
          ...prevState,
          active: false,
          status: 'ENDED',
          hostScore: h,
          opponentScore: o,
          player3Score: p3,
          player4Score: p4,
          winner,
          redTeamLabel: labels.red || prevState.redTeamLabel || '',
          blueTeamLabel: labels.blue || prevState.blueTeamLabel || '',
        };
      });
      resetSpectatorSpeed();
      // Return spectators to normal live layout after a short end banner.
      setTimeout(() => setSpectatorBattle(null), 2500);
    };

    const handleHeartSent = (data) => {
      if (!mounted) return;
      if (typeof data.live_likes === 'number' && Number.isFinite(data.live_likes)) {
        setActiveLikes(Math.max(0, data.live_likes));
        return;
      }
      if (data.user_id === user?.id) return;
      const layer = spectatorChatHeartsRef.current;
      if (layer && layer.clientWidth > 0 && layer.clientHeight > 0) {
        const w = layer.clientWidth;
        const h = layer.clientHeight;
        const x = w * (0.58 + Math.random() * 0.35);
        const y = h * (0.18 + Math.random() * 0.58);
        spawnHeartAt(x, y, undefined, typeof data.username === 'string' ? data.username : undefined, typeof data.avatar === 'string' ? data.avatar : undefined);
      }
      setActiveLikes((prev) => prev + 1);
    };

    // Spectators only join and leave; they never send or bring their own layout. Layout is from the app (creator); server sends it on join, spectator only receives and displays it.
    const handleCohostLayoutSync = (data) => {
      if (!mounted) return;
      const list = Array.isArray(data.coHosts) ? data.coHosts : [];
      setSpectatorCoHosts(list.map((h) => ({
        id: String(h.id ?? h.userId ?? ''),
        userId: String(h.userId ?? ''),
        name: String(h.name ?? 'User'),
        avatar: String(h.avatar ?? ''),
        status: String(h.status ?? 'invited'),
      })));
      if (typeof data.hostUserId === 'string' && data.hostUserId) {
        setHostUserId(data.hostUserId);
        hostUserIdRef.current = data.hostUserId;
        syncMvpSlots();
      }
      if (typeof data.featuredUserId === 'string' && data.featuredUserId.trim()) {
        setFeaturedUserId(data.featuredUserId.trim());
      } else if (data.featuredUserId === null) {
        setFeaturedUserId(null);
      }
    };

    const handleCohostRequestAccepted = (data) => {
      if (!mounted || !user?.id) return;
      const hostName = data.hostName || 'Creator';
      const streamKey = data.streamKey || effectiveStreamId;
      showToast(`@${hostName} accepted — you're joining as co-host`);
      setShowCoHostPanel(false);
      navigate(`/watch/${streamKey}?cohost=1`, {
        replace: true,
        state: { fromCohostInvite: true },
      });
    };

    const handleCohostRequestDeclined = () => {
      if (!mounted) return;
      setJoinRequested(false);
      showToast('Creator declined your co-host request');
    };

    const handleCohostInvite = (data) => {
      if (!mounted) return;
      setPendingCoHostInvite({
        notifId: '',
        hostName: data.hostName || 'Creator',
        hostAvatar: data.hostAvatar || '',
        streamKey: data.streamKey || '',
        hostUserId: data.hostUserId || '',
      });
      setShowCoHostPanel(true);
      showToast(`@${data.hostName || 'Creator'} wants you to co-host — tap Join or Reject`);
    };

    // Battle invite while watching: show a Join/Reject banner. Accepting takes the
    // creator to the live battle page as a player, not the spectator page.
    const handleBattleInvite = (data) => {
      if (!mounted || !user?.id) return;
      setPendingBattleInvite({
        hostName: data.hostName || 'Creator',
        hostAvatar: data.hostAvatar || '',
        streamKey: data.streamKey || effectiveStreamId,
        hostUserId: data.hostUserId || '',
      });
      // Invite arrives → banner comes up; close bottom panels so Join/Reject is clear.
      setShowGiftPanel(false);
      setShowCoHostPanel(false);
      showToast(`@${data.hostName || 'Creator'} invited you to battle — tap Join`);
    };

    const handleGiftGoalSync = (data: unknown) => {
      if (!mounted) return;
      if (data == null) {
        setGiftGoal(null);
        return;
      }
      const parsed = parseLiveGiftGoal(data);
      if (parsed) setGiftGoal(parsed);
    };

    const onConnected = () => {
      // Re-sync battle layout if creator already switched to battle before we joined.
      battleGetState();
    };
    const unbindRoomWs = bindLiveRoomWs({
      onRoomState: handleRoomState,
      onUserJoined: handleUserJoined,
      onUserLeft: handleUserLeft,
      onChatMessage: handleChatMessage,
      onGiftSent: handleGiftSent,
      onGiftGoalSync: handleGiftGoalSync,
      onHeartSent: handleHeartSent,
      onStreamEnded: handleStreamEnded,
      onConnected,
    });
    const handleBoosterActivated = (data: unknown) => {
      const d = data as { user_id?: string; username?: string; multiplier?: number; expires_at?: number; duration_ms?: number };
      const mult = Number(d?.multiplier) || 0;
      const expiresAt = Number(d?.expires_at) || (Date.now() + (Number(d?.duration_ms) || 30000));
      if (d?.user_id && user?.id && String(d.user_id) === String(user.id)) {
        setActiveBooster({ multiplier: mult, expiresAt });
      }
      // The red boxing glove stays on the top-left for the full active window
      // (server ~30s) while it catches gifts — not a 1.8s flash.
      const id = `${Date.now()}-${Math.random()}`;
      const userId = String(d?.user_id || '');
      setBoosterActivations((prev) => [...prev, { id, userId, multiplier: mult, username: String(d?.username || ''), expiresAt }]);
      const ms = Math.max(1000, expiresAt - Date.now());
      setTimeout(() => setBoosterActivations((prev) => prev.filter((a) => a.id !== id)), ms);
    };
    const handleBoosterCaught = (data: unknown) => {
      const d = data as { multiplier?: number; final_points?: number; username?: string; transaction_id?: string };
      const id = String(d?.transaction_id || `${Date.now()}-${Math.random()}`);
      setBoosterCatches((prev) => (prev.some((c) => c.id === id) ? prev : [...prev, {
        id,
        multiplier: Number(d?.multiplier) || 0,
        finalPoints: Number(d?.final_points) || 0,
        username: String(d?.username || ''),
      }]));
      setTimeout(() => setBoosterCatches((prev) => prev.filter((c) => c.id !== id)), 2200);
    };
    const handleMistActivated = (data: unknown) => {
      const d = data as { supported_user_id?: string; supported_side?: string; expires_at?: number };
      const supportedUserId = String(d?.supported_user_id || '');
      const expiresAt = Number(d?.expires_at) || 0;
      if (!supportedUserId || expiresAt <= Date.now()) return;
      const supportedSide = d?.supported_side === 'opponent' ? 'opponent' : 'host';
      setMistFog({ supportedUserId, supportedSide, expiresAt });
    };

    // Server-authoritative battle clock (processBattleTick, 1 Hz). Sync the
    // spectator countdown to it so a backgrounded/throttled webview timer
    // self-corrects instead of drifting; scores still arrive via battle_score.
    const handleBattleTick = (data: { timeLeft?: number }) => {
      if (!mounted) return;
      const t = applyBattleTickTime(data?.timeLeft);
      if (t == null) return;
      setSpectatorBattle((prev) => (prev && prev.active ? { ...prev, timeLeft: t } : prev));
    };

    const unbindBattleWs = bindLiveBattleWs({
      onStateSync: handleBattleStateSync,
      onTick: handleBattleTick,
      onScore: handleBattleScore,
      onEnded: handleBattleEnded,
      onBoosterActivated: handleBoosterActivated,
      onBoosterCaught: handleBoosterCaught,
      onMistActivated: handleMistActivated,
    });
    const unbindCohostWs = bindLiveCohostWs({
      onLayoutSync: handleCohostLayoutSync,
      onRequestAccepted: handleCohostRequestAccepted,
      onRequestDeclined: handleCohostRequestDeclined,
      onInvite: handleCohostInvite,
    });
    const unbindBattleInviteWs = bindLiveBattleInviteWs({
      onInvite: handleBattleInvite,
    });

    connect();

    const goOffline = async (_reason: string) => {
      if (!mounted) return;
      // Already watching host video — another spectator joining must never tear this down.
      if (hasStreamRef.current) return;
      // Battle layout active — do not synthesize offline while PK is running.
      if (spectatorBattleRef.current?.active) return;
      const lkRoom = liveKitRoomRef.current;
      if (lkRoom?.state === ConnectionState.Connected) {
        const hid = hostUserIdRef.current || effectiveStreamId;
        for (const [, p] of lkRoom.remoteParticipants) {
          if (p.identity === hid || p.identity === effectiveStreamId) {
            for (const [, pub] of p.videoTrackPublications) {
              if (pub.track) return;
            }
          }
        }
      }
      // Fail open: streams list can lag / omit an active room under load.
      // Only leave if the API succeeds AND the room is confirmed absent.
      try {
        const { streams, error: goOfflineErr } = await apiLiveStreams();
        if (goOfflineErr) return;
        const streamRows = streams as Array<any>;
        const stillLive = streamRows.some(
          (s) => s.stream_key === effectiveStreamId || s.room_id === effectiveStreamId,
        );
        if (stillLive) return;
      } catch {
        return;
      }
      if (!mounted || hasStreamRef.current) return;
      showToast('Stream is offline');
      setStreamIsLive(false);
      websocket.disconnect();
      setTimeout(() => { if (mounted) navigate('/feed', { replace: true }); }, 2000);
    };

    const connectTimeout = setTimeout(() => {
      if (!mounted || hasStreamRef.current) return;
      // Host is often not listed in WS viewers — do NOT force hostFoundInRoom=false
      // from roomUsers alone (that falsely ends watch when another spectator joins).
      if (!hostFoundInRoom) goOffline('host_not_found_after_connect_timeout');
    }, 15000);

    const videoTimeout = setTimeout(() => {
      if (!mounted || hasStreamRef.current) return;
      const vid = videoRef.current;
      const hasTrack = vid?.srcObject && (vid.srcObject as MediaStream).getVideoTracks().length > 0;
      if (!hasTrack && !hostFoundInRoom) goOffline('no_video_track_and_host_not_found_after_video_timeout');
    }, 25000);

    return () => {
      mounted = false;
      clearTimeout(connectTimeout);
      clearTimeout(videoTimeout);
      unbindRoomWs();
      unbindBattleWs();
      unbindBattleInviteWs();
      unbindCohostWs();
      // Do NOT websocket.disconnect() here — battle/MVP callback identity churn was
      // tearing down the host room and making the live look "closed". Leave only
      // disconnects the intentional leave / stream_ended paths.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStreamId, user?.id, streamIsLive]);

  // Disconnect WS only when leaving this stream page entirely.
  useEffect(() => {
    return () => {
      websocket.disconnect();
    };
  }, []);

  // Clear the active booster indicator when its server-driven window expires.
  useEffect(() => {
    if (!activeBooster) return;
    const ms = activeBooster.expiresAt - Date.now();
    if (ms <= 0) { setActiveBooster(null); return; }
    const t = setTimeout(() => setActiveBooster(null), ms);
    return () => clearTimeout(t);
  }, [activeBooster]);

  useEffect(() => {
    if (!mistFog) return;
    const ms = mistFog.expiresAt - Date.now();
    if (ms <= 0) { setMistFog(null); return; }
    const t = setTimeout(() => setMistFog(null), ms);
    return () => clearTimeout(t);
  }, [mistFog]);

  // Fog hides the battle score for everyone except the creator being supported.
  const mistHidesMyScore = !!mistFog && mistFog.expiresAt > Date.now()
    && String(mistFog.supportedUserId) !== String(user?.id || '');

  // Share panel contacts: all platform users (same list as live share / ShareModal).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchAllSharePanelContacts(user?.id);
        const mapped = rows.map((r) => ({
          id: r.user_id,
          name: r.username,
          avatar: r.avatar_url || '',
        }));
        if (!cancelled) setShareContacts(mapped);
      } catch { /* intentionally empty */ }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Gift queue processor
  const [giftKey, setGiftKey] = useState(0);
  useEffect(() => {
    if (giftQueue.length > 0 && !currentGift) {
      setCurrentGift(giftQueue[0]);
      setGiftKey(k => k + 1);
      setGiftQueue(prev => prev.slice(1));
    }
  }, [giftQueue, currentGift]);

  const handleGiftEnded = useCallback(() => {
    setCurrentGift(null);
  }, []);

  useEffect(() => {
    if (!user?.id || !hostUserId) return;
    if (hostUserId === user.id) {
      setIsFollowing(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { following: ids, error: followingErr } = await apiFetchFollowingIds(user.id);
        if (followingErr || cancelled) return;
        if (!cancelled) setIsFollowing(ids.includes(hostUserId));
      } catch {
        if (!cancelled) setIsFollowing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, hostUserId]);

  const followHost = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!user?.id) {
        showToast('Log in to follow');
        navigate('/login', { state: { from: location.pathname } });
        return;
      }
      const targetId = hostUserIdRef.current || hostUserId;
      if (!targetId || targetId === user.id) return;
      try {
        const { error: followErr } = await apiToggleFollow(targetId, false);
        if (followErr) throw new Error('follow failed');
        setIsFollowing(true);
        const prev = useVideoStore.getState().followingUsers;
        if (!prev.includes(targetId)) {
          useVideoStore.setState({ followingUsers: [...prev, targetId] });
        }
      } catch {
        showToast('Could not follow. Try again.');
      }
    },
    [user?.id, hostUserId, navigate, location.pathname],
  );

  useEffect(() => {
    const creatorId = hostUserId;
    if (!creatorId) {
      setDiamondLeagueRank(null);
      return;
    }
    let cancelled = false;
    void apiLiveRankingsWeekly().then(({ data, error }) => {
      if (cancelled || error) return;
      const list = Array.isArray(data?.rankings) ? data.rankings : [];
      const idx = list.findIndex((r: { user_id?: string; id?: string; creator_id?: string }) => {
        const id = String(r?.user_id || r?.id || r?.creator_id || '');
        return id === String(creatorId);
      });
      setDiamondLeagueRank(idx >= 0 ? idx + 1 : null);
    });
    return () => {
      cancelled = true;
    };
  }, [hostUserId]);

  // Spectator keyboard → creator: send chat to creator's room (broadcast so creator and all viewers see it)
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    const newMsg: LiveMessage = {
      id: Date.now().toString(),
      username: viewerName,
      text: inputValue,
      level: userLevel,
      avatar: viewerAvatar,
      isMod: isModerator,
      membershipIcon: isMember ? '/royce/membership.svg' : undefined,
    };
    setMessages(prev => appendCapped(prev, newMsg, LIVE_CHAT_MESSAGE_CAP));
    liveChatSend( {
      text: inputValue,
      level: userLevel,
      avatar: viewerAvatar,
      is_member: isMember,
    });
    setInputValue('');
    if (effectiveStreamId) {
      earnBattleEnergyQuiet('comment', effectiveStreamId);
      void apiLiveEngagementProgress({
        metric: 'comments',
        delta: 1,
        roomId: effectiveStreamId,
      }).catch(() => {});
    }
  };

  // Spectator gift → creator: send to creator's room (broadcast so creator sees it and gets credit)
  const handleSendGift = async (gift: GiftUiItem, opts?: { fromCombo?: boolean }) => {
    if (!gift) return;
    if (opts?.fromCombo && comboCount >= GIFT_COMBO_MAX) return;
    const isGiftVideoFile = (value: string) => {
      const p = value.split('?')[0].toLowerCase();
      return p.endsWith('.mp4') || p.endsWith('.webm');
    };
    const usedTestCoins = Boolean(user?.id && shouldUseTestCoinsForGifts(user.id));
    const spendable = usedTestCoins
      ? getSpendableGiftBalance(coinBalance, user?.id)
      : giftSource === 'starter_coins'
        ? starterCoinBalance
        : giftSource === 'promotional_coins'
          ? promotionalCoinBalance
          : walletCoinBalanceRef.current;
    if (spendable < gift.coins) {
      showToast(`Not enough coins (have ${spendable.toLocaleString()}, need ${gift.coins.toLocaleString()})`);
      return;
    }
    if (!websocket.isConnected()) {
      showToast('Connecting... try again in a moment');
      return;
    }

    let newLevel = userLevel;
    // Persisted paid or Starter Coin gifts carry a transaction id so WebSocket
    // delivery can verify the source server-side.
    let giftTransactionId: string | null = null;

    if (usedTestCoins) {
      const debit = debitTestCoinsForGift((user as NonNullable<typeof user>).id, gift.coins);
      if (debit.ok === false) {
        showToast(`Not enough coins (have ${debit.balance.toLocaleString()}, need ${gift.coins.toLocaleString()})`);
        return;
      }
      setCoinBalance(
        displayBalanceAfterTestSpend(debit.newBalance, walletCoinBalanceRef.current),
      );
      // Test-only: drive a LOCAL level using the same curve as the server so the
      // level visibly climbs while testing. Never sent to the server / real XP.
      const sim = addTestGiftXp((user as NonNullable<typeof user>).id, gift.coins);
      if (sim.level > userLevel) {
        setUserLevel(sim.level);
        updateUser({ level: sim.level });
        newLevel = sim.level;
        setMessages((prev) => appendCapped(prev, {
            id: `levelup-${Date.now()}`,
            username: viewerName,
            text: `reached Level ${sim.level}`,
            level: sim.level,
            isGift: false,
            avatar: viewerAvatar,
            isSystem: true,
          }, LIVE_CHAT_MESSAGE_CAP));
      }
    } else if (user?.id) {
      try {
        const playableVideo =
          gift.video && gift.video.trim()
            ? gift.video.startsWith('http://') || gift.video.startsWith('https://')
              ? gift.video.trim()
              : resolveGiftAssetUrl(gift.video.startsWith('/') ? gift.video : `/${gift.video}`)
            : null;
        const paid = await sendLivePaidGift({
          streamKey: effectiveStreamId,
          giftId: gift.id,
          channel: 'spectator',
          giftSource,
          video: playableVideo,
          ...(spectatorBattle?.active
            ? { battleTarget: spectatorGiftBattleTarget }
            : {}),
          ...(!spectatorBattle?.active && selectedCohostGiftUserId
            ? { cohostTargetUserId: selectedCohostGiftUserId }
            : {}),
        });
        const result = paid.result;
        if (!paid.ok || !result) {
          const msg = paid.errorToast || '';
          if (msg.includes('frozen')) {
            showToast('Account is frozen. Contact support.');
            return;
          }
          if (msg.includes('INSUFFICIENT') || msg.includes('insufficient_funds') || msg.includes('insufficient') || msg.includes('Not enough')) {
            showToast('Not enough coins');
            return;
          }
          if (msg.includes('co-host') || msg.includes('INVALID_COHOST_TARGET')) {
            showToast('That co-host is no longer available');
            setSelectedCohostGiftUserId(null);
            return;
          }
          showToast(msg || 'Gift failed');
          return;
        }
        if (result.giftSource === 'starter_coins') {
          setStarterCoinBalance(
            Math.max(0, Number(result.newStarterBalance) || 0),
          );
          if (Number(result.newStarterBalance) <= 0) {
            setGiftSource('paid_coins');
          }
        } else if (result.giftSource === 'promotional_coins') {
          const nextPromo = Math.max(
            0,
            Number(result.newPromotionalBalance) || 0,
          );
          setPromotionalCoinBalance(nextPromo);
          if (nextPromo <= 0) {
            setGiftSource(
              starterCoinBalance > 0 ? 'starter_coins' : 'paid_coins',
            );
          }
        } else if (result.newBalance != null) {
          const nextWallet = Math.max(0, Number(result.newBalance));
          walletCoinBalanceRef.current = nextWallet;
          setCoinBalance(
            resolveGiftUiBalance(nextWallet, user?.id),
          );
        } else {
          void apiFetchWallet().then(({ balances, error: walletErr }) => {
            if (!walletErr && balances) {
              const nextWallet = Math.max(0, balances.paid);
              walletCoinBalanceRef.current = nextWallet;
              setCoinBalance(resolveGiftUiBalance(nextWallet, user?.id));
            }
          });
        }
        if (result.newLevel != null) {
          newLevel = Math.max(0, Number(result.newLevel) || 0);
          setUserLevel(newLevel);
          updateUser({ level: newLevel });
        }
        if (result.totalXp != null) {
          setUserXP(Math.max(0, Number(result.totalXp) || 0));
        }
        if (result.leveledUp) {
          setMessages((prev) => appendCapped(prev, {
              id: `levelup-${Date.now()}`,
              username: viewerName,
              text: `reached Level ${newLevel}`,
              level: newLevel,
              isGift: false,
              avatar: viewerAvatar,
              isSystem: true,
            }, LIVE_CHAT_MESSAGE_CAP));
          liveChatSend( {
            text: `reached Level ${newLevel}`,
            level: newLevel,
            avatar: viewerAvatar,
          });
        }
        giftTransactionId = result.transactionId || null;
        if (!giftTransactionId) {
          showToast('Gift failed — please try again');
          return;
        }
      } catch {
        showToast('Gift failed — please try again');
        return;
      }
    } else {
      showToast('Please sign in to send gifts');
      return;
    }

    setShowGiftPanel(false);

    // Test coins are local-only — never inflate gifts mission bar.
    if (!usedTestCoins) {
      setMissionGiftsSent((n) => n + 1);
    }

    if (gift.video && gift.video.trim() && isGiftVideoFile(gift.video)) {
      const raw = gift.video;
      const videoUrl = preferPlayableGiftVideoUrl(
        raw.startsWith('http://') || raw.startsWith('https://')
          ? raw
          : resolveGiftAssetUrl(raw.startsWith('/') ? raw : `/${raw}`),
      );
      setGiftQueue(prev => appendCapped(prev, { video: videoUrl }, LIVE_GIFT_QUEUE_CAP));
    }

    const giftMsg: LiveMessage = {
      id: Date.now().toString(),
      username: viewerName,
      text: `Sent a ${gift.name}`,
      isGift: true,
      level: newLevel,
      avatar: viewerAvatar,
    };
    setMessages(prev => appendCapped(prev, giftMsg, LIVE_CHAT_MESSAGE_CAP));
    // Test coins: animation + battle MATCH points only (never wallet/money).
    // Paid coins: REST-verified delivery applies money + battle in giftDelivery.
    if (usedTestCoins || giftTransactionId) {
      const wsVideo =
        gift.video && gift.video.trim()
          ? preferPlayableGiftVideoUrl(
              gift.video.startsWith('http://') || gift.video.startsWith('https://')
                ? gift.video.trim()
                : resolveGiftAssetUrl(gift.video.startsWith('/') ? gift.video : `/${gift.video}`),
            )
          : null;
      liveGiftSentWs( {
        giftId: gift.id,
        giftName: gift.name,
        username: viewerName,
        coins: gift.coins,
        gift_icon: gift.icon || '🎁',
        quantity: 1,
        level: newLevel,
        avatar: viewerAvatar,
        video: wsVideo,
        animation_url: wsVideo,
        transactionId: usedTestCoins ? null : giftTransactionId,
        giftSource: usedTestCoins ? 'test_coins' : giftSource,
        creator_name: hostName || 'Creator',
        host_user_id: hostUserId || effectiveStreamId,
        ...(spectatorBattle?.active
          ? { battleTarget: spectatorGiftBattleTarget }
          : {}),
        ...(!spectatorBattle?.active && selectedCohostGiftUserId
          ? {
              cohostTargetUserId: selectedCohostGiftUserId,
              cohost_target_user_id: selectedCohostGiftUserId,
            }
          : {}),
      });
    }
    

    setLastSentGift(gift);
    let nextCombo = 1;
    if (opts?.fromCombo) {
      nextCombo = Math.min(comboCount + 1, GIFT_COMBO_MAX);
      setComboCount(nextCombo);
    } else {
      setComboCount(1);
      nextCombo = 1;
    }
    pushComboStack(gift, nextCombo);
    setShowComboButton(true);
    resetComboTimer();
    pushLocalGiftPill({
      username: viewerName,
      giftName: gift.name,
      giftIcon: gift.icon || '🎁',
      avatar: viewerAvatar,
      quantity: 1,
      creatorName: hostName || 'Creator',
      streamId: effectiveStreamId,
    });
    if (spectatorBattle?.active && spectatorGiftBattleTarget === 'opponent' && gift.icon && (gift.icon.startsWith('http') || gift.icon.startsWith('/'))) {
      const iconUrl = gift.icon.startsWith('http')
        ? gift.icon
        : resolveGiftAssetUrl(gift.icon.startsWith('/') ? gift.icon : `/${gift.icon}`);
      setLastOpponentGift(iconUrl);
    }
  };

  const handleComboClick = () => {
    if (!lastSentGift) return;
    if (comboCount >= GIFT_COMBO_MAX) return;
    void handleSendGift(lastSentGift, { fromCombo: true });
  };

  const leaveStreamWithSlide = useCallback(() => {
    if (pageExiting) return;
    setPageExiting(true);
    window.setTimeout(() => {
      websocket.disconnect();
      if (coHostStream) {
        coHostStream.getTracks().forEach((t) => t.stop());
        setCoHostStream(null);
      }
      navigate('/feed', { replace: true });
    }, 250);
  }, [pageExiting, coHostStream, navigate]);


  const spectatorGate =
    streamIsLive === null ? 'loading' : streamIsLive === false ? 'offline' : 'live';



  return {
    SPEED_CHALLENGE_ENABLED,
    TEST_COINS_HASH,
    TEST_COINS_PWD_KEY,
    TEST_COINS_VERIFIED_KEY,
    _dailyHeartCount,
    _lastBattleScoreUpdateTraceSigRef,
    _myHeartCount,
    _openOpponentPanel,
    _setModerators,
    _setSelectedSpectatorUserId,
    _startCoHosting,
    acceptBattleInviteFromWatch,
    activeBooster,
    activeLikes,
    actualViewersRef,
    battleGloves,
    battleHideScores,
    battleInviteJoining,
    battleMistSide,
    battleMistTimerRef,
    battleScoreBarHidden,
    battleScreenTapCount,
    battleScreenTapCountRef,
    battleStreamIds,
    battleTauntBursts,
    boosterActivations,
    boosterCatches,
    engagementNowMs,
    engagementState,
    coHostChanRef,
    coHostPublishStreamRef,
    coHostStream,
    coHostVideoRefs,
    cohostGiftScores,
    cohostLastGifts,
    cohostState,
    coinBalance,
    comboCount,
    comboStack,
    comboTimerRef,
    currentGift,
    currentMainTrackRef,
    dailyHeartFetchedRef,
    declineBattleInviteFromWatch,
    diamondLeagueRank,
    effectiveStreamId,
    engagementOpen,
    engagementPanel,
    engagementWatchKeyedRef,
    featuredBigVideoRef,
    featuredUserId,
    featuredUserIdRef,
    findCoHostVideoEl,
    floatingHearts,
    followHost,
    formatTime,
    giftGoal,
    giftKey,
    giftQueue,
    giftSource,
    giftsCatalog,
    giftsCatalogRef,
    gloveIdRef,
    handleComboClick,
    handleGiftEnded,
    handleLikeTap,
    handleSendGift,
    handleSendMessage,
    handleSpectatorVote,
    handleSubscribe,
    hasJoinedToday,
    hasOpponentStream,
    hasStream,
    hasStreamRef,
    hostAvatar,
    hostLevel,
    hostName,
    hostSmallVideoRef,
    hostUserId,
    hostUserIdRef,
    inputValue,
    isCamOff,
    isChatVisible,
    isCoHostFromUrl,
    isCoHosting,
    isFollowing,
    isMember,
    isMicMuted,
    isModerator,
    isMoreMenuOpen,
    isReportModalOpen,
    isSpeakingUser,
    isSubscribing,
    joinRequested,
    lastOpponentGift,
    lastSentGift,
    leaveStreamWithSlide,
    liveConnectRetryKey,
    liveKitRoomRef,
    location,
    mainProvisionalTrackRef,
    markRemoteCam,
    messages,
    milestoneFlash,
    missionGiftsGoal,
    missionGiftsSent,
    missionWatchGoal,
    missionWatchMin,
    mistFog,
    mistHidesMyScore,
    moderators,
    mvpGiftScoresHostRef,
    mvpGiftScoresOpponentRef,
    mvpGiftScoresRef,
    mvpIdentityRef,
    mvpSlots,
    myVideoRef,
    navigate,
    opponentLifecycleRef,
    opponentLkRoomRef,
    opponentProfile,
    opponentProfileFetchedRef,
    opponentVideoRef,
    pageExiting,
    pendingBattleInvite,
    pendingCoHostInvite,
    prevMvpHostSpectatorRef,
    prevMvpOpponentSpectatorRef,
    prevSpectatorBattleActiveRef,
    promotionalCoinBalance,
    pushBattleTaunt,
    pushComboStack,
    rankingInitialTab,
    reachedThresholdsRef,
    remoteCamOff,
    resetComboTimer,
    resetSpectatorSpeed,
    resolveCircleAvatar,
    retryJoinRoom,
    roseCount,
    roseCountRef,
    seenGiftTxnRef,
    selectedCohostGiftUserId,
    selectedSpectatorUserId,
    sendCohostJoinRequest,
    setActiveBooster,
    setActiveLikes,
    setBattleGloves,
    setBattleHideScores,
    setBattleInviteJoining,
    setBattleMistSide,
    setBattleScoreBarHidden,
    setBattleScreenTapCount,
    setBattleStreamIds,
    setBattleTauntBursts,
    setBoosterActivations,
    setBoosterCatches,
    setCoHostStream,
    setCohostGiftScores,
    setCohostLastGifts,
    setCoinBalance,
    setComboCount,
    setComboStack,
    setCurrentGift,
    setDailyHeartCount,
    setDiamondLeagueRank,
    setEngagementOpen,
    setEngagementPanel,
    setFeaturedUserId,
    setFloatingHearts,
    setGiftGoal,
    setGiftKey,
    setGiftQueue,
    setGiftSource,
    setGiftsCatalog,
    setHasJoinedToday,
    setHasOpponentStream,
    setHasStream,
    setHostAvatar,
    setHostLevel,
    setHostName,
    setHostUserId,
    setInputValue,
    setIsCamOff,
    setIsChatVisible,
    setIsCoHosting,
    setIsFollowing,
    setIsMember,
    setIsMicMuted,
    setIsMoreMenuOpen,
    setIsReportModalOpen,
    setIsSubscribing,
    setJoinRequested,
    setLastOpponentGift,
    setLastSentGift,
    setLiveConnectRetryKey,
    setMessages,
    setMissionGiftsGoal,
    setMissionGiftsSent,
    setMissionWatchGoal,
    setMissionWatchMin,
    setMistFog,
    setMvpSlots,
    setMyHeartCount,
    setOpponentProfile,
    setPageExiting,
    setPendingBattleInvite,
    setPendingCoHostInvite,
    setPromotionalCoinBalance,
    setRankingInitialTab,
    setRemoteCamOff,
    setRoseCount,
    setSelectedCohostGiftUserId,
    setShareContacts,
    setShareQuery,
    setShowCoHostPanel,
    setShowComboButton,
    setShowFanClub,
    setShowGiftPanel,
    setShowOpponentPanel,
    setShowPromotePanel,
    setShowRankingPanel,
    setShowRetryButton,
    setShowSharePanel,
    setShowTestCoinsModal,
    setShowViewersPanel,
    setSpeakingIds,
    setSpectatorBattle,
    setSpectatorCoHostRequestSent,
    setSpectatorCoHosts,
    setSpectatorGiftBattleTarget,
    setSpeedChallengeActive,
    setSpeedChallengeTime,
    setSpeedMultiplier,
    setStarterCoinBalance,
    setStreamEndedReceived,
    setStreamIsLive,
    setStreamRetryKey,
    setTestCoinsAmount,
    setTestCoinsError,
    setTestCoinsPwd,
    setTestCoinsSavePwd,
    setTestCoinsStep,
    setUserLevel,
    setUserXP,
    setViewerCount,
    setViewersList,
    shareContacts,
    shareQuery,
    showCoHostPanel,
    showComboButton,
    showFanClub,
    showGiftPanel,
    showOpponentPanel,
    showPromotePanel,
    showRankingPanel,
    showRetryButton,
    showSharePanel,
    showTestCoinsModal,
    showViewersPanel,
    spawnHeartAt,
    spawnHeartAtSideSpectator,
    spawnHeartFromClient,
    speakingIds,
    spectatorBattle,
    spectatorBattleRef,
    spectatorBattleVoteRemainingRef,
    spectatorChatHeartsRef,
    spectatorCoHostRequestSent,
    spectatorCoHosts,
    spectatorGate,
    spectatorGiftBattleTarget,
    spectatorLifecycleRef,
    spectatorStageRef,
    speedChallengeActive,
    speedChallengeTime,
    speedMultiplier,
    speedMultiplierRef,
    startSpeedChallenge,
    stageFlash,
    starterCoinBalance,
    stopCoHosting,
    streamEndedReceived,
    streamIsLive,
    streamRetryKey,
    syncMvpSlots,
    syncMvpSlotsRef,
    testCoinsAmount,
    testCoinsError,
    testCoinsPwd,
    testCoinsPwdRef,
    testCoinsSavePwd,
    testCoinsStep,
    toggleCam,
    toggleFeaturedUser,
    toggleMic,
    triggerBattleVfx,
    updateUser,
    user,
    userLevel,
    userXP,
    videoRef,
    viewerAvatar,
    viewerCount,
    viewerName,
    viewersList,
    votePoll,
    walletCoinBalanceRef,
    wasCohostSeatedRef,
  };
}
