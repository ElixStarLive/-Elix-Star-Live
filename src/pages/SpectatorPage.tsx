import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { RoyceBackIcon, RoyceCloseIcon } from '../components/royce';
import { showToast } from '../lib/toast';
import { IS_STORE_BUILD } from '../config/build';
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
  Gem,
  Star,
  PlusCircle,
  Play,
  CloudFog,
  BarChart3,
} from 'lucide-react';
import { GiftPanel } from '../components/GiftPanel';
import { GiftGoalGallery } from '../components/GiftGoalGallery';
import { LiveGiftGoalBar } from '../components/LiveGiftGoalBar';
import { LiveEngagementOverlay } from '../components/LiveEngagementOverlay';
import { useLiveEngagement } from '../hooks/useLiveEngagement';
import { GiftUiItem, GIFT_COMBO_MAX, resolveGiftAssetUrl, fetchGiftsFromDatabase, pickGiftVideoUrl, formatGiftDisplayName } from '../lib/giftsCatalog';
import { appendCapped, LIVE_CHAT_MESSAGE_CAP, LIVE_GIFT_QUEUE_CAP } from '../lib/liveRuntimeCaps';
import { BattleVfxOverlays, GloveIcon, type BattleMistSide, type GloveBurst } from '../components/BattleVfxOverlays';
import { BattleTauntOverlays } from '../components/BattleTauntOverlays';
import {
  announceMvpName,
  createTauntBurst,
  maybeTauntLeadChange,
  playBattleTauntSound,
  type TauntBurst,
} from '../lib/battleTaunts';
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
} from '../lib/testCoins';
import { GiftOverlay } from '../components/GiftOverlay';
import GiftAnimationOverlay, { pushLocalGiftPill } from '../components/GiftAnimationOverlay';
import { LiveGiftFeedStack } from '../components/LiveGiftFeedStack';
import { ChatOverlay } from '../components/ChatOverlay';
import { AvatarRing } from '../components/AvatarRing';
import { LevelBadge } from '../components/LevelBadge';
import {
  SPECTATOR_BATTLE_PROFILE_RING_PX,
  BATTLE_MVP_ROW_EDGE_OFFSET_MM,
  SPECTATOR_MVP_PROFILE_RING_PX,
  LIVE_MVP_PROFILE_RING_PX,
  LIVE_BATTLE_VIDEO_HEIGHT,
  LIVE_BATTLE_CHAT_HEIGHT,
  LIVE_BATTLE_CHAT_SHIFT_Y,
  LIVE_TOP_AVATAR_RING_PX,
  LIVE_BOTTOM_ACTION_PADDING,
  LIVE_BOTTOM_ACTION_RESERVE,
} from '../lib/profileFrame';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import { getLiveKitUrl } from '../lib/api';
import {
  fetchAllSharePanelContacts,
  SHARE_PANEL_ACTION_DISC_PX,
  SHARE_PANEL_ACTION_ICON_PX,
  SHARE_PANEL_AVATAR_PX,
  SHARE_PANEL_ITEM_WIDTH_PX,
} from '../lib/sharePanelContacts';
import { request } from '../lib/apiClient';
import { openExternalLink } from '../lib/platform';
import ReportModal from '../components/ReportModal';
import PromotePanel from '../components/PromotePanel';
import { RankingPanel } from '../components/RankingPanel';
import { type LiveRankTab } from '../components/CyclingRankBadge';
import {
  LiveGiftComboColumn,
  LiveComboMissionDock,
  LiveHostProfileHeader,
  LiveJoinPill,
  LiveMarkedSubHeaderBar,
  LiveMarkedUiDemoToggle,
  buildLiveMarkedUiDemoComboStack,
  readLiveMarkedUiDemoEnabled,
  writeLiveMarkedUiDemoEnabled,
} from '../components/LiveMarkedTopUi';
import {
  LiveSideMissionStack,
  LIVE_SIDE_DEMO_MISSIONS,
  LIVE_SIDE_DEMO_SUPPORTERS,
} from '../components/LiveSideMissionStack';
import { websocket } from '../lib/websocket';
import { normalizeBattleGiftTarget } from '../lib/liveBattleGiftTarget';
import { parseLiveGiftGoal, type LiveGiftGoal } from '../lib/liveGiftGoal';
import { resolveUiAvatarUrl } from '../lib/royceAssets';
import { getMembershipStatus, purchaseMembership } from '../lib/iap';
import { Room, RoomEvent, LocalVideoTrack, LocalAudioTrack, ConnectionState } from 'livekit-client';

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

