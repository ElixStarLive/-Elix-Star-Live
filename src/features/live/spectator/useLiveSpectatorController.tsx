import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { showToast } from '../../../lib/toast';
import { prepareLiveVideoEl } from '../../../lib/prepareLiveVideoEl';
import { useLiveEngagement } from '../../../hooks/useLiveEngagement';
import { earnBattleEnergyQuiet } from '../../../components/BattleEnergyBoostControls';
import { type EngagementPanel } from '../../../components/engagement/EngagementDrawer';
import { GiftUiItem, GIFT_COMBO_MAX, resolveGiftAssetUrl } from '../../../lib/giftsCatalog';
import { appendCapped, LIVE_CHAT_MESSAGE_CAP } from '../../../lib/liveRuntimeCaps';
import { type BattleMistSide, type GloveBurst } from '../../../components/BattleVfxOverlays';
import {
  announceMvpName,
  createTauntBurst,
  playBattleTauntSound,
  type TauntBurst,
} from '../../../lib/battleTaunts';
import {
  applyBattleScoreLeadFeedback,
  applyBattleWinTauntFeedback,
  runBattleScoreVfx,
} from '../battle/applyBattleScoreFeedback';
import { createBattleBoosterMistHandlers } from '../battle/battleBoosterMistEvents';
import { battleStreamIdsFromPayload } from '../battle/battleStreamIdsFromPayload';
import { tryUnlockBattleSpeedChallenge } from '../battle/tryUnlockBattleSpeedChallenge';
import { loadSharePanelContactsWithLive } from '../share/loadSharePanelContactsWithLive';
import { applyLiveGiftGoalSync } from '../gifts/applyLiveGiftGoalSync';
import { loadDiamondLeagueRankForCreator } from '../engagement/loadDiamondLeagueRankForCreator';
import { loadLiveModeratorsForRoom } from '../engagement/loadLiveModeratorsForRoom';
import { startLiveEngagementWatchTick } from '../engagement/startLiveEngagementWatchTick';
import { buildLiveWsChatMessage } from '../chat/buildLiveWsChatMessage';
import {
  appendLiveJoinStreamBanner,
  maybeFixJoinBannerLevelFromProfile,
  scheduleLiveJoinBannerClear,
} from '../chat/liveJoinStreamBanner';
import { useMistFogAutoExpire } from '../battle/useMistFogAutoExpire';
import {
  computeBattleFinalSecondsHide,
  computeMistHidesScoresForViewer,
} from '../battle/battleScoreVisibility';
import { openLiveGiftSentHandler } from '../gifts/openLiveGiftSentHandler';
import { resolveLiveGiftSpendableBalance } from '../gifts/resolveLiveGiftSpendableBalance';
import { applyLiveWalletBootstrapUi } from '../gifts/applyLiveWalletBootstrapUi';
import { reportLiveCommentEngagement } from '../engagement/reportLiveCommentEngagement';
import { isSpeakingUserId, toggleFeaturedUserId } from '../cohost/liveFeaturedSpeaking';
import { findCoHostVideoElByIdentity } from '../cohost/findCoHostVideoElByIdentity';
import { markRemoteCamOff } from '../cohost/markRemoteCamOff';
import { attachRemoteParticipantVideoByIds } from '../cohost/attachRemoteParticipantVideo';
import { resolveHeartSpawnFromClient } from '../chat/resolveHeartSpawnFromClient';
import { createFloatingHeartParticle } from '../chat/createFloatingHeartParticle';
import {
  addTestGiftXp,
  debitTestCoinsForGift,
  getPersistedTestCoinsBalance,
  getTestLevel,
  shouldUseTestCoinsForGifts,
} from '../../../lib/testCoins';
import { authorizeTestCoinIssue, mintTestCoinsViaServer } from '../../../lib/testCoinIssueApi';
import { SPECTATOR_MVP_PROFILE_RING_PX } from '../../../lib/profileFrame';
import { applyCohostGiftTileScore, applyLocalGiftSendSideEffects } from '../gifts/applyLocalGiftSendSideEffects';
import { useAuthStore } from '../../../store/useAuthStore';
import { useWalletStore } from '../../../store/useWalletStore';
import { useVideoStore } from '../../../store/useVideoStore';
import { type LiveRankTab } from '../../../lib/liveRankTab';
import { websocket } from '../../../lib/websocket';
import { bindLiveBattleWs } from '../ws/bindLiveBattleWs';
import { bindLiveBattleInviteWs } from '../ws/bindLiveBattleInviteWs';
import { bindLiveRoomWs } from '../ws/bindLiveRoomWs';
import { applyServerViewerCount } from '../ws/applyServerViewerCount';
import { bindLiveCohostWs } from '../ws/bindLiveCohostWs';
import {
  DEFAULT_COHOST_LAYOUT_ID,
  parseCohostLayoutId,
  type CohostLayoutId,
} from '../cohost/cohostLayoutPresets';
import {
  appendBattleTileGiftForTarget,
  BATTLE_TILE_GIFT_STACK_CAP,
  EMPTY_BATTLE_TILE_GIFTS,
  normalizeBattleGiftTarget,
  resolveBattleGiftIconUrl,
  resolveBattleSlotForCreatorId,
  resolveServerBattleGiftTarget,
  shouldPlayFullBattleGiftVideo,
  type BattleTileGifts,
  type ServerBattleGiftTarget,
} from '../../../lib/liveBattleGiftTarget';
import { liveBoosterActivated, liveMistActivated } from '../room/liveRoomActions';
import { type LiveGiftGoal } from '../../../lib/liveGiftGoal';
import { resolveUiAvatarUrl } from '../../../lib/royceAssets';
import {
  loginReturnPath,
  stashPendingMembershipPurchase,
} from '../../membership/membershipPurchaseFlow';
import { useCreatorMembershipPurchase } from '../../membership/useCreatorMembershipPurchase';
import { useLiveThermalQuality } from '../hooks/useLiveThermalQuality';
import { applyRemoteVideoBudget } from '../../../lib/live/liveRemoteVideoBudget';
import {
  apiLiveGetDailyHearts,
  apiLiveMembership,
  apiLiveSendDailyHeart,
  apiLiveEngagementProgress,
} from '../engagement/liveEngagementApi';
import { reportFailure } from '../../../lib/reportFailure';
import {
  apiFetchFollowingIds,
  apiFetchProfileById,
  apiToggleFollow,
} from '../../feed/feedApi';
import { RoomEvent, ConnectionState } from 'livekit-client';
import { apiLiveStreams, apiLiveToken } from '../../../lib/live';
import { sendLivePaidGift } from '../gifts/sendLiveGift';
import { applyLiveGiftWalletResult } from '../gifts/applyLiveGiftWalletResult';
import { useLiveWalletDisplay } from '../gifts/useLiveWalletDisplay';
import { refreshLiveGiftPanelBalances, loadLiveGiftWalletBootstrap } from '../gifts/refreshLiveGiftPanelBalances';
import { resolveLocalGiftVideoUrl, resolvePlayableGiftVideoUrl } from '../gifts/liveGiftIngest';
import { buildLiveGiftChatMessage } from '../gifts/processLiveGiftSentEvent';
import { useLiveGiftPlaybackQueue } from '../gifts/useLiveGiftPlaybackQueue';
import { useLiveGiftsCatalog } from '../hooks/useLiveGiftsCatalog';
import { useLiveCamera } from '../hooks/useLiveCamera';
import { useSpectatorLiveSession } from './session/useSpectatorLiveSession';
import type { LiveKitSessionHandlers } from '../../../lib/liveKitSession';
import {
  battleGetState,
  battleSpectatorVote,
} from '../battle/liveBattleActions';
import {
  applyBattleTickTime,
  applyBattleWinStreak,
  resolveServerBattleWinner,
} from '../battle/liveBattleScore';
import { useBattleServerTotals } from '../battle/useBattleServerTotals';
import { runBattleInviteAccept, runBattleInviteDecline } from '../battle/liveBattleInviteHandshake';
import { cohostRequestSend } from '../cohost/liveCohostActions';
import { liveChatSend, liveHeartSend } from '../chat/liveChatActions';
import { useLiveStreamChatMessages } from '../chat/useLiveStreamChatMessages';
import { useLiveEngagementMissionsUi } from '../engagement/useLiveEngagementMissionsUi';
import { liveGiftSentWs } from '../gifts/liveGiftWsActions';

