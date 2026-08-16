import React, { useEffect, useRef, useState } from 'react';
import { RoyceCloseIcon } from '../../../components/royce';
import { showToast } from '../../../lib/toast';
import { returnToFromLocationState } from '../../../lib/settingsNav';
import { formatCompactNumber } from '../../../lib/formatCompactNumber';
import {
  prepareLiveVideoEl,
  LIVE_WEBRTC_VIDEO_CLASS,
  LIVE_VIDEO_TRANSPARENT_POSTER,
} from '../../../lib/prepareLiveVideoEl';
import {
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
  PlusCircle,
  Play,
  BarChart3,
  ArrowLeftRight,
  RefreshCw,
  X,
} from 'lucide-react';
import { GiftPanel } from '../../../components/GiftPanel';
import { useWalletStore } from '../../../store/useWalletStore';
import { GiftGoalGallery } from '../../../components/GiftGoalGallery';
import { LiveEngagementOverlay } from '../../../components/LiveEngagementOverlay';
import { earnBattleEnergyQuiet } from '../../../components/BattleEnergyBoostControls';
import { EngagementDrawer } from '../../../components/engagement/EngagementDrawer';
import { engagementFlags } from '../../../config/engagementFlags';
import { GIFT_COMBO_MAX } from '../../../lib/giftsCatalog';
import { appendCapped, LIVE_CHAT_MESSAGE_CAP } from '../../../lib/liveRuntimeCaps';
import { BattleVfxOverlays, GloveIcon } from '../../../components/BattleVfxOverlays';
import { BattleTauntOverlays } from '../../../components/BattleTauntOverlays';
import { teamTotalsFromScores } from '../battle/liveBattleScore';
import { areTestCoinsEnabled } from '../../../lib/testCoins';
import { GiftOverlay } from '../../../components/GiftOverlay';
import GiftAnimationOverlay from '../../../components/GiftAnimationOverlay';
import { LiveGiftFeedStack } from '../../../components/LiveGiftFeedStack';
import { ChatOverlay } from '../../../components/ChatOverlay';
import { AvatarRing } from '../../../components/AvatarRing';
import { StoryGoldRingAvatar } from '../../../components/StoryGoldRingAvatar';
import { LevelBadge } from '../../../components/LevelBadge';
import {
  LIVE_MVP_PROFILE_RING_PX,
  LIVE_BATTLE_VIDEO_HEIGHT,
  LIVE_BATTLE_CHAT_HEIGHT,
  LIVE_BATTLE_CHAT_SHIFT_Y,
  LIVE_BATTLE_STAGE_BOTTOM,
  LIVE_TOP_AVATAR_RING_PX,
  LIVE_BOTTOM_ACTION_PADDING,
  LIVE_BOTTOM_ACTION_RESERVE,
  MVP_GOLD,
  MVP_RING_EMPTY_CLASS,
  MVP_RING_PHOTO_CLASS,
  MVP_RING_PHOTO_SOFT_CLASS,
  MVP_BADGE_CLASS,
} from '../../../lib/profileFrame';
import {
  SHARE_PANEL_ACTION_DISC_PX,
  SHARE_PANEL_ACTION_ICON_PX,
  SHARE_PANEL_AVATAR_PX,
  SHARE_PANEL_ITEM_WIDTH_PX,
} from '../../../lib/sharePanelContacts';
import { openExternalLink } from '../../../lib/platform';
import ReportModal from '../../../components/ReportModal';
import PromotePanel from '../../../components/PromotePanel';
import { RankingPanel } from '../../../components/RankingPanel';
import { watchLiveProfilePath } from '../../../lib/live/liveProfileNav';
import {
  apiLiveEngagementProgress,
  apiLiveShareCreate,
} from '../engagement/liveEngagementApi';
import { reportFailure } from '../../../lib/reportFailure';
import { MembershipBuySection } from '../../membership/MembershipBuySection';
import { apiToggleRepost } from '../../reposts/repostsApi';
import {
  LiveComboMissionDock,
  LiveHostProfileHeader,
  LiveJoinPill,
  LiveMarkedSubHeaderBar,
  isLiveProFromGiftReach,
} from '../../../components/LiveMarkedTopUi';
import {
  LiveSideMissionStack,
} from '../../../components/LiveSideMissionStack';
import { cohostInviteAccept } from '../cohost/liveCohostActions';
import { COHOST_LAYOUT_THUMBS } from '../cohost/cohostLayoutPresets';
import { isClassicStackLayout } from '../cohost/cohostLayoutSlots';
import { LIVE_COHOST_STAGE_BOTTOM } from '../cohost/cohostStageGeometry';
import { isPlaceholderLiveAvatar } from '../../../lib/liveCreatorDisplay';