export default function SpectatorPage() {
  const { streamId } = useParams<{ streamId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const effectiveStreamId = streamId || '';

  const [giftsCatalog, setGiftsCatalog] = useState<GiftUiItem[]>([]);
  const giftsCatalogRef = useRef<GiftUiItem[]>([]);
  useEffect(() => { giftsCatalogRef.current = giftsCatalog; }, [giftsCatalog]);
  // Dedup gift_sent (REST delivery + optional WS echo of the same transaction).
  const seenGiftTxnRef = useRef<Set<string>>(new Set());
  useEffect(() => { let c = false; fetchGiftsFromDatabase().then(g => { if (!c) setGiftsCatalog(g); }); return () => { c = true; }; }, []);
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
  const [giftSource, setGiftSource] = useState<"starter_coins" | "paid_coins">(
    "paid_coins",
  );

  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [giftGoal, setGiftGoal] = useState<LiveGiftGoal | null>(null);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showPromotePanel, setShowPromotePanel] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
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
  const [markedUiDemo, setMarkedUiDemo] = useState(() => readLiveMarkedUiDemoEnabled(IS_STORE_BUILD));
  const demoComboStack = markedUiDemo ? buildLiveMarkedUiDemoComboStack() : [];
  const visibleComboStack = comboStack.length > 0 ? comboStack : demoComboStack;
  const showComboColumn = (showComboButton && comboStack.length > 0) || (markedUiDemo && demoComboStack.length > 0);
  const [missionWatchMin, setMissionWatchMin] = useState(0);
  const [missionGiftsSent, setMissionGiftsSent] = useState(0);
  const [userXP, setUserXP] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setMissionWatchMin((m) => Math.min(30, m + 1));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
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
  const [viewersList, setViewersList] = useState<{ id: string; name: string; avatar: string; level?: number }[]>([]);
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

    // Battle sides: only viewers who scored on THAT side. Never mirror the same person on both.
    const pickSide = (side: 'host' | 'opponent') => {
      const scores = side === 'host' ? mvpGiftScoresHostRef.current : mvpGiftScoresOpponentRef.current;
      const other = side === 'host' ? mvpGiftScoresOpponentRef.current : mvpGiftScoresHostRef.current;
      const list = base.filter((s) => {
        const mine = scores[s.id] ?? 0;
        if (mine <= 0) return false;
        const theirs = other[s.id] ?? 0;
        // Higher side wins; equal scores → host only (never both).
        if (side === 'host') return mine >= theirs;
        return mine > theirs;
      });
      return withPoints(scores, [...list].sort(sortBy(scores)).slice(0, 3));
    };

    setMvpSlots({
      global: withPoints(mvpGiftScoresRef.current, [...base].sort(sortBy(mvpGiftScoresRef.current)).slice(0, 3)),
      host: pickSide('host'),
      opponent: pickSide('opponent'),
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
    websocket.send('cohost_request_send', {
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
    request(`/api/hearts/daily/${hostUserId}`).then(({ data: d }) => {
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
    }
    prevSpectatorBattleActiveRef.current = active;
  }, [spectatorBattle?.active, spectatorBattle?.status]);

  const _openOpponentPanel = useCallback(() => {
    const oppId = battleStreamIds?.opponentUserId;
    if (!oppId) return;
    setShowOpponentPanel(true);
    if (opponentProfileFetchedRef.current === oppId) return;
    opponentProfileFetchedRef.current = oppId;
    (async () => {
      try {
        const { data: body, error } = await request(`/api/profiles/${encodeURIComponent(oppId)}`);
        if (error || !body) return;
        const p = body?.profile || body?.data || {};
        setOpponentProfile({
          displayName: p.displayName || p.username || spectatorBattle?.opponentName || 'Opponent',
          username: p.username || '',
          avatarUrl: p.avatarUrl || '',
          followers: Number(p.followersCount ?? p.followers ?? 0),
          following: Number(p.followingCount ?? p.following ?? 0),
          level: Number(p.level ?? 0),
          bio: p.bio || '',
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
    websocket.send('battle_spectator_vote', { target });
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
    const ackPromise = new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (ok: boolean) => {
        if (settled) return;
        settled = true;
        websocket.off('battle_accept_ack', onAck);
        websocket.off('battle_error', onErr);
        resolve(ok);
      };
      const onAck = () => settle(true);
      const onErr = () => settle(false);
      websocket.on('battle_accept_ack', onAck);
      websocket.on('battle_error', onErr);
      window.setTimeout(() => settle(false), 8000);
    });
    try {
      websocket.send('battle_invite_accept', {
        hostUserId: invite.hostUserId,
        requesterName: user?.username || user?.name || 'User',
        requesterAvatar: user?.avatar || '',
        streamKey: user?.id || effectiveStreamId,
        hostStreamKey: invite.streamKey,
      });
    } catch { /* fire-and-forget */ }
    showToast(`Joining @${invite.hostName}'s battle...`);
    const granted = await ackPromise;
    setBattleInviteJoining(false);
    if (!granted) {
      showToast('Could not join the battle — invite is no longer valid');
      return;
    }
    setPendingBattleInvite(null);
    try { sessionStorage.setItem(`battleAccept:${invite.streamKey}`, '1'); } catch { /* ignore */ }
    navigate(`/live/${invite.streamKey}?battle=1`, {
      state: { battleHost: { userId: invite.hostUserId, name: invite.hostName, avatar: invite.hostAvatar } },
    });
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
      if (opponentLkRoomRef.current) {
        opponentLkRoomRef.current.disconnect();
        opponentLkRoomRef.current = null;
      }
      if (!spectatorBattle?.active) setHasOpponentStream(false);
      return;
    }
    // Opponent room id may equal host room when they already joined the battle room.
    if (roomId === effectiveStreamId) return;

    let mounted = true;
    const room = new Room();
    opponentLkRoomRef.current = room;
    (async () => {
      try {
        const { data: payload, error: tokenErr } = await request(`/api/live/token?room=${encodeURIComponent(roomId)}`);
        if (tokenErr || !mounted) return;
        const token = payload?.token;
        const url = (payload?.url ?? '').trim() || getLiveKitUrl();
        if (!token || !url || !mounted) return;
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (!mounted || track.kind !== 'video') return;
          const el = opponentVideoRef.current;
          if (el) {
            track.attach(el);
            void el.play().catch(() => {});
            setHasOpponentStream(true);
          }
        });
        await room.connect(url, token);
        if (!mounted) { room.disconnect(); return; }
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
      room.disconnect();
      if (opponentLkRoomRef.current === room) opponentLkRoomRef.current = null;
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

  const [isCoHosting, setIsCoHosting] = useState(false);
  const [coHostStream, setCoHostStream] = useState<MediaStream | null>(null);
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

  const _stopCoHosting = () => {
    if (coHostStream) {
      coHostStream.getTracks().forEach(t => t.stop());
      setCoHostStream(null);
    }
    if (coHostChanRef.current) {
      coHostChanRef.current = null;
    }
    setIsCoHosting(false);
    setIsMicMuted(true);
    setIsCamOff(false);
  };

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
      myVideoRef.current.play().catch(() => {});
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
    if (websocket.isConnected()) {
      websocket.send('heart_sent', { username: viewerName, avatar: viewerAvatar });
    }
  }, [viewerName, viewerAvatar, spawnHeartFromClient, spawnHeartAtSideSpectator]);

  const [hasStream, setHasStream] = useState(false);
  const hasStreamRef = useRef(false);
  useEffect(() => {
    hasStreamRef.current = hasStream;
  }, [hasStream]);
  const [liveConnectRetryKey, setLiveConnectRetryKey] = useState(0);
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
            const { data: profileBody } = await request(`/api/profiles/${encodeURIComponent(uid)}`);
            if (cancelled || !profileBody) return;
            const profile = profileBody?.profile || profileBody?.data || {};
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

        const { data: json, error: streamsErr } = await request('/api/live/streams', {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        });
        const streams = !streamsErr && json && Array.isArray(json.streams) ? json.streams : [];
        const stream =
          streams.find((s) => s.stream_key === effectiveStreamId) ||
          streams.find((s) => s.room_id === effectiveStreamId);

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
        const { data: tokenData, error: tokenErr } = await request(
          `/api/live/token?room=${encodeURIComponent(effectiveStreamId)}&publish=0`,
        );
        if (cancelled) return;
        if (tokenErr || !tokenData?.token) {
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

  // LiveKit: spectator sees creator's live video/audio in real time — same room, subscribe to host tracks and attach to videoRef/audio
  const liveKitRoomRef = useRef<Room | null>(null);
  const coHostPublishStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    if (!streamIsLive || !effectiveStreamId || !user?.id) return;

    let mounted = true;
    const room = new Room({ adaptiveStream: true });
    liveKitRoomRef.current = room;
    const isCoHost = isCoHostFromUrl;

    (async () => {
      try {
        // When watching (no ?cohost=1): subscribe-only token, never request or use microphone — listen only.
        const publishParam = isCoHost ? '&publish=1' : '&publish=0';
        const { data, error: tokenError } = await request(`/api/live/token?room=${encodeURIComponent(effectiveStreamId)}${publishParam}`);
        if (tokenError || !mounted) {
          if (tokenError?.message?.includes('401')) showToast('Please log in to watch');
          else if (tokenError?.message?.includes('503')) showToast('Live video is not configured on server');
          return;
        }
        let url = (data?.url ?? '').trim();
        if (!url) url = getLiveKitUrl();
        const token = data?.token;
        if (!url || !token || !mounted) {
          showToast('Missing LiveKit URL. Set LIVEKIT_URL on server.');
          return;
        }

        const hostId = hostUserIdRef.current || effectiveStreamId;
        let mainVideoAttached = false;
        let myIdentity = '';
        const onTrackSubscribed = (track: import('livekit-client').RemoteTrack, publication?: import('livekit-client').TrackPublication, participant?: import('livekit-client').RemoteParticipant) => {
          if (!mounted) return;
          const identity = participant?.identity || '';
          if (track.kind === 'video' && publication?.isMuted && identity) {
            setRemoteCamOff((prev) => { const n = new Set(prev); n.add(identity); return n; });
          }
          const isSelf = identity === myIdentity;
          if (track.kind === 'audio') {
            const isHost = identity === hostId || identity === effectiveStreamId;
            // Never attach/play remote audio if it's our own track (e.g. host watching own stream in another tab)
            if (isSelf) return;
            if (isHost) track.attach();
            return;
          }
          if (track.kind === 'video' && participant && videoRef.current) {
            const isHost = identity === hostId || identity === effectiveStreamId;
            if (isSelf) return;
            if (isHost) {
              // Host always owns the big box; evict any provisional co-host first.
              if (mainProvisionalTrackRef.current && mainProvisionalTrackRef.current !== track) {
                try { mainProvisionalTrackRef.current.detach(videoRef.current); } catch { /* noop */ }
              }
              mainProvisionalTrackRef.current = null;
              track.attach(videoRef.current);
              currentMainTrackRef.current = track;
              mainVideoAttached = true;
              setHasStream(true);
              return;
            }
            // Non-host (co-host): belongs in a small tile, never the big box.
            const el = coHostVideoRefs.current.get(identity);
            if (el) {
              track.attach(el);
              // If this co-host was provisionally shown in the big box, remove them from it.
              if (mainProvisionalTrackRef.current === track) {
                try { track.detach(videoRef.current); } catch { /* noop */ }
                mainProvisionalTrackRef.current = null;
                mainVideoAttached = false;
              }
              return;
            }
            // No tile yet and host not shown — provisionally fill the big box so it isn't blank.
            if (!mainVideoAttached) {
              track.attach(videoRef.current);
              currentMainTrackRef.current = track;
              mainProvisionalTrackRef.current = track;
              mainVideoAttached = true;
              setHasStream(true);
            }
          }
        };

        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          onTrackSubscribed(track, publication, participant);
        });
        // Read-only: pulse whichever participant is currently speaking.
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          if (!mounted) return;
          setSpeakingIds(new Set(speakers.map((s) => s.identity).filter(Boolean)));
        });
        // Read-only: track co-host camera-off (video track muted) to show their avatar.
        room.on(RoomEvent.TrackMuted, (pub, participant) => {
          if (!mounted || pub.kind !== 'video') return;
          const id = participant?.identity;
          if (!id) return;
          setRemoteCamOff((prev) => { const n = new Set(prev); n.add(id); return n; });
        });
        room.on(RoomEvent.TrackUnmuted, (pub, participant) => {
          if (!mounted || pub.kind !== 'video') return;
          const id = participant?.identity;
          if (!id) return;
          setRemoteCamOff((prev) => { const n = new Set(prev); n.delete(id); return n; });
        });
        await room.connect(url, token);
        if (!mounted) {
          room.disconnect();
          return;
        }
        myIdentity = room.localParticipant?.identity ?? '';
        for (const [, participant] of room.remoteParticipants) {
          const identity = participant.identity || '';
          const isHost = identity === hostId || identity === effectiveStreamId;
          const isSelf = identity === myIdentity;
          if (isSelf) continue;
          for (const [, publication] of participant.videoTrackPublications) {
            if (publication.isMuted && identity) {
              setRemoteCamOff((prev) => { const n = new Set(prev); n.add(identity); return n; });
            }
            if (publication.track && publication.isSubscribed && videoRef.current) {
              const track = publication.track;
              if (isHost) {
                if (mainProvisionalTrackRef.current && mainProvisionalTrackRef.current !== track) {
                  try { mainProvisionalTrackRef.current.detach(videoRef.current); } catch { /* noop */ }
                }
                mainProvisionalTrackRef.current = null;
                track.attach(videoRef.current);
                currentMainTrackRef.current = track;
                mainVideoAttached = true;
                setHasStream(true);
              } else {
                const el = coHostVideoRefs.current.get(identity);
                if (el) {
                  track.attach(el);
                  if (mainProvisionalTrackRef.current === track) {
                    try { track.detach(videoRef.current); } catch { /* noop */ }
                    mainProvisionalTrackRef.current = null;
                    mainVideoAttached = false;
                  }
                } else if (!mainVideoAttached) {
                  track.attach(videoRef.current);
                  currentMainTrackRef.current = track;
                  mainProvisionalTrackRef.current = track;
                  mainVideoAttached = true;
                  setHasStream(true);
                }
              }
            }
          }
          for (const [, publication] of participant.audioTrackPublications) {
            if (publication.track && publication.isSubscribed && isHost) publication.track.attach();
          }
        }

        // Co-host only: publish camera + microphone. When only watching we never request mic — listen only.
        if (!isCoHost) {
          // Watch-only: no getUserMedia, no publish — spectator only listens to host audio.
        } else if (mounted) {
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
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
              const localVideo = new LocalVideoTrack(videoTrack);
              await room.localParticipant.publishTrack(localVideo, { name: 'camera' });
            }
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
              audioTrack.enabled = false; // Co-host starts muted; unmute when they want to speak
              const localAudio = new LocalAudioTrack(audioTrack);
              await room.localParticipant.publishTrack(localAudio, { name: 'mic' });
            }
            setCoHostStream(stream);
            setIsCoHosting(true);
            showToast('You are co-hosting. Unmute to speak.');
          } catch (e) {
            console.warn('[LiveKit] Co-host publish failed:', e);
            showToast('Could not start camera. Host will not see your video.');
          }
        }
      } catch (err) {
        if (mounted) {
          setHasStream(false);
          console.error('[LiveKit] Viewer connect failed:', err);
          showToast('Could not connect to stream. Is the host live?');
        }
      }
    })();

    return () => {
      mounted = false;
      liveKitRoomRef.current = null;
      if (coHostPublishStreamRef.current) {
        coHostPublishStreamRef.current.getTracks().forEach((t) => t.stop());
        coHostPublishStreamRef.current = null;
      }
      room.disconnect();
    };
  }, [streamIsLive, effectiveStreamId, user?.id, liveConnectRetryKey, isCoHostFromUrl]);

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
      if (identity !== hostId && identity !== effectiveStreamId) continue;
      for (const [, pub] of participant.videoTrackPublications) {
        if (pub.track && pub.isSubscribed) {
          pub.track.attach(videoEl);
          currentMainTrackRef.current = pub.track;
          setHasStream(true);
          return;
        }
      }
    }
  }, [spectatorBattle?.active, effectiveStreamId]);

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

    Promise.all([request('/api/wallet/'), request('/api/progression/me')])
      .then(([wallet, progression]) => {
        if (cancelled) return;
        const walletRaw = wallet.data?.coin_balance ?? wallet.data?.balance;
        const walletBal =
          !wallet.error && walletRaw != null
            ? Math.max(0, Number(walletRaw))
            : 0;
        walletCoinBalanceRef.current = walletBal;
        setCoinBalance(resolveGiftUiBalance(walletBal, user.id));
        const p = progression.data?.progression;
        const starter = Math.max(0, Number(p?.starter_coin_balance) || 0);
        setStarterCoinBalance(starter);
        setGiftSource(starter > 0 ? 'starter_coins' : 'paid_coins');
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
      void request('/api/wallet/').then(({ data, error: walletErr }) => {
        const walletRaw = data?.coin_balance ?? data?.balance;
        if (!walletErr && walletRaw != null) {
          walletCoinBalanceRef.current = Math.max(0, Number(walletRaw));
        }
      });
    } else {
      void request('/api/wallet/').then(({ data, error: walletErr }) => {
        const walletRaw = data?.coin_balance ?? data?.balance;
        if (!walletErr && walletRaw != null) {
          const walletBal = Math.max(0, Number(walletRaw));
          walletCoinBalanceRef.current = walletBal;
          setCoinBalance(walletBal);
        }
      });
    }
    request('/api/progression/me').then(({ data, error }) => {
      if (!error && data?.progression) {
        const starter = Math.max(
          0,
          Number(data.progression.starter_coin_balance) || 0,
        );
        setStarterCoinBalance(starter);
        if (starter <= 0) setGiftSource('paid_coins');
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
      websocket.connect(effectiveStreamId, token);
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
        void request(`/api/profiles/${encodeURIComponent(uid)}`).then(({ data: body }) => {
          if (!mounted) return;
          const prof = body?.profile || body?.data || {};
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
      const msg: LiveMessage = {
        id: `ws-${Date.now()}-${Math.random()}`,
        username: typeof data.username === 'string' ? data.username : 'User',
        text,
        level: Number.isFinite(parsedLevel)
          ? parsedLevel
          : Number.isFinite(Number(data.level)) && Number(data.level) >= 0
            ? Math.floor(Number(data.level))
            : 1,
        avatar: typeof data.avatar === 'string' ? data.avatar : '',
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
      // Skip echo of our own gift — sender already queued local animation/chat.
      if (gifterId && user?.id && gifterId === user.id) return;
      const giftCoins =
        giftDef?.coins ??
        (typeof data.coins === 'number' && Number.isFinite(data.coins) ? data.coins : 0);
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
      }
      // Play gift video for other users' gifts (sender already queued locally).
      {
        const videoUrl =
          pickGiftVideoUrl(data, giftsCatalogRef.current) ||
          (wsGiftId
            ? pickGiftVideoUrl(
                { giftId: wsGiftId, gift_id: wsGiftId },
                giftsCatalogRef.current,
              )
            : null);
        if (videoUrl) {
          setGiftQueue((prev) => appendCapped(prev, { video: videoUrl }, LIVE_GIFT_QUEUE_CAP));
        }
      }
    };

    const handleStreamEnded = (data?: Record<string, unknown>) => {

      if (!mounted) return;
      // Creator moved into a battle room — follow them into the battle instead
      // of closing the live for every spectator.
      const battleRoom =
        data && typeof data.battle_room_id === 'string' ? data.battle_room_id : '';
      if (battleRoom && battleRoom !== effectiveStreamId) {
        navigate(`/watch/${battleRoom}`, { replace: true });
        return;
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

    websocket.on('room_state', handleRoomState);
    websocket.on('user_joined', handleUserJoined);
    websocket.on('user_left', handleUserLeft);
    websocket.on('chat_message', handleChatMessage);
    websocket.on('gift_sent', handleGiftSent);
    websocket.on('gift_goal_sync', handleGiftGoalSync);
    websocket.on('heart_sent', handleHeartSent);
    websocket.on('stream_ended', handleStreamEnded);
    const handleBattleScoreUpdateColon = (data) => {
      if (!mounted) return;
      const p = data?.players;
      if (!p || typeof p !== 'object') return;
      setSpectatorBattle((prev) => {
        if (!prev?.active) return prev;
        const toScore = (value: unknown, fallback: number) => {
          const n = Number(value);
          return Number.isFinite(n) ? n : fallback;
        };
        const newH = Math.max(prev.hostScore, toScore(p.A1, prev.hostScore));
        const newO = Math.max(prev.opponentScore, toScore(p.B1, prev.opponentScore));
        const newP3 = Math.max(prev.player3Score ?? 0, toScore(p.A2, prev.player3Score ?? 0));
        const newP4 = Math.max(prev.player4Score ?? 0, toScore(p.B2, prev.player4Score ?? 0));
        if (newH === prev.hostScore && newO === prev.opponentScore &&
            newP3 === (prev.player3Score ?? 0) && newP4 === (prev.player4Score ?? 0)) {
          return prev;
        }
        return { ...prev, hostScore: newH, opponentScore: newO, player3Score: newP3, player4Score: newP4 };
      });
    };
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

    websocket.on('battle_state_sync', handleBattleStateSync);
    websocket.on('battle_score', handleBattleScore);
    websocket.on('battle:score_update', handleBattleScoreUpdateColon);
    websocket.on('battle_ended', handleBattleEnded);
    websocket.on('cohost_layout_sync', handleCohostLayoutSync);
    websocket.on('cohost_request_accepted', handleCohostRequestAccepted);
    websocket.on('cohost_request_declined', handleCohostRequestDeclined);
    websocket.on('cohost_invite', handleCohostInvite);
    websocket.on('battle_invite', handleBattleInvite);
    websocket.on('booster_activated', handleBoosterActivated);
    websocket.on('booster_caught', handleBoosterCaught);
    websocket.on('mist_activated', handleMistActivated);

    const onConnected = () => {
      // Re-sync battle layout if creator already switched to battle before we joined.
      websocket.send('battle_get_state', {});
    };
    websocket.on('connected', onConnected);

    connect();

    const goOffline = async (_reason: string) => {
      if (!mounted) return;
      // Already watching host video — another spectator joining must never tear this down.
      if (hasStreamRef.current) return;
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
        const { data: goOfflineJson, error: goOfflineErr } = await request('/api/live/streams');
        if (goOfflineErr || !goOfflineJson) return;
        const streams = Array.isArray(goOfflineJson.streams) ? goOfflineJson.streams : [];
        const stillLive = streams.some(
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
      websocket.off('room_state', handleRoomState);
      websocket.off('user_joined', handleUserJoined);
      websocket.off('user_left', handleUserLeft);
      websocket.off('chat_message', handleChatMessage);
      websocket.off('gift_sent', handleGiftSent);
      websocket.off('gift_goal_sync', handleGiftGoalSync);
      websocket.off('heart_sent', handleHeartSent);
      websocket.off('stream_ended', handleStreamEnded);
      websocket.off('battle_state_sync', handleBattleStateSync);
      websocket.off('battle_score', handleBattleScore);
      websocket.off('battle:score_update', handleBattleScoreUpdateColon);
      websocket.off('battle_ended', handleBattleEnded);
      websocket.off('cohost_layout_sync', handleCohostLayoutSync);
      websocket.off('cohost_request_accepted', handleCohostRequestAccepted);
      websocket.off('cohost_request_declined', handleCohostRequestDeclined);
      websocket.off('cohost_invite', handleCohostInvite);
      websocket.off('battle_invite', handleBattleInvite);
      websocket.off('booster_activated', handleBoosterActivated);
      websocket.off('booster_caught', handleBoosterCaught);
      websocket.off('mist_activated', handleMistActivated);
      websocket.off('connected', onConnected);
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
        const { data: body, error: followingErr } = await request(`/api/profiles/${encodeURIComponent(user.id)}/following`);
        if (followingErr || cancelled) return;
        const ids: string[] = Array.isArray(body?.following) ? body.following : [];
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
        const { error: followErr } = await request(`/api/profiles/${encodeURIComponent(targetId)}/follow`, { method: 'POST' });
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
    void request('/api/rankings/weekly').then(({ data, error }) => {
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
    websocket.send('chat_message', {
      text: inputValue,
      level: userLevel,
      avatar: viewerAvatar,
      is_member: isMember,
    });
    setInputValue('');
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
        const { data: result, error: giftErr } = await request('/api/gifts/send', {
          method: 'POST',
          body: JSON.stringify({
            streamKey: effectiveStreamId,
            giftId: gift.id,
            channel: 'spectator',
            transaction_id: crypto.randomUUID(),
            gift_source: giftSource,
            ...(playableVideo
              ? { video: playableVideo, animation_url: playableVideo }
              : {}),
            ...(spectatorBattle?.active
              ? { battleTarget: spectatorGiftBattleTarget }
              : {}),
            ...(!spectatorBattle?.active && selectedCohostGiftUserId
              ? { cohostTargetUserId: selectedCohostGiftUserId }
              : {}),
          }),
        });

        if (giftErr) {
          const msg = giftErr.message || '';
          if (msg.includes('frozen')) {
              showToast('Account is frozen. Contact support.');
              return;
            }
            if (msg.includes('INSUFFICIENT') || msg.includes('insufficient_funds') || msg.includes('insufficient')) {
              showToast('Not enough coins');
              return;
            }
            if (msg.includes('INVALID_COHOST_TARGET')) {
              showToast('That co-host is no longer available');
              setSelectedCohostGiftUserId(null);
              return;
            }
            showToast(msg || 'Gift failed');
            return;
        }
        if (result.gift_source === 'starter_coins') {
          setStarterCoinBalance(
            Math.max(0, Number(result.new_starter_balance) || 0),
          );
          if (Number(result.new_starter_balance) <= 0) {
            setGiftSource('paid_coins');
          }
        } else if (result.new_balance != null) {
          const nextWallet = Math.max(0, Number(result.new_balance));
          walletCoinBalanceRef.current = nextWallet;
          setCoinBalance(
            resolveGiftUiBalance(nextWallet, user?.id),
          );
        } else {
          void request('/api/wallet/').then(({ data, error: walletErr }) => {
            const walletRaw = data?.coin_balance ?? data?.balance;
            if (!walletErr && walletRaw != null) {
              const nextWallet = Math.max(0, Number(walletRaw));
              walletCoinBalanceRef.current = nextWallet;
              setCoinBalance(resolveGiftUiBalance(nextWallet, user?.id));
            }
          });
        }
        if (result.new_level != null) {
          newLevel = Math.max(0, Number(result.new_level) || 0);
          setUserLevel(newLevel);
          updateUser({ level: newLevel });
        }
        if (result.total_xp != null) {
          setUserXP(Math.max(0, Number(result.total_xp) || 0));
        }
        if (result.leveled_up) {
          setMessages((prev) => appendCapped(prev, {
              id: `levelup-${Date.now()}`,
              username: viewerName,
              text: `reached Level ${newLevel}`,
              level: newLevel,
              isGift: false,
              avatar: viewerAvatar,
              isSystem: true,
            }, LIVE_CHAT_MESSAGE_CAP));
          websocket.send('chat_message', {
            text: `reached Level ${newLevel}`,
            level: newLevel,
            avatar: viewerAvatar,
          });
        }
        giftTransactionId =
          typeof result.transaction_id === 'string' && result.transaction_id
            ? result.transaction_id
            : null;
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

    if (gift.video && gift.video.trim() && isGiftVideoFile(gift.video)) {
      const raw = gift.video;
      const videoUrl =
        raw.startsWith('http://') || raw.startsWith('https://')
          ? raw
          : resolveGiftAssetUrl(raw.startsWith('/') ? raw : `/${raw}`);
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
    // Test coins never touch payments, goals, or battle scores — the server
    // broadcasts them animation-only so the creator and all spectators see the
    // gift video. Persisted gifts include the REST transaction id for
    // server-side source verification.
    if (usedTestCoins || giftTransactionId) {
      const wsVideo =
        gift.video && gift.video.trim()
          ? gift.video.startsWith('http://') || gift.video.startsWith('https://')
            ? gift.video.trim()
            : resolveGiftAssetUrl(gift.video.startsWith('/') ? gift.video : `/${gift.video}`)
          : null;
      websocket.send('gift_sent', {
        giftId: gift.id,
        giftName: gift.name,
        username: viewerName,
        coins: usedTestCoins ? 0 : gift.coins,
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

  if (streamIsLive === null) {
    return (
      <div className="fixed inset-0 bg-black flex justify-center">
        <div className="relative w-full max-w-[480px] h-full bg-[#111111] flex flex-col items-center justify-center gap-4 p-6">
          <div className="w-10 h-10 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Checking stream...</p>
        </div>
      </div>
    );
  }

  if (streamIsLive === false) {
    return (
      <div className="fixed inset-0 bg-black flex justify-center">
        <div className="relative w-full max-w-[480px] h-full bg-[#111111] flex flex-col items-center justify-center gap-4 p-6">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
            <span className="text-3xl">{streamEndedReceived ? '🔴' : '📡'}</span>
          </div>
          <h2 className="text-white font-bold text-lg">
            {streamEndedReceived ? 'Stream ended' : 'Stream offline'}
          </h2>
          <p className="text-white/50 text-sm text-center">
            {streamEndedReceived
              ? 'The host has ended the stream. Taking you back...'
              : 'This stream has ended or is not available right now.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            {!streamEndedReceived && (
              <button
                type="button"
                onClick={() => { setStreamIsLive(null); setStreamRetryKey(k => k + 1); }}
                className="px-6 py-2.5 rounded-lg bg-[#C9A227]/20 border border-[#C9A227]/50 text-[#D4AF37] font-semibold"
              >
                Retry connection
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/feed', { replace: true })}
              className="px-6 py-2.5 rounded-lg bg-[#D4AF37] text-black font-semibold"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex justify-center transition-transform duration-[250ms] ease-out"
      style={{ transform: pageExiting ? 'translateX(100%)' : undefined }}
    >
      <div className="relative w-full max-w-[480px] h-full overflow-hidden flex flex-col">

        {/* Video container: fixed between top creator bar and bottom spectator bar; black background behind the live video. */}
        {/* Video container */}
        {(() => {
          const myUserId = user?.id || '';
          const hostId = hostUserIdRef.current || hostUserId || effectiveStreamId;
          const externalCoHosts = spectatorCoHosts.filter(h => h.userId !== hostId);
          const liveCoHosts = externalCoHosts.filter(
            (h) => h.status === 'live' || h.status === 'accepted',
          );
          const showGrid = isCoHosting || liveCoHosts.length > 0;

          /* ═══ BATTLE MODE: creator-identical 50/50 split layout ═══ */
          if (spectatorBattle?.active) {
            const redTeamScore = (spectatorBattle.hostScore || 0) + (spectatorBattle.player3Score ?? 0);
            const blueTeamScore = (spectatorBattle.opponentScore || 0) + (spectatorBattle.player4Score ?? 0);
            const total = redTeamScore + blueTeamScore;
            const leftPct = total > 0 ? Math.max(5, Math.min(95, (redTeamScore / total) * 100)) : 50;
            const hS = spectatorBattle.hostScore || 0;
            const oS = spectatorBattle.opponentScore || 0;
            const p3s = spectatorBattle.player3Score ?? 0;
            const p4s = spectatorBattle.player4Score ?? 0;
            /** 4-way tap zones only when co-host labels use "Name + Name"; per-bucket scores always shown under bar. */
            const showPkBreakdown =
              (spectatorBattle.redTeamLabel || '').includes(' + ') || (spectatorBattle.blueTeamLabel || '').includes(' + ');
            // End-game suspense hides both scores; Mist Fog hides ONLY the supported
            // creator's side (the one the spectator boosted), never both.
            const mistSupportedSide = mistHidesMyScore ? mistFog?.supportedSide : null;
            const hideRedScore = battleHideScores || mistSupportedSide === 'host';
            const hideBlueScore = battleHideScores || mistSupportedSide === 'opponent';
            return (
              <div
                className="absolute inset-0 z-[80] flex flex-col"
                style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 90px)' }}
              >
                <div className="relative z-20 w-full flex-none bg-[#111111]/95 border-b border-white/10">
                  <div className="relative w-full overflow-hidden" style={{ minHeight: showPkBreakdown ? '20px' : '16px' }}>
                    <div className="absolute inset-0 flex">
                      <div
                        className="h-full transition-[width] duration-[1200ms] ease-out motion-reduce:transition-none"
                        style={{ width: `${leftPct}%`, backgroundImage: 'linear-gradient(90deg, #DC143C, #FF1744, #C41E3A)' }}
                      />
                      <div className="h-full flex-1 min-w-0" style={{ backgroundImage: 'linear-gradient(90deg, #1E90FF, #4169E1, #0047AB)' }} />
                    </div>
                    <div className="relative z-10 flex h-full min-h-[16px] items-center justify-between gap-1.5 px-2 pointer-events-none leading-none">
                      <div className={`flex min-w-0 flex-1 flex-col items-start justify-center gap-0 ${hideRedScore ? 'opacity-0' : ''}`}>
                        <AnimatedScore value={typeof redTeamScore === 'number' && Number.isFinite(redTeamScore) ? redTeamScore : 0} durationMs={0} format={formatBattleScoreShort} className="text-white font-black text-[11px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" />
                        {showPkBreakdown && (
                          <span className="text-[5px] text-white/80 tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                            P1 {hS} + P3 {p3s}
                          </span>
                        )}
                      </div>
                      <div className={`flex min-w-0 flex-1 flex-col items-end justify-center gap-0 ${hideBlueScore ? 'opacity-0' : ''}`}>
                        <AnimatedScore value={typeof blueTeamScore === 'number' && Number.isFinite(blueTeamScore) ? blueTeamScore : 0} durationMs={0} format={formatBattleScoreShort} className="text-white font-black text-[11px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" />
                        {showPkBreakdown && (
                          <span className="text-[5px] text-white/80 tabular-nums leading-none text-right drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                            P2 {oS} + P4 {p4s}
                          </span>
                        )}
                      </div>
                      {battleHideScores ? (
                        <div className="absolute inset-0 z-20 battle-score-veil pointer-events-none" />
                      ) : mistSupportedSide ? (
                        <div className={`absolute inset-y-0 z-20 battle-score-veil pointer-events-none w-1/2 ${mistSupportedSide === 'opponent' ? 'right-0' : 'left-0'}`} />
                      ) : null}
                    </div>
                  </div>
                  {/* Match timer — flush under battle score bar (0mm gap) */}
                  <div className="absolute left-0 right-0 top-full z-30 flex justify-center pointer-events-none m-0 p-0">
                    <div className="flex items-center gap-1.5 bg-black/35 backdrop-blur-md rounded-full px-2.5 py-1 border border-white/12 shadow-none">
                      <div className="relative w-5 h-5 flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 40 44" className="absolute inset-0 w-full h-full drop-shadow-md">
                          <path d="M20 2 L36 10 L36 26 Q36 38 20 42 Q4 38 4 26 L4 10 Z" fill="url(#vsGradSpectator)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
                          <defs><linearGradient id="vsGradSpectator" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#DC143C"/><stop offset="50%" stopColor="#8B0000"/><stop offset="100%" stopColor="#1E90FF"/></linearGradient></defs>
                        </svg>
                        <span className="relative z-10 text-white text-[7px] font-black italic drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">VS</span>
                      </div>
                      <span className="text-white text-[11px] font-black tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        {formatTime(spectatorBattle.timeLeft)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Battle grid — videos + tap overlay (2-way or 4-way PK); one +5 vote per spectator per battle */}
                <div className="relative w-full flex-none flex flex-col overflow-hidden" style={{ height: LIVE_BATTLE_VIDEO_HEIGHT }}>
                  <div className="flex-1 min-h-0 flex flex-col relative">
                    <BattleVfxOverlays
                      mistSide={
                        mistFog && mistFog.expiresAt > Date.now() && mistHidesMyScore
                          ? (mistFog.supportedSide === 'opponent' ? 'blue' : 'red')
                          : battleMistSide
                      }
                      hideScores={false}
                      gloves={battleGloves}
                    />
                    <BattleTauntOverlays bursts={battleTauntBursts} opponentSide="opponent" />
                    <div className="absolute inset-0 flex flex-row gap-0">
                      <div className="flex-1 basis-0 min-w-0 h-full overflow-hidden relative bg-[#111111]">
                        <video
                          ref={videoRef}
                          className="absolute inset-0 w-full h-full object-cover"
                          playsInline
                          autoPlay
                          style={{ opacity: hasStream ? 1 : 0, transition: 'opacity 0.4s ease' }}
                        />
                        {!hasStream && (
                          <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 bg-[#111111]">
                            {hostAvatar ? (
                              <img src={hostAvatar} alt="" className="w-16 h-16 rounded-full object-cover object-center" />
                            ) : (
                              <div className="w-16 h-16 rounded-full bg-[#111111] flex items-center justify-center">
                                <span className="text-2xl font-black text-[#D4AF37]">{(hostName || 'H').charAt(0).toUpperCase()}</span>
                              </div>
                            )}
                            <span className="text-white text-xs font-bold">{hostName}</span>
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                              <span className="text-white text-[10px] font-bold">Connecting...</span>
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); leaveStreamWithSlide(); }}
                          className="absolute bottom-4 right-2 z-40 flex items-center justify-center border-0 bg-transparent p-0 pointer-events-auto hover:opacity-90 active:scale-95"
                          title="Close"
                          aria-label="Close"
                        >
                          <RoyceCloseIcon size={12} />
                        </button>
                      </div>
                      <div
                        className="flex-1 basis-0 min-w-0 h-full overflow-hidden relative bg-[#111111]"
                      >
                        <video
                          ref={opponentVideoRef}
                          className="absolute inset-0 w-full h-full object-cover"
                          autoPlay
                          playsInline
                          muted
                          style={{ opacity: hasOpponentStream ? 1 : 0, transition: 'opacity 0.3s ease' }}
                        />
                        {!hasOpponentStream && (
                          <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 bg-[#111111]">
                            {spectatorBattle.opponentName ? (
                              <div className="w-16 h-16 rounded-full bg-[#111111] flex items-center justify-center">
                                <span className="text-2xl font-black text-[#D4AF37]">{spectatorBattle.opponentName.charAt(0).toUpperCase()}</span>
                              </div>
                            ) : (
                              <div className="w-16 h-16 rounded-full bg-[#111111] flex items-center justify-center">
                                <span className="text-2xl font-black text-[#D4AF37]">O</span>
                              </div>
                            )}
                            <span className="text-white text-xs font-bold truncate max-w-[90%]">{spectatorBattle.opponentName || 'Opponent'}</span>
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                              <span className="text-white text-[10px] font-bold">Connecting...</span>
                            </div>
                          </div>
                        )}
                        {lastOpponentGift && (
                          <div className="absolute bottom-1 right-1 z-20 pointer-events-none flex items-center">
                            <div className="w-5 h-5 rounded-full bg-[#111111] border border-[#C9A227]/40 overflow-hidden flex items-center justify-center drop-shadow-md">
                              <img src={lastOpponentGift} alt="gift" className="w-full h-full object-cover" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {spectatorBattle.winner && (
                      <div className="absolute inset-0 z-[8] pointer-events-none flex flex-row gap-0">
                        <div className="flex-1 basis-0 min-w-0 h-full flex items-center justify-center">
                          <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${spectatorBattle.winner === 'host' ? 'text-white' : spectatorBattle.winner === 'draw' ? 'text-white' : 'text-white/60'}`}>
                            {spectatorBattle.winner === 'host' ? 'WIN' : spectatorBattle.winner === 'draw' ? 'DRAW' : 'LOSS'}
                          </span>
                        </div>
                        <div className="flex-1 basis-0 min-w-0 h-full flex items-center justify-center">
                          <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${spectatorBattle.winner === 'opponent' ? 'text-white' : spectatorBattle.winner === 'draw' ? 'text-white' : 'text-white/60'}`}>
                            {spectatorBattle.winner === 'opponent' ? 'WIN' : spectatorBattle.winner === 'draw' ? 'DRAW' : 'LOSS'}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-0 z-10 flex flex-row touch-manipulation gap-0">
                      {showPkBreakdown ? (
                        <>
                          <div className="flex-1 basis-0 min-w-0 h-full flex flex-col min-h-0">
                            <button
                              type="button"
                              className="flex-1 min-h-0 w-full touch-manipulation cursor-pointer border-0 bg-transparent p-0 active:bg-white/5"
                              aria-label="Vote red team P1"
                              onClick={() => handleSpectatorVote('host')}
                            />
                            <button
                              type="button"
                              className="flex-1 min-h-0 w-full touch-manipulation cursor-pointer border-0 bg-transparent p-0 active:bg-white/5 border-t border-white/10"
                              aria-label="Vote red team P3"
                              onClick={() => handleSpectatorVote('player3')}
                            />
                          </div>
                          <div className="flex-1 basis-0 min-w-0 h-full flex flex-col min-h-0">
                            <button
                              type="button"
                              className="flex-1 min-h-0 w-full touch-manipulation cursor-pointer border-0 bg-transparent p-0 active:bg-white/5"
                              aria-label="Vote blue team P2"
                              onClick={() => handleSpectatorVote('opponent')}
                            />
                            <button
                              type="button"
                              className="flex-1 min-h-0 w-full touch-manipulation cursor-pointer border-0 bg-transparent p-0 active:bg-white/5 border-t border-white/10"
                              aria-label="Vote blue team P4"
                              onClick={() => handleSpectatorVote('player4')}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="flex-1 basis-0 min-w-0 h-full touch-manipulation cursor-pointer border-0 bg-transparent p-0 active:bg-white/5"
                            aria-label="Vote red team"
                            onClick={() => handleSpectatorVote('host')}
                          />
                          <button
                            type="button"
                            className="flex-1 basis-0 min-w-0 h-full touch-manipulation cursor-pointer border-0 bg-transparent p-0 active:bg-white/5"
                            aria-label="Vote blue team"
                            onClick={() => handleSpectatorVote('opponent')}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="w-full px-3 py-1.5 flex items-center justify-between flex-none z-30" style={{ transform: 'translateY(1mm)' }}>
                  <div
                    className="flex items-center gap-[0mm] min-w-0 flex-1 justify-start pointer-events-auto"
                    style={{ transform: `translateX(-${BATTLE_MVP_ROW_EDGE_OFFSET_MM}mm)` }}
                    onClick={() => setShowViewersPanel(true)}
                  >
                    {mvpSlots.host.map((slot, i) => {
                      const isMvp = i === 0 && (mvpGiftScoresHostRef.current[slot.id] ?? 0) > 0;
                      return (
                        <div
                          key={`mvp-l-${slot.id}`}
                          className="relative flex flex-col items-center"
                          style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '1.5mm' }}
                        >
                          <div className={isMvp ? 'rounded-full ring-2 ring-[#D4AF37] p-[1px] shadow-[0_0_6px_rgba(212,175,55,0.55)]' : ''}>
                            <AvatarRing
                              src={resolveCircleAvatar(slot.avatar, slot.name)}
                              alt={slot.name || ''}
                              size={SPECTATOR_BATTLE_PROFILE_RING_PX}
                            />
                          </div>
                          {isMvp && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#D4AF37] text-black text-[6px] font-black leading-none tracking-wide">
                              MVP
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="flex items-center gap-[0mm] min-w-0 flex-1 justify-end pointer-events-auto"
                    style={{ transform: `translateX(${BATTLE_MVP_ROW_EDGE_OFFSET_MM}mm)` }}
                    onClick={() => setShowViewersPanel(true)}
                  >
                    {mvpSlots.opponent.map((slot, i) => {
                      const isMvp = i === 0 && (mvpGiftScoresOpponentRef.current[slot.id] ?? 0) > 0;
                      return (
                        <div
                          key={`mvp-r-${slot.id}`}
                          className="relative flex flex-col items-center"
                          style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '1.5mm' }}
                        >
                          <div className={isMvp ? 'rounded-full ring-2 ring-[#D4AF37] p-[1px] shadow-[0_0_6px_rgba(212,175,55,0.55)]' : ''}>
                            <AvatarRing
                              src={resolveCircleAvatar(slot.avatar, slot.name)}
                              alt={slot.name || ''}
                              size={SPECTATOR_BATTLE_PROFILE_RING_PX}
                            />
                          </div>
                          {isMvp && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#D4AF37] text-black text-[6px] font-black leading-none tracking-wide">
                              MVP
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Opponent profile panel — floating above bottom bar */}
                {showOpponentPanel && spectatorBattle.opponentRoomId && (
                  <div className="fixed inset-0 z-[200]" onClick={() => setShowOpponentPanel(false)}>
                    <div className="absolute inset-0 bg-black/40" />
                    <div
                      className="absolute left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-[456px] bg-[#111111] rounded-2xl overflow-hidden shadow-xl border border-white/10 animate-[slideInFromBottom_0.2s_ease-out]"
                      style={{ bottom: 'calc(70px + max(8px, env(safe-area-inset-bottom)))' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-3.5 py-3 flex items-center gap-3">
                        {(opponentProfile?.avatarUrl) ? (
                          <img src={opponentProfile.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#111111] flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-black text-[#D4AF37]">
                              {(opponentProfile?.displayName || spectatorBattle.opponentName || 'O').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-bold text-sm truncate leading-tight">
                            {opponentProfile?.displayName || spectatorBattle.opponentName || 'Opponent'}
                          </h3>
                          <div className="flex items-center gap-1.5 text-[10px] text-white/50 leading-tight mt-0.5">
                            {opponentProfile?.username && <span>@{opponentProfile.username}</span>}
                            {opponentProfile && (
                              <>
                                <span>·</span>
                                <span className="text-white/70 font-semibold">{opponentProfile.followers >= 1000 ? `${(opponentProfile.followers / 1000).toFixed(1)}K` : opponentProfile.followers}</span>
                                <span>followers</span>
                                {opponentProfile.level > 0 && (
                                  <LevelBadge
                                    level={opponentProfile.level}
                                    avatar={opponentProfile.avatarUrl}
                                    layout="fixed"
                                  />
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            type="button"
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#FFFFFF] active:scale-95 transition-transform"
                            onClick={(e) => {
                              e.stopPropagation();
                              const roomId = spectatorBattle.opponentRoomId;
                              setShowOpponentPanel(false);
                              if (roomId) {
                                window.location.href = `/watch/${roomId}`;
                              }
                            }}
                          >
                            <Play size={12} className="text-black" fill="black" />
                            <span className="text-black font-bold text-[11px] whitespace-nowrap">Watch LIVE</span>
                          </button>
                          {battleStreamIds?.opponentUserId && (
                            <button
                              type="button"
                              className="flex items-center px-3 py-2 rounded-full border border-[#C9A227]/40 active:scale-95 transition-transform"
                              onClick={(e) => {
                                e.stopPropagation();
                                const uid = battleStreamIds.opponentUserId;
                                setShowOpponentPanel(false);
                                navigate(`/profile/${uid}`);
                              }}
                            >
                              <span className="text-[#D4AF37] font-bold text-[11px]">Profile</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          type SlotType = { type: 'self' | 'live' | 'invited' | 'pending' | 'empty'; host?: typeof spectatorCoHosts[0] };

          const buildSlots = (): SlotType[] => {
            const slots: SlotType[] = [];
            if (isCoHosting) slots.push({ type: 'self' });
            const liveOthers = externalCoHosts.filter(h => h.userId !== myUserId && (h.status === 'live' || h.status === 'accepted'));
            const invitedPending = externalCoHosts.filter(h => h.userId !== myUserId && (h.status === 'invited' || h.status === 'pending_accept'));
            liveOthers.forEach(h => slots.push({ type: 'live', host: h }));
            invitedPending.forEach(h => slots.push({ type: h.status === 'invited' ? 'invited' : 'pending', host: h }));
            while (slots.length < 8) slots.push({ type: 'empty' });
            return slots;
          };

          const renderSlot = (slot: SlotType) => {
            if (slot.type === 'self') {
              return (
                <>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#111111] z-[5]">
                    {(viewerAvatar || user?.avatar) ? (
                      <img src={viewerAvatar || user?.avatar || ''} alt="" className="w-10 h-10 rounded-full object-cover object-center" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#111111] flex items-center justify-center">
                        <span className="text-[#E8D5A3]/60 text-sm font-bold">{(viewerName || '?').charAt(0)}</span>
                      </div>
                    )}
                  </div>
                  <video
                    ref={myVideoRef}
                    className="absolute inset-0 w-full h-full object-cover z-[6]"
                    autoPlay playsInline muted
                    style={{ opacity: isCamOff ? 0 : 1, transition: 'opacity 0.3s ease' }}
                  />
                  <div className="absolute top-0.5 right-0.5 z-10 flex items-center gap-0.5 pointer-events-auto">
                    <button type="button" onClick={toggleMic} className="p-1" title={isMicMuted ? 'Unmute' : 'Mute'}>
                      {isMicMuted ? <MicOff className="text-white/60 w-3.5 h-3.5" strokeWidth={2.5} /> : <Mic className="text-white w-3.5 h-3.5" strokeWidth={2.5} />}
                    </button>
                    <button type="button" onClick={toggleCam} className="p-1" title={isCamOff ? 'Camera on' : 'Camera off'}>
                      {isCamOff ? <CameraOff className="text-white/60 w-3.5 h-3.5" strokeWidth={2.5} /> : <Camera className="text-white w-3.5 h-3.5" strokeWidth={2.5} />}
                    </button>
                  </div>
                  <p className="absolute bottom-0.5 left-0.5 z-10 text-white/80 text-[8px] font-bold bg-black/50 rounded px-1">You</p>
                </>
              );
            }
            if (slot.type === 'live' && slot.host) {
              const h = slot.host;
              const camOff = remoteCamOff.has(h.userId);
              const score = cohostGiftScores[h.userId] || 0;
              const lastGiftIcon = cohostLastGifts[h.userId];
              const isSelected = selectedCohostGiftUserId === h.userId;
              return (
                <>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#111111] z-[5]">
                    {h.avatar ? (
                      <img src={h.avatar} alt="" className="w-10 h-10 rounded-full object-cover object-center" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#111111] flex items-center justify-center">
                        <span className="text-[#E8D5A3]/60 text-sm font-bold">{(h.name || '?').charAt(0)}</span>
                      </div>
                    )}
                    <span className="text-white/90 text-[8px] font-bold truncate max-w-full px-1">{h.name}</span>
                  </div>
                  <video
                    ref={(el) => {
                      if (el) {
                        coHostVideoRefs.current.set(h.userId, el);
                        // Attach this co-host's already-subscribed track as soon as the tile mounts,
                        // covering the case where the track arrived before the tile existed. Also
                        // remove them from the big box if they were shown there provisionally.
                        const room = liveKitRoomRef.current;
                        if (room) {
                          for (const [, p] of room.remoteParticipants) {
                            if (p.identity !== h.userId) continue;
                            for (const [, pub] of p.videoTrackPublications) {
                              if (pub.track && pub.isSubscribed) {
                                pub.track.attach(el);
                                if (mainProvisionalTrackRef.current === pub.track && videoRef.current) {
                                  try { pub.track.detach(videoRef.current); } catch { /* noop */ }
                                  mainProvisionalTrackRef.current = null;
                                }
                              }
                            }
                          }
                        }
                      } else {
                        coHostVideoRefs.current.delete(h.userId);
                      }
                    }}
                    className="absolute inset-0 w-full h-full object-cover z-[6]"
                    autoPlay playsInline
                    style={{ opacity: camOff ? 0 : 1, transition: 'opacity 0.3s ease' }}
                  />
                  <p className="absolute bottom-0.5 left-0.5 z-10 text-white/80 text-[8px] font-bold bg-black/50 rounded px-1 truncate max-w-[90%]">{h.name}</p>
                  {(lastGiftIcon || score > 0) && (
                    <div className="absolute bottom-0.5 right-0.5 z-10 flex items-center pointer-events-none">
                      {lastGiftIcon && (
                        <div className="w-5 h-5 rounded-full bg-[#111111] border border-[#C9A227]/40 overflow-hidden flex items-center justify-center drop-shadow-md z-10 relative">
                          <img src={lastGiftIcon} alt="gift" className="w-full h-full object-cover" />
                        </div>
                      )}
                      {score > 0 && (
                        <div
                          className={`h-4 flex items-center rounded-full text-[8px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] relative z-0 bg-[#111111]/40 backdrop-blur-md border border-white/10 ${lastGiftIcon ? '-ml-2 pl-3 pr-1.5' : 'px-1.5'}`}
                        >
                          {formatCohostGiftScore(score)}
                        </div>
                      )}
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute inset-0 z-[5] pointer-events-none border-2 border-[#D4AF37]" />
                  )}
                </>
              );
            }
            if (slot.type === 'invited' && slot.host) {
              return (
                <>
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-[#111111]">
                    {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover opacity-60" /> : <div className="w-full h-full flex items-center justify-center text-[#E8D5A3]/60 text-base font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                  </div>
                  <p className="text-white/60 text-[9px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                  <span className="text-[#E8D5A3]/70 text-[8px] font-semibold">Waiting</span>
                </>
              );
            }
            if (slot.type === 'pending' && slot.host) {
              return (
                <>
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-[#111111]">
                    {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[#D4AF37] text-sm font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                  </div>
                  <p className="text-white text-[8px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                  <span className="text-[#E8D5A3]/70 text-[8px] font-semibold">Pending</span>
                </>
              );
            }
            return (
              <button
                type="button"
                disabled={joinRequested || spectatorCoHostRequestSent || !user?.id || isCoHosting}
                onClick={() => { sendCohostJoinRequest(); }}
                className="flex flex-col items-center justify-center w-full h-full active:scale-95 disabled:opacity-50"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center">
                  <span className="text-white/30 text-2xl font-light">+</span>
                </div>
                <p className="text-white/30 text-[9px] font-semibold mt-0.5">
                  {joinRequested || spectatorCoHostRequestSent ? 'Sent' : 'Add'}
                </p>
              </button>
            );
          };

          const slots = buildSlots();

          return (
            <div
              className={`absolute left-0 right-0 z-0 bg-transparent flex flex-row overflow-hidden rounded-none`}
              style={(showGrid || spectatorBattle?.active)
                ? { top: 'calc(env(safe-area-inset-top, 0px) + 78px)', height: 'calc(36dvh + 10mm)' }
                : { top: '0px', bottom: '0px' }
              }
            >
              <div ref={spectatorStageRef} className="relative flex w-full h-full min-h-0 flex-row overflow-hidden rounded-none">
              {/* Left: host video — tap/double-tap to like (Aprecieri); hearts render in chat panel */}
              <div
                className={`touch-manipulation overflow-hidden rounded-none min-w-0 relative ${showGrid || spectatorBattle?.active ? 'w-1/2' : 'w-full'}`}
                onPointerDown={(e) => {
                  if (e.target instanceof Element) {
                    const interactive = e.target.closest('button, a, input, textarea, select, [role="button"]');
                    if (interactive) return;
                  }
                  handleLikeTap(e);
                }}
              >
                {(() => {
                  const hostId = hostUserIdRef.current || hostUserId || effectiveStreamId;
                  const hostCamOff = remoteCamOff.has(hostId) || (effectiveStreamId ? remoteCamOff.has(effectiveStreamId) : false);
                  return (
                    <>
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover rounded-none z-[6]"
                  playsInline
                  autoPlay
                  style={{ opacity: hasStream && !hostCamOff ? 1 : 0, transition: 'opacity 0.4s ease' }}
                />
                {hostCamOff && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#111111] z-[5]">
                    {hostAvatar ? (
                      <img src={hostAvatar} alt="" className="w-16 h-16 rounded-full object-cover object-center border-2 border-[#C9A227]/40" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-[#C9A227]/20 flex items-center justify-center border-2 border-[#C9A227]/40">
                        <span className="text-[#D4AF37] font-bold text-2xl">{hostName.slice(0, 1).toUpperCase()}</span>
                      </div>
                    )}
                    <span className="text-white font-bold text-sm">{hostName}</span>
                  </div>
                )}
                {!hasStream && !hostCamOff && (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4" style={{ transform: 'translateX(15mm)' }}>
                    <div className="w-24 h-24 rounded-full overflow-hidden">
                      {hostAvatar ? (
                        <img src={hostAvatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[#C9A227]/20 flex items-center justify-center">
                          <span className="text-[#D4AF37] font-bold text-3xl">{hostName.slice(0, 1).toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                    {!user?.id ? (
                      <>
                        <span className="text-white/80 text-sm text-center">Log in to watch the live stream</span>
                        <button
                          type="button"
                          onClick={() => navigate('/login', { state: { from: `/watch/${effectiveStreamId}` } })}
                          className="mt-2 px-5 py-2.5 rounded-lg bg-[#D4AF37] text-black font-semibold text-sm"
                        >
                          Log in
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
                          <span className="text-white/60 text-sm">Connecting to stream...</span>
                        </div>
                        {showRetryButton && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowRetryButton(false);
                              retryJoinRoom();
                              setTimeout(() => {
                                if (!hasStream) setShowRetryButton(true);
                              }, 8000);
                            }}
                            className="mt-2 px-5 py-2 rounded-lg bg-[#C9A227]/20 border border-[#C9A227]/40 text-[#D4AF37] text-sm font-medium"
                          >
                            Tap to retry
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
                    </>
                  );
                })()}
              </div>

              {/* Right: 8-slot co-host grid — same as creator */}
              {showGrid && (
                <div className="w-1/2 h-full grid grid-cols-2 grid-rows-4 gap-[1px] bg-[#1a1c22]">
                  {slots.slice(0, 8).map((slot, i) => {
                    const cellSpeaking =
                      (slot.type === 'self' && !!user?.id && speakingIds.has(user.id)) ||
                      (slot.type === 'live' && !!slot.host && speakingIds.has(slot.host.userId));
                    const liveHost = slot.type === 'live' ? slot.host : undefined;
                    return (
                      <div
                        key={i}
                        role={liveHost ? 'button' : undefined}
                        tabIndex={liveHost ? 0 : undefined}
                        onClick={() => {
                          if (!liveHost || spectatorBattle?.active) return;
                          setSelectedCohostGiftUserId(liveHost.userId);
                          setShowGiftPanel(true);
                        }}
                        onKeyDown={(e) => {
                          if (!liveHost || spectatorBattle?.active) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedCohostGiftUserId(liveHost.userId);
                            setShowGiftPanel(true);
                          }
                        }}
                        className={`relative bg-[#111111] flex flex-col items-center justify-center overflow-hidden p-0 min-h-0 border border-[#C9A96E]/40 ${cellSpeaking ? 'elix-speaking-pulse' : ''} ${liveHost ? 'cursor-pointer' : ''}`}
                      >
                        {renderSlot(slot)}
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </div>
          );
        })()}

        {/* CREATOR TOP BAR — only connection to creator page: spectator has access to full creator top bar (avatar, name, likes, Follow, Weekly Ranking, Membership, viewer count, close). Rest is single video + spectator's own bottom bar. */}
        <div className="absolute top-0 left-0 right-0 z-[110] pointer-events-none overflow-visible">
          <div className="px-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}>
            <div className="flex items-start justify-between gap-2">
              {/* Left: Creator info — photo profile (MVP circles untouched) */}
              <div className="pointer-events-auto flex flex-col gap-2">
                <div className="px-0 py-1 animate-luxury-fade-in relative">
                <LiveHostProfileHeader
                  name={hostName}
                  avatar={resolveCircleAvatar(hostAvatar, hostName)}
                  likes={typeof activeLikes === 'number' && Number.isFinite(activeLikes) ? activeLikes : 0}
                  level={hostLevel}
                  avatarSize={LIVE_TOP_AVATAR_RING_PX}
                            showFollow={!isFollowing}
                            onAvatarClick={() => navigate(`/profile/${hostUserId}`)}
                            onLike={(e) => {
                              handleLikeTap(e);
                            }}
                            onFollow={(e) => {
                              e.stopPropagation();
                              followHost(e);
                            }}
                            joinSlot={
                              isFollowing ? (
                              <LiveJoinPill
                                hasJoinedToday={hasJoinedToday}
                                onJoin={async (e) => {
                                  e.stopPropagation();
                                  if (!isFollowing) {
                                    showToast('Follow first to give a membership heart');
                                    return;
                                  }
                                  if (!user?.id) {
                                    showToast('Log in to give a membership heart');
                                    navigate('/login', { state: { from: location.pathname } });
                                    return;
                                  }
                                  const creatorId = hostUserIdRef.current || hostUserId;
                                  if (!creatorId || hasJoinedToday) return;
                                  const token = useAuthStore.getState().session?.access_token;
                                  if (!token) {
                                    showToast('Log in to give a membership heart');
                                    navigate('/login', { state: { from: location.pathname } });
                                    return;
                                  }
                                  const today = new Date().toISOString().split('T')[0];
                                  const storageKey = `joined_stream_${effectiveStreamId}_${user.id}_${today}`;
                                  localStorage.setItem(storageKey, 'true');
                                  setHasJoinedToday(true);
                                  spawnHeartFromClient(e.clientX, e.clientY);
                                  const joinBannerId = Date.now().toString();
                                  const newMessage: LiveMessage = {
                                    id: joinBannerId,
                                    username: viewerName,
                                    text: '\u2764\ufe0f Joined the team!',
                                    level: userLevel,
                                    isGift: false,
                                    avatar: viewerAvatar,
                                    isSystem: true,
                                    membershipIcon: '/royce/membership.svg',
                                  };
                                  setMessages(prev => appendCapped(prev, newMessage, LIVE_CHAT_MESSAGE_CAP));
                                  window.setTimeout(() => {
                                    setMessages(prev => prev.filter(m => m.id !== joinBannerId));
                                  }, 5000);
                                  try {
                                    const { data: d, error } = await request('/api/hearts/daily', {
                                      method: 'POST',
                                      body: JSON.stringify({ creatorId }),
                                    });
                                    if (error) {
                                      showToast('Could not send membership heart. Try again.');
                                      return;
                                    }
                                    if (d?.ok || d?.already) {
                                      if (!d?.already) {
                                        setMyHeartCount((prev) => {
                                          const next = prev + 1;
                                          localStorage.setItem(`my_heart_count_${effectiveStreamId}_${user.id}`, String(next));
                                          return next;
                                        });
                                        setDailyHeartCount((c) => c + 1);
                                      }
                                    }
                                  } catch {
                                    showToast('Could not send membership heart. Try again.');
                                  }
                                }}
                              />
                              ) : null
                            }
                />
              </div>
              </div>

              <div className="pointer-events-auto flex items-center gap-[0mm] mt-1">
                {mvpSlots.global.length > 0 ? (
                  <div
                    className="flex items-center gap-[0mm] pointer-events-auto flex-shrink-0"
                    style={{ transform: 'translateX(-2mm)' }}
                    onClick={() => {
                      const list: { id: string; name: string; avatar: string; level?: number }[] = [];
                      const hid = hostUserIdRef.current || hostUserId || effectiveStreamId;
                      actualViewersRef.current.forEach((v, id) => {
                        if (id !== user?.id && id !== hid && id !== effectiveStreamId) {
                          list.push({ id, name: v.name, avatar: v.avatar, level: v.level });
                        }
                      });
                      setViewersList(list);
                      setShowViewersPanel(true);
                    }}
                  >
                    {mvpSlots.global.map((slot, i) => {
                      const isMvp = i === 0 && (slot.points ?? 0) > 0;
                      return (
                        <div
                          key={`spectator-top-mvp-${slot.id}`}
                          style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '1.5mm' }}
                          className="relative"
                        >
                          <div className={isMvp ? 'rounded-full ring-2 ring-[#D4AF37] p-[1px] shadow-[0_0_6px_rgba(212,175,55,0.55)]' : ''}>
                            <AvatarRing
                              src={resolveCircleAvatar(slot.avatar, slot.name)}
                              alt={slot.name || ''}
                              size={LIVE_MVP_PROFILE_RING_PX}
                            />
                          </div>
                          {isMvp && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#D4AF37] text-black text-[6px] font-black leading-none tracking-wide">
                              MVP
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {/* Viewer count */}
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-0 py-1 rounded-full bg-transparent border-0 active:scale-95 transition-transform"
                  onClick={() => {
                    const list: { id: string; name: string; avatar: string; level?: number }[] = [];
                    const hid = hostUserIdRef.current || hostUserId || effectiveStreamId;
                    actualViewersRef.current.forEach((v, id) => {
                      if (id !== user?.id && id !== hid && id !== effectiveStreamId) {
                        list.push({ id, name: v.name, avatar: v.avatar, level: v.level });
                      }
                    });
                    setViewersList(list);
                    setShowViewersPanel(true);
                  }}
                  style={{ marginRight: '1mm' }}
                >
                  <span className="text-white text-[9px] font-bold tabular-nums">
                    {typeof viewerCount === 'number' && Number.isFinite(viewerCount) ? viewerCount.toLocaleString() : String(viewerCount)}
                  </span>
                  <UserPlus size={16} className="text-[#D4AF37]" strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  title="Leave stream"
                  onClick={leaveStreamWithSlide}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-black/45 border border-white/15 active:scale-95 transition-transform"
                  aria-label="Close"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Capsules right-aligned — left clear for battle gloves */}
            <LiveMarkedSubHeaderBar
              rank={diamondLeagueRank}
              onDiamond={() => {
                setShowGiftPanel(false);
                setRankingInitialTab('weekly');
                setShowRankingPanel(true);
              }}
              onMembership={() => {
                setShowGiftPanel(false);
                setShowFanClub(true);
              }}
              onWeeklyRanking={() => {
                setShowGiftPanel(false);
                setRankingInitialTab('weekly');
                setShowRankingPanel(true);
              }}
              onExplore={() => {
                navigate('/live');
              }}
            />
          </div>
        </div>

        {/* CHAT — same pattern as LiveStream (!isBroadcast): scroll area tap sends like on empty space */}
        <div
          className="chat-zone fixed left-0 right-0 z-[100] flex justify-center pointer-events-none"
          style={{
            bottom: LIVE_BOTTOM_ACTION_RESERVE,
            transform: spectatorBattle?.active ? `translateY(${LIVE_BATTLE_CHAT_SHIFT_Y})` : undefined,
          }}
        >
          <div
            className="w-full max-w-[480px] relative"
            style={{
              height: spectatorBattle?.active ? LIVE_BATTLE_CHAT_HEIGHT : 'calc(25dvh + 2cm + 4mm)',
              maxHeight: spectatorBattle?.active ? LIVE_BATTLE_CHAT_HEIGHT : 'calc(25dvh + 2cm + 4mm)',
            }}
          >
            <div
              ref={spectatorChatHeartsRef}
              className="absolute inset-0 z-[25] overflow-hidden pointer-events-none"
              aria-hidden
            >
              {floatingHearts.map((h) => (
                <div
                  key={h.id}
                  className="absolute elix-heart-float z-[200] flex items-center gap-1.5"
                  style={{
                    left: h.x,
                    top: h.y,
                    '--elix-heart-dx': '0px',
                    '--elix-heart-rot': '0deg',
                  } as React.CSSProperties}
                >
                  <svg width={h.size} height={h.size} viewBox="0 0 24 24" fill={h.color} stroke="none" className="flex-shrink-0">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  {h.username && (
                    <span className="text-[#C8CCD4] text-[11px] font-bold whitespace-nowrap drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] max-w-[min(160px,42vw)] truncate">
                      {h.username}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div
              className="relative z-[10] h-full overflow-y-auto pointer-events-auto bg-transparent px-1"
              style={{ transform: 'translateX(2mm)' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.target instanceof Element) {
                  const interactive = e.target.closest('button, a, input, textarea, select, [role="button"]');
                  if (interactive) return;
                }
                handleLikeTap(e);
              }}
            >
              <ChatOverlay
                messages={messages}
                variant="panel"
                compact={!!spectatorBattle?.active}
                isModerator={isModerator}
                onLike={handleLikeTap}
                onProfileTap={() => {}}
              />
            </div>
          </div>
        </div>

        {/* Combo + Mission docked together — separate live sources */}
        <LiveMarkedUiDemoToggle
          enabled={markedUiDemo}
          onToggle={(next) => {
            writeLiveMarkedUiDemoEnabled(next);
            setMarkedUiDemo(next);
          }}
        />
        <LiveComboMissionDock
          combo={
            showComboColumn && visibleComboStack.length > 0 ? (
              <LiveGiftComboColumn
                embedded
                stack={visibleComboStack}
                onCombo={() => {
                  if (comboStack.length > 0) handleComboClick();
                  else setShowGiftPanel(true);
                }}
                onOpen={() => setShowGiftPanel(true)}
              />
            ) : null
          }
          mission={
            <LiveSideMissionStack
              embedded
              missions={
                markedUiDemo
                  ? LIVE_SIDE_DEMO_MISSIONS
                  : {
                      watchMin: missionWatchMin,
                      watchGoal: 30,
                      giftsSent: missionGiftsSent,
                      giftsGoal: 10,
                      battleJoined: spectatorBattle?.active ? 1 : 0,
                      battleGoal: 1,
                    }
              }
              supporters={
                markedUiDemo || mvpSlots.global.length === 0
                  ? LIVE_SIDE_DEMO_SUPPORTERS
                  : mvpSlots.global.slice(0, 3).map((s) => ({
                      id: s.id,
                      name: s.name,
                      avatar: s.avatar,
                      points: s.points ?? 0,
                    }))
              }
              battlePassLevel={userLevel || 1}
              battlePassXp={markedUiDemo ? 320 : userXP % 1000}
              battlePassXpMax={1000}
              onViewAllSupporters={() => setShowViewersPanel(true)}
              onBattlePass={() => {
                setRankingInitialTab('weekly');
                setShowRankingPanel(true);
              }}
            />
          }
        />

{/* Bottom bar — above gift video so Gift/Invite/Share/More stay tappable */}
        <div
          className="fixed left-0 right-0 bottom-0 z-[50002] pointer-events-auto flex justify-center"
          style={{ paddingBottom: LIVE_BOTTOM_ACTION_PADDING }}
        >
          <div className="w-full max-w-[480px] px-3 pt-0 bg-transparent">
            <div className="flex items-end gap-2 w-full max-w-[480px] pointer-events-auto">
              <form
                className="flex-1 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full px-3 py-2 border border-white/10 h-10 min-w-0"
                onSubmit={(e) => { e.preventDefault(); handleSendMessage(e); }}
              >
                <input
                  type="text"
                  inputMode="text"
                  enterKeyHint="send"
                  autoComplete="off"
                  placeholder="Say something..."
                  className="bg-transparent text-white text-xs outline-none flex-1 placeholder:text-white/30 min-w-0"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                />
                {inputValue.trim() ? (
                  <button type="submit" title="Send message" className="text-[#D4AF37] flex-shrink-0">
                    <Send size={16} />
                  </button>
                ) : null}
              </form>
              <div className="flex items-end gap-2 flex-shrink-0" style={{ transform: 'translateX(4mm)' }}>
              <button
                type="button"
                title="Poll"
                onClick={() => setIsMoreMenuOpen(true)}
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
                  <BarChart3 size={20} className="text-[#38BDF8] shrink-0" strokeWidth={2.2} />
                </div>
                <span className="text-[10px] font-semibold text-[#38BDF8] mt-0.5">Poll</span>
              </button>
              {/* Co-host is a NORMAL-LIVE feature only. During a battle a
                  spectator can only watch, gift and comment — never co-host. */}
              {!spectatorBattle?.active && (
              <button
                type="button"
                title={spectatorCoHostRequestSent ? 'Request sent' : 'Request to co-host'}
                disabled={spectatorCoHostRequestSent || !user?.id}
                onClick={() => { sendCohostJoinRequest(); }}
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0 disabled:opacity-60"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
                  <span className="flex items-center justify-center w-full h-full relative z-[2]">
                    <UserPlus size={20} className="text-[#D4AF37] shrink-0" strokeWidth={2} />
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-[#D4AF37] mt-0.5">
                  {spectatorCoHostRequestSent ? 'Sent' : 'Co-host'}
                </span>
              </button>
              )}
              <button
                type="button"
                title="Send gift"
                onClick={() => {
                  setSelectedCohostGiftUserId(null);
                  setShowGiftPanel(true);
                }}
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
                  <Gift size={20} className="text-[#D4AF37] relative z-[2]" />
                </div>
                <span className="text-[10px] font-semibold text-[#D4AF37] mt-0.5">Gift</span>
              </button>
              <button
                type="button"
                title="Share"
                onClick={() => setShowSharePanel(true)}
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
                  <Share2 size={20} className="text-[#D4AF37] relative z-[2]" />
                </div>
                <span className="text-[10px] font-semibold text-[#D4AF37] mt-0.5">Share</span>
              </button>
              <button
                type="button"
                title="More options"
                onClick={() => setIsMoreMenuOpen(true)}
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
                  <MoreVertical size={20} className="text-[#D4AF37] relative z-[2]" />
                </div>
                <span className="text-[10px] font-semibold text-[#D4AF37] mt-0.5">More</span>
              </button>
              </div>
            </div>
          </div>
        </div>

        {/* GIFT ANIMATION OVERLAY */}
        <GiftAnimationOverlay streamId={effectiveStreamId} />
        {/* Separate photo feed (cards + xN) — does not replace gift animation */}
        <LiveGiftFeedStack streamId={effectiveStreamId} />

        {/* POINT MULTIPLIER BOOSTER — a red boxing glove stays on the top-left, beside
            the Weekly Ranking, for the whole active window (server ~30s) while it catches
            gifts. One glove per spectator; a badge shows how many gloves that spectator sent. */}
        {boosterActivations.length > 0 && (
          <div className="fixed left-3 top-[92px] z-[100000] flex flex-col gap-1 pointer-events-none">
            {Object.values(
              boosterActivations.reduce<Record<string, { key: string; multiplier: number; count: number }>>((acc, a) => {
                const key = a.userId || a.username || a.id;
                if (!acc[key]) acc[key] = { key, multiplier: 0, count: 0 };
                acc[key].count += 1;
                acc[key].multiplier = Math.max(acc[key].multiplier, a.multiplier);
                return acc;
              }, {}),
            ).map((g) => (
              <span key={g.key} className="relative flex items-center justify-center w-11 h-11 rounded-full bg-[#111111]/90 border border-[#FF3B30] shadow-2xl text-[#FF3B30] animate-in zoom-in-50 duration-200">
                <GloveIcon className="w-7 h-7" />
                {g.count > 1 && (
                  <span className="absolute -top-1 -right-1 text-[9px] font-black leading-none px-1 rounded-full bg-[#FF3B30] text-white border border-black/40">{g.count}</span>
                )}
                {g.multiplier > 0 && (
                  <span className="absolute -bottom-1 -right-1 text-[9px] font-black leading-none px-1 rounded-full bg-black text-[#FF3B30] border border-[#FF3B30]/60">x{g.multiplier}</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Glove "caught" popup — server-synced to all clients when a gift is caught */}
        {boosterCatches.length > 0 && (
          <div className="fixed inset-x-0 top-[30%] z-[100000] flex flex-col items-center gap-2 pointer-events-none px-4">
            {boosterCatches.map((c) => (
              <div key={c.id} className="booster-catch-pop flex items-center gap-2 px-4 py-2 rounded-full bg-[#111111]/90 border border-[#D4AF37] shadow-2xl">
                <GloveIcon className="w-5 h-5 text-[#D4AF37]" />
                <span className="text-[#D4AF37] font-black text-base tracking-wide">x{c.multiplier} CAUGHT!</span>
                <span className="text-white font-bold text-sm">+{c.finalPoints}</span>
              </div>
            ))}
          </div>
        )}

        <GiftOverlay
          key={`gift-${giftKey}`}
          videoSrc={currentGift?.video ?? null}
          onEnded={handleGiftEnded}
          isBattleMode={!!spectatorBattle?.active}
          muted={false}
        />


        {/* ═══ BATTLE INVITE BANNER — a watching creator was invited into the battle.
             Join takes them to the live battle page as a player, not a spectator. */}
        {pendingBattleInvite && (
          <div className="fixed left-0 right-0 z-[100000] pointer-events-none flex justify-center px-3" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 64px)' }}>
            <div className="pointer-events-auto w-full max-w-[440px] flex items-center gap-2.5 py-1 px-2 rounded-full bg-[#111111]/95 backdrop-blur-md border border-[#C9A227]/40 shadow-2xl">
              <div
                className="rounded-full overflow-hidden bg-[#111111] flex-shrink-0"
                style={{ width: SHARE_PANEL_AVATAR_PX, height: SHARE_PANEL_AVATAR_PX }}
              >
                {pendingBattleInvite.hostAvatar ? (
                  <img src={pendingBattleInvite.hostAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#D4AF37] font-bold">{pendingBattleInvite.hostName.slice(0, 1).toUpperCase()}</div>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-white text-xs font-semibold truncate">@{pendingBattleInvite.hostName}</p>
                <p className="text-white/40 text-[10px]">invited you to battle</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button type="button" onClick={() => setPendingBattleInvite(null)} className="h-6 px-3 rounded-full bg-red-500/25 border border-red-400/50 inline-flex items-center justify-center active:scale-95 transition-transform">
                  <span className="text-red-300 text-[10px] font-bold leading-none whitespace-nowrap">Reject</span>
                </button>
                <button type="button" disabled={battleInviteJoining} onClick={() => void acceptBattleInviteFromWatch()} className="h-6 px-3.5 rounded-full bg-green-500 inline-flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60">
                  <span className="text-black text-[10px] font-bold leading-none whitespace-nowrap">{battleInviteJoining ? 'Joining…' : 'Join'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ CO-HOST PANEL — spectator Accept/Reject when creator invited, or Request to co-host. No layout control. */}
        {showCoHostPanel && (
          <>
            <div className="fixed inset-0 z-[99998] bg-black/40 pointer-events-auto" onClick={() => { setShowCoHostPanel(false); }} />
            <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
              <div className="bg-[#111111]/95 backdrop-blur-md rounded-t-2xl h-[40vh] flex flex-col shadow-2xl overflow-hidden pb-safe" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-white/20 rounded-full" /></div>
                <div className="flex items-center justify-center px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <Crown size={14} className="text-[#D4AF37]" strokeWidth={1.8} />
                    <span className="text-white font-bold text-[13px]">Co-Host</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0 flex flex-col gap-4">
                  {pendingCoHostInvite ? (
                    <div className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg bg-white/[0.03] flex-shrink-0">
                      <div
                        className="rounded-full overflow-hidden bg-[#111111] flex-shrink-0"
                        style={{ width: SHARE_PANEL_AVATAR_PX, height: SHARE_PANEL_AVATAR_PX }}
                      >
                        {pendingCoHostInvite.hostAvatar ? <img src={pendingCoHostInvite.hostAvatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[#D4AF37] font-bold">{pendingCoHostInvite.hostName.slice(0, 1).toUpperCase()}</div>}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-white text-xs font-semibold truncate">@{pendingCoHostInvite.hostName}</p>
                        <p className="text-white/40 text-[10px]">wants you to co-host</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => { setPendingCoHostInvite(null); setShowCoHostPanel(false); }} className="h-6 px-3 rounded-full bg-red-500/25 border border-red-400/50 inline-flex items-center justify-center active:scale-95 transition-transform cursor-pointer">
                          <span className="text-red-300 text-[10px] font-bold leading-none whitespace-nowrap">Reject</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!pendingCoHostInvite || !user?.id) return;
                            const inv = pendingCoHostInvite;
                            setPendingCoHostInvite(null);
                            setShowCoHostPanel(false);
                            websocket.send('cohost_invite_accept', { hostUserId: inv.hostUserId, cohostName: user?.username || user?.name || 'User', cohostAvatar: user?.avatar || '', streamKey: user?.id || effectiveStreamId });
                            showToast(`Joining @${inv.hostName}'s live as co-host`);
                            if (inv.streamKey) {
                              navigate(`/watch/${inv.streamKey}?cohost=1`, {
                                replace: true,
                                state: { fromCohostInvite: true },
                              });
                            }
                          }}
                          className="h-6 px-3.5 rounded-full bg-green-500 inline-flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
                        >
                          <span className="text-black text-[10px] font-bold leading-none whitespace-nowrap">Join</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-white/70 text-sm text-center">
                        {joinRequested ? 'Your request has been sent to the creator. Wait for them to accept.' : 'Request the creator to let you co-host their live.'}
                      </p>
                      <button
                        type="button"
                        disabled={joinRequested || !user?.id}
                        onClick={() => { sendCohostJoinRequest(); }}
                        className={`w-full py-3 rounded-xl font-bold text-sm ${joinRequested ? 'bg-white/10 text-white/40 cursor-not-allowed' : 'bg-[#D4AF37] text-black active:scale-95'}`}
                      >
                        {joinRequested ? 'Request sent' : 'Request to co-host'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══ SUPER FAN GOAL PANEL (Membership) — same as creator page */}
        {showFanClub && (
          <>
            <div
              className="fixed inset-0 bg-black/40 pointer-events-auto"
              style={{ zIndex: 99998 }}
              onClick={() => setShowFanClub(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
              <div
                className="bg-[#111111]/95 rounded-t-2xl p-3 pb-safe h-[40vh] overflow-y-auto no-scrollbar shadow-2xl w-full "
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col items-center justify-center pt-3 pb-1 gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#FFFFFF] shadow-[0_0_6px_rgba(255,255,255,0.25)]" />
                  <div className="w-10 h-1 bg-white/20 rounded-full" />
                </div>
                <div className="flex items-center justify-between px-4 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Heart className="w-3 h-3 text-[#D4AF37]" strokeWidth={2} fill="#D4AF37" />
                    <span className="text-gold-metallic font-bold text-sm">Super Fan Goal</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
                  <div className="flex flex-col gap-3">
                    <div className="bg-gradient-to-r from-[#D4AF37]/10 to-[#B8943F]/5 rounded-xl p-3 border border-[#C9A227]/20 relative overflow-hidden">
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h3 className="text-gold-metallic font-bold text-xs">Membership</h3>
                            <p className="text-white/50 text-[9px]">Unlock photo stickers & exclusive perks</p>
                          </div>
                          <div className="w-6 h-6 bg-[#C9A227]/20 rounded-full flex items-center justify-center border border-[#C9A227]/30">
                            <Heart className="w-2.5 h-2.5 text-[#D4AF37] fill-[#FFFFFF] animate-pulse" />
                          </div>
                        </div>
                        <div className="flex items-end gap-1 mb-2">
                          <span className="text-lg font-black text-gold-metallic">£3.00</span>
                          <span className="text-white/40 text-[10px] font-medium mb-0.5">/ month</span>
                        </div>
                        <button
                          onClick={handleSubscribe}
                          disabled={isSubscribing}
                          className="w-full py-2 bg-gradient-to-r from-[#D4AF37] to-[#E8D5A3] text-black font-bold text-[10px] uppercase tracking-wide rounded-xl active:scale-[0.98] transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        >
                          {isSubscribing ? (
                            <>
                              <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                              <span>Processing...</span>
                            </>
                          ) : (
                            <span>Subscribe Now</span>
                          )}
                        </button>
                        <p className="text-[8px] text-white/30 text-center mt-1.5">Non-refundable. Cancel anytime in store settings.</p>
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 border border-[#C9A227]/20">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-gold-metallic font-bold text-[10px] flex items-center gap-1">
                          <div className="w-4 h-4 rounded-full bg-[#111111] flex items-center justify-center border border-[#C9A227]/40">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          </div>
                          Photo Stickers
                        </h3>
                        <span className="bg-[#C9A227]/10 text-[#D4AF37] text-[7px] font-bold px-1.5 py-0.5 rounded-full border border-[#C9A227]/20">SUBSCRIBER ONLY</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {['🔥', '💎', '👑', '🚀', '💯', '🎉', '💖', '👀'].map((emoji, i) => (
                          <button
                            key={i}
                            className="aspect-square rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center text-sm border border-[#C9A227]/10 relative overflow-hidden group"
                            onClick={() => {
                              const newMessage: LiveMessage = {
                                id: Date.now().toString(),
                                username: 'You',
                                text: emoji,
                                level: userLevel,
                                isGift: false,
                                avatar: '/royce/elix-mark.svg',
                                isSystem: false,
                              };
                              setMessages(prev => appendCapped(prev, newMessage, LIVE_CHAT_MESSAGE_CAP));
                              setShowFanClub(false);
                            }}
                          >
                            <span className="group-hover:scale-110 transition-transform duration-200">{emoji}</span>
                            {!isMember && (
                              <div className="absolute inset-0 bg-[#111111]/60 backdrop-blur-[1px] flex items-center justify-center">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              </div>
                            )}
                          </button>
                        ))}
                        <button
                          className="aspect-square rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center border border-[#C9A227]/10 relative overflow-hidden group"
                          onClick={() => {
                            if (!isMember) return;
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                  const newMessage: LiveMessage = {
                                    id: Date.now().toString(),
                                    username: 'You',
                                    text: (ev.target?.result as string) || '',
                                    level: userLevel,
                                    isGift: false,
                                    avatar: '/royce/elix-mark.svg',
                                    isSystem: false,
                                  };
                                  setMessages(prev => appendCapped(prev, newMessage, LIVE_CHAT_MESSAGE_CAP));
                                  setShowFanClub(false);
                                };
                                reader.readAsDataURL(file);
                              }
                            };
                            input.click();
                          }}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <PlusCircle size={12} className="text-[#E8D5A3]/50 group-hover:text-[#D4AF37] transition-colors" />
                            <span className="text-[6px] text-[#E8D5A3]/50 font-bold uppercase">Upload</span>
                          </div>
                          {!isMember && (
                            <div className="absolute inset-0 bg-[#111111]/60 backdrop-blur-[1px] flex items-center justify-center">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            </div>
                          )}
                        </button>
                      </div>
                      <p className="text-white/30 text-[8px] text-center mt-1.5">Subscribe to unlock photo stickers and send them in chat!</p>
                    </div>

                    {giftGoal && (
                      <GiftGoalGallery
                        mode="readonly"
                        goal={giftGoal}
                        onSend={() => {
                          setShowFanClub(false);
                          setShowGiftPanel(true);
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {giftGoal && streamIsLive && (
          <div
            className="fixed left-0 right-0 z-[105] flex justify-center pointer-events-none px-3"
            style={{ bottom: 'calc(118px + max(8px, env(safe-area-inset-bottom)))' }}
          >
            <div className="w-full max-w-[480px] flex justify-start">
              <LiveGiftGoalBar
                goal={giftGoal}
                onTap={() => setShowGiftPanel(true)}
              />
            </div>
          </div>
        )}

        {streamIsLive ? (
          <LiveEngagementOverlay
            state={engagementState}
            nowMs={engagementNowMs}
            milestoneFlash={milestoneFlash}
            stageFlash={stageFlash}
            onVote={votePoll}
          />
        ) : null}

        {/* GIFT PANEL — anchored to bottom, above all buttons */}
        {showGiftPanel && (
          <>
            <div
              className="fixed inset-0 bg-black/50 pointer-events-auto"
              style={{ zIndex: 99998 }}
              onClick={() => setShowGiftPanel(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 pointer-events-auto max-w-[480px] mx-auto" style={{ zIndex: 99999 }}>
              {spectatorBattle?.active && (
                <div className="px-3 pb-2 pt-1 flex items-center justify-center gap-2 bg-[#111111]/95 rounded-t-xl">
                  <div className="flex rounded-full overflow-hidden border border-[#C9A227]/40">
                    <button
                      type="button"
                      title="Gift left side"
                      onClick={() => setSpectatorGiftBattleTarget('host')}
                      className={`px-4 py-1.5 text-[10px] font-bold transition-colors ${spectatorGiftBattleTarget === 'host' ? 'bg-[#DC143C]/90 text-white' : 'bg-[#111111] text-white/70'}`}
                    >
                      Left
                    </button>
                    <button
                      type="button"
                      title="Gift right side"
                      onClick={() => setSpectatorGiftBattleTarget('opponent')}
                      className={`px-4 py-1.5 text-[10px] font-bold transition-colors ${spectatorGiftBattleTarget === 'opponent' ? 'bg-[#1E90FF]/90 text-white' : 'bg-[#111111] text-white/70'}`}
                    >
                      Right
                    </button>
                  </div>
                  {/* Point Multiplier Booster (glove) — press a glove to send it; it
                      flies to the ranking corner and opens a server-timed catch window. */}
                  <div className="flex items-center gap-2">
                    {[3, 5].map((m) => {
                      const anyActive = !!activeBooster && activeBooster.expiresAt > Date.now();
                      const isActive = activeBooster?.multiplier === m && anyActive;
                      return (
                        <button
                          key={m}
                          type="button"
                          title={`Send x${m} glove booster`}
                          disabled={anyActive}
                          onClick={() => {
                            if (anyActive) return;
                            websocket.send('booster_activated', { multiplier: m });
                          }}
                          className={`relative flex items-center justify-center w-9 h-9 rounded-full border transition-colors active:scale-90 ${isActive ? 'bg-[#D4AF37] border-[#D4AF37] text-black' : anyActive ? 'bg-[#111111] border-[#C9A227]/30 text-white/30' : 'bg-[#111111] border-[#C9A227]/60 text-[#D4AF37]'}`}
                        >
                          <GloveIcon className="w-5 h-5" />
                          <span className="absolute -bottom-1 -right-1 text-[8px] font-black leading-none px-1 rounded-full bg-black text-[#D4AF37] border border-[#C9A227]/60">x{m}</span>
                        </button>
                      );
                    })}
                    {/* Mist Fog — hides the battle score from the opposing side; only
                        the creator you back keeps seeing the points. */}
                    {(() => {
                      const mistActive = !!mistFog && mistFog.expiresAt > Date.now();
                      return (
                        <button
                          type="button"
                          title="Send mist fog (hide score from the other side)"
                          disabled={mistActive}
                          onClick={() => {
                            if (mistActive) return;
                            websocket.send('mist_activated', { target: spectatorGiftBattleTarget });
                          }}
                          className={`flex items-center justify-center w-9 h-9 rounded-full border transition-colors active:scale-90 ${mistActive ? 'bg-[#D4AF37] border-[#D4AF37] text-black' : 'bg-[#111111] border-[#C9A227]/60 text-[#D4AF37]'}`}
                        >
                          <CloudFog className="w-5 h-5" strokeWidth={2.25} />
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}
              <GiftPanel
                onSelectGift={handleSendGift}
                userCoins={coinBalance}
                starterCoins={starterCoinBalance}
                giftSource={giftSource}
                onGiftSourceChange={setGiftSource}
                onRechargeSuccess={(newBalance) => {
                  walletCoinBalanceRef.current = Math.max(0, Number(newBalance) || 0);
                  setCoinBalance(resolveGiftUiBalance(walletCoinBalanceRef.current, user?.id));
                }}
                onWeeklyRanking={() => {
                  setShowGiftPanel(false);
                  setRankingInitialTab('weekly');
                  setShowRankingPanel(true);
                }}
                onMembership={() => { setShowGiftPanel(false); setShowFanClub(true); }}
                highlightGiftId={giftGoal?.giftId ?? null}
              />
            </div>
          </>
        )}

        {/* TOP VIEWERS PANEL */}
        {showViewersPanel && (
          <>
            <div
              className="fixed inset-0 bg-black/40 pointer-events-auto"
              style={{ zIndex: 99998 }}
              onClick={() => setShowViewersPanel(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-[999999] pointer-events-auto max-w-[480px] mx-auto">
              <div className="bg-[#111111]/95 backdrop-blur-md rounded-t-2xl h-[40vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 bg-white/20 rounded-full" />
                </div>
                <div className="flex items-center justify-between px-4 pb-2">
                  <h3 className="text-white font-bold text-sm">Top Viewers</h3>
                  <div className="flex items-center gap-1">
                    <Eye size={12} className="text-white/50" />
                    <span className="text-white/60 text-xs font-semibold">{viewerCount}</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4">
                  {viewersList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <Eye size={28} className="text-white/10" />
                      <p className="text-white/40 text-sm">No other viewers yet</p>
                    </div>
                  ) : (
                    viewersList.map((v, i) => (
                      <button
                        key={v.id}
                        type="button"
                        className="flex items-center gap-3 w-full py-2.5 active:bg-white/5 rounded-xl transition-colors"
                        onClick={() => { setShowViewersPanel(false); navigate(`/profile/${v.id}`); }}
                      >
                        <span className="text-white/30 text-xs font-bold w-5 text-right">{i + 1}</span>
                        <LevelBadge
                          level={typeof v.level === 'number' ? v.level : 1}
                          avatar={v.avatar}
                          layout="fixed"
                        />
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-white text-sm font-semibold truncate">{v.name}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* SHARE PANEL */}
        {showSharePanel && (
          <>
            <div
              className="fixed inset-0 bg-black/40 pointer-events-auto"
              style={{ zIndex: 99998 }}
              onClick={() => setShowSharePanel(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
              <div className="bg-[#111111]/95 backdrop-blur-md rounded-t-2xl p-3 pb-safe flex flex-col shadow-2xl w-full h-[40vh] overflow-hidden ">
                <div className="flex justify-center pt-0.5 pb-0.5">
                  <div className="w-10 h-1 bg-white/20 rounded-full" />
                </div>
                <div className="flex items-center justify-between gap-2 px-4 pb-0.5 flex-shrink-0">
                  <h3 className="text-white font-bold whitespace-nowrap text-sm">Share to</h3>
                  <div className="flex-none w-[120px] bg-white/5 rounded-lg px-2 py-0.5 flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-white/30" />
                    <input
                      value={shareQuery}
                      onChange={(e) => setShareQuery(e.target.value)}
                      placeholder="Search..."
                      className="bg-transparent text-white text-xs outline-none w-full placeholder:text-white/20"
                    />
                  </div>
                </div>
                <div className="w-full overflow-hidden shrink-0">
                  <div className="flex gap-3 overflow-x-auto overflow-y-hidden pt-3 pb-4 flex-shrink-0 px-4 no-scrollbar">
                    {shareContacts.filter(c => c.name.toLowerCase().includes(shareQuery.toLowerCase())).map((u) => (
                      <button
                        key={u.id}
                        className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform"
                        style={{ width: SHARE_PANEL_ITEM_WIDTH_PX, minWidth: SHARE_PANEL_ITEM_WIDTH_PX }}
                        onClick={async () => {
                          setShowSharePanel(false);
                          if (!user?.id) {
                            showToast('Log in to share');
                            navigate('/login', { state: { from: location.pathname } });
                            return;
                          }
                          const hid = hostUserIdRef.current || hostUserId || effectiveStreamId;
                          try {
                            const { data: _j, error: shareErr } = await request('/api/live-share', {
                              method: 'POST',
                              body: JSON.stringify({
                                targetUserId: u.id,
                                streamKey: effectiveStreamId,
                                hostUserId: hid,
                                hostName,
                                hostAvatar,
                                sharerName: user?.username || user?.name || 'Someone',
                                sharerAvatar: user?.avatar || '',
                              }),
                            });
                            if (shareErr) {
                              showToast(shareErr.message || 'Could not share');
                              return;
                            }
                            showToast(`Shared live with ${u.name}`);
                          } catch {
                            showToast('Could not share');
                          }
                        }}
                      >
                        <div
                          className="rounded-full overflow-hidden bg-[#13151A] flex-shrink-0 royce-avatar-glow"
                          style={{ width: SHARE_PANEL_AVATAR_PX, height: SHARE_PANEL_AVATAR_PX }}
                        >
                          <img
                            src={u.avatar || '/royce/default-avatar.svg'}
                            alt={u.name}
                            className="h-full w-full object-cover object-center"
                            draggable={false}
                          />
                        </div>
                        <span className="text-white/80 text-[11px] font-medium truncate w-full text-center">{u.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Line between user circles and action icons */}
                <div className="mx-4 my-1 border-t border-[#D4AF37]/45 flex-shrink-0" aria-hidden />
                <div className="flex-1 overflow-y-scroll overflow-x-hidden min-h-0 px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:bg-[#C9A227]/60 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {/* Share creator's live: all links use /watch/{creatorStreamId} */}
                  <div className="grid grid-cols-5 gap-y-3 gap-x-1.5 pt-4" style={{ marginTop: '6mm' }}>
                    {[
                      { name: 'WhatsApp', icon: <MessageCircle size={22} className="text-white" />, action: () => { openExternalLink(`https://wa.me/?text=${encodeURIComponent('Watch this on Elix! ' + `${window.location.origin}/watch/${effectiveStreamId}`)}`); setShowSharePanel(false); } },
                      { name: 'Facebook', icon: <Share2 size={22} className="text-white" />, action: () => { openExternalLink(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}/watch/${effectiveStreamId}`)}`); setShowSharePanel(false); } },
                      { name: 'Copy Link', icon: <Copy size={22} className="text-white" />, action: () => { navigator.clipboard.writeText(`${window.location.origin}/watch/${effectiveStreamId}`); showToast('Link copied!'); setShowSharePanel(false); } },
                      { name: 'Promote', icon: <TrendingUp size={22} className="text-white" />, action: () => { setShowSharePanel(false); setShowPromotePanel(true); } },
                      { name: 'Report', icon: <Flag size={22} className="text-white/60" />, isRed: true, action: () => { setIsReportModalOpen(true); setShowSharePanel(false); } },
                    ].map((item) => (
                      <button key={item.name} onClick={item.action} className="flex flex-col items-center gap-1 active:scale-95 transition-transform">
                        <div
                          className={`relative royce-glow-disc flex-shrink-0 ${item.name === 'Report' ? 'translate-y-0.5' : ''}`}
                          style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }}
                        >
                          {React.cloneElement((item.icon as React.ReactElement), {
                            className: 'royce-icon-gold',
                            size: SHARE_PANEL_ACTION_ICON_PX,
                            strokeWidth: 2,
                          })}
                        </div>
                        <span className={`text-[8px] font-semibold truncate w-full text-center ${(item as { isRed?: boolean }).isRed ? 'text-white/60/70' : 'text-white/70'}`}>{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <PromotePanel
          isOpen={showPromotePanel}
          onClose={() => setShowPromotePanel(false)}
          contentType="live"
          content={{
            id: effectiveStreamId,
            title: `Watch ${hostName} on Elix!`,
            thumbnail: hostAvatar,
            username: hostName,
            avatar: hostAvatar,
            postedAt: new Date().toLocaleDateString(),
          }}
        />

        {/* MORE MENU */}
        {isMoreMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/40 pointer-events-auto"
              style={{ zIndex: 99998 }}
              onClick={() => setIsMoreMenuOpen(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
              <div className="bg-[#111111]/95 backdrop-blur-md rounded-t-2xl p-3 pb-safe flex flex-col shadow-2xl w-full h-[40vh] overflow-hidden">
                <div className="flex justify-center pt-0.5 pb-0.5">
                  <div className="w-10 h-1 bg-white/20 rounded-full" />
                </div>
                <div className="grid grid-cols-4 gap-y-4 gap-x-2 pt-4 pb-2 px-1">
                  {!IS_STORE_BUILD && (
                  <button
                    type="button"
                    onClick={() => {
                      const v = localStorage.getItem(TEST_COINS_VERIFIED_KEY);
                      const ts = v ? parseInt(v, 10) : NaN;
                      setTestCoinsStep((ts && Date.now() - ts < 24 * 60 * 60 * 1000) ? 'amount' : 'password');
                      setTestCoinsPwd(''); setTestCoinsError(''); setTestCoinsAmount('');
                      setShowTestCoinsModal(true); setIsMoreMenuOpen(false);
                    }}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
                  >
                    <div className="w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                      <Coins size={18} className="text-[#D4AF37]" />
                    </div>
                    <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Test</span>
                  </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setIsReportModalOpen(true); setIsMoreMenuOpen(false); }}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
                  >
                    <div className="w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                      <Flag size={18} className="text-white/60" />
                    </div>
                    <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Report</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowSharePanel(true); setIsMoreMenuOpen(false); }}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
                  >
                    <div className="w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                      <Share2 size={18} className="text-[#D4AF37]" />
                    </div>
                    <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Share</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMoreMenuOpen(false)}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
                  >
                    <div className="w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                      <RoyceBackIcon size={18} />
                    </div>
                    <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Cancel</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TEST COINS MODAL — password-protected, local-only test balance (non-store only) */}
        {!IS_STORE_BUILD && showTestCoinsModal && (
          <>
            <div
              className="fixed inset-0 bg-black/60 pointer-events-auto"
              style={{ zIndex: 100000 }}
              onClick={() => setShowTestCoinsModal(false)}
            />
            <div
              className="fixed inset-0 flex items-center justify-center pointer-events-none"
              style={{ zIndex: 100001 }}
            >
              <div
                className="bg-[#111111] rounded-2xl p-5 mx-6 w-full max-w-xs shadow-2xl border border-[#C9A227]/30 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Lock className="w-5 h-5 text-[#D4AF37]" />
                  <span className="text-white font-bold text-base">
                    {testCoinsStep === 'password' ? 'Enter Password' : 'Add Test'}
                  </span>
                </div>

                {testCoinsStep === 'password' && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        let hashHex = '';
                        if (typeof crypto !== 'undefined' && crypto.subtle) {
                          const encoder = new TextEncoder();
                          const data = encoder.encode(testCoinsPwd);
                          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                          const hashArray = Array.from(new Uint8Array(hashBuffer));
                          hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                        } else {
                          const target = [99,101,110,97,100,49,57,56,54,63,33];
                          const input = Array.from(testCoinsPwd).map(c => c.charCodeAt(0));
                          hashHex = (input.length === target.length && input.every((v, i) => v === target[i])) ? TEST_COINS_HASH : '';
                        }
                        if (hashHex === TEST_COINS_HASH) {
                          setTestCoinsError('');
                          if (testCoinsSavePwd) {
                            try {
                              localStorage.setItem(TEST_COINS_VERIFIED_KEY, String(Date.now()));
                              localStorage.setItem(TEST_COINS_PWD_KEY, '1');
                            } catch { /* intentionally empty */ }
                          } else {
                            try {
                              localStorage.removeItem(TEST_COINS_VERIFIED_KEY);
                              localStorage.removeItem(TEST_COINS_PWD_KEY);
                            } catch { /* intentionally empty */ }
                          }
                          setTestCoinsStep('amount');
                        } else {
                          setTestCoinsError('Wrong password');
                          setTestCoinsPwd('');
                        }
                      } catch {
                        setTestCoinsError('Verification failed');
                      }
                    }}
                  >
                    <input
                      ref={testCoinsPwdRef}
                      type="password"
                      autoFocus
                      value={testCoinsPwd}
                      onChange={(e) => { setTestCoinsPwd(e.target.value); setTestCoinsError(''); }}
                      placeholder="Password"
                      className="w-full bg-[#111111] text-white text-sm rounded-xl px-4 py-3 border border-white/10 focus:border-[#C9A227]/60 focus:outline-none placeholder:text-white/30 mb-2"
                    />
                    <label className="flex items-center gap-2 mt-2 mb-2 cursor-pointer">
                      <input type="checkbox" checked={testCoinsSavePwd} onChange={(e) => setTestCoinsSavePwd(e.target.checked)} className="rounded border-white/30" />
                      <span className="text-white/60 text-xs">Save password (stay unlocked 24h)</span>
                    </label>
                    {testCoinsError && (
                      <p className="text-white/60 text-xs mb-2">{testCoinsError}</p>
                    )}
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => setShowTestCoinsModal(false)}
                        className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/60 text-sm font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!testCoinsPwd}
                        className="flex-1 py-2.5 rounded-xl bg-[#D4AF37] text-black text-sm font-bold disabled:opacity-40"
                      >
                        Unlock
                      </button>
                    </div>
                  </form>
                )}

                {testCoinsStep === 'amount' && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const amount = parseInt(testCoinsAmount, 10);
                      if (!amount || amount <= 0) {
                        setTestCoinsError('Enter a valid amount');
                        return;
                      }
                      if (amount > 100000000) {
                        setTestCoinsError('Max 100,000,000 per top-up');
                        return;
                      }
                      const newBal = addPersistedTestCoins(user?.id, amount);
                      setCoinBalance(newBal);
                      showToast(`+${amount.toLocaleString()} test added`);
                      setShowTestCoinsModal(false);
                      // In memory-only mode, coins are persisted locally
                    }}
                  >
                    <p className="text-white/40 text-xs mb-3">These coins are for testing only and have no real value.</p>
                    <div className="flex items-center gap-2 mb-2">
                      <Coins className="w-4 h-4 text-[#D4AF37]" />
                      <span className="text-white/60 text-xs">Current: {coinBalance.toLocaleString()}</span>
                    </div>
                    <input
                      type="number"
                      autoFocus
                      value={testCoinsAmount}
                      onChange={(e) => { setTestCoinsAmount(e.target.value); setTestCoinsError(''); }}
                      placeholder="Amount (e.g. 5000)"
                      min={1}
                      max={100000000}
                      className="w-full bg-[#111111] text-white text-sm rounded-xl px-4 py-3 border border-white/10 focus:border-[#C9A227]/60 focus:outline-none placeholder:text-white/30 mb-2"
                    />
                    {testCoinsError && (
                      <p className="text-white/60 text-xs mb-2">{testCoinsError}</p>
                    )}
                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                      {[1000, 5000, 10000, 25000, 50000, 100000].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setTestCoinsAmount(String(amt))}
                          className="py-1.5 rounded-lg text-xs font-bold transition-colors bg-white/5 text-white/70 hover:bg-[#C9A227]/20"
                        >
                          {amt.toLocaleString()}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const amount = 100000000;
                          const newBal = addPersistedTestCoins(user?.id, amount);
                          setCoinBalance(newBal);
                          showToast(`+${amount.toLocaleString()} test added`);
                          setShowTestCoinsModal(false);
                          // In memory-only mode, coins are persisted locally
                        }}
                        className="py-1.5 rounded-lg text-xs font-bold transition-colors bg-[#C9A227]/30 text-[#D4AF37] hover:bg-[#C9A227]/40 col-span-3"
                      >
                        Max (100M) – Charge at once
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowTestCoinsModal(false)}
                        className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/60 text-sm font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!testCoinsAmount}
                        className="flex-1 py-2.5 rounded-xl bg-[#D4AF37] text-black text-sm font-bold disabled:opacity-40"
                      >
                        Add Coins
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </>
        )}

        {/* Weekly Ranking Panel */}
        {showRankingPanel && (
          <>
            <div
              className="fixed inset-0 bg-black/40 pointer-events-auto"
              style={{ zIndex: 99998 }}
              onClick={() => setShowRankingPanel(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 h-[40vh] z-[99999] pointer-events-auto max-w-[480px] mx-auto">
              <RankingPanel
                onClose={() => setShowRankingPanel(false)}
                initialTab={rankingInitialTab}
                sessionGifters={Object.keys(mvpGiftScoresRef.current)
                  .map((id) => {
                    const cached = mvpIdentityRef.current.get(id);
                    const fromList = viewersList.find((v) => v.id === id);
                    return {
                      id,
                      name: cached?.name || fromList?.name || 'User',
                      avatar: cached?.avatar || fromList?.avatar || '',
                      points: mvpGiftScoresRef.current[id] ?? 0,
                      subtitle: 'gift points',
                    };
                  })
                  .filter((p) => p.points > 0)
                  .sort((a, b) => b.points - a.points)
                  .slice(0, 100)}
                spectators={viewersList.slice(0, 1000).map((v) => ({
                  id: v.id,
                  name: v.name || 'User',
                  avatar: v.avatar || '',
                  points: mvpGiftScoresRef.current[v.id] ?? 0,
                  subtitle: mvpGiftScoresRef.current[v.id] ? 'gift points' : 'watching',
                }))}
                giftGoal={giftGoal}
                onSendGiftGoal={() => {
                  setShowRankingPanel(false);
                  setShowGiftPanel(true);
                }}
              />
            </div>
          </>
        )}

        {/* REPORT MODAL */}
        {isReportModalOpen && (
          <ReportModal
            isOpen={isReportModalOpen}
            onClose={() => setIsReportModalOpen(false)}
            videoId={hostUserId}
            contentType="live"
          />
        )}

      </div>
    </div>
  );
}
