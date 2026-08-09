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
  RefreshCw,
} from 'lucide-react';
import { GiftPanel } from '../../../components/GiftPanel';
import { GiftGoalGallery } from '../../../components/GiftGoalGallery';
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
import GiftAnimationOverlay from '../../../components/GiftAnimationOverlay';
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
import { request } from '../../../lib/apiClient';
import { openExternalLink, nativeShareUrl } from '../../../lib/platform';
import ReportModal from '../../../components/ReportModal';
import PromotePanel from '../../../components/PromotePanel';
import { RankingPanel } from '../../../components/RankingPanel';
import { type LiveRankTab } from '../../../components/CyclingRankBadge';
import {
  apiLiveEngagementProgress,
  apiLiveShareCreate,
} from '../engagement/liveEngagementApi';
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
import { cohostInviteAccept } from '../cohost/liveCohostActions';
import { liveBoosterActivated, liveMistActivated } from '../room/liveRoomActions';
import { normalizeBattleGiftTarget } from '../../../lib/liveBattleGiftTarget';
import { parseLiveGiftGoal, type LiveGiftGoal } from '../../../lib/liveGiftGoal';
import { resolveUiAvatarUrl } from '../../../lib/royceAssets';
import { getMembershipStatus, purchaseMembership } from '../../../lib/iap';
import type { Room } from 'livekit-client';
import { RoomEvent, ConnectionState } from 'livekit-client';
import { apiLiveStreams, apiLiveToken, LiveRoomLifecycle } from '../../../lib/live';
import { giftSendErrorToast } from '../../../lib/giftSend';

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

import { useLiveSpectatorController } from './useLiveSpectatorController';