function formatBattleScoreShort(coins: number) {
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
    _lastBattleScoreUpdateTraceSigRef,
    _openOpponentPanel,
    battleSidePanel,
    _setModerators,
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
    battleScoreBarHidden,
    battleStreamIds,
    battleTauntBursts,
    boosterActivations,
    boosterCatches,
    engagementState,
    coHostVideoRefs,
    cohostGiftScores,
    cohostLastGifts,
    cohostLayoutId,
    coinBalance,
    testCoinBalance,
    comboCount,
    currentGift,
    declineBattleInviteFromWatch,
    diamondLeagueRank,
    effectiveStreamId,
    engagementOpen,
    engagementPanel,
    featuredBigVideoRef,
    featuredUserId,
    floatingHearts,
    followHost,
    sendMembershipHeartJoin,
    formatTime,
    giftGoal,
    giftKey,
    giftSource,
    handleComboClick,
    handleGiftEnded,
    handleLikeTap,
    handleSendGift,
    handleSendMessage,
    handleSpectatorVote,
    handleSubscribe,
    hasJoinedToday,
    dailyHeartCount,
    myHeartCount,
    heartMembers,
    topGifters,
    hasOpponentStream,
    hasPlayer3Stream,
    hasPlayer4Stream,
    hasStream,
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
    lastSentGift,
    leaveStreamWithSlide,
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
    mvpGiftScoresHostRef,
    mvpGiftScoresOpponentRef,
    mvpGiftScoresRef,
    mvpIdentityRef,
    mvpSlots,
    listBattleSideMembers,
    myVideoRef,
    navigate,
    opponentProfile,
    hostBattleProfile,
    opponentVideoRef,
    player3VideoRef,
    player4VideoRef,
    pageExiting,
    pendingBattleInvite,
    pendingCoHostInvite,
    promotionalCoinBalance,
    rankingInitialTab,
    remoteCamOff,
    resolveCircleAvatar,
    retryJoinRoom,
    sendCohostJoinRequest,
    setBattleScoreBarHidden,
    setEngagementOpen,
    setEngagementPanel,
    setFeaturedUserId,
    setGiftSource,
    setInputValue,
    setIsChatVisible,
    setIsMoreMenuOpen,
    setIsReportModalOpen,
    setMessages,
    setPendingCoHostInvite,
    setRankingInitialTab,
    setSelectedCohostGiftUserId,
    setShareQuery,
    setShowCoHostPanel,
    setShowFanClub,
    setShowGiftPanel,
    setShowOpponentPanel,
    setBattleSidePanel,
    setShowPromotePanel,
    setShowRankingPanel,
    setShowRetryButton,
    setShowSharePanel,
    setShowViewersPanel,
    setStreamIsLive,
    setStreamRetryKey,
    setTestCoinsAmount,
    setTestCoinsError,
    setTestCoinsPwd,
    setViewersList,
    shareContacts,
    shareLiveUserIds,
    shareQuery,
    showCoHostPanel,
    showComboButton,
    showFanClub,
    showTeamStatus,
    closeTeamStatus,
    showGiftPanel,
    showOpponentPanel,
    showPromotePanel,
    showRankingPanel,
    showRetryButton,
    showSharePanel,
    showTestCoinsModal,
    showViewersPanel,
    spectatorBattle,
    battleWinStreak,
    spectatorChatHeartsRef,
    spectatorCoHostRequestSent,
    spectatorCoHosts,
    spectatorGate,
    spectatorStageRef,
    speedChallengeActive,
    speedChallengeTime,
    speedMultiplier,
    stageFlash,
    starterCoinBalance,
    streamEndedReceived,
    streamIsLive,
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
  } = useLiveSpectatorController();

  if (spectatorGate === 'loading') {
    return (
      <div className="fixed inset-0 elix-fundal-glass flex justify-center">
        <div className="relative w-full max-w-[480px] h-full elix-panel flex flex-col items-center justify-center gap-4 p-6">
          <div className="w-10 h-10 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
          <p className="text-white/60 text-sm">Connecting to live…</p>
        </div>
      </div>
    );
  }

  if (spectatorGate === 'offline') {
    return (
      <div className="fixed inset-0 elix-fundal-glass flex justify-center">
        <div className="relative w-full max-w-[480px] h-full elix-panel flex flex-col items-center justify-center px-6 pb-safe">
          <div className="w-full max-w-[300px] flex flex-col items-center text-center">
            <div className="relative mb-5">
              <AvatarRing
                src={hostAvatar || ''}
                alt={hostName || 'Creator'}
                size={96}
              />
              <span
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#EF4444] border-2 border-[#080A0E]"
                aria-hidden
              />
            </div>

            <h2 className="text-[#F5F5F7] font-bold text-xl tracking-tight">
              {streamEndedReceived ? 'Live ended' : 'Stream offline'}
            </h2>
            {hostName ? (
              <p className="text-white/70 text-sm mt-1.5 truncate max-w-full">
                {hostName}
              </p>
            ) : null}
            <p className="text-white/45 text-sm leading-relaxed mt-3 mb-6">
              {streamEndedReceived
                ? 'Thanks for watching. Taking you back…'
                : 'This live has ended or is not available right now.'}
            </p>

            <div className="w-full border-t border-[#D8D9DD]/30 mb-5" aria-hidden />

            <div className="flex flex-col gap-2.5 w-full">
              {!streamEndedReceived && (
                <button
                  type="button"
                  onClick={() => { setStreamIsLive(null); setStreamRetryKey(k => k + 1); }}
                  className="w-full py-3 rounded-xl bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] text-sm font-bold active:scale-[0.98] transition-transform"
                >
                  Retry connection
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const exitTo = returnToFromLocationState(location.state) || '/feed';
                  navigate(exitTo, { replace: true });
                }}
                className="w-full py-3 rounded-xl bg-transparent border border-[#D8D9DD]/55 text-[#F5F5F7] text-sm font-bold active:scale-[0.98] transition-transform"
              >
                Back to For You
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Cosmic fundal behind chat/bottom ONLY in co-host or battle — never normal solo live.
  const hostIdForFundal = hostUserIdRef.current || hostUserId || effectiveStreamId;
  const hasCoHostLowerFundal =
    !!spectatorBattle?.active ||
    isCoHosting ||
    isCoHostFromUrl ||
    spectatorCoHosts.some(
      (h) =>
        !sameUserId(h.userId, hostIdForFundal) &&
        (h.status === 'live' ||
          h.status === 'accepted' ||
          h.status === 'invited' ||
          h.status === 'pending_accept'),
    );

  return (
    <div
      className="elix-live-room elix-fundal-glass fixed inset-0 flex justify-center transition-transform duration-[250ms] ease-out"
      style={{ transform: pageExiting ? 'translateX(100%)' : undefined }}
    >
      <div className={`relative w-full max-w-[480px] h-full overflow-hidden overflow-x-hidden flex flex-col ${spectatorBattle?.active ? 'elix-battle-room-fundal' : 'elix-fundal-glass'}`}>
        <audio ref={hostRemoteAudioRef} autoPlay playsInline className="hidden" />

        {spectatorBattle?.active ? (
          <div
            className="elix-battle-lower-fundal pointer-events-none absolute inset-x-0 bottom-0 z-[1]"
            style={{ top: LIVE_BATTLE_STAGE_BOTTOM }}
            aria-hidden
          />
        ) : hasCoHostLowerFundal ? (
          <div
            className="elix-live-chat-fundal pointer-events-none absolute inset-x-0 bottom-0 z-[1]"
            style={{ top: 'calc(90px + 6mm + 36dvh + 10mm)' }}
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
            const { red: redTeamScore, blue: blueTeamScore } = teamTotalsFromScores({
              h: spectatorBattle.hostScore || 0,
              o: spectatorBattle.opponentScore || 0,
              p3: spectatorBattle.player3Score ?? 0,
              p4: spectatorBattle.player4Score ?? 0,
            });
            const total = redTeamScore + blueTeamScore;
            const leftPct = total > 0 ? Math.max(5, Math.min(95, (redTeamScore / total) * 100)) : 50;
            const hS = spectatorBattle.hostScore || 0;
            const oS = spectatorBattle.opponentScore || 0;
            const p3s = spectatorBattle.player3Score ?? 0;
            const p4s = spectatorBattle.player4Score ?? 0;
            const is4Player =
              !!(spectatorBattle.player3UserId || spectatorBattle.player4UserId ||
                spectatorBattle.player3Name || spectatorBattle.player4Name ||
                p3s > 0 || p4s > 0);
            // End-game suspense hides both scores; Mist Fog hides ONLY the supported
            // creator's side (the one the spectator boosted), never both.
            const mistSupportedSide = mistHidesMyScore ? mistFog?.supportedSide : null;
            const hideRedScore = battleHideScores || mistSupportedSide === 'host';
            const hideBlueScore = battleHideScores || mistSupportedSide === 'opponent';
            return (
              <div
                className="absolute inset-0 z-[80] flex flex-col overflow-hidden"
                style={{
                  paddingTop: 'calc(var(--safe-top) + 112px - 2.5mm)',
                  paddingBottom: '305px',
                }}
              >
                {/* Battle video half — score + videos + MVP inside height box (host-identical) */}
                <div className="relative w-full max-w-full flex-none flex flex-col overflow-hidden overflow-x-hidden elix-battle-stage-fundal" style={{ height: LIVE_BATTLE_VIDEO_HEIGHT }}>
                <div className={`relative z-20 w-full flex-none ${battleScoreBarHidden ? '' : 'elix-battle-score-wrap'}`}>
                  {!battleScoreBarHidden ? (
                    <div
                      className="relative w-full overflow-hidden cursor-pointer pointer-events-auto"
                      style={{ minHeight: 'calc(12px + 0.5mm)', height: 'calc(12px + 0.5mm)' }}
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
                        </div>
                        <div className={`flex min-w-0 flex-1 flex-col items-end justify-center gap-0 ${hideBlueScore ? 'opacity-0' : ''}`}>
                          <AnimatedScore value={typeof blueTeamScore === 'number' && Number.isFinite(blueTeamScore) ? blueTeamScore : 0} durationMs={0} format={formatBattleScoreShort} className="text-white font-black text-[10px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" />
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
                      <div className="flex-1 basis-0 min-w-0 h-full flex flex-col min-h-0 gap-0 overflow-hidden">
                        <div className="flex-1 min-h-0 overflow-hidden relative bg-[rgba(0,0,0,0.35)]">
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
                                    <div className="w-16 h-16 rounded-full bg-[rgba(0,0,0,0.35)]" />
                                  )}
                              <span className="text-white text-xs font-bold">{hostName}</span>
                              <div className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                <span className="text-white text-[10px] font-bold">Connecting...</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {is4Player ? (
                          <div className="flex-1 min-h-0 overflow-hidden relative bg-[rgba(0,0,0,0.35)]">
                            <video
                              ref={player3VideoRef}
                              className="absolute inset-0 w-full h-full object-cover"
                              autoPlay
                              playsInline
                              muted
                              style={{ opacity: hasPlayer3Stream ? 1 : 0, transition: 'opacity 0.3s ease' }}
                            />
                            {!hasPlayer3Stream && (
                              <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 elix-battle-slot">
                                {spectatorBattle.player3Name ? (
                                  <div className="w-12 h-12 rounded-full bg-[rgba(8,10,14,0.65)] border border-[var(--elix-border)]" />
                                ) : null}
                                <span className="text-[#C8CDD5] text-[10px] font-bold truncate max-w-[90%]">{spectatorBattle.player3Name || 'Creator'}</span>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex-1 basis-0 min-w-0 h-full flex flex-col min-h-0 gap-0 overflow-hidden">
                        <div
                          className={`flex-1 min-h-0 overflow-hidden relative ${
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
                                <div className="w-16 h-16 rounded-full bg-[rgba(8,10,14,0.65)] border border-[var(--elix-border)]" />
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
                        </div>
                        {is4Player ? (
                          <div className="flex-1 min-h-0 overflow-hidden relative bg-[rgba(0,0,0,0.35)]">
                            <video
                              ref={player4VideoRef}
                              className="absolute inset-0 w-full h-full object-cover"
                              autoPlay
                              playsInline
                              muted
                              style={{ opacity: hasPlayer4Stream ? 1 : 0, transition: 'opacity 0.3s ease' }}
                            />
                            {!hasPlayer4Stream && (
                              <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 elix-battle-slot">
                                {spectatorBattle.player4Name ? (
                                  <div className="w-12 h-12 rounded-full bg-[rgba(8,10,14,0.65)] border border-[var(--elix-border)]" />
                                ) : null}
                                <span className="text-[#C8CDD5] text-[10px] font-bold truncate max-w-[90%]">{spectatorBattle.player4Name || 'Creator'}</span>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="absolute inset-0 z-10 flex flex-row touch-manipulation gap-0">
                      {is4Player ? (
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
                    {/* Same as creator: WIN/LOSS capsules only after result or streak > 0; close near mic */}
                    <div className="absolute inset-0 z-40 pointer-events-none flex flex-row gap-0">
                      <div className="flex-1 basis-0 min-w-0 h-full relative">
                        {(spectatorBattle.winner != null || battleWinStreak.host > 0) && (
                        <div className="absolute top-3 left-1.5">
                          <span className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-black/45 border border-[#D8D9DD]/40 text-white text-[9px] font-black tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                            <span>
                              {spectatorBattle.winner === 'host'
                                ? 'WIN'
                                : spectatorBattle.winner === 'opponent'
                                  ? 'LOSS'
                                  : spectatorBattle.winner === 'draw'
                                    ? 'DRAW'
                                    : 'WINS'}
                            </span>
                            <span className={spectatorBattle.winner === 'opponent' ? 'text-white/70' : 'text-white'}>
                              ×{spectatorBattle.winner === 'opponent' ? 0 : battleWinStreak.host}
                            </span>
                          </span>
                        </div>
                        )}
                        <div className="absolute bottom-3 right-1.5 pointer-events-auto flex items-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); leaveStreamWithSlide(); }}
                            aria-label="Close"
                            className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                          >
                            <X size={14} strokeWidth={2.35} className="text-[#F5F5F7]" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleMic(); }}
                            aria-label={isMicMuted ? 'Unmute' : 'Mute'}
                            className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                          >
                            {isMicMuted
                              ? <MicOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />
                              : <Mic className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleCam(); }}
                            aria-label={isCamOff ? 'Cam On' : 'Cam Off'}
                            className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                          >
                            {isCamOff
                              ? <CameraOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />
                              : <Camera className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 basis-0 min-w-0 h-full relative">
                        {(spectatorBattle.winner != null || battleWinStreak.opponent > 0) && (
                        <div className="absolute top-3 right-1.5">
                          <span className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-black/45 border border-[#D8D9DD]/40 text-white text-[9px] font-black tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                            <span>
                              {spectatorBattle.winner === 'opponent'
                                ? 'WIN'
                                : spectatorBattle.winner === 'host'
                                  ? 'LOSS'
                                  : spectatorBattle.winner === 'draw'
                                    ? 'DRAW'
                                    : 'WINS'}
                            </span>
                            <span className={spectatorBattle.winner === 'host' ? 'text-white/70' : 'text-white'}>
                              ×{spectatorBattle.winner === 'host' ? 0 : battleWinStreak.opponent}
                            </span>
                          </span>
                        </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Battle partner profile panel — host or opponent half tap */}
                {showOpponentPanel && battleSidePanel && (
                  <div
                    className="fixed inset-0 z-[200]"
                    onClick={() => {
                      setShowOpponentPanel(false);
                      setBattleSidePanel(null);
                    }}
                  >
                    <div className="absolute inset-0 bg-black/35" />
                    <div
                      className="absolute left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-[456px] elix-panel elix-live-sheet rounded-2xl overflow-hidden shadow-xl border border-[#2A2D33] animate-[slideInFromBottom_0.2s_ease-out]"
                      style={{ bottom: 'calc(70px + max(8px, env(safe-area-inset-bottom)))' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(() => {
                        const side = battleSidePanel;
                        const profile = side === 'opponent' ? opponentProfile : hostBattleProfile;
                        const fallbackName =
                          side === 'opponent'
                            ? spectatorBattle.opponentName || 'Opponent'
                            : hostName || 'Creator';
                        const watchRoomId =
                          side === 'opponent'
                            ? spectatorBattle.opponentRoomId || battleStreamIds?.opponentUserId
                            : battleStreamIds?.hostRoomId ||
                              battleStreamIds?.hostUserId ||
                              hostUserId ||
                              effectiveStreamId;
                        const profileUid =
                          side === 'opponent'
                            ? battleStreamIds?.opponentUserId
                            : battleStreamIds?.hostUserId || hostUserId;
                        const alreadyWatching =
                          !!watchRoomId &&
                          (watchRoomId === effectiveStreamId ||
                            watchRoomId === hostUserId ||
                            watchRoomId === battleStreamIds?.hostRoomId);
                        return (
                      <div className="px-3.5 py-3 flex items-center gap-3">
                        {(profile?.avatarUrl) ? (
                          <img src={profile.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[rgba(0,0,0,0.35)] flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-bold text-sm truncate leading-tight">
                            {profile?.displayName || fallbackName}
                          </h3>
                          <div className="flex items-center gap-1.5 text-[10px] text-white/50 leading-tight mt-0.5">
                            {profile?.username && <span>@{profile.username}</span>}
                            {profile && (
                              <>
                                <span>·</span>
                                <span className="text-white/70 font-semibold">{profile.followers >= 1000 ? `${(profile.followers / 1000).toFixed(1)}K` : profile.followers}</span>
                                <span>followers</span>
                                {profile.level > 0 && (
                                  <LevelBadge
                                    level={profile.level}
                                    avatar={profile.avatarUrl}
                                    layout="fixed"
                                  />
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {watchRoomId && !(side === 'host' && alreadyWatching) ? (
                          <button
                            type="button"
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#FFFFFF] active:scale-95 transition-transform"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowOpponentPanel(false);
                              setBattleSidePanel(null);
                              if (watchRoomId) {
                                window.location.href = `/watch/${watchRoomId}`;
                              }
                            }}
                          >
                            <Play size={12} className="text-black" fill="black" />
                            <span className="text-black font-bold text-[11px] whitespace-nowrap">Watch LIVE</span>
                          </button>
                          ) : null}
                          {profileUid && (
                            <button
                              type="button"
                              className="flex items-center px-3 py-2 rounded-full border border-[#D8D9DD]/40 active:scale-95 transition-transform"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowOpponentPanel(false);
                                setBattleSidePanel(null);
                                navigate(watchLiveProfilePath(effectiveStreamId, profileUid));
                              }}
                            >
                              <span className="text-[#F5F5F7] font-bold text-[11px]">Profile</span>
                            </button>
                          )}
                        </div>
                      </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          type SlotType = { type: 'host_main' | 'self' | 'live' | 'invited' | 'pending' | 'empty'; host?: typeof spectatorCoHosts[0] };

          const useClassicStack = !showGrid || isClassicStackLayout(cohostLayoutId);
          const layoutThumb = COHOST_LAYOUT_THUMBS[cohostLayoutId];
          const hostGridArea = layoutThumb.cells.find((c) => c.kind === 'h')?.area;
          const seatAreas = layoutThumb.cells.filter((c) => c.kind === 's').map((c) => c.area);
          const seatCap = useClassicStack ? 8 : Math.max(seatAreas.length, 1);

          const buildSlots = (): SlotType[] => {
            const slots: SlotType[] = [];
            const liveOthers = externalCoHosts.filter(h => h.userId !== myUserId && (h.status === 'live' || h.status === 'accepted'));
            const featured = featuredUserId
              ? liveOthers.find((h) => sameUserId(h.userId, featuredUserId)) || null
              : null;
            if (featured && useClassicStack) slots.push({ type: 'host_main' });
            if (isCoHosting && !(featured && sameUserId(myUserId, featured.userId))) {
              slots.push({ type: 'self' });
            }
            const restLive = featured
              ? liveOthers.filter((h) => !sameUserId(h.userId, featured.userId))
              : liveOthers;
            const invitedPending = externalCoHosts.filter(h => h.userId !== myUserId && (h.status === 'invited' || h.status === 'pending_accept'));
            restLive.forEach(h => slots.push({ type: 'live', host: h }));
            invitedPending.forEach(h => slots.push({ type: h.status === 'invited' ? 'invited' : 'pending', host: h }));
            while (slots.length < seatCap) slots.push({ type: 'empty' });
            return slots.slice(0, seatCap);
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
                    style={{ opacity: hostCamOff ? 0 : 1, backgroundColor: 'transparent' }}
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
                    className="absolute top-0.5 left-0.5 z-10 elix-live-tile-ctrl flex items-center justify-center border-0 bg-transparent p-0.5 pointer-events-auto active:scale-95"
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
                      <div className="w-10 h-10 rounded-full bg-[rgba(0,0,0,0.35)]" />
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
                      backgroundColor: 'transparent',
                    }}
                  />
                  {/* Left-side co-host controls: Camera / Microphone / Switch Screen */}
                  <div className="absolute top-0.5 left-0.5 z-10 flex flex-col items-center gap-0.5 pointer-events-auto">
                    <button
                      type="button"
                      onClick={toggleCam}
                      className="p-1"
                      title={isCamOff ? 'Camera on' : 'Camera off'}
                    >
                      {isCamOff
                        ? <CameraOff className="text-white/60 w-3.5 h-3.5" strokeWidth={2.5} />
                        : <Camera className="text-white w-3.5 h-3.5" strokeWidth={2.5} />}
                    </button>
                    <button
                      type="button"
                      onClick={toggleMic}
                      className="p-1"
                      title={isMicMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMicMuted
                        ? <MicOff className="text-white/60 w-3.5 h-3.5" strokeWidth={2.5} />
                        : <Mic className="text-white w-3.5 h-3.5" strokeWidth={2.5} />}
                    </button>
                    <button
                      type="button"
                      title="Put on big screen"
                      onClick={(e) => { e.stopPropagation(); if (user?.id) toggleFeaturedUser(user.id); }}
                      className="elix-live-tile-ctrl flex items-center justify-center border-0 bg-transparent p-0.5 pointer-events-auto active:scale-95"
                    >
                      <ArrowLeftRight className="w-3 h-3 text-[#F5F5F7]" strokeWidth={2.5} />
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
              return (
                <>
                  {camOff && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 elix-panel z-[5]">
                    {h.avatar ? (
                      <img src={h.avatar} alt="" className="w-10 h-10 rounded-full object-cover object-center" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[rgba(0,0,0,0.35)]" />
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
                      backgroundColor: 'transparent',
                    }}
                  />
                  <button
                    type="button"
                    title="Put on big screen"
                    onClick={(e) => { e.stopPropagation(); toggleFeaturedUser(h.userId); }}
                    className="absolute top-0.5 left-0.5 z-10 elix-live-tile-ctrl flex items-center justify-center border-0 bg-transparent p-0.5 pointer-events-auto active:scale-95"
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
                </>
              );
            }
            if (slot.type === 'invited' && slot.host) {
              return (
                <>
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-[rgba(0,0,0,0.35)]">
                    {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover opacity-60" /> : null}
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
                    {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover" /> : null}
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

          return (
            <div
              className={`absolute left-0 right-0 z-0 bg-transparent overflow-hidden rounded-none`}
              style={(showGrid || spectatorBattle?.active)
                ? { top: 'calc(var(--safe-top) + 90px + 9mm)', height: 'calc(30dvh + 6mm)' }
                : { top: '0px', bottom: '0px' }
              }
            >
              <div
                ref={spectatorStageRef}
                className={
                  showGrid
                    ? useClassicStack
                      ? 'relative flex w-full h-full min-h-0 flex-row overflow-hidden rounded-none gap-[2px]'
                      : 'relative grid w-full h-full min-h-0 overflow-hidden rounded-none'
                    : 'relative flex w-full h-full min-h-0 flex-row overflow-hidden rounded-none'
                }
                style={
                  showGrid && !useClassicStack
                    ? { gridTemplate: layoutThumb.grid, gap: '2px' }
                    : undefined
                }
              >
              {/* Left/main: host video (or featured co-host) — tap/double-tap to like (Aprecieri); hearts render in chat panel */}
              <div
                className={`touch-manipulation overflow-hidden rounded-none min-w-0 relative ${
                  showGrid
                    ? useClassicStack
                      ? 'w-1/2 elix-cohost-pill'
                      : 'elix-cohost-pill'
                    : 'w-full'
                }`}
                style={
                  showGrid && !useClassicStack && hostGridArea
                    ? { gridArea: hostGridArea }
                    : undefined
                }
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
                    backgroundColor: 'transparent',
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
                      style={{ backgroundColor: 'transparent' }}
                    />
                    <button
                      type="button"
                      title="Back to host on big screen"
                      onClick={(e) => { e.stopPropagation(); setFeaturedUserId(null); }}
                      className="absolute top-1 left-1 z-20 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-transparent border border-[#D8D9DD]/50 pointer-events-auto active:scale-95"
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
                      <img src={hostAvatar} alt="" className="w-16 h-16 rounded-full object-cover object-center border border-[#D8D9DD]/70" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center border border-[#D8D9DD]/70">
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

              {/* Co-host seats — classic stack or layout grid */}
              {showGrid && (useClassicStack ? (
                <div className="w-1/2 h-full grid grid-cols-2 grid-rows-4 gap-[2px] bg-transparent">
                  {slots.slice(0, 8).map((slot, i) => {
                    const cellSpeaking =
                      (slot.type === 'self' && isSpeakingUser(user?.id)) ||
                      (slot.type === 'live' && !!slot.host && isSpeakingUser(slot.host.userId));
                    const liveHost = slot.type === 'live' ? slot.host : undefined;
                    const canOpenGift =
                      !spectatorBattle?.active && (!!liveHost || slot.type === 'host_main');
                    return (
                      <div
                        key={i}
                        role={canOpenGift ? 'button' : undefined}
                        tabIndex={canOpenGift ? 0 : undefined}
                        onClick={() => {
                          if (!canOpenGift) return;
                          if (liveHost) {
                            setSelectedCohostGiftUserId(liveHost.userId);
                          } else {
                            setSelectedCohostGiftUserId(null);
                          }
                          setShowGiftPanel(true);
                        }}
                        onKeyDown={(e) => {
                          if (!canOpenGift) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (liveHost) {
                              setSelectedCohostGiftUserId(liveHost.userId);
                            } else {
                              setSelectedCohostGiftUserId(null);
                            }
                            setShowGiftPanel(true);
                          }
                        }}
                        className={`relative elix-cohost-pill bg-white/5 flex flex-col items-center justify-center overflow-hidden p-0 min-h-0 pointer-events-auto ${cellSpeaking ? 'elix-speaking-pulse' : ''} ${canOpenGift ? 'cursor-pointer' : ''}`}
                      >
                        {renderSlot(slot)}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  {slots.map((slot, i) => {
                    const cellSpeaking =
                      (slot.type === 'self' && isSpeakingUser(user?.id)) ||
                      (slot.type === 'live' && !!slot.host && isSpeakingUser(slot.host.userId));
                    const liveHost = slot.type === 'live' ? slot.host : undefined;
                    const area = seatAreas[i];
                    if (!area) return null;
                    const canOpenGift =
                      !spectatorBattle?.active && (!!liveHost || slot.type === 'host_main');
                    return (
                      <div
                        key={`seat-${i}`}
                        role={canOpenGift ? 'button' : undefined}
                        tabIndex={canOpenGift ? 0 : undefined}
                        onClick={() => {
                          if (!canOpenGift) return;
                          if (liveHost) {
                            setSelectedCohostGiftUserId(liveHost.userId);
                          } else {
                            setSelectedCohostGiftUserId(null);
                          }
                          setShowGiftPanel(true);
                        }}
                        onKeyDown={(e) => {
                          if (!canOpenGift) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (liveHost) {
                              setSelectedCohostGiftUserId(liveHost.userId);
                            } else {
                              setSelectedCohostGiftUserId(null);
                            }
                            setShowGiftPanel(true);
                          }
                        }}
                        style={{ gridArea: area }}
                        className={`relative elix-cohost-pill bg-white/5 flex flex-col items-center justify-center overflow-hidden p-0 min-h-0 pointer-events-auto ${cellSpeaking ? 'elix-speaking-pulse' : ''} ${canOpenGift ? 'cursor-pointer' : ''}`}
                      >
                        {renderSlot(slot)}
                      </div>
                    );
                  })}
                </>
              ))}
              </div>
            </div>
          );
        })()}

        {/* Co-host MVP circles under stage (not battle) */}
        {!spectatorBattle?.active && hasCoHostLowerFundal && (
          <div
            className="fixed left-0 right-0 z-[120] flex justify-center pointer-events-none"
            style={{ top: 'calc(var(--safe-top) + 90px + 9mm + 30dvh + 6mm + 2mm)' }}
          >
            <div
            className="w-full max-w-[480px] pl-[1mm] pr-3 py-1 flex items-end justify-start gap-[1.5mm] pointer-events-auto"
              title="Top gifters — MVP"
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
                const gifted = slot.points ?? 0;
                const isMvp = i === 0 && gifted > 0;
                const raw = String(slot.name || '').trim();
                const label = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
                  ? raw.split('@')[0] || 'User'
                  : raw || 'User';
                const photo =
                  slot.avatar && !isPlaceholderLiveAvatar(slot.avatar) ? slot.avatar : '';
                return (
                  <div
                    key={`cohost-mvp-${slot.id}`}
                    className="relative flex flex-col items-center max-w-[42px]"
                    style={{ zIndex: 3 - i }}
                  >
                    {!photo ? (
                      <div
                        className={`rounded-full flex items-center justify-center bg-[#121419] border ${
                          isMvp ? MVP_RING_EMPTY_CLASS : 'border-[#D8D9DD]/70'
                        }`}
                        style={{ width: LIVE_MVP_PROFILE_RING_PX, height: LIVE_MVP_PROFILE_RING_PX }}
                      />
                    ) : (
                      <div className={isMvp ? MVP_RING_PHOTO_CLASS : 'rounded-full'}>
                        <AvatarRing
                          src={photo}
                          alt={label || 'MVP'}
                          size={LIVE_MVP_PROFILE_RING_PX}
                          ringColor={isMvp ? MVP_GOLD : undefined}
                        />
                      </div>
                    )}
                    {isMvp && (
                      <span className={`absolute top-[22px] left-1/2 -translate-x-1/2 z-[2] ${MVP_BADGE_CLASS}`}>
                        MVP
                      </span>
                    )}
                    <span className="mt-1.5 text-[#D9A62E] text-[7px] font-semibold truncate max-w-full leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                      {label || '\u00A0'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {spectatorBattle?.active && (
                <div
                  className="elix-battle-mvp-row fixed left-0 right-0 z-[120] flex justify-center pointer-events-none"
                  style={{ top: LIVE_BATTLE_STAGE_BOTTOM }}
                >
                  <div className="relative w-full max-w-[480px] min-h-[56px]">
                  <div className="elix-battle-mvp-fundal absolute inset-0 pointer-events-none" aria-hidden />
                  <div className="relative z-[2] px-3 py-1.5 flex items-end justify-between overflow-x-hidden min-h-[56px]">
                  {SPEED_CHALLENGE_ENABLED && speedChallengeActive ? (
                    <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#B91C1C]/90 shadow-[0_0_10px_rgba(185,28,28,0.55)]">
                        <span className="text-white text-[8px] font-black uppercase tracking-wide">Speed</span>
                        <span className="text-white text-[11px] font-black tabular-nums">{speedChallengeTime}s</span>
                        {speedMultiplier > 1 ? (
                          <span className="text-white text-[9px] font-black">x{speedMultiplier}</span>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                  <div
                    className="flex items-center gap-[0mm] w-1/2 min-w-0 justify-start pointer-events-auto overflow-hidden"
                    title="Top viewers & gifters"
                    onClick={() => {
                      const list = listBattleSideMembers('host').map((s) => ({
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
                    {mvpSlots.host.slice(0, 3).map((slot, i) => {
                      const isMvp = i === 0 && (slot.points ?? 0) > 0;
                      return (
                        <div
                          key={`mvp-l-${slot.id}`}
                          className="relative"
                          style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '-1.5mm' }}
                        >
                          <div className={isMvp ? MVP_RING_PHOTO_SOFT_CLASS : 'rounded-full'}>
                            <AvatarRing
                              src={resolveCircleAvatar(slot.avatar, slot.name)}
                              alt={slot.name || 'MVP'}
                              size={LIVE_MVP_PROFILE_RING_PX}
                              ringColor={isMvp ? MVP_GOLD : undefined}
                            />
                          </div>
                          {isMvp && (
                            <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 z-[2] ${MVP_BADGE_CLASS}`}>
                              MVP
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="flex items-center gap-[0mm] w-1/2 min-w-0 justify-end pointer-events-auto overflow-hidden"
                    title="Top viewers & gifters"
                    onClick={() => {
                      const list = listBattleSideMembers('opponent').map((s) => ({
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
                    {mvpSlots.opponent.slice(0, 3).map((slot, i) => {
                      const isMvp = i === 0 && (slot.points ?? 0) > 0;
                      return (
                        <div
                          key={`mvp-r-${slot.id}`}
                          className="relative"
                          style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '-1.5mm' }}
                        >
                          <div className={isMvp ? MVP_RING_PHOTO_SOFT_CLASS : 'rounded-full'}>
                            <AvatarRing
                              src={resolveCircleAvatar(slot.avatar, slot.name)}
                              alt={slot.name || 'MVP'}
                              size={LIVE_MVP_PROFILE_RING_PX}
                              ringColor={isMvp ? MVP_GOLD : undefined}
                            />
                          </div>
                          {isMvp && (
                            <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 z-[2] ${MVP_BADGE_CLASS}`}>
                              MVP
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  </div>
                  </div>
                </div>
        )}

        {/* CREATOR TOP BAR — only connection to creator page: spectator has access to full creator top bar (avatar, name, likes, Follow, Weekly Ranking, Membership, viewer count, close). Rest is single video + spectator's own bottom bar. */}
        <div
          className={`absolute top-0 left-0 right-0 z-[110] pointer-events-none overflow-hidden elix-live-top-chrome ${spectatorBattle?.active ? 'elix-battle-top-fundal' : ''}`}
        >
          <div className="px-3 pb-1.5" style={{ paddingTop: 'max(2px, calc(var(--safe-top) + 6px))' }}>
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
                  isLivePro={isLiveProFromGiftReach(hostTotalGiftCoins)}
                  onAvatarClick={() => navigate(watchLiveProfilePath(effectiveStreamId, hostUserId))}
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
                          <div className={isMvp ? MVP_RING_PHOTO_SOFT_CLASS : 'rounded-full'}>
                            <AvatarRing
                              src={resolveCircleAvatar(slot.avatar, slot.name)}
                              alt={slot.name || 'MVP'}
                              size={LIVE_MVP_PROFILE_RING_PX}
                              ringColor={isMvp ? MVP_GOLD : undefined}
                            />
                          </div>
                          {isMvp && (
                            <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 z-[2] ${MVP_BADGE_CLASS}`}>
                              MVP
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="flex items-center px-0 py-1 rounded-full bg-transparent border-0 active:scale-95 transition-transform"
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
                  title="Spectators"
                >
                  <span className="text-white/50 text-[9px] font-bold tabular-nums">
                    {formatCompactNumber(
                      typeof viewerCount === 'number' && Number.isFinite(viewerCount) ? viewerCount : 0,
                    )}
                  </span>
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
              showFollow={false}
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
            className={`w-full max-w-[480px] relative min-w-0 overflow-x-hidden ${hasCoHostLowerFundal ? 'elix-live-chat-fundal' : 'bg-transparent'}`}
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
                mvpSlots.global.slice(0, 3).map((s) => ({
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
                className="w-[72px] h-[72px] rounded-full bg-transparent flex flex-col items-center justify-center active:scale-90 transition-transform shadow-[0_0_18px_rgba(111,63,245,0.55)] border-2 border-white/30 disabled:opacity-50"
              >
                <span className={`font-black italic text-white drop-shadow-md leading-none ${comboCount >= 1000 ? 'text-sm' : 'text-xl'}`}>
                  x{comboCount >= 1000 ? `${(comboCount / 1000).toFixed(comboCount % 1000 === 0 ? 0 : 1)}K` : comboCount}
                </span>
              </button>
            </div>
          </div>
        )}

{/* Bottom bar — same fundal as top chrome; above gift video so actions stay tappable */}
        <div
          className="fixed left-0 right-0 bottom-0 z-[50002] pointer-events-none flex justify-center"
        >
          <div
            className={`pointer-events-auto w-full max-w-[480px] px-3 pt-0 ${hasCoHostLowerFundal ? 'elix-live-lower-fundal' : 'bg-transparent'}`}
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
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-transparent border-0">
                  <span className="royce-glow-disc">
                    <BarChart3 size={18} className="text-[#A7A7AD] shrink-0" strokeWidth={2.25} />
                  </span>
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
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-transparent border-0">
                  <span className="royce-glow-disc relative z-[2]">
                    <UserPlus
                      size={18}
                      className="text-[#F5F5F7] shrink-0"
                      strokeWidth={2.25}
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
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-transparent border-0">
                  <span className="royce-glow-disc relative z-[2]">
                    <Gift size={18} className="text-[#F5F5F7]" strokeWidth={2.25} />
                  </span>
                </div>
                <span className="elix-silver-red-text text-[10px] font-semibold mt-0.5">Gift</span>
              </button>
              <button
                type="button"
                title="Share"
                onClick={() => setShowSharePanel(true)}
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-transparent border-0">
                  <span className="royce-glow-disc relative z-[2]">
                    <Share2 size={18} className="text-[#F5F5F7]" strokeWidth={2.25} />
                  </span>
                </div>
                <span className="elix-silver-red-text text-[10px] font-semibold mt-0.5">Share</span>
              </button>
              <button
                type="button"
                title="More options"
                onClick={() => setIsMoreMenuOpen(true)}
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-transparent border-0">
                  <span className="royce-glow-disc relative z-[2]">
                    <MoreVertical size={18} className="text-[#F5F5F7]" strokeWidth={2.25} />
                  </span>
                </div>
                <span className="elix-silver-red-text text-[10px] font-semibold mt-0.5">More</span>
              </button>
              </div>
            </div>
          </div>
        </div>

        <GiftAnimationOverlay streamId={effectiveStreamId} isBattleMode={!!spectatorBattle?.active} />
        {/* Separate photo feed (cards + xN) — does not replace gift video animation */}
        <LiveGiftFeedStack
          streamId={effectiveStreamId}
          isCohostMode={hasCoHostLowerFundal && !spectatorBattle?.active}
          isBattleMode={!!spectatorBattle?.active}
          cohostStageBottom={LIVE_COHOST_STAGE_BOTTOM}
        />

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
          <div className="fixed left-0 right-0 z-[100000] pointer-events-none flex justify-center px-3" style={{ top: 'calc(var(--safe-top) + 64px)' }}>
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
              <div className="elix-panel elix-live-sheet backdrop-blur-md rounded-t-2xl h-[40vh] flex flex-col shadow-2xl overflow-hidden pb-safe" onClick={(e) => e.stopPropagation()}>
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
                            cohostInviteAccept({ hostUserId: inv.hostUserId, cohostName: user?.username || user?.name || 'User', cohostAvatar: user?.avatar || '', streamKey: inv.streamKey || effectiveStreamId });
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

        {/* ═══ TEAM STATUS PANEL (Join Membership hearts + Buy) — same as creator/battle */}
        {showTeamStatus && (
          <>
            <div
              className="fixed inset-0 bg-black/35 pointer-events-auto"
              style={{ zIndex: 99998 }}
              onClick={closeTeamStatus}
            />
            <div className="fixed bottom-0 left-0 right-0 h-[40vh] z-[99999] pointer-events-auto max-w-[480px] mx-auto">
              <div
                className="elix-panel backdrop-blur-md rounded-t-2xl p-3 pb-safe h-full flex flex-col shadow-2xl w-full overflow-hidden "
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col px-1 pt-0 pb-2 border-b border-white/10 flex-shrink-0">
                  <div className="flex justify-center pb-2" aria-hidden>
                    <div className="w-10 h-1 rounded-full bg-white/25" />
                  </div>
                  <span className="text-[#F5F5F7] font-bold text-sm text-center w-full">Your Team Status</span>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar min-h-0">
                  <MembershipBuySection
                    creatorName={hostName}
                    creatorAvatar={hostAvatar}
                    isMember={isMember}
                    isSubscribing={isSubscribing}
                    isSelf={membershipIsSelf}
                    onBuy={() => {
                      void handleSubscribe();
                    }}
                  />

                  <div className="bg-transparent rounded-xl p-3 border-0 relative overflow-hidden">
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="w-10 h-10 rounded-full bg-transparent flex items-center justify-center">
                        <Heart className="w-6 h-6 text-[#FF6A3D] fill-[#FF6A3D]" strokeWidth={0} />
                      </div>
                      <div>
                        <div className="text-[#F5F5F7]/60 text-[9px] font-bold uppercase tracking-wider">Member Hearts</div>
                        <div className="text-[#FF6A3D] font-bold text-sm tabular-nums">
                          {dailyHeartCount} today
                        </div>
                        <div className="text-[#FF6A3D]/80 text-[9px] font-bold mt-0.5 tabular-nums">
                          {myHeartCount} total hearts
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <h4 className="text-[#F5F5F7]/60 text-[9px] font-bold uppercase tracking-wider mb-2 px-1">Hearts Sent</h4>
                    <div className="space-y-1">
                      {heartMembers.length === 0 && (
                        <p className="text-white/30 text-[10px] text-center py-2">No membership hearts yet</p>
                      )}
                      {heartMembers.map((m, i) => (
                        <div key={m.user_id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#E6E9EE]/5 border border-[#D8D9DD]/15">
                          <div className="w-5 text-center font-bold text-[10px] text-[#F5F5F7]/60">{i + 1}</div>
                          <img src={m.avatar_url || '/royce/elix-mark.svg'} alt="" className="w-7 h-7 rounded-full object-cover border border-[#D8D9DD]/20" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-bold text-white truncate">{m.username || 'Member'}</div>
                          </div>
                          <div className="text-[#FF6A3D] text-[10px] font-bold whitespace-nowrap tabular-nums">
                            {m.heart_days} {m.heart_days === 1 ? 'heart' : 'hearts'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white/5 rounded-xl p-3 border border-[#D8D9DD]/20 mt-2">
                    <div className="text-[#F5F5F7]/60 text-[9px] font-bold uppercase tracking-wider">Total Gift Coins Received</div>
                    <div className="text-[#D9A62E] font-bold text-lg">{hostTotalGiftCoins.toLocaleString()}</div>
                  </div>

                  <div className="mt-3">
                    <h4 className="text-[#F5F5F7]/60 text-[9px] font-bold uppercase tracking-wider mb-2 px-1">Top Supporters</h4>
                    <div className="space-y-1">
                      {topGifters.length === 0 && (
                        <p className="text-white/30 text-[10px] text-center py-2">No gifts yet</p>
                      )}
                      {topGifters.map((g, i) => (
                        <div key={g.user_id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#E6E9EE]/5 border border-[#D8D9DD]/15">
                          <div className="w-5 text-center font-bold text-[10px] text-[#F5F5F7]/60">{i + 1}</div>
                          <img src={g.avatar_url || '/royce/elix-mark.svg'} alt="" className="w-7 h-7 rounded-full object-cover border border-[#D8D9DD]/20" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-bold text-white truncate">{g.username || 'Supporter'}</div>
                          </div>
                          <div className="text-[#D9A62E] text-[10px] font-bold whitespace-nowrap">{g.total_coins.toLocaleString()} coins</div>
                        </div>
                      ))}
                    </div>
                  </div>
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
                className="elix-panel elix-live-sheet rounded-t-2xl p-3 pb-safe h-[40vh] overflow-y-auto no-scrollbar shadow-2xl w-full "
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
                          className="w-full py-2 bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] font-bold text-[10px] uppercase tracking-wide rounded-xl active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        >
                          {isSubscribing ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white/30 border-t-[#F5F5F7] rounded-full animate-spin" />
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
              <GiftPanel
                onSelectGift={handleSendGift}
                userCoins={coinBalance}
                starterCoins={starterCoinBalance}
                promotionalCoins={promotionalCoinBalance}
                giftSource={giftSource}
                onGiftSourceChange={setGiftSource}
                onRechargeSuccess={(newBalance) => {
                  const paid = Math.max(0, Number(newBalance) || 0);
                  walletCoinBalanceRef.current = paid;
                  useWalletStore.getState().applyServerBalances({ paid });
                }}
                battleBoost={
                  spectatorBattle?.active
                    ? {
                        boosterActive: !!(activeBooster && activeBooster.expiresAt > Date.now()),
                        boosterMultiplier:
                          activeBooster && activeBooster.expiresAt > Date.now()
                            ? activeBooster.multiplier
                            : null,
                        mistActive: !!(mistFog && mistFog.expiresAt > Date.now()),
                        onBooster: fireAutoBooster,
                        onMist: fireMistFog,
                      }
                    : null
                }
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
              <div className="elix-panel elix-live-sheet backdrop-blur-md rounded-t-2xl h-[40vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="relative flex flex-col px-4 pt-2 pb-2 border-b border-white/10 flex-shrink-0">
                  <div className="flex justify-center pb-2" aria-hidden>
                    <div className="w-10 h-1 rounded-full bg-white/25" />
                  </div>
                  <div className="relative flex items-center justify-center min-h-[28px]">
                    <div className="absolute left-0 inset-y-0 flex items-center gap-1 z-10" title="Viewers watching">
                      <Eye size={12} className="text-white/50" />
                      <span className="text-white/60 text-xs font-semibold tabular-nums">
                        {typeof viewerCount === 'number' && Number.isFinite(viewerCount)
                          ? viewerCount.toLocaleString()
                          : '0'}
                      </span>
                    </div>
                    <h3 className="text-[#F5F5F7] font-bold text-sm text-center w-full px-10">Top viewers & gifters</h3>
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
                        onClick={() => { setShowViewersPanel(false); navigate(watchLiveProfilePath(effectiveStreamId, v.id)); }}
                      >
                        <span className="text-white/30 text-xs font-bold w-5 text-right">{i + 1}</span>
                        <div className="relative flex-shrink-0">
                          <div className={isMvp ? MVP_RING_PHOTO_SOFT_CLASS : 'rounded-full'}>
                            <AvatarRing
                              src={resolveCircleAvatar(v.avatar, label)}
                              alt={label}
                              size={LIVE_MVP_PROFILE_RING_PX}
                              ringColor={isMvp ? MVP_GOLD : undefined}
                            />
                          </div>
                          {isMvp ? (
                            <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 z-[2] ${MVP_BADGE_CLASS}`}>
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
              <div className="elix-panel elix-share-sheet rounded-t-2xl p-3 pb-safe flex flex-col shadow-2xl w-full h-[40vh] overflow-hidden ">
                <div className="relative flex flex-col px-1 pt-0 pb-2 border-b border-white/10 flex-shrink-0">
                  <div className="flex justify-center pb-2" aria-hidden>
                    <div className="w-10 h-1 rounded-full bg-white/25" />
                  </div>
                  <div className="absolute left-2 top-0 flex items-center gap-1 z-10" style={{ transform: 'translateY(1mm)' }}>
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
                        className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform overflow-visible"
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
                              }).catch((err) => reportFailure('live_engagement_progress', err));
                            }
                            showToast(`Shared live with ${u.name}`);
                          } catch {
                            showToast('Could not share');
                          }
                        }}
                      >
                        <StoryGoldRingAvatar
                          size={SHARE_PANEL_AVATAR_PX}
                          src={u.avatar || ''}
                          alt={u.name}
                          live={shareLiveUserIds.has(u.id)}
                        />
                        <span className="text-white/80 text-[11px] font-medium truncate w-full text-center">{u.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Line between user circles and action icons */}
                <div className="mx-4 border-t border-[#D8D9DD]/45 flex-shrink-0" aria-hidden />
                {/* Action icons only — 4mm below the line */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-4 no-scrollbar" style={{ paddingTop: '3mm', scrollbarWidth: 'none' }}>
                  {/* Share creator's live: all links use /watch/{creatorStreamId} */}
                  <div className="grid grid-cols-5 gap-y-3 gap-x-1.5 pt-0">
                    {[
                      { name: 'WhatsApp', icon: <MessageCircle size={22} className="text-white" />, action: () => { openExternalLink(`https://wa.me/?text=${encodeURIComponent('Watch this on Elix! ' + `${window.location.origin}/watch/${effectiveStreamId}`)}`); if (effectiveStreamId) { earnBattleEnergyQuiet('share', effectiveStreamId); void apiLiveEngagementProgress({ metric: 'shares', delta: 1, roomId: effectiveStreamId }).catch((err) => reportFailure('live_engagement_progress', err)); } setShowSharePanel(false); } },
                      { name: 'Facebook', icon: <Share2 size={22} className="text-white" />, action: () => { openExternalLink(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}/watch/${effectiveStreamId}`)}`); if (effectiveStreamId) { earnBattleEnergyQuiet('share', effectiveStreamId); void apiLiveEngagementProgress({ metric: 'shares', delta: 1, roomId: effectiveStreamId }).catch((err) => reportFailure('live_engagement_progress', err)); } setShowSharePanel(false); } },
                      { name: 'Copy Link', icon: <Copy size={22} className="text-white" />, action: () => { navigator.clipboard.writeText(`${window.location.origin}/watch/${effectiveStreamId}`); if (effectiveStreamId) { earnBattleEnergyQuiet('share', effectiveStreamId); void apiLiveEngagementProgress({ metric: 'shares', delta: 1, roomId: effectiveStreamId }).catch((err) => reportFailure('live_engagement_progress', err)); } showToast('Link copied!'); setShowSharePanel(false); } },
                      { name: 'Repost live', icon: <RefreshCw size={22} className="text-white" />, action: async () => {
                        if (!effectiveStreamId) {
                          showToast('Live not ready to repost');
                          return;
                        }
                        const { data, error } = await apiToggleRepost({
                          targetType: 'live',
                          targetId: effectiveStreamId,
                        });
                        if (error || !data) {
                          showToast(error || 'Could not save repost');
                          return;
                        }
                        if (data.reposted) {
                          earnBattleEnergyQuiet('share', effectiveStreamId);
                          void apiLiveEngagementProgress({ metric: 'shares', delta: 1, roomId: effectiveStreamId }).catch((err) => reportFailure('live_engagement_progress', err));
                          showToast('Added to Reposts');
                        } else {
                          showToast('Removed from Reposts');
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
                className="relative elix-panel elix-more-options-sheet elix-live-sheet rounded-t-2xl pb-safe h-[40vh] overflow-y-auto no-scrollbar shadow-2xl w-full"
                onClick={(e) => e.stopPropagation()}
              >
                {areTestCoinsEnabled() && user?.id && (
                  <button
                    type="button"
                    onClick={openTestCoinsModal}
                    className="absolute top-1 right-1 z-20 w-10 h-10 p-0 m-0 flex items-center justify-center"
                    aria-label="Test coins"
                  >
                    {/* Invisible mark — blends into the sheet; same hit area; password gate; never real money */}
                    <span
                      className="block w-2 h-2 rounded-full bg-transparent"
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
                    disabled={!isCoHosting}
                    onClick={() => { void flipCamera(); setIsMoreMenuOpen(false); }}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform disabled:opacity-40"
                  >
                    <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0 !bg-transparent">
                      <RefreshCw className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} fill="none" />
                    </div>
                    <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Flip</span>
                  </button>

                  <button
                    type="button"
                    disabled={!isCoHosting}
                    onClick={() => { toggleMic(); setIsMoreMenuOpen(false); }}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform disabled:opacity-40"
                  >
                    <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0 !bg-transparent">
                      {isMicMuted
                        ? <MicOff className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} fill="none" />
                        : <Mic className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} fill="none" />}
                    </div>
                    <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">{isMicMuted ? 'Unmute' : 'Mute'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={!isCoHosting}
                    onClick={() => { toggleCam(); setIsMoreMenuOpen(false); }}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform disabled:opacity-40"
                  >
                    <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0 !bg-transparent">
                      {isCamOff
                        ? <CameraOff className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} fill="none" />
                        : <Camera className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} fill="none" />}
                    </div>
                    <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">{isCamOff ? 'Cam On' : 'Cam Off'}</span>
                  </button>

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
                    onClick={() => { setShowPromotePanel(true); setIsMoreMenuOpen(false); }}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
                  >
                    <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                      <TrendingUp className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />
                    </div>
                    <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Promote</span>
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

        {/* TEST COINS — bottom sheet + fundal (same pattern as More Options) */}
        {areTestCoinsEnabled() && user?.id && showTestCoinsModal && (
          <>
            <div
              className="fixed inset-0 bg-black/35 pointer-events-auto"
              style={{ zIndex: 100000 }}
              onClick={closeTestCoinsModal}
            />
            <div className="fixed bottom-0 left-0 right-0 z-[100001] pointer-events-auto max-w-[480px] mx-auto">
              <div
                className="relative elix-panel elix-more-options-sheet elix-live-sheet rounded-t-2xl pb-safe h-[40vh] overflow-y-auto no-scrollbar shadow-2xl w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col px-4 pt-2 pb-3 border-b border-white/10">
                  <div className="flex justify-center pb-2" aria-hidden>
                    <div className="w-10 h-1 rounded-full bg-white/25" />
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4 text-[#F5F5F7]" />
                    <span className="text-[#F5F5F7] font-bold text-sm text-center">
                      {testCoinsStep === 'password' ? 'Enter Password' : 'Add Test'}
                    </span>
                  </div>
                </div>

                <div className="px-4 pt-3 pb-4">
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
                        className="flex-1 py-2.5 rounded-xl bg-transparent border border-[#D8D9DD]/40 text-white/70 text-sm font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!testCoinsPwd || testCoinsBusy}
                        className="flex-1 py-2.5 rounded-xl bg-transparent border border-[#D8D9DD]/40 text-white text-sm font-bold disabled:opacity-40"
                      >
                        Unlock
                      </button>
                    </div>
                  </form>
                )}

                {testCoinsStep === 'amount' && (
                  <form onSubmit={(e) => { void submitTestCoinsAmount(e); }}>
                    <p className="text-white/40 text-xs mb-3">Test coins only — battle score + gift animation. Never real money, wallet, or creator revenue.</p>
                    <div className="flex items-center gap-2 mb-2">
                      <Coins className="w-4 h-4 text-[#D9A62E]" />
                      <span className="text-white/60 text-xs">Test balance: {testCoinBalance.toLocaleString()}</span>
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
                        Max (100M) – Add test coins once
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={closeTestCoinsModal}
                        className="flex-1 py-2.5 rounded-xl bg-transparent border border-[#D8D9DD]/40 text-white/70 text-sm font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!testCoinsAmount || testCoinsBusy}
                        className="flex-1 py-2.5 rounded-xl bg-transparent border border-[#D8D9DD]/40 text-white text-sm font-bold disabled:opacity-40"
                      >
                        Add Test Coins
                      </button>
                    </div>
                  </form>
                )}
                </div>
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

