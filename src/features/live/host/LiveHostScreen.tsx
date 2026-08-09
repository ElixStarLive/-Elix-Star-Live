import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { showToast } from '../../../lib/toast';
import { platform, openExternalLink, nativeShareUrl } from '../../../lib/platform';
import {
  prepareLiveVideoEl,
  LIVE_WEBRTC_VIDEO_CLASS,
  LIVE_VIDEO_TRANSPARENT_POSTER,
} from '../../../lib/prepareLiveVideoEl';
import {
  Play,
  Search,
  Heart,
  MessageCircle,
  Share2,
  RefreshCw,
  Mic,
  MicOff,
  Gift,
  MoreVertical,
  Users,
  Copy,
  AlertTriangle,
  PlusCircle,
  TrendingUp,
  User,
  UserPlus,
  X,
  Sword,
  Flag,
  Camera,
  CameraOff,
  Sparkles,
  Timer,
  BarChart3,
  ArrowLeftRight,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { FILTER_PRESETS } from '../../../lib/ai/filters';
import { GiftUiItem, GIFT_COMBO_MAX, resolveGiftAssetUrl, preferPlayableGiftVideoUrl, fetchGiftsFromDatabase, pickGiftVideoUrl, formatGiftDisplayName } from '../../../lib/giftsCatalog';
import { appendCapped, LIVE_CHAT_MESSAGE_CAP, LIVE_GIFT_QUEUE_CAP, LIVE_VIEWER_CAP } from '../../../lib/liveRuntimeCaps';
import { BattleVfxOverlays, GloveIcon, type BattleMistSide, type GloveBurst } from '../../../components/BattleVfxOverlays';
import { BattleTauntOverlays } from '../../../components/BattleTauntOverlays';
import { LiveFaceEffectsLayer } from '../../../components/LiveFaceEffectsLayer';
import { LIVE_FACE_EFFECT_OPTIONS, getLiveFaceEngineLabel } from '../../../lib/liveFaceEffectsProvider';
import {
  announceMvpName,
  createTauntBurst,
  maybeTauntLeadChange,
  playBattleTauntSound,
  type TauntBurst,
} from '../../../lib/battleTaunts';
import { GiftOverlay } from '../../../components/GiftOverlay';
import GiftAnimationOverlay from '../../../components/GiftAnimationOverlay';
import { LiveGiftFeedStack } from '../../../components/LiveGiftFeedStack';
import { ChatOverlay } from '../../../components/ChatOverlay';
import { FaceARGift } from '../../../components/FaceARGift';
import { useLivePromoStore } from '../../../store/useLivePromoStore';
import { AvatarRing } from '../../../components/AvatarRing';
import { LevelBadge } from '../../../components/LevelBadge';
import {
  LIVE_MVP_PROFILE_RING_PX,
  BATTLE_MVP_ROW_EDGE_OFFSET_MM,
  LIVE_BATTLE_VIDEO_HEIGHT,
  LIVE_BATTLE_CHAT_HEIGHT,
  LIVE_BATTLE_CHAT_SHIFT_Y,
  LIVE_TOP_AVATAR_RING_PX,
  LIVE_BOTTOM_ACTION_PADDING,
  LIVE_BOTTOM_ACTION_RESERVE,
} from '../../../lib/profileFrame';
import { resolveUiAvatarUrl } from '../../../lib/royceAssets';
import { RoyceCloseIcon } from '../../../components/royce';
import { useAuthStore } from '../../../store/useAuthStore';
import { useVideoStore } from '../../../store/useVideoStore';
import { clearCachedCameraStream, getCachedCameraStream, setCachedCameraStream } from '../../../lib/cameraStream';
import { apiUrl, getLiveKitUrl } from '../../../lib/api';
import { request } from '../../../lib/apiClient';
import { giftSendErrorToast } from '../../../lib/giftSend';
import {
  apiLiveStart,
  apiLiveEnd,
  apiLiveToken,
  apiLiveStreams,
  LiveRoomLifecycle,
} from '../../../lib/live';
import type {
  LiveMessage,
  UniverseTickerMessage,
  LiveViewer,
  BattleState,
  BattleSlot,
} from '../types';
import { normalizeUserId, sameUserId, isSelfUser } from '../utils/ids';
import {
  fetchAllSharePanelContacts,
  SHARE_PANEL_ACTION_DISC_PX,
  SHARE_PANEL_ACTION_ICON_PX,
  SHARE_PANEL_AVATAR_PX,
  SHARE_PANEL_ITEM_WIDTH_PX,
} from '../../../lib/sharePanelContacts';
import ReportModal from '../../../components/ReportModal';
import PromotePanel from '../../../components/PromotePanel';
import { GiftPanel } from '../../../components/GiftPanel';
import { GiftGoalGallery } from '../../../components/GiftGoalGallery';
import { LiveEngagementOverlay } from '../../../components/LiveEngagementOverlay';
import { useLiveEngagement } from '../../../hooks/useLiveEngagement';
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
import { parseLiveGiftGoal, type LiveGiftGoal } from '../../../lib/liveGiftGoal';
import { liveStreamUiGiftTargetToServerBattleTarget, normalizeBattleGiftTarget } from '../../../lib/liveBattleGiftTarget';
import { engagementFlags } from '../../../config/engagementFlags';
import { earnBattleEnergyQuiet } from '../../../components/BattleEnergyBoostControls';
import { apiLiveGetDailyHearts, apiLiveMembership, apiLiveSendDailyHeart } from '../engagement/liveEngagementApi';
import { liveChatSend } from '../chat/liveChatActions';
import {
  EngagementDrawer,
  type EngagementPanel,
} from '../../../components/engagement/EngagementDrawer';
import { purchaseMembership } from '../../../lib/iap';
import type { Room } from 'livekit-client';
import { ConnectionState } from 'livekit-client';
import { useWalletStore } from '../../../store/useWalletStore';
import { App as CapacitorApp } from '@capacitor/app';

const LIVE_BOTTOM_ICON_BTN =
  'w-10 h-10 flex items-center justify-center rounded-full bg-transparent border-0 shadow-none active:scale-95 transition-transform flex-shrink-0';

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

const _EMOJI_LIST = ['ðŸ˜€','ðŸ˜‚','ðŸ¥°','ðŸ˜','ðŸ”¥','ðŸ’¯','ðŸ‘','ðŸŽ‰','â¤ï¸','ðŸ’œ','ðŸ’™','â­','ðŸŒŸ','âœ¨','ðŸ™Œ','ðŸ‘‘','ðŸ’Ž','ðŸš€','ðŸŽµ','ðŸ’ƒ','ðŸ•º','ðŸ˜Ž','ðŸ¤©','ðŸ’ª','ðŸ«¶','ðŸ’–'];

import { useLiveHostController } from './useLiveHostController';

/** Thin Live host UI shell â€” orchestration owns useLiveHostController. */
export default function LiveHostScreen() {
  const {
    MAX_CO_HOSTS,
    PROMOTE_LIKES_THRESHOLD_LIVE,
    SPEED_CHALLENGE_ENABLED,
    _PROMOTE_LIKES_THRESHOLD_BATTLE,
    _allSlotsAccepted,
    _anySlotFilled,
    _battleGiftIconFailed,
    _battleKeyboardLikeArmedRef,
    _battleReadiness,
    _battleUiRole,
    _closeBattleMatch,
    _formatStreamName,
    _giftBanner,
    _giftBannerTimer,
    _hostIsReady,
    _iAmReady,
    _isLiveNormal,
    _isRegularViewer,
    _lastBattleScoreUpdateTraceSigRef,
    _lastBattleTapTimeRef,
    _liveHostCreators,
    _memberCount,
    _membershipHeartActive,
    _offlineHostCreators,
    _openMembershipBar,
    _opponentIsReady,
    _rawStreamId,
    _setBattleGiftIconFailed,
    _setBattleReadiness,
    _setGiftBanner,
    _setHostSearchQuery,
    _setMembershipHeartActive,
    _setShowEmojiPicker,
    _setShowMembershipBar,
    _setViewerHasStream,
    _showEmojiPicker,
    _showMembershipBar,
    _speedChallengeTimerRef,
    _startBattleMatch,
    _startBattleWithCreator,
    _universeDurationSeconds,
    acceptBattleInvite,
    applyMembershipStats,
    acceptBattleInviteClick,
    acceptCohostInvite,
    acceptCohostInviteClick,
    acceptJoinRequest,
    acceptJoinRequestFromViewerList,
    activeFaceARGift,
    activeLikes,
    activeLiveFaceEffect,
    activeViewers,
    activeViewersRef,
    addLiveLikes,
    allFilledAccepted,
    applyLiveFaceEffectPreset,
    applyLiveFilterPreset,
    attachRemoteAudio,
    battleCountdown,
    battleEndedTimeoutRef,
    battleFreeTapUsedRef,
    battleGloves,
    battleHideScores,
    battleJoinerConnectIdRef,
    battleLifecycleRef,
    battleLkRoomRef,
    battleMistSide,
    battleMistTimerRef,
    battleParticipantStream,
    battlePeerRef,
    battleRoleRef,
    battleScoreBarHidden,
    battleScoresRef,
    battleScreenTapCount,
    battleScreenTapCountRef,
    battleServerTotals,
    battleServerTotalsRef,
    battleSlots,
    battleSlotsRef,
    battleSpectatorOverlayRef,
    battleState,
    battleStateRef,
    battleStreamIdsRef,
    battleTapScoreRemainingRef,
    battleTauntBursts,
    battleTime,
    battleTripleTapRef,
    battleVoteGridRef,
    battleWinner,
    battleTeamWinner,
    battleWinStreak,
    bindHostCameraPreview,
    blockMiniProfileUser,
    blueTeamScore,
    boosterActivations,
    boosterCatches,
    buildMvpRanked,
    cameraError,
    cameraFacing,
    cameraOffPlayers,
    cameraRecoverAtRef,
    cameraRecoverInFlightRef,
    cameraStream,
    cameraStreamRef,
    chatHeartLayerRef,
    clearActiveFaceARGift,
    clearBattleInviteTimer,
    clearGiftGoal,
    clearInvitedBattleSlot,
    closeAllBottomPanels,
    closeFanClub,
    closeFindCreatorsPanel,
    closeGiftPanel,
    closeLiveEffectsPanel,
    closeLiveWithSlide,
    closeMembershipBar,
    closeMiniProfile,
    closeMoreMenu,
    closePromotePanel,
    closeRankingPanel,
    closeReportModal,
    closeSharePanel,
    closeTeamStatus,
    closeViewerList,
    coHostCameraOff,
    coHostTimersRef,
    coHostVideoRefs,
    coHosts,
    coHostsRef,
    cohostGiftScores,
    cohostLastGifts,
    coinBalance,
    comboCount,
    comboStack,
    comboTimerRef,
    creatorName,
    creatorNameRef,
    creatorQuery,
    creatorStickers,
    creators,
    creatorsLoadFailed,
    creatorsLoading,
    creatorsToInvite,
    currentGift,
    currentUniverse,
    dailyHeartCount,
    declineBattleInvite,
    declineCohostInvite,
    declineJoinRequest,
    declineJoinRequestFromViewerList,
    deleteSticker,
    determine4PlayerWinner,
    diamondLeagueRank,
    effectiveStreamId,
    effectiveStreamIdRef,
    endBattleCleanup,
    endCoHostMode,
    engagementOpen,
    engagementPanel,
    enqueueGiftVideoRef,
    enqueueUniverse,
    exitBattleMode,
    exitBattleModeRef,
    featuredBigVideoRef,
    featuredHost,
    featuredUserId,
    featuredUserIdRef,
    filledSlots,
    filteredCreators,
    filteredHostCreators,
    findCoHostVideoEl,
    flipCamera,
    floatingHearts,
    followCreatorLive,
    followingUsers,
    formatCoinsShort,
    formatCountShort,
    formatTime,
    giftGoal,
    giftKey,
    giftQueue,
    giftSource,
    giftTarget,
    gloveIdRef,
    goMiniProfileFromMini,
    goalPick,
    goalSaving,
    goalTargetCount,
    handleBattleTap,
    handleComboClick,
    handleGiftEnded,
    handleLikeTap,
    handleMiniProfileFollowToggle,
    handleMiniProfileShare,
    handleScreenTap,
    handleSendGift,
    handleSendMessage,
    handleSubscribe,
    hasJoinedToday,
    hasOpponentStream,
    hasOpponentStreamRef,
    heartFloatAvatar,
    heartFloatName,
    heartMembers,
    hostAvatar,
    hostLifecycleRef,
    hostName,
    hostSearchQuery,
    hostSmallVideoRef,
    inputValue,
    inviteCoHost,
    inviteCoHostFromViewer,
    inviteCreatorToSlot,
    inviteTimersRef,
    isBattleJoiner,
    isBattleMode,
    isBattleModeRef,
    isBattleParticipant,
    isBroadcast,
    isBroadcastRef,
    isBroadcaster,
    isCamOff,
    isChatVisible,
    isCreatorParticipant,
    isFindCreatorsOpen,
    isFollowing,
    isGenericViewerName,
    isMicMuted,
    isMoreMenuOpen,
    isMyStreamLive,
    isReportModalOpen,
    isSpeakingUser,
    isSubscribing,
    lastGifts,
    lastScreenTapRef,
    lastSentGift,
    leftPct,
    leftPctRaw,
    liveCoHosts,
    liveFilterBeforeFaceGiftRef,
    liveFilterCss,
    liveKitCreds,
    liveKitRoomRef,
    liveLikes,
    liveRegisteredRef,
    liveViewerLabel,
    loadCreators,
    localBattleTimerRef,
    location,
    maybeEnqueueUniverse,
    maybeResolveViewerIdentity,
    maybeTriggerFaceARGift,
    membershipTimerRef,
    messages,
    miniProfile,
    miniProfileFollowClick,
    miniProfileFollowsThem,
    miniProfileShareClick,
    missionGiftsGoal,
    missionGiftsSent,
    missionWatchGoal,
    missionWatchMin,
    mistFog,
    mistHidesScores,
    moderationIntervalRef,
    moderationWarningMessage,
    moderators,
    moreFlipCamera,
    moreReport,
    moreShare,
    moreToggleCam,
    moreToggleChat,
    moreToggleMic,
    mutedPlayers,
    mvpGiftScores,
    mvpGiftScoresHost,
    mvpGiftScoresOpponent,
    myAvatar,
    myCreatorName,
    myHeartCount,
    myScore,
    navigate,
    onComboButtonClick,
    openBattleChrome,
    openCoHostGiftFromGrid,
    openDailyRanking,
    openEngagementFromMore,
    openEngagementMissions,
    openFindCreatorsFromHeader,
    openGiftFromRanking,
    openGiftPanel,
    openGiftPanelForCohost,
    openGiftPanelIfSpectator,
    openLiveEffectsPanel,
    openMembershipFromGift,
    openBattlePartnerMiniProfile,
    openMiniProfile,
    openMoreMenu,
    openSharePanel,
    openSpectatorPoll,
    openSpectatorsPanel,
    openTopGiftersAll,
    openTopGiftersHost,
    openTopGiftersOpponent,
    openTopGiftersPanel,
    openViewerMiniProfile,
    openWeeklyRanking,
    openGiftGoalPanel,
    openWeeklyRankingFromGift,
    opponentCreatorName,
    opponentLifecycleRef,
    opponentLkConnectIdRef,
    opponentLkRoomRef,
    opponentRemoteAudioRef,
    opponentScore,
    opponentStreamKey,
    opponentVideoRef,
    pageExiting,
    pendingCohostInvite,
    pendingInvite,
    pendingJoinRequest,
    playedGiftVideoTxnRef,
    player3Score,
    player3VideoRef,
    player4Score,
    player4VideoRef,
    prevBattleSyncStatusRef,
    prevMvpHostIdRef,
    prevMvpOpponentIdRef,
    promotionalCoinBalance,
    publishHostLiveKitTracks,
    pushBattleTaunt,
    pushComboStack,
    rankingInitialTab,
    reachedThresholdsRef,
    recordLiveShareProgress,
    redTeamScore,
    remoteCamOff,
    removeCoHost,
    removeFanClubSticker,
    removePlayerFromSlot,
    resetBattleForRematch,
    resetComboTimer,
    resolveCircleAvatar,
    resolveSpectatorVoteTargetFromWatchedStream,
    restoreHostCameraPreview,
    roomRemoteAudioRef,
    roseCount,
    roseCountRef,
    saveGiftGoal,
    seenChatMsgIdRef,
    selectedCohostGiftUserId,
    selfUserIdRef,
    sendShareToFollower,
    sendSpectatorCohostRequest,
    sessionContribution,
    setActiveFaceARGift,
    setActiveLiveFaceEffect,
    setActiveViewers,
    setBattleCountdown,
    setBattleGloves,
    setBattleHideScores,
    setBattleMistSide,
    setBattleParticipantStream,
    setBattleScoreBarHidden,
    setBattleScreenTapCount,
    setBattleServerTotals,
    setBattleSlots,
    setBattleState,
    setBattleTauntBursts,
    setBattleTime,
    setBattleUiRole,
    setBattleWinner,
    setBoosterActivations,
    setBoosterCatches,
    setCameraError,
    setCameraFacing,
    setCameraOffPlayers,
    setCameraStream,
    setCoHostCameraOff,
    setCoHosts,
    setCohostGiftScores,
    setCohostLastGifts,
    setCoinBalance,
    setComboCount,
    setComboStack,
    setCreatorQuery,
    setCreatorStickers,
    setCreators,
    setCreatorsLoadFailed,
    setCreatorsLoading,
    setCurrentGift,
    setCurrentUniverse,
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
    setGiftTarget,
    setGoalPick,
    setGoalSaving,
    setGoalTargetCount,
    setHasJoinedToday,
    setHasOpponentStream,
    setHeartMembers,
    setHostAvatar,
    setHostIsReady,
    setHostName,
    setIAmReady,
    setInputValue,
    setIsBattleMode,
    setIsCamOff,
    setIsChatVisible,
    setIsFindCreatorsOpen,
    setIsFollowing,
    setIsMicMuted,
    setIsMoreMenuOpen,
    setIsMyStreamLive,
    setIsReportModalOpen,
    setIsSubscribing,
    setLastGifts,
    setLastSentGift,
    setLiveFilterCss,
    setLiveLikes,
    setMemberCount,
    setMessages,
    setMiniProfile,
    setMiniProfileFollowsThem,
    setMissionGiftsGoal,
    setMissionGiftsSent,
    setMissionWatchGoal,
    setMissionWatchMin,
    setMistFog,
    setModerationWarningMessage,
    setModerators,
    setMutedPlayers,
    setMvpGiftScores,
    setMvpGiftScoresHost,
    setMvpGiftScoresOpponent,
    setMyHeartCount,
    setMyScore,
    setOpponentCreatorName,
    setOpponentIsReady,
    setOpponentScore,
    setOpponentStreamKey,
    setPageExiting,
    setPendingCohostInvite,
    setPendingInvite,
    setPendingJoinRequest,
    setPlayer3Score,
    setPlayer4Score,
    setPromo,
    setPromotionalCoinBalance,
    setRankingInitialTab,
    setRemoteCamOff,
    setRoseCount,
    setSelectedCohostGiftUserId,
    setSessionContribution,
    setShareFollowers,
    setShareQuery,
    setShareSentTo,
    setShowComboButton,
    setShowFanClub,
    setShowGiftPanel,
    setShowJoinAnimation,
    setShowLiveEffectsPanel,
    setShowModerationWarning,
    setShowPromotePanel,
    setShowRankingPanel,
    setShowSharePanel,
    setShowTeamStatus,
    setShowViewerList,
    setSpeakingIds,
    setSpectatorCoHostRequestSent,
    setSpectatorTapsUsed,
    setSpeedChallengeActive,
    setSpeedChallengeResult,
    setSpeedChallengeTaps,
    setSpeedChallengeTime,
    setSpeedMultiplier,
    setStarterCoinBalance,
    setStickerUploading,
    setTopGifters,
    setTopGiftersSide,
    setTotalGiftCoins,
    setUniverseQueue,
    setUserLevel,
    setUserXP,
    setViewerCount,
    setViewerListMode,
    shareCopyLink,
    shareFacebook,
    shareFollowers,
    sharePromote,
    shareQuery,
    shareReport,
    shareRepostLive,
    shareSentTo,
    shareWhatsApp,
    showComboButton,
    showFanClub,
    showGiftPanel,
    showJoinAnimation,
    showLiveEffectsPanel,
    showModerationWarning,
    showPromotePanel,
    showRankingPanel,
    showSharePanel,
    showTeamStatus,
    showViewerList,
    sideMissions,
    sideSupporters,
    spawnHeartAt,
    spawnHeartAtSide,
    spawnHeartFromClient,
    speakingIds,
    spectatorCoHostRequestSent,
    spectatorTapPointsRef,
    speedChallengeActive,
    speedChallengeActiveRef,
    speedChallengeResult,
    speedChallengeTaps,
    speedChallengeTapsRef,
    speedChallengeTime,
    speedMultiplier,
    speedMultiplierRef,
    stageRef,
    startBattleWithAcceptedCreators,
    startMatchFromFindCreators,
    startMysteryFromMore,
    startSpeedChallenge,
    starterCoinBalance,
    stickerUploading,
    stickersFetchedRef,
    stopBroadcast,
    storePaidBalance,
    storePromoBalance,
    storeStarterBalance,
    toggleBattle,
    toggleCam,
    toggleCoHostCamera,
    toggleCoHostMute,
    toggleFeaturedUser,
    toggleHostPoll,
    toggleHostPollCore,
    toggleHostPollFromMore,
    toggleMic,
    toggleMiniProfileModerator,
    togglePlayerCamera,
    togglePlayerMute,
    topGifters,
    topGiftersForPanel,
    topGiftersRanked,
    topGiftersSide,
    topMvpHostBattle,
    topMvpOpponentBattle,
    topMvpViewers,
    totalGiftCoins,
    totalScore,
    triggerBattleVfx,
    triggerRematch,
    triggerRematchFromMore,
    universeGiftLabel,
    universeQueue,
    universeText,
    uploadSticker,
    updateUser,
    user,
    userLevel,
    userXP,
    videoRef,
    viewerAvatar,
    viewerCount,
    viewerHasStream,
    viewerIdentityCacheRef,
    viewerIdentityInflightRef,
    viewerListMode,
    viewerName,
    viewerVideoRef,
    watchMiniProfileLive,
    votePoll,
    walletCoinBalanceRef,
    engagementState,
    engagementNowMs,
    milestoneFlash,
    stageFlash,
    startMystery,
    startPoll,
    endPoll,
  } = useLiveHostController();

  // Cosmic fundal behind chat/bottom ONLY in co-host or battle — never normal solo live.
  const hasCoHostLowerFundal =
    isBattleMode ||
    coHosts.some(
      (h) =>
        (h.status === 'live' ||
          h.status === 'accepted' ||
          h.status === 'invited' ||
          h.status === 'pending_accept') &&
        !sameUserId(h.userId, user?.id),
    );

  return (
    <div
      className="elix-live-room elix-fundal-glass fixed inset-0 flex justify-center z-[9990] transition-transform duration-[250ms] ease-out"
      style={{ transform: pageExiting ? 'translateX(100%)' : undefined }}
    >
      <div className={`relative w-full max-w-[480px] h-full overflow-hidden overflow-x-hidden border-none ${
        isBattleMode
          ? 'elix-battle-room-fundal'
          : hasCoHostLowerFundal
            ? 'elix-live-chat-fundal'
            : 'elix-fundal-glass'
      }`}>
        <div className="h-full w-full relative">
        {isBattleMode ? (
          <div
            className="elix-battle-lower-fundal pointer-events-none absolute inset-x-0 bottom-0 z-[1]"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 112px - 0.5mm + 44dvh - 3mm)' }}
            aria-hidden
          />
        ) : hasCoHostLowerFundal ? (
          <div
            className="elix-live-chat-fundal pointer-events-none absolute inset-x-0 bottom-0 z-[1]"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 78px)' }}
            aria-hidden
          />
        ) : null}
        <audio ref={roomRemoteAudioRef} autoPlay playsInline className="hidden" />
        <audio ref={opponentRemoteAudioRef} autoPlay playsInline className="hidden" />
        {/* Live video layer — clear under stream (no fundal wallpaper over camera) */}
        <div className="absolute inset-0 z-0 overflow-hidden bg-transparent">
          <div className="video-zone relative w-full h-full">
            <div ref={stageRef} className="relative w-full h-full">
            {/* Base Video Layer */}
        {!isBattleMode && (() => {
          // Include invited/pending so split layout appears when a seat opens —
          // not only after accept/live (which left full-screen until a re-tap).
          const hasAnyCoHost = coHosts.some(
            (h) =>
              (h.status === 'live' ||
                h.status === 'accepted' ||
                h.status === 'invited' ||
                h.status === 'pending_accept') &&
              !sameUserId(h.userId, user?.id),
          );
          return (
          <div
            className={hasAnyCoHost ? 'absolute inset-x-0 z-[25] flex flex-row gap-0' : 'absolute inset-0 w-full h-full'}
            style={hasAnyCoHost ? { top: 'calc(90px + 6mm)', height: 'calc(36dvh + 10mm)', filter: liveFilterCss !== 'none' ? liveFilterCss : undefined } : { filter: liveFilterCss !== 'none' ? liveFilterCss : undefined }}
            onPointerDown={isCreatorParticipant ? undefined : (e) => {
              if (e.target instanceof Element) {
                const interactive = e.target.closest('button, a, input, textarea, select, [role="button"]');
                if (interactive) return;
              }
              handleLikeTap(e);
              const now = Date.now();
              const last = lastScreenTapRef.current;
              lastScreenTapRef.current = now;
              if (now - last <= 320) handleComboClick();
            }}
          >
            {/* Left: Host camera (or featured co-host) â€” 50% when co-hosts present, else full */}
            <div
              className={`${hasAnyCoHost ? 'w-1/2 min-w-0 relative elix-cohost-cut-corner' : 'absolute inset-0 w-full h-full'} ${
                (featuredHost ? isSpeakingUser(featuredHost.userId) : isSpeakingUser(user?.id))
                  ? 'elix-speaking-pulse'
                  : ''
              }`}
              onPointerDown={isBroadcast ? (e) => {
                if (e.target instanceof Element && e.target.closest('button, a, input, textarea, select, [role="button"]')) return;
                handleLikeTap(e);
                const now = Date.now();
                const last = lastScreenTapRef.current;
                lastScreenTapRef.current = now;
                if (now - last <= 320) handleComboClick();
              } : undefined}
            >
            {isBroadcast || isBattleParticipant ? (
              <>
                <video
                  ref={bindHostCameraPreview}
                  className={`absolute inset-0 w-full h-full object-cover ${LIVE_WEBRTC_VIDEO_CLASS}`}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  poster={LIVE_VIDEO_TRANSPARENT_POSTER}
                  style={isBroadcast ? {
                    transform: 'scaleX(-1)',
                    opacity: featuredHost || isCamOff ? 0 : 1,
                    transition: 'opacity 0.3s ease',
                    pointerEvents: featuredHost ? 'none' : undefined,
                  } : undefined}
                />
                {featuredHost && (
                  <>
                    <video
                      ref={featuredBigVideoRef}
                      className={`absolute inset-0 w-full h-full object-cover z-[4] ${LIVE_WEBRTC_VIDEO_CLASS}`}
                      autoPlay
                      playsInline
                      muted
                      controls={false}
                      poster={LIVE_VIDEO_TRANSPARENT_POSTER}
                      style={{ backgroundColor: '#080A0E' }}
                    />
                    <div className="absolute top-1 left-1 z-20 flex items-center gap-1 pointer-events-auto">
                      <button
                        type="button"
                        title="Remove co-host"
                        aria-label="Remove co-host"
                        onClick={(e) => { e.stopPropagation(); removeCoHost(featuredHost.id); }}
                        className="elix-live-tile-ctrl flex items-center justify-center border-0 bg-transparent p-0.5 hover:opacity-90 active:scale-95"
                      >
                        <X size={14} strokeWidth={2.35} className="text-[#F5F5F7]" />
                      </button>
                      <button
                        type="button"
                        title="Back to host on big screen"
                        onClick={(e) => { e.stopPropagation(); setFeaturedUserId(null); }}
                        className="elix-live-tile-ctrl flex items-center gap-0.5 px-1.5 py-0.5 border-0 bg-transparent active:scale-95"
                      >
                        <ArrowLeftRight className="w-3 h-3 text-[#F5F5F7]" strokeWidth={2.5} />
                        <span className="text-[8px] font-bold text-[#F5F5F7]">Host</span>
                      </button>
                    </div>
                    <span className="absolute bottom-1 left-1 z-20 text-white/90 text-[9px] font-bold bg-black/55 rounded px-1 truncate max-w-[90%]">
                      {featuredHost.name}
                    </span>
                  </>
                )}
                {isCamOff && !featuredHost && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 elix-panel z-[5]">
                    {(user?.avatar || myAvatar) ? (
                      <img src={user?.avatar || myAvatar || ''} alt="" className="w-16 h-16 rounded-full border-2 border-[#D8D9DD]/40 object-cover object-center" />
                    ) : (
                      <div className="w-16 h-16 rounded-full border-2 border-[#D8D9DD]/40 bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
                        <span className="text-2xl font-black text-[#F5F5F7]/60">{(creatorName || user?.username || 'Me').charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <span className="text-white font-bold text-xs">{creatorName || user?.username || user?.name || 'Me'}</span>
                  </div>
                )}
                {isBroadcast && hasAnyCoHost && !featuredHost && (
                  <>
                    <button
                      type="button"
                      title="End co-host"
                      aria-label="End co-host"
                      onClick={(e) => { e.stopPropagation(); endCoHostMode(); }}
                      className="absolute top-1 left-1 z-20 elix-live-tile-ctrl flex items-center justify-center border-0 bg-transparent p-0.5 pointer-events-auto hover:opacity-90 active:scale-95"
                    >
                      <X size={14} strokeWidth={2.35} className="text-[#F5F5F7]" />
                    </button>
                    <div className="absolute top-1 right-1 z-10 flex items-end gap-1.5 pointer-events-auto">
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleMic(); }} className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 p-0.5 rounded bg-transparent">
                        {isMicMuted ? <MicOff className="w-3 h-3 text-white" strokeWidth={2.5} /> : <Mic className="w-3 h-3 text-white" strokeWidth={2.5} />}
                        <span className="text-[7px] font-semibold text-white/85 leading-none">{isMicMuted ? 'Unmute' : 'Mute'}</span>
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleCam(); }} className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 p-0.5 rounded bg-transparent">
                        {isCamOff ? <CameraOff className="w-3 h-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" strokeWidth={2.5} /> : <Camera className="w-3 h-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" strokeWidth={2.5} />}
                        <span className="text-[7px] font-semibold text-white/85 leading-none">{isCamOff ? 'Cam On' : 'Cam Off'}</span>
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <video
                  ref={(el) => {
                    viewerVideoRef.current = el;
                    if (el) prepareLiveVideoEl(el);
                  }}
                  className={`w-full h-full object-cover ${LIVE_WEBRTC_VIDEO_CLASS}`}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  poster={LIVE_VIDEO_TRANSPARENT_POSTER}
                  style={viewerHasStream ? {} : { display: 'none' }}
                />
                {!viewerHasStream && (
                  <div className="w-full h-full bg-[rgba(0,0,0,0.35)] flex flex-col items-center justify-center relative">
                    {myAvatar ? (
                      <img src={myAvatar} alt="" className="w-28 h-28 rounded-full object-cover object-center mb-4 opacity-80" />
                    ) : (
                      <div className="w-28 h-28 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center mb-4">
                        <span className="text-4xl font-black text-[#F5F5F7]/60">{creatorName.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <p className="text-white font-bold text-lg">{creatorName}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-2 h-2 rounded-full bg-white/20 animate-pulse" />
                      <span className="text-white/50 text-xs font-semibold">LIVE</span>
                    </div>
                    <div className="absolute inset-0 pointer-events-none" style={{background: 'radial-gradient(circle at center 40%, rgba(255,255,255,0.25) 0%, transparent 60%)'}} />
                  </div>
                )}
              </>
            )}

            {isBroadcast && activeFaceARGift && (
              <FaceARGift
                videoRef={videoRef}
                giftType={activeFaceARGift.type}
                color={activeFaceARGift.color || '#FFFFFF'}
                onComplete={clearActiveFaceARGift}
              />
            )}
            {isBroadcast && activeLiveFaceEffect && activeLiveFaceEffect.type !== 'none' && !activeFaceARGift && (
              <LiveFaceEffectsLayer
                videoRef={videoRef}
                effectType={activeLiveFaceEffect.type}
                color={activeLiveFaceEffect.color}
                active
              />
            )}

            {isBroadcast && cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-[rgba(0,0,0,0.35)] text-white font-bold">
                {cameraError}
              </div>
            )}
            </div>

            {/* Right: co-host 8-slot grid */}
            {hasAnyCoHost && (() => {
              // Self is in the big box unless a co-host is featured (then host moves to a small tile).
              const list = coHosts.filter(h => !sameUserId(h.userId, user?.id));
              const liveList = list.filter(h => h.status === 'live' || h.status === 'accepted');
              const featured = featuredUserId
                ? liveList.find((h) => sameUserId(h.userId, featuredUserId)) || null
                : null;
              const restLive = featured
                ? liveList.filter((h) => !sameUserId(h.userId, featured.userId))
                : liveList;
              const invitedPending = list.filter(h => h.status === 'invited' || h.status === 'pending_accept');
              const smallSlots: Array<{ type: 'host_main' | 'live' | 'invited' | 'pending' | 'empty'; host?: (typeof coHosts)[0] }> = [];
              if (featured) smallSlots.push({ type: 'host_main' });
              restLive.forEach(h => smallSlots.push({ type: 'live', host: h }));
              invitedPending.forEach(h => smallSlots.push({ type: h.status === 'invited' ? 'invited' : 'pending', host: h }));
              while (smallSlots.length < 8) smallSlots.push({ type: 'empty' });

              const renderCoHostCell = (slot: { type: 'host_main' | 'live' | 'invited' | 'pending' | 'empty'; host?: (typeof coHosts)[0] }) => {
                if (slot.type === 'host_main') {
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
                        style={{ opacity: isCamOff ? 0 : 1, transform: 'scaleX(-1)', backgroundColor: '#080A0E' }}
                      />
                      {isCamOff && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 elix-panel z-[5]">
                          {(user?.avatar || myAvatar) ? (
                            <img src={user?.avatar || myAvatar || ''} alt="" className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
                              <span className="text-[#F5F5F7]/60 text-sm font-bold">{(creatorName || 'Me').charAt(0)}</span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="absolute top-0.5 left-0.5 z-10 flex items-center gap-0.5 pointer-events-auto">
                        <button
                          type="button"
                          title="End co-host"
                          aria-label="End co-host"
                          onClick={(e) => { e.stopPropagation(); endCoHostMode(); }}
                          className="elix-live-tile-ctrl flex items-center justify-center border-0 bg-transparent p-0.5 hover:opacity-90 active:scale-95"
                        >
                          <X size={14} strokeWidth={2.35} className="text-[#F5F5F7]" />
                        </button>
                        <button
                          type="button"
                          title="Host on big screen"
                          onClick={(e) => { e.stopPropagation(); setFeaturedUserId(null); }}
                          className="elix-live-tile-ctrl flex items-center justify-center border-0 bg-transparent p-0.5 active:scale-95"
                        >
                          <ArrowLeftRight className="w-3 h-3 text-[#F5F5F7]" strokeWidth={2.5} />
                        </button>
                      </div>
                      <span className="absolute bottom-0.5 left-0.5 z-10 text-white/80 text-[8px] font-bold bg-black/50 rounded px-1">You</span>
                    </>
                  );
                }
                if (slot.type === 'live' && slot.host) {
                  const host = slot.host;
                  const camOff = coHostCameraOff[host.id] || [...remoteCamOff].some((id) => sameUserId(id, host.userId));
                  const scoreEntry = Object.entries(cohostGiftScores).find(([id]) =>
                    sameUserId(id, host.userId),
                  );
                  const score = scoreEntry ? scoreEntry[1] : 0;
                  const lastGiftIcon =
                    Object.entries(cohostLastGifts).find(([id]) => sameUserId(id, host.userId))?.[1] ||
                    undefined;
                  const isSelected = !!selectedCohostGiftUserId && sameUserId(selectedCohostGiftUserId, host.userId);
                  return (
                    <>
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 elix-panel z-[5]">
                        {host.avatar ? (
                          <img src={host.avatar} alt="" className="w-10 h-10 rounded-full object-cover object-center" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
                            <span className="text-[#F5F5F7]/60 text-sm font-bold">{(host.name || '?').charAt(0)}</span>
                          </div>
                        )}
                        <span className="text-white/90 text-[8px] font-bold truncate max-w-full px-1">{host.name}</span>
                      </div>
                      <video
                        ref={(el) => { if (el) coHostVideoRefs.current.set(host.userId, el); else coHostVideoRefs.current.delete(host.userId); }}
                        className={`absolute inset-0 w-full h-full object-cover z-[6] ${LIVE_WEBRTC_VIDEO_CLASS}`}
                        autoPlay
                        playsInline
                        muted
                        controls={false}
                        poster={LIVE_VIDEO_TRANSPARENT_POSTER}
                        style={{ opacity: camOff ? 0 : 1, transition: 'opacity 0.3s ease', backgroundColor: 'transparent' }}
                      />
                      <div className="absolute top-0.5 left-0.5 z-10 flex items-center gap-0.5 pointer-events-auto">
                        <button
                          type="button"
                          title="Remove co-host"
                          aria-label="Remove co-host"
                          onClick={(e) => { e.stopPropagation(); removeCoHost(host.id); }}
                          className="elix-live-tile-ctrl flex items-center justify-center border-0 bg-transparent p-0.5 hover:opacity-90 active:scale-95"
                        >
                          <X size={14} strokeWidth={2.35} className="text-[#F5F5F7]" />
                        </button>
                        <button
                          type="button"
                          title="Put on big screen"
                          onClick={(e) => { e.stopPropagation(); toggleFeaturedUser(host.userId); }}
                          className="elix-live-tile-ctrl flex items-center justify-center border-0 bg-transparent p-0.5 active:scale-95"
                        >
                          <ArrowLeftRight className="w-3 h-3 text-[#F5F5F7]" strokeWidth={2.5} />
                        </button>
                      </div>
                      <div className="absolute top-0.5 right-0.5 z-10 flex items-center gap-0.5 pointer-events-auto">
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleCoHostMute(host.id); }} className="elix-live-tile-ctrl flex items-center justify-center border-0 bg-transparent p-0.5" title={host.isMuted ? 'Unmute' : 'Mute'}>
                          {host.isMuted ? <MicOff className="text-white w-3 h-3" strokeWidth={2.5} /> : <Mic className="text-white w-3 h-3" strokeWidth={2.5} />}
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleCoHostCamera(host.id); }} className="elix-live-tile-ctrl flex items-center justify-center border-0 bg-transparent p-0.5" title={coHostCameraOff[host.id] ? 'Camera on' : 'Camera off'}>
                          {coHostCameraOff[host.id] ? <CameraOff className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] w-3 h-3" strokeWidth={2.5} /> : <Camera className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] w-3 h-3" strokeWidth={2.5} />}
                        </button>
                      </div>
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
                              {formatCountShort(score)}
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
                if (slot.type === 'invited' && slot.host) return (
                  <>
                    <button
                      type="button"
                      title="Cancel invite"
                      aria-label="Cancel invite"
                      onClick={(e) => { e.stopPropagation(); removeCoHost(slot.host!.id); }}
                      className="absolute top-0.5 left-0.5 z-10 flex items-center justify-center border-0 bg-transparent p-0.5 pointer-events-auto hover:opacity-90 active:scale-95"
                    >
                      <X size={14} strokeWidth={2.35} className="text-[#F5F5F7]" />
                    </button>
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-[rgba(0,0,0,0.35)]">
                      {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover opacity-60" /> : <div className="w-full h-full flex items-center justify-center text-[#F5F5F7]/60 text-base font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                    </div>
                    <p className="text-white/60 text-[9px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                    <span className="text-[#F5F5F7]/70 text-[8px] font-semibold">Waiting</span>
                  </>
                );
                if (slot.type === 'pending' && slot.host) return (
                  <>
                    <button
                      type="button"
                      title="Decline request"
                      aria-label="Decline request"
                      onClick={(e) => { e.stopPropagation(); removeCoHost(slot.host!.id); }}
                      className="absolute top-0.5 left-0.5 z-10 flex items-center justify-center border-0 bg-transparent p-0.5 pointer-events-auto hover:opacity-90 active:scale-95"
                    >
                      <X size={14} strokeWidth={2.35} className="text-[#F5F5F7]" />
                    </button>
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-[rgba(0,0,0,0.35)]">
                      {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[#F5F5F7] text-sm font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                    </div>
                    <p className="text-white text-[8px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                    <span className="text-[#F5F5F7]/70 text-[8px] font-semibold">Pending</span>
                  </>
                );
                return (
                  <button type="button" onClick={openSpectatorsPanel} className="flex flex-col items-center justify-center w-full h-full active:scale-95">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center">
                      <span className="text-white/30 text-2xl font-light">+</span>
                    </div>
                    <p className="text-white/30 text-[9px] font-semibold mt-0.5">Add</p>
                  </button>
                );
              };

              return (
                <div className="w-1/2 h-full grid grid-cols-2 grid-rows-4 gap-0 bg-transparent">
                  {smallSlots.slice(0, 8).map((slot, i) => {
                    const cellHost = slot.type === 'live' ? slot.host : undefined;
                    const cellSpeaking =
                      (slot.type === 'host_main' && isSpeakingUser(user?.id)) ||
                      (!!cellHost && isSpeakingUser(cellHost.userId));
                    return (
                      <div
                        key={i}
                        role={cellHost && !isBattleMode ? 'button' : undefined}
                        tabIndex={cellHost && !isBattleMode ? 0 : undefined}
                        onClick={() => { if (cellHost) openCoHostGiftFromGrid(cellHost.userId); }}
                        onKeyDown={(e) => {
                          if (!cellHost || isBattleMode) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openGiftPanelForCohost(cellHost.userId);
                          }
                        }}
                        className={`relative elix-cohost-cut-corner bg-transparent flex flex-col items-center justify-center overflow-hidden p-0 min-h-0 ${cellSpeaking ? 'elix-speaking-pulse' : ''} ${cellHost && !isBattleMode ? 'cursor-pointer' : ''}`}
                      >
                        {renderCoHostCell(slot)}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          );
        })()}

        {/* Battle Split Screen Overlay â€” shown whenever in battle mode */}
        {isBattleMode && (location.pathname.startsWith('/live') || location.pathname.startsWith('/watch')) && (
          <div
            ref={battleSpectatorOverlayRef}
            className={`absolute inset-0 z-[80] flex flex-col ${isBroadcast ? 'pointer-events-none' : ''}`}
            style={{
              paddingTop: 'calc(env(safe-area-inset-top, 0px) + 112px - 0.5mm)',
              paddingBottom: isBroadcast ? '305px' : undefined,
            }}
            onClick={(e) => {
              if (isBroadcast) return;
              e.stopPropagation();
              handleScreenTap(e);
            }}
          >
            {battleCountdown != null && (
              <div className="absolute inset-0 z-[260] pointer-events-none flex items-center justify-center">
                {/* LUXURY BATTLE COUNTDOWN */}
                <div className="w-32 h-32 flex items-center justify-center animate-luxury-pulse relative">
                  <div className="text-white text-6xl font-black tabular-nums relative z-10 drop-shadow-[0_0_20px_rgba(230,179,106,1)]">{battleCountdown}</div>
                </div>
              </div>
            )}

            





            {SPEED_CHALLENGE_ENABLED && speedChallengeResult && !speedChallengeActive && (
              <div className="absolute inset-x-0 bottom-24 z-[270] pointer-events-none flex items-center justify-center">
                <div className="flex flex-col items-center gap-1 px-6 py-3 rounded-xl elix-panel backdrop-blur-md border border-[#2A2D33] shadow-[0_0_20px_rgba(0,0,0,0.6)]">
                  <span className="text-white text-[10px] font-bold uppercase tracking-widest">âš¡ Speed Challenge Result</span>
                  <span className="text-white text-lg font-black drop-shadow-[0_0_15px_rgba(230,179,106,0.8)] animate-bounce">{speedChallengeResult}</span>
                </div>
              </div>
            )}

            {/* Dynamic Battle Grid: 2-split or 4-split based on players */}
            {(() => {
              const is4Player = battleSlots[1].status !== 'empty' || battleSlots[2].status !== 'empty';
              // End-game suspense hides both scores. Mist Fog hides ONLY the supported
              // creator's side (the one the spectator boosted), never both.
              const mistSupportedSide = mistHidesScores ? mistFog?.supportedSide : null;
              const hideRedScore = battleHideScores || mistSupportedSide === 'host';
              const hideBlueScore = battleHideScores || mistSupportedSide === 'opponent';
              return (
                <div
                  className="relative w-full max-w-full flex-none flex flex-col overflow-hidden overflow-x-hidden elix-battle-stage-fundal"
                  style={{
                    height: LIVE_BATTLE_VIDEO_HEIGHT,
                    filter: liveFilterCss !== 'none' ? liveFilterCss : undefined,
                  }}
                >

                  {/* Battle score: tap bar to hide (keeps battle video + chat visible). Tap VS to show again. */}
                  <div className={`relative z-20 w-full flex-none ${battleScoreBarHidden ? '' : 'elix-battle-score-wrap'}`}>
                    {!battleScoreBarHidden ? (
                      <div
                        className="relative w-full overflow-hidden cursor-pointer pointer-events-auto"
                        style={{ minHeight: is4Player ? 'calc(14px + 0.5mm)' : 'calc(12px + 0.5mm)', height: is4Player ? 'calc(14px + 0.5mm)' : 'calc(12px + 0.5mm)' }}
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
                            <AnimatedScore value={typeof redTeamScore === 'number' && Number.isFinite(redTeamScore) ? redTeamScore : 0} durationMs={0} format={formatCountShort} className="text-white font-black text-[10px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" />
                            {is4Player && (
                              <span className="text-[5px] text-white/80 tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                                P1 {formatCountShort(battleServerTotals.h)} + P3 {formatCountShort(battleServerTotals.p3)}
                              </span>
                            )}
                          </div>
                          <div className={`flex min-w-0 flex-1 flex-col items-end justify-center gap-0 ${hideBlueScore ? 'opacity-0' : ''}`}>
                            <AnimatedScore value={typeof blueTeamScore === 'number' && Number.isFinite(blueTeamScore) ? blueTeamScore : 0} durationMs={0} format={formatCountShort} className="text-white font-black text-[10px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" />
                            {is4Player && (
                              <span className="text-[5px] text-white/80 tabular-nums leading-none text-right drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                                P2 {formatCountShort(battleServerTotals.o)} + P4 {formatCountShort(battleServerTotals.p4)}
                              </span>
                            )}
                          </div>
                        </div>
                        {battleHideScores ? (
                          <div className="absolute inset-0 z-20 battle-score-veil pointer-events-none" />
                        ) : mistSupportedSide ? (
                          <div className={`absolute inset-y-0 z-20 battle-score-veil pointer-events-none w-1/2 ${mistSupportedSide === 'opponent' ? 'right-0' : 'left-0'}`} />
                        ) : null}
                      </div>
                    ) : (
                      <div className="w-full h-0" aria-hidden />
                    )}
                    {/* Match timer â€” flush under battle score bar (0mm gap); SPEED beside timer when active */}
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
                            <path d="M20 2 L36 10 L36 26 Q36 38 20 42 Q4 38 4 26 L4 10 Z" fill="url(#vsGrad2)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
                            <defs><linearGradient id="vsGrad2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#DC143C"/><stop offset="50%" stopColor="#8B0000"/><stop offset="100%" stopColor="#1E90FF"/></linearGradient></defs>
                          </svg>
                          <span className="relative z-10 text-white text-[7px] font-black italic drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">VS</span>
                        </div>
                        <span className="text-white text-[11px] font-black tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{formatTime(battleTime)}</span>
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

                  {/* Grid Container â€” ref for spectator tapâ†’vote mapping */}
                  <div ref={battleVoteGridRef} className="flex-1 min-h-0 min-w-0 w-full max-w-full flex flex-col relative overflow-hidden overflow-x-hidden">
                    <BattleVfxOverlays
                      mistSide={
                        mistFog && mistFog.expiresAt > Date.now() && mistHidesScores
                          ? (mistFog.supportedSide === 'opponent' ? 'blue' : 'red')
                          : battleMistSide
                      }
                      hideScores={false}
                      gloves={battleGloves}
                    />
                    <BattleTauntOverlays bursts={battleTauntBursts} opponentSide="opponent" />
                    {/* Row 1: P1 & P2 â€” equal joined panes */}
                    <div className="flex flex-1 min-h-0 min-w-0 w-full max-w-full gap-0 overflow-hidden">
                      <div
                        className="flex-1 basis-0 min-w-0 h-full overflow-hidden relative bg-[rgba(0,0,0,0.35)] pointer-events-auto"
                      >
                      <video ref={bindHostCameraPreview} className={`w-full h-full object-cover transform scale-x-[-1] ${LIVE_WEBRTC_VIDEO_CLASS}`} autoPlay playsInline muted controls={false} poster={LIVE_VIDEO_TRANSPARENT_POSTER} style={isCamOff ? { opacity: 0 } : undefined} />
                      {isBroadcast && activeFaceARGift && (
                        <FaceARGift
                          videoRef={videoRef}
                          giftType={activeFaceARGift.type}
                          color={activeFaceARGift.color || '#FFFFFF'}
                          onComplete={clearActiveFaceARGift}
                        />
                      )}
                      {isBroadcast && activeLiveFaceEffect && activeLiveFaceEffect.type !== 'none' && !activeFaceARGift && (
                        <LiveFaceEffectsLayer
                          videoRef={videoRef}
                          effectType={activeLiveFaceEffect.type}
                          color={activeLiveFaceEffect.color}
                          active
                        />
                      )}
                      {isCamOff && (
                        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-1 bg-[rgba(0,0,0,0.35)]">
                          {(user?.avatar || myAvatar) ? (
                            <img src={user?.avatar || myAvatar || ''} alt="" className="w-12 h-12 rounded-full object-cover object-center" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
                              <span className="text-lg font-black text-[#F5F5F7]/60">{(creatorName || user?.username || 'Me').charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <span className="text-white font-bold text-[10px] truncate max-w-full px-1">{creatorName || user?.username || user?.name || 'Me'}</span>
                        </div>
                      )}
                      {/* P1 close â€” top outer corner (top-left), away from VS timer */}
                      <div className="absolute top-3 left-1.5 z-40 pointer-events-auto">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); closeLiveWithSlide(); }}
                          aria-label="Close"
                          className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                        >
                          <X size={14} strokeWidth={2.35} className="text-[#F5F5F7]" />
                        </button>
                      </div>
                      {/* This creator's battle points (join into 2x2 team total) */}
                      {!hideRedScore && (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[25] pointer-events-none">
                          <span className="inline-flex items-center h-4 px-1.5 rounded-full bg-black/40 border border-[#D8D9DD]/35 text-white text-[9px] font-black tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                            {formatCountShort(myScore)}
                          </span>
                        </div>
                      )}
                      {/* P1 mic + cam â€” icons only */}
                      <div className="absolute bottom-3 right-1.5 z-40 pointer-events-auto flex items-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); togglePlayerMute('me'); }}
                          aria-label={mutedPlayers['me'] ? 'Unmute' : 'Mute'}
                          className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                        >
                          {mutedPlayers['me']
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
                      {lastGifts.host.length > 0 && (
                        <div className="absolute bottom-1 left-1 z-20 pointer-events-none flex items-center">
                          {lastGifts.host.map((src, i) => (
                            <div
                              key={`host-gift-${i}-${src}`}
                              className="w-5 h-5 rounded-full bg-[rgba(0,0,0,0.35)] border border-[#D8D9DD]/40 overflow-hidden flex items-center justify-center drop-shadow-md"
                              style={{ marginLeft: i === 0 ? 0 : -6, zIndex: i + 1 }}
                            >
                              <img src={src} alt="gift" className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      )}


                      {battleWinner && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                          <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${battleTeamWinner === 'host' ? 'text-white' : battleTeamWinner === 'draw' ? 'text-white' : 'text-white/60'}`}>
                            {battleTeamWinner === 'host' ? 'WIN' : battleTeamWinner === 'draw' ? 'DRAW' : 'LOSS'}
                          </span>
                          {battleTeamWinner === 'host' && battleWinStreak.host > 0 ? (
                            <span className="text-[10px] font-black text-white tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">×{battleWinStreak.host}</span>
                          ) : null}
                          {battleTeamWinner === 'opponent' ? (
                            <span className="text-[10px] font-black text-white/70 tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">0</span>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div
                      className={`flex-1 basis-0 min-w-0 h-full overflow-hidden relative pointer-events-auto ${
                        battleSlots[0].status === 'empty' || battleSlots[0].status === 'invited'
                          ? 'bg-transparent'
                          : 'bg-[rgba(0,0,0,0.35)]'
                      }`}
                    >
                      {battleSlots[0].status === 'accepted' ? (
                        <div className="w-full h-full relative bg-[rgba(0,0,0,0.35)]">
                          <video ref={(el) => { opponentVideoRef.current = el; if (el) prepareLiveVideoEl(el); }} className={`absolute inset-0 w-full h-full object-cover z-10 ${LIVE_WEBRTC_VIDEO_CLASS}`} autoPlay playsInline muted controls={false} poster={LIVE_VIDEO_TRANSPARENT_POSTER} style={cameraOffPlayers['opponent'] ? { display: 'none' } : undefined} />
                          {cameraOffPlayers['opponent'] && (
                            <div className="absolute inset-0 z-[11] flex flex-col items-center justify-center gap-2 bg-[rgba(0,0,0,0.35)]">
                              {battleSlots[0].avatar ? (
                                <img src={battleSlots[0].avatar} alt="" className="w-16 h-16 rounded-full object-cover object-center" />
                              ) : (
                                <div className="w-16 h-16 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
                                  <span className="text-2xl font-black text-[#F5F5F7]/60">{(battleSlots[0].name || 'P').charAt(0).toUpperCase()}</span>
                                </div>
                              )}
                              <span className="text-white font-bold text-xs">{battleSlots[0].name}</span>
                            </div>
                          )}
                          {!hasOpponentStream && !cameraOffPlayers['opponent'] && (
                            <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 elix-panel">
                              {battleSlots[0].avatar ? (
                                <img src={battleSlots[0].avatar} alt={battleSlots[0].name} className="w-16 h-16 rounded-full object-cover object-center" />
                              ) : (
                                <div className="w-16 h-16 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
                                  <span className="text-2xl font-black text-[#F5F5F7]">{(battleSlots[0].name || 'P').charAt(0).toUpperCase()}</span>
                                </div>
                              )}
                              <span className="text-white text-xs font-bold">{battleSlots[0].name}</span>
                              <div className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                <span className="text-white text-[10px] font-bold">Connecting...</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : battleSlots[0].status === 'invited' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 elix-battle-slot border border-[var(--elix-border)]">
                          <img src={battleSlots[0].avatar} alt={battleSlots[0].name} className="w-12 h-12 rounded-full object-cover object-center opacity-60" />
                          <div className="w-5 h-5 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
                          <span className="text-white text-[10px] font-bold">Waiting...</span>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 elix-battle-slot pointer-events-auto" onClick={(e) => { e.stopPropagation(); setShowViewerList(false); setIsFindCreatorsOpen(true); }}>
                          <div className="w-12 h-12 rounded-full flex items-center justify-center border border-[var(--elix-border)]">
                            <span className="text-[#E6E9EE] text-2xl">+</span>
                          </div>
                          <span className="text-[#C8CDD5] text-[10px] font-bold">Add creator</span>
                        </div>
                      )}

                      {battleSlots[0].status === 'accepted' && battleSlots[0].userId ? (
                        <button
                          type="button"
                          className="absolute inset-0 z-[8] border-0 bg-transparent p-0"
                          aria-label={`Open ${battleSlots[0].name || 'creator'} profile`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openBattlePartnerMiniProfile(0);
                          }}
                        />
                      ) : null}

                      {battleSlots[0].status === 'accepted' && !hideBlueScore ? (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[25] pointer-events-none">
                          <span className="inline-flex items-center h-4 px-1.5 rounded-full bg-black/40 border border-[#D8D9DD]/35 text-white text-[9px] font-black tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                            {formatCountShort(opponentScore)}
                          </span>
                        </div>
                      ) : null}

                      {battleSlots[0].status !== 'empty' && (
                        <>
                          {/* P2 close/remove â€” top outer corner (top-right), away from VS timer */}
                          <div className="absolute top-3 right-1.5 z-10 pointer-events-auto">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removePlayerFromSlot(0); }}
                              aria-label="Remove"
                              className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                            >
                              <X size={14} className="text-[#F5F5F7]" strokeWidth={2.25} />
                            </button>
                          </div>
                          {/* P2 mic + cam â€” icons only */}
                          <div className="absolute bottom-3 left-1.5 z-10 pointer-events-auto flex items-end gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); togglePlayerMute('opponent'); }}
                              aria-label={mutedPlayers['opponent'] ? 'Unmute' : 'Mute'}
                              className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                            >
                              {mutedPlayers['opponent']
                                ? <MicOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />
                                : <Mic className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); togglePlayerCamera('opponent'); }}
                              aria-label={cameraOffPlayers['opponent'] ? 'Cam On' : 'Cam Off'}
                              className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                            >
                              {cameraOffPlayers['opponent']
                                ? <CameraOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />
                                : <Camera className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                            </button>
                          </div>
                        </>
                      )}

                      <div 
                        className="absolute bottom-1 right-1 flex items-center cursor-pointer hover:scale-105 transition-transform active:scale-95 pointer-events-auto z-20"
                        onClick={(e) => { e.stopPropagation(); openBattlePartnerMiniProfile(0); }}
                      >
                        {lastGifts.opponent.length > 0 && (
                          <div className="flex items-center">
                            {lastGifts.opponent.map((src, i) => (
                              <div
                                key={`opp-gift-${i}-${src}`}
                                className="w-5 h-5 rounded-full bg-[rgba(0,0,0,0.35)] border border-[#D8D9DD]/40 overflow-hidden flex items-center justify-center drop-shadow-md relative"
                                style={{ marginLeft: i === 0 ? 0 : -6, zIndex: i + 1 }}
                              >
                                <img src={src} alt="gift" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        )}
                        <div 
                          className={`h-4 flex items-center rounded-full text-[8px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] relative z-0 bg-black/35 backdrop-blur-md border border-[#2A2D33] ${lastGifts.opponent.length > 0 ? '-ml-2 pl-3 pr-1.5' : 'px-1.5'}`}
                        >
                          {battleSlots[0].status !== 'empty' ? battleSlots[0].name : 'P2'}
                        </div>
                      </div>

                      {battleWinner && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                          <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${battleTeamWinner === 'opponent' ? 'text-white' : battleTeamWinner === 'draw' ? 'text-white' : 'text-white/60'}`}>
                            {battleTeamWinner === 'opponent' ? 'WIN' : battleTeamWinner === 'draw' ? 'DRAW' : 'LOSS'}
                          </span>
                          {battleTeamWinner === 'opponent' && battleWinStreak.opponent > 0 ? (
                            <span className="text-[10px] font-black text-white tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">×{battleWinStreak.opponent}</span>
                          ) : null}
                          {battleTeamWinner === 'host' ? (
                            <span className="text-[10px] font-black text-white/70 tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">0</span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 2: P3 & P4 â€” only when 4 players, same joined container */}
                  {is4Player && (
                    <div className="flex flex-1 min-h-0 min-w-0 w-full max-w-full gap-0 overflow-hidden">
                      <div
                        className="flex-1 basis-0 min-w-0 h-full overflow-hidden relative bg-[rgba(0,0,0,0.35)] pointer-events-auto"
                      >
                        {battleSlots[1].status === 'accepted' ? (
                          <div className="w-full h-full relative bg-[rgba(0,0,0,0.35)]">
                            <video ref={(el) => { player3VideoRef.current = el; if (el) prepareLiveVideoEl(el); }} className={`w-full h-full object-cover ${LIVE_WEBRTC_VIDEO_CLASS}`} autoPlay playsInline muted controls={false} poster={LIVE_VIDEO_TRANSPARENT_POSTER} style={player3VideoRef.current?.srcObject && !cameraOffPlayers['player3'] ? {} : { display: 'none' }} />
                            {cameraOffPlayers['player3'] && (
                              <div className="absolute inset-0 z-[11] flex flex-col items-center justify-center gap-1 bg-[rgba(0,0,0,0.35)]">
                                {battleSlots[1].avatar ? (
                                  <img src={battleSlots[1].avatar} alt="" className="w-12 h-12 rounded-full object-cover object-center" />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
                                    <span className="text-lg font-black text-[#F5F5F7]/60">{(battleSlots[1].name || '?').charAt(0).toUpperCase()}</span>
                                  </div>
                                )}
                                <span className="text-white font-bold text-[10px] truncate max-w-full px-1">{battleSlots[1].name}</span>
                              </div>
                            )}
                            {!player3VideoRef.current?.srcObject && !cameraOffPlayers['player3'] && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <img src={battleSlots[1].avatar} alt={battleSlots[1].name} className="w-12 h-12 rounded-full object-cover object-center" />
                                <span className="text-white text-[10px] font-bold">{battleSlots[1].name}</span>
                                <div className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                  <span className="text-white text-[9px] font-bold">JOINED</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : battleSlots[1].status === 'invited' ? (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 elix-battle-slot border border-[var(--elix-border)]">
                          <img src={battleSlots[1].avatar} alt={battleSlots[1].name} className="w-12 h-12 rounded-full object-cover object-center opacity-60" />
                          <div className="w-5 h-5 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
                          <span className="text-white text-[10px] font-bold">Waiting...</span>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 elix-battle-slot pointer-events-auto" onClick={(e) => { e.stopPropagation(); setShowViewerList(false); setIsFindCreatorsOpen(true); }}>
                            <div className="w-12 h-12 rounded-full flex items-center justify-center border border-[var(--elix-border)]">
                              <span className="text-[#E6E9EE] text-2xl">+</span>
                            </div>
                            <span className="text-[#C8CDD5] text-[10px] font-bold">Add creator</span>
                          </div>
                        )}

                        {battleSlots[1].status === 'accepted' && battleSlots[1].userId ? (
                          <button
                            type="button"
                            className="absolute inset-0 z-[8] border-0 bg-transparent p-0"
                            aria-label={`Open ${battleSlots[1].name || 'creator'} profile`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openBattlePartnerMiniProfile(1);
                            }}
                          />
                        ) : null}

                        {battleSlots[1].status === 'accepted' && !hideRedScore ? (
                          <div className="absolute top-1 left-1/2 -translate-x-1/2 z-[25] pointer-events-none">
                            <span className="inline-flex items-center h-4 px-1.5 rounded-full bg-black/40 border border-[#D8D9DD]/35 text-white text-[9px] font-black tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                              {formatCountShort(player3Score)}
                            </span>
                          </div>
                        ) : null}

                        {battleSlots[1].status !== 'empty' && (
                          <div className="absolute top-1 right-1 z-10 pointer-events-auto flex items-end gap-1.5">
                            <button type="button" className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95" onClick={(e) => { e.stopPropagation(); togglePlayerMute('player3'); }}>
                              {mutedPlayers['player3'] ? <MicOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} /> : <Mic className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                              <span className="text-[7px] font-semibold text-white/85 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">{mutedPlayers['player3'] ? 'Unmute' : 'Mute'}</span>
                            </button>
                            <button type="button" className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95" onClick={(e) => { e.stopPropagation(); removePlayerFromSlot(1); }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF4D6A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                              <span className="text-[7px] font-semibold text-white/85 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">Remove</span>
                            </button>
                        </div>
                      )}

                      <div 
                        className="absolute bottom-1 left-1 flex items-center cursor-pointer hover:scale-105 transition-transform active:scale-95 pointer-events-auto z-20"
                        onClick={(e) => { e.stopPropagation(); openBattlePartnerMiniProfile(1); }}
                      >
                        {lastGifts.player3.length > 0 && (
                          <div className="flex items-center">
                            {lastGifts.player3.map((src, i) => (
                              <div
                                key={`p3-gift-${i}-${src}`}
                                className="w-5 h-5 rounded-full bg-[rgba(0,0,0,0.35)] border border-[#D8D9DD]/40 overflow-hidden flex items-center justify-center drop-shadow-md relative"
                                style={{ marginLeft: i === 0 ? 0 : -6, zIndex: i + 1 }}
                              >
                                <img src={src} alt="gift" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        )}
                        <div 
                          className={`h-4 flex items-center rounded-full text-[8px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] relative z-0 ${lastGifts.player3.length > 0 ? '-ml-2 pl-3 pr-1.5' : 'px-1.5'}`}
                          style={{ background: 'linear-gradient(135deg, rgba(0,200,83,0.7), rgba(0,200,83,0.3))' }}
                        >
                          {battleSlots[1].status !== 'empty' ? battleSlots[1].name : 'P3'}
                        </div>
                      </div>

                      {battleWinner && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                            <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${battleTeamWinner === 'host' ? 'text-white' : battleTeamWinner === 'draw' ? 'text-white' : 'text-white/60'}`}>
                              {battleTeamWinner === 'host' ? 'WIN' : battleTeamWinner === 'draw' ? 'DRAW' : 'LOSS'}
                            </span>
                            {battleTeamWinner === 'host' && battleWinStreak.host > 0 ? (
                              <span className="text-[10px] font-black text-white tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">×{battleWinStreak.host}</span>
                            ) : null}
                            {battleTeamWinner === 'opponent' ? (
                              <span className="text-[10px] font-black text-white/70 tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">0</span>
                            ) : null}
                          </div>
                        )}
                      </div>
                      <div
                        className="flex-1 basis-0 min-w-0 h-full overflow-hidden relative bg-[rgba(0,0,0,0.35)] pointer-events-auto"
                      >
                        {battleSlots[2].status === 'accepted' ? (
                          <div className="w-full h-full relative bg-[rgba(0,0,0,0.35)]">
                            <video ref={(el) => { player4VideoRef.current = el; if (el) prepareLiveVideoEl(el); }} className={`w-full h-full object-cover ${LIVE_WEBRTC_VIDEO_CLASS}`} autoPlay playsInline muted controls={false} poster={LIVE_VIDEO_TRANSPARENT_POSTER} style={player4VideoRef.current?.srcObject && !cameraOffPlayers['player4'] ? {} : { display: 'none' }} />
                            {cameraOffPlayers['player4'] && (
                              <div className="absolute inset-0 z-[11] flex flex-col items-center justify-center gap-1 bg-[rgba(0,0,0,0.35)]">
                                {battleSlots[2].avatar ? (
                                  <img src={battleSlots[2].avatar} alt="" className="w-12 h-12 rounded-full object-cover object-center" />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
                                    <span className="text-lg font-black text-[#F5F5F7]/60">{(battleSlots[2].name || '?').charAt(0).toUpperCase()}</span>
                                  </div>
                                )}
                                <span className="text-white font-bold text-[10px] truncate max-w-full px-1">{battleSlots[2].name}</span>
                              </div>
                            )}
                            {!player4VideoRef.current?.srcObject && !cameraOffPlayers['player4'] && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <img src={battleSlots[2].avatar} alt={battleSlots[2].name} className="w-12 h-12 rounded-full object-cover object-center" />
                                <span className="text-white text-[10px] font-bold">{battleSlots[2].name}</span>
                                <div className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                  <span className="text-white text-[9px] font-bold">JOINED</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : battleSlots[2].status === 'invited' ? (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 elix-battle-slot border border-[var(--elix-border)]">
                          <img src={battleSlots[2].avatar} alt={battleSlots[2].name} className="w-12 h-12 rounded-full object-cover object-center opacity-60" />
                          <div className="w-5 h-5 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
                          <span className="text-white text-[10px] font-bold">Waiting...</span>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 elix-battle-slot pointer-events-auto" onClick={(e) => { e.stopPropagation(); setShowViewerList(false); setIsFindCreatorsOpen(true); }}>
                            <div className="w-12 h-12 rounded-full flex items-center justify-center border border-[var(--elix-border)]">
                              <span className="text-[#E6E9EE] text-2xl">+</span>
                            </div>
                            <span className="text-[#C8CDD5] text-[10px] font-bold">Add creator</span>
                          </div>
                        )}

                        {battleSlots[2].status === 'accepted' && battleSlots[2].userId ? (
                          <button
                            type="button"
                            className="absolute inset-0 z-[8] border-0 bg-transparent p-0"
                            aria-label={`Open ${battleSlots[2].name || 'creator'} profile`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openBattlePartnerMiniProfile(2);
                            }}
                          />
                        ) : null}

                        {battleSlots[2].status === 'accepted' && !hideBlueScore ? (
                          <div className="absolute top-1 left-1/2 -translate-x-1/2 z-[25] pointer-events-none">
                            <span className="inline-flex items-center h-4 px-1.5 rounded-full bg-black/40 border border-[#D8D9DD]/35 text-white text-[9px] font-black tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                              {formatCountShort(player4Score)}
                            </span>
                          </div>
                        ) : null}

                        {battleSlots[2].status !== 'empty' && (
                          <div className="absolute top-1 right-1 z-10 pointer-events-auto flex items-end gap-1.5">
                            <button type="button" className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95" onClick={(e) => { e.stopPropagation(); togglePlayerMute('player4'); }}>
                              {mutedPlayers['player4'] ? <MicOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} /> : <Mic className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                              <span className="text-[7px] font-semibold text-white/85 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">{mutedPlayers['player4'] ? 'Unmute' : 'Mute'}</span>
                            </button>
                            <button type="button" className="elix-live-tile-ctrl flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95" onClick={(e) => { e.stopPropagation(); removePlayerFromSlot(2); }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF4D6A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                              <span className="text-[7px] font-semibold text-white/85 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">Remove</span>
                            </button>
                        </div>
                      )}

                      <div 
                        className="absolute bottom-1 right-1 flex items-center cursor-pointer hover:scale-105 transition-transform active:scale-95 pointer-events-auto z-20"
                        style={{ right: '2.5rem' }}
                        onClick={(e) => { e.stopPropagation(); openBattlePartnerMiniProfile(2); }}
                      >
                        {lastGifts.player4.length > 0 && (
                          <div className="flex items-center">
                            {lastGifts.player4.map((src, i) => (
                              <div
                                key={`p4-gift-${i}-${src}`}
                                className="w-5 h-5 rounded-full bg-[rgba(0,0,0,0.35)] border border-[#D8D9DD]/40 overflow-hidden flex items-center justify-center drop-shadow-md relative"
                                style={{ marginLeft: i === 0 ? 0 : -6, zIndex: i + 1 }}
                              >
                                <img src={src} alt="gift" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        )}
                        <div 
                          className={`h-4 flex items-center rounded-full text-[8px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] relative z-0 ${lastGifts.player4.length > 0 ? '-ml-2 pl-3 pr-1.5' : 'px-1.5'}`}
                          style={{ background: 'linear-gradient(135deg, rgba(156,39,176,0.7), rgba(156,39,176,0.3))' }}
                        >
                          {battleSlots[2].status !== 'empty' ? battleSlots[2].name : 'P4'}
                        </div>
                      </div>

                      {battleWinner && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                            <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${battleTeamWinner === 'opponent' ? 'text-white' : battleTeamWinner === 'draw' ? 'text-white' : 'text-white/60'}`}>
                              {battleTeamWinner === 'opponent' ? 'WIN' : battleTeamWinner === 'draw' ? 'DRAW' : 'LOSS'}
                            </span>
                            {battleTeamWinner === 'opponent' && battleWinStreak.opponent > 0 ? (
                              <span className="text-[10px] font-black text-white tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">×{battleWinStreak.opponent}</span>
                            ) : null}
                            {battleTeamWinner === 'host' ? (
                              <span className="text-[10px] font-black text-white/70 tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">0</span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

            {/* MVP under cameras — fixed above chat fundal (z-110 > chat z-100) */}
            <div
              className="elix-battle-mvp-row fixed left-0 right-0 z-[110] flex justify-center pointer-events-none"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 112px - 0.5mm + 44dvh - 3mm)' }}
            >
              <div className="w-full max-w-[480px] px-3 py-1.5 flex items-end justify-between overflow-x-hidden">
              <div
                className="flex items-end gap-[0mm] min-w-0 flex-1 justify-start pointer-events-auto overflow-hidden"
                onClick={openTopGiftersHost}
                title="Top gifters â€” red side"
              >
                {topMvpHostBattle.map((viewer, i) => {
                  const gifted = mvpGiftScoresHost[viewer.id] ?? 0;
                  const isMvp = i === 0 && gifted > 0;
                  const label = liveViewerLabel(viewer);
                  return (
                  <div
                    key={`mvp-l-${viewer.id}`}
                    className="relative flex flex-col items-center max-w-[42px]"
                    style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '1.5mm' }}
                  >
                    <div className={isMvp ? 'rounded-full shadow-[0_0_3px_0_rgba(230,233,238,0.30)]' : 'rounded-full'}>
                      <AvatarRing
                        src={resolveCircleAvatar(viewer.avatar, label)}
                        alt={label}
                        size={LIVE_MVP_PROFILE_RING_PX}
                      />
                    </div>
                    {isMvp && (
                      <span className="absolute top-[22px] left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#E6E9EE] text-white text-[6px] font-black leading-none tracking-wide">
                        MVP
                      </span>
                    )}
                    <span className="mt-1.5 text-white text-[7px] font-semibold truncate max-w-full leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                      {label}
                    </span>
                    <span className="text-[#F5F5F7] text-[7px] font-black tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                      {formatCoinsShort(gifted)}
                    </span>
                  </div>
                  );
                })}
              </div>
              <div
                className="flex items-end gap-[0mm] min-w-0 flex-1 justify-end pointer-events-auto overflow-hidden"
                onClick={openTopGiftersOpponent}
                title="Top gifters â€” blue side"
              >
                {topMvpOpponentBattle.map((viewer, i) => {
                  const gifted = mvpGiftScoresOpponent[viewer.id] ?? 0;
                  const isMvp = i === 0 && gifted > 0;
                  const label = liveViewerLabel(viewer);
                  return (
                  <div
                    key={`mvp-r-${viewer.id}`}
                    className="relative flex flex-col items-center max-w-[42px]"
                    style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '1.5mm' }}
                  >
                    <div className={isMvp ? 'rounded-full shadow-[0_0_3px_0_rgba(230,233,238,0.30)]' : 'rounded-full'}>
                      <AvatarRing
                        src={resolveCircleAvatar(viewer.avatar, label)}
                        alt={label}
                        size={LIVE_MVP_PROFILE_RING_PX}
                      />
                    </div>
                    {isMvp && (
                      <span className="absolute top-[22px] left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#E6E9EE] text-white text-[6px] font-black leading-none tracking-wide">
                        MVP
                      </span>
                    )}
                    <span className="mt-1.5 text-white text-[7px] font-semibold truncate max-w-full leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                      {label}
                    </span>
                    <span className="text-[#F5F5F7] text-[7px] font-black tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                      {formatCoinsShort(gifted)}
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
                  <span className="text-white text-[9px] font-bold uppercase tracking-[0.1em]">âš¡ Speed</span>
                  <span className="text-white text-[14px] font-black tabular-nums">{speedChallengeTime}s</span>
                  {speedMultiplier > 1 && (
                    <span className="text-white text-[11px] font-black animate-pulse">x{speedMultiplier}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>

        <div className="relative z-10 h-full pointer-events-none">
          {/* Input Layer Removed - Moved to Bottom Zone */}

          <div className="relative flex flex-col h-full pointer-events-none">
            {/* TOP AREA: Overlays (Top Bar & Floating Buttons) */}
            <div className="flex-[0_0_50dvh] relative pointer-events-none">
              {/* Top Bar â€” always show creator layout for everyone */}
                <div
                  className={`absolute top-0 left-0 right-0 z-[110] pointer-events-none elix-live-top-chrome ${isBattleMode ? 'elix-battle-top-fundal' : ''}`}
                  style={
                    isBattleMode
                      ? undefined
                      : {
                          backgroundColor: 'transparent',
                          backgroundImage: 'none',
                        }
                  }
                >
                  <div className="px-3 pb-1.5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="pointer-events-auto flex flex-col gap-2">
                        {/* BROADCASTER INFO â€” photo profile (MVP circles untouched) */}
                        <div className="px-0 py-1 animate-luxury-fade-in relative">
                          <LiveHostProfileHeader
                            name={myCreatorName}
                            avatar={resolveCircleAvatar(myAvatar, myCreatorName)}
                            likes={typeof activeLikes === 'number' && Number.isFinite(activeLikes) ? activeLikes : 0}
                            level={userLevel}
                            avatarSize={LIVE_TOP_AVATAR_RING_PX}
                            showFollow={!isBroadcast}
                            isFollowing={isFollowing}
                            onAvatarClick={() => {
                              void openMiniProfile(myCreatorName, undefined, { userId: user?.id, avatar: myAvatar, level: userLevel });
                            }}
                            onLike={(e) => {
                              handleLikeTap(e);
                            }}
                            onFollow={followCreatorLive}
                            joinSlot={
                              <LiveJoinPill
                                hasJoinedToday={hasJoinedToday}
                                onJoin={async (e) => {
                                  e.stopPropagation();
                                  if (!user?.id) return;

                                  // Creator own live: send today's membership heart (orange Join), then open team status.
                                  // Spectators / battle joiners: Follow first, then send heart to this stream's creator.
                                  const creatorId = isBroadcast
                                    ? String(user.id).trim()
                                    : String(effectiveStreamId || '').trim();

                                  if (!isBroadcast && !isFollowing) {
                                    showToast('Follow first to give a membership heart');
                                    return;
                                  }

                                  if (hasJoinedToday) {
                                    showToast("Already sent today's membership heart");
                                    setShowTeamStatus(true);
                                    return;
                                  }

                                  if (!creatorId || creatorId === 'broadcast') return;
                                  // Spectator must not send a heart to themselves as "creator".
                                  if (!isBroadcast && creatorId === user.id) return;

                                  try {
                                    const { data: before } = await apiLiveGetDailyHearts(creatorId);
                                    if (before?.hasSent) {
                                      setHasJoinedToday(true);
                                      const today0 = new Date().toISOString().split('T')[0];
                                      localStorage.setItem(
                                        `joined_stream_${effectiveStreamId}_${user.id}_${today0}`,
                                        'true',
                                      );
                                      showToast("Already sent today's membership heart");
                                      setShowTeamStatus(true);
                                      return;
                                    }
                                  } catch {
                                    /* continue */
                                  }

                                  try {
                                    const { data: d, error } = await apiLiveSendDailyHeart(creatorId);
                                    if (error) {
                                      showToast('Could not send membership heart. Try again.');
                                      return;
                                    }
                                    const already = d?.already === true;
                                    if (!(d?.ok === true || already)) {
                                      showToast('Could not send membership heart. Try again.');
                                      return;
                                    }

                                    const today = new Date().toISOString().split('T')[0];
                                    localStorage.setItem(
                                      `joined_stream_${effectiveStreamId}_${user.id}_${today}`,
                                      'true',
                                    );
                                    setHasJoinedToday(true);
                                    setShowTeamStatus(true);
                                    spawnHeartFromClient(
                                      e.clientX,
                                      e.clientY,
                                      undefined,
                                      'You',
                                      '/royce/elix-mark.svg',
                                    );

                                    // Refresh team heart counts immediately (with real profile names).
                                    void apiLiveMembership(user.id)
                                      .then(({ data: stats }) => {
                                        if (!stats) return;
                                        void applyMembershipStats(stats);
                                      })
                                      .catch(() => {});

                                    if (!already) {
                                      const joinBannerId = Date.now().toString();
                                      const newMessage: LiveMessage = {
                                        id: joinBannerId,
                                        username: isBroadcast ? creatorName : 'You',
                                        text: 'Joined the team!',
                                        level: userLevel,
                                        isGift: false,
                                        avatar: isBroadcast ? myAvatar : '/royce/elix-mark.svg',
                                        isSystem: true,
                                        membershipIcon: 'heart',
                                      };
                                      setMessages((prev) =>
                                        appendCapped(prev, newMessage, LIVE_CHAT_MESSAGE_CAP),
                                      );
                                      liveChatSend({
                                        text: 'Joined the team!',
                                        level: userLevel,
                                        avatar: newMessage.avatar,
                                      });
                                      window.setTimeout(() => {
                                        setMessages((prev) => prev.filter((m) => m.id !== joinBannerId));
                                      }, 5000);
                                      showToast('Membership heart sent');
                                    } else {
                                      showToast("Already sent today's membership heart");
                                    }
                                  } catch {
                                    showToast('Could not send membership heart. Try again.');
                                  }
                                }}
                              />
                            }
                          />
                          {currentUniverse && (
                            <div className="mt-1 flex items-center gap-1 elix-panel rounded-full px-2.5 py-1 border border-[#D8D9DD]/80 shadow-sm pointer-events-auto relative z-20">
                              <span className="text-[#E6E9EE] text-[11px] font-bold whitespace-nowrap truncate max-w-[140px]">âœ¨ {universeText} âœ¨</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pointer-events-auto flex items-center gap-[0mm] mt-1">
                        {topMvpViewers.length > 0 ? (
                          <div
                            className="flex items-center gap-[0mm] pointer-events-auto flex-shrink-0"
                            style={{ transform: 'translateX(-2mm)' }}
                            onClick={openTopGiftersAll}
                            title="Top viewers & gifters"
                          >
                            {topMvpViewers.slice(0, 3).map((viewer, i) => {
                              const isMvp = i === 0 && (mvpGiftScores[viewer.id] ?? 0) > 0;
                              return (
                              <div
                                key={`top-viewers-${viewer.id}`}
                                className="relative"
                                style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '-1.5mm' }}
                              >
                                <div className={isMvp ? 'rounded-full shadow-[0_0_3px_0_rgba(230,233,238,0.30)]' : 'rounded-full'}>
                                  <AvatarRing
                                    src={resolveCircleAvatar(viewer.avatar, viewer.displayName || viewer.username)}
                                    alt={viewer.displayName || viewer.username || ''}
                                    size={LIVE_MVP_PROFILE_RING_PX}
                                  />
                                </div>
                                {isMvp && (
                                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#E6E9EE] text-white text-[6px] font-black leading-none tracking-wide">
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
                          title="Spectators"
                          onClick={openSpectatorsPanel}
                          className="flex items-center gap-1.5 px-0 py-1 rounded-full bg-transparent border-0 active:scale-95 transition-transform pointer-events-auto"
                          style={{ marginRight: '1mm' }}
                        >
                          <span className="text-white text-[9px] font-bold tabular-nums">{formatCountShort(viewerCount)}</span>
                          <UserPlus size={16} className="text-[#F5F5F7]" strokeWidth={2.2} />
                        </button>
                        <button
                          type="button"
                          onClick={closeLiveWithSlide}
                          className="p-1 active:scale-95 transition-transform pointer-events-auto"
                          title={
                            isBroadcast
                              ? (isBattleMode
                                ? 'End battle'
                                : (coHosts.some((h) => !sameUserId(h.userId, user?.id)) || featuredUserId)
                                  ? 'End co-host'
                                  : 'End broadcast')
                              : 'Leave'
                          }
                          aria-label="Close"
                        >
                          <RoyceCloseIcon size={18} />
                        </button>
                      </div>
                    </div>
                    {/* Capsules right-aligned â€” left clear for battle gloves */}
                    <LiveMarkedSubHeaderBar
                      rank={diamondLeagueRank}
                      onDiamond={openDailyRanking}
                      onMembership={_openMembershipBar}
                      onWeeklyRanking={openWeeklyRanking}
                      onExplore={openFindCreatorsFromHeader}
                      showGiftGoal
                      giftGoal={giftGoal}
                      onGiftGoal={openGiftGoalPanel}
                      showFollow={false}
                      showMembership={false}
                    />
                  </div>
                </div>

              {/* Floating Action Buttons */}
              <div className="absolute right-3 bottom-4 z-[150] flex flex-col items-center gap-3 pointer-events-none">
                <div className="flex flex-col items-center gap-3 pointer-events-auto">
                  {/* Broadcaster buttons moved to bottom-right zone */}
                </div>
              </div>
            </div>

            {/* MIDDLE ZONE: CHAT (Scrollable) â€” floating hearts only here, not over battle/video */}
            <div
              className="chat-zone fixed left-0 right-0 z-[100] flex justify-center pointer-events-none overflow-x-hidden"
              style={{
                bottom: LIVE_BOTTOM_ACTION_RESERVE,
                transform: isBattleMode ? `translateY(${LIVE_BATTLE_CHAT_SHIFT_Y})` : undefined,
              }}
            >
              <div
                className={`w-full max-w-[480px] relative min-w-0 overflow-x-hidden ${hasCoHostLowerFundal ? 'elix-live-chat-fundal' : 'bg-transparent'}`}
                style={{
                  height: isBattleMode ? LIVE_BATTLE_CHAT_HEIGHT : 'calc(25dvh + 2cm + 4mm)',
                  maxHeight: isBattleMode ? LIVE_BATTLE_CHAT_HEIGHT : 'calc(25dvh + 2cm + 4mm)',
                }}
              >
                <div
                  ref={chatHeartLayerRef}
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
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
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
                  className="relative z-[10] h-full overflow-y-auto overflow-x-hidden pointer-events-auto bg-transparent"
                  style={{ transform: 'none' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (e.target instanceof Element) {
                      const interactive = e.target.closest('button, a, input, textarea, select, [role="button"]');
                      if (interactive) return;
                    }
                    handleLikeTap(e);
                  }}
                >
                  {isChatVisible && (
                    <ChatOverlay
                      messages={messages}
                      variant="panel"
                      compact={isBattleMode}
                      isModerator={isBroadcast || moderators.has(user?.id || '')}
                      onLike={() => handleLikeTap()}
                      onHeartSpawn={(_cx, _cy) => handleLikeTap()}
                      onProfileTap={(username) => openMiniProfile(username)}
                      onDeleteMessage={(msgId) => setMessages(prev => prev.filter(m => m.id !== msgId))}
                      onBlockUser={(username) => {
                        setMessages(prev => prev.filter(m => m.username !== username));
                        showToast(`@${username} blocked from chat`);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

      {/* Mission dock (combo button is separate â€” TikTok pink round tap) */}
      <LiveComboMissionDock
        combo={null}
        mission={
          <LiveSideMissionStack
            embedded
            missions={sideMissions}
            supporters={sideSupporters}
            battlePassLevel={userLevel || 1}
            battlePassXp={userXP % 1000}
            battlePassXpMax={1000}
            onViewAllSupporters={openTopGiftersAll}
            onOpenMissions={openEngagementMissions}
            onBattlePass={() => {
              setRankingInitialTab('weekly');
              setShowRankingPanel(true);
            }}
          />
        }
      />

      {/* Combo â€” TikTok-style round combo tap (restored from Jul 16) */}
      <AnimatePresence>
        {showComboButton && lastSentGift && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed left-0 right-0 bottom-[calc(58px+max(2px,env(safe-area-inset-bottom,0px)))] z-[50061] flex justify-center pointer-events-none"
          >
            <div className="w-full max-w-[480px] mx-auto px-3 flex justify-end pointer-events-auto">
              <button
                type="button"
                onClick={onComboButtonClick}
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
          </motion.div>
        )}
      </AnimatePresence>

{/* BOTTOM RIGHT: Action buttons (same area as before, aligned right) */}
      <div
        className="bottom-zone pointer-events-none fixed left-0 right-0 bottom-0 z-[50002] flex justify-center"
      >
        <div
          className={`pointer-events-auto w-full max-w-[480px] px-3 pt-0 flex flex-col items-end justify-end ${hasCoHostLowerFundal ? 'elix-live-lower-fundal' : 'bg-transparent'}`}
          style={{ paddingBottom: LIVE_BOTTOM_ACTION_PADDING }}
        >
        <div className="w-full max-w-[480px] mx-auto flex flex-col items-end gap-0">
        <div className="flex flex-col items-end">
          {/* Spectator bar â€” watch + gift only. Never shown to a broadcasting host or a battle-playing creator. */}
          {!isCreatorParticipant && (
            <div className="flex items-end gap-2 w-full max-w-[480px] pointer-events-auto">
              <form className="flex-1 flex items-center gap-2 bg-black/35 backdrop-blur-sm rounded-full px-3 py-2 border border-[#2A2D33] h-10 min-w-0" onSubmit={(e) => { e.preventDefault(); handleSendMessage(e); }}>
                <input type="text" inputMode="text" enterKeyHint="send" autoComplete="off" placeholder="Say something..." className="bg-transparent text-white text-xs outline-none flex-1 placeholder:text-white/30 min-w-0" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
              </form>
              <div className="flex flex-col items-center gap-0.5">
                <button
                  type="button"
                  title="Poll"
                  onClick={openSpectatorPoll}
                  className={`${LIVE_BOTTOM_ICON_BTN} relative`}
                >
                  <BarChart3 size={20} className="text-[#A7A7AD] relative z-[2]" strokeWidth={2.2} />
                </button>
                <span className="elix-silver-red-text text-[8px] font-medium">Poll</span>
              </div>
              <button
                type="button"
                title={spectatorCoHostRequestSent ? 'Request sent' : 'Co-Host'}
                disabled={spectatorCoHostRequestSent || !user?.id}
                onClick={sendSpectatorCohostRequest}
                className={`${LIVE_BOTTOM_ICON_BTN} relative disabled:opacity-60`}
              >
                <span className="flex items-center justify-center w-full h-full relative z-[2]">
                  <UserPlus
                    size={20}
                    className="text-[#F5F5F7] shrink-0"
                    strokeWidth={2}
                    style={{ transform: 'translateX(0.5mm)' }}
                  />
                </span>
</button>
              <button type="button" title="Send gift" onClick={openGiftPanel} className={`${LIVE_BOTTOM_ICON_BTN} relative`}>
                <Gift size={20} className="text-[#F5F5F7] relative z-[2]" />
</button>
              <button type="button" title="Share" onClick={openSharePanel} className={`${LIVE_BOTTOM_ICON_BTN} relative`}>
                <Share2 size={20} className="text-[#F5F5F7] relative z-[2]" />
</button>
              <button type="button" title="More options" onClick={openMoreMenu} className={`${LIVE_BOTTOM_ICON_BTN} relative`}>
                <MoreVertical size={20} className="text-[#F5F5F7] relative z-[2]" />
</button>
            </div>
          )}

          {/* Creator bottom bar: Co-Host+Battle (solo) or Invite+Start game (battle setup); Share/More always. */}
          {isCreatorParticipant && !currentGift && (
            <div className="flex items-end gap-2 w-full max-w-[480px] pointer-events-auto">
              <div className="flex items-end justify-center gap-3 flex-shrink-0 flex-1">
              {isBattleMode && battleWinner && isBroadcast && (
                <button 
                  type="button" 
                  onClick={triggerRematch}  
                  className="px-4 h-10 rounded-full bg-[rgba(0,0,0,0.35)] backdrop-blur-md flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                >
                  <RefreshCw size={20} className="text-[#F5F5F7] mr-2" />
                  <span className="text-[#F5F5F7] text-xs font-bold">Rematch</span>
                </button>
              )}
              {/* Co-Host belongs to NORMAL live only. During a battle it is hidden so
                  it can never invite anyone as co-host into a match — battle creators
                  are invited from Invite / empty battle slots instead. */}
              {!isBattleMode && (
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    title="Co-Host"
                    onClick={openSpectatorsPanel}
                    className={`${LIVE_BOTTOM_ICON_BTN} relative`}
                  >
                    <span className="flex items-center justify-center w-full h-full relative z-[2]">
                      <UserPlus
                        size={20}
                        className="text-[#F5F5F7] shrink-0"
                        strokeWidth={2}
                        style={{ transform: 'translateX(0.5mm)' }}
                      />
                    </span>
</button>
                  <span className="elix-silver-red-text text-[8px] font-medium">Co-Host</span>
                </div>
              )}
              {/* Enter battle (solo live). Once in battle setup, Battle is replaced by Invite + Start game. */}
              {!isBattleMode && (
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    title="Battle"
                    onClick={openBattleChrome}
                    className={`${LIVE_BOTTOM_ICON_BTN} relative`}
                  >
                    <Users size={20} className="text-[#F5F5F7] relative z-[2]" />
</button>
                  <span className="elix-silver-red-text text-[8px] font-medium">Battle</span>
                </div>
              )}
              {isBattleMode && battleState !== 'IN_BATTLE' && !battleWinner && (
                <>
                  <div className="flex flex-col items-center gap-0.5">
                    <button
                      type="button"
                      title="Invite"
                      onClick={openFindCreatorsFromHeader}
                      className={`${LIVE_BOTTOM_ICON_BTN} relative`}
                    >
                      <UserPlus size={20} className="text-[#F5F5F7] relative z-[2]" strokeWidth={2} />
</button>
                    <span className="elix-silver-red-text text-[8px] font-medium">Invite</span>
                  </div>
                  {isBroadcast && (
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        type="button"
                        title="Start game"
                        onClick={startBattleWithAcceptedCreators}
                        className={`${LIVE_BOTTOM_ICON_BTN} relative`}
                      >
                        <Sword size={20} className="text-[#F5F5F7] relative z-[2]" />
</button>
                      <span className="elix-silver-red-text text-[8px] font-medium">Start game</span>
                    </div>
                  )}
                </>
              )}
              {isBroadcast && (
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    title="Poll"
                    onClick={toggleHostPoll}
                    className={`${LIVE_BOTTOM_ICON_BTN} relative`}
                  >
                    <BarChart3 size={20} className="text-[#A7A7AD] relative z-[2]" strokeWidth={2.2} />
                  </button>
                  <span className="elix-silver-red-text text-[8px] font-medium">Poll</span>
                </div>
              )}
              <div className="flex flex-col items-center gap-0.5">
                <button type="button" title="Share" onClick={openSharePanel} className={`${LIVE_BOTTOM_ICON_BTN} relative`}>
                  <Share2 size={20} className="text-[#F5F5F7] relative z-[2]" />
</button>
                <span className="elix-silver-red-text text-[8px] font-medium">Share</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <button type="button" title="More options" onClick={openMoreMenu} className={`${LIVE_BOTTOM_ICON_BTN} relative`}>
                  <MoreVertical size={20} className="text-[#F5F5F7] relative z-[2]" />
</button>
                <span className="elix-silver-red-text text-[8px] font-medium">More</span>
              </div>
              </div>
            </div>
          )}
        </div>
        </div>
        </div>
      </div>

      {/* Gift panel: spectators from bar; anyone (incl. host) after tapping a co-host tile. */}
      {showGiftPanel && (!isCreatorParticipant || !!selectedCohostGiftUserId) && (
        <>
          <div className="fixed inset-0 bg-black/50 pointer-events-auto" style={{ zIndex: 99998 }} onClick={closeGiftPanel} />
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
                walletCoinBalanceRef.current = Math.max(0, Number(newBalance) || 0);
                setCoinBalance(walletCoinBalanceRef.current);
              }}
              onWeeklyRanking={openWeeklyRankingFromGift}
              onMembership={openMembershipFromGift}
              highlightGiftId={giftGoal?.giftId ?? null}
            />
          </div>
        </>
      )}

      {/* Co-host panel opener → spectators list + join requests (invite from panel). */}

      {/* Weekly Ranking Panel */}
      {showRankingPanel && (
        <>
          <div 
            className="fixed inset-0 bg-black/35 pointer-events-auto" 
            style={{ zIndex: 99998 }}
            onClick={closeRankingPanel}
          />
          <div className="fixed bottom-0 left-0 right-0 h-[40vh] z-[99999] pointer-events-auto max-w-[480px] mx-auto">
            <RankingPanel
              onClose={closeRankingPanel}
              initialTab={rankingInitialTab}
              sessionGifters={buildMvpRanked(mvpGiftScores, 100).map((v) => ({
                id: v.id,
                name: v.displayName || v.username || 'User',
                avatar: v.avatar,
                points: mvpGiftScores[v.id] ?? 0,
                subtitle: 'gift points',
              }))}
              spectators={activeViewers.slice(0, 1000).map((v) => ({
                id: v.id,
                name: v.displayName || v.username || 'User',
                avatar: v.avatar,
                points: mvpGiftScores[v.id] ?? 0,
                subtitle: mvpGiftScores[v.id] ? 'gift points' : 'watching',
              }))}
              giftGoal={giftGoal}
              onSendGiftGoal={
                isCreatorParticipant
                  ? undefined
                  : openGiftFromRanking
              }
              hostGoalEditor={
                isBroadcast
                  ? {
                      selectedGiftId: goalPick?.id ?? giftGoal?.giftId ?? null,
                      targetCount: goalTargetCount,
                      onSelectGift: (gift) => setGoalPick(gift),
                      onTargetCountChange: setGoalTargetCount,
                      onSave: saveGiftGoal,
                      onClear: clearGiftGoal,
                      saving: goalSaving,
                    }
                  : null
              }
            />
          </div>
        </>
      )}


      {/* MODALS & OVERLAYS */}
      {isFindCreatorsOpen && (
        <div className="fixed inset-0 z-[99999] flex flex-col justify-end max-w-[480px] mx-auto" style={{ height: '100%' }}>
          <div 
            className="absolute inset-0 bg-black/35 pointer-events-auto" 
            onClick={closeFindCreatorsPanel}
          />
          <div
            className="elix-glass rounded-t-2xl h-[40vh] flex flex-col shadow-2xl pointer-events-auto w-full relative z-10 overflow-hidden pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — line then name */}
            <div className="flex flex-col px-4 pt-2 pb-2 border-b border-white/10 flex-shrink-0">
              <div className="flex justify-center pb-2" aria-hidden>
                <div className="w-10 h-1 rounded-full bg-white/25" />
              </div>
              <span className="text-[#F5F5F7] font-bold text-sm text-center">Creators</span>
            </div>

            {/* Creator list */}
            <div className="flex-1 overflow-y-auto px-2" style={{ scrollbarWidth: 'none' }}>
              <div className="space-y-1 pb-4">
                {creatorsToInvite.map((c) => {
                  const isIncomingBattleInvite = !!(pendingInvite && pendingInvite.hostUserId === c.id);
                  const hasEmptyBattleSlot = battleSlots.some((s) => s.status === 'empty');

                  const handleReject = (ev: React.MouseEvent) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    clearInvitedBattleSlot(c.id);
                    if (pendingInvite && pendingInvite.hostUserId === c.id) declineBattleInvite();
                  };
                  const handleJoin = async (ev: React.MouseEvent) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if (pendingInvite && pendingInvite.hostUserId === c.id) acceptBattleInvite();
                  };

                  return (
                    <div
                      key={c.id}
                      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors ${!hasEmptyBattleSlot ? 'opacity-70' : ''}`}
                    >
                      <div className="relative flex-shrink-0">
                        <AvatarRing src={c.avatar} alt={c.name} size={SHARE_PANEL_AVATAR_PX} />
                        {c.isLive && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-white/20 rounded-full border border-[#1C1E24]" />}
                      </div>
                      <p className="flex-1 text-left text-white text-xs font-semibold truncate min-w-0">{c.name || c.username}</p>

                      {isIncomingBattleInvite ? (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            className="h-6 px-3 rounded-full bg-red-500/25 border border-red-400/50 inline-flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
                            onClick={handleReject}
                          >
                            <span className="text-red-300 text-[10px] font-bold leading-none whitespace-nowrap">Reject</span>
                          </button>
                          <button
                            type="button"
                            className="h-6 px-3.5 rounded-full bg-green-500 inline-flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
                            onClick={handleJoin}
                          >
                            <span className="text-black text-[10px] font-bold leading-none whitespace-nowrap">Join</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!hasEmptyBattleSlot || !(isBroadcast || isBattleJoiner)}
                          onClick={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            if (hasEmptyBattleSlot) void inviteCreatorToSlot(c.id);
                          }}
                          className="px-2 py-1 rounded-full bg-[#C9A96E] flex items-center justify-center gap-0.5 flex-shrink-0 active:scale-95 disabled:opacity-50"
                        >
                          <UserPlus size={9} className="text-black shrink-0 flex-shrink-0" strokeWidth={2} />
                          <span className="text-black text-[9px] font-bold">Invite</span>
                        </button>
                      )}
                    </div>
                  );
                })}

                {filteredCreators.length === 0 && creatorsLoading ? (
                  <div className="py-6 flex justify-center">
                    <div className="w-5 h-5 border-2 border-[#D8D9DD]/40 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : null}
                {filteredCreators.length === 0 && creatorsLoadFailed ? (
                  <div className="py-6 flex flex-col items-center gap-2">
                    <p className="text-white/50 text-[11px] text-center px-4">Could not load live creators</p>
                    <button type="button" onClick={() => loadCreators()} className="px-3 py-1.5 rounded-lg bg-white/10 border border-[#D8D9DD]/40 text-[#F5F5F7] text-[10px] font-bold active:scale-95">
                      Retry
                    </button>
                  </div>
                ) : null}
                {filteredCreators.length === 0 && !creatorsLoading && !creatorsLoadFailed ? (
                  <div className="py-8 flex flex-col items-center gap-2 px-4">
                    <p className="text-white/70 text-[12px] font-semibold text-center">No other creators live</p>
                    <p className="text-white/40 text-[10px] text-center leading-snug">
                      Only creators who are live with camera on can be invited to battle. This list refreshes automatically.
                    </p>
                    <button type="button" onClick={() => loadCreators()} className="mt-1 px-3 py-1.5 rounded-lg bg-white/10 border border-[#D8D9DD]/40 text-[#F5F5F7] text-[10px] font-bold active:scale-95">
                      Refresh
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Start Match Button â€” host only: the server only accepts battle_create from the room owner */}
            {isBroadcast && battleSlots.some(s => s.status === 'accepted') && (
              <div className="px-4 py-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={startMatchFromFindCreators}
                  className="w-full py-2.5 bg-[#E6E9EE] text-white text-xs font-bold rounded-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <Sword size={14} />
                  <span>Start Match</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {miniProfile && (
          <div className="absolute inset-0 z-[10000] flex flex-col justify-end">
            <div 
              className="absolute inset-0 pointer-events-auto" 
              onClick={closeMiniProfile}
            />
            <motion.div
              className="elix-panel rounded-t-2xl border-t border-[#2A2D33] px-4 pt-2 pb-[calc(28px+env(safe-area-inset-bottom))] pointer-events-auto shadow-2xl relative z-10 min-h-[42vh]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pb-2" aria-hidden>
                <div className="w-10 h-1 rounded-full bg-white/25" />
              </div>
              <h3 className="text-center text-[13px] font-bold elix-silver-red-text mb-2">
                User Profile
              </h3>
              <div className="border-t border-[#D8D9DD]/45 mb-4" aria-hidden />

              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="relative flex-shrink-0">
                    <AvatarRing src={typeof miniProfile.avatar === 'string' ? miniProfile.avatar : ''} alt={typeof miniProfile.username === 'string' ? miniProfile.username : 'User'} size={72} />
                  </div>
                  <div className="min-w-0 pt-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="text-white font-black text-[18px] truncate">{typeof miniProfile.username === 'string' ? miniProfile.username : 'User'}</div>
                      {miniProfile?.id && moderators.has(miniProfile.id) && (
                        <User className="w-3.5 h-3.5 text-[#F5F5F7] flex-shrink-0" strokeWidth={2.25} aria-hidden />
                      )}
                      <LevelBadge
                        level={typeof miniProfile.level === 'number' ? miniProfile.level : userLevel}
                        layout="fixed"
                        hideCircle
                        size={14}
                      />
                    </div>
                    {miniProfile.coins != null && (
                      <div className="text-white/70 text-[13px] font-bold mt-0.5">
                        {formatCoinsShort(miniProfile.coins)}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-white/50">
                      <div className="flex items-center gap-1">
                        <span className="text-white font-bold tabular-nums">{formatCountShort(miniProfile.followers_count ?? 0)}</span>
                        <span>Followers</span>
                      </div>
                      <div className="w-px h-2.5 bg-white/20" />
                      <div className="flex items-center gap-1">
                        <span className="text-white font-bold tabular-nums">{formatCountShort(miniProfile.following_count ?? 0)}</span>
                        <span>Following</span>
                      </div>
                    </div>

                    {miniProfile.bio && (
                      <div className="mt-3 text-[12px] text-white/80 leading-snug line-clamp-3">
                        {miniProfile.bio}
                      </div>
                    )}

                    {miniProfile.donated != null && miniProfile.donated > 0 && (
                      <div className="text-white text-[12px] font-bold mt-3 pt-2 border-t border-[#2A2D33]">
                        Donated: {formatCoinsShort(miniProfile.donated)} coins
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-4 gap-2">
                {!(miniProfile?.id && user?.id && miniProfile.id === user.id) && (
                <button
                  type="button"
                  onClick={miniProfileFollowClick}
                  className={`h-10 rounded-lg text-[11px] active:scale-95 transition-all ${
                    miniProfile?.id &&
                    (miniProfileFollowsThem === true ||
                      (miniProfileFollowsThem === undefined && followingUsers.includes(miniProfile.id)))
                      ? 'bg-white/10 text-white border border-[#2A2D33] font-bold'
                      : 'bg-[#E6E9EE] text-white font-black hover:bg-[#E6E9EE]/90 elix-solid-accent'
                  }`}
                >
                  {miniProfile?.id &&
                  (miniProfileFollowsThem === true ||
                    (miniProfileFollowsThem === undefined && followingUsers.includes(miniProfile.id)))
                    ? 'Following'
                    : 'Follow'}
                </button>
                )}
                <button 
                  type="button" 
                  onClick={goMiniProfileFromMini}
                  className="h-10 rounded-lg bg-white/10 text-white text-[11px] font-bold hover:bg-white/20 active:scale-95 transition-all"
                >
                  Profile
                </button>
                <button type="button" onClick={miniProfileShareClick} className="h-10 rounded-lg bg-white/10 text-white text-[11px] font-bold hover:bg-white/20 active:scale-95 transition-all">
                  Share
                </button>
                {miniProfile?.liveStreamKey &&
                  !(miniProfile?.id && user?.id && miniProfile.id === user.id) && (
                  <button
                    type="button"
                    onClick={watchMiniProfileLive}
                    className="h-10 rounded-lg bg-white text-black text-[11px] font-black hover:bg-white/90 active:scale-95 transition-all flex items-center justify-center gap-1"
                  >
                    <Play size={12} className="text-black" fill="black" />
                    Watch LIVE
                  </button>
                )}
              </div>
              {/* Moderator actions â€” only creator and mods see these */}
              {(isBroadcast || (miniProfile?.id && moderators.has(user?.id || ''))) && miniProfile?.id && miniProfile.id !== user?.id && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {isBroadcast && (
                    <button type="button" onClick={toggleMiniProfileModerator} className={`h-10 rounded-lg text-[11px] font-bold active:scale-95 transition-all ${miniProfile?.id && moderators.has(miniProfile.id) ? 'bg-purple-950/50 text-white/70 border border-purple-900/50' : 'bg-purple-600 text-white'}`}>
                      {miniProfile?.id && moderators.has(miniProfile.id) ? 'Remove Mod' : 'Make Mod'}
                    </button>
                  )}
                  <button type="button" onClick={() => { void blockMiniProfileUser(); }} className="h-10 rounded-lg bg-black/50 text-white/60 text-[11px] font-bold border border-white/20/50 hover:bg-white/10/50 active:scale-95 transition-all">
                    Block
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══ VIEWER LIST: Top gifters (MVP) OR spectators + join requests (invite to co-host) ═══ */}
      {showViewerList && (
        <>
          <div
            className="fixed inset-0 bg-black/35 pointer-events-auto"
            style={{ zIndex: 99998 }}
            onClick={closeViewerList}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[999999] pointer-events-auto max-w-[480px] mx-auto">
            <div className="elix-panel backdrop-blur-md rounded-t-2xl h-[36vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="relative flex flex-col px-4 pt-2 pb-2 border-b border-white/10 flex-shrink-0">
                <div className="flex justify-center pb-2" aria-hidden>
                  <div className="w-10 h-1 rounded-full bg-white/25" />
                </div>
                <div className="absolute left-2 top-2 flex items-center gap-1 z-10">
                  <Users size={12} className="text-white/50" />
                  <span className="text-white/60 text-xs font-semibold tabular-nums">
                    {viewerListMode === 'topGifters'
                      ? formatCountShort(topGiftersForPanel.length)
                      : formatCountShort(activeViewers.length)}
                  </span>
                </div>
                <h3 className="text-[#F5F5F7] font-bold text-sm text-center w-full">
                  {viewerListMode === 'topGifters'
                    ? topGiftersSide === 'host'
                      ? 'Top gifters · Red'
                      : topGiftersSide === 'opponent'
                        ? 'Top gifters · Blue'
                        : 'Top viewers & gifters'
                    : 'Spectators'}
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4 min-h-0">
                {viewerListMode === 'topGifters' ? (
                  <>
                    <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider mb-1.5">MVP Â· Gift coins this live</p>
                    {topGiftersForPanel.length > 0 ? (
                      topGiftersForPanel.map((v, i) => {
                        const gifted =
                          topGiftersSide === 'host'
                            ? (mvpGiftScoresHost[v.id] ?? 0)
                            : topGiftersSide === 'opponent'
                              ? (mvpGiftScoresOpponent[v.id] ?? 0)
                              : (mvpGiftScores[v.id] ?? 0);
                        const displayName = liveViewerLabel(v);
                        const isMvp = i === 0 && gifted > 0;
                        return (
                          <button
                            key={`gifter-${v.id}`}
                            type="button"
                            className="flex items-center gap-3 w-full py-2 rounded-lg hover:bg-white/[0.03] text-left"
                            onClick={() => {
                              void openMiniProfile(displayName, undefined, { userId: v.id, avatar: v.avatar, level: v.level });
                              setShowViewerList(false);
                            }}
                          >
                            <span className="text-white/30 text-xs font-bold w-5 text-right flex-shrink-0">{i + 1}</span>
                            <div className="relative flex-shrink-0">
                              <div className={isMvp ? 'rounded-full shadow-[0_0_3px_0_rgba(230,233,238,0.30)]' : 'rounded-full'}>
                                <AvatarRing
                                  src={resolveCircleAvatar(v.avatar, displayName)}
                                  alt={displayName}
                                  size={LIVE_MVP_PROFILE_RING_PX}
                                />
                              </div>
                              {isMvp ? (
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#E6E9EE] text-white text-[6px] font-black leading-none tracking-wide">
                                  MVP
                                </span>
                              ) : null}
                            </div>
                            <LevelBadge
                              level={typeof v.level === 'number' ? v.level : 1}
                              layout="fixed"
                              hideCircle
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-semibold truncate">{displayName}</p>
                              <p className="text-white/40 text-[10px] font-medium">
                                {gifted > 0 ? 'Top gifter' : 'Viewer'}
                              </p>
                            </div>
                            <span className="text-[#F5F5F7] text-xs font-bold tabular-nums flex-shrink-0">
                              {formatCountShort(gifted)}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Users className="w-7 h-7 text-white/10 mb-2" />
                        <p className="text-white/50 text-sm">No gifters yet</p>
                        <p className="text-white/30 text-xs mt-1">Send a gift to appear on the MVP list</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                {pendingInvite && (
                  <div className="mb-3 flex items-center gap-2.5 w-full py-1 px-2 rounded-full bg-white/5 border border-[#D8D9DD]/30">
                    <div
                      className="rounded-full overflow-hidden bg-[rgba(0,0,0,0.35)] flex-shrink-0"
                      style={{ width: SHARE_PANEL_AVATAR_PX, height: SHARE_PANEL_AVATAR_PX }}
                    >
                      {pendingInvite.hostAvatar ? (
                        <img src={pendingInvite.hostAvatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#F5F5F7] font-bold">{pendingInvite.hostName.slice(0, 1).toUpperCase()}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">@{pendingInvite.hostName}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button type="button" onClick={declineBattleInvite} className="h-6 px-3 rounded-full bg-red-500/25 border border-red-400/50 inline-flex items-center justify-center active:scale-95">
                        <span className="text-red-300 text-[10px] font-bold leading-none whitespace-nowrap">Reject</span>
                      </button>
                      <button type="button" onClick={acceptBattleInviteClick} className="h-6 px-3.5 rounded-full bg-green-500 inline-flex items-center justify-center active:scale-95">
                        <span className="text-black text-[10px] font-bold leading-none whitespace-nowrap">Join</span>
                      </button>
                    </div>
                  </div>
                )}

                {pendingCohostInvite && (
                  <div className="mb-3 flex items-center gap-2.5 w-full py-1 px-2 rounded-full bg-white/5 border border-[#D8D9DD]/30">
                    <div
                      className="rounded-full overflow-hidden bg-[rgba(0,0,0,0.35)] flex-shrink-0"
                      style={{ width: SHARE_PANEL_AVATAR_PX, height: SHARE_PANEL_AVATAR_PX }}
                    >
                      {pendingCohostInvite.hostAvatar ? (
                        <img src={pendingCohostInvite.hostAvatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#F5F5F7] font-bold">{pendingCohostInvite.hostName.slice(0, 1).toUpperCase()}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">@{pendingCohostInvite.hostName}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button type="button" onClick={declineCohostInvite} className="h-6 px-3 rounded-full bg-red-500/25 border border-red-400/50 inline-flex items-center justify-center active:scale-95">
                        <span className="text-red-300 text-[10px] font-bold leading-none whitespace-nowrap">Reject</span>
                      </button>
                      <button type="button" onClick={acceptCohostInviteClick} className="h-6 px-3.5 rounded-full bg-green-500 inline-flex items-center justify-center active:scale-95">
                        <span className="text-black text-[10px] font-bold leading-none whitespace-nowrap">Join</span>
                      </button>
                    </div>
                  </div>
                )}

                {pendingJoinRequest && (
                  <div className="mb-3 flex items-center gap-2.5 w-full py-1 px-2 rounded-full bg-white/5 border border-[#D8D9DD]/30">
                    <div
                      className="rounded-full overflow-hidden bg-[rgba(0,0,0,0.35)] flex-shrink-0"
                      style={{ width: SHARE_PANEL_AVATAR_PX, height: SHARE_PANEL_AVATAR_PX }}
                    >
                      {pendingJoinRequest.requesterAvatar ? (
                        <img src={pendingJoinRequest.requesterAvatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#F5F5F7] font-bold">{pendingJoinRequest.requesterName.slice(0, 1).toUpperCase()}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">@{pendingJoinRequest.requesterName}</p>
                      <p className="text-white/40 text-[10px] font-medium">Requested to co-host</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button type="button" onClick={declineJoinRequestFromViewerList} className="h-6 px-3 rounded-full bg-red-500/25 border border-red-400/50 inline-flex items-center justify-center active:scale-95">
                        <span className="text-red-300 text-[10px] font-bold leading-none whitespace-nowrap">Reject</span>
                      </button>
                      <button type="button" onClick={acceptJoinRequestFromViewerList} className="h-6 px-3.5 rounded-full bg-green-500 inline-flex items-center justify-center active:scale-95">
                        <span className="text-black text-[10px] font-bold leading-none whitespace-nowrap">Join</span>
                      </button>
                    </div>
                  </div>
                )}

                {(() => {
                  const inviteable = activeViewers.filter((v) => {
                    if (!v?.id) return false;
                    if (sameUserId(v.id, user?.id) || sameUserId(v.id, effectiveStreamId)) return false;
                    if (coHosts.some((h) => sameUserId(h.userId, v.id))) return false;
                    if (pendingJoinRequest && sameUserId(pendingJoinRequest.requesterId, v.id)) return false;
                    return true;
                  });
                  if (inviteable.length === 0 && !pendingInvite && !pendingCohostInvite && !pendingJoinRequest) {
                    return (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <UserPlus className="w-7 h-7 text-white/10 mb-2" />
                        <p className="text-white/50 text-sm">No spectators yet</p>
                        <p className="text-white/30 text-xs mt-1">Viewers in this live will show here to invite</p>
                      </div>
                    );
                  }
                  if (inviteable.length === 0) return null;
                  return (
                    <>
                      {(pendingInvite || pendingCohostInvite || pendingJoinRequest) ? (
                        <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider mb-1.5 mt-1">Spectators</p>
                      ) : null}
                      {inviteable.map((v) => {
                        const displayName = liveViewerLabel(v);
                        const alreadyInvited = coHosts.some(
                          (h) => sameUserId(h.userId, v.id) && (h.status === 'invited' || h.status === 'pending_accept'),
                        );
                        return (
                          <div
                            key={`spec-${v.id}`}
                            className="mb-2 flex items-center gap-2.5 w-full py-1 px-2 rounded-full bg-white/5 border border-[#D8D9DD]/30"
                          >
                            <AvatarRing
                              src={resolveCircleAvatar(v.avatar, displayName)}
                              alt={displayName}
                              size={SHARE_PANEL_AVATAR_PX}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-semibold truncate">{displayName}</p>
                              <p className="text-white/40 text-[10px] font-medium">
                                {alreadyInvited ? 'Invite sent' : 'Watching'}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={alreadyInvited || isBattleMode || coHosts.length >= MAX_CO_HOSTS}
                              onClick={(ev) => {
                                ev.preventDefault();
                                ev.stopPropagation();
                                inviteCoHostFromViewer({
                                  id: v.id,
                                  name: displayName,
                                  avatar: typeof v.avatar === 'string' ? v.avatar : undefined,
                                });
                              }}
                              className="px-2 py-1 rounded-full bg-[#E6E9EE] flex items-center justify-center gap-0.5 flex-shrink-0 active:scale-95 disabled:opacity-50"
                            >
                              <UserPlus size={9} className="text-black shrink-0" strokeWidth={2} />
                              <span className="text-black text-[9px] font-bold">
                                {alreadyInvited ? 'Sent' : 'Invite'}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      
      


      {/* Join feedback is the chat Member capsule only — no center JOIN banner. */}

      {/* â•â•â• TEAM STATUS PANEL (Heart Icon) â•â•â• */}
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
            {/* Header — line then name */}
            <div className="flex flex-col px-1 pt-0 pb-2 border-b border-white/10 flex-shrink-0">
              <div className="flex justify-center pb-2" aria-hidden>
                <div className="w-10 h-1 rounded-full bg-white/25" />
              </div>
              <span className="text-[#F5F5F7] font-bold text-sm text-center w-full">Your Team Status</span>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar min-h-0">
               {/* Team Status Card */}
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

               {/* Heart senders — every membership heart counted per person */}
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

               {/* Total Gift Coins */}
               <div className="bg-white/5 rounded-xl p-3 border border-[#D8D9DD]/20 mt-2">
                 <div className="text-[#F5F5F7]/60 text-[9px] font-bold uppercase tracking-wider">Total Gift Coins Received</div>
                 <div className="text-[#D9A62E] font-bold text-lg">{totalGiftCoins.toLocaleString()}</div>
               </div>

               {/* Top Gifters */}
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

      {/* â•â•â• SUPER FAN GOAL PANEL (Membership) â•â•â• */}
      {showFanClub && (
        <>
          <div 
            className="fixed inset-0 bg-black/35 pointer-events-auto" 
            style={{ zIndex: 99998 }}
            onClick={closeFanClub}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
          <div
            className="elix-panel rounded-t-2xl p-3 pb-safe max-h-[40vh] overflow-y-auto no-scrollbar shadow-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — line then name */}
            <div className="flex flex-col px-1 pt-0 pb-2 border-b border-white/10">
              <div className="flex justify-center pb-2" aria-hidden>
                <div className="w-10 h-1 rounded-full bg-white/25" />
              </div>
              <span className="text-[#F5F5F7] font-bold text-sm text-center w-full">Super Fan Goal</span>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
              <div className="flex flex-col gap-3">
                {/* Subscription Banner */}
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

                {/* Photo Stickers - Creator Upload */}
                <div className="bg-white/5 rounded-xl p-3 border border-[#D8D9DD]/20">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-gold-metallic font-bold text-[10px] flex items-center gap-1">
                      <div className="w-4 h-4 rounded-full bg-[rgba(0,0,0,0.35)] flex items-center justify-center border border-[#D8D9DD]/40">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      </div>
                      Photo Stickers
                    </h3>
                    <span className="bg-white/5 text-[#F5F5F7] text-[7px] font-bold px-1.5 py-0.5 rounded-full border border-[#D8D9DD]/20">
                      {creatorStickers.length}/20
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {creatorStickers.map((sticker) => (
                      <div key={sticker.id} className="aspect-square rounded-lg bg-white/5 border border-[#D8D9DD]/10 relative overflow-hidden group">
                        <img src={sticker.image_url} alt={sticker.label} className="w-full h-full object-cover" />
                        <button
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeFanClubSticker(sticker.id)}
                        >
                          <X size={8} className="text-white/60" />
                        </button>
                      </div>
                    ))}
                    {creatorStickers.length < 20 && (
                      <button
                        className="aspect-square rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center border border-dashed border-[#D8D9DD]/30 relative overflow-hidden"
                        onClick={uploadSticker}
                        disabled={stickerUploading}
                      >
                        {stickerUploading ? (
                          <div className="w-4 h-4 border-t-[#FFFFFF] rounded-full animate-spin" />
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <PlusCircle size={14} className="text-[#F5F5F7]/60" />
                            <span className="text-[6px] text-[#F5F5F7]/60 font-bold uppercase">Upload</span>
                          </div>
                        )}
                      </button>
                    )}
                  </div>
                  {creatorStickers.length === 0 && (
                    <p className="text-white/30 text-[8px] text-center mt-2">Upload photo stickers for your subscribers</p>
                  )}
                </div>

                {isBroadcast && (
                  <GiftGoalGallery
                    mode="picker"
                    selectedGiftId={goalPick?.id ?? giftGoal?.giftId ?? null}
                    targetCount={goalTargetCount}
                    onSelectGift={(gift) => setGoalPick(gift)}
                    onTargetCountChange={setGoalTargetCount}
                    onSave={saveGiftGoal}
                    onClear={clearGiftGoal}
                    saving={goalSaving}
                  />
                )}
              </div>
            </div>
          </div>
          </div>
        </>
      )}

      <LiveEngagementOverlay
        state={engagementState}
        nowMs={engagementNowMs}
        milestoneFlash={milestoneFlash}
        stageFlash={stageFlash}
        onVote={votePoll}
      />

      {isMoreMenuOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/35 pointer-events-auto" 
            style={{ zIndex: 99998 }}
            onClick={closeMoreMenu}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto"
          >
          <div
            className="relative elix-panel rounded-t-2xl pb-safe h-[40vh] overflow-y-auto no-scrollbar shadow-2xl w-full "
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — line then name (same as For You More Options) */}
            <div className="flex flex-col px-4 pt-2 pb-3 border-b border-white/10">
              <div className="flex justify-center pb-2" aria-hidden>
                <div className="w-10 h-1 rounded-full bg-white/25" />
              </div>
              <span className="text-[#F5F5F7] font-bold text-sm text-center">More Options</span>
            </div>

            {/* Content â€” icon on top, label under (same as Share / Effects) */}
            <div className="grid grid-cols-4 gap-y-4 gap-x-2 pt-3 pb-2 px-3">

              <button type="button" onClick={moreShare} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  <Share2 className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Share</span>
              </button>

              {engagementFlags.engagementHubEnabled ? (
              <button
                type="button"
                onClick={openEngagementFromMore}
                className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
              >
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  <Gift className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Engagement</span>
              </button>
              ) : null}

              <button type="button" disabled={!isBroadcast} onClick={moreFlipCamera} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform disabled:opacity-40">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  <RefreshCw className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Flip</span>
              </button>

              <button type="button" disabled={!isBroadcast} onClick={moreToggleMic} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform disabled:opacity-40">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  {isMicMuted ? <MicOff className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} /> : <Mic className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />}
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">{isMicMuted ? 'Unmute' : 'Mute'}</span>
              </button>

              <button type="button" disabled={!isBroadcast} onClick={moreToggleCam} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform disabled:opacity-40">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  {isCamOff ? <CameraOff className="w-[18px] h-[18px] text-white/60 relative z-[2]" strokeWidth={1.8} /> : <Camera className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />}
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">{isCamOff ? 'Cam On' : 'Cam Off'}</span>
              </button>

              <button
                type="button"
                disabled={!isBroadcast}
                onClick={openLiveEffectsPanel}
                className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform disabled:opacity-40"
              >
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  <Sparkles className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Effects</span>
              </button>

              <button type="button" onClick={moreToggleChat} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  <MessageCircle className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">{isChatVisible ? 'Hide Chat' : 'Show Chat'}</span>
              </button>

              {isBroadcast && (
                <>
                  <button
                    type="button"
                    onClick={toggleHostPollFromMore}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
                  >
                    <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                      <Sparkles className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />
                    </div>
                    <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Poll</span>
                  </button>
                  {([5, 10, 15] as const).map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => startMysteryFromMore(mins)}
                      className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
                    >
                      <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                        <Timer className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />
                      </div>
                      <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">M{mins}m</span>
                    </button>
                  ))}
                </>
              )}

              <button type="button" onClick={moreReport} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  <Flag className="w-[18px] h-[18px] text-white/60 relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/60 text-center leading-tight w-full">Report</span>
              </button>

              {isBattleMode && battleWinner && isBroadcast && (
                <button type="button" onClick={triggerRematchFromMore} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform">
                  <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                    <RefreshCw className="w-[18px] h-[18px] text-[#F5F5F7] relative z-[2]" strokeWidth={1.8} />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Rematch</span>
                </button>
              )}

            </div>
          </div>
          </div>
        </>
      )}

      {showLiveEffectsPanel && (
        <>
          <div
            className="fixed inset-0 bg-black/35 pointer-events-auto"
            style={{ zIndex: 99998 }}
            onClick={closeLiveEffectsPanel}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
            <div
              className="elix-panel rounded-t-2xl p-3 pb-safe shadow-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col px-1 pt-0 pb-2 border-b border-white/10 mb-2">
                <div className="flex justify-center pb-2" aria-hidden>
                  <div className="w-10 h-1 rounded-full bg-white/25" />
                </div>
                <span className="text-[#F5F5F7] text-sm font-bold text-center w-full">
                  Effects{getLiveFaceEngineLabel() ? ` (${getLiveFaceEngineLabel()})` : ''}
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 px-1">
                {FILTER_PRESETS.filter((f) =>
                  ['none', 'cinema-warm', 'cinema-cold', 'cinema-teal', 'port-soft', 'port-beauty', 'port-youth', 'port-age', 'mood-dreamy', 'mood-neon', 'art-bw-high'].includes(f.id),
                ).map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => applyLiveFilterPreset(filter.css)}
                    className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[56px] transition-all active:scale-95 ${
                      liveFilterCss === filter.css
                        ? 'bg-white/10'
                        : 'bg-white/5'
                    }`}
                  >
                    <span className="text-lg">{filter.preview}</span>
                    <span className="text-[8px] text-white/60 whitespace-nowrap">{filter.name}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 px-1 mt-1 border-t border-white/5 pt-2">
                {LIVE_FACE_EFFECT_OPTIONS.map((fx) => (
                  <button
                    key={fx.id}
                    type="button"
                    onClick={() => applyLiveFaceEffectPreset(fx)}
                    className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[56px] transition-all active:scale-95 ${
                      activeLiveFaceEffect?.type === fx.type || (fx.type === 'none' && !activeLiveFaceEffect)
                        ? 'bg-white/10'
                        : 'bg-white/5'
                    }`}
                  >
                    <span className="text-lg">{fx.preview}</span>
                    <span className="text-[8px] text-white/60 whitespace-nowrap">{fx.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}


      <GiftAnimationOverlay streamId={effectiveStreamId} />
      {/* Separate photo feed (cards + xN) — does not replace gift video animation */}
      <LiveGiftFeedStack streamId={effectiveStreamId} />

      {/* POINT MULTIPLIER BOOSTER â€” a red boxing glove stays on the top-left, beside
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
                <span className="absolute -top-1 -right-1 text-[9px] font-black leading-none px-1 rounded-full bg-[#E6E9EE] text-white border border-black/40">{g.count}</span>
              )}
              {g.multiplier > 0 && (
                <span className="absolute -bottom-1 -right-1 text-[9px] font-black leading-none px-1 rounded-full bg-black text-[#E6E9EE] border border-[#E6E9EE]/60">x{g.multiplier}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Glove "caught" popup â€” server-synced to all clients when a gift is caught */}
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

      {/* Gift video â€” default z 50000 so it is visible on creator (including battle).
          Combo/bottom icons use 50001+ so they stay above the gift. */}
      <GiftOverlay
        key={`gift-${giftKey}`}
        videoSrc={currentGift?.video ?? null}
        onEnded={handleGiftEnded}
        isBattleMode={isBattleMode}
        battleSide={currentGift?.battleSide ?? null}
        muted={false}
      />
      
      {/* â•â•â• SHARE PANEL â•â•â• */}
      {showSharePanel && (
        <>
          <div 
            className="fixed inset-0 bg-black/35 pointer-events-auto" 
            style={{ zIndex: 99998 }}
            onClick={closeSharePanel}
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
            {/* Share to followers */}
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden pt-3 pb-4 flex-shrink-0 px-4 no-scrollbar">
              {shareFollowers.filter(f => f.username?.toLowerCase().includes(shareQuery.toLowerCase())).map((f) => (
                <button
                  key={f.user_id}
                  className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  style={{ width: SHARE_PANEL_ITEM_WIDTH_PX, minWidth: SHARE_PANEL_ITEM_WIDTH_PX }}
                  onClick={() => sendShareToFollower(f.user_id)}
                >
                  <div
                    className="rounded-full overflow-hidden bg-[#1A1A1F] flex-shrink-0"
                    style={{ width: SHARE_PANEL_AVATAR_PX, height: SHARE_PANEL_AVATAR_PX }}
                  >
                    <img
                      src={f.avatar_url || '/royce/default-avatar.svg'}
                      alt={f.username}
                      className="h-full w-full object-cover object-center"
                      draggable={false}
                    />
                  </div>
                  <span className="text-white/80 text-[11px] font-medium truncate w-full text-center">{shareSentTo.has(f.user_id) ? 'Sent' : f.username || 'User'}</span>
                </button>
              ))}
            </div>

            {/* Line between user circles and action icons */}
            <div className="mx-4 border-t border-[#D8D9DD]/45 flex-shrink-0" aria-hidden />

            {/* Action icons only — 4mm below the line */}
            <div className="flex-1 overflow-y-scroll overflow-x-hidden min-h-0 px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:bg-[#313845] [&::-webkit-scrollbar-thumb]:rounded-full" style={{ paddingTop: '4mm' }}>
              <div className="grid grid-cols-5 gap-y-3 gap-x-1.5 pt-0">
                {[
                  { name: 'WhatsApp', icon: <MessageCircle size={22} className="text-white" />, action: shareWhatsApp },
                  { name: 'Facebook', icon: <Share2 size={22} className="text-white" />, action: shareFacebook },
                  { name: 'Copy Link', icon: <Copy size={22} className="text-white" />, action: shareCopyLink },
                  { name: 'Repost live', icon: <RefreshCw size={22} className="text-white" />, action: () => void shareRepostLive() },
                  { name: 'Promote', icon: <TrendingUp size={22} className="text-white" />, action: sharePromote },
                  { name: 'Report', icon: <Flag size={22} className="text-white/60" />, isRed: true, action: shareReport },
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
        onClose={closePromotePanel}
        contentType="live"
        content={{
          id: effectiveStreamId,
          title: `Watch ${myCreatorName}'s LIVE on Elix!`,
          thumbnail: myAvatar,
          username: myCreatorName,
          avatar: myAvatar,
          postedAt: new Date().toLocaleDateString(),
        }}
      />

      {/* Engagement Hub â€” side drawer only (battle screen unchanged) */}
      <EngagementDrawer
        open={engagementOpen}
        activePanel={engagementPanel}
        liveSessionId={effectiveStreamId}
        creatorId={user?.id || effectiveStreamId}
        onOpenChange={setEngagementOpen}
        onPanelChange={setEngagementPanel}
      />

      {/* Report Modal */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={closeReportModal}
        videoId={effectiveStreamId || ''}
        contentId={user?.id || effectiveStreamId || ''}
        contentType="live"
      />

      {/* Battle invite overlay removed â€” invite is now shown inside the bottom panel */}

      {/* Moderation warning (AI flag + assist; first detection only) */}
      {showModerationWarning && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70" onClick={() => { setShowModerationWarning(false); setModerationWarningMessage(''); }}>
          <div className="bg-[rgba(0,0,0,0.35)] border border-[#2A2D33] rounded-xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
              <h3 className="font-semibold text-white">Safety reminder</h3>
            </div>
            <p className="text-white/80 text-sm mb-4">{moderationWarningMessage}</p>
            <button
              type="button"
              onClick={() => { setShowModerationWarning(false); setModerationWarningMessage(''); }}
              className="w-full py-2.5 rounded-lg bg-[#E6E9EE] text-white font-semibold"
            >
              OK
            </button>
          </div>
        </div>
      )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