/** Thin Live spectator UI shell — orchestration owns useLiveSpectatorController. */
export default function SpectatorLiveScreen() {
  const {
    SPEED_CHALLENGE_ENABLED,
    addMaxTestCoinsAtOnce,
    closeTestCoinsModal,
    openTestCoinsModal,
    selectTestCoinsPreset,
    submitTestCoinsAmount,
    submitTestCoinsPasswordUnlock,
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
    lastHostGift,
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
    battleWinStreak,
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
    testCoinsBusy,
    testCoinsError,
    testCoinsPwd,
    testCoinsPwdRef,
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
  } = useLiveSpectatorController();

  if (spectatorGate === 'loading') {
    return (
      <div className="fixed inset-0 elix-fundal-glass flex justify-center">
        <div className="relative w-full max-w-[480px] h-full bg-[rgba(0,0,0,0.35)] flex flex-col items-center justify-center gap-4 p-6">
          <div className="w-10 h-10 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
          <p className="text-white/60 text-sm">Checking stream...</p>
        </div>
      </div>
    );
  }

  if (spectatorGate === 'offline') {
    return (
      <div className="fixed inset-0 elix-fundal-glass flex justify-center">
        <div className="relative w-full max-w-[480px] h-full bg-[rgba(0,0,0,0.35)] flex flex-col items-center justify-center gap-4 p-6">
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
                className="px-6 py-2.5 rounded-lg bg-white/10 border border-[#D8D9DD]/50 text-[#F5F5F7] font-semibold"
              >
                Retry connection
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/feed', { replace: true })}
              className="px-6 py-2.5 rounded-lg bg-[#E6E9EE] text-white elix-accent font-semibold"
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
      className="elix-live-room elix-fundal-glass fixed inset-0 flex justify-center transition-transform duration-[250ms] ease-out"
      style={{ transform: pageExiting ? 'translateX(100%)' : undefined }}
    >
      <div className={`relative w-full max-w-[480px] h-full overflow-hidden overflow-x-hidden flex flex-col ${spectatorBattle?.active ? 'elix-battle-room-fundal' : 'elix-fundal-glass'}`}>

        {spectatorBattle?.active ? (
          <div
            className="elix-battle-lower-fundal pointer-events-none absolute inset-x-0 bottom-0 z-[1]"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 112px - 0.5mm + 44dvh - 3mm)' }}
            aria-hidden
          />
        ) : null}

        {/* Video container: transparent shell — glass overlays sit on top of live video */}
        {/* Video container */}
        {(() => {
          const myUserId = user?.id || '';
          const hostId = hostUserIdRef.current || hostUserId || effectiveStreamId;
          const externalCoHosts = spectatorCoHosts.filter(h => h.userId !== hostId);
          const liveCoHosts = externalCoHosts.filter(
            (h) => h.status === 'live' || h.status === 'accepted',
          );
          // Show split layout as soon as join starts (?cohost=1) or any seat exists —
          // do not wait for publish/layout sync (that left full-screen until a re-tap).
          const showGrid =
            isCoHosting ||
            isCoHostFromUrl ||
            liveCoHosts.length > 0 ||
            externalCoHosts.some(
              (h) => h.status === 'invited' || h.status === 'pending_accept',
            );

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
                className="absolute inset-0 z-[80] flex flex-col overflow-hidden"
                style={{
                  paddingTop: 'calc(env(safe-area-inset-top, 0px) + 112px - 0.5mm)',
                  paddingBottom: '305px',
                }}
              >
                {/* Battle video half — score + videos + MVP inside height box (host-identical) */}
                <div className="relative w-full max-w-full flex-none flex flex-col overflow-hidden overflow-x-hidden elix-battle-stage-fundal" style={{ height: LIVE_BATTLE_VIDEO_HEIGHT }}>
                <div className={`relative z-20 w-full flex-none ${battleScoreBarHidden ? '' : 'elix-battle-score-wrap'}`}>
                  {!battleScoreBarHidden ? (
                    <div
                      className="relative w-full overflow-hidden cursor-pointer pointer-events-auto"
                      style={{ minHeight: showPkBreakdown ? 'calc(14px + 0.5mm)' : 'calc(12px + 0.5mm)', height: showPkBreakdown ? 'calc(14px + 0.5mm)' : 'calc(12px + 0.5mm)' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setBattleScoreBarHidden(true);
                      }}
                      title="Hide score bar"
                    >
                      <div className="absolute inset-0 flex">
                        <div
                          className="elix-battle-score-host h-full transition-[width] duration-[1200ms] ease-out motion-reduce:transition-none"
                          style={{ width: `${leftPct}%` }}
                        />
                        <div className="elix-battle-score-guest h-full flex-1 min-w-0" />
                      </div>
                      <div className="relative z-10 flex h-full min-h-[12px] items-center justify-between gap-1.5 px-2 pointer-events-none leading-none">
                        <div className={`flex min-w-0 flex-1 flex-col items-start justify-center gap-0 ${hideRedScore ? 'opacity-0' : ''}`}>
                          <AnimatedScore value={typeof redTeamScore === 'number' && Number.isFinite(redTeamScore) ? redTeamScore : 0} durationMs={0} format={formatBattleScoreShort} className="text-white font-black text-[10px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" />
                          {showPkBreakdown && (
                            <span className="text-[5px] text-white/80 tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                              P1 {hS} + P3 {p3s}
                            </span>
                          )}
                        </div>
                        <div className={`flex min-w-0 flex-1 flex-col items-end justify-center gap-0 ${hideBlueScore ? 'opacity-0' : ''}`}>
                          <AnimatedScore value={typeof blueTeamScore === 'number' && Number.isFinite(blueTeamScore) ? blueTeamScore : 0} durationMs={0} format={formatBattleScoreShort} className="text-white font-black text-[10px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" />
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
                  ) : (
                    <div className="w-full h-0" aria-hidden />
                  )}
                  {/* Match timer — flush under battle score bar (0mm gap); tap VS to restore bar when hidden */}
                  <div className={`absolute left-0 right-0 z-30 flex justify-center m-0 p-0 ${battleScoreBarHidden ? 'top-0 pointer-events-auto' : 'top-full pointer-events-none'}`}>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 pointer-events-auto"
                      style={{
                        backgroundColor: 'var(--elix-panel)',
                        border: '1px solid var(--elix-border)',
                        backdropFilter: 'var(--elix-glass-blur)',
                        WebkitBackdropFilter: 'var(--elix-glass-blur)',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (battleScoreBarHidden) setBattleScoreBarHidden(false);
                      }}
                      title={battleScoreBarHidden ? 'Show score bar' : undefined}
                    >
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
                      {SPEED_CHALLENGE_ENABLED && speedChallengeActive && (
                        <span className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-full bg-[#B91C1C]/90 shadow-[0_0_10px_rgba(185,28,28,0.55)]">
                          <span className="text-white text-[8px] font-black uppercase tracking-wide">Speed</span>
                          <span className="text-white text-[11px] font-black tabular-nums">{speedChallengeTime}s</span>
                          {speedMultiplier > 1 && (
                            <span className="text-white text-[9px] font-black">x{speedMultiplier}</span>
                          )}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Battle grid — videos + tap overlay (2-way or 4-way PK); one +5 vote per spectator per battle */}
                  <div className="flex-1 min-h-0 min-w-0 w-full max-w-full flex flex-col relative overflow-hidden overflow-x-hidden">
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
                    <div className="absolute inset-0 flex flex-row gap-0 w-full max-w-full min-w-0 overflow-hidden">
                      <div className="flex-1 basis-0 min-w-0 h-full overflow-hidden relative bg-[rgba(0,0,0,0.35)]">
                        <video
                          ref={videoRef}
                          className="absolute inset-0 w-full h-full object-cover"
                          playsInline
                          autoPlay
                          style={{ opacity: hasStream ? 1 : 0, transition: 'opacity 0.4s ease' }}
                        />
                        {!hasStream && (
                          <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 elix-panel">
                            {hostAvatar ? (
                              <img src={hostAvatar} alt="" className="w-16 h-16 rounded-full object-cover object-center" />
                            ) : (
                              <div className="w-16 h-16 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
                                <span className="text-2xl font-black text-[#F5F5F7]">{(hostName || 'H').charAt(0).toUpperCase()}</span>
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
                        {lastHostGift && (
                          <div className="absolute bottom-1 left-1 z-20 pointer-events-none flex items-center">
                            <div className="w-5 h-5 rounded-full bg-[rgba(0,0,0,0.35)] border border-[#D8D9DD]/40 overflow-hidden flex items-center justify-center drop-shadow-md">
                              <img src={lastHostGift} alt="gift" className="w-full h-full object-cover" />
                            </div>
                          </div>
                        )}
                      </div>
                      <div
                        className={`flex-1 basis-0 min-w-0 h-full overflow-hidden relative ${
                          hasOpponentStream ? 'bg-[rgba(0,0,0,0.35)]' : 'bg-transparent'
                        }`}
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
                          <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 elix-battle-slot">
                            {spectatorBattle.opponentName ? (
                              <div className="w-16 h-16 rounded-full bg-[rgba(8,10,14,0.65)] flex items-center justify-center border border-[var(--elix-border)]">
                                <span className="text-2xl font-black text-[#E6E9EE]">{spectatorBattle.opponentName.charAt(0).toUpperCase()}</span>
                              </div>
                            ) : (
                              <div className="w-16 h-16 rounded-full bg-[rgba(8,10,14,0.65)] flex items-center justify-center border border-[var(--elix-border)]">
                                <span className="text-2xl font-black text-[#E6E9EE]">+</span>
                              </div>
                            )}
                            <span className="text-[#C8CDD5] text-xs font-bold truncate max-w-[90%]">{spectatorBattle.opponentName || 'Invite creator'}</span>
                            {spectatorBattle.opponentName ? (
                              <div className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-[#E6E9EE] animate-pulse" />
                                <span className="text-[#8B9099] text-[10px] font-bold">Connecting...</span>
                              </div>
                            ) : null}
                          </div>
                        )}
                        {lastOpponentGift && (
                          <div className="absolute bottom-1 right-1 z-20 pointer-events-none flex items-center">
                            <div className="w-5 h-5 rounded-full bg-[rgba(0,0,0,0.35)] border border-[#D8D9DD]/40 overflow-hidden flex items-center justify-center drop-shadow-md">
                              <img src={lastOpponentGift} alt="gift" className="w-full h-full object-cover" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {spectatorBattle.winner && (
                      <div className="absolute inset-0 z-[8] pointer-events-none flex flex-row gap-0">
                        <div className="flex-1 basis-0 min-w-0 h-full flex flex-col items-center justify-center gap-0.5">
                          <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${spectatorBattle.winner === 'host' ? 'text-white' : spectatorBattle.winner === 'draw' ? 'text-white' : 'text-white/60'}`}>
                            {spectatorBattle.winner === 'host' ? 'WIN' : spectatorBattle.winner === 'draw' ? 'DRAW' : 'LOSS'}
                          </span>
                          {spectatorBattle.winner === 'host' && battleWinStreak.host > 0 ? (
                            <span className="text-[10px] font-black text-white tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">×{battleWinStreak.host}</span>
                          ) : null}
                          {spectatorBattle.winner === 'opponent' ? (
                            <span className="text-[10px] font-black text-white/70 tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">0</span>
                          ) : null}
                        </div>
                        <div className="flex-1 basis-0 min-w-0 h-full flex flex-col items-center justify-center gap-0.5">
                          <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${spectatorBattle.winner === 'opponent' ? 'text-white' : spectatorBattle.winner === 'draw' ? 'text-white' : 'text-white/60'}`}>
                            {spectatorBattle.winner === 'opponent' ? 'WIN' : spectatorBattle.winner === 'draw' ? 'DRAW' : 'LOSS'}
                          </span>
                          {spectatorBattle.winner === 'opponent' && battleWinStreak.opponent > 0 ? (
                            <span className="text-[10px] font-black text-white tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">×{battleWinStreak.opponent}</span>
                          ) : null}
                          {spectatorBattle.winner === 'host' ? (
                            <span className="text-[10px] font-black text-white/70 tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">0</span>
                          ) : null}
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
                              className="flex-1 min-h-0 w-full touch-manipulation cursor-pointer border-0 bg-transparent p-0 active:bg-white/5 border-t border-[#2A2D33]"
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
                              className="flex-1 min-h-0 w-full touch-manipulation cursor-pointer border-0 bg-transparent p-0 active:bg-white/5 border-t border-[#2A2D33]"
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

                {/* MVP under cameras — identical to host: fixed above chat fundal */}
                <div
                  className="elix-battle-mvp-row fixed left-0 right-0 z-[110] flex justify-center pointer-events-none"
                  style={{ top: 'calc(env(safe-area-inset-top, 0px) + 112px - 0.5mm + 44dvh - 3mm)' }}
                >
                  <div className="w-full max-w-[480px] px-3 py-1.5 flex items-end justify-between overflow-x-hidden">
                  <div
                    className="flex items-end gap-[0mm] min-w-0 flex-1 justify-start pointer-events-auto overflow-hidden"
                    title="Top gifters — red side"
                    onClick={() => {
                      const ranked = [...mvpSlots.host]
                        .filter((s) => (s.points ?? 0) > 0)
                        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
                      const list = (ranked.length > 0 ? ranked : mvpSlots.host).map((s) => ({
                        id: s.id,
                        name: s.name,
                        avatar: s.avatar,
                        level: s.level,
                        points: s.points ?? 0,
                      }));
                      setViewersList(list);
                      setShowViewersPanel(true);
                    }}
                  >
                    {mvpSlots.host.map((slot, i) => {
                      const gifted = slot.points ?? mvpGiftScoresHostRef.current[slot.id] ?? 0;
                      const isMvp = i === 0 && gifted > 0;
                      const raw = String(slot.name || '').trim();
                      const label = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
                        ? raw.split('@')[0] || 'User'
                        : raw || 'User';
                      return (
                        <div
                          key={`mvp-l-${slot.id}`}
                          className="relative flex flex-col items-center max-w-[42px]"
                          style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '1.5mm' }}
                        >
                          <div className={isMvp ? 'rounded-full shadow-[0_0_3px_0_rgba(230,233,238,0.30)]' : 'rounded-full'}>
                            <AvatarRing
                              src={resolveCircleAvatar(slot.avatar, label)}
                              alt={label}
                              size={LIVE_MVP_PROFILE_RING_PX}
                            />
                          </div>
                          {isMvp && (
                            <span className="absolute top-[22px] left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#E6E9EE] text-white elix-accent text-[6px] font-black leading-none tracking-wide">
                              MVP
                            </span>
                          )}
                          <span className="mt-1.5 text-white text-[7px] font-semibold truncate max-w-full leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                            {label}
                          </span>
                          <span className="text-[#F5F5F7] text-[7px] font-black tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                            {gifted >= 1_000 ? `${(gifted / 1_000).toFixed(1)}K` : String(Math.floor(gifted))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="flex items-end gap-[0mm] min-w-0 flex-1 justify-end pointer-events-auto overflow-hidden"
                    title="Top gifters — blue side"
                    onClick={() => {
                      const ranked = [...mvpSlots.opponent]
                        .filter((s) => (s.points ?? 0) > 0)
                        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
                      const list = (ranked.length > 0 ? ranked : mvpSlots.opponent).map((s) => ({
                        id: s.id,
                        name: s.name,
                        avatar: s.avatar,
                        level: s.level,
                        points: s.points ?? 0,
                      }));
                      setViewersList(list);
                      setShowViewersPanel(true);
                    }}
                  >
                    {mvpSlots.opponent.map((slot, i) => {
                      const gifted = slot.points ?? mvpGiftScoresOpponentRef.current[slot.id] ?? 0;
                      const isMvp = i === 0 && gifted > 0;
                      const raw = String(slot.name || '').trim();
                      const label = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
                        ? raw.split('@')[0] || 'User'
                        : raw || 'User';
                      return (
                        <div
                          key={`mvp-r-${slot.id}`}
                          className="relative flex flex-col items-center max-w-[42px]"
                          style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '1.5mm' }}
                        >
                          <div className={isMvp ? 'rounded-full shadow-[0_0_3px_0_rgba(230,233,238,0.30)]' : 'rounded-full'}>
                            <AvatarRing
                              src={resolveCircleAvatar(slot.avatar, label)}
                              alt={label}
                              size={LIVE_MVP_PROFILE_RING_PX}
                            />
                          </div>
                          {isMvp && (
                            <span className="absolute top-[22px] left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#E6E9EE] text-white elix-accent text-[6px] font-black leading-none tracking-wide">
                              MVP
                            </span>
                          )}
                          <span className="mt-1.5 text-white text-[7px] font-semibold truncate max-w-full leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                            {label}
                          </span>
                          <span className="text-[#F5F5F7] text-[7px] font-black tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                            {gifted >= 1_000 ? `${(gifted / 1_000).toFixed(1)}K` : String(Math.floor(gifted))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                </div>
                {SPEED_CHALLENGE_ENABLED && speedChallengeActive && (
                  <div className="w-full px-3 py-2 flex items-center justify-center flex-none pointer-events-none mt-1 relative z-30" style={{ transform: 'translateY(-6mm)' }}>
                    <div className="flex items-center gap-3 px-5 py-1 rounded-full bg-[#B91C1C]/90 backdrop-blur-md border border-white/20 shadow-[0_0_15px_rgba(185,28,28,0.45)] animate-luxury-fade-in">
                      <span className="text-white text-[9px] font-bold uppercase tracking-[0.1em]">⚡ Speed</span>
                      <span className="text-white text-[14px] font-black tabular-nums">{speedChallengeTime}s</span>
                      {speedMultiplier > 1 && (
                        <span className="text-white text-[11px] font-black animate-pulse">x{speedMultiplier}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Opponent profile panel — floating above bottom bar */}
                {showOpponentPanel && spectatorBattle.opponentRoomId && (
                  <div className="fixed inset-0 z-[200]" onClick={() => setShowOpponentPanel(false)}>
                    <div className="absolute inset-0 bg-black/35" />
                    <div
                      className="absolute left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-[456px] elix-panel rounded-2xl overflow-hidden shadow-xl border border-[#2A2D33] animate-[slideInFromBottom_0.2s_ease-out]"
                      style={{ bottom: 'calc(70px + max(8px, env(safe-area-inset-bottom)))' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-3.5 py-3 flex items-center gap-3">
                        {(opponentProfile?.avatarUrl) ? (
                          <img src={opponentProfile.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-black text-[#F5F5F7]">
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
                              className="flex items-center px-3 py-2 rounded-full border border-[#D8D9DD]/40 active:scale-95 transition-transform"
                              onClick={(e) => {
                                e.stopPropagation();
                                const uid = battleStreamIds.opponentUserId;
                                setShowOpponentPanel(false);
                                navigate(`/profile/${uid}`);
                              }}
                            >
                              <span className="text-[#F5F5F7] font-bold text-[11px]">Profile</span>
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

          type SlotType = { type: 'host_main' | 'self' | 'live' | 'invited' | 'pending' | 'empty'; host?: typeof spectatorCoHosts[0] };

          const buildSlots = (): SlotType[] => {
            const slots: SlotType[] = [];
            const liveOthers = externalCoHosts.filter(h => h.userId !== myUserId && (h.status === 'live' || h.status === 'accepted'));
            const featured = featuredUserId
              ? liveOthers.find((h) => sameUserId(h.userId, featuredUserId)) || null
              : null;
            if (featured) slots.push({ type: 'host_main' });
            if (isCoHosting && !(featured && sameUserId(myUserId, featured.userId))) {
              slots.push({ type: 'self' });
            }
            const restLive = featured
              ? liveOthers.filter((h) => !sameUserId(h.userId, featured.userId))
              : liveOthers;
            const invitedPending = externalCoHosts.filter(h => h.userId !== myUserId && (h.status === 'invited' || h.status === 'pending_accept'));
            restLive.forEach(h => slots.push({ type: 'live', host: h }));
            invitedPending.forEach(h => slots.push({ type: h.status === 'invited' ? 'invited' : 'pending', host: h }));
            while (slots.length < 8) slots.push({ type: 'empty' });
            return slots;
          };

          const renderSlot = (slot: SlotType) => {
            if (slot.type === 'host_main') {
              const hid = hostUserIdRef.current || hostUserId || effectiveStreamId;
              const hostCamOff = [...remoteCamOff].some((id) => sameUserId(id, hid) || sameUserId(id, effectiveStreamId));
              return (
                <>
                  <video
                    ref={hostSmallVideoRef}
                    className={`absolute inset-0 w-full h-full object-cover z-[6] ${LIVE_WEBRTC_VIDEO_CLASS}`}
                    autoPlay
                    playsInline
                    muted
                    controls={false}
                    poster={LIVE_VIDEO_TRANSPARENT_POSTER}
                    style={{ opacity: hostCamOff ? 0 : 1, backgroundColor: '#080A0E' }}
                  />
                  {hostCamOff && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 elix-panel z-[5]">
                      {hostAvatar ? (
                        <img src={hostAvatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
                          <span className="text-[#F5F5F7]/60 text-sm font-bold">{hostName.slice(0, 1)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    title="Host on big screen"
                    onClick={(e) => { e.stopPropagation(); setFeaturedUserId(null); }}
                    className="absolute top-0.5 left-0.5 z-10 rounded bg-black/55 p-0.5 border border-[#D8D9DD]/45 pointer-events-auto active:scale-95"
                  >
                    <ArrowLeftRight className="w-3 h-3 text-[#F5F5F7]" strokeWidth={2.5} />
                  </button>
                  <span className="absolute bottom-0.5 left-0.5 z-10 text-white/80 text-[8px] font-bold bg-black/50 rounded px-1 truncate max-w-[90%]">
                    {hostName}
                  </span>
                </>
              );
            }
            if (slot.type === 'self') {
              return (
                <>
                  {isCamOff && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 elix-panel z-[5]">
                    {(viewerAvatar || user?.avatar) ? (
                      <img src={viewerAvatar || user?.avatar || ''} alt="" className="w-10 h-10 rounded-full object-cover object-center" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
                        <span className="text-[#F5F5F7]/60 text-sm font-bold">{(viewerName || '?').charAt(0)}</span>
                      </div>
                    )}
                  </div>
                  )}
                  <video
                    ref={myVideoRef}
                    className={`absolute inset-0 w-full h-full object-cover z-[6] ${LIVE_WEBRTC_VIDEO_CLASS}`}
                    autoPlay
                    playsInline
                    muted
                    controls={false}
                    poster={LIVE_VIDEO_TRANSPARENT_POSTER}
                    style={{
                      opacity: isCamOff ? 0 : 1,
                      transition: 'opacity 0.3s ease',
                      backgroundColor: '#080A0E',
                    }}
                  />
                  <button
                    type="button"
                    title="Put on big screen"
                    onClick={(e) => { e.stopPropagation(); if (user?.id) toggleFeaturedUser(user.id); }}
                    className="absolute top-0.5 left-0.5 z-10 rounded bg-black/55 p-0.5 border border-[#D8D9DD]/45 pointer-events-auto active:scale-95"
                  >
                    <ArrowLeftRight className="w-3 h-3 text-[#F5F5F7]" strokeWidth={2.5} />
                  </button>
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
              const camOff = [...remoteCamOff].some((id) => sameUserId(id, h.userId));
              const scoreEntry = Object.entries(cohostGiftScores).find(([id]) =>
                sameUserId(id, h.userId),
              );
              const score = scoreEntry ? scoreEntry[1] : 0;
              const lastGiftIcon =
                Object.entries(cohostLastGifts).find(([id]) => sameUserId(id, h.userId))?.[1] ||
                undefined;
              const isSelected =
                !!selectedCohostGiftUserId && sameUserId(selectedCohostGiftUserId, h.userId);
              return (
                <>
                  {camOff && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 elix-panel z-[5]">
                    {h.avatar ? (
                      <img src={h.avatar} alt="" className="w-10 h-10 rounded-full object-cover object-center" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
                        <span className="text-[#F5F5F7]/60 text-sm font-bold">{(h.name || '?').charAt(0)}</span>
                      </div>
                    )}
                    <span className="text-white/90 text-[8px] font-bold truncate max-w-full px-1">{h.name}</span>
                  </div>
                  )}
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
                            if (!sameUserId(p.identity, h.userId)) continue;
                            for (const [, pub] of p.videoTrackPublications) {
                              if (pub.track && pub.isSubscribed) {
                                pub.track.attach(el);
                                prepareLiveVideoEl(el);
                                if (pub.isMuted) markRemoteCam(p.identity, true);
                                else markRemoteCam(p.identity, false);
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
                    className={`absolute inset-0 w-full h-full object-cover z-[6] ${LIVE_WEBRTC_VIDEO_CLASS}`}
                    autoPlay
                    playsInline
                    muted
                    controls={false}
                    poster={LIVE_VIDEO_TRANSPARENT_POSTER}
                    style={{
                      opacity: camOff ? 0 : 1,
                      transition: 'opacity 0.3s ease',
                      backgroundColor: '#080A0E',
                    }}
                  />
                  <button
                    type="button"
                    title="Put on big screen"
                    onClick={(e) => { e.stopPropagation(); toggleFeaturedUser(h.userId); }}
                    className="absolute top-0.5 left-0.5 z-10 rounded bg-black/55 p-0.5 border border-[#D8D9DD]/45 pointer-events-auto active:scale-95"
                  >
                    <ArrowLeftRight className="w-3 h-3 text-[#F5F5F7]" strokeWidth={2.5} />
                  </button>
                  <p className="absolute bottom-0.5 left-0.5 z-10 text-white/80 text-[8px] font-bold bg-black/50 rounded px-1 truncate max-w-[90%]">{h.name}</p>
                  {(lastGiftIcon || score > 0) && (
                    <div className="absolute bottom-0.5 right-0.5 z-10 flex items-center pointer-events-none">
                      {lastGiftIcon && (
                        <div className="w-5 h-5 rounded-full bg-[rgba(0,0,0,0.35)] border border-[#D8D9DD]/40 overflow-hidden flex items-center justify-center drop-shadow-md z-10 relative">
                          <img src={lastGiftIcon} alt="gift" className="w-full h-full object-cover" />
                        </div>
                      )}
                      {score > 0 && (
                        <div
                          className={`h-4 flex items-center rounded-full text-[8px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] relative z-0 bg-black/35 backdrop-blur-md border border-[#2A2D33] ${lastGiftIcon ? '-ml-2 pl-3 pr-1.5' : 'px-1.5'}`}
                        >
                          {formatCohostGiftScore(score)}
                        </div>
                      )}
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute inset-0 z-[5] pointer-events-none border-2 border-[#D8D9DD]" />
                  )}
                </>
              );
            }
            if (slot.type === 'invited' && slot.host) {
              return (
                <>
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-[rgba(0,0,0,0.35)]">
                    {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover opacity-60" /> : <div className="w-full h-full flex items-center justify-center text-[#F5F5F7]/60 text-base font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                  </div>
                  <p className="text-white/60 text-[9px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                  <span className="text-[#F5F5F7]/70 text-[8px] font-semibold">Waiting</span>
                </>
              );
            }
            if (slot.type === 'pending' && slot.host) {
              return (
                <>
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-[rgba(0,0,0,0.35)]">
                    {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[#F5F5F7] text-sm font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                  </div>
                  <p className="text-white text-[8px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                  <span className="text-[#F5F5F7]/70 text-[8px] font-semibold">Pending</span>
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
          const featuredLive = featuredUserId
            ? liveCoHosts.find((h) => sameUserId(h.userId, featuredUserId)) || null
            : null;
          const hostIdForSpeak = hostUserIdRef.current || hostUserId || effectiveStreamId;
          const bigSpeaking = featuredLive
            ? isSpeakingUser(featuredLive.userId)
            : isSpeakingUser(hostIdForSpeak) || isSpeakingUser(effectiveStreamId);

          return (
            <div
              className={`absolute left-0 right-0 z-0 bg-transparent flex flex-row overflow-hidden rounded-none`}
              style={(showGrid || spectatorBattle?.active)
                ? { top: 'calc(env(safe-area-inset-top, 0px) + 78px + 6mm)', height: 'calc(36dvh + 10mm)' }
                : { top: '0px', bottom: '0px' }
              }
            >
              <div ref={spectatorStageRef} className="relative flex w-full h-full min-h-0 flex-row overflow-hidden rounded-none">
              {/* Left: host video (or featured co-host) — tap/double-tap to like (Aprecieri); hearts render in chat panel */}
              <div
                className={`touch-manipulation overflow-hidden rounded-none min-w-0 relative ${showGrid || spectatorBattle?.active ? 'w-1/2 border border-[#C9A96E]/40' : 'w-full'} ${bigSpeaking ? 'elix-speaking-pulse' : ''}`}
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
                  const hostCamOff =
                    [...remoteCamOff].some((id) => sameUserId(id, hostId) || sameUserId(id, effectiveStreamId));
                  return (
                    <>
                <video
                  ref={videoRef}
                  className={`absolute inset-0 w-full h-full object-cover rounded-none z-[6] ${LIVE_WEBRTC_VIDEO_CLASS}`}
                  playsInline
                  autoPlay
                  muted
                  controls={false}
                  poster={LIVE_VIDEO_TRANSPARENT_POSTER}
                  style={{
                    opacity: featuredLive ? 0 : (hasStream && !hostCamOff ? 1 : 0),
                    transition: 'opacity 0.4s ease',
                    backgroundColor: '#080A0E',
                    pointerEvents: featuredLive ? 'none' : undefined,
                  }}
                />
                {featuredLive && (
                  <>
                    <video
                      ref={featuredBigVideoRef}
                      className={`absolute inset-0 w-full h-full object-cover rounded-none z-[7] ${LIVE_WEBRTC_VIDEO_CLASS}`}
                      playsInline
                      autoPlay
                      muted
                      controls={false}
                      poster={LIVE_VIDEO_TRANSPARENT_POSTER}
                      style={{ backgroundColor: '#080A0E' }}
                    />
                    <button
                      type="button"
                      title="Back to host on big screen"
                      onClick={(e) => { e.stopPropagation(); setFeaturedUserId(null); }}
                      className="absolute top-1 left-1 z-20 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/60 border border-[#D8D9DD]/50 pointer-events-auto active:scale-95"
                    >
                      <ArrowLeftRight className="w-3 h-3 text-[#F5F5F7]" strokeWidth={2.5} />
                      <span className="text-[8px] font-bold text-[#F5F5F7]">Host</span>
                    </button>
                    <span className="absolute bottom-1 left-1 z-20 text-white/90 text-[9px] font-bold bg-black/55 rounded px-1 truncate max-w-[90%]">
                      {featuredLive.name}
                    </span>
                  </>
                )}
                {hostCamOff && !featuredLive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 elix-panel z-[5]">
                    {hostAvatar ? (
                      <img src={hostAvatar} alt="" className="w-16 h-16 rounded-full object-cover object-center border-2 border-[#D8D9DD]/40" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center border-2 border-[#D8D9DD]/40">
                        <span className="text-[#F5F5F7] font-bold text-2xl">{hostName.slice(0, 1).toUpperCase()}</span>
                      </div>
                    )}
                    <span className="text-white font-bold text-sm">{hostName}</span>
                  </div>
                )}
                {!hasStream && !hostCamOff && !featuredLive && (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4" style={{ transform: 'translateX(15mm)' }}>
                    <div className="w-24 h-24 rounded-full overflow-hidden">
                      {hostAvatar ? (
                        <img src={hostAvatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-white/10 flex items-center justify-center">
                          <span className="text-[#F5F5F7] font-bold text-3xl">{hostName.slice(0, 1).toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                    {!user?.id ? (
                      <>
                        <span className="text-white/80 text-sm text-center">Log in to watch the live stream</span>
                        <button
                          type="button"
                          onClick={() => navigate('/login', { state: { from: `/watch/${effectiveStreamId}` } })}
                          className="mt-2 px-5 py-2.5 rounded-lg bg-[#E6E9EE] text-white elix-accent font-semibold text-sm"
                        >
                          Log in
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
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
                            className="mt-2 px-5 py-2 rounded-lg bg-white/10 border border-[#D8D9DD]/40 text-[#F5F5F7] text-sm font-medium"
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
                      (slot.type === 'host_main' && (isSpeakingUser(hostIdForSpeak) || isSpeakingUser(effectiveStreamId))) ||
                      (slot.type === 'self' && isSpeakingUser(user?.id)) ||
                      (slot.type === 'live' && !!slot.host && isSpeakingUser(slot.host.userId));
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
                        className={`relative bg-[rgba(0,0,0,0.35)] flex flex-col items-center justify-center overflow-hidden p-0 min-h-0 border border-[#C9A96E]/40 ${cellSpeaking ? 'elix-speaking-pulse' : ''} ${liveHost ? 'cursor-pointer' : ''}`}
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
        <div
          className={`absolute top-0 left-0 right-0 z-[110] pointer-events-none overflow-hidden elix-live-top-chrome ${spectatorBattle?.active ? 'elix-battle-top-fundal' : ''}`}
          style={
            spectatorBattle?.active
              ? undefined
              : {
                  backgroundColor: 'transparent',
                  backgroundImage: 'none',
                }
          }
        >
          <div className="px-3 pb-1.5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}>
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
                  showFollow={!user?.id || !hostUserId || user.id !== hostUserId}
                  isFollowing={isFollowing}
                  onAvatarClick={() => navigate(`/profile/${hostUserId}`)}
                  onLike={(e) => {
                    handleLikeTap(e);
                  }}
                  onFollow={(e) => {
                    e.stopPropagation();
                    followHost(e);
                  }}
                  joinSlot={
                    <LiveJoinPill
                      hasJoinedToday={hasJoinedToday}
                      onJoin={(e) => {
                        void sendMembershipHeartJoin(e);
                      }}
                    />
                  }
                />
              </div>
              </div>

              <div className="pointer-events-auto flex items-center gap-[0mm] mt-1">
                {mvpSlots.global.length > 0 ? (
                  <div
                    className="flex items-center gap-[0mm] pointer-events-auto flex-shrink-0"
                    style={{ transform: 'translateX(-2mm)' }}
                    title="Top viewers & gifters"
                    onClick={() => {
                      const ranked = [...mvpSlots.global]
                        .filter((s) => (s.points ?? 0) > 0)
                        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
                      const list = (ranked.length > 0 ? ranked : mvpSlots.global).map((s) => ({
                        id: s.id,
                        name: s.name,
                        avatar: s.avatar,
                        level: s.level,
                        points: s.points ?? 0,
                      }));
                      setViewersList(list);
                      setShowViewersPanel(true);
                    }}
                  >
                    {mvpSlots.global.slice(0, 3).map((slot, i) => {
                      const isMvp = i === 0 && (slot.points ?? 0) > 0;
                      return (
                        <div
                          key={`spectator-top-mvp-${slot.id}`}
                          className="relative"
                          style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '-1.5mm' }}
                        >
                          <div className={isMvp ? 'rounded-full shadow-[0_0_3px_0_rgba(230,233,238,0.30)]' : 'rounded-full'}>
                            <AvatarRing
                              src={resolveCircleAvatar(slot.avatar, slot.name)}
                              alt={slot.name || ''}
                              size={LIVE_MVP_PROFILE_RING_PX}
                            />
                          </div>
                          {isMvp && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#E6E9EE] text-white elix-accent text-[6px] font-black leading-none tracking-wide">
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
                  <UserPlus size={16} className="text-[#F5F5F7]" strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  title="Leave stream"
                  onClick={leaveStreamWithSlide}
                  className="p-1 active:scale-95 transition-transform"
                  aria-label="Close"
                >
                  <RoyceCloseIcon size={18} />
                </button>
              </div>
            </div>

            {/* Capsules right-aligned — left clear for battle gloves */}
            <LiveMarkedSubHeaderBar
              rank={diamondLeagueRank}
              onDiamond={() => {
                setShowGiftPanel(false);
                setRankingInitialTab('daily');
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
              showGiftGoal
              giftGoal={giftGoal}
              onGiftGoal={() => {
                setShowGiftPanel(false);
                setRankingInitialTab('goal');
                setShowRankingPanel(true);
              }}
              showFollow={Boolean(user?.id && hostUserId && user.id !== hostUserId && !isFollowing)}
              onFollow={(e) => {
                e.stopPropagation();
                followHost(e);
              }}
              showMembership={false}
            />
          </div>
        </div>

        {/* CHAT — same pattern as LiveStream (!isBroadcast): scroll area tap sends like on empty space */}
        <div
          className="chat-zone fixed left-0 right-0 z-[100] flex justify-center pointer-events-none overflow-x-hidden"
          style={{
            bottom: LIVE_BOTTOM_ACTION_RESERVE,
            transform: spectatorBattle?.active ? `translateY(${LIVE_BATTLE_CHAT_SHIFT_Y})` : undefined,
          }}
        >
          <div
            className={`w-full max-w-[480px] relative min-w-0 overflow-x-hidden ${spectatorBattle?.active ? 'elix-battle-chat-fundal' : 'bg-transparent'}`}
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
              className="relative z-[10] h-full overflow-y-auto overflow-x-hidden pointer-events-auto bg-transparent px-1"
              style={{ transform: 'none', visibility: isChatVisible ? 'visible' : 'hidden' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.target instanceof Element) {
                  const interactive = e.target.closest(
                    'button, a, input, textarea, select, [role="button"], [data-live-chat-msg]',
                  );
                  if (interactive) return;
                }
                handleLikeTap(e);
              }}
            >
              {isChatVisible ? (
              <ChatOverlay
                messages={messages}
                variant="panel"
                compact={!!spectatorBattle?.active}
                isModerator={isModerator}
                onLike={handleLikeTap}
                onProfileTap={(username) => {
                  // Stay on live. Navigating to /profile or /search was removing
                  // spectators from the stream when they tapped chat while liking.
                  const name = String(username || '').trim();
                  if (!name) return;
                  showToast(`@${name}`);
                }}
              />
              ) : null}
            </div>
          </div>
        </div>

        {/* Mission dock (combo button is separate — TikTok pink round tap) */}
        <LiveComboMissionDock
          combo={null}
          mission={
            <LiveSideMissionStack
              embedded
              missions={{
                      watchMin: missionWatchMin,
                      watchGoal: missionWatchGoal,
                      giftsSent: missionGiftsSent,
                      giftsGoal: missionGiftsGoal,
                      battleJoined: spectatorBattle?.active ? 1 : 0,
                      battleGoal: 1,
                      claimable: false as const,
                    }}
              supporters={
                mvpSlots.global.length === 0
                    ? []
                    : mvpSlots.global.slice(0, 3).map((s) => ({
                      id: s.id,
                      name: s.name,
                      avatar: s.avatar,
                      points: s.points ?? 0,
                    }))
              }
              battlePassLevel={userLevel || 1}
              battlePassXp={userXP % 1000}
              battlePassXpMax={1000}
              onViewAllSupporters={() => {
                const ranked = [...mvpSlots.global]
                  .filter((s) => (s.points ?? 0) > 0)
                  .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
                const list = (ranked.length > 0 ? ranked : mvpSlots.global).map((s) => ({
                  id: s.id,
                  name: s.name,
                  avatar: s.avatar,
                  level: s.level,
                  points: s.points ?? 0,
                }));
                setViewersList(list);
                setShowViewersPanel(true);
              }}
              onOpenMissions={() => {
                setEngagementPanel('missions');
                setEngagementOpen(true);
              }}
              onBattlePass={() => {
                setRankingInitialTab('weekly');
                setShowRankingPanel(true);
              }}
            />
          }
        />

        {/* Combo — TikTok-style round combo tap (restored from Jul 16) */}
        {showComboButton && lastSentGift && (
          <div className="fixed left-0 right-0 bottom-[calc(58px+max(2px,env(safe-area-inset-bottom,0px)))] z-[50061] flex justify-center pointer-events-none">
            <div className="w-full max-w-[480px] mx-auto px-3 flex justify-end pointer-events-auto">
              <button
                type="button"
                onClick={handleComboClick}
                disabled={comboCount >= GIFT_COMBO_MAX}
                className="w-[72px] h-[72px] rounded-full bg-gradient-to-b from-[#FFFFFF] to-[#E6E9EE] flex flex-col items-center justify-center active:scale-90 transition-transform shadow-[0_0_18px_rgba(111,63,245,0.55)] border-2 border-white/30 disabled:opacity-50"
              >
                {typeof lastSentGift.icon === 'string' && (lastSentGift.icon.startsWith('http') || lastSentGift.icon.startsWith('/')) ? (
                  <img src={lastSentGift.icon} alt="" className="w-7 h-7 object-contain mb-0.5" draggable={false} />
                ) : null}
                <span className={`font-black italic text-white drop-shadow-md leading-none ${comboCount >= 1000 ? 'text-sm' : 'text-xl'}`}>
                  x{comboCount >= 1000 ? `${(comboCount / 1000).toFixed(comboCount % 1000 === 0 ? 0 : 1)}K` : comboCount}
                </span>
              </button>
            </div>
          </div>
        )}

{/* Bottom bar — above gift video so Gift/Invite/Share/More stay tappable */}
        <div
          className="fixed left-0 right-0 bottom-0 z-[50002] pointer-events-none flex justify-center"
        >
          <div
            className={`pointer-events-auto w-full max-w-[480px] px-3 pt-0 ${spectatorBattle?.active ? 'elix-battle-lower-fundal' : 'bg-transparent'}`}
            style={{ paddingBottom: LIVE_BOTTOM_ACTION_PADDING }}
          >
            <div className="flex items-end gap-2 w-full max-w-[480px] pointer-events-auto">
              <form
                className="flex-1 flex items-center gap-2 bg-black/35 backdrop-blur-sm rounded-full px-3 py-2 border border-[#2A2D33] h-10 min-w-0"
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
                  <button type="submit" title="Send message" className="text-[#F5F5F7] flex-shrink-0">
                    <Send size={16} />
                  </button>
                ) : null}
              </form>
              <div className="flex items-end gap-2 flex-shrink-0" style={{ transform: 'translateX(4mm)' }}>
              <button
                type="button"
                title="Poll"
                onClick={() => {
                  if (engagementState.poll) {
                    window.dispatchEvent(new Event('elix-open-live-poll'));
                  } else {
                    showToast('No active poll right now');
                  }
                }}
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-sm border border-[#2A2D33]">
                  <BarChart3 size={20} className="text-[#A7A7AD] shrink-0" strokeWidth={2.2} />
                </div>
                <span className="elix-silver-red-text text-[10px] font-semibold mt-0.5">Poll</span>
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
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-sm border border-[#2A2D33]">
                  <span className="flex items-center justify-center w-full h-full relative z-[2]">
                    <UserPlus
                      size={20}
                      className="text-[#F5F5F7] shrink-0"
                      strokeWidth={2}
                      style={{ transform: 'translateX(0.5mm)' }}
                    />
                  </span>
                </div>
                <span className="elix-silver-red-text text-[10px] font-semibold mt-0.5">
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
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-sm border border-[#2A2D33]">
                  <Gift size={20} className="text-[#F5F5F7] relative z-[2]" />
                </div>
                <span className="elix-silver-red-text text-[10px] font-semibold mt-0.5">Gift</span>
              </button>
              <button
                type="button"
                title="Share"
                onClick={() => setShowSharePanel(true)}
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-sm border border-[#2A2D33]">
                  <Share2 size={20} className="text-[#F5F5F7] relative z-[2]" />
                </div>
                <span className="elix-silver-red-text text-[10px] font-semibold mt-0.5">Share</span>
              </button>
              <button
                type="button"
                title="More options"
                onClick={() => setIsMoreMenuOpen(true)}
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-sm border border-[#2A2D33]">
                  <MoreVertical size={20} className="text-[#F5F5F7] relative z-[2]" />
                </div>
                <span className="elix-silver-red-text text-[10px] font-semibold mt-0.5">More</span>
              </button>
              </div>
            </div>
          </div>
        </div>

        <GiftAnimationOverlay streamId={effectiveStreamId} />
        {/* Separate photo feed (cards + xN) — does not replace gift video animation */}
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
              <span key={g.key} className="relative flex items-center justify-center w-11 h-11 rounded-full elix-panel border border-[#E6E9EE] shadow-2xl text-[#E6E9EE] animate-in zoom-in-50 duration-200">
                <GloveIcon className="w-7 h-7" />
                {g.count > 1 && (
                  <span className="absolute -top-1 -right-1 text-[9px] font-black leading-none px-1 rounded-full bg-[#E6E9EE] text-white elix-accent border border-black/40">{g.count}</span>
                )}
                {g.multiplier > 0 && (
                  <span className="absolute -bottom-1 -right-1 text-[9px] font-black leading-none px-1 rounded-full bg-black text-[#E6E9EE] border border-[#E6E9EE]/60">x{g.multiplier}</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Glove "caught" popup — server-synced to all clients when a gift is caught */}
        {boosterCatches.length > 0 && (
          <div className="fixed inset-x-0 top-[30%] z-[100000] flex flex-col items-center gap-2 pointer-events-none px-4">
            {boosterCatches.map((c) => (
              <div key={c.id} className="booster-catch-pop flex items-center gap-2 px-4 py-2 rounded-full elix-panel border border-[#D8D9DD] shadow-2xl">
                <GloveIcon className="w-5 h-5 text-[#F5F5F7]" />
                <span className="text-[#F5F5F7] font-black text-base tracking-wide">x{c.multiplier} CAUGHT!</span>
                <span className="text-white font-bold text-sm">+{c.finalPoints}</span>
              </div>
            ))}
          </div>
        )}

        {/* Gift video — same GiftOverlay as creator live (default z 50000).
            Combo/bottom icons use 50001+ so they stay above the gift. */}
        <GiftOverlay
          key={`gift-${giftKey}`}
          videoSrc={currentGift?.video ?? null}
          onEnded={handleGiftEnded}
          isBattleMode={!!spectatorBattle?.active}
          battleSide={currentGift?.battleSide ?? null}
          muted={false}
        />


        {/* ═══ BATTLE INVITE BANNER — a watching creator was invited into the battle.
             Join takes them to the live battle page as a player, not a spectator. */}
        {pendingBattleInvite && (
          <div className="fixed left-0 right-0 z-[100000] pointer-events-none flex justify-center px-3" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 64px)' }}>
            <div className="pointer-events-auto w-full max-w-[440px] flex items-center gap-2.5 py-1 px-2 rounded-full elix-panel backdrop-blur-md border border-[#D8D9DD]/40 shadow-2xl">
              <div
                className="rounded-full overflow-hidden bg-[rgba(0,0,0,0.35)] flex-shrink-0"
                style={{ width: SHARE_PANEL_AVATAR_PX, height: SHARE_PANEL_AVATAR_PX }}
              >
                {pendingBattleInvite.hostAvatar ? (
                  <img src={pendingBattleInvite.hostAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#F5F5F7] font-bold">{pendingBattleInvite.hostName.slice(0, 1).toUpperCase()}</div>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-white text-xs font-semibold truncate">@{pendingBattleInvite.hostName}</p>
                <p className="text-white/40 text-[10px]">invited you to battle</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button type="button" onClick={declineBattleInviteFromWatch} className="h-6 px-3 rounded-full bg-red-500/25 border border-red-400/50 inline-flex items-center justify-center active:scale-95 transition-transform">
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
            <div className="fixed inset-0 z-[99998] bg-black/35 pointer-events-auto" onClick={() => { setShowCoHostPanel(false); }} />
            <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
              <div className="elix-panel backdrop-blur-md rounded-t-2xl h-[40vh] flex flex-col shadow-2xl overflow-hidden pb-safe" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col px-4 pt-2 pb-2 border-b border-white/10 flex-shrink-0">
                  <div className="flex justify-center pb-2" aria-hidden>
                    <div className="w-10 h-1 rounded-full bg-white/25" />
                  </div>
                  <span className="text-[#F5F5F7] font-bold text-sm text-center w-full">Co-Host</span>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0 flex flex-col gap-4">
                  {pendingCoHostInvite ? (
                    <div className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg bg-white/[0.03] flex-shrink-0">
                      <div
                        className="rounded-full overflow-hidden bg-[rgba(0,0,0,0.35)] flex-shrink-0"
                        style={{ width: SHARE_PANEL_AVATAR_PX, height: SHARE_PANEL_AVATAR_PX }}
                      >
                        {pendingCoHostInvite.hostAvatar ? <img src={pendingCoHostInvite.hostAvatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[#F5F5F7] font-bold">{pendingCoHostInvite.hostName.slice(0, 1).toUpperCase()}</div>}
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
                            cohostInviteAccept({ hostUserId: inv.hostUserId, cohostName: user?.username || user?.name || 'User', cohostAvatar: user?.avatar || '', streamKey: user?.id || effectiveStreamId });
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
                        className={`w-full py-3 rounded-xl font-bold text-sm ${joinRequested ? 'bg-white/10 text-white/40 cursor-not-allowed' : 'bg-[#E6E9EE] text-white elix-accent active:scale-95'}`}
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
              className="fixed inset-0 bg-black/35 pointer-events-auto"
              style={{ zIndex: 99998 }}
              onClick={() => setShowFanClub(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
              <div
                className="elix-panel rounded-t-2xl p-3 pb-safe h-[40vh] overflow-y-auto no-scrollbar shadow-2xl w-full "
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col px-1 pt-0 pb-2 border-b border-white/10">
                  <div className="flex justify-center pb-2" aria-hidden>
                    <div className="w-10 h-1 rounded-full bg-white/25" />
                  </div>
                  <span className="text-[#F5F5F7] font-bold text-sm text-center w-full">Super Fan Goal</span>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
                  <div className="flex flex-col gap-3">
                    <div className="bg-gradient-to-r from-[#D8D9DD]/10 to-[#E6E9EE]/5 rounded-xl p-3 border border-[#D8D9DD]/20 relative overflow-hidden">
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h3 className="text-gold-metallic font-bold text-xs">Membership</h3>
                            <p className="text-white/50 text-[9px]">Unlock photo stickers & exclusive perks</p>
                          </div>
                          <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center border border-[#D8D9DD]/30">
                            <Heart className="w-2.5 h-2.5 text-[#F5F5F7] fill-[#FFFFFF] animate-pulse" />
                          </div>
                        </div>
                        <div className="flex items-end gap-1 mb-2">
                          <span className="text-lg font-black text-gold-metallic">£9.00</span>
                          <span className="text-white/40 text-[10px] font-medium mb-0.5">/ month</span>
                        </div>
                        <button
                          onClick={handleSubscribe}
                          disabled={isSubscribing}
                          className="w-full py-2 bg-gradient-to-r from-[#D8D9DD] to-[#D8D9DD] text-black font-bold text-[10px] uppercase tracking-wide rounded-xl active:scale-[0.98] transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
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
                    <div className="bg-white/5 rounded-xl p-3 border border-[#D8D9DD]/20">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-gold-metallic font-bold text-[10px] flex items-center gap-1">
                          <div className="w-4 h-4 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center border border-[#D8D9DD]/40">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          </div>
                          Photo Stickers
                        </h3>
                        <span className="bg-white/5 text-[#F5F5F7] text-[7px] font-bold px-1.5 py-0.5 rounded-full border border-[#D8D9DD]/20">SUBSCRIBER ONLY</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {['🔥', '💎', '👑', '🚀', '💯', '🎉', '💖', '👀'].map((emoji, i) => (
                          <button
                            key={i}
                            className="aspect-square rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center text-sm border border-[#D8D9DD]/10 relative overflow-hidden group"
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
                              <div className="absolute inset-0 bg-[rgba(0,0,0,0.35)]/60 backdrop-blur-[1px] flex items-center justify-center">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              </div>
                            )}
                          </button>
                        ))}
                        <button
                          className="aspect-square rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center border border-[#D8D9DD]/10 relative overflow-hidden group"
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
                            <PlusCircle size={12} className="text-[#F5F5F7]/50 group-hover:text-[#F5F5F7] transition-colors" />
                            <span className="text-[6px] text-[#F5F5F7]/50 font-bold uppercase">Upload</span>
                          </div>
                          {!isMember && (
                            <div className="absolute inset-0 bg-[rgba(0,0,0,0.35)]/60 backdrop-blur-[1px] flex items-center justify-center">
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
              onClick={() => { setShowGiftPanel(false); setSelectedCohostGiftUserId(null); }}
            />
            <div
              className="fixed bottom-0 left-0 right-0 pointer-events-auto max-w-[480px] mx-auto overflow-x-hidden touch-pan-y"
              style={{ zIndex: 99999, touchAction: 'pan-y' }}
              onTouchMove={(e) => e.stopPropagation()}
            >
              {spectatorBattle?.active && (
                <div className="px-3 pb-2 pt-1 flex items-center justify-center gap-2 elix-panel rounded-t-xl">
                  <div className="flex rounded-full overflow-hidden border border-[#D8D9DD]/40">
                    <button
                      type="button"
                      title="Gift left side"
                      onClick={() => setSpectatorGiftBattleTarget('host')}
                      className={`px-4 py-1.5 text-[10px] font-bold transition-colors ${spectatorGiftBattleTarget === 'host' ? 'bg-[#E6E9EE]/90 text-white' : 'bg-[rgba(0,0,0,0.35)] text-white/70'}`}
                    >
                      Left
                    </button>
                    <button
                      type="button"
                      title="Gift right side"
                      onClick={() => setSpectatorGiftBattleTarget('opponent')}
                      className={`px-4 py-1.5 text-[10px] font-bold transition-colors ${spectatorGiftBattleTarget === 'opponent' ? 'bg-[#1E90FF]/90 text-white' : 'bg-[rgba(0,0,0,0.35)] text-white/70'}`}
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
                            liveBoosterActivated({ multiplier: m });
                          }}
                          className={`relative flex items-center justify-center w-9 h-9 rounded-full border transition-colors active:scale-90 ${isActive ? 'bg-[#E6E9EE] border-[#D8D9DD] text-white elix-accent' : anyActive ? 'bg-[rgba(0,0,0,0.35)] border-[#D8D9DD]/30 text-white/30' : 'bg-[rgba(0,0,0,0.35)] border-[#D8D9DD]/60 text-[#F5F5F7]'}`}
                        >
                          <GloveIcon className="w-5 h-5" />
                          <span className="absolute -bottom-1 -right-1 text-[8px] font-black leading-none px-1 rounded-full bg-black text-[#F5F5F7] border border-[#D8D9DD]/60">x{m}</span>
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
                            liveMistActivated({ target: spectatorGiftBattleTarget });
                          }}
                          className={`flex items-center justify-center w-9 h-9 rounded-full border transition-colors active:scale-90 ${mistActive ? 'bg-[#E6E9EE] border-[#D8D9DD] text-white elix-accent' : 'bg-[rgba(0,0,0,0.35)] border-[#D8D9DD]/60 text-[#F5F5F7]'}`}
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
                promotionalCoins={promotionalCoinBalance}
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
              className="fixed inset-0 bg-black/35 pointer-events-auto"
              style={{ zIndex: 99998 }}
              onClick={() => setShowViewersPanel(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-[999999] pointer-events-auto max-w-[480px] mx-auto">
              <div className="elix-panel backdrop-blur-md rounded-t-2xl h-[40vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="relative flex flex-col px-4 pt-2 pb-2 border-b border-white/10 flex-shrink-0">
                  <div className="flex justify-center pb-2" aria-hidden>
                    <div className="w-10 h-1 rounded-full bg-white/25" />
                  </div>
                  <h3 className="text-[#F5F5F7] font-bold text-sm text-center w-full">Top viewers & gifters</h3>
                  <div className="absolute right-4 top-[28px] flex items-center gap-1">
                    <Eye size={12} className="text-white/50" />
                    <span className="text-white/60 text-xs font-semibold">{viewersList.length || viewerCount}</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4">
                  <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider mb-1.5">MVP · Gift coins this live</p>
                  {viewersList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <Eye size={28} className="text-white/10" />
                      <p className="text-white/40 text-sm">No gifters yet</p>
                    </div>
                  ) : (
                    viewersList.map((v, i) => {
                      const gifted = Math.max(0, Number(v.points) || 0);
                      const rawName = String(v.name || '').trim();
                      const label = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawName)
                        ? rawName.split('@')[0] || 'User'
                        : rawName || 'User';
                      const isMvp = i === 0 && gifted > 0;
                      return (
                      <button
                        key={v.id}
                        type="button"
                        className="flex items-center gap-3 w-full py-2.5 active:bg-white/5 rounded-xl transition-colors"
                        onClick={() => { setShowViewersPanel(false); navigate(`/profile/${v.id}`); }}
                      >
                        <span className="text-white/30 text-xs font-bold w-5 text-right">{i + 1}</span>
                        <div className="relative flex-shrink-0">
                          <div className={isMvp ? 'rounded-full shadow-[0_0_3px_0_rgba(230,233,238,0.30)]' : 'rounded-full'}>
                            <AvatarRing
                              src={resolveCircleAvatar(v.avatar, label)}
                              alt={label}
                              size={LIVE_MVP_PROFILE_RING_PX}
                            />
                          </div>
                          {isMvp ? (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#E6E9EE] text-white elix-accent text-[6px] font-black leading-none tracking-wide">
                              MVP
                            </span>
                          ) : null}
                        </div>
                        <LevelBadge
                          level={typeof v.level === 'number' ? v.level : 1}
                          layout="fixed"
                          hideCircle
                        />
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-white text-sm font-semibold truncate">{label}</p>
                          <p className="text-white/40 text-[10px] font-medium">{gifted > 0 ? 'Top gifter' : 'Viewer'}</p>
                        </div>
                        <span className="text-[#F5F5F7] text-xs font-bold tabular-nums flex-shrink-0">
                          {formatCohostGiftScore(gifted)}
                        </span>
                      </button>
                      );
                    })
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
              className="fixed inset-0 bg-black/35 pointer-events-auto"
              style={{ zIndex: 99998 }}
              onClick={() => setShowSharePanel(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
              <div className="elix-panel backdrop-blur-md rounded-t-2xl p-3 pb-safe flex flex-col shadow-2xl w-full h-[40vh] overflow-hidden ">
                <div className="relative flex flex-col px-1 pt-0 pb-2 border-b border-white/10 flex-shrink-0">
                  <div className="flex justify-center pb-2" aria-hidden>
                    <div className="w-10 h-1 rounded-full bg-white/25" />
                  </div>
                  <div className="absolute left-2 top-0 flex items-center gap-1 z-10">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                      <Search className="w-3.5 h-3.5 text-white/30" />
                    </div>
                    <input
                      value={shareQuery}
                      onChange={(e) => setShareQuery(e.target.value)}
                      placeholder="Search..."
                      className="bg-transparent text-white text-xs outline-none w-[72px] placeholder:text-white/20"
                      aria-label="Search"
                    />
                  </div>
                  <h3 className="text-[#F5F5F7] font-bold text-sm text-center w-full">Share to</h3>
                </div>
                <div className="flex flex-col flex-1 min-h-0">
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
                            const { data: _j, error: shareErr } = await apiLiveShareCreate({
                              targetUserId: u.id,
                              streamKey: effectiveStreamId,
                              hostUserId: hid,
                              hostName,
                              hostAvatar,
                              sharerName: user?.username || user?.name || 'Someone',
                              sharerAvatar: user?.avatar || '',
                            });
                            if (shareErr) {
                              showToast(shareErr || 'Could not share');
                              return;
                            }
                            if (effectiveStreamId) {
                              earnBattleEnergyQuiet('share', effectiveStreamId);
                              void apiLiveEngagementProgress({
                                metric: 'shares',
                                delta: 1,
                                roomId: effectiveStreamId,
                              }).catch(() => {});
                            }
                            showToast(`Shared live with ${u.name}`);
                          } catch {
                            showToast('Could not share');
                          }
                        }}
                      >
                        <div
                          className="rounded-full overflow-hidden bg-[#1A1A1F] flex-shrink-0"
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
                <div className="mx-4 border-t border-[#D8D9DD]/45 flex-shrink-0" aria-hidden />
                {/* Action icons only — 4mm below the line */}
                <div className="flex-1 overflow-y-scroll overflow-x-hidden min-h-0 px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:bg-[#313845] [&::-webkit-scrollbar-thumb]:rounded-full" style={{ paddingTop: '4mm' }}>
                  {/* Share creator's live: all links use /watch/{creatorStreamId} */}
                  <div className="grid grid-cols-5 gap-y-3 gap-x-1.5 pt-0">
                    {[
                      { name: 'WhatsApp', icon: <MessageCircle size={22} className="text-white" />, action: () => { openExternalLink(`https://wa.me/?text=${encodeURIComponent('Watch this on Elix! ' + `${window.location.origin}/watch/${effectiveStreamId}`)}`); if (effectiveStreamId) { earnBattleEnergyQuiet('share', effectiveStreamId); void apiLiveEngagementProgress({ metric: 'shares', delta: 1, roomId: effectiveStreamId }).catch(() => undefined); } setShowSharePanel(false); } },
                      { name: 'Facebook', icon: <Share2 size={22} className="text-white" />, action: () => { openExternalLink(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}/watch/${effectiveStreamId}`)}`); if (effectiveStreamId) { earnBattleEnergyQuiet('share', effectiveStreamId); void apiLiveEngagementProgress({ metric: 'shares', delta: 1, roomId: effectiveStreamId }).catch(() => undefined); } setShowSharePanel(false); } },
                      { name: 'Copy Link', icon: <Copy size={22} className="text-white" />, action: () => { navigator.clipboard.writeText(`${window.location.origin}/watch/${effectiveStreamId}`); if (effectiveStreamId) { earnBattleEnergyQuiet('share', effectiveStreamId); void apiLiveEngagementProgress({ metric: 'shares', delta: 1, roomId: effectiveStreamId }).catch(() => undefined); } showToast('Link copied!'); setShowSharePanel(false); } },
                      { name: 'Repost live', icon: <RefreshCw size={22} className="text-white" />, action: async () => {
                        const url = `${window.location.origin}/watch/${effectiveStreamId}`;
                        const ok = await nativeShareUrl({ title: 'Repost live on Elix', text: 'Watch this LIVE on Elix!', url });
                        if (ok && effectiveStreamId) {
                          earnBattleEnergyQuiet('share', effectiveStreamId);
                          void apiLiveEngagementProgress({ metric: 'shares', delta: 1, roomId: effectiveStreamId }).catch(() => undefined);
                          showToast('Live ready to repost');
                        } else if (!ok) {
                          showToast('Could not open repost share');
                        }
                        setShowSharePanel(false);
                      } },
                      { name: 'Promote', icon: <TrendingUp size={22} className="text-white" />, action: () => { setShowSharePanel(false); setShowPromotePanel(true); } },
                      { name: 'Report', icon: <Flag size={22} className="text-white/60" />, isRed: true, action: () => { setIsReportModalOpen(true); setShowSharePanel(false); } },
                    ].map((item) => (
                      <button key={item.name} onClick={item.action} className="flex flex-col items-center gap-1 active:scale-95 transition-transform">
                        <div
                          className="relative royce-glow-disc flex-shrink-0"
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

        {/* MORE MENU — same panel layout/style as creator More */}
        {isMoreMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/35 pointer-events-auto"
              style={{ zIndex: 99998 }}
              onClick={() => setIsMoreMenuOpen(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
              <div
                className="relative elix-panel rounded-t-2xl pb-safe h-[40vh] overflow-y-auto no-scrollbar shadow-2xl w-full"
                onClick={(e) => e.stopPropagation()}
              >
                {areTestCoinsEnabled() && user?.isAdmin && (
                  <button
                    type="button"
                    onClick={openTestCoinsModal}
                    className="absolute top-2.5 right-3 z-10 w-4 h-4 p-0 m-0 flex items-center justify-center"
                    aria-label="Test coins"
                    tabIndex={-1}
                  >
                    {/* Panel-coloured mark — same as More panel; password gate; never real money */}
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: 'var(--elix-panel)',
                        border: '1px solid var(--elix-border)',
                      }}
                      aria-hidden
                    />
                  </button>
                )}
                <div className="flex flex-col px-4 pt-2 pb-3 border-b border-white/10">
                  <div className="flex justify-center pb-2" aria-hidden>
                    <div className="w-10 h-1 rounded-full bg-white/25" />
                  </div>
                  <span className="text-[#F5F5F7] font-bold text-sm text-center">More Options</span>
                </div>
                <div className="grid grid-cols-4 gap-y-4 gap-x-2 pt-3 pb-2 px-3">
                  <button
                    type="button"
                    onClick={() => { setShowSharePanel(true); setIsMoreMenuOpen(false); }}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
                  >
                    <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                      <Share2 className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />
                    </div>
                    <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Share</span>
                  </button>

                  {engagementFlags.engagementHubEnabled ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEngagementPanel('hub');
                      setEngagementOpen(true);
                      setIsMoreMenuOpen(false);
                    }}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
                  >
                    <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                      <Gift className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />
                    </div>
                    <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Engagement</span>
                  </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => { setIsChatVisible((v) => !v); setIsMoreMenuOpen(false); }}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
                  >
                    <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                      <MessageCircle className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />
                    </div>
                    <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">{isChatVisible ? 'Hide Chat' : 'Show Chat'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setIsReportModalOpen(true); setIsMoreMenuOpen(false); }}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
                  >
                    <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                      <Flag className="w-[18px] h-[18px] text-white/60 relative z-[2]" strokeWidth={1.8} />
                    </div>
                    <span className="text-[10px] font-semibold text-white/60 text-center leading-tight w-full">Report</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TEST COINS MODAL — admin + server password only (mint never client-side) */}
        {areTestCoinsEnabled() && user?.isAdmin && showTestCoinsModal && (
          <>
            <div
              className="fixed inset-0 bg-black/60 pointer-events-auto"
              style={{ zIndex: 100000 }}
              onClick={closeTestCoinsModal}
            />
            <div
              className="fixed inset-0 flex items-center justify-center pointer-events-none"
              style={{ zIndex: 100001 }}
            >
              <div
                className="bg-[rgba(0,0,0,0.35)] rounded-2xl p-5 mx-6 w-full max-w-xs shadow-2xl border border-[#D8D9DD]/30 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Lock className="w-5 h-5 text-[#F5F5F7]" />
                  <span className="text-white font-bold text-base">
                    {testCoinsStep === 'password' ? 'Enter Password' : 'Add Test'}
                  </span>
                </div>

                {testCoinsStep === 'password' && (
                  <form onSubmit={(e) => { void submitTestCoinsPasswordUnlock(e); }}>
                    <input
                      ref={testCoinsPwdRef}
                      type="password"
                      autoFocus
                      value={testCoinsPwd}
                      onChange={(e) => { setTestCoinsPwd(e.target.value); setTestCoinsError(''); }}
                      placeholder="Password"
                      className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-4 py-3 border border-[#2A2D33] focus:border-[#D8D9DD]/60 focus:outline-none placeholder:text-white/30 mb-2"
                    />
                    {testCoinsError && (
                      <p className="text-white/60 text-xs mb-2">{testCoinsError}</p>
                    )}
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={closeTestCoinsModal}
                        className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/60 text-sm font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!testCoinsPwd || testCoinsBusy}
                        className="flex-1 py-2.5 rounded-xl bg-[#E6E9EE] text-white elix-accent text-sm font-bold disabled:opacity-40"
                      >
                        Unlock
                      </button>
                    </div>
                  </form>
                )}

                {testCoinsStep === 'amount' && (
                  <form onSubmit={(e) => { void submitTestCoinsAmount(e); }}>
                    <p className="text-white/40 text-xs mb-3">These coins are for testing only and have no real value.</p>
                    <div className="flex items-center gap-2 mb-2">
                      <Coins className="w-4 h-4 text-[#D9A62E]" />
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
                      className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-4 py-3 border border-[#2A2D33] focus:border-[#D8D9DD]/60 focus:outline-none placeholder:text-white/30 mb-2"
                    />
                    {testCoinsError && (
                      <p className="text-white/60 text-xs mb-2">{testCoinsError}</p>
                    )}
                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                      {[1000, 5000, 10000, 25000, 50000, 100000].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => selectTestCoinsPreset(amt)}
                          disabled={testCoinsBusy}
                          className="py-1.5 rounded-lg text-xs font-bold transition-colors bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-40"
                        >
                          {amt.toLocaleString()}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => { void addMaxTestCoinsAtOnce(); }}
                        disabled={testCoinsBusy}
                        className="py-1.5 rounded-lg text-xs font-bold transition-colors bg-[#E6E9EE]/30 text-[#F5F5F7] hover:bg-[#E6E9EE]/40 col-span-3 disabled:opacity-40"
                      >
                        Max (100M) – Charge at once
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={closeTestCoinsModal}
                        className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/60 text-sm font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!testCoinsAmount || testCoinsBusy}
                        className="flex-1 py-2.5 rounded-xl bg-[#E6E9EE] text-white elix-accent text-sm font-bold disabled:opacity-40"
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
              className="fixed inset-0 bg-black/35 pointer-events-auto"
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

        {/* Engagement Hub — side drawer only (no battle-screen widgets) */}
        <EngagementDrawer
          open={engagementOpen}
          activePanel={engagementPanel}
          liveSessionId={effectiveStreamId}
          creatorId={hostUserId || effectiveStreamId}
          onOpenChange={setEngagementOpen}
          onPanelChange={setEngagementPanel}
        />

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