/** Co-host tile gift totals — 15K / 100K / 500K style. */
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
    setGiftsCatalog,
  } = useLiveGiftsCatalog();
  const {
    currentGift,
    setCurrentGift,
    giftQueue,
    setGiftQueue,
    giftKey,
    setGiftKey,
    enqueueGiftVideo,
    handleGiftEnded,
    seenGiftTxnRef,
    playedGiftVideoTxnRef,
    markGiftTxnSeen,
    hasSeenGiftTxn,
    hasPlayedGiftVideoTxn,
    enqueueFromGiftSent,
  } = useLiveGiftPlaybackQueue();
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

  const { messages, setMessages, clearMessagesForStream } =
    useLiveStreamChatMessages(effectiveStreamId);
  const [inputValue, setInputValue] = useState('');
  /** Local test coins (battle/animation QA only). Never merge into coinBalance. */
  const [testCoinBalance, setTestCoinBalance] = useState(0);
  /** Real wallet coins — never overwritten by test-coin display balance. */
  const {
    coinBalance,
    starterCoinBalance,
    promotionalCoinBalance,
    giftSource,
    setGiftSource,
    walletCoinBalanceRef,
    storePaidBalance,
    storeStarterBalance,
    storePromoBalance,
  } = useLiveWalletDisplay(user?.id);

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
  const [showTeamStatus, setShowTeamStatus] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  // Point Multiplier Booster (glove) — the spectator's own active booster
  // (server-driven window), transient glove-send animations (fly to the weekly-
  // ranking corner when any spectator sends one), and transient "caught" popups.
  const [activeBooster, setActiveBooster] = useState<{ multiplier: number; expiresAt: number } | null>(null);
  const [boosterActivations, setBoosterActivations] = useState<{ id: string; userId: string; multiplier: number; username: string; expiresAt: number }[]>([]);
  const [boosterCatches, setBoosterCatches] = useState<{ id: string; multiplier: number; finalPoints: number; username: string }[]>([]);
  /** Auto cycle x2 → x3 → x5 — user never picks the tier. */
  const autoBoosterTierRef = useRef(0);
  // Mist Fog booster — server-driven window that hides the battle score for
  // everyone EXCEPT the supported creator (supportedUserId). Purely visual.
  const [mistFog, setMistFog] = useState<{ supportedUserId: string; supportedSide: 'host' | 'opponent'; expiresAt: number } | null>(null);

  const [streamEndedReceived, setStreamEndedReceived] = useState(false);

  const {
    state: engagementState,
    milestoneFlash,
    stageFlash,
    votePoll,
  } = useLiveEngagement({ enabled: streamIsLive === true, isHost: false });

  const [showTestCoinsModal, setShowTestCoinsModal] = useState(false);
  const [testCoinsStep, setTestCoinsStep] = useState<'password' | 'amount'>('password');
  const [testCoinsPwd, setTestCoinsPwd] = useState('');
  const [testCoinsAmount, setTestCoinsAmount] = useState('');
  const [testCoinsError, setTestCoinsError] = useState('');
  const [testCoinsBusy, setTestCoinsBusy] = useState(false);
  const testCoinsPwdRef = useRef<HTMLInputElement>(null);
  const [shareQuery, setShareQuery] = useState('');
  const [shareContacts, setShareContacts] = useState<{ id: string; name: string; avatar: string }[]>([]);
  const [shareLiveUserIds, setShareLiveUserIds] = useState<Set<string>>(() => new Set());
  const [lastSentGift, setLastSentGift] = useState<GiftUiItem | null>(null);
  const [comboCount, setComboCount] = useState(0);
  const [showComboButton, setShowComboButton] = useState(false);
  const {
    missionWatchMin,
    setMissionWatchMin,
    missionGiftsSent,
    setMissionGiftsSent,
    missionWatchGoal,
    setMissionWatchGoal,
    missionGiftsGoal,
    setMissionGiftsGoal,
    loadEngagementMissions,
  } = useLiveEngagementMissionsUi(user?.id, engagementOpen, engagementPanel);
  const [userXP, setUserXP] = useState(0);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetComboTimer = () => {
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    comboTimerRef.current = setTimeout(() => {
      setShowComboButton(false);
      setComboCount(0);
    }, 8000);
  };

  const [spectatorCoHostRequestSent, setSpectatorCoHostRequestSent] = useState(false);
  const [showViewersPanel, setShowViewersPanel] = useState(false);
  const [viewersList, setViewersList] = useState<{ id: string; name: string; avatar: string; level?: number; points?: number }[]>([]);
  const actualViewersRef = useRef<Map<string, { name: string; avatar: string; level: number }>>(new Map());
  /** One "joined the stream" banner per user for the whole live session (not per reconnect). */
  const joinAnnouncedRef = useRef<Set<string>>(new Set());
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
    const oppSlots = pickSide('opponent', new Set(hostSlots.map((s) => s.id)));
    const padSide = (side: 'host' | 'opponent', list: MvpSlotRow[]) => {
      const out = list.slice(0, 3);
      while (out.length < 3) {
        const i = out.length;
        out.push({
          id: `__mvp-empty-${side}-${i}`,
          name: '',
          avatar: '',
          level: 1,
          points: 0,
        });
      }
      return out;
    };
    setMvpSlots({
      global: withPoints(mvpGiftScoresRef.current, [...base].sort(sortBy(mvpGiftScoresRef.current)).slice(0, 3)),
      host: padSide('host', hostSlots),
      opponent: padSide('opponent', oppSlots),
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
    if (!targetHostId) {
      showToast('Host not ready — try again');
      return false;
    }
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

  /** Server-backed moderators; isModerator derived from list. */
  const [moderators, setModerators] = useState<Set<string>>(new Set());
  const isModerator = Boolean(user?.id && moderators.has(user.id));

  useEffect(() => {
    return loadLiveModeratorsForRoom(effectiveStreamId, setModerators);
  }, [effectiveStreamId]);

  const [hasJoinedToday, setHasJoinedToday] = useState(false);
  const [myHeartCount, setMyHeartCount] = useState(0);
  const [dailyHeartCount, setDailyHeartCount] = useState(0);
  /** Host lifetime real gift coins — gates LIVE Pro badge (1M threshold). */
  const [hostTotalGiftCoins, setHostTotalGiftCoins] = useState(0);
  const [heartMembers, setHeartMembers] = useState<
    { user_id: string; heart_days: number; username?: string; avatar_url?: string }[]
  >([]);
  const [topGifters, setTopGifters] = useState<
    { user_id: string; total_coins: number; username?: string; avatar_url?: string }[]
  >([]);
  const dailyHeartFetchedRef = useRef(false);

  useEffect(() => {
    dailyHeartFetchedRef.current = false;
    if (!hostUserId) return;
    dailyHeartFetchedRef.current = true;
    apiLiveGetDailyHearts(hostUserId).then(({ data: d }) => {
      if (d) {
        if (typeof d.todayCount === 'number') setDailyHeartCount(d.todayCount);
        if (typeof d.totalCount === 'number') setMyHeartCount(d.totalCount);
        setHasJoinedToday(d.hasSent === true);
      }
    }).catch((err) => reportFailure('live_daily_hearts', err, { hostUserId }));
  }, [hostUserId]);

  const refreshMembershipStats = useCallback(() => {
    const creatorId = String(hostUserId || effectiveStreamId || '').trim();
    if (!creatorId) {
      setHostTotalGiftCoins(0);
      setHeartMembers([]);
      setTopGifters([]);
      return;
    }
    void apiLiveMembership(creatorId)
      .then(({ data: d }) => {
        if (!d) return;
        const n = typeof d.totalGiftCoins === 'number' ? d.totalGiftCoins : 0;
        setHostTotalGiftCoins(Number.isFinite(n) ? Math.max(0, n) : 0);
        if (Array.isArray(d.heartMembers)) {
          setHeartMembers(
            d.heartMembers as {
              user_id: string;
              heart_days: number;
              username?: string;
              avatar_url?: string;
            }[],
          );
        }
        if (Array.isArray(d.topGifters)) {
          setTopGifters(
            d.topGifters as {
              user_id: string;
              total_coins: number;
              username?: string;
              avatar_url?: string;
            }[],
          );
        }
      })
      .catch((err) => reportFailure('live_membership_refresh', err, { creatorId }));
  }, [hostUserId, effectiveStreamId]);

  useEffect(() => {
    refreshMembershipStats();
  }, [refreshMembershipStats]);

  useEffect(() => {
    if (!showTeamStatus) return;
    refreshMembershipStats();
  }, [showTeamStatus, refreshMembershipStats]);

  const membershipCreatorId = String(hostUserId || effectiveStreamId || '').trim();
  const {
    isMember,
    isSubscribing,
    isSelf: membershipIsSelf,
    handleSubscribe,
  } = useCreatorMembershipPurchase({
    creatorId: membershipCreatorId,
    onActivated: refreshMembershipStats,
    onOpenPanel: () => setShowTeamStatus(true),
  });

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
    player3Name?: string;
    player4Name?: string;
    player3UserId?: string;
    player4UserId?: string;
    winner?: string;
    redTeamLabel?: string;
    blueTeamLabel?: string;
  } | null>(null);
  const spectatorBattleRef = useRef(spectatorBattle);
  spectatorBattleRef.current = spectatorBattle;
  const {
    applyScores,
    resetScores,
    battleServerTotalsRef,
  } = useBattleServerTotals();
  const [battleWinStreak, setBattleWinStreak] = useState<{ host: number; opponent: number }>({ host: 0, opponent: 0 });
  const battleWinStreakRef = useRef(battleWinStreak);
  battleWinStreakRef.current = battleWinStreak;
  const battleStreakCountedForEndRef = useRef(false);
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
    tryUnlockBattleSpeedChallenge({
      totalScore,
      flowers: roseCountRef.current,
      taps: battleScreenTapCountRef.current,
      reachedThresholds: reachedThresholdsRef.current,
      onUnlock: (mult) => {
        setSpeedMultiplier(mult);
        speedMultiplierRef.current = mult;
        startSpeedChallenge();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depend on score/status fields only; full spectatorBattle would re-run on unrelated battle metadata changes
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
    player3UserId: string;
    player4UserId: string;
  } | null>(null);

  // No Left/Right picker — gift + mist target follows the stream room you're watching.
  useEffect(() => {
    if (!spectatorBattle?.active) {
      setSpectatorGiftBattleTarget('host');
      return;
    }
    const sid = String(effectiveStreamId || '').trim();
    const oppRoom = String(battleStreamIds?.opponentRoomId || spectatorBattle.opponentRoomId || '').trim();
    const hostRoom = String(battleStreamIds?.hostRoomId || '').trim();
    if (oppRoom && sid && sid === oppRoom) {
      setSpectatorGiftBattleTarget('opponent');
      return;
    }
    if (hostRoom && sid && sid === hostRoom) {
      setSpectatorGiftBattleTarget('host');
      return;
    }
    // Fallback: if watching opponent room id embedded in battle state.
    if (oppRoom && sid === oppRoom) setSpectatorGiftBattleTarget('opponent');
    else setSpectatorGiftBattleTarget('host');
  }, [
    spectatorBattle?.active,
    spectatorBattle?.opponentRoomId,
    battleStreamIds?.hostRoomId,
    battleStreamIds?.opponentRoomId,
    effectiveStreamId,
  ]);

  // Resolve which creator's audience this spectator is for full gift-video routing.
  useEffect(() => {
    const navState = location.state as { battleAudienceCreatorId?: string } | null;
    const fromNav =
      typeof navState?.battleAudienceCreatorId === 'string'
        ? navState.battleAudienceCreatorId.trim()
        : '';
    const fromCurrentHost = String(hostUserIdRef.current || hostUserId || '').trim();
    const creatorId = fromNav || battleAudienceCreatorIdRef.current || fromCurrentHost;
    if (creatorId) {
      battleAudienceCreatorIdRef.current = creatorId;
    }
    if (!spectatorBattle?.active) {
      setBattleAudienceSlot('host');
      return;
    }
    const ids = {
      hostUserId: battleStreamIds?.hostUserId || hostUserId,
      opponentUserId: battleStreamIds?.opponentUserId,
      player3UserId: battleStreamIds?.player3UserId || spectatorBattle.player3UserId,
      player4UserId: battleStreamIds?.player4UserId || spectatorBattle.player4UserId,
      hostRoomId: battleStreamIds?.hostRoomId,
      opponentRoomId: battleStreamIds?.opponentRoomId || spectatorBattle.opponentRoomId,
    };
    const slot =
      resolveBattleSlotForCreatorId(creatorId, ids) ||
      resolveBattleSlotForCreatorId(effectiveStreamId, ids) ||
      'host';
    setBattleAudienceSlot(slot);
  }, [
    spectatorBattle?.active,
    spectatorBattle?.opponentRoomId,
    spectatorBattle?.player3UserId,
    spectatorBattle?.player4UserId,
    battleStreamIds,
    effectiveStreamId,
    hostUserId,
    location.state,
  ]);

  const fireAutoBooster = useCallback(() => {
    if (activeBooster && activeBooster.expiresAt > Date.now()) return;
    const tiers = [2, 3, 5] as const;
    const mult = tiers[autoBoosterTierRef.current % tiers.length];
    autoBoosterTierRef.current += 1;
    liveBoosterActivated({ multiplier: mult });
  }, [activeBooster]);

  const fireMistFog = useCallback(() => {
    if (mistFog && mistFog.expiresAt > Date.now()) return;
    liveMistActivated({ target: spectatorGiftBattleTarget });
  }, [mistFog, spectatorGiftBattleTarget]);
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
    runBattleScoreVfx(
      side,
      strength,
      { mistTimerRef: battleMistTimerRef, gloveIdRef },
      setBattleMistSide,
      setBattleGloves,
    );
  }, []);

  useEffect(() => {
    setBattleHideScores(
      computeBattleFinalSecondsHide(
        !!spectatorBattle?.active && spectatorBattle?.status === 'ACTIVE',
        spectatorBattle?.timeLeft ?? 0,
        !!spectatorBattle?.winner,
      ),
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
  const player3VideoRef = useRef<HTMLVideoElement>(null);
  const player4VideoRef = useRef<HTMLVideoElement>(null);
  const [hasPlayer3Stream, setHasPlayer3Stream] = useState(false);
  const [hasPlayer4Stream, setHasPlayer4Stream] = useState(false);
  const spectatorLiveKitHandlersRef = useRef<LiveKitSessionHandlers>({});
  const [hasOpponentStream, setHasOpponentStream] = useState(false);
  const [showOpponentPanel, setShowOpponentPanel] = useState(false);
  /** Which battle half opened the bottom partner panel. */
  const [battleSidePanel, setBattleSidePanel] = useState<'host' | 'opponent' | null>(null);
  const [lastOpponentGift, setLastOpponentGift] = useState<string[]>([]);
  const [lastHostGift, setLastHostGift] = useState<string[]>([]);
  /** Per-creator battle tile gift icons (small corner — not full video). */
  const [lastGifts, setLastGifts] = useState<BattleTileGifts>(EMPTY_BATTLE_TILE_GIFTS);
  /**
   * Which creator's audience this spectator belongs to for full gift-video routing.
   * Preserved across battle-room redirect via location.state + in-memory ref.
   */
  const [battleAudienceSlot, setBattleAudienceSlot] = useState<ServerBattleGiftTarget>('host');
  const battleAudienceSlotRef = useRef<ServerBattleGiftTarget>('host');
  battleAudienceSlotRef.current = battleAudienceSlot;
  const battleAudienceCreatorIdRef = useRef<string>('');
  /** Tap a co-host tile to gift them (null = gift goes to the stream host). */
  const [selectedCohostGiftUserId, setSelectedCohostGiftUserId] = useState<string | null>(null);
  const [cohostGiftScores, setCohostGiftScores] = useState<Record<string, number>>({});
  const [cohostLastGifts, setCohostLastGifts] = useState<Record<string, string>>({});
  const [opponentProfile, setOpponentProfile] = useState<{
    displayName: string; username: string; avatarUrl: string;
    followers: number; following: number; level: number; bio: string;
  } | null>(null);
  const [hostBattleProfile, setHostBattleProfile] = useState<{
    displayName: string; username: string; avatarUrl: string;
    followers: number; following: number; level: number; bio: string;
  } | null>(null);
  const opponentProfileFetchedRef = useRef('');
  const hostBattleProfileFetchedRef = useRef('');
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
      }).catch((err) => reportFailure('live_engagement_progress', err));
    }
    prevSpectatorBattleActiveRef.current = active;
  }, [spectatorBattle?.active, spectatorBattle?.status, effectiveStreamId]);

  const openBattleSidePanel = useCallback((side: 'host' | 'opponent') => {
    const uid =
      side === 'opponent'
        ? battleStreamIds?.opponentUserId
        : battleStreamIds?.hostUserId || hostUserIdRef.current || hostUserId || '';
    if (!uid) return;
    setBattleSidePanel(side);
    setShowOpponentPanel(true);
    const fetchedRef = side === 'opponent' ? opponentProfileFetchedRef : hostBattleProfileFetchedRef;
    if (fetchedRef.current === uid) return;
    fetchedRef.current = uid;
    (async () => {
      try {
        const { body, error } = await apiFetchProfileById(uid);
        if (error || !body) return;
        const p = (body?.profile || body?.data || {}) as Record<string, unknown>;
        const displayName =
          (typeof p.displayName === 'string' && p.displayName) ||
          (typeof p.username === 'string' && p.username) ||
          (side === 'opponent' ? spectatorBattle?.opponentName : hostName) ||
          (side === 'opponent' ? 'Opponent' : 'Creator');
        const username = typeof p.username === 'string' ? p.username : '';
        const avatarUrl = typeof p.avatarUrl === 'string' ? p.avatarUrl : '';
        const bio = typeof p.bio === 'string' ? p.bio : '';
        const profile = {
          displayName,
          username,
          avatarUrl,
          followers: Number(p.followersCount ?? p.followers ?? 0),
          following: Number(p.followingCount ?? p.following ?? 0),
          level: Number(p.level ?? 0),
          bio,
        };
        if (side === 'opponent') setOpponentProfile(profile);
        else setHostBattleProfile(profile);
      } catch {
        showToast('Could not load profile');
      }
    })();
  }, [
    battleStreamIds?.opponentUserId,
    battleStreamIds?.hostUserId,
    hostUserId,
    hostName,
    spectatorBattle?.opponentName,
  ]);

  const _openOpponentPanel = useCallback(() => {
    openBattleSidePanel('opponent');
  }, [openBattleSidePanel]);

  // Stay on the host stream during battle. Dual LiveKit already shows both
  // creators — navigating away mixes WS/LiveKit rooms and kills the live.

  // Tap vote → BATTLE SCORE only (server-scored). Every 3 taps = +5; unlimited.
  // Never creator revenue / wallet. Server is authoritative (handlers.ts).
  const handleSpectatorVote = useCallback((target: 'host' | 'opponent' | 'player3' | 'player4') => {
    if (!spectatorBattle?.active || spectatorBattle.status !== 'ACTIVE') return;
    if (!websocket.isConnected()) return;
    battleScreenTapCountRef.current += 1;
    setBattleScreenTapCount(battleScreenTapCountRef.current);
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12);
    } catch {
      /* ignore */
    }
    battleSpectatorVote({ target });
    if (target === 'host' || target === 'opponent') {
      openBattleSidePanel(target);
    }
  }, [spectatorBattle?.active, spectatorBattle?.status, openBattleSidePanel]);

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

  // Battle remaining seconds: server battle_tick / battle_state only (no local owner).
  // Display updates when WS delivers timeLeft — do not race a second setInterval.

  useEffect(() => {
    if (!spectatorBattle?.active) setHasOpponentStream(false);
  }, [spectatorBattle?.active]);

  // ═══════════════════════════════════════════════════
  // CO-HOST STATE (synced from host so spectators see same layout)
  // ═══════════════════════════════════════════════════
  type SpectatorCoHost = { id: string; userId: string; name: string; avatar: string; status: string };
  const [spectatorCoHosts, setSpectatorCoHosts] = useState<SpectatorCoHost[]>([]);
  const [cohostLayoutId, setCohostLayoutId] = useState<CohostLayoutId>(DEFAULT_COHOST_LAYOUT_ID);
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
    return findCoHostVideoElByIdentity(coHostVideoRefs.current, identity);
  }, []);

  const isSpeakingUser = useCallback(
    (userId?: string | null) => isSpeakingUserId(speakingIds, userId),
    [speakingIds],
  );

  const toggleFeaturedUser = useCallback((userId: string) => {
    toggleFeaturedUserId(setFeaturedUserId, userId);
  }, []);

  const markRemoteCam = useCallback((identity: string, off: boolean) => {
    markRemoteCamOff(setRemoteCamOff, identity, off);
  }, []);

  const [isCoHosting, setIsCoHosting] = useState(false);

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

  // Co-host publish is invite/accept only — URL alone is not enough.
  const cohostState = (location.state as Record<string, unknown>) || {};
  const isCoHostFromUrl =
    new URLSearchParams(location.search).get('cohost') === '1' &&
    cohostState.fromCohostInvite === true;

  // Separate useLiveCamera instance from host (only one live screen mounted).
  // Enabled only while this spectator is publishing as cohost; autoAcquire false
  // until session connect / explicit start (same pattern as host battle joiner).
  const liveCamera = useLiveCamera({
    enabled: Boolean(isCoHostFromUrl || isCoHosting),
    autoAcquire: false,
  });
  const {
    videoRef: myVideoRef,
    cameraStreamRef: coHostPublishStreamRef,
    cameraStream: coHostStream,
    setCameraStream: setCoHostStream,
    cameraFacing,
    isMicMuted,
    isCamOff,
    acquireCamera,
    stopCamera,
    flipCamera: flipCameraFacing,
    setIsMicMuted,
    setIsCamOff,
  } = liveCamera;

  const _startCoHosting = async () => {
    try {
      setIsCoHosting(true);
      setIsMicMuted(true);
      setIsCamOff(false);
      const stream = await acquireCamera();
      if (!stream) {
        setIsCoHosting(false);
        showToast('Camera access denied');
        return;
      }
      stream.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });

      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
        prepareLiveVideoEl(myVideoRef.current);
      }

      showToast('You are now co-hosting!');
      setMessages(prev => appendCapped(prev, {
        id: `cohost-${Date.now()}`,
        username: 'System',
        text: 'You joined as co-host',
        isSystem: true,
      }, LIVE_CHAT_MESSAGE_CAP));
    } catch {
      setIsCoHosting(false);
      stopCamera();
      showToast('Camera access denied');
    }
  };

  const stopCoHosting = useCallback(() => {
    stopCamera();
    if (coHostChanRef.current) {
      coHostChanRef.current = null;
    }
    setIsCoHosting(false);
    setIsMicMuted(true);
    setIsCamOff(false);
  }, [stopCamera, setIsMicMuted, setIsCamOff]);

  // Host removed this co-host from the table — leave publish mode.
  const wasCohostSeatedRef = useRef(false);

  /** Leave the co-host seat but keep watching this live (never /feed). */
  const exitCohostStayWatching = useCallback(() => {
    stopCoHosting();
    wasCohostSeatedRef.current = false;
    if (user?.id) {
      setSpectatorCoHosts((prev) => prev.filter((h) => !sameUserId(h.userId, user.id)));
      if (featuredUserId && sameUserId(featuredUserId, user.id)) {
        setFeaturedUserId(null);
      }
    }
    const params = new URLSearchParams(location.search);
    if (params.has('cohost')) {
      params.delete('cohost');
      navigate(
        {
          pathname: location.pathname,
          search: params.toString() ? `?${params.toString()}` : '',
        },
        { replace: true, state: {} },
      );
    }
    showToast('Left co-host');
  }, [
    stopCoHosting,
    user?.id,
    featuredUserId,
    location.pathname,
    location.search,
    navigate,
  ]);

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
    if (!isCoHosting) return;
    const nextMuted = !isMicMuted;
    void (async () => {
      await spectatorLifecycleRef.current.liveKit?.setMicEnabled(!nextMuted);
      setIsMicMuted(nextMuted);
    })();
  };

  const toggleCam = () => {
    if (!isCoHosting) return;
    const nextCamOff = !isCamOff;
    void (async () => {
      await spectatorLifecycleRef.current.liveKit?.setCamEnabled(!nextCamOff);
      setIsCamOff(nextCamOff);
    })();
  };

  // Attach co-host stream to my video ref (preview bind owned by useLiveCamera ref)
  useEffect(() => {
    if (isCoHosting && coHostStream && myVideoRef.current) {
      myVideoRef.current.srcObject = coHostStream;
      prepareLiveVideoEl(myVideoRef.current);
    }
  }, [isCoHosting, coHostStream, myVideoRef]);

  // Video ref for live stream (LiveKit)
  const videoRef = useRef<HTMLVideoElement>(null);
  const hostRemoteAudioRef = useRef<HTMLAudioElement>(null);
  /** Tap-to-like / floating hearts — rendered in chat panel (right side), not over video. */
  const spectatorStageRef = useRef<HTMLDivElement>(null);
  const spectatorChatHeartsRef = useRef<HTMLDivElement>(null);
  const [floatingHearts, setFloatingHearts] = useState<
    Array<{ id: string; x: number; y: number; dx: number; rot: number; size: number; color: string; username?: string; avatar?: string }>
  >([]);

  const spawnHeartAt = useCallback((x: number, y: number, colorOverride?: string, likerName?: string, likerAvatar?: string) => {
    const particle = createFloatingHeartParticle({
      x,
      y,
      colorOverride,
      username: likerName,
      avatar: likerAvatar,
    });
    setFloatingHearts((prev) => [...prev.slice(-40), particle]);
    window.setTimeout(() => {
      setFloatingHearts((prev) => prev.filter((h) => h.id !== particle.id));
    }, 500);
  }, []);

  const spawnHeartFromClient = useCallback((clientX: number, clientY: number, colorOverride?: string, likerName?: string, likerAvatar?: string) => {
    const layer = spectatorChatHeartsRef.current;
    if (!layer) return;
    const point = resolveHeartSpawnFromClient(layer, clientX, clientY, { clampInside: false });
    spawnHeartAt(
      point.x,
      point.y,
      point.inside ? colorOverride : (colorOverride ?? '#ffffff'),
      likerName,
      likerAvatar,
    );
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
  const liveConnectRetryAttemptsRef = useRef(0);
  const streamIsLiveRef = useRef(streamIsLive);
  streamIsLiveRef.current = streamIsLive;
  const effectiveStreamIdRef = useRef(effectiveStreamId);
  effectiveStreamIdRef.current = effectiveStreamId;
  const lkDisconnectRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spectatorSession = useSpectatorLiveSession({
    enabled: streamIsLive === true && !!effectiveStreamId && !!user?.id,
    roomId: effectiveStreamId,
    publish: isCoHostFromUrl,
    retryKey: liveConnectRetryKey,
    liveKitHandlersRef: spectatorLiveKitHandlersRef,
  });
  const spectatorLifecycleRef = spectatorSession.lifecycleRef;
  const liveKitRoomRef = spectatorSession.liveKitRoomRef;

  const getSpectatorThermalRoom = useCallback(() => liveKitRoomRef.current, [liveKitRoomRef]);
  const getSpectatorThermalCameraTrack = useCallback(
    () => coHostPublishStreamRef.current?.getVideoTracks()?.[0] ?? null,
    [coHostPublishStreamRef],
  );
  const getSpectatorThermalFacing = useCallback(() => cameraFacing, [cameraFacing]);
  const getSpectatorBattleRemoteCount = useCallback(() => {
    const b = spectatorBattleRef.current;
    if (!b?.active) return 0;
    let n = 0;
    if (b.opponentRoomId || b.opponentName) n += 1;
    if (b.player3UserId || b.player3Name) n += 1;
    if (b.player4UserId || b.player4Name) n += 1;
    return n;
  }, []);
  useLiveThermalQuality({
    enabled: streamIsLive === true && !!effectiveStreamId && !!user?.id,
    getRoom: getSpectatorThermalRoom,
    getCameraVideoTrack: getSpectatorThermalCameraTrack,
    getCameraFacing: getSpectatorThermalFacing,
    publishesCamera: isCoHosting,
    getBattleRemoteCount: getSpectatorBattleRemoteCount,
  });

  // Background → foreground: retry LiveKit when WS reconnects globally in App.tsx.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (streamIsLiveRef.current !== true || !effectiveStreamIdRef.current) return;
      if (!spectatorSession.connected && !spectatorSession.joinError) {
        setLiveConnectRetryKey((k) => k + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [spectatorSession.connected, spectatorSession.joinError]);

  // Attach featured co-host / host-small tracks when big-screen switch changes.
  useEffect(() => {
    const room = liveKitRoomRef.current;
    if (!room) return;
    const hostId = hostUserIdRef.current || hostUserId || effectiveStreamId;

    if (featuredUserId && featuredBigVideoRef.current) {
      attachRemoteParticipantVideoByIds(
        room,
        featuredBigVideoRef.current,
        featuredUserId,
      );
    }

    if (featuredUserId && hostSmallVideoRef.current && hostId) {
      attachRemoteParticipantVideoByIds(
        room,
        hostSmallVideoRef.current,
        hostId,
        effectiveStreamId,
      );
    }
  }, [featuredUserId, hostUserId, effectiveStreamId, spectatorCoHosts, liveKitRoomRef]);

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
  // Product-required engagement watch tick — single owner for watch_minutes POST + local UI.
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
      }).catch((err) => reportFailure('live_engagement_progress', err));
      void apiLiveEngagementProgress({
        metric: 'unique_creators',
        delta: 1,
        roomId: effectiveStreamId,
      }).catch((err) => reportFailure('live_engagement_progress', err));
    }
    const roomId = effectiveStreamId;
    return startLiveEngagementWatchTick({
      roomId,
      missionWatchGoal,
      setMissionWatchMin,
    });
  }, [effectiveStreamId, hasStream, missionWatchGoal]);

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
        const streamRows = (Array.isArray(streams) ? streams : []) as Array<{
          stream_key?: string;
          room_id?: string;
          viewer_count?: number;
          user_id?: string;
          title?: string;
        }>;
        const stream =
          !streamsErr
            ? streamRows.find((s) => s.stream_key === effectiveStreamId) ||
              streamRows.find((s) => s.room_id === effectiveStreamId)
            : undefined;

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

        // List miss or list-fetch error — token issuance is the join owner.
        const { creds, error: tokenErr } = await apiLiveToken(effectiveStreamId, false);
        if (cancelled) return;
        if (tokenErr || !creds?.token) {
          setStreamIsLive(false);
          const transient =
            String(tokenErr || '').includes('503') ||
            String(tokenErr || '').toLowerCase().includes('database_unavailable') ||
            String(tokenErr || '').toLowerCase().includes('failed to fetch');
          showToast(transient ? 'Could not connect to stream' : 'Stream is offline');
          return;
        }
        setStreamIsLive(true);
        // Authoritative count arrives on WS connect (viewer_count / connected).
        syncMvpSlotsRef.current();
        await applyHostMeta(effectiveStreamId);
      } catch {
        if (!cancelled) {
          setStreamIsLive(false);
          showToast('Could not connect to stream');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveStreamId, navigate, streamRetryKey]);

  // Track attach handlers for useSpectatorLiveSession (connect owner). No parallel Room().
  // coHostPublishStreamRef is cameraStreamRef from useLiveCamera (shared publish owner).

  /** Turn camera around while co-hosting — facing flip + reacquire via useLiveCamera. */
  const flipCamera = useCallback(() => {
    if (!isCoHosting) return;
    flipCameraFacing();
  }, [isCoHosting, flipCameraFacing]);

  // After a facing flip (skip the facing value present when cohost started), reacquire + republish.
  const cohostFacingBootRef = useRef(true);
  useEffect(() => {
    if (!isCoHosting) {
      cohostFacingBootRef.current = true;
      return;
    }
    if (cohostFacingBootRef.current) {
      cohostFacingBootRef.current = false;
      return;
    }
    let cancelled = false;
    const lifecycle = spectatorLifecycleRef.current;
    (async () => {
      try {
        const stream = await acquireCamera();
        if (cancelled || !stream) {
          if (!cancelled) showToast('Could not switch camera');
          return;
        }
        if (myVideoRef.current) {
          myVideoRef.current.srcObject = stream;
          prepareLiveVideoEl(myVideoRef.current);
        }
        await lifecycle.publishFromStream(stream);
        await lifecycle.liveKit?.setCamEnabled(!isCamOff);
        await lifecycle.liveKit?.setMicEnabled(!isMicMuted);
      } catch {
        if (!cancelled) showToast('Could not switch camera');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cameraFacing, isCoHosting, acquireCamera, isCamOff, isMicMuted, myVideoRef, spectatorLifecycleRef]);

  const mainVideoAttachedRef = useRef(false);
  {
    const hostId = () => hostUserIdRef.current || effectiveStreamId;
    const isHostIdentity = (identity: string) =>
      sameUserId(identity, hostId()) || sameUserId(identity, effectiveStreamId);
    const attachHostVideo = (track: import('livekit-client').RemoteTrack) => {
      if (!videoRef.current) return;
      if (mainProvisionalTrackRef.current && mainProvisionalTrackRef.current !== track) {
        try { mainProvisionalTrackRef.current.detach(videoRef.current); } catch { /* already stopped */ }
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
        try { track.detach(videoRef.current); } catch { /* already stopped */ }
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
          if (isHostIdentity(identity) && hostRemoteAudioRef.current) {
            track.attach(hostRemoteAudioRef.current);
          }
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
      onDisconnected: () => {
        if (!streamIsLiveRef.current || !effectiveStreamIdRef.current) return;
        if (lkDisconnectRetryRef.current) clearTimeout(lkDisconnectRetryRef.current);
        // Prefer LiveKit SDK reconnect; only rebuild Room with exponential backoff.
        const attempt = liveConnectRetryAttemptsRef.current;
        if (attempt >= 5) return;
        const delayMs = Math.min(30_000, 2_000 * Math.pow(2, attempt));
        lkDisconnectRetryRef.current = setTimeout(() => {
          lkDisconnectRetryRef.current = null;
          if (streamIsLiveRef.current && effectiveStreamIdRef.current) {
            liveConnectRetryAttemptsRef.current = attempt + 1;
            setLiveConnectRetryKey((k) => k + 1);
          }
        }, delayMs);
      },
      onReconnected: () => {
        liveConnectRetryAttemptsRef.current = 0;
        if (lkDisconnectRetryRef.current) {
          clearTimeout(lkDisconnectRetryRef.current);
          lkDisconnectRetryRef.current = null;
        }
      },
      onConnected: () => {
        liveConnectRetryAttemptsRef.current = 0;
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
        if (publication.track && publication.isSubscribed && isHostIdentity(identity) && hostRemoteAudioRef.current) {
          publication.track.attach(hostRemoteAudioRef.current);
        }
      }
    }
  }, [spectatorSession.connected, effectiveStreamId, liveKitRoomRef]);

  useEffect(() => {
    if (!spectatorSession.connected || !isCoHostFromUrl) return;
    let mounted = true;
    const lifecycle = spectatorLifecycleRef.current;
    // Flip layout to split immediately; camera publish can finish after.
    setIsCoHosting(true);
    setIsMicMuted(true);
    setIsCamOff(false);
    (async () => {
      try {
        const stream = await acquireCamera();
        if (!mounted) return;
        if (!stream) {
          setIsCoHosting(false);
          showToast('Could not start camera. Host will not see your video.');
          return;
        }
        await lifecycle.publishFromStream(stream);
        await lifecycle.liveKit?.setMicEnabled(false);
        if (myVideoRef.current) {
          myVideoRef.current.srcObject = stream;
          prepareLiveVideoEl(myVideoRef.current);
        }
        showToast('You are co-hosting. Unmute to speak.');
      } catch (e) {
        console.warn('[LiveKit] Co-host publish failed:', e);
        if (mounted) {
          setIsCoHosting(false);
          stopCamera();
        }
        showToast('Could not start camera. Host will not see your video.');
      }
    })();
    return () => {
      mounted = false;
      // Camera stop is owned by useLiveCamera when enabled becomes false.
    };
  }, [
    spectatorSession.connected,
    isCoHostFromUrl,
    spectatorLifecycleRef,
    acquireCamera,
    stopCamera,
    setIsMicMuted,
    setIsCamOff,
    myVideoRef,
  ]);

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
  }, [selectedSpectatorUserId, hasStream, effectiveStreamId, liveKitRoomRef]);

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
  }, [spectatorBattle?.active, effectiveStreamId, markRemoteCam, liveKitRoomRef]);

  // Battle: route each creator's host-room LiveKit track to the correct tile.
  useEffect(() => {
    const room = liveKitRoomRef.current;
    if (!room || !spectatorBattle?.active) {
      setHasPlayer3Stream(false);
      setHasPlayer4Stream(false);
      return;
    }

    const attachForUser = (
      userId: string | undefined,
      el: HTMLVideoElement | null,
      onAttached: (attached: boolean) => void,
    ) => {
      if (!userId || !el) {
        onAttached(false);
        return;
      }
      for (const [, p] of room.remoteParticipants) {
        const identity = p.identity || '';
        if (!sameUserId(identity, userId)) continue;
        for (const [, pub] of p.videoTrackPublications) {
          if (pub.track && pub.isSubscribed) {
            pub.track.attach(el);
            prepareLiveVideoEl(el);
            void el.play().catch(() => {});
            onAttached(true);
            return;
          }
        }
      }
      onAttached(false);
    };

    const tryAttachAll = () => {
      attachForUser(
        battleStreamIds?.hostUserId || hostUserIdRef.current || hostUserId || effectiveStreamId,
        videoRef.current,
        (attached) => { if (attached) setHasStream(true); },
      );
      attachForUser(
        battleStreamIds?.opponentUserId,
        opponentVideoRef.current,
        setHasOpponentStream,
      );
      attachForUser(
        battleStreamIds?.player3UserId || spectatorBattle.player3UserId,
        player3VideoRef.current,
        setHasPlayer3Stream,
      );
      attachForUser(
        battleStreamIds?.player4UserId || spectatorBattle.player4UserId,
        player4VideoRef.current,
        setHasPlayer4Stream,
      );
      applyRemoteVideoBudget(room, {
        battleRemoteCount: getSpectatorBattleRemoteCount(),
      });
    };

    tryAttachAll();
    const onSub = (
      track: import('livekit-client').RemoteTrack,
    ) => {
      if (track.kind === 'video') tryAttachAll();
    };
    room.on(RoomEvent.TrackSubscribed, onSub);
    room.on(RoomEvent.ParticipantConnected, tryAttachAll);
    return () => {
      room.off(RoomEvent.TrackSubscribed, onSub);
      room.off(RoomEvent.ParticipantConnected, tryAttachAll);
    };
  }, [
    battleStreamIds?.hostUserId,
    battleStreamIds?.opponentUserId,
    battleStreamIds?.player3UserId,
    battleStreamIds?.player4UserId,
    spectatorBattle?.active,
    spectatorBattle?.player3UserId,
    spectatorBattle?.player4UserId,
    hasStream,
    effectiveStreamId,
    hostUserId,
    liveKitRoomRef,
    getSpectatorBattleRemoteCount,
  ]);

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

    void loadLiveGiftWalletBootstrap(walletCoinBalanceRef).then((boot) => {
      if (cancelled) return;
      if (!boot) {
        setTestCoinBalance(getPersistedTestCoinsBalance(user.id));
        showToast('Could not load wallet balance');
        return;
      }
      setTestCoinBalance(getPersistedTestCoinsBalance(user.id));
      applyLiveWalletBootstrapUi({
        boot,
        userLevel: user.level,
        extraLevelFloor: shouldUseTestCoinsForGifts(user.id) ? getTestLevel(user.id) : 0,
        setGiftSource,
        setUserLevel,
        setUserXP,
        updateUserLevel: (level) => updateUser({ level }),
      });
    });
    return () => { cancelled = true; };
  }, [user?.id, user?.level, updateUser]);

  useEffect(() => {
    if (showTestCoinsModal && testCoinsStep === 'password') {
      setTimeout(() => testCoinsPwdRef.current?.focus(), 100);
    }
  }, [showTestCoinsModal, testCoinsStep]);

  const openTestCoinsModal = useCallback(() => {
    if (!user?.id) {
      showToast('Sign in required');
      setIsMoreMenuOpen(false);
      return;
    }
    setShowTestCoinsModal(true);
    setTestCoinsStep('password');
    setTestCoinsPwd('');
    setTestCoinsError('');
    setTestCoinsAmount('');
    setIsMoreMenuOpen(false);
  }, [user?.id]);

  const closeTestCoinsModal = useCallback(() => {
    setShowTestCoinsModal(false);
    setTestCoinsPwd('');
  }, []);

  const selectTestCoinsPreset = useCallback((amt: number) => {
    setTestCoinsAmount(String(amt));
    setTestCoinsError('');
  }, []);

  const addMaxTestCoinsAtOnce = useCallback(async () => {
    if (!user?.id || !testCoinsPwd) {
      setTestCoinsError('Password required');
      return;
    }
    setTestCoinsBusy(true);
    try {
      const result = await mintTestCoinsViaServer(user?.id, testCoinsPwd, 100000000);
      if (result.ok === false) {
        setTestCoinsError(result.error === 'FORBIDDEN' ? 'Wrong password' : result.error);
        return;
      }
      setTestCoinBalance(result.balance);
      showToast(`+${result.minted.toLocaleString()} test added`);
      setShowTestCoinsModal(false);
      setTestCoinsPwd('');
    } finally {
      setTestCoinsBusy(false);
    }
  }, [user?.id, testCoinsPwd]);

  const submitTestCoinsAmount = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      setTestCoinsError('Sign in required');
      return;
    }
    const amount = parseInt(testCoinsAmount, 10);
    if (!amount || amount <= 0) {
      setTestCoinsError('Enter a valid amount');
      return;
    }
    if (amount > 100000000) {
      setTestCoinsError('Max 100,000,000 per top-up');
      return;
    }
    if (!testCoinsPwd) {
      setTestCoinsStep('password');
      setTestCoinsError('Enter password again');
      return;
    }
    setTestCoinsBusy(true);
    try {
      const result = await mintTestCoinsViaServer(user?.id, testCoinsPwd, amount);
      if (result.ok === false) {
        setTestCoinsError(result.error === 'FORBIDDEN' ? 'Wrong password' : result.error);
        if (result.status === 403) setTestCoinsStep('password');
        return;
      }
      setTestCoinBalance(result.balance);
      showToast(`+${result.minted.toLocaleString()} test added`);
      setShowTestCoinsModal(false);
      setTestCoinsPwd('');
    } finally {
      setTestCoinsBusy(false);
    }
  }, [testCoinsAmount, testCoinsPwd, user?.id]);

  const submitTestCoinsPasswordUnlock = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      setTestCoinsError('Sign in required');
      setTestCoinsPwd('');
      return;
    }
    if (!testCoinsPwd.trim()) {
      setTestCoinsError('Enter password');
      return;
    }
    setTestCoinsBusy(true);
    try {
      const result = await authorizeTestCoinIssue(testCoinsPwd);
      if (result.ok === false) {
        setTestCoinsError(result.error === 'FORBIDDEN' ? 'Wrong password' : result.error);
        setTestCoinsPwd('');
        return;
      }
      setTestCoinsError('');
      setTestCoinsStep('amount');
    } finally {
      setTestCoinsBusy(false);
    }
  }, [testCoinsPwd, user?.id]);

  useEffect(() => {
    if (!showGiftPanel || !user?.id) return;
    setTestCoinBalance(getPersistedTestCoinsBalance(user.id));
    refreshLiveGiftPanelBalances({ walletCoinBalanceRef });
  }, [showGiftPanel, user?.id]);

  // Reset gift txn dedupe when switching to a different live room.
  useEffect(() => {
    seenGiftTxnRef.current.clear();
    playedGiftVideoTxnRef.current.clear();
    setCurrentGift(null);
    setGiftQueue([]);
  }, [effectiveStreamId, seenGiftTxnRef, playedGiftVideoTxnRef, setCurrentGift, setGiftQueue]);

  // WebSocket: spectators join the creator's live room (same room id = effectiveStreamId) for real-time chat, gifts, join/leave
  useEffect(() => {
    if (!effectiveStreamId || !user?.id) return;

    let mounted = true;

    const connect = async () => {
      const token = useAuthStore.getState().session?.access_token || '';
      if (!token || !mounted) return;
      const audienceCreatorId = String(
        battleAudienceCreatorIdRef.current ||
          hostUserIdRef.current ||
          hostUserId ||
          '',
      ).trim();
      // Persistent reconnect: brief mobile blips must not synthesize stream_ended
      // ("The host has ended the stream") for this spectator only.
      websocket.connect(effectiveStreamId, token, {
        persistent: true,
        ...(audienceCreatorId ? { audienceCreatorId } : {}),
      });
    };

    let hostFoundInRoom = false;

    const handleRoomState = (data) => {
      if (!mounted) return;
      const viewers = data.viewers;
      const hid = hostUserIdRef.current;
      if (Array.isArray(viewers)) {
        actualViewersRef.current.clear();
        // Do not clear joinAnnouncedRef — one banner per user for the whole live.
        // Host is often omitted from the WS viewers list. Never wipe a prior
        // "host found" (or live video) just because another spectator joined
        // and we got a fresh room snapshot without the host id.
        let foundHostInList = false;
        for (const v of viewers) {
          if (v.user_id === hid || v.user_id === effectiveStreamId || v.is_host) {
            foundHostInList = true;
          } else if (v.user_id && v.user_id !== user?.id) {
            actualViewersRef.current.set(v.user_id, {
              name: v.display_name || v.username || 'User',
              avatar: v.avatar_url || '',
              level: v.level || 1,
            });
            joinAnnouncedRef.current.add(String(v.user_id));
          }
        }
        if (foundHostInList || hasStreamRef.current || !hid) {
          hostFoundInRoom = true;
        }
        // Viewer count: server-authoritative viewer_count only.
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
      if (!uid) return;
      const alreadyAnnounced = joinAnnouncedRef.current.has(uid);
      actualViewersRef.current.set(uid, {
        name: data.display_name || data.username || 'User',
        avatar: data.avatar_url || '',
        level: initialLevel,
      });
      if (alreadyAnnounced) {
        syncMvpSlots();
        return;
      }
      joinAnnouncedRef.current.add(uid);
      const joinName = data.username || 'User';
      const joinMsgId = `join-${uid}`;
      appendLiveJoinStreamBanner({
        setMessages,
        joinMsgId,
        joinName,
        initialLevel,
        avatar: typeof data.avatar_url === 'string' ? data.avatar_url : '',
      });
      maybeFixJoinBannerLevelFromProfile({
        userId: uid,
        joinMsgId,
        initialLevel,
        setMessages,
        isMounted: () => mounted,
        onLevelFixed: (fixed) => {
          const cached = actualViewersRef.current.get(uid);
          if (cached) actualViewersRef.current.set(uid, { ...cached, level: fixed });
          syncMvpSlotsRef.current();
        },
      });
      // The join banner is ephemeral: it appears only when someone joins, then
      // clears itself so it never stays permanently in the chat feed.
      scheduleLiveJoinBannerClear(setMessages, joinMsgId, 5000);
      // Viewer count: server viewer_count event — not local +/-.
      syncMvpSlots();
    };

    const handleUserLeft = (data) => {
      if (!mounted) return;
      if (data.user_id) {
        actualViewersRef.current.delete(data.user_id);
        // Keep announced — leave/rejoin must not show join banner again this live.
      }
      // Viewer count: server viewer_count event — not local +/-.
      syncMvpSlots();
    };

    const handleChatMessage = (data) => {
      if (!mounted) return;
      if (data.user_id === user?.id) return;
      const text = typeof data.text === 'string' ? data.text : '';
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
      const msg = buildLiveWsChatMessage({
        username,
        avatar,
        text,
        dataLevel: data.level,
        cachedLevel: cached?.level,
        stickerUrl: data.stickerUrl,
      });
      setMessages(prev => appendCapped(prev, msg, LIVE_CHAT_MESSAGE_CAP));
    };

    const handleGiftSent = (data) => {
      if (!mounted) return;
      const opened = openLiveGiftSentHandler(data, giftsCatalogRef.current, {
        hasSeenGiftTxn,
        hasPlayedGiftVideoTxn,
        markGiftTxnSeen,
      });
      if (opened.skip === true) return;
      const { alreadySeen, parsed } = opened;
      const {
        txnId,
        gifterId,
        giftCoins,
        giftName,
        username,
        avatar,
        level,
        cohostTarget,
        giftIconRaw,
        battleTarget,
        isFlowerOrRose,
      } = parsed;

      // Chat / MVP / co-host tile scores only on first delivery of this transaction.
      if (!alreadySeen) {
        if (cohostTarget && giftCoins > 0) {
          applyCohostGiftTileScore({
            targetUserId: cohostTarget,
            coins: giftCoins,
            giftIcon: giftIconRaw,
            resolveGiftAssetUrl,
            setCohostGiftScores,
            setCohostLastGifts,
          });
        }

        // Skip echo chat/MVP for our own gift — sender already queued locally.
        if (!(gifterId && user?.id && gifterId === user.id)) {
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
              const side = normalizeBattleGiftTarget(battleTarget);
              if (side === 'host') {
                mvpGiftScoresHostRef.current[gifterId] = (mvpGiftScoresHostRef.current[gifterId] || 0) + giftCoins;
              } else if (side === 'opponent') {
                mvpGiftScoresOpponentRef.current[gifterId] = (mvpGiftScoresOpponentRef.current[gifterId] || 0) + giftCoins;
              }
            }
            syncMvpSlots();
          }
          const msg = buildLiveGiftChatMessage({
            txnId,
            giftName,
            username,
            avatar,
            level,
          });
          setMessages(prev => appendCapped(prev, msg, LIVE_CHAT_MESSAGE_CAP));
          if (spectatorBattleRef.current?.active && isFlowerOrRose) {
            roseCountRef.current += 1;
            setRoseCount(roseCountRef.current);
          }
          if (spectatorBattleRef.current?.active) {
            const iconUrl = resolveBattleGiftIconUrl(giftIconRaw, resolveGiftAssetUrl);
            const giftSlot = resolveServerBattleGiftTarget(battleTarget);
            if (iconUrl && giftSlot) {
              setLastGifts((prev) => appendBattleTileGiftForTarget(prev, giftSlot, iconUrl));
            }
            const side = normalizeBattleGiftTarget(battleTarget);
            if (iconUrl && side === 'opponent') {
              setLastOpponentGift((prev) => {
                const next = [...prev, iconUrl];
                return next.length > BATTLE_TILE_GIFT_STACK_CAP
                  ? next.slice(-BATTLE_TILE_GIFT_STACK_CAP)
                  : next;
              });
            }
            if (iconUrl && side === 'host') {
              setLastHostGift((prev) => {
                const next = [...prev, iconUrl];
                return next.length > BATTLE_TILE_GIFT_STACK_CAP
                  ? next.slice(-BATTLE_TILE_GIFT_STACK_CAP)
                  : next;
              });
            }
          }
        }
      }

      // Play gift video for other users' gifts (sender already queued locally).
      if (gifterId && user?.id && gifterId === user.id) return;

      const giftSlot = spectatorBattleRef.current?.active
        ? resolveServerBattleGiftTarget(battleTarget)
        : null;
      // Battle: full video only for the target creator's audience. Others keep
      // the same gift event as a small tile icon (lastGifts) — never fullscreen.
      if (
        spectatorBattleRef.current?.active &&
        !shouldPlayFullBattleGiftVideo(giftSlot, battleAudienceSlotRef.current)
      ) {
        return;
      }

      enqueueFromGiftSent({
        data,
        catalogRef: giftsCatalogRef,
        setGiftsCatalog,
        battleSide: giftSlot ? normalizeBattleGiftTarget(giftSlot) : null,
        txnId,
        trackPlayedVideo: true,
        mounted: () => mounted,
      });
    };

    const handleStreamEnded = (data?: Record<string, unknown>) => {

      if (!mounted) return;
      // Ignore end events for other rooms (feed broadcasts / stale listeners).
      const endedKey =
        data && typeof data.stream_key === 'string' ? data.stream_key.trim() : '';
      if (endedKey && endedKey !== effectiveStreamId) return;
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
          const audienceCreatorId = String(
            hostUserIdRef.current || hostUserId || effectiveStreamId || '',
          ).trim();
          if (audienceCreatorId) {
            battleAudienceCreatorIdRef.current = audienceCreatorId;
          }
          navigate(`/watch/${battleRoom}`, {
            replace: true,
            state: { battleAudienceCreatorId: audienceCreatorId },
          });
          return;
        }
        // Same room is the battle room — stay; do not show "Stream ended".
        return;
      }
      if (reason === 'host_joined_battle') {
        return;
      }
      // Host WS grace races during battle / cohost must not kick spectators while
      // LiveKit is still connected to this room (host or co-host tracks may blip).
      const inBattle = !!spectatorBattleRef.current?.active;
      if (inBattle) return;
      if (reason === 'host_disconnected') {
        const lkRoom = liveKitRoomRef.current;
        if (lkRoom?.state === ConnectionState.Connected) return;
        if (hasStreamRef.current) return;
      }
      setStreamEndedReceived(true);
      setStreamIsLive(false);
      websocket.disconnect();
      clearMessagesForStream(effectiveStreamId);
      setTimeout(() => { if (mounted) navigate('/feed', { replace: true }); }, 2000);
    };

    const handleBattleStateSync = (data) => {
      if (!mounted) return;
      const toTime = (value: unknown, fallback = 0) => {
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
        setBattleStreamIds(battleStreamIdsFromPayload(data));
      }
      if (inBattleLayout) {
        const labels = battleTeamLabelsFromPayload(data);
        const status: 'WAITING' | 'ACTIVE' =
          rawStatus === 'WAITING' ? 'WAITING' : 'ACTIVE';
        const prevBattle = spectatorBattleRef.current;
        if (!prevBattle?.active || prevBattle.status === 'ENDED') {
          resetSpectatorSpeed();
        }
        battleStreakCountedForEndRef.current = false;
        const scoreResult = applyScores(data);
        setSpectatorBattle((prev) => ({
          active: true,
          status,
          hostScore: scoreResult.totals.h,
          opponentScore: scoreResult.totals.o,
          player3Score: scoreResult.totals.p3,
          player4Score: scoreResult.totals.p4,
          timeLeft: toTime(data.timeLeft, status === 'WAITING' ? 300 : (prev?.timeLeft ?? 300)),
          opponentName: data.opponentName || data.opponent_name || prev?.opponentName,
          opponentRoomId: data.opponentRoomId || prev?.opponentRoomId,
          player3Name: data.player3Name || prev?.player3Name,
          player4Name: data.player4Name || prev?.player4Name,
          player3UserId: data.player3UserId || prev?.player3UserId,
          player4UserId: data.player4UserId || prev?.player4UserId,
          redTeamLabel: labels.red || prev?.redTeamLabel || '',
          blueTeamLabel: labels.blue || prev?.blueTeamLabel || '',
          winner: undefined,
        }));
      } else if (rawStatus === 'ENDED') {
        // Keep active so WIN/LOSS overlay can show until the brief end banner clears.
        setSpectatorBattle((prev) =>
          prev ? { ...prev, active: true, status: 'ENDED' } : null,
        );
        resetSpectatorSpeed();
        setTimeout(() => {
          setSpectatorBattle(null);
          resetScores();
          setLastGifts(EMPTY_BATTLE_TILE_GIFTS);
          setLastHostGift([]);
          setLastOpponentGift([]);
        }, 2500);
      }
    };

    const handleBattleScore = (data) => {
      if (!mounted) return;
      setBattleStreamIds(prev => {
        if (!prev) return prev;
        const newHostUid = typeof data.hostUserId === 'string' && data.hostUserId ? data.hostUserId : prev.hostUserId;
        const newOppUid = typeof data.opponentUserId === 'string' && data.opponentUserId ? data.opponentUserId : prev.opponentUserId;
        if (newHostUid === prev.hostUserId && newOppUid === prev.opponentUserId) return prev;
        return { ...prev, hostUserId: newHostUid, opponentUserId: newOppUid };
      });
      const labels = battleTeamLabelsFromPayload(data);
      const result = applyScores(data);
      applyBattleScoreLeadFeedback(result, { triggerBattleVfx, pushBattleTaunt });

      setSpectatorBattle(prevState => {
        const newOppName = (typeof data.opponentName === 'string' && data.opponentName) || prevState?.opponentName;
        const newOppRoom = (typeof data.opponentRoomId === 'string' && data.opponentRoomId) || prevState?.opponentRoomId;
        if (
          prevState?.active &&
          !result.changed &&
          newOppName === prevState.opponentName &&
          newOppRoom === prevState.opponentRoomId &&
          labels.red === prevState.redTeamLabel &&
          labels.blue === prevState.blueTeamLabel
        ) {
          return prevState;
        }
        return {
          active: true,
          status: 'ACTIVE' as const,
          timeLeft: prevState?.timeLeft ?? 300,
          hostScore: result.totals.h,
          opponentScore: result.totals.o,
          player3Score: result.totals.p3,
          player4Score: result.totals.p4,
          opponentName: newOppName,
          opponentRoomId: newOppRoom,
          player3Name: (typeof data.player3Name === 'string' && data.player3Name) || prevState?.player3Name,
          player4Name: (typeof data.player4Name === 'string' && data.player4Name) || prevState?.player4Name,
          player3UserId: (typeof data.player3UserId === 'string' && data.player3UserId) || prevState?.player3UserId,
          player4UserId: (typeof data.player4UserId === 'string' && data.player4UserId) || prevState?.player4UserId,
          winner: prevState?.winner,
          redTeamLabel: labels.red || prevState?.redTeamLabel || '',
          blueTeamLabel: labels.blue || prevState?.blueTeamLabel || '',
        };
      });
    };

    const handleBattleEnded = (data) => {
      if (!mounted) return;
      setBattleStreamIds(null);
      const result = applyScores(data);
      const winner = resolveServerBattleWinner(data?.winner, battleServerTotalsRef.current);
      applyBattleWinTauntFeedback(winner, pushBattleTaunt);
      if (!battleStreakCountedForEndRef.current) {
        battleStreakCountedForEndRef.current = true;
        setBattleWinStreak((prev) => applyBattleWinStreak(prev, winner));
      }
      const labels = battleTeamLabelsFromPayload(data);
      setSpectatorBattle((prevState) => {
        if (!prevState) return null;
        return {
          ...prevState,
          // Keep active so WIN/LOSS + streak overlay stays visible for the end banner.
          active: true,
          status: 'ENDED',
          hostScore: result.totals.h,
          opponentScore: result.totals.o,
          player3Score: result.totals.p3,
          player4Score: result.totals.p4,
          winner,
          redTeamLabel: labels.red || prevState.redTeamLabel || '',
          blueTeamLabel: labels.blue || prevState.blueTeamLabel || '',
        };
      });
      resetSpectatorSpeed();
      // Return spectators to normal live layout after a short end banner.
      setTimeout(() => {
        setSpectatorBattle(null);
        resetScores();
        setLastGifts(EMPTY_BATTLE_TILE_GIFTS);
        setLastHostGift([]);
        setLastOpponentGift([]);
      }, 2500);
    };

    const handleHeartSent = (data) => {
      if (!mounted) return;
      if (typeof data.live_likes === 'number' && Number.isFinite(data.live_likes)) {
        // Authoritative room total — every spectator converges to the same number.
        setActiveLikes((prev) => Math.max(prev, Math.max(0, data.live_likes)));
      } else if (data.user_id !== user?.id) {
        setActiveLikes((prev) => prev + 1);
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
      } else if (data.featuredUserId === null || data.featuredUserId === undefined) {
        // Host is the sole layout owner — null/omitted clears featured.
        // Always apply so a prior local-only toggle cannot stick.
        setFeaturedUserId(null);
      }
      const layoutParsed = parseCohostLayoutId(data.layoutId);
      if (layoutParsed) setCohostLayoutId(layoutParsed);
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
      applyLiveGiftGoalSync(data, setGiftGoal);
    };

    const handleViewerCount = (data: unknown) => {
      if (!mounted) return;
      applyServerViewerCount(data, setViewerCount);
    };

    const onConnected = (data?: unknown) => {
      handleViewerCount(data);
      // Full session resync after WS reconnect (battle, co-host layout, viewer count).
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
      onViewerCount: handleViewerCount,
      onConnected,
    });
    const {
      onBoosterActivated: handleBoosterActivated,
      onBoosterCaught: handleBoosterCaught,
      onMistActivated: handleMistActivated,
    } = createBattleBoosterMistHandlers({
      setBoosterActivations,
      setBoosterCatches,
      setMistFog,
      selfUserId: user?.id,
      onSelfBoosterActivated: ({ multiplier, expiresAt }) => {
        setActiveBooster({ multiplier, expiresAt });
      },
    });

    // Server-authoritative battle clock (processBattleTick → battle_tick, ~1 Hz).
    // Sole time owner — no local setInterval race. Scores still arrive via battle_score.
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
      // Never eject while the same-room WS or LiveKit session is recovering.
      if (
        websocket.getCurrentRoomId() === effectiveStreamId &&
        (websocket.isConnected() || websocket.isReconnecting())
      ) {
        return;
      }
      const lkReconnecting = liveKitRoomRef.current;
      if (lkReconnecting?.state === ConnectionState.Reconnecting) return;
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
        const streamRows = (Array.isArray(streams) ? streams : []) as Array<{
          stream_key?: string;
          room_id?: string;
        }>;
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
      if (
        websocket.getCurrentRoomId() === effectiveStreamId &&
        (websocket.isConnected() || websocket.isReconnecting())
      ) {
        return;
      }
      // Host is often not listed in WS viewers — do NOT force hostFoundInRoom=false
      // from roomUsers alone (that falsely ends watch when another spectator joins).
      if (!hostFoundInRoom) goOffline('host_not_found_after_connect_timeout');
    }, 45000);

    const videoTimeout = setTimeout(() => {
      if (!mounted || hasStreamRef.current) return;
      if (
        websocket.getCurrentRoomId() === effectiveStreamId &&
        (websocket.isConnected() || websocket.isReconnecting())
      ) {
        return;
      }
      const lkRoom = liveKitRoomRef.current;
      if (
        lkRoom?.state === ConnectionState.Connected ||
        lkRoom?.state === ConnectionState.Reconnecting
      ) {
        return;
      }
      const vid = videoRef.current;
      const hasTrack = vid?.srcObject && (vid.srcObject as MediaStream).getVideoTracks().length > 0;
      if (!hasTrack && !hostFoundInRoom) goOffline('no_video_track_and_host_not_found_after_video_timeout');
    }, 60000);

    return () => {
      mounted = false;
      clearTimeout(connectTimeout);
      clearTimeout(videoTimeout);
      unbindRoomWs();
      unbindBattleWs();
      unbindBattleInviteWs();
      unbindCohostWs();
      // Do NOT clear joinAnnouncedRef — reconnect must not reset join dedupe or viewer state.
      // Do NOT websocket.disconnect() here — battle/MVP callback identity churn was
      // tearing down the host room and making the live look "closed". Leave only
      // disconnects the intentional leave / stream_ended paths.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStreamId, user?.id]);

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

  useMistFogAutoExpire(mistFog, setMistFog);

  // Fog hides the battle score for everyone except the creator being supported.
  const mistHidesMyScore = computeMistHidesScoresForViewer(mistFog, user?.id);

  // Share panel contacts: all platform users (same list as live share / ShareModal).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { contacts, liveUserIds } = await loadSharePanelContactsWithLive(
          user?.id,
          'spectator_share_live_streams',
        );
        const mapped = contacts.map((r) => ({
          id: r.user_id,
          name: r.username,
          avatar: r.avatar_url || '',
        }));
        if (cancelled) return;
        setShareContacts(mapped);
        if (liveUserIds) setShareLiveUserIds(liveUserIds);
      } catch (e) {
        if (!cancelled) {
          reportFailure('spectator_share_contacts', e);
          showToast('Could not load share contacts');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, showSharePanel]);

  // Gift queue processor owned by useLiveGiftPlaybackQueue.

  useEffect(() => {
    if (!user?.id || !hostUserId) {
      // Still try stream id when host meta lags behind join.
      return;
    }
    if (hostUserId === user.id) {
      setIsFollowing(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { following: ids, error: followingErr } = await apiFetchFollowingIds(user.id);
        if (cancelled) return;
        if (followingErr) {
          showToast(followingErr || 'Could not load follow status');
          return;
        }
        const hid = String(hostUserId);
        if (!cancelled) setIsFollowing(ids.some((id) => String(id) === hid));
      } catch {
        if (!cancelled) {
          setIsFollowing(false);
          showToast('Could not load follow status');
        }
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
      const targetId = String(hostUserIdRef.current || hostUserId || effectiveStreamId || '').trim();
      if (!targetId || targetId === 'broadcast') {
        showToast('Creator unavailable. Try again.');
        return;
      }
      if (targetId === user.id) return;
      if (isFollowing) {
        // Already following — Join (daily membership heart) is available in the same slot.
        return;
      }
      // Optimistic: reveal Join immediately; revert on failure.
      setIsFollowing(true);
      const prevFollowing = useVideoStore.getState().followingUsers;
      if (!prevFollowing.includes(targetId)) {
        useVideoStore.setState({ followingUsers: [...prevFollowing, targetId] });
      }
      try {
        const { ok, error: followErr } = await apiToggleFollow(targetId, false);
        if (!ok || followErr) throw new Error(followErr || 'follow failed');
      } catch {
        setIsFollowing(false);
        useVideoStore.setState({
          followingUsers: prevFollowing.filter((id) => id !== targetId),
        });
        showToast('Could not follow. Try again.');
      }
    },
    [user?.id, hostUserId, effectiveStreamId, isFollowing, navigate, location.pathname],
  );

  /** One membership heart per calendar day. Counts on creator membership stats (heart_days).
   * Always opens Team Status so Buy Membership is reachable even if heart cannot send yet. */
  const sendMembershipHeartJoin = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      const creatorId = String(hostUserIdRef.current || hostUserId || effectiveStreamId || '').trim();

      // Open membership panel first — Buy Membership must be visible in the same sheet.
      setShowTeamStatus(true);

      if (!user?.id) {
        if (creatorId && creatorId !== 'broadcast') {
          stashPendingMembershipPurchase(creatorId);
        }
        showToast('Log in to continue membership');
        navigate('/login', { state: { from: loginReturnPath(location.pathname, location.search) } });
        return;
      }
      if (!creatorId || creatorId === 'broadcast') {
        showToast('Creator unavailable. Try again.');
        return;
      }
      const token = useAuthStore.getState().session?.access_token;
      if (!token) {
        stashPendingMembershipPurchase(creatorId);
        showToast('Log in to continue membership');
        navigate('/login', { state: { from: loginReturnPath(location.pathname, location.search) } });
        return;
      }

      if (!isFollowing) {
        showToast('Follow first to give a membership heart');
        return;
      }

      if (hasJoinedToday) {
        showToast('Already sent today’s membership heart');
        return;
      }

      // Prefer server truth so we never double-count a day.
      try {
        const { data: before } = await apiLiveGetDailyHearts(creatorId);
        if (before?.hasSent) {
          setHasJoinedToday(true);
          showToast('Already sent today’s membership heart');
          return;
        }
      } catch (err) {
        reportFailure('live_daily_hearts', err, { creatorId });
      }

      try {
        const { data: d, error } = await apiLiveSendDailyHeart(creatorId);
        if (error) {
          showToast('Could not send membership heart. Try again.');
          return;
        }
        const already = d?.already === true;
        const ok = d?.ok === true || already;
        if (!ok) {
          showToast('Could not send membership heart. Try again.');
          return;
        }

        // Orange Join immediately after a successful send (same day) — server owns the day flag.
        setHasJoinedToday(true);

        if (e && typeof e.clientX === 'number' && typeof e.clientY === 'number') {
          spawnHeartFromClient(e.clientX, e.clientY);
        }

        if (!already) {
          const joinBannerId = Date.now().toString();
          const newMessage: LiveMessage = {
            id: joinBannerId,
            username: viewerName,
            text: 'Joined the team!',
            level: userLevel,
            isGift: false,
            avatar: viewerAvatar,
            isSystem: true,
            membershipIcon: 'heart',
          };
          setMessages((prev) => appendCapped(prev, newMessage, LIVE_CHAT_MESSAGE_CAP));
          liveChatSend({
            text: 'Joined the team!',
            level: userLevel,
            avatar: viewerAvatar,
          });
          window.setTimeout(() => {
            setMessages((prev) => prev.filter((m) => m.id !== joinBannerId));
          }, 5000);
          showToast('Membership heart sent');
        } else {
          showToast("Already sent today's membership heart");
        }

        try {
          const { data: after } = await apiLiveGetDailyHearts(creatorId);
          if (after) {
            if (typeof after.todayCount === 'number') setDailyHeartCount(after.todayCount);
            if (typeof after.totalCount === 'number') setMyHeartCount(after.totalCount);
            setHasJoinedToday(after.hasSent === true);
          }
        } catch (err) {
          reportFailure('live_daily_hearts', err, { creatorId });
        }
        refreshMembershipStats();
      } catch (err) {
        reportFailure('live_membership_join', err, { creatorId });
        showToast('Could not send membership heart. Try again.');
        setShowTeamStatus(true);
      }
    },
    [
      isFollowing,
      user?.id,
      hostUserId,
      hasJoinedToday,
      navigate,
      location.pathname,
      location.search,
      spawnHeartFromClient,
      viewerName,
      viewerAvatar,
      userLevel,
      refreshMembershipStats,
      effectiveStreamId,
      setMessages,
    ],
  );

  useEffect(() => {
    return loadDiamondLeagueRankForCreator(hostUserId, setDiamondLeagueRank);
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
      reportLiveCommentEngagement(effectiveStreamId);
    }
  };

  // Spectator gift → creator: send to creator's room (broadcast so creator sees it and gets credit)
  const handleSendGift = async (gift: GiftUiItem, opts?: { fromCombo?: boolean }) => {
    if (!gift) return;
    if (opts?.fromCombo && comboCount >= GIFT_COMBO_MAX) return;
    const usedTestCoins = Boolean(user?.id && shouldUseTestCoinsForGifts(user.id));
    const walletNow = useWalletStore.getState();
    const spendable = resolveLiveGiftSpendableBalance({
      usedTestCoins,
      userId: user?.id,
      giftSource,
      paidBalance: walletNow.paidBalance,
      starterBalance: walletNow.starterBalance,
      promotionalBalance: walletNow.promotionalBalance,
    });
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
      setTestCoinBalance(debit.newBalance);
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
        const playableVideo = resolvePlayableGiftVideoUrl(gift.video);
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
        const applied = await applyLiveGiftWalletResult({ result, giftSource });
        if (applied.paid != null) {
          walletCoinBalanceRef.current = applied.paid;
        }
        if (applied.nextGiftSource) {
          setGiftSource(applied.nextGiftSource);
        }
        if (applied.walletRefreshFailed) {
          reportFailure('live_gift_wallet_refresh', 'fetchWallet failed');
          showToast('Could not refresh wallet balance');
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

    if (gift.video && gift.video.trim()) {
      const videoUrl = resolveLocalGiftVideoUrl(gift.video);
      if (videoUrl) {
        const localSlot = spectatorBattle?.active
          ? resolveServerBattleGiftTarget(spectatorGiftBattleTarget)
          : null;
        const playFull =
          !spectatorBattle?.active ||
          shouldPlayFullBattleGiftVideo(localSlot, battleAudienceSlotRef.current);
        if (playFull) {
          enqueueGiftVideo(
            videoUrl,
            spectatorBattle?.active ? spectatorGiftBattleTarget : null,
          );
        }
      }
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
    // Test coins: local WS gift_sent for animation + battle match points only.
    // Paid / starter / promo: REST sendLivePaidGift is the sole authority (same as host) — never gift_sent.
    if (usedTestCoins) {
      const wsVideo = resolvePlayableGiftVideoUrl(gift.video);
      liveGiftSentWs({
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
        transactionId: null,
        giftSource: 'test_coins',
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
    setShowComboButton(true);
    resetComboTimer();
    const iconUrl = applyLocalGiftSendSideEffects({
      pill: {
        username: viewerName,
        giftName: gift.name,
        giftIcon: gift.icon || '🎁',
        avatar: viewerAvatar,
        quantity: 1,
        creatorName: hostName || 'Creator',
        streamId: effectiveStreamId,
      },
      giftIcon: gift.icon,
      resolveGiftAssetUrl,
      ...(spectatorBattle?.active
        ? {
            battle: {
              target: spectatorGiftBattleTarget,
              setLastGifts,
            },
          }
        : {}),
      // Co-host tile: score + real gift icon immediately (dedupe WS echo via txn).
      ...(!spectatorBattle?.active && selectedCohostGiftUserId
        ? {
            cohost: {
              targetUserId: selectedCohostGiftUserId,
              coins: gift.coins,
              giftTransactionId,
              markGiftTxnSeen,
              setCohostGiftScores,
              setCohostLastGifts,
            },
          }
        : {}),
    });
    if (spectatorBattle?.active && iconUrl) {
      if (spectatorGiftBattleTarget === 'opponent') {
        setLastOpponentGift((prev) => {
          const next = [...prev, iconUrl];
          return next.length > BATTLE_TILE_GIFT_STACK_CAP
            ? next.slice(-BATTLE_TILE_GIFT_STACK_CAP)
            : next;
        });
      }
      if (spectatorGiftBattleTarget === 'host') {
        setLastHostGift((prev) => {
          const next = [...prev, iconUrl];
          return next.length > BATTLE_TILE_GIFT_STACK_CAP
            ? next.slice(-BATTLE_TILE_GIFT_STACK_CAP)
            : next;
        });
      }
    }
  };

  const handleComboClick = () => {
    if (!lastSentGift) return;
    if (comboCount >= GIFT_COMBO_MAX) return;
    void handleSendGift(lastSentGift, { fromCombo: true }).catch((err) => {
      reportFailure('live_gift_combo', err);
      showToast('Gift failed');
    });
  };

  const leaveStreamWithSlide = useCallback(() => {
    if (pageExiting) return;
    // Co-host close ends seat only — stay on this watch live (same as host ending co-host stays on broadcast).
    if (isCoHosting) {
      exitCohostStayWatching();
      return;
    }
    setPageExiting(true);
    window.setTimeout(() => {
      websocket.disconnect();
      stopCamera();
      navigate('/feed', { replace: true });
    }, 250);
  }, [pageExiting, isCoHosting, exitCohostStayWatching, stopCamera, navigate]);


  const spectatorGate =
    streamIsLive === null ? 'loading' : streamIsLive === false ? 'offline' : 'live';



  return {
    SPEED_CHALLENGE_ENABLED,
    dailyHeartCount,
    myHeartCount,
    heartMembers,
    topGifters,
    _lastBattleScoreUpdateTraceSigRef,
    _openOpponentPanel,
    openBattleSidePanel,
    battleSidePanel,
    _setModerators: setModerators,
    _setSelectedSpectatorUserId,
    _startCoHosting,
    acceptBattleInviteFromWatch,
    activeBooster,
    fireAutoBooster,
    fireMistFog,
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
    engagementState,
    coHostChanRef,
    coHostPublishStreamRef,
    coHostStream,
    coHostVideoRefs,
    cohostGiftScores,
    cohostLastGifts,
    cohostState,
    coinBalance,
    testCoinBalance,
    comboCount,
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
    sendMembershipHeartJoin,
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
    hostTotalGiftCoins,
    inputValue,
    isCamOff,
    isChatVisible,
    isCoHostFromUrl,
    isCoHosting,
    isFollowing,
    isMember,
    membershipIsSelf,
    isMicMuted,
    isModerator,
    isMoreMenuOpen,
    isReportModalOpen,
    isSpeakingUser,
    isSubscribing,
    joinRequested,
    lastOpponentGift,
    lastHostGift,
    lastGifts,
    battleAudienceSlot,
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
    opponentProfile,
    hostBattleProfile,
    opponentProfileFetchedRef,
    opponentVideoRef,
    player3VideoRef,
    player4VideoRef,
    hasPlayer3Stream,
    hasPlayer4Stream,
    pageExiting,
    pendingBattleInvite,
    pendingCoHostInvite,
    prevMvpHostSpectatorRef,
    prevMvpOpponentSpectatorRef,
    prevSpectatorBattleActiveRef,
    promotionalCoinBalance,
    pushBattleTaunt,
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
    setComboCount,
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
    setIsMicMuted,
    setIsMoreMenuOpen,
    setIsReportModalOpen,
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
    setBattleSidePanel,
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
    setStreamEndedReceived,
    setStreamIsLive,
    setStreamRetryKey,
    setTestCoinsAmount,
    setTestCoinsError,
    setTestCoinsPwd,
    setTestCoinsStep,
    setUserLevel,
    setUserXP,
    setViewerCount,
    setViewersList,
    shareContacts,
    shareLiveUserIds,
    shareQuery,
    showCoHostPanel,
    showComboButton,
    showFanClub,
    showTeamStatus,
    setShowTeamStatus,
    closeTeamStatus: () => setShowTeamStatus(false),
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
    battleWinStreak,
    spectatorBattleRef,
    spectatorBattleVoteRemainingRef,
    spectatorChatHeartsRef,
    spectatorCoHostRequestSent,
    spectatorCoHosts,
    cohostLayoutId,
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
    exitCohostStayWatching,
    stopCoHosting,
    streamEndedReceived,
    streamIsLive,
    streamRetryKey,
    syncMvpSlots,
    syncMvpSlotsRef,
    addMaxTestCoinsAtOnce,
    closeTestCoinsModal,
    openTestCoinsModal,
    selectTestCoinsPreset,
    submitTestCoinsAmount,
    submitTestCoinsPasswordUnlock,
    testCoinsAmount,
    testCoinsBusy,
    testCoinsError,
    testCoinsPwd,
    testCoinsPwdRef,
    testCoinsStep,
    toggleCam,
    flipCamera,
    toggleFeaturedUser,
    toggleMic,
    triggerBattleVfx,
    updateUser,
    user,
    userLevel,
    userXP,
    videoRef,
    hostRemoteAudioRef,
    viewerAvatar,
    viewerCount,
    viewerName,
    viewersList,
    votePoll,
    walletCoinBalanceRef,
    wasCohostSeatedRef,
  };
}
