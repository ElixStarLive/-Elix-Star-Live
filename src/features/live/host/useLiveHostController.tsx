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
  Send,
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
  Coins,
  Lock,
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
import GiftAnimationOverlay, { pushLocalGiftPill } from '../../../components/GiftAnimationOverlay';
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
import { useLiveGiftsCatalog } from '../hooks/useLiveGiftsCatalog';
import { sendLivePaidGift } from '../gifts/sendLiveGift';
import { useHostLiveSession } from './session/useHostLiveSession';
import type { LiveKitSessionHandlers } from '../../../lib/liveKitSession';
import {
  battleCreate,
  battleEnd,
  battleInviteSend,
  battleJoin,
  battleSpectatorVote,
} from '../battle/liveBattleActions';
import { applyBattleTickTime, applyBattleWinStreak, normalizeBattleScores, normalizeBattleWinner } from '../battle/liveBattleScore';
import { runBattleInviteAccept, runBattleInviteDecline } from '../battle/liveBattleInviteHandshake';
import {
  cohostInviteAccept,
  cohostInviteSend,
  cohostLayoutSync,
  cohostRequestAccept,
  cohostRequestDecline,
  cohostRequestSend,
} from '../cohost/liveCohostActions';
import { liveChatSend, liveHeartSend } from '../chat/liveChatActions';
import { liveGiftGoalClear, liveGiftGoalSet } from '../gifts/liveGiftWsActions';
import { liveStreamStart } from '../room/liveRoomActions';
import { apiFetchWallet } from '../../wallet/walletApi';
import {
  apiFetchFollowingIds,
  apiFetchProfileById,
  apiFetchProfileByUsername,
  apiToggleFollow,
} from '../../feed/feedApi';
import { isGenericLiveCreatorName, profileToLiveDisplay } from '../../../lib/liveCreatorDisplay';
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
import { websocket } from '../../../lib/websocket';
import { bindLiveBattleWs } from '../ws/bindLiveBattleWs';
import { bindLiveBattleInviteWs } from '../ws/bindLiveBattleInviteWs';
import { bindLiveRoomWs } from '../ws/bindLiveRoomWs';
import { bindLiveCohostWs } from '../ws/bindLiveCohostWs';
import { bindLiveModerationWs } from '../ws/bindLiveModerationWs';
import {
  apiLiveEngagementMissions,
  apiLiveEngagementProgress,
  apiLiveEngagementWallet,
  apiLiveBlockUser,
  apiLiveGetDailyHearts,
  apiLiveMembership,
  apiLiveModerationCheck,
  apiLiveProgressionMe,
  apiLiveRankingsWeekly,
  apiLiveShareCreate,
  apiLiveStickerDelete,
  apiLiveStickers,
} from '../engagement/liveEngagementApi';
import { parseLiveGiftGoal, type LiveGiftGoal, isGiftGoalComplete, playGiftGoalReachedSound } from '../../../lib/liveGiftGoal';
import { liveStreamUiGiftTargetToServerBattleTarget, normalizeBattleGiftTarget } from '../../../lib/liveBattleGiftTarget';
import { engagementFlags } from '../../../config/engagementFlags';
import { earnBattleEnergyQuiet } from '../../../components/BattleEnergyBoostControls';
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
  'w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-sm border-0 shadow-none active:scale-95 transition-transform flex-shrink-0';

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

const _EMOJI_LIST = ['😀','😂','🥰','😍','🔥','💯','👏','🎉','❤️','💜','💙','⭐','🌟','✨','🙌','👑','💎','🚀','🎵','💃','🕺','😎','🤩','💪','🫶','💖'];

export function useLiveHostController() {
  const { streamId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewerVideoRef = useRef<HTMLVideoElement>(null);
  const opponentVideoRef = useRef<HTMLVideoElement>(null);
  const player3VideoRef = useRef<HTMLVideoElement>(null);
  const player4VideoRef = useRef<HTMLVideoElement>(null);
  const roomRemoteAudioRef = useRef<HTMLAudioElement>(null);
  const opponentRemoteAudioRef = useRef<HTMLAudioElement>(null);
  const coHostVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const battlePeerRef = useRef<{ close: () => void } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /** Like/hearts only in bottom chat strip — not over battle/video (see SpectatorPage `spectatorChatHeartsRef`). */
  const chatHeartLayerRef = useRef<HTMLDivElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const bindHostCameraPreview = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (!el) return;
    // Prefer live ref; fall back to Create-page cached stream so remounts don't go black.
    let stream = cameraStreamRef.current;
    if (!stream) {
      const cached = getCachedCameraStream();
      if (cached?.getVideoTracks()?.some((t) => t.readyState === 'live')) {
        cameraStreamRef.current = cached;
        stream = cached;
      }
    }
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
    }
    prepareLiveVideoEl(el);
  }, []);
  const [viewerHasStream, _setViewerHasStream] = useState(false);
  const { giftsCatalog, giftsCatalogRef, seenGiftTxnRef, setGiftsCatalog } = useLiveGiftsCatalog();
  // Dedup chat_message (room broadcast + owner-global fallback deliver once each).
  const seenChatMsgIdRef = useRef<Set<string>>(new Set());
  /** One "joined the stream" banner per user for the whole live session (not per reconnect). */
  const joinAnnouncedRef = useRef<Set<string>>(new Set());
  const setPromo = useLivePromoStore((s) => s.setPromo);
  const { user, updateUser } = useAuthStore();
  const followingUsers = useVideoStore((s) => s.followingUsers);
  const _rawStreamId = streamId;
  const PROMOTE_LIKES_THRESHOLD_LIVE = 100;
  const _PROMOTE_LIKES_THRESHOLD_BATTLE = 50;
  
  const [showRankingPanel, setShowRankingPanel] = useState(false);
  const [rankingInitialTab, setRankingInitialTab] = useState<LiveRankTab>('weekly');
  const [isFollowing, setIsFollowing] = useState(false);
  const [currentGift, setCurrentGift] = useState<{ video: string; battleSide?: 'host' | 'opponent' | null } | null>(null);
  // Gift video queue must live above the WS effect so creator playback never depends
  // on hook-order / late state declarations.
  const [giftQueue, setGiftQueue] = useState<{ video: string; battleSide?: 'host' | 'opponent' | null }[]>([]);
  const [giftKey, setGiftKey] = useState(0);
  const enqueueGiftVideoRef = useRef<(url: string, battleSide?: 'host' | 'opponent' | null) => void>(() => {});
  const playedGiftVideoTxnRef = useRef<Set<string>>(new Set());
  enqueueGiftVideoRef.current = (url: string, battleSide?: 'host' | 'opponent' | null) => {
    if (!url) return;
    setGiftQueue((prev) => appendCapped(prev, { video: url, battleSide: battleSide ?? null }, LIVE_GIFT_QUEUE_CAP));
  };
  const [messages, setMessages] = useState<LiveMessage[]>(() => []);
  const [coinBalance, setCoinBalance] = useState(0);
  /** Real wallet coins — never overwritten by test-coin display balance. */
  const walletCoinBalanceRef = useRef(0);
  const [starterCoinBalance, setStarterCoinBalance] = useState(0);
  const [promotionalCoinBalance, setPromotionalCoinBalance] = useState(0);
  const [giftSource, setGiftSource] = useState<
    "starter_coins" | "paid_coins" | "promotional_coins"
  >("paid_coins");
  const storePaidBalance = useWalletStore((s) => s.paidBalance);
  const storeStarterBalance = useWalletStore((s) => s.starterBalance);
  const storePromoBalance = useWalletStore((s) => s.promotionalBalance);
  // Keep GiftPanel paid/starter/promo display aligned with the wallet owner.
  useEffect(() => {
    if (!user?.id) return;
    if (giftSource === 'paid_coins') {
      walletCoinBalanceRef.current = storePaidBalance;
      setCoinBalance(Math.max(0, storePaidBalance));
    } else if (giftSource === 'starter_coins') {
      setStarterCoinBalance(storeStarterBalance);
    } else if (giftSource === 'promotional_coins') {
      setPromotionalCoinBalance(storePromoBalance);
    }
  }, [storePaidBalance, storeStarterBalance, storePromoBalance, giftSource, user?.id]);
  const [inputValue, setInputValue] = useState('');
  // Consolidate broadcast logic: host if streamId is broadcast OR if streamId matches my own user ID
  const isBroadcast = streamId === 'broadcast' || location.pathname === '/live/broadcast' || (user?.id && streamId === user.id);

  const {
    state: engagementState,
    nowMs: engagementNowMs,
    milestoneFlash,
    stageFlash,
    startMystery,
    startPoll,
    endPoll,
    votePoll,
  } = useLiveEngagement({ enabled: true, isHost: !!isBroadcast });

  // ?battle=1 declares battle-creator intent; the role itself is server-
  // authorized. The battle-join effect must obtain a LiveKit publish token —
  // issued only against the battle grant recorded when this user accepted a
  // real invite — before the camera opens. Anyone without the grant is
  // redirected to the spectator page.
  const isBattleJoiner = !isBroadcast && new URLSearchParams(location.search).get('battle') === '1';
  const isCreatorParticipant = Boolean(isBroadcast || isBattleJoiner);
  // Hard role separation, enforced by the page itself (not only the router):
  // this page is for creators (own broadcast or an accepted battle opponent).
  // Anyone else who lands here — deep link, stale URL, old build path — is a
  // spectator and belongs on the watch page.
  useEffect(() => {
    if (!isCreatorParticipant && streamId && streamId !== 'broadcast' && streamId !== 'start' && streamId !== 'watch') {
      navigate(`/watch/${streamId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreatorParticipant, streamId]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [engagementPanel, setEngagementPanel] = useState<EngagementPanel>('hub');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [showModerationWarning, setShowModerationWarning] = useState(false);
  const [pageExiting, setPageExiting] = useState(false);
  const [spectatorCoHostRequestSent, setSpectatorCoHostRequestSent] = useState(false);
  const [moderationWarningMessage, setModerationWarningMessage] = useState('');
  const [showViewerList, setShowViewerList] = useState(false);
  /** MVP / supporters → top gifters; UserPlus / co-host request → invite spectators. */
  const [viewerListMode, setViewerListMode] = useState<'spectators' | 'topGifters'>('spectators');
  /** When opening top gifters from a battle side row. */
  const [topGiftersSide, setTopGiftersSide] = useState<'all' | 'host' | 'opponent'>('all');
  const [moderators, setModerators] = useState<Set<string>>(new Set());
  const attachRemoteAudio = useCallback((track: import('livekit-client').Track, el: HTMLAudioElement | null) => {
    if (track.kind !== 'audio') return;
    if (el) {
      track.attach(el);
      el.muted = false;
      el.volume = 1;
      el.autoplay = true;
      (el as unknown as { playsInline: boolean }).playsInline = true;
      void el.play().catch(() => {});
      return;
    }
    const attached = track.attach();
    if (attached instanceof HTMLMediaElement) {
      attached.muted = false;
      attached.volume = 1;
      void attached.play().catch(() => {});
    }
  }, []);

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  // user is already defined above
  const isBroadcaster = isBroadcast;
  const effectiveStreamId = isBroadcaster ? (user?.id || 'broadcast') : (_rawStreamId || 'broadcast');
  const effectiveStreamIdRef = useRef(effectiveStreamId);
  effectiveStreamIdRef.current = effectiveStreamId;
  const liveKitHandlersRef = useRef<LiveKitSessionHandlers>({});
  const _formatStreamName = (id: string) =>
    id
      .split(/[-_]/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  const resolveCircleAvatar = useCallback(
    (avatar: string | null | undefined, name: string | null | undefined) =>
      resolveUiAvatarUrl(avatar, name, LIVE_MVP_PROFILE_RING_PX * 2),
    [],
  );
  const [hostName, setHostName] = useState('');
  const [hostAvatar, setHostAvatar] = useState('');
  const creatorName = isCreatorParticipant
    ? user?.name || user?.username || 'Creator'
    : hostName || 'Creator';
  const myCreatorName = creatorName;
  const myAvatar = isCreatorParticipant
    ? user?.avatar || ''
    : hostAvatar || '';
  const getHostCameraStream = useCallback(() => cameraStreamRef.current, []);
  const hostSession = useHostLiveSession({
    enabled: Boolean(isBroadcast && user?.id && effectiveStreamId),
    roomId: effectiveStreamId,
    displayName: creatorName,
    getCameraStream: getHostCameraStream,
    cameraStream,
    liveKitHandlersRef,
  });
  const hostLifecycleRef = hostSession.lifecycleRef;
  const liveRegisteredRef = hostSession.registeredRef;
  const liveKitRoomRef = hostSession.liveKitRoomRef;
  const liveKitCreds = hostSession.creds;
  const publishHostLiveKitTracks = hostSession.publishFromCamera;
  const [opponentCreatorName, setOpponentCreatorName] = useState('');
  const viewerName = user?.username || user?.name || 'viewer_123';
  const viewerAvatar = resolveUiAvatarUrl(user?.avatar, viewerName);
  /** Floating like hearts: host shows self; spectator shows their own name (not the creator’s). */
  const heartFloatName = isBroadcast ? myCreatorName : viewerName;
  const heartFloatAvatar = isBroadcast ? (user?.avatar || myAvatar || '') : viewerAvatar;
  const universeGiftLabel = 'Universe';

  useEffect(() => {
    const creatorId = isBroadcast ? (user?.id || '') : effectiveStreamId;
    if (!creatorId || creatorId === 'broadcast') {
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
  }, [isBroadcast, effectiveStreamId, user?.id]);

  // Face AR overlays attach via FaceARGift + videoRef
  const [_battleGiftIconFailed, _setBattleGiftIconFailed] = useState(false);

  // Handle keyboard/viewport resizing for Viewer List
  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        // Calculate the part of the height covered by keyboard (or other UI)
        // This handles both iOS (keyboard overlay) and Android (resize) nuances
        const height = window.innerHeight - window.visualViewport.height;
        // Only apply if significant (keyboard likely open)
        const offset = height > 0 ? height : 0;
        document.documentElement.style.setProperty('--kb-height', `${offset}px`);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      handleResize(); // Initial check
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  // Auto-close Co-Host panel after 60s of inactivity
  useEffect(() => {
    if (showViewerList) {
      const timer = setTimeout(() => {
        setShowViewerList(false);
      }, 60000);
      return () => clearTimeout(timer);
    }
  }, [showViewerList]);

  // Fetch host info when viewing a stream (non-broadcast mode)
  // Note: Without a database, we derive host info from the stream key
  useEffect(() => {
    if (isBroadcast || !effectiveStreamId) return;
    
    // Derive host name from stream key (simplified without DB)
    const hostLabel = effectiveStreamId.slice(0, 8).toUpperCase();
    setHostName(`Creator ${hostLabel}`);
    setHostAvatar(`https://ui-avatars.com/api/?name=${encodeURIComponent(hostLabel)}&background=121212&color=FFFFFF`);
  }, [isBroadcast, effectiveStreamId]);

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
        setCoinBalance(Math.max(0, walletBal));
        const p = (progression.data?.progression ?? null) as Record<string, unknown> | null;
        const starter = Math.max(0, Number(p?.starter_coin_balance) || 0);
        setStarterCoinBalance(starter);
        const ew = engagementWallet.data?.wallet as Record<string, number> | undefined;
        const promo = Math.max(
          0,
          Number(ew?.promotionalCoins ?? ew?.promotional_coins ?? 0) || 0,
        );
        setPromotionalCoinBalance(promo);
        useWalletStore.getState().applyServerBalances({
          paid: walletBal,
          starter,
          promotional: promo,
        });
        if (promo > 0 && engagementFlags.promoGiftSpendEnabled) {
          setGiftSource('promotional_coins');
        } else if (starter > 0) {
          setGiftSource('starter_coins');
        } else {
          setGiftSource('paid_coins');
        }
        const serverLevel = Math.max(0, Number(p?.current_level) || 0);
        const serverXp = Math.max(0, Number(p?.total_xp) || 0);
        const resolvedLevel = Math.max(serverLevel, Number(user.level) || 0);
        setUserLevel(resolvedLevel);
        if (serverLevel > 0) updateUser({ level: serverLevel });
        setUserXP(serverXp);
      })
      .catch(() => {
        if (cancelled) return;
        showToast('Could not load wallet balance');
      });
    return () => { cancelled = true; };
  }, [user?.id, user?.level, updateUser]);

  const [isMyStreamLive, setIsMyStreamLive] = useState(false);
  const creatorNameRef = useRef(creatorName);
  creatorNameRef.current = creatorName;

  // Track stream status locally (without database)
  useEffect(() => {
    if (!user?.id) return;
    const key = effectiveStreamId;
    if (!key) return;

    if (isBroadcast) {
      // Mark stream as live locally
      setIsMyStreamLive(true);
      
      // Broadcast to other viewers via WebSocket (handled by server)
      liveStreamStart({
        stream_key: key,
        user_id: user.id,
        title: creatorNameRef.current,
      });
    } else {
      // Viewer mode - rely on WebSocket events for stream status
    }
  }, [effectiveStreamId, isBroadcast, user?.id]);

  // End live registration only on page unmount (not on effect re-run mid-stream).
  useEffect(() => {
    return () => {
      if (!liveRegisteredRef.current) return;
      const room = effectiveStreamIdRef.current;
      void apiLiveEnd(room).finally(() => {
        liveRegisteredRef.current = false;
      });
    };
  }, []);

  useEffect(() => {
    // Title is set at stream start via POST /api/live/start; no DB update needed here
  }, [creatorName, isBroadcast, isMyStreamLive, effectiveStreamId, user?.id]);

  useEffect(() => {
    if (user?.id && effectiveStreamId) {
      const today = new Date().toISOString().split('T')[0];
      const storageKey = `joined_stream_${effectiveStreamId}_${user.id}_${today}`;
      const hasJoined = localStorage.getItem(storageKey);
      if (hasJoined) {
        setHasJoinedToday(true);
      }
      // Personal join tally is only for watchers. While broadcasting, myHeartCount is
      // creator total from apiLiveMembership — do not overwrite with local viewer key.
      // Still sync whether THIS account already sent today's membership heart (Join orange).
      const creatorId = isBroadcast ? user.id : String(effectiveStreamId).trim();
      if (creatorId && creatorId !== 'broadcast') {
        void apiLiveGetDailyHearts(creatorId)
          .then(({ data: d }) => {
            if (d?.hasSent === true) {
              setHasJoinedToday(true);
              localStorage.setItem(storageKey, 'true');
            }
          })
          .catch(() => {});
      }
    }
  }, [user?.id, effectiveStreamId, isBroadcast]);

  /** Battle / opponent rooms — separate from host publish session. */
  const battleLifecycleRef = useRef(new LiveRoomLifecycle());
  const opponentLifecycleRef = useRef(new LiveRoomLifecycle());

  const [isFindCreatorsOpen, setIsFindCreatorsOpen] = useState(false);
  const [_memberCount, setMemberCount] = useState(0);
  const [hasJoinedToday, setHasJoinedToday] = useState(false);
  const [myHeartCount, setMyHeartCount] = useState(0);
  const [dailyHeartCount, setDailyHeartCount] = useState(0);
  const [totalGiftCoins, setTotalGiftCoins] = useState(0);
  const [topGifters, setTopGifters] = useState<{ user_id: string; total_coins: number; username?: string; avatar_url?: string }[]>([]);
  const [heartMembers, setHeartMembers] = useState<{
    user_id: string;
    heart_days: number;
    username?: string;
    avatar_url?: string;
  }[]>([]);

  /** Membership API sometimes returns empty names → UI showed user_id.slice(0,8) like "ea72ee76". */
  const membershipNameMissing = useCallback((name: string | undefined, userId: string) => {
    const n = String(name || '').trim();
    if (!n) return true;
    if (isGenericLiveCreatorName(n)) return true;
    if (userId && (n === userId || n === userId.slice(0, 8))) return true;
    return false;
  }, []);

  const enrichMembershipPeople = useCallback(
    async <T extends { user_id: string; username?: string; avatar_url?: string }>(people: T[]): Promise<T[]> => {
      if (!Array.isArray(people) || people.length === 0) return people;
      const next = people.map((p) => ({ ...p }));
      await Promise.all(
        next.map(async (p, i) => {
          if (!membershipNameMissing(p.username, p.user_id) && p.avatar_url) return;
          try {
            const { body, error } = await apiFetchProfileById(p.user_id);
            if (error || !body) return;
            const { name, avatar } = profileToLiveDisplay(body);
            const resolvedName =
              name && !membershipNameMissing(name, p.user_id) ? name : '';
            if (!resolvedName && !avatar) return;
            next[i] = {
              ...p,
              username: resolvedName || undefined,
              avatar_url: (avatar && avatar.trim()) || p.avatar_url,
            };
          } catch {
            /* keep existing row */
          }
        }),
      );
      return next;
    },
    [membershipNameMissing],
  );

  const applyMembershipStats = useCallback(
    async (d: Record<string, unknown>) => {
      if (typeof d.todayHearts === 'number') setDailyHeartCount(d.todayHearts);
      if (typeof d.totalHearts === 'number') setMyHeartCount(d.totalHearts);
      if (typeof d.totalGiftCoins === 'number') setTotalGiftCoins(d.totalGiftCoins);
      if (Array.isArray(d.topGifters)) {
        const raw = (d.topGifters as {
          user_id: string;
          total_coins: number;
          username?: string;
          avatar_url?: string;
        }[]).map((g) => ({
          ...g,
          username: membershipNameMissing(g.username, g.user_id) ? undefined : g.username,
        }));
        setTopGifters(raw);
        void enrichMembershipPeople(raw).then((enriched) => setTopGifters(enriched));
      }
      if (Array.isArray(d.heartMembers)) {
        const raw = (d.heartMembers as {
          user_id: string;
          heart_days: number;
          username?: string;
          avatar_url?: string;
        }[]).map((m) => ({
          ...m,
          username: membershipNameMissing(m.username, m.user_id) ? undefined : m.username,
        }));
        setHeartMembers(raw);
        void enrichMembershipPeople(raw).then((enriched) => setHeartMembers(enriched));
      }
    },
    [enrichMembershipPeople, membershipNameMissing],
  );

  // Fetch membership stats for creator (hearts + real gift coins / top supporters)
  useEffect(() => {
    if (!user?.id) return;
    const fetchStats = () => {
      apiLiveMembership(user.id)
        .then(({ data: d }) => {
          if (!d) return;
          void applyMembershipStats(d);
        })
        .catch(() => {});
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [user?.id, applyMembershipStats]);

  const [creatorQuery, setCreatorQuery] = useState('');
  const [creators, setCreators] = useState<{ id: string; streamKey: string; name: string; username: string; followers: string; avatar: string; isLive: boolean }[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);
  const [creatorsLoadFailed, setCreatorsLoadFailed] = useState(false);

  const loadCreators = useCallback(async () => {
    if (!user?.id) return;
    setCreatorsLoading(true);
    setCreatorsLoadFailed(false);
    try {
      const { streams, error } = await apiLiveStreams();
      if (error) throw new Error(error);
      // Support both snake_case and camelCase from /api/live/streams
      const liveCreators = streams
        .map((raw) => {
          const s = raw as {
            stream_key?: string;
            room_id?: string;
            user_id?: string;
            userId?: string;
            hostUserId?: string;
            title?: string;
            display_name?: string;
            displayName?: string;
          };
          const streamKey = String(s.stream_key ?? s.room_id ?? '').trim();
          const uid = String(s.user_id ?? s.userId ?? s.hostUserId ?? streamKey).trim();
          const title = s.title ?? s.display_name ?? s.displayName ?? '';
          const label = title
            ? String(title).slice(0, 20)
            : (uid ? 'Creator' : 'Creator');
          return { uid, streamKey, label };
        })
        .filter(({ uid, streamKey }) => {
          if (!uid && !streamKey) return false;
          const ids = [uid, streamKey].filter(Boolean);
          if (ids.some((id) => isSelfUser(id, user.id, isBroadcast ? effectiveStreamId : null))) return false;
          return true;
        })
        .map(({ uid, streamKey, label }) => {
          const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=121212&color=FFFFFF`;
          return {
            id: uid || streamKey,
            streamKey: streamKey || uid,
            name: label,
            username: label,
            followers: '0',
            avatar,
            isLive: true,
          };
        });
      setCreators(liveCreators);
      setCreatorsLoadFailed(false);
    } catch {
      setCreatorsLoadFailed(true);
      setCreators([]);
    } finally {
      setCreatorsLoading(false);
    }
  }, [user?.id, isBroadcast, effectiveStreamId]);

  useEffect(() => {
    if (user?.id) loadCreators();
  }, [user?.id, loadCreators]);

  // Refetch creators when opening Invite panel so list is fresh
  useEffect(() => {
    if (isFindCreatorsOpen && user?.id) loadCreators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFindCreatorsOpen, loadCreators]);

  const filteredCreators = creators.filter((c) => {
    if (isSelfUser(c.id, user?.id, isBroadcast ? effectiveStreamId : null)) return false;
    if (!c.isLive) return false;
    const q = creatorQuery.trim().toLowerCase();
    if (!q) return true;
    return c.username.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });
  const creatorsToInvite = React.useMemo(() => filteredCreators, [filteredCreators]);

  // Battle Player Slots (P1 = creator, P2-P4 = invited players)
  const [battleSlots, setBattleSlots] = useState<BattleSlot[]>([
    { userId: '', name: '', status: 'empty', avatar: '' },
    { userId: '', name: '', status: 'empty', avatar: '' },
    { userId: '', name: '', status: 'empty', avatar: '' },
  ]);
  const battleSlotsRef = useRef(battleSlots);
  useEffect(() => { battleSlotsRef.current = battleSlots; }, [battleSlots]);
  const hasOpponentStreamRef = useRef(false);
  const inviteTimersRef = useRef<Map<string, number>>(new Map());

  const clearBattleInviteTimer = useCallback((creatorId: string) => {
    const t = inviteTimersRef.current.get(creatorId);
    if (t) {
      clearTimeout(t);
      inviteTimersRef.current.delete(creatorId);
    }
  }, []);

  const clearInvitedBattleSlot = useCallback((creatorId: string) => {
    clearBattleInviteTimer(creatorId);
    setBattleSlots((prev) => {
      const idx = prev.findIndex((s) => s.userId === creatorId && s.status === 'invited');
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { userId: '', name: '', status: 'empty', avatar: '' };
      return next;
    });
  }, [clearBattleInviteTimer]);

  const inviteCreatorToSlot = async (creatorId: string) => {
    // Every battle creator (host OR accepted opponent) can invite more live
    // creators into the match. Co-host is a separate normal-live flow only.
    if (!isBroadcast && !isBattleJoiner) return;
    const slotIndex = battleSlots.findIndex(s => s.status === 'empty');
    if (slotIndex === -1) return;
    if (battleSlots.some(s => s.userId === creatorId && s.status !== 'empty')) return;

    const creator = creators.find(c => c.id === creatorId);
    if (!creator) return;
    const avatar = creator.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.username)}&background=121212&color=FFFFFF`;
    setBattleSlots(prev => {
      const next = [...prev];
      next[slotIndex] = { userId: creatorId, name: creator.username, status: 'invited', avatar };
      return next;
    });

    if (!user?.id) return;
    // streamKey must be the battle room (host room). For the joiner,
    // effectiveStreamId is already the host's stream id.
    battleInviteSend({
      targetUserId: creatorId,
      targetStreamKey: creator.streamKey || creatorId,
      hostName: myCreatorName,
      hostAvatar: myAvatar,
      streamKey: effectiveStreamId,
    });

    clearBattleInviteTimer(creatorId);
    const timer = window.setTimeout(() => {
      inviteTimersRef.current.delete(creatorId);
      clearInvitedBattleSlot(creatorId);
    }, 60_000);
    inviteTimersRef.current.set(creatorId, timer);
  };

  // ─── INCOMING INVITE (for viewers / other broadcasters) ─────
  type PendingInvite = {
    hostName: string;
    hostAvatar: string;
    streamKey: string;
    hostUserId: string;
  };
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);

  const closeAllBottomPanels = useCallback(() => {
    setIsFindCreatorsOpen(false);
    setShowViewerList(false);
    setShowGiftPanel(false);
    setShowSharePanel(false);
    setShowRankingPanel(false);
    setShowFanClub(false);
  }, []);

  useEffect(() => {
    if (pendingInvite) {
      // Invite arrives → panel comes up on the other creator with Join/Reject.
      setShowViewerList(false);
      setShowGiftPanel(false);
      setShowSharePanel(false);
      setIsFindCreatorsOpen(true);
      const inviter = pendingInvite;
      setCreators(prev => {
        if (prev.some(c => c.id === inviter.hostUserId)) return prev;
        return [...prev, { id: inviter.hostUserId, streamKey: inviter.streamKey || inviter.hostUserId, name: inviter.hostName, username: inviter.hostName, followers: '0', avatar: inviter.hostAvatar, isLive: true }];
      });
    }
  }, [pendingInvite]);

  useEffect(() => {
    if (!pendingInvite) return;
    const t = window.setTimeout(() => setPendingInvite(null), 60_000);
    return () => window.clearTimeout(t);
  }, [pendingInvite]);

  const acceptBattleInvite = useCallback(async () => {
    if (!pendingInvite || !user?.id) return;
    const invite = pendingInvite;
    setPendingInvite(null);
    closeAllBottomPanels();
    if (!invite.streamKey) {
      showToast('Missing stream key');
      return;
    }
    const granted = await runBattleInviteAccept({
      invite,
      requesterName: user?.username || user?.name || viewerName,
      requesterAvatar: viewerAvatar,
      streamKey: user?.id || effectiveStreamId,
    });
    if (!granted) return;
    navigate(`/live/${invite.streamKey}?battle=1`, {
      state: { battleHost: { userId: invite.hostUserId, name: invite.hostName, avatar: invite.hostAvatar } },
    });
  }, [pendingInvite, user?.id, user?.username, user?.name, viewerName, viewerAvatar, effectiveStreamId, navigate, closeAllBottomPanels]);

  const declineBattleInvite = useCallback(async () => {
    if (!pendingInvite) return;
    runBattleInviteDecline(pendingInvite);
    setPendingInvite(null);
    closeAllBottomPanels();
  }, [pendingInvite, closeAllBottomPanels]);

  // Mute state per player pane
  const [mutedPlayers, setMutedPlayers] = useState<Record<string, boolean>>({});
  const [cameraOffPlayers, setCameraOffPlayers] = useState<Record<string, boolean>>({});
  const togglePlayerMute = (player: string) => {
    if (player === 'me') {
      toggleMic();
      setMutedPlayers((prev) => ({ ...prev, me: !prev.me }));
      return;
    }
    setMutedPlayers((prev) => {
      const nextMuted = !prev[player];
      const slots = battleSlotsRef.current;
      const ids = battleStreamIdsRef.current;
      let targetUserId = '';
      if (player === 'opponent') {
        targetUserId = slots[0]?.userId || ids?.opponentUserId || ids?.hostUserId || '';
      } else if (player === 'player3') {
        targetUserId = slots[1]?.userId || ids?.player3UserId || '';
      } else if (player === 'player4') {
        targetUserId = slots[2]?.userId || ids?.player4UserId || '';
      }
      const vol = nextMuted ? 0 : 1;
      if (targetUserId) {
        hostLifecycleRef.current.liveKit?.setRemoteAudioVolume(targetUserId, vol);
      }
      if (player === 'opponent' && opponentRemoteAudioRef.current) {
        opponentRemoteAudioRef.current.muted = nextMuted;
        opponentRemoteAudioRef.current.volume = nextMuted ? 0 : 1;
      }
      return { ...prev, [player]: nextMuted };
    });
  };
  const togglePlayerCamera = (player: string) => {
    setCameraOffPlayers(prev => ({ ...prev, [player]: !prev[player] }));
  };

  useEffect(() => {
    const map: Record<string, React.RefObject<HTMLVideoElement | null>> = {
      opponent: opponentVideoRef,
      player3: player3VideoRef,
      player4: player4VideoRef,
    };
    for (const ref of Object.values(map)) {
      // Keep tile <video> muted always — Android shows a white play icon if unmuted.
      // Live audio rides on LiveKit audio tracks / hidden <audio>, not these elements.
      if (ref.current) ref.current.muted = true;
    }
  }, [mutedPlayers]);

  const filledSlots = battleSlots.filter(s => s.status !== 'empty');
  const allFilledAccepted = filledSlots.length > 0 && filledSlots.every(s => s.status === 'accepted');
  const _anySlotFilled = filledSlots.length > 0;
  const _allSlotsAccepted = allFilledAccepted;

  // ═══════════════════════════════════════════════════════════════
  // MULTI-HOST (8 co-host slots + 1 host = 8+1) — Normal Live only, NOT battle
  // ═══════════════════════════════════════════════════════════════
  type CoHost = {
    id: string;
    userId: string;
    name: string;
    avatar: string;
    status: 'invited' | 'accepted' | 'live' | 'pending_accept';
    isMuted: boolean;
    _notifId?: string;
    _streamKey?: string;
  };
  const [coHosts, setCoHosts] = useState<CoHost[]>([]);
  const [hostSearchQuery, _setHostSearchQuery] = useState('');
  /** Co-host userId shown on the left big screen (null = host). */
  const [featuredUserId, setFeaturedUserId] = useState<string | null>(null);
  const featuredBigVideoRef = useRef<HTMLVideoElement | null>(null);
  const hostSmallVideoRef = useRef<HTMLVideoElement | null>(null);
  const coHostTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const coHostsRef = useRef<CoHost[]>([]);
  const isBroadcastRef = useRef(false);
  const selfUserIdRef = useRef<string | null>(null);
  const featuredUserIdRef = useRef<string | null>(null);
  const MAX_CO_HOSTS = 8;

  // Keep refs in sync for use inside WebSocket handlers (avoid stale closure)
  useEffect(() => {
    coHostsRef.current = coHosts;
    isBroadcastRef.current = isBroadcast;
    selfUserIdRef.current = user?.id ?? null;
    featuredUserIdRef.current = featuredUserId;
  }, [coHosts, isBroadcast, user?.id, featuredUserId]);

  // Broadcast co-host layout to room so spectators see same layout (single source of truth; no duplicate userIds)
  useEffect(() => {
    if (!isBroadcast || !effectiveStreamId || !user?.id) return;
    const list = coHosts.map((h) => ({ id: h.id, userId: h.userId, name: h.name, avatar: h.avatar, status: h.status }));
    const payload = {
      roomId: effectiveStreamId,
      coHosts: list,
      hostUserId: user.id,
      featuredUserId: featuredUserId || null,
    };
    cohostLayoutSync(payload);
  }, [isBroadcast, effectiveStreamId, user?.id, coHosts, featuredUserId]);

  // Drop featured big-screen target if that co-host leaves.
  useEffect(() => {
    if (!featuredUserId) return;
    const stillLive = coHosts.some(
      (h) =>
        sameUserId(h.userId, featuredUserId) &&
        (h.status === 'live' || h.status === 'accepted'),
    );
    if (!stillLive) setFeaturedUserId(null);
  }, [coHosts, featuredUserId]);

  const inviteCoHost = async (creator: { id: string; streamKey?: string; name: string; avatar?: string }) => {
    if (!isBroadcast || !isMyStreamLive) {
      return;
    }
    if (isSelfUser(creator.id, user?.id, effectiveStreamId)) {
      return;
    }
    if (creator.streamKey && isSelfUser(creator.streamKey, user?.id, effectiveStreamId)) {
      return;
    }
    if (isBattleMode) {
      return;
    }
    if (coHosts.length >= MAX_CO_HOSTS) return;
    if (coHosts.some(h => sameUserId(h.userId, creator.id))) return;

    const newHost: CoHost = {
      id: `host-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: creator.id,
      name: creator.name,
      avatar: creator.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.name)}&background=121212&color=FFFFFF`,
      status: 'invited',
      isMuted: false,
    };
    setCoHosts(prev => {
      if (prev.some(h => sameUserId(h.userId, creator.id))) return prev;
      return [...prev, newHost];
    });

    if (!user?.id) return;
    if (!websocket.isConnected()) {
      showToast('Not connected — try Invite again');
      return;
    }
    cohostInviteSend({
      targetUserId: creator.id,
      targetStreamKey: creator.streamKey || creator.id,
      hostName: myCreatorName,
      hostAvatar: myAvatar,
      streamKey: effectiveStreamId,
    });
    showToast(`Invite sent to @${creator.name}`);
  };

  // ─── INCOMING CO-HOST INVITE (from another creator) ───
  type PendingCohostInvite = { hostName: string; hostAvatar: string; streamKey: string; hostUserId: string };
  const [pendingCohostInvite, setPendingCohostInvite] = useState<PendingCohostInvite | null>(null);

  useEffect(() => {
    if (!pendingCohostInvite) return;
    const inv = pendingCohostInvite;
    setCreators(prev => {
      if (prev.some(c => c.id === inv.hostUserId)) return prev;
      return [...prev, { id: inv.hostUserId, streamKey: inv.streamKey || inv.hostUserId, name: inv.hostName, username: inv.hostName, followers: '', avatar: inv.hostAvatar, isLive: true }];
    });
  }, [pendingCohostInvite]);

  const declineCohostInvite = useCallback(() => {
    setPendingCohostInvite(null);
    closeAllBottomPanels();
  }, [closeAllBottomPanels]);

  const acceptCohostInvite = useCallback(async () => {
    if (!pendingCohostInvite || !user?.id) return;
    // Never accept a co-host invite while battling — it would pull this
    // creator out of the battle onto the spectator page.
    if (isBattleMode) {
      setPendingCohostInvite(null);
      closeAllBottomPanels();
      return;
    }
    const inv = pendingCohostInvite;
    setPendingCohostInvite(null);
    closeAllBottomPanels();
    const myName = user?.username || user?.name || 'Creator';
    cohostInviteAccept({
      hostUserId: inv.hostUserId,
      cohostName: myName,
      cohostAvatar: user?.avatar || '',
      streamKey: user?.id || effectiveStreamId,
    });
    if (inv.streamKey) {
      navigate(`/watch/${inv.streamKey}?cohost=1`, { state: { fromCohostInvite: true } });
    }
  }, [pendingCohostInvite, user?.id, user?.username, user?.name, user?.avatar, effectiveStreamId, navigate, closeAllBottomPanels]);

  // ─── JOIN REQUEST: creator receives when someone asked to join (from viewer) ───
  type PendingJoinRequest = { requesterName: string; requesterAvatar: string; requesterId: string; type: 'cohost' | 'battle' };
  const [pendingJoinRequest, setPendingJoinRequest] = useState<PendingJoinRequest | null>(null);

  const acceptJoinRequest = useCallback(async () => {
    if (!pendingJoinRequest || !user?.id) return;
    const req = pendingJoinRequest;
    if (isSelfUser(req.requesterId, user.id, effectiveStreamId)) {
      setPendingJoinRequest(null);
      closeAllBottomPanels();
      return;
    }
    setPendingJoinRequest(null);
    closeAllBottomPanels();
    const myName = user.username || user.name || 'Creator';
    cohostRequestAccept({
      requesterUserId: req.requesterId,
      hostName: myName,
      hostAvatar: user.avatar || '',
      streamKey: effectiveStreamId,
    });
    setCoHosts(prev => {
      if (prev.some(h => h.userId === req.requesterId)) return prev;
      return [...prev, {
        id: `host-${Date.now()}`,
        userId: req.requesterId,
        name: req.requesterName,
        avatar: req.requesterAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(req.requesterName)}&background=121212&color=FFFFFF`,
        status: 'live',
        isMuted: false,
      }];
    });
  }, [pendingJoinRequest, user?.id, user?.username, user?.name, user?.avatar, effectiveStreamId, closeAllBottomPanels]);

  const declineJoinRequest = useCallback(async () => {
    if (!pendingJoinRequest) return;
    const requesterId = pendingJoinRequest.requesterId;
    setPendingJoinRequest(null);
    closeAllBottomPanels();
    if (requesterId) cohostRequestDecline({ requesterUserId: requesterId });
  }, [pendingJoinRequest, closeAllBottomPanels]);

  const removeCoHost = (hostId: string) => {
    const host = coHosts.find((h) => h.id === hostId);
    if (!host) return;
    setCoHosts((prev) => prev.filter((h) => h.id !== hostId));
    if (featuredUserId && sameUserId(featuredUserId, host.userId)) {
      setFeaturedUserId(null);
    }
    if (selectedCohostGiftUserId && sameUserId(selectedCohostGiftUserId, host.userId)) {
      setSelectedCohostGiftUserId(null);
    }
    setMessages((prev) =>
      appendCapped(
        prev,
        {
          id: Date.now().toString(),
          username: 'System',
          text: `${host.name} removed from co-host`,
          isSystem: true,
        },
        LIVE_CHAT_MESSAGE_CAP,
      ),
    );
  };

  /** Restore host camera on the main live preview (after featured / co-host grid ends). */
  const restoreHostCameraPreview = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const stream =
      cameraStreamRef.current ||
      (() => {
        const cached = getCachedCameraStream();
        if (cached?.getVideoTracks()?.some((t) => t.readyState === 'live')) {
          cameraStreamRef.current = cached;
          return cached;
        }
        return null;
      })();
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
    }
    prepareLiveVideoEl(el);
    el.style.transform = 'scaleX(-1)';
    void el.play().catch(() => {});
  }, []);

  /** Host big-table X: clear every co-host seat and return to solo live layout. */
  const endCoHostMode = useCallback(() => {
    if (coHosts.length === 0 && !featuredUserId) return;
    setCoHosts([]);
    setFeaturedUserId(null);
    setSelectedCohostGiftUserId(null);
    // Next paint: grid unmounts — put host camera back on the full live preview.
    window.requestAnimationFrame(() => restoreHostCameraPreview());
    setMessages((prev) =>
      appendCapped(
        prev,
        {
          id: Date.now().toString(),
          username: 'System',
          text: 'Co-host ended',
          isSystem: true,
        },
        LIVE_CHAT_MESSAGE_CAP,
      ),
    );
  }, [coHosts.length, featuredUserId, restoreHostCameraPreview]);

  const toggleCoHostMute = (hostId: string) => {
    setCoHosts(prev => prev.map(h => {
      if (h.id !== hostId) return h;
      const nextMuted = !h.isMuted;
      // Audio is on LiveKit tracks (not the tile <video>). Mute volume so Android
      // can keep the video element muted for autoplay.
      hostLifecycleRef.current.liveKit?.setRemoteAudioVolume(h.userId, nextMuted ? 0 : 1);
      return { ...h, isMuted: nextMuted };
    }));
  };
  const [coHostCameraOff, setCoHostCameraOff] = useState<Record<string, boolean>>({});
  const toggleCoHostCamera = (hostId: string) => {
    setCoHostCameraOff(prev => ({ ...prev, [hostId]: !prev[hostId] }));
  };
  // Identities currently speaking (from LiveKit ActiveSpeakersChanged) — drives the box pulse.
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  // Co-host identities whose own camera is off (video track muted) — show their avatar.
  const [remoteCamOff, setRemoteCamOff] = useState<Set<string>>(new Set());

  // Host LiveKit track attach — consumed by useHostLiveSession (no second Room path).
  liveKitHandlersRef.current = {
    onTrackSubscribed: ({ track, participant, publication }) => {
      if (publication?.kind === 'video' && publication.isMuted && participant?.identity) {
        setRemoteCamOff((prev) => {
          const n = new Set(prev);
          n.add(participant.identity);
          return n;
        });
      }
      const identity = participant.identity;
      if (sameUserId(identity, user?.id)) return;
      if (track.kind === 'audio') {
        attachRemoteAudio(track, roomRemoteAudioRef.current);
        return;
      }
      if (track.kind !== 'video') return;
      const slots = battleSlotsRef.current;
      const markAttached = (el: HTMLVideoElement | null) => {
        if (!el) return false;
        track.attach(el);
        prepareLiveVideoEl(el);
        return true;
      };
      if (slots[0]?.status === 'accepted' && slots[0]?.userId && sameUserId(identity, slots[0].userId)) {
        if (markAttached(opponentVideoRef.current)) {
          setHasOpponentStream(true);
          return;
        }
      }
      if (slots[1]?.status === 'accepted' && slots[1]?.userId && sameUserId(identity, slots[1].userId)) {
        if (markAttached(player3VideoRef.current)) return;
      }
      if (slots[2]?.status === 'accepted' && slots[2]?.userId && sameUserId(identity, slots[2].userId)) {
        if (markAttached(player4VideoRef.current)) return;
      }
      if (isBattleModeRef.current && slots[0]?.status === 'accepted' && !hasOpponentStreamRef.current) {
        if (markAttached(opponentVideoRef.current)) {
          setHasOpponentStream(true);
          return;
        }
      }
      if (featuredUserIdRef.current && sameUserId(identity, featuredUserIdRef.current) && featuredBigVideoRef.current) {
        track.attach(featuredBigVideoRef.current);
        prepareLiveVideoEl(featuredBigVideoRef.current);
      }
      let coHostEl = coHostVideoRefs.current.get(identity) || null;
      if (!coHostEl) {
        for (const [uid, el] of coHostVideoRefs.current) {
          if (sameUserId(uid, identity)) {
            coHostEl = el;
            break;
          }
        }
      }
      if (coHostEl) {
        track.attach(coHostEl);
        prepareLiveVideoEl(coHostEl);
      }
    },
    onTrackPublished: (publication, participant) => {
      if (publication.track && publication.isSubscribed) {
        liveKitHandlersRef.current.onTrackSubscribed?.({
          track: publication.track,
          participant,
          publication,
        });
      }
    },
    onParticipantConnected: (participant) => {
      for (const [, pub] of participant.videoTrackPublications) {
        if (pub.track && pub.isSubscribed) {
          liveKitHandlersRef.current.onTrackSubscribed?.({
            track: pub.track,
            participant,
            publication: pub,
          });
        }
      }
      for (const [, pub] of participant.audioTrackPublications) {
        if (pub.track && pub.isSubscribed) {
          attachRemoteAudio(pub.track, roomRemoteAudioRef.current);
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
      setRemoteCamOff((prev) => {
        const n = new Set(prev);
        n.add(id);
        return n;
      });
    },
    onTrackUnmuted: (pub, participant) => {
      if (pub.kind !== 'video') return;
      const id = participant?.identity;
      if (!id) return;
      setRemoteCamOff((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    },
  };

  const liveCoHosts = coHosts.filter(h => h.status === 'live' || h.status === 'accepted');
  const featuredHost = featuredUserId
    ? liveCoHosts.find((h) => sameUserId(h.userId, featuredUserId)) || null
    : null;

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

  const filteredHostCreators = creators.filter(c =>
    c.name.toLowerCase().includes(hostSearchQuery.trim().toLowerCase()) &&
    !coHosts.some(h => h.userId === c.id || h.name === c.name)
  );
  const _liveHostCreators = filteredHostCreators.filter(c => c.isLive);
  const _offlineHostCreators = filteredHostCreators.filter(c => !c.isLive);

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      coHostTimersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // Battle Mode State
  const [battleState, setBattleState] = useState<BattleState>('LIVE_SOLO');
  const [isBattleMode, setIsBattleMode] = useState(false);
  const isBattleModeRef = useRef(false);
  const battleStateRef = useRef<BattleState>('LIVE_SOLO');
  const battleEndedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { isBattleModeRef.current = isBattleMode; }, [isBattleMode]);
  useEffect(() => { battleStateRef.current = battleState; }, [battleState]);
  // If joining as battle participant, enter battle mode and start camera (server drives timer/countdown)
  const battleLkRoomRef = useRef<Room | null>(null);
  const battleJoinerConnectIdRef = useRef(0);
  useEffect(() => {
    if (!isBattleJoiner || !user?.id) return;
    const connectId = ++battleJoinerConnectIdRef.current;
    setIsBattleMode(true);
    setBattleState('INVITING');
    setMyScore(0);
    setOpponentScore(0);

    // Seed pane 2 with the inviting host immediately (from accept navigation
    // state) so the joiner sees the same split battle layout as the host —
    // never the host-side "Add creator" placeholders.
    // battleHost state also marks a REAL accepted invite (battle_accept_ack
    // received) — that creator is never demoted to the spectator page. The
    // sessionStorage flag is a reload-proof fallback for the same signal.
    let acceptedFlag = false;
    try { acceptedFlag = sessionStorage.getItem(`battleAccept:${effectiveStreamId}`) === '1'; } catch { /* ignore */ }
    const cameFromAcceptedInvite = !!(location.state as { battleHost?: unknown } | null)?.battleHost || acceptedFlag;
    const seededHost = (location.state as { battleHost?: { userId?: string; name?: string; avatar?: string } } | null)?.battleHost;
    if (seededHost && (seededHost.userId || seededHost.name)) {
      setBattleSlots(prev => {
        if (prev[0].status !== 'empty') return prev;
        const next = [...prev];
        next[0] = {
          userId: seededHost.userId || effectiveStreamId,
          name: seededHost.name || 'Creator',
          status: 'accepted',
          avatar: seededHost.avatar || '',
        };
        return next;
      });
    }

    let cancelled = false;
    const battleLifecycle = battleLifecycleRef.current;
    (async () => {
      const wsToken = useAuthStore.getState().session?.access_token ?? '';
      if (wsToken) {
        // Battle joiners are creators — keep reconnecting through mobile blips
        // instead of synthesizing stream_ended after a short attempt budget.
        websocket.connect(effectiveStreamId, wsToken, { persistent: true });
        for (let i = 0; i < 24 && !cancelled; i += 1) {
          if (websocket.isConnected()) break;
          await new Promise((r) => window.setTimeout(r, 250));
        }
      }
      // Establish the server-authorized creator role before opening camera/mic.
      // A plain spectator who reaches ?battle=1 has no accepted invite grant
      // and is returned to the subscribe-only spectator page. Only an explicit
      // authorization refusal (403) demotes — transient network errors retry.
      let tokenCreds: { url: string; token: string } | null = null;
      let deniedCount = 0;
      for (let attempt = 0; attempt < 12 && !cancelled; attempt += 1) {
        const tokenResult = await apiLiveToken(effectiveStreamId, true);
        if (!tokenResult.error && tokenResult.creds?.token) {
          tokenCreds = tokenResult.creds;
          break;
        }
        const msg = tokenResult.error || '';
        if (msg.includes('403') || msg.toLowerCase().includes('not authorized')) {
          deniedCount += 1;
          // Three consecutive server refusals = genuinely no battle grant.
          if (deniedCount >= 3) break;
        } else {
          deniedCount = 0;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      if (cancelled) return;
      if (!tokenCreds?.token) {
        if (cameFromAcceptedInvite) {
          // This creator accepted a real battle invite (server ack'd the
          // grant). NEVER dump them on the spectator page — surface the
          // failure and let them retry instead of silently demoting.
          showToast('Battle connection failed — pull to retry or rejoin');
          return;
        }
        // No accepted invite (deep link / stale URL): spectators watch only.
        navigate(`/watch/${effectiveStreamId}`, { replace: true });
        return;
      }

      const hostLabel = effectiveStreamId.slice(0, 8).toUpperCase();
      let hName = `Host ${hostLabel}`;
      let hAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(hostLabel)}&background=121212&color=FFFFFF`;
      try {
        const { body: profileBody } = await apiFetchProfileById(effectiveStreamId);
        if (profileBody) {
          const profile = (profileBody?.profile || profileBody?.data || {}) as Record<string, unknown>;
          const resolvedName =
            (typeof profile.displayName === 'string' && profile.displayName.trim()) ||
            (typeof profile.display_name === 'string' && profile.display_name.trim()) ||
            (typeof profile.username === 'string' && profile.username.trim()) ||
            '';
          const resolvedAvatar =
            (typeof profile.avatarUrl === 'string' && profile.avatarUrl.trim()) ||
            (typeof profile.avatar_url === 'string' && profile.avatar_url.trim()) ||
            '';
          if (resolvedName) hName = resolvedName;
          if (resolvedAvatar) hAvatar = resolvedAvatar;
        }
      } catch {
        // Keep fallback host label/avatar.
      }

      if (cancelled) return;
      setBattleSlots(prev => {
        const next = [...prev];
        // Keep a real seeded avatar over the generated fallback.
        const avatar = prev[0].avatar && hAvatar.startsWith('https://ui-avatars.com/') ? prev[0].avatar : hAvatar;
        next[0] = { userId: effectiveStreamId, name: hName, status: 'accepted', avatar };
        return next;
      });

      // Get camera + mic
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        cameraStreamRef.current = stream;
        setCameraStream(stream);
        setBattleParticipantStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          prepareLiveVideoEl(videoRef.current);
        }
      } catch {
        showToast('Camera access denied — cannot join battle');
        return;
      }

      // Connect to host's LiveKit room and publish our tracks
      try {
        if (cancelled) return;
        const lkUrl = tokenCreds.url.trim() || getLiveKitUrl();
        const lkToken = tokenCreds.token;
        if (!lkUrl || !lkToken || cancelled) return;

        const { error, session } = await battleLifecycle.connectLiveKitOnly(
          { url: lkUrl, token: lkToken },
          {
            onTrackSubscribed: ({ track }) => {
              if (cancelled) return;
              if (track.kind === 'audio') {
                attachRemoteAudio(track, roomRemoteAudioRef.current);
                return;
              }
              if (track.kind !== 'video') return;
              const el = opponentVideoRef.current;
              if (el) {
                track.attach(el);
                void el.play().catch(() => {});
                setHasOpponentStream(true);
              }
            },
          },
        );
        if (cancelled) {
          battleLifecycle.liveKit?.disconnect();
          return;
        }
        if (error || !session) {
          showToast(error || 'Could not connect video to battle');
          return;
        }
        const room = session.raw;
        battleLkRoomRef.current = room;
        if (!room) return;

        for (const [, participant] of room.remoteParticipants) {
          for (const [, pub] of participant.videoTrackPublications) {
            if (pub.track && pub.isSubscribed) {
              const el = opponentVideoRef.current;
              if (el) {
                pub.track.attach(el);
                void el.play().catch(() => {});
                setHasOpponentStream(true);
              }
            }
          }
          for (const [, pub] of participant.audioTrackPublications) {
            if (pub.track && pub.isSubscribed) attachRemoteAudio(pub.track, roomRemoteAudioRef.current);
          }
        }

        await battleLifecycle.publishFromStream(stream);

      } catch (e) {
        console.error('[Battle] LiveKit publish failed:', e);
        showToast('Could not connect video to battle');
      }
    })();
    return () => {
      cancelled = true;
      // Intentional: skip teardown if a newer battle join replaced this connectId.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- compare live ref to this effect's connectId
      if (battleJoinerConnectIdRef.current !== connectId) return;
      battleLifecycle.liveKit?.disconnect();
      battleLkRoomRef.current = null;
      if (battlePeerRef.current) { battlePeerRef.current.close(); battlePeerRef.current = null; }
      // Always stop local getUserMedia — disconnect alone leaves camera/mic hot.
      const local = cameraStreamRef.current;
      if (local) {
        local.getTracks().forEach((t) => {
          try { t.stop(); } catch { /* ignore */ }
        });
        cameraStreamRef.current = null;
      }
      setCameraStream(null);
      setBattleParticipantStream(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBattleJoiner, user?.id, effectiveStreamId]);

  // Battle state driven by WebSocket backend.
  useEffect(() => {
    if (!effectiveStreamId || (!isBroadcast && !isBattleJoiner)) return;
    return () => {
      if (battlePeerRef.current) { battlePeerRef.current.close(); battlePeerRef.current = null; }
    };
  }, [effectiveStreamId, isBroadcast, isBattleJoiner]);
  const [liveFilterCss, setLiveFilterCss] = useState('none');
  const [activeLiveFaceEffect, setActiveLiveFaceEffect] = useState<{ type: string; color: string } | null>(null);
  const [battleTauntBursts, setBattleTauntBursts] = useState<TauntBurst[]>([]);
  const prevMvpHostIdRef = useRef<string | null>(null);
  const prevMvpOpponentIdRef = useRef<string | null>(null);
  const pushBattleTaunt = useCallback((burst: TauntBurst) => {
    setBattleTauntBursts((prev) => [...prev.slice(-10), burst]);
  }, []);
  const [showLiveEffectsPanel, setShowLiveEffectsPanel] = useState(false);
  const [battleTime, setBattleTime] = useState(300); // 5 minutes
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [player3Score, setPlayer3Score] = useState(0);
  const [player4Score, setPlayer4Score] = useState(0);
  const [battleWinner, setBattleWinner] = useState<'me' | 'opponent' | 'player3' | 'player4' | 'draw' | null>(null);
  /** Server team result (red=host / blue=opponent) for pane WIN/LOSS + streak labels. */
  const [battleTeamWinner, setBattleTeamWinner] = useState<'host' | 'opponent' | 'draw' | null>(null);
  /** Consecutive wins per team (red=host, blue=opponent). Win +1, loss → 0, draw keeps. */
  const [battleWinStreak, setBattleWinStreak] = useState<{ host: number; opponent: number }>({ host: 0, opponent: 0 });
  const battleWinStreakRef = useRef(battleWinStreak);
  useEffect(() => {
    battleWinStreakRef.current = battleWinStreak;
  }, [battleWinStreak]);
  const battleStreakCountedForEndRef = useRef(false);
  const battleScoresRef = useRef({ myScore: 0, opponentScore: 0, player3Score: 0, player4Score: 0 });
  useEffect(() => {
    battleScoresRef.current = { myScore, opponentScore, player3Score, player4Score };
  }, [myScore, opponentScore, player3Score, player4Score]);
  const localBattleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [giftTarget, setGiftTarget] = useState<'me' | 'opponent' | 'player3' | 'player4'>('me');
  const lastScreenTapRef = useRef<number>(0);
  /** Spectator tap score budget (reference: one +5 award per battle, then exhausted — not 5 taps/sec). */
  const battleTapScoreRemainingRef = useRef(5);
  /** Last `battle_state_sync` status — reset tap budget when transitioning into ACTIVE. */
  const prevBattleSyncStatusRef = useRef<string | null>(null);
  /** IDs from last battle_state_sync — map /watch/:streamId to host/opponent/P3/P4 for spectator +5 vote. */
  const battleStreamIdsRef = useRef<{
    hostRoomId: string;
    hostUserId: string;
    opponentRoomId: string;
    opponentUserId: string;
    player3UserId: string;
    player4UserId: string;
  } | null>(null);
  /** Full battle overlay (spectators) — hit area when voting for the watched creator by stream id. */
  const battleSpectatorOverlayRef = useRef<HTMLDivElement | null>(null);
  /** Video battle grid — position fallback when watched stream id does not match any participant. */
  const battleVoteGridRef = useRef<HTMLDivElement | null>(null);
  const _lastBattleTapTimeRef = useRef<number>(0);
  const spectatorTapPointsRef = useRef<number>(0);
  const [, setSpectatorTapsUsed] = useState<number>(0);
  const battleFreeTapUsedRef = useRef<boolean>(false);
  const battleTripleTapRef = useRef<{ target: 'me' | 'opponent' | null; lastTapAt: number; count: number }>({
    target: null,
    lastTapAt: 0,
    count: 0,
  });
  const [battleCountdown, setBattleCountdown] = useState<number | null>(null);

  const resolveSpectatorVoteTargetFromWatchedStream = useCallback((): 'me' | 'opponent' | 'player3' | 'player4' | null => {
    const ids = battleStreamIdsRef.current;
    if (!ids) return null;
    const sid = effectiveStreamId;
    if (sid === ids.hostUserId || sid === ids.hostRoomId) return 'me';
    if (sid === ids.opponentUserId || sid === ids.opponentRoomId) return 'opponent';
    if (sid === ids.player3UserId) return 'player3';
    if (sid === ids.player4UserId) return 'player4';
    return null;
  }, [effectiveStreamId]);

  const _battleKeyboardLikeArmedRef = useRef(true);
  const [liveLikes, setLiveLikes] = useState(0);
  const [_battleReadiness, _setBattleReadiness] = useState(0);
  const [hasOpponentStream, setHasOpponentStream] = useState(false);
  useEffect(() => { hasOpponentStreamRef.current = hasOpponentStream; }, [hasOpponentStream]);
  const [opponentStreamKey, setOpponentStreamKey] = useState<string | null>(null);

  const followCreatorLive = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!user?.id) {
        showToast('Log in to follow');
        navigate('/login', { state: { from: location.pathname } });
        return;
      }
      // Battle live: follow the opponent. Creator/viewer live: follow stream host.
      const battleOpp = isBattleMode
        ? String(opponentStreamKey || battleSlots[0]?.userId || '').trim()
        : '';
      const targetId = (
        battleOpp && battleOpp !== user.id ? battleOpp : String(effectiveStreamId || '').trim()
      );
      if (!targetId || targetId === 'broadcast') {
        showToast('Creator unavailable. Try again.');
        return;
      }
      if (targetId === user.id) {
        showToast("That's your live");
        return;
      }
      if (isFollowing) return;
      setIsFollowing(true);
      const prevFollowing = useVideoStore.getState().followingUsers;
      if (!prevFollowing.includes(targetId)) {
        useVideoStore.setState({ followingUsers: [...prevFollowing, targetId] });
      }
      try {
        const { ok, error } = await apiToggleFollow(targetId, false);
        if (!ok || error) throw new Error(error || 'follow failed');
      } catch {
        setIsFollowing(false);
        useVideoStore.setState({
          followingUsers: prevFollowing.filter((id) => id !== targetId),
        });
        showToast('Could not follow. Try again.');
      }
    },
    [user?.id, effectiveStreamId, isFollowing, navigate, location.pathname, isBattleMode, opponentStreamKey, battleSlots],
  );

  useEffect(() => {
    if (!user?.id) return;
    const battleOpp = isBattleMode
      ? String(opponentStreamKey || battleSlots[0]?.userId || '').trim()
      : '';
    const tid = (
      battleOpp && battleOpp !== user.id ? battleOpp : String(effectiveStreamId || '').trim()
    );
    // Skip self / unavailable — same rule as spectator Follow slot
    if (!tid || tid === 'broadcast' || tid === user.id) {
      setIsFollowing(false);
      return;
    }
    // Non-battle broadcaster has no other creator to follow in this slot
    if (isBroadcast && !isBattleMode) {
      setIsFollowing(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { following: ids, error } = await apiFetchFollowingIds(user.id);
        if (error || cancelled) return;
        if (!cancelled) setIsFollowing(ids.some((id) => String(id) === tid));
      } catch {
        if (!cancelled) setIsFollowing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isBroadcast, effectiveStreamId, isBattleMode, opponentStreamKey, battleSlots]);

  /** Start / rematch with EVERY accepted creator seat (opponent + P3 + P4). */
  const startBattleWithAcceptedCreators = useCallback(() => {
    const accepted = battleSlots.filter((s) => s.status === 'accepted' && s.userId);
    if (accepted.length === 0) {
      showToast('Invite a creator first');
      return;
    }
    const opp = accepted[0];
    const p3 = accepted[1];
    const p4 = accepted[2];
    battleCreate({
      hostName: myCreatorName,
      opponentUserId: opp?.userId ?? '',
      opponentName: opp?.name ?? '',
      opponentRoomId: opponentStreamKey || opp?.userId || '',
      player3UserId: p3?.userId ?? '',
      player3Name: p3?.name ?? '',
      player4UserId: p4?.userId ?? '',
      player4Name: p4?.name ?? '',
    });
  }, [battleSlots, myCreatorName, opponentStreamKey]);

  const battleRoleRef = useRef<'host' | 'opponent' | null>(null);
  const [_battleUiRole, setBattleUiRole] = useState<'host' | 'opponent'>(() =>
    isBattleJoiner ? 'opponent' : 'host',
  );
  /** Authoritative host/opponent/P3/P4 totals from server (never role-swapped) — fixes bar showing 0 for the other team. */
  const battleServerTotalsRef = useRef({ h: 0, o: 0, p3: 0, p4: 0 });
  const _lastBattleScoreUpdateTraceSigRef = useRef('');
  const [battleServerTotals, setBattleServerTotals] = useState({ h: 0, o: 0, p3: 0, p4: 0 });
  const [battleMistSide, setBattleMistSide] = useState<BattleMistSide>(null);
  // Point Multiplier Booster (glove) — transient glove-send animations (fly to the
  // weekly-ranking corner when a spectator sends one) and transient "caught" popups.
  const [boosterActivations, setBoosterActivations] = useState<{ id: string; userId: string; multiplier: number; username: string; expiresAt: number }[]>([]);
  const [boosterCatches, setBoosterCatches] = useState<{ id: string; multiplier: number; finalPoints: number; username: string }[]>([]);
  const [battleHideScores, setBattleHideScores] = useState(false);
  /** Tap PK score bar to hide it so battle video + chat stay visible. */
  const [battleScoreBarHidden, setBattleScoreBarHidden] = useState(false);
  // Mist Fog booster — server-driven window that hides the battle score for
  // everyone EXCEPT the supported creator. The host keeps seeing the score when
  // their own side is boosted; the opposing side's mist fogs it for them.
  const [mistFog, setMistFog] = useState<{ supportedUserId: string; supportedSide: 'host' | 'opponent'; expiresAt: number } | null>(null);
  const [battleGloves, setBattleGloves] = useState<GloveBurst[]>([]);
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
    setBattleHideScores(isBattleMode && battleTime > 0 && battleTime <= 10 && !battleWinner);
  }, [isBattleMode, battleTime, battleWinner]);

  // Mist Fog window self-expires on the client from the server expires_at.
  useEffect(() => {
    if (!mistFog) return;
    const ms = mistFog.expiresAt - Date.now();
    if (ms <= 0) { setMistFog(null); return; }
    const t = setTimeout(() => setMistFog(null), ms);
    return () => clearTimeout(t);
  }, [mistFog]);

  // Fog covers gift/battle points for everyone except the supported creator.
  // Opponent creator + spectators lose the digits; only that creator keeps them.
  const mistHidesScores = !!mistFog && mistFog.expiresAt > Date.now()
    && String(mistFog.supportedUserId) !== String(user?.id || '');

  useEffect(() => {
    return () => {
      if (battleMistTimerRef.current != null) window.clearTimeout(battleMistTimerRef.current);
    };
  }, []);

  const opponentLkRoomRef = useRef<Room | null>(null);
  const [_iAmReady, setIAmReady] = useState(false);
  const [_hostIsReady, setHostIsReady] = useState(false);
  const [_opponentIsReady, setOpponentIsReady] = useState(false);

  // Peer connections for battle & co-host
  const isBattleParticipant = isBattleJoiner;
  const [battleParticipantStream, setBattleParticipantStream] = useState<MediaStream | null>(null);


  useEffect(() => {
    if (!isBattleParticipant || battleParticipantStream) return;
    if (cameraStreamRef.current) {
      setBattleParticipantStream(cameraStreamRef.current);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        cameraStreamRef.current = stream;
        setCameraStream(stream);
        setBattleParticipantStream(stream);
      } catch {
        showToast('Camera access denied — cannot join battle');
      }
    })();
    return () => { cancelled = true; };
  }, [isBattleParticipant, battleParticipantStream]);

  useEffect(() => {
    if (!isBattleParticipant || !battleParticipantStream || !videoRef.current) return;
    videoRef.current.srcObject = battleParticipantStream;
    prepareLiveVideoEl(videoRef.current);
  }, [isBattleParticipant, battleParticipantStream]);

  const _isRegularViewer = !isBroadcast && !isBattleParticipant;

  const opponentLkConnectIdRef = useRef(0);
  // Connect to opponent's LiveKit room to receive their video (creators may still
  // be publishing there). Host-room attach below covers when they join this room.
  useEffect(() => {
    if (!isBattleMode || !opponentStreamKey || !isBroadcast) return;
    if (opponentStreamKey === effectiveStreamId) return;
    // Battle opponents publish into the host room — never open a second LiveKit
    // connection to their old solo stream (that room is empty after accept).
    if (battleSlotsRef.current[0]?.status === 'accepted') return;
    const connectId = ++opponentLkConnectIdRef.current;
    let mounted = true;
    const opponentLifecycle = opponentLifecycleRef.current;

    (async () => {
      try {
        const tok = await apiLiveToken(opponentStreamKey, false);
        if (tok.error || !tok.creds || !mounted) return;
        const token = tok.creds.token;
        const url = tok.creds.url.trim() || getLiveKitUrl();
        if (!token || !url || !mounted) return;

        const { error, session } = await opponentLifecycle.connectLiveKitOnly(
          { url, token },
          {
            onTrackSubscribed: ({ track }) => {
              if (!mounted) return;
              if (track.kind === 'audio') {
                attachRemoteAudio(track, opponentRemoteAudioRef.current);
                return;
              }
              if (track.kind !== 'video') return;
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

        for (const [, participant] of room.remoteParticipants) {
          for (const [, pub] of participant.videoTrackPublications) {
            if (pub.track && pub.isSubscribed && opponentVideoRef.current) {
              pub.track.attach(opponentVideoRef.current);
              void opponentVideoRef.current.play().catch(() => {});
              setHasOpponentStream(true);
            }
          }
          for (const [, pub] of participant.audioTrackPublications) {
            if (pub.track && pub.isSubscribed) attachRemoteAudio(pub.track, opponentRemoteAudioRef.current);
          }
        }
      } catch (e) {
        console.error('[Battle] Failed to connect to opponent LiveKit room:', e);
      }
    })();

    return () => {
      mounted = false;
      // Intentional: skip teardown if a newer opponent connect replaced this id.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- compare live ref to this effect's connectId
      if (opponentLkConnectIdRef.current !== connectId) return;
      const raw = opponentLifecycle.rawRoom;
      opponentLifecycle.liveKit?.disconnect();
      if (opponentLkRoomRef.current === raw) opponentLkRoomRef.current = null;
      // Connection-bug fix only: do not clear hasOpponentStream here.
      // Opponent may already be attached from the host LiveKit room; clearing
      // on this cleanup left the pane stuck on "Connecting...".
    };
  }, [isBattleMode, opponentStreamKey, isBroadcast, effectiveStreamId, attachRemoteAudio]);

  // When featuring a co-host on the big screen: attach their remote track + host preview in the small tile.
  useEffect(() => {
    const room = liveKitRoomRef.current;
    if (!room || !isBroadcast) return;

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

    if (featuredUserId && hostSmallVideoRef.current) {
      for (const [, pub] of room.localParticipant.videoTrackPublications) {
        if (pub.track) {
          pub.track.attach(hostSmallVideoRef.current);
          prepareLiveVideoEl(hostSmallVideoRef.current);
          hostSmallVideoRef.current.style.transform = 'scaleX(-1)';
        }
      }
      // Fallback: local camera MediaStream if LiveKit local track not ready
      if (!hostSmallVideoRef.current.srcObject && cameraStreamRef.current) {
        hostSmallVideoRef.current.srcObject = cameraStreamRef.current;
        void hostSmallVideoRef.current.play().catch(() => {});
        hostSmallVideoRef.current.style.transform = 'scaleX(-1)';
      }
    }

    // Leaving featured big-screen: put host camera back on the main preview (stay live).
    if (!featuredUserId) {
      restoreHostCameraPreview();
    }
  }, [featuredUserId, isBroadcast, coHosts, restoreHostCameraPreview]);

  // Re-attach remote LiveKit tracks when battle/co-host video elements mount after subscribe
  useEffect(() => {
    const room = liveKitRoomRef.current;
    if (!room || !isBroadcast) return;

    const attachAll = () => {
      const slots = battleSlotsRef.current;

      for (const [, participant] of room.remoteParticipants) {
        const identity = participant.identity;
        if (!identity || sameUserId(identity, user?.id)) continue;

        for (const [, pub] of participant.videoTrackPublications) {
          if (!pub.track || !pub.isSubscribed) continue;
          if (featuredUserIdRef.current && sameUserId(identity, featuredUserIdRef.current) && featuredBigVideoRef.current) {
            pub.track.attach(featuredBigVideoRef.current);
            prepareLiveVideoEl(featuredBigVideoRef.current);
          }
          let coHostEl = coHostVideoRefs.current.get(identity) || null;
          if (!coHostEl) {
            for (const [uid, el] of coHostVideoRefs.current) {
              if (sameUserId(uid, identity)) {
                coHostEl = el;
                break;
              }
            }
          }
          if (coHostEl) {
            pub.track.attach(coHostEl);
            prepareLiveVideoEl(coHostEl);
            continue;
          }
          let battleEl: HTMLVideoElement | null = null;
          if (sameUserId(identity, slots[0]?.userId)) battleEl = opponentVideoRef.current;
          else if (sameUserId(identity, slots[1]?.userId)) battleEl = player3VideoRef.current;
          else if (sameUserId(identity, slots[2]?.userId)) battleEl = player4VideoRef.current;
          if (battleEl) {
            pub.track.attach(battleEl);
            void battleEl.play().catch(() => {});
            if (sameUserId(identity, slots[0]?.userId)) setHasOpponentStream(true);
            continue;
          }
          if (
            isBattleModeRef.current &&
            slots[0]?.status === 'accepted' &&
            !hasOpponentStreamRef.current &&
            opponentVideoRef.current
          ) {
            pub.track.attach(opponentVideoRef.current);
            void opponentVideoRef.current.play().catch(() => {});
            setHasOpponentStream(true);
          }
        }
        for (const [, pub] of participant.audioTrackPublications) {
          if (pub.track && pub.isSubscribed) {
            attachRemoteAudio(pub.track, roomRemoteAudioRef.current);
          }
        }
      }
    };

    attachAll();
    const waitingForOpponent =
      isBattleMode &&
      battleSlots.some((s) => s.status === 'accepted' && s.userId) &&
      !hasOpponentStream;
    const pollMs = waitingForOpponent ? 400 : 2000;
    const poll = window.setInterval(attachAll, pollMs);
    return () => window.clearInterval(poll);
  }, [isBroadcast, isBattleMode, coHosts, battleSlots, attachRemoteAudio, user?.id, hasOpponentStream]);

  // Re-attach opponent room video when battle pane mounts
  useEffect(() => {
    const room = opponentLkRoomRef.current;
    const el = opponentVideoRef.current;
    if (!room || !el || !isBattleMode) return;

    for (const [, participant] of room.remoteParticipants) {
      for (const [, pub] of participant.videoTrackPublications) {
        if (pub.track && pub.isSubscribed) {
          pub.track.attach(el);
          void el.play().catch(() => {});
          setHasOpponentStream(true);
        }
      }
    }
  }, [isBattleMode, opponentStreamKey, battleSlots]);

  // Speed Challenge State
  // SPEED CHALLENGE
  const SPEED_CHALLENGE_ENABLED = true;
  const [speedChallengeActive, setSpeedChallengeActive] = useState(false);
  const [speedChallengeTime, setSpeedChallengeTime] = useState(60);
  const [speedChallengeTaps, setSpeedChallengeTaps] = useState<Record<string, number>>({ me: 0, opponent: 0, player3: 0, player4: 0 });
  const speedChallengeTapsRef = useRef<Record<string, number>>({ me: 0, opponent: 0, player3: 0, player4: 0 });
  const [speedChallengeResult, setSpeedChallengeResult] = useState<string | null>(null);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const speedChallengeActiveRef = useRef(false);
  const speedMultiplierRef = useRef(1);
  const roseCountRef = useRef(0);
  const [roseCount, setRoseCount] = useState(0);
  /** Rapid battle screen taps — unlock Speed with roses / gift points. */
  const battleScreenTapCountRef = useRef(0);
  const [battleScreenTapCount, setBattleScreenTapCount] = useState(0);

  useEffect(() => { speedChallengeActiveRef.current = speedChallengeActive; }, [speedChallengeActive]);
  useEffect(() => { speedMultiplierRef.current = speedMultiplier; }, [speedMultiplier]);

  const _speedChallengeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reachedThresholdsRef = useRef<Set<number>>(new Set());
  const [lastGifts, setLastGifts] = useState<{ host: string | null; opponent: string | null; player3: string | null; player4: string | null }>({ host: null, opponent: null, player3: null, player4: null });
  /** Tap a co-host tile to gift them (null = gift goes to the stream host). */
  const [selectedCohostGiftUserId, setSelectedCohostGiftUserId] = useState<string | null>(null);
  /** Per co-host tile: gift totals + last gift icon (synced from gift_sent). */
  const [cohostGiftScores, setCohostGiftScores] = useState<Record<string, number>>({});
  const [cohostLastGifts, setCohostLastGifts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedCohostGiftUserId) return;
    const stillLive = coHosts.some(
      (h) =>
        sameUserId(h.userId, selectedCohostGiftUserId) &&
        (h.status === 'live' || h.status === 'accepted'),
    );
    if (!stillLive) setSelectedCohostGiftUserId(null);
  }, [coHosts, selectedCohostGiftUserId]);
  const [floatingHearts, setFloatingHearts] = useState<
    Array<{ id: string; x: number; y: number; dx: number; rot: number; size: number; color: string; username?: string; avatar?: string }>
  >([]);
  const [miniProfile, setMiniProfile] = useState<null | { id?: string; username: string; avatar: string; level: number | null; coins?: number; donated?: number; bio?: string; followers_count?: number; following_count?: number }>(null);
  /** Synced from GET /following when panel user id is known; used so Follow matches server (does not touch host top-bar isFollowing). */
  const [miniProfileFollowsThem, setMiniProfileFollowsThem] = useState<boolean | undefined>(undefined);
  const [_showMembershipBar, _setShowMembershipBar] = useState(false);
  const [showTeamStatus, setShowTeamStatus] = useState(false);
  // Refresh team stats when the panel opens so hearts/coins are current.
  useEffect(() => {
    if (!showTeamStatus || !user?.id) return;
    const refresh = () => {
      void apiLiveMembership(user.id)
        .then(({ data: d }) => {
          if (!d) return;
          void applyMembershipStats(d);
        })
        .catch(() => {});
    };
    refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => window.clearInterval(interval);
  }, [showTeamStatus, user?.id, applyMembershipStats]);
  const [showJoinAnimation, setShowJoinAnimation] = useState(false);
  const [_showEmojiPicker, _setShowEmojiPicker] = useState(false);
  const [_membershipHeartActive, _setMembershipHeartActive] = useState(false);
  const membershipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FAN CLUB PANEL - removed top bar, now using Sheet
  const [showFanClub, setShowFanClub] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Photo Stickers
  const [creatorStickers, setCreatorStickers] = useState<{ id: number; image_url: string; label: string }[]>([]);
  const [stickerUploading, setStickerUploading] = useState(false);
  const stickersFetchedRef = useRef(false);

  const [giftGoal, setGiftGoal] = useState<LiveGiftGoal | null>(null);
  const [goalPick, setGoalPick] = useState<GiftUiItem | null>(null);
  const [goalTargetCount, setGoalTargetCount] = useState(1);
  const [goalSaving, setGoalSaving] = useState(false);

  const saveGiftGoal = useCallback(() => {
    if (!goalPick || !isBroadcast) return;
    setGoalSaving(true);
    const nextGoal = {
      giftId: goalPick.id,
      giftName: goalPick.name,
      giftIcon: goalPick.icon,
      targetCount: goalTargetCount,
      currentCount: giftGoal?.giftId === goalPick.id ? giftGoal.currentCount : 0,
    };
    liveGiftGoalSet(nextGoal as unknown as Record<string, unknown>);
    setGiftGoal(nextGoal);
    setGoalSaving(false);
    showToast('Gift goal set');
  }, [goalPick, goalTargetCount, giftGoal, isBroadcast]);

  const clearGiftGoal = useCallback(() => {
    if (!isBroadcast) return;
    liveGiftGoalClear();
    setGiftGoal(null);
    setGoalPick(null);
    showToast('Gift goal cleared');
  }, [isBroadcast]);

  useEffect(() => {
    if (!showFanClub || stickersFetchedRef.current || !user?.id) return;
    stickersFetchedRef.current = true;
    apiLiveStickers(user.id).then(({ data: d }) => {
      if (Array.isArray(d?.stickers)) {
        setCreatorStickers(d.stickers as { id: number; image_url: string; label: string }[]);
      }
    }).catch(() => {});
  }, [showFanClub, user?.id]);

  useEffect(() => {
    if (!miniProfile) {
      setMiniProfileFollowsThem(undefined);
      return;
    }
    if (!miniProfile.id || !user?.id || miniProfile.id === user.id) {
      setMiniProfileFollowsThem(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { following: ids, error } = await apiFetchFollowingIds(user.id);
        if (error || cancelled) return;
        if (!cancelled) setMiniProfileFollowsThem(ids.includes((miniProfile.id as NonNullable<typeof miniProfile.id>)));
      } catch {
        if (!cancelled) setMiniProfileFollowsThem(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miniProfile?.id, user?.id]);

  const uploadSticker = useCallback(() => {
    const token = useAuthStore.getState().session?.access_token;
    if (!token) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setStickerUploading(true);
      try {
        const buf = await file.arrayBuffer();
        const res = await fetch(apiUrl('/api/stickers/upload'), {
          method: 'POST',
          headers: { 'Content-Type': file.type, Authorization: `Bearer ${token}` },
          body: buf,
        });
        if (res.ok) {
          const sticker = await res.json();
          setCreatorStickers(prev => [...prev, sticker]);
        }
      } catch { /* ignore */ }
      setStickerUploading(false);
    };
    input.click();
  }, []);

  const deleteSticker = useCallback(async (id: number) => {
    if (!useAuthStore.getState().session?.access_token) return;
    const { error } = await apiLiveStickerDelete(id);
    if (!error) setCreatorStickers(prev => prev.filter(s => s.id !== id));
  }, []);

  const removeFanClubSticker = useCallback((id: number) => {
    void deleteSticker(id);
  }, [deleteSticker]);

  const handleSubscribe = async () => {
    setIsSubscribing(true);
    try {
      if (!user?.id) {
        navigate('/login');
        return;
      }
      if (!platform.isNative) {
        showToast('Subscriptions are available through in-app purchases.');
        return;
      }
      if (isBroadcast) {
        showToast('Viewers can subscribe to your membership.');
        return;
      }
      const creatorId = effectiveStreamId;
      if (!creatorId || creatorId === 'broadcast') {
        showToast('Creator unavailable');
        return;
      }
      const result = await purchaseMembership(creatorId);
      if (result.success) {
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

  // Auto-close Fan Club after 10 seconds of inactivity
  useEffect(() => {
    if (showFanClub) {
      const timer = setTimeout(() => {
        setShowFanClub(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [showFanClub]);

  const closeMembershipBar = useCallback(() => {
    // setMembershipBarClosing(true);
    // setTimeout(() => { setShowMembershipBar(false); setMembershipBarClosing(false); }, 200);
  }, []);

  const _openMembershipBar = useCallback(() => {
    if (membershipTimerRef.current) clearTimeout(membershipTimerRef.current);
    // Host live: Membership capsule shows team heart counts (days each user joined).
    // Watcher path: Fan Club / Super Fan Goal sheet.
    if (isBroadcast) {
      setShowTeamStatus(true);
    } else {
      setShowFanClub(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeMembershipBar, isBroadcast]);
  const [sessionContribution, setSessionContribution] = useState(0); // total coins gifted this session
  const [universeQueue, setUniverseQueue] = useState<UniverseTickerMessage[]>([]);
  const [currentUniverse, setCurrentUniverse] = useState<UniverseTickerMessage | null>(null);

  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showGiftPanel, setShowGiftPanel] = useState(false);

  useEffect(() => {
    if (!showGiftPanel || !user?.id) return;
    void apiFetchWallet().then(({ balances, error: walletErr }) => {
      if (!walletErr && balances) {
        const walletBal = Math.max(0, balances.paid);
        walletCoinBalanceRef.current = walletBal;
        setCoinBalance(walletBal);
      }
    });
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
  const [showPromotePanel, setShowPromotePanel] = useState(false);
  const [shareQuery, setShareQuery] = useState('');
  const [shareFollowers, setShareFollowers] = useState<{ user_id: string; username: string; avatar_url: string | null }[]>([]);
  const [shareSentTo, setShareSentTo] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!showSharePanel) {
      setShareSentTo(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const rows = await fetchAllSharePanelContacts(user?.id);
      if (!cancelled) setShareFollowers(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [showSharePanel, user?.id]);

  const sendShareToFollower = async (targetUserId: string) => {
    if (!user?.id || shareSentTo.has(targetUserId)) return;
    try {
      const { data: _j, error: shareErr } = await apiLiveShareCreate({
        targetUserId,
        streamKey: effectiveStreamId,
        hostUserId: user.id,
        hostName: myCreatorName,
        hostAvatar: myAvatar || '',
        sharerName: user?.username || user?.name || 'Someone',
        sharerAvatar: user?.avatar || '',
      });
      if (shareErr) {
        showToast(shareErr || 'Could not share');
        return;
      }
      setShareSentTo((prev) => new Set(prev).add(targetUserId));
      if (effectiveStreamId) {
        earnBattleEnergyQuiet('share', effectiveStreamId);
        void apiLiveEngagementProgress({
          metric: 'shares',
          delta: 1,
          roomId: effectiveStreamId,
        }).catch(() => {});
      }
    } catch {
      showToast('Could not share');
    }
  };

  // Team totals (same as server): red = hostScore + player3Score; blue = opponentScore + player4Score.
  // 2-player: p3/p4 are 0. 'me' = red side won; 'opponent' = blue side won (layout: left=red, right=blue).
  const determine4PlayerWinner = useCallback(() => {
    const s = battleServerTotalsRef.current;
    const teamA = s.h + s.p3;
    const teamB = s.o + s.p4;
    if (teamA === teamB) return 'draw';
    return teamA > teamB ? 'me' : 'opponent';
  }, []);

    // Scores: battle_score + battle_state_sync + battle_ended. Battle countdown runs locally (no battle_tick).

  const endBattleCleanup = useCallback(() => {
    // Accepted-invite marker is battle-scoped: drop it so a later fresh visit
    // to this room is treated as a normal spectator, not an accepted joiner.
    try { sessionStorage.removeItem(`battleAccept:${effectiveStreamId}`); } catch { /* ignore */ }
    setIsBattleMode(false);
    setBattleScoreBarHidden(false);
    setBattleState('LIVE_SOLO');
    setBattleTime(300);
    setMyScore(0);
    setOpponentScore(0);
    setPlayer3Score(0);
    setPlayer4Score(0);
    setBattleWinner(null);
    setBattleTeamWinner(null);
    setBattleCountdown(null);
    setHasOpponentStream(false);
    setOpponentStreamKey(null);
    void opponentLifecycleRef.current.disconnect();
    opponentLkRoomRef.current = null;
    setIAmReady(false);
    setHostIsReady(false);
    setOpponentIsReady(false);
    setOpponentCreatorName('');
    battleServerTotalsRef.current = { h: 0, o: 0, p3: 0, p4: 0 };
    setBattleServerTotals({ h: 0, o: 0, p3: 0, p4: 0 });
    setGiftTarget('me');
    setBattleUiRole(isBattleJoiner ? 'opponent' : 'host');
    setMutedPlayers({});
    reachedThresholdsRef.current.clear();
    roseCountRef.current = 0;
    setRoseCount(0);
    battleScreenTapCountRef.current = 0;
    setBattleScreenTapCount(0);
    battleFreeTapUsedRef.current = false;
    battleTapScoreRemainingRef.current = 5;
    prevBattleSyncStatusRef.current = null;
    battleStreamIdsRef.current = null;
    battleStreakCountedForEndRef.current = false;
    battleTripleTapRef.current = { target: null, lastTapAt: 0, count: 0 };
    setMiniProfile(null);
    setSpeedChallengeActive(false);
    setSpeedChallengeTime(60);
    setSpeedChallengeTaps({ me: 0, opponent: 0, player3: 0, player4: 0 });
    setSpeedChallengeResult(null);
    setSpeedMultiplier(1);
    speedMultiplierRef.current = 1;
    if (localBattleTimerRef.current) {
      clearInterval(localBattleTimerRef.current);
      localBattleTimerRef.current = null;
    }
    setBattleSlots([
      { userId: '', name: '', status: 'empty', avatar: '' },
      { userId: '', name: '', status: 'empty', avatar: '' },
      { userId: '', name: '', status: 'empty', avatar: '' },
    ]);
    inviteTimersRef.current.forEach((t) => clearTimeout(t));
    inviteTimersRef.current.clear();
    setIsFindCreatorsOpen(false);
    setCreatorQuery('');
    if (opponentVideoRef.current) { opponentVideoRef.current.srcObject = null; }
    if (player3VideoRef.current) { player3VideoRef.current.srcObject = null; }
    if (player4VideoRef.current) { player4VideoRef.current.srcObject = null; }
    if (battlePeerRef.current) { battlePeerRef.current.close(); battlePeerRef.current = null; }
    // Battle state notified via WebSocket.
  }, [effectiveStreamId, isBattleJoiner]);

  const exitBattleMode = useCallback(() => {
    endBattleCleanup();
    battleEnd();
    // A battle opponent joined the HOST's room to play. Leaving the battle must
    // return them to their OWN live page (they stay live), never to the host's
    // watch page or the feed. The host just drops the ?battle flag and stays put.
    const wasJoiner = !isBroadcast && new URLSearchParams(location.search).get('battle') === '1';
    if (wasJoiner) {
      navigate('/live/broadcast', { replace: true });
      return;
    }
    const params = new URLSearchParams(location.search);
    if (params.has('battle')) {
      params.delete('battle');
      navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
    }
  }, [endBattleCleanup, location.search, location.pathname, navigate, isBroadcast]);

  const exitBattleModeRef = useRef(exitBattleMode);
  useEffect(() => {
    exitBattleModeRef.current = exitBattleMode;
  }, [exitBattleMode]);

  const toggleBattle = useCallback(() => {
    // Battle joiners enter via the dedicated joiner effect — never wipe their slots here.
    if (isBattleJoiner) return;
    if (isBattleMode) {
      exitBattleMode();
      return;
    }
    // Enter battle mode -> INVITING state, everything clean
    setBattleState('INVITING');
    setIsBattleMode(true);
    setSelectedCohostGiftUserId(null);
    // Battle mode owns invites now — drop any leftover co-host invite so its
    // identical-looking Join banner can't hijack the battle flow.
    setPendingCohostInvite(null);
    setBattleTime(0);
    setMyScore(0);
    setOpponentScore(0);
    setPlayer3Score(0);
    setPlayer4Score(0);
    battleServerTotalsRef.current = { h: 0, o: 0, p3: 0, p4: 0 };
    setBattleServerTotals({ h: 0, o: 0, p3: 0, p4: 0 });
    setBattleWinner(null);
    setBattleTeamWinner(null);
    setGiftTarget('me');
    setBattleCountdown(null);
    setHasOpponentStream(false);
    setOpponentStreamKey(null);
    void opponentLifecycleRef.current.disconnect();
    opponentLkRoomRef.current = null;
    setIAmReady(false);
    setHostIsReady(false);
    setOpponentIsReady(false);
    setOpponentCreatorName('');
    setMutedPlayers({});
    battleFreeTapUsedRef.current = false;
    battleTapScoreRemainingRef.current = 5;
    prevBattleSyncStatusRef.current = null;
    battleStreamIdsRef.current = null;
    battleTripleTapRef.current = { target: null, lastTapAt: 0, count: 0 };
    setBattleSlots([
      { userId: '', name: '', status: 'empty', avatar: '' },
      { userId: '', name: '', status: 'empty', avatar: '' },
      { userId: '', name: '', status: 'empty', avatar: '' },
    ]);
    if (opponentVideoRef.current) { opponentVideoRef.current.srcObject = null; }
    if (player3VideoRef.current) { player3VideoRef.current.srcObject = null; }
    if (player4VideoRef.current) { player4VideoRef.current.srcObject = null; }
    setShowViewerList(false);
    // Creators panel stays closed — host opens it via Add creator / Explore only.
    setIsFindCreatorsOpen(false);
    battleCreate({ hostName: creatorName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBattleMode, location.search, location.pathname, navigate, endBattleCleanup, creatorName, exitBattleMode, isBattleJoiner]);

  /** X on a battle participant — leave battle split view entirely (not just clear one slot). */
  const removePlayerFromSlot = useCallback((_slotIndex: number) => {
    if (isBattleMode) {
      exitBattleMode();
      return;
    }
    setBattleSlots((prev) => {
      const next = [...prev];
      next[_slotIndex] = { userId: '', name: '', status: 'empty', avatar: '' };
      return next;
    });
  }, [isBattleMode, exitBattleMode]);

  // No auto-start - user must press Match to begin

  useEffect(() => {
    if (battleCountdown === null || battleCountdown > 0) return;
    setBattleState('IN_BATTLE');
    setBattleCountdown(null);
    setBattleTime(300);
    battleTapScoreRemainingRef.current = 5;
    // Countdown: local useEffect when IN_BATTLE. Winner: server battle_ended.
    return () => {
      if (localBattleTimerRef.current) {
        clearInterval(localBattleTimerRef.current);
        localBattleTimerRef.current = null;
      }
    };
  }, [battleCountdown]);

  useEffect(() => {
    if (battleCountdown == null || battleCountdown <= 0) return;
    const id = setTimeout(() => setBattleCountdown((c) => (c != null && c > 0 ? c - 1 : null)), 1000);
    return () => clearTimeout(id);
  }, [battleCountdown]);

  // Battle duration: local 1s countdown while IN_BATTLE (no WebSocket battle_tick).
  useEffect(() => {
    if (!isBattleMode || battleWinner || battleState !== 'IN_BATTLE') return;
    const id = window.setInterval(() => {
      setBattleTime((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [isBattleMode, battleWinner, battleState]);

  const _startBattleWithCreator = (creatorId: string, creatorName: string) => {
    setOpponentCreatorName(creatorName);
    if (!isBattleMode) {
      setIsBattleMode(true);
      setBattleTime(0);
      setMyScore(0);
      setOpponentScore(0);
      setPlayer3Score(0);
      setPlayer4Score(0);
        setBattleWinner(null);
    setBattleTeamWinner(null);
        setGiftTarget('me');
      setBattleCountdown(null);
      const params = new URLSearchParams(location.search);
      params.set('battle', '1');
      navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
    }
    inviteCreatorToSlot(creatorId);
  };

  useEffect(() => {
    if (currentUniverse || universeQueue.length === 0) return;
    const next = universeQueue[0];
    setCurrentUniverse(next);
    setUniverseQueue((prev) => prev.slice(1));
  }, [currentUniverse, universeQueue]);

  // Auto-clear universe message after 8 seconds
  useEffect(() => {
    if (!currentUniverse) return;
    const timer = setTimeout(() => {
      setCurrentUniverse(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [currentUniverse]);

  const enqueueUniverse = (sender: string) => {
    const receiver = isBattleMode
      ? giftTarget === 'me'
      ? myCreatorName
      : opponentCreatorName
      : myCreatorName;

    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setUniverseQueue((prev) => {
      const next = [...prev, { id, sender, receiver }];
      return next.slice(-12);
    });
  };

  const maybeEnqueueUniverse = (giftName: string, sender: string) => {
    if (!/univ/i.test(giftName)) return;
    enqueueUniverse(sender);
  };

  const addLiveLikes = useCallback((delta: number) => {
    if (delta <= 0) return;

    setLiveLikes((prev) => {
      const next = prev + delta;
      if (prev < PROMOTE_LIKES_THRESHOLD_LIVE && next >= PROMOTE_LIKES_THRESHOLD_LIVE) {
        setPromo({
          type: isBattleMode ? 'battle' : 'live',
          streamId: effectiveStreamId,
          likes: next,
          createdAt: Date.now(),
        });
      }
      return next;
    });
  }, [isBattleMode, effectiveStreamId, setPromo]);

  /** Gift / battle PK totals — full numbers (no K/M) so scores match real coin amounts. */
  const formatCoinsShort = (coins: number) => {
    const n = typeof coins === 'number' && Number.isFinite(coins) ? coins : 0;
    return n.toLocaleString();
  };

  const formatCountShort = (count: number) => {
    const c = typeof count === 'number' && Number.isFinite(count) ? count : 0;
    if (c >= 1_000_000) {
      const m = Math.round((c / 1_000_000) * 10) / 10;
      const label = Number.isInteger(m) ? String(Math.trunc(m)) : String(m);
      return `${label}M`;
    }
    if (c >= 1000) {
      const k = Math.round((c / 1000) * 10) / 10;
      const label = Number.isInteger(k) ? String(Math.trunc(k)) : String(k);
      return `${label}K`;
    }
    return String(c);
  };

  const activeViewersRef = useRef<LiveViewer[]>([]);
  const spawnHeartAt = useCallback((x: number, y: number, colorOverride?: string, likerName?: string, likerAvatar?: string) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const dx = Math.round((Math.random() * 2 - 1) * 120);
    const rot = Math.round((Math.random() * 2 - 1) * 45);
    const size = Math.round(24 + Math.random() * 12);
    const colors = ['#FF0000', '#ffffff', '#E60026', '#E6E9EE', '#FF1744', '#CC0000'];
    const color = colorOverride ?? colors[Math.floor(Math.random() * colors.length)];
    
    // Check if this is a membership heart (triggered by "Joined the team")
    const isMembership = likerName === 'You' && likerAvatar === '/royce/elix-mark.svg';

    // Pick a random viewer name if none provided
    let username = likerName;
    let avatar = likerAvatar;
    const viewers = activeViewersRef.current;
    if (!username && viewers.length > 0) {
      const randomViewer = viewers[Math.floor(Math.random() * viewers.length)];
      username = randomViewer.displayName;
      avatar = randomViewer.avatar;
    }

    setFloatingHearts((prev) => [...prev.slice(-40), { id, x, y, dx, rot, size, color, username, avatar, isMembership }]);
    window.setTimeout(() => {
      setFloatingHearts((prev) => prev.filter((h) => h.id !== id));
    }, isMembership ? 2000 : 500); // Increased timeout for membership hearts
  }, []);

  const spawnHeartFromClient = (clientX: number, clientY: number, colorOverride?: string, likerName?: string, likerAvatar?: string) => {
    const layer = chatHeartLayerRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    if (inside) {
      const x = Math.max(8, Math.min(rect.width - 8, clientX - rect.left));
      const y = Math.max(8, Math.min(rect.height - 8, clientY - rect.top));
      spawnHeartAt(x, y, colorOverride, likerName, likerAvatar);
      return;
    }
    const w = rect.width;
    const h = rect.height;
    const x = w * (0.58 + Math.random() * 0.35);
    const y = h * (0.12 + Math.random() * 0.68);
    spawnHeartAt(x, y, colorOverride ?? '#ffffff', likerName, likerAvatar);
  };

  const spawnHeartAtSide = useCallback((target: 'me' | 'opponent') => {
    const layer = chatHeartLayerRef.current;
    if (!layer) return;
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    if (w <= 0 || h <= 0) return;
    const x = w * (target === 'me' ? 0.35 : 0.65);
    const y = h * (0.55 + Math.random() * 0.15);
    spawnHeartAt(x, y, '#ffffff', heartFloatName, heartFloatAvatar);
  }, [spawnHeartAt, heartFloatName, heartFloatAvatar]);

  // Battle tap: every tap counted server-side; every 3 taps = +5 Battle points (£0 revenue).
  const handleBattleTap = useCallback((target: 'me' | 'opponent' | 'player3' | 'player4') => {
    if (!isBattleMode || battleWinner || battleTime <= 0) return;
    if (isCreatorParticipant) return;
    if (!websocket.isConnected()) return;

    setGiftTarget(target);
    spectatorTapPointsRef.current += 1;
    setSpectatorTapsUsed(spectatorTapPointsRef.current);
    const voteTarget =
      target === 'opponent' || target === 'player4' ? 'opponent' : 'host';
    battleSpectatorVote({ target: voteTarget });
  }, [battleWinner, battleTime, isBattleMode, isCreatorParticipant]);

  // ─── SPEED CHALLENGE LOGIC ───
  const startSpeedChallenge = useCallback(() => {
    if (!SPEED_CHALLENGE_ENABLED) return;
    if (speedChallengeActive || !isBattleMode || battleWinner) return;
    setSpeedChallengeTaps({ me: 0, opponent: 0, player3: 0, player4: 0 });
    setSpeedChallengeResult(null);
    setSpeedChallengeActive(true);
    setSpeedChallengeTime(60);
  }, [speedChallengeActive, isBattleMode, battleWinner, SPEED_CHALLENGE_ENABLED]);

  // Speed challenge timer: 60 → 0
  useEffect(() => {
    if (!speedChallengeActive) return;
    if (speedChallengeTime <= 0) {
      // Challenge ended - determine winner
      setSpeedChallengeActive(false);

      // Read taps from ref (avoids stale closure + avoids dependency on taps object)
      const finalTaps = speedChallengeTapsRef.current;
      const entries = Object.entries(finalTaps).filter(([k]) => {
        if (k === 'me') return true;
        if (k === 'opponent') return battleSlots[0].status === 'accepted';
        if (k === 'player3') return battleSlots[1].status === 'accepted';
        if (k === 'player4') return battleSlots[2].status === 'accepted';
        return false;
      });
      if (entries.length > 0) {
        const maxTaps = Math.max(...entries.map(([, v]) => v));
        const winners = entries.filter(([, v]) => v === maxTaps);
        if (winners.length > 1 || maxTaps === 0) {
          setSpeedChallengeResult('DRAW!');
        } else {
          const winnerKey = winners[0][0];
          const names: Record<string, string> = { me: myCreatorName, opponent: opponentCreatorName || 'P2', player3: battleSlots[1]?.name || 'P3', player4: battleSlots[2]?.name || 'P4' };
          setSpeedChallengeResult(`${names[winnerKey]} wins!`);
        }
        // Auto-clear result after 3s
        setTimeout(() => setSpeedChallengeResult(null), 3000);
      }
      setSpeedMultiplier(1);
      speedMultiplierRef.current = 1;
      return;
    }
    const t = setTimeout(() => setSpeedChallengeTime(prev => prev - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedChallengeActive, speedChallengeTime]);


  // Speed challenge unlock (automatic only — no More-menu Speed button).
  // Unlocks from gift points OR rose/flower gifts OR lots of battle screen taps.
  // Picks highest available tier: x2 / x3 / x5.
  useEffect(() => {
    if (!SPEED_CHALLENGE_ENABLED || !isBattleMode || battleWinner) return;
    if (speedChallengeActive) return;

    const totalScore = myScore + opponentScore + player3Score + player4Score;
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

    // Highest first — system chooses x5 / x3 / x2 automatically.
    if (tryUnlock(5000, 5, 5, 80, [1000, 200])) return;
    if (tryUnlock(1000, 3, 3, 40, [200])) return;
    tryUnlock(200, 2, 1, 15, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myScore, opponentScore, player3Score, player4Score, roseCount, battleScreenTapCount, isBattleMode, battleWinner, speedChallengeActive, startSpeedChallenge]);

  useEffect(() => {
    if (!isBattleMode) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (battleWinner) return;

      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLElement) {
        const tag = activeEl.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || activeEl.isContentEditable) return;
      }

      const key = e.key;
      const code = e.code;

      // Battle tap → score only. Likes (profile counter) are a separate action.
      if (key === 'ArrowLeft' || key === 'a' || key === 'A' || code === 'Numpad4') {
        e.preventDefault();
        handleBattleTap('me');
        spawnHeartAtSide('me');
        return;
      }

      if (key === 'ArrowRight' || key === 'd' || key === 'D' || code === 'Numpad6') {
        e.preventDefault();
        handleBattleTap('opponent');
        spawnHeartAtSide('opponent');
      }
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isBattleMode, battleWinner, handleBattleTap, spawnHeartAtSide, addLiveLikes]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldStartBattle = params.get('battle') === '1';
    // Only the host may auto-enter battle from ?battle=1 — joiners use battle joiner effect.
    if (shouldStartBattle && !isBattleMode && isBroadcast) {
      toggleBattle();
    }
  }, [location.search, isBattleMode, toggleBattle, isBroadcast]);

  useEffect(() => {
    if (!isBroadcast) return;

    let cancelled = false;

    const start = async () => {
      try {
        setCameraError(null);

        if (cameraFacing !== 'user') {
          clearCachedCameraStream();
        }

        const cached = getCachedCameraStream();
        if (cached) {
          const cachedVideo = cached.getVideoTracks()[0];
          if (cachedVideo?.readyState === 'live') {
            cameraStreamRef.current = cached;
            setCameraStream(cached);
            cached.getAudioTracks().forEach((t) => (t.enabled = !isMicMuted));
            if (videoRef.current) {
              videoRef.current.srcObject = cached;
              prepareLiveVideoEl(videoRef.current);
            }
            return;
          }
          clearCachedCameraStream();
        }

        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: cameraFacing,
            },
            audio: true,
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: cameraFacing,
              },
              audio: false,
            });
          } catch {
            setCameraError('Camera access denied');
            return;
          }
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const previous = cameraStreamRef.current;
        cameraStreamRef.current = stream;
        setCameraStream(stream);
        setCachedCameraStream(stream);
        stream.getAudioTracks().forEach((t) => (t.enabled = !isMicMuted));

        // Set camera zoom to minimum for widest view
        try {
          const vTrack = stream.getVideoTracks()[0];
          const caps = vTrack?.getCapabilities?.() as Record<string, { min?: number; max?: number }>;
          if (caps?.zoom) {
            await vTrack.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet] });
          }
        } catch { /* zoom not supported */ }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          prepareLiveVideoEl(videoRef.current);
        }

        // Warm-swap: attach new stream first, then stop the previous facing.
        if (previous && previous !== stream) {
          previous.getTracks().forEach((t) => t.stop());
        }
      } catch {
        setCameraError('Camera access denied');
      }
    };

    start();

    // Facing flip must NOT stop tracks in cleanup — that races the new getUserMedia
    // and blacks the preview. Only cancel in-flight acquire; start() stops the old
    // stream after the new one is attached.
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBroadcast, cameraFacing]);

  // True leave of broadcast page: stop camera/mic (LiveKit no longer stops them for us).
  useEffect(() => {
    if (!isBroadcast) return;
    return () => {
      const current = cameraStreamRef.current;
      if (current) {
        current.getTracks().forEach((t) => {
          try { t.stop(); } catch { /* ignore */ }
        });
        cameraStreamRef.current = null;
      }
      clearCachedCameraStream();
    };
  }, [isBroadcast]);

  // Re-attach camera stream when battle mode toggles (solo vs battle <video> swap).
  useEffect(() => {
    if (!isBroadcast && !isBattleJoiner) return;
    let cancelled = false;
    let attempts = 0;
    const attach = () => {
      if (cancelled || attempts > 30) return;
      attempts += 1;
      const stream = cameraStreamRef.current;
      const el = videoRef.current;
      const track = stream?.getVideoTracks()[0];
      if (stream && el && track?.readyState === 'live') {
        if (el.srcObject !== stream) {
          el.srcObject = stream;
        }
        prepareLiveVideoEl(el);
        return;
      }
      requestAnimationFrame(attach);
    };
    requestAnimationFrame(attach);
    return () => {
      cancelled = true;
    };
  }, [isBattleMode, isBroadcast, isBattleJoiner, cameraStream]);

  useEffect(() => {
    if (!isBroadcast) return;
    const handleForeground = async () => {
      if (document.visibilityState !== 'visible') return;
      websocket.reconnectOnForeground();
      const stream = cameraStreamRef.current;
      const track = stream?.getVideoTracks()[0];
      if (track && track.readyState === 'live') {
        const el = videoRef.current;
        if (el) {
          if (el.srcObject !== stream) el.srcObject = stream;
          prepareLiveVideoEl(el);
        }
        return;
      }
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: cameraFacing },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        const previous = cameraStreamRef.current;
        cameraStreamRef.current = newStream;
        setCameraStream(newStream);
        setCachedCameraStream(newStream);
        newStream.getAudioTracks().forEach((t) => { t.enabled = !isMicMuted; });
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          prepareLiveVideoEl(videoRef.current);
        }
        if (previous && previous !== newStream) {
          previous.getTracks().forEach((t) => t.stop());
        }
        void publishHostLiveKitTracks();
      } catch {
        /* camera unavailable */
      }
    };
    document.addEventListener('visibilitychange', handleForeground);
    let appSub: { remove: () => void } | null = null;
    if (platform.isNative) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void handleForeground();
      }).then((h) => { appSub = h; });
    }
    return () => {
      document.removeEventListener('visibilitychange', handleForeground);
      appSub?.remove();
    };
  }, [isBroadcast, cameraFacing, isMicMuted, publishHostLiveKitTracks]);

  // Keep host preview alive: rebind srcObject, and if the track was killed
  // (LiveKit unpublish/disconnect), reacquire once with a cooldown.
  const cameraRecoverInFlightRef = useRef(false);
  const cameraRecoverAtRef = useRef(0);
  useEffect(() => {
    if (!isBroadcast) return;
    const id = window.setInterval(() => {
      let stream = cameraStreamRef.current;
      if (!stream) {
        const cached = getCachedCameraStream();
        if (cached?.getVideoTracks()?.some((t) => t.readyState === 'live')) {
          cameraStreamRef.current = cached;
          stream = cached;
          setCameraStream(cached);
        }
      }
      const el = videoRef.current;
      const track = stream?.getVideoTracks()[0];
      if (stream && el && track?.readyState === 'live') {
        if (el.srcObject !== stream) {
          el.srcObject = stream;
        }
        if (el.paused || el.style.visibility === 'hidden') {
          prepareLiveVideoEl(el);
        }
        return;
      }

      if (cameraRecoverInFlightRef.current) return;
      if (Date.now() - cameraRecoverAtRef.current < 5000) return;
      cameraRecoverInFlightRef.current = true;
      cameraRecoverAtRef.current = Date.now();
      void (async () => {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: cameraFacing },
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          const previous = cameraStreamRef.current;
          cameraStreamRef.current = newStream;
          setCameraStream(newStream);
          setCachedCameraStream(newStream);
          newStream.getAudioTracks().forEach((t) => {
            t.enabled = !isMicMuted;
          });
          if (videoRef.current) {
            videoRef.current.srcObject = newStream;
            prepareLiveVideoEl(videoRef.current);
          }
          if (previous && previous !== newStream) {
            previous.getTracks().forEach((t) => {
              try { t.stop(); } catch { /* ignore */ }
            });
          }
          setCameraError(null);
          void publishHostLiveKitTracks();
        } catch {
          /* camera unavailable — leave error state if already set */
        } finally {
          cameraRecoverInFlightRef.current = false;
        }
      })();
    }, 750);
    return () => window.clearInterval(id);
  }, [isBroadcast, cameraFacing, isMicMuted, publishHostLiveKitTracks]);

  useEffect(() => {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = !isMicMuted));
  }, [isMicMuted]);

  const [activeViewers, setActiveViewers] = useState<LiveViewer[]>([]);
  const viewerIdentityCacheRef = useRef<Map<string, { username: string; displayName: string; avatar: string; level: number }>>(new Map());
  const viewerIdentityInflightRef = useRef<Map<string, Promise<void>>>(new Map());
  /** Coin value sent this session — global top gifters (top bar). */
  const [mvpGiftScores, setMvpGiftScores] = useState<Record<string, number>>({});
  /** Battle: gifts tagged for host/creator side (red). */
  const [mvpGiftScoresHost, setMvpGiftScoresHost] = useState<Record<string, number>>({});
  /** Battle: gifts tagged for opponent side (blue). */
  const [mvpGiftScoresOpponent, setMvpGiftScoresOpponent] = useState<Record<string, number>>({});
  /** Host weekly ranking for Diamond League (viewers); null if unknown. */
  const [diamondLeagueRank, setDiamondLeagueRank] = useState<number | null>(null);
  useEffect(() => { activeViewersRef.current = activeViewers; }, [activeViewers]);
  const isGenericViewerName = useCallback((value: string | null | undefined) => {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return true;
    return v === 'anonymous' || v === 'user' || v === 'viewer' || v === 'guest' || v.startsWith('user_');
  }, []);
  const maybeResolveViewerIdentity = useCallback((viewerId: string) => {
    if (!viewerId || viewerId === user?.id) return;
    const cached = viewerIdentityCacheRef.current.get(viewerId);
    const hasPhoto = Boolean(cached?.avatar && !cached.avatar.includes('/royce/default-avatar'));
    if (hasPhoto || viewerIdentityInflightRef.current.has(viewerId)) return;
    const task = (async () => {
      try {
        const { body, error: profileErr } = await apiFetchProfileById(viewerId);
        if (profileErr || !body) return;
        const profile = (body?.profile || body?.data || {}) as Record<string, unknown>;
        const resolvedUsername =
          (typeof profile.username === 'string' && profile.username.trim()) ||
          (typeof profile.displayName === 'string' && profile.displayName.trim()) ||
          (typeof profile.display_name === 'string' && profile.display_name.trim()) ||
          '';
        const resolvedDisplayName =
          (typeof profile.displayName === 'string' && profile.displayName.trim()) ||
          (typeof profile.display_name === 'string' && profile.display_name.trim()) ||
          resolvedUsername ||
          '';
        const resolvedAvatar =
          (typeof profile.avatarUrl === 'string' && profile.avatarUrl.trim()) ||
          (typeof profile.avatar_url === 'string' && profile.avatar_url.trim()) ||
          '';
        const resolvedLevel =
          Number.isFinite(Number(profile.level)) && Number(profile.level) >= 0
            ? Math.floor(Number(profile.level))
            : 1;
        if (!resolvedUsername && !resolvedDisplayName) return;
        const nextIdentity = {
          username: resolvedUsername || resolvedDisplayName,
          displayName: resolvedDisplayName || resolvedUsername,
          avatar: resolvedAvatar,
          level: resolvedLevel,
        };
        viewerIdentityCacheRef.current.set(viewerId, nextIdentity);
        setActiveViewers((prev) =>
          prev.map((v) => (v.id === viewerId ? { ...v, ...nextIdentity } : v))
        );
        if (nextIdentity.avatar) {
          setMessages((prev) =>
            prev.map((m) => {
              const sameUser =
                m.username === nextIdentity.username ||
                m.username === nextIdentity.displayName;
              if (!sameUser) return m;
              if (m.avatar && !m.avatar.includes('/royce/default-avatar')) return m;
              return { ...m, avatar: nextIdentity.avatar };
            }),
          );
        }
      } catch {
        // Keep socket name fallback if profile lookup fails.
      } finally {
        viewerIdentityInflightRef.current.delete(viewerId);
      }
    })();
    viewerIdentityInflightRef.current.set(viewerId, task);
  }, [user?.id]);
  useEffect(() => {
    setMvpGiftScores({});
    setMvpGiftScoresHost({});
    setMvpGiftScoresOpponent({});
    viewerIdentityCacheRef.current.clear();
  }, [effectiveStreamId]);

  const buildMvpRanked = useCallback(
    (scores: Record<string, number>, limit: number, opts?: { requirePositiveScore?: boolean }): LiveViewer[] => {
      const byId = new Map<string, LiveViewer>();
      for (const v of activeViewers) {
        const cached = viewerIdentityCacheRef.current.get(v.id);
        byId.set(v.id, {
          ...v,
          avatar: (v.avatar && v.avatar.trim()) || cached?.avatar || '',
          username: (!isGenericViewerName(v.username) ? v.username : '') || cached?.username || v.username,
          displayName:
            (!isGenericViewerName(v.displayName) ? v.displayName : '') ||
            cached?.displayName ||
            v.displayName,
          level: v.level || cached?.level || 1,
        });
      }
      for (const id of Object.keys(scores)) {
        if (!id || byId.has(id)) continue;
        const cached = viewerIdentityCacheRef.current.get(id);
        byId.set(id, {
          id,
          username: cached?.username || 'User',
          displayName: cached?.displayName || cached?.username || 'User',
          level: cached?.level || 1,
          avatar: cached?.avatar || '',
          country: '',
          joinedAt: Date.now(),
          isActive: true,
          chatFrequency: 0,
          supportDays: 0,
          lastVisitDaysAgo: 0,
        });
      }
      let pool = [...byId.values()];
      // Battle host/opponent MVP: only people who scored on THAT side (never mirror the same viewer on both).
      if (opts?.requirePositiveScore) {
        pool = pool.filter((v) => (scores[v.id] ?? 0) > 0);
      }
      const ranked = pool.sort((a, b) => {
        const sa = scores[a.id] ?? 0;
        const sb = scores[b.id] ?? 0;
        if (sb !== sa) return sb - sa;
        return b.level - a.level;
      });
      const top = ranked.slice(0, limit);
      for (const v of top) {
        if (!v.avatar?.trim() || isGenericViewerName(v.displayName) || isGenericViewerName(v.username)) {
          maybeResolveViewerIdentity(v.id);
        }
      }
      return top;
    },
    [activeViewers, isGenericViewerName, maybeResolveViewerIdentity],
  );

  const topMvpViewers = useMemo(
    () => buildMvpRanked(mvpGiftScores, 3),
    [buildMvpRanked, mvpGiftScores],
  );

  const topGiftersRanked = useMemo(() => {
    const ranked = buildMvpRanked(mvpGiftScores, 50, { requirePositiveScore: true });
    if (ranked.length > 0) return ranked;
    // Fallback: show top viewers by level when nobody has gifted yet.
    return buildMvpRanked(mvpGiftScores, 20);
  }, [buildMvpRanked, mvpGiftScores]);

  const topGiftersForPanel = useMemo(() => {
    if (topGiftersSide === 'host') {
      const ranked = buildMvpRanked(mvpGiftScoresHost, 50, { requirePositiveScore: true });
      return ranked.length > 0 ? ranked : buildMvpRanked(mvpGiftScoresHost, 20);
    }
    if (topGiftersSide === 'opponent') {
      const ranked = buildMvpRanked(mvpGiftScoresOpponent, 50, { requirePositiveScore: true });
      return ranked.length > 0 ? ranked : buildMvpRanked(mvpGiftScoresOpponent, 20);
    }
    return topGiftersRanked;
  }, [
    topGiftersSide,
    topGiftersRanked,
    buildMvpRanked,
    mvpGiftScoresHost,
    mvpGiftScoresOpponent,
  ]);

  const liveViewerLabel = useCallback((v: { displayName?: string; username?: string }) => {
    const d = String(v.displayName || '').trim();
    const u = String(v.username || '').trim();
    const looksEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    if (d && !looksEmail(d)) return d;
    if (u && !looksEmail(u)) return u;
    if (d && looksEmail(d)) return d.split('@')[0] || 'User';
    if (u && looksEmail(u)) return u.split('@')[0] || 'User';
    return d || u || 'User';
  }, []);

  const openTopGiftersPanel = useCallback((side: 'all' | 'host' | 'opponent' = 'all') => {
    setIsFindCreatorsOpen(false);
    setTopGiftersSide(side);
    setViewerListMode('topGifters');
    setShowViewerList(true);
  }, []);

  const openSpectatorsPanel = useCallback(() => {
    setIsFindCreatorsOpen(false);
    setViewerListMode('spectators');
    setShowViewerList(true);
  }, []);

  const topMvpHostBattle = useMemo(() => {
    // Scorers exclusive to host side, then fill remaining of 3 from viewers by host score.
    const exclusive = buildMvpRanked(mvpGiftScoresHost, 3, { requirePositiveScore: true }).filter((v) => {
      const h = mvpGiftScoresHost[v.id] ?? 0;
      const o = mvpGiftScoresOpponent[v.id] ?? 0;
      return h > 0 && h >= o;
    });
    if (exclusive.length >= 3) return exclusive.slice(0, 3);
    const seen = new Set(exclusive.map((v) => v.id));
    const fillers = buildMvpRanked(mvpGiftScoresHost, 6);
    const out = [...exclusive];
    for (const v of fillers) {
      if (out.length >= 3) break;
      if (seen.has(v.id)) continue;
      const h = mvpGiftScoresHost[v.id] ?? 0;
      const o = mvpGiftScoresOpponent[v.id] ?? 0;
      if (o > h) continue;
      out.push(v);
      seen.add(v.id);
    }
    return out;
  }, [buildMvpRanked, mvpGiftScoresHost, mvpGiftScoresOpponent]);

  const topMvpOpponentBattle = useMemo(() => {
    const exclusive = buildMvpRanked(mvpGiftScoresOpponent, 3, { requirePositiveScore: true }).filter((v) => {
      const h = mvpGiftScoresHost[v.id] ?? 0;
      const o = mvpGiftScoresOpponent[v.id] ?? 0;
      return o > 0 && o > h;
    });
    if (exclusive.length >= 3) return exclusive.slice(0, 3);
    const hostIds = new Set(topMvpHostBattle.map((v) => v.id));
    const seen = new Set(exclusive.map((v) => v.id));
    const fillers = buildMvpRanked(mvpGiftScoresOpponent, 6);
    const out = [...exclusive];
    for (const v of fillers) {
      if (out.length >= 3) break;
      if (seen.has(v.id) || hostIds.has(v.id)) continue;
      const h = mvpGiftScoresHost[v.id] ?? 0;
      const o = mvpGiftScoresOpponent[v.id] ?? 0;
      if (h > o) continue;
      out.push(v);
      seen.add(v.id);
    }
    return out;
  }, [buildMvpRanked, mvpGiftScoresHost, mvpGiftScoresOpponent, topMvpHostBattle]);

  useEffect(() => {
    if (!isBattleMode) {
      prevMvpHostIdRef.current = null;
      prevMvpOpponentIdRef.current = null;
      return;
    }
    const hostMvp = topMvpHostBattle[0];
    if (hostMvp?.id) {
      if (prevMvpHostIdRef.current && prevMvpHostIdRef.current !== hostMvp.id) {
        announceMvpName(hostMvp.displayName || hostMvp.username, 'host');
        pushBattleTaunt(createTauntBurst('host', 'mvp'));
      }
      prevMvpHostIdRef.current = hostMvp.id;
    }
    const oppMvp = topMvpOpponentBattle[0];
    if (oppMvp?.id) {
      if (prevMvpOpponentIdRef.current && prevMvpOpponentIdRef.current !== oppMvp.id) {
        announceMvpName(oppMvp.displayName || oppMvp.username, 'opponent');
        pushBattleTaunt(createTauntBurst('opponent', 'mvp'));
        playBattleTauntSound('boo');
      }
      prevMvpOpponentIdRef.current = oppMvp.id;
    }
  }, [isBattleMode, topMvpHostBattle, topMvpOpponentBattle, pushBattleTaunt]);

  useEffect(() => { speedChallengeTapsRef.current = speedChallengeTaps; }, [speedChallengeTaps]);

  // WebSocket: connect to room and track viewers
  useEffect(() => {
    if (!effectiveStreamId || !user?.id) return;

    const getToken = async () => {
      return useAuthStore.getState().session?.access_token ?? '';
    };

    let mounted = true;

    const connect = async () => {
      const token = await getToken();
      if (!token || !mounted) return;
      websocket.connect(effectiveStreamId, token, { persistent: isBroadcast });
    };

    const handleRoomState = (data) => {
      if (!mounted) return;
      const seen = new Set<string>();
      const viewers: LiveViewer[] = [];
      const needsIdentityLookup: string[] = [];
      for (const v of (data.viewers || [])) {
        const uid = typeof v.user_id === 'string' ? v.user_id : String(v.user_id ?? '');
        if (!uid || uid === user?.id || seen.has(uid)) continue;
        seen.add(uid);
        const cached = viewerIdentityCacheRef.current.get(uid);
        const socketUsername = typeof v.username === 'string' ? v.username : 'User';
        const socketDisplayName =
          typeof v.display_name === 'string'
            ? v.display_name
            : (typeof v.username === 'string' ? v.username : 'User');
        viewers.push({
          id: uid,
          username: cached?.username || socketUsername,
          displayName: cached?.displayName || socketDisplayName,
          level: cached?.level || (typeof v.level === 'number' && Number.isFinite(v.level) ? v.level : 1),
          avatar:
            cached?.avatar ||
            (typeof v.avatar_url === 'string' ? v.avatar_url : '') ||
            (typeof v.avatarUrl === 'string' ? v.avatarUrl : '') ||
            (typeof v.avatar === 'string' ? v.avatar : ''),
          country: v.country || '',
          joinedAt: Date.now(),
          isActive: true,
          chatFrequency: 0,
          supportDays: 0,
          lastVisitDaysAgo: 0,
        });
        const socketAvatar =
          (typeof v.avatar_url === 'string' ? v.avatar_url.trim() : '') ||
          (typeof v.avatarUrl === 'string' ? v.avatarUrl.trim() : '') ||
          (typeof v.avatar === 'string' ? v.avatar.trim() : '');
        if (socketAvatar || (!isGenericViewerName(socketUsername) && !isGenericViewerName(socketDisplayName))) {
          viewerIdentityCacheRef.current.set(uid, {
            username: socketUsername,
            displayName: socketDisplayName,
            avatar: socketAvatar || cached?.avatar || '',
            level: typeof v.level === 'number' && Number.isFinite(v.level) ? v.level : 1,
          });
        }
        if (!cached && (isGenericViewerName(socketUsername) || isGenericViewerName(socketDisplayName) || !socketAvatar)) {
          needsIdentityLookup.push(uid);
        }
      }
      setActiveViewers(viewers);
      setViewerCount(viewers.length);
      // Seed announced set only — never wipe (reconnect room_state must not re-allow banners).
      for (const v of viewers) {
        if (v.id) joinAnnouncedRef.current.add(String(v.id));
      }
      needsIdentityLookup.forEach((uid) => maybeResolveViewerIdentity(uid));

      // Creator: push layout to server as soon as we connect so spectators who join later get creator layout
      if (isBroadcastRef.current && effectiveStreamId && user?.id) {
        const list = coHostsRef.current.map((h) => ({ id: h.id, userId: h.userId, name: h.name, avatar: h.avatar, status: h.status }));
        cohostLayoutSync({ roomId: effectiveStreamId, coHosts: list, hostUserId: user.id });
      }

      // Opponent: once connected to the room, tell the server we're joining the battle
      if (isBattleJoiner) {
        battleJoin({ opponentName: user?.username || user?.name || 'Player' });
      }

      if (typeof data.live_likes === 'number' && Number.isFinite(data.live_likes)) {
        setLiveLikes(Math.max(0, data.live_likes));
      }
    };

    const handleUserJoined = (data) => {
      if (!mounted) return;
      if (data.user_id === user?.id) return;
      const joinName = data.username || 'User';
      const uid = typeof data.user_id === 'string' ? data.user_id : String(data.user_id ?? '');
      // No stable id → cannot dedupe; skip banner (viewer list still updates below if needed).
      if (!uid) return;
      const cached = uid ? viewerIdentityCacheRef.current.get(uid) : undefined;
      const wsLevel = Number(data.level);
      const initialLevel =
        cached?.level && cached.level > 0
          ? cached.level
          : Number.isFinite(wsLevel) && wsLevel >= 0
            ? Math.floor(wsLevel)
            : 1;
      // One join banner per user for the whole live session (reconnect / double emit / leave-rejoin).
      if (joinAnnouncedRef.current.has(uid)) {
        setActiveViewers(prev => {
          if (prev.some(v => String(v.id) === uid)) return prev;
          return appendCapped(prev, {
            id: uid,
            username: cached?.username || joinName,
            displayName: cached?.displayName || (typeof data.display_name === 'string' ? data.display_name : joinName),
            level: initialLevel,
            avatar: cached?.avatar || (typeof data.avatar_url === 'string' ? data.avatar_url : ''),
            country: data.country || '',
            joinedAt: Date.now(),
            isActive: true,
            chatFrequency: 0,
            supportDays: 0,
            lastVisitDaysAgo: 0,
          }, LIVE_VIEWER_CAP);
        });
        return;
      }
      joinAnnouncedRef.current.add(uid);
      setActiveViewers(prev => {
        if (prev.some(v => String(v.id) === uid)) return prev;
        return appendCapped(prev, {
          id: uid,
          username: cached?.username || joinName,
          displayName: cached?.displayName || (typeof data.display_name === 'string' ? data.display_name : joinName),
          level: initialLevel,
          avatar: cached?.avatar || (typeof data.avatar_url === 'string' ? data.avatar_url : ''),
          country: data.country || '',
          joinedAt: Date.now(),
          isActive: true,
          chatFrequency: 0,
          supportDays: 0,
          lastVisitDaysAgo: 0,
        }, LIVE_VIEWER_CAP);
      });
      const joinMsgId = `join-${uid}`;
      setMessages(prev => {
        if (prev.some((m) => m.id === joinMsgId || (m.isSystem === true && m.text === 'joined the stream' && m.username === joinName))) {
          return prev;
        }
        return appendCapped(prev, {
          id: joinMsgId,
          username: joinName,
          text: 'joined the stream',
          isSystem: true,
          level: initialLevel,
          avatar: typeof data.avatar_url === 'string' ? data.avatar_url : '',
        }, LIVE_CHAT_MESSAGE_CAP);
      });
      if (uid && initialLevel <= 1) {
        void apiFetchProfileById(uid).then(({ body }) => {
          if (!mounted) return;
          const prof = (body?.profile || body?.data || {}) as Record<string, unknown>;
          const lvl = Number(prof.level);
          if (!Number.isFinite(lvl) || lvl <= 0) return;
          const fixed = Math.floor(lvl);
          setMessages((prev) => prev.map((m) => (m.id === joinMsgId ? { ...m, level: fixed } : m)));
          setActiveViewers((prev) => prev.map((v) => (v.id === uid ? { ...v, level: fixed } : v)));
        }).catch(() => {});
      }
      // The join banner is ephemeral: it appears only when someone joins, then
      // clears itself so it never stays permanently in the chat feed.
      window.setTimeout(() => {
        if (!mounted) return;
        setMessages(prev => prev.filter(m => m.id !== joinMsgId));
      }, 5000);
      setViewerCount(prev => prev + 1);
      const joinAvatar = typeof data.avatar_url === 'string' ? data.avatar_url.trim() : '';
      if (uid && !cached && (isGenericViewerName(joinName) || isGenericViewerName(data.display_name) || !joinAvatar)) {
        maybeResolveViewerIdentity(uid);
      }
      // So new spectators get current co-host layout
      if (isBroadcastRef.current && effectiveStreamId && user?.id) {
        const list = coHostsRef.current.map((h) => ({ id: h.id, userId: h.userId, name: h.name, avatar: h.avatar, status: h.status }));
        cohostLayoutSync({ roomId: effectiveStreamId, coHosts: list, hostUserId: user.id });
      }
    };

    const handleUserLeft = (data) => {
      if (!mounted) return;
      const leftId = data.user_id != null ? String(data.user_id) : '';
      // Keep leftId in joinAnnouncedRef so leave/rejoin does not show the banner again this live.
      setActiveViewers(prev => prev.filter(v => String(v.id) !== leftId));
      setViewerCount(prev => Math.max(0, prev - 1));
      if (!leftId) return;
      // During battle: do NOT exit locally on user_left. Server keeps a reconnect
      // grace window, then emits battle_ended — that is what returns us to normal live.
      // Clearing accepted battle slots here would flash empty panes on a brief blip.
      if (isBattleModeRef.current) {
        return;
      }
      setCoHosts(prev => prev.filter(h => !sameUserId(h.userId, leftId)));
      setBattleSlots(prev => prev.map(s =>
        sameUserId(s.userId, leftId) ? { userId: '', name: '', status: 'empty' as const, avatar: '' } : s
      ));
    };

    const handleChatMessage = (data) => {
      if (!mounted) return;
      if (data.user_id === user?.id) return;
      // Server may deliver the same message twice (room broadcast + owner-global
      // fallback). Dedupe by messageId so the creator never sees a line twice.
      const chatMsgId = typeof data.messageId === 'string' ? data.messageId : '';
      if (chatMsgId) {
        if (seenChatMsgIdRef.current.has(chatMsgId)) return;
        seenChatMsgIdRef.current.add(chatMsgId);
        if (seenChatMsgIdRef.current.size > 400) {
          seenChatMsgIdRef.current = new Set([...seenChatMsgIdRef.current].slice(-200));
        }
      }
      const text = typeof data.text === 'string' ? data.text : '';
      const levelUpMatch = /^reached Level (\d+)/i.exec(text);
      const parsedLevel = levelUpMatch ? Number(levelUpMatch[1]) : NaN;
      const uid = typeof data.user_id === 'string' ? data.user_id : '';
      const cached = uid ? viewerIdentityCacheRef.current.get(uid) : undefined;
      const username =
        (typeof data.username === 'string' && data.username.trim()) ||
        cached?.displayName ||
        cached?.username ||
        'User';
      const avatar =
        (typeof data.avatar === 'string' && data.avatar.trim()) ||
        (typeof data.avatar_url === 'string' && data.avatar_url.trim()) ||
        cached?.avatar ||
        '';
      if (uid) {
        viewerIdentityCacheRef.current.set(uid, {
          username,
          displayName: username,
          avatar: avatar || cached?.avatar || '',
          level:
            Number.isFinite(Number(data.level)) && Number(data.level) >= 0
              ? Math.floor(Number(data.level))
              : cached?.level || 1,
        });
        if (!avatar || avatar.includes('/royce/default-avatar')) {
          maybeResolveViewerIdentity(uid);
        }
      }
      const isMembershipJoin = /joined the team/i.test(text);
      const msg: LiveMessage = {
        id: `ws-${Date.now()}-${Math.random()}`,
        username,
        text: isMembershipJoin ? 'Joined the team!' : text,
        level: Number.isFinite(parsedLevel)
          ? parsedLevel
          : Number.isFinite(Number(data.level)) && Number(data.level) >= 0
            ? Math.floor(Number(data.level))
            : cached?.level || 1,
        avatar,
        stickerUrl: typeof data.stickerUrl === 'string' ? data.stickerUrl : undefined,
        isSystem: !!levelUpMatch || isMembershipJoin,
        membershipIcon: isMembershipJoin ? 'heart' : undefined,
      };
      setMessages(prev => appendCapped(prev, msg, LIVE_CHAT_MESSAGE_CAP));
    };

    const handleGiftSent = (data) => {
      if (!mounted) return;
      const txnId =
        (typeof data.transactionId === 'string' && data.transactionId) ||
        (typeof data.transaction_id === 'string' && data.transaction_id) ||
        '';
      const wsGiftId =
        (typeof data.giftId === 'string' && data.giftId) ||
        (typeof data.gift_id === 'string' && data.gift_id) ||
        '';
      const alreadySeen = !!(txnId && seenGiftTxnRef.current.has(txnId));
      const videoAlreadyPlayed = !!(txnId && playedGiftVideoTxnRef.current.has(txnId));

      // Skip only when this transaction's video already played — not when the first
      // payload lacked a URL (REST/WS can deliver metadata before the playable URL).
      if (alreadySeen && videoAlreadyPlayed) return;

      if (txnId && !alreadySeen) {
        seenGiftTxnRef.current.add(txnId);
        if (seenGiftTxnRef.current.size > 200) {
          const keep = [...seenGiftTxnRef.current].slice(-100);
          seenGiftTxnRef.current = new Set(keep);
        }
      }

      const giftDef = wsGiftId
        ? giftsCatalogRef.current.find((g) => g.id === wsGiftId)
        : undefined;
      const gifterId = typeof data.user_id === 'string' ? data.user_id : '';
      const giftCoins =
        giftDef?.coins ??
        (typeof data.coins === 'number' && Number.isFinite(data.coins) ? data.coins : 0);

      // Chat / MVP only on first delivery of this transaction.
      if (!alreadySeen) {
        if (gifterId && giftCoins > 0) {
          const gifterName =
            (typeof data.username === 'string' && data.username.trim()) ||
            viewerIdentityCacheRef.current.get(gifterId)?.displayName ||
            viewerIdentityCacheRef.current.get(gifterId)?.username ||
            'User';
          const gifterAvatar =
            (typeof data.avatar === 'string' && data.avatar.trim()) ||
            (typeof data.avatar_url === 'string' && data.avatar_url.trim()) ||
            viewerIdentityCacheRef.current.get(gifterId)?.avatar ||
            '';
          const gifterLevel =
            (Number.isFinite(Number(data.level)) && Number(data.level) >= 0 ? Math.floor(Number(data.level)) : null) ??
            viewerIdentityCacheRef.current.get(gifterId)?.level ??
            1;
          viewerIdentityCacheRef.current.set(gifterId, {
            username: gifterName,
            displayName: gifterName,
            avatar: gifterAvatar,
            level: gifterLevel,
          });
          if (!gifterAvatar) maybeResolveViewerIdentity(gifterId);
          setMvpGiftScores((prev) => ({
            ...prev,
            [gifterId]: (prev[gifterId] || 0) + giftCoins,
          }));
          if (isBattleModeRef.current) {
            const side = normalizeBattleGiftTarget(data.battleTarget);
            if (side === 'host') {
              setMvpGiftScoresHost((prev) => ({
                ...prev,
                [gifterId]: (prev[gifterId] || 0) + giftCoins,
              }));
            } else if (side === 'opponent') {
              setMvpGiftScoresOpponent((prev) => ({
                ...prev,
                [gifterId]: (prev[gifterId] || 0) + giftCoins,
              }));
            }
          }
        }
        const giftName = formatGiftDisplayName(
          giftDef?.name ||
          (typeof data.giftName === 'string' && data.giftName.trim()) ||
          (typeof data.gift_name === 'string' && data.gift_name.trim()) ||
          'Gift',
        );
        if (isBattleModeRef.current) {
          const flowerKey = giftName.toLowerCase();
          if (flowerKey.includes('rose') || flowerKey.includes('flower')) {
            roseCountRef.current += 1;
            setRoseCount(roseCountRef.current);
          }
        }
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
        setMessages((prev) => appendCapped(prev, msg, LIVE_CHAT_MESSAGE_CAP));
        if (isBattleModeRef.current) {
          const iconRaw =
            (typeof data.gift_icon === 'string' && data.gift_icon) ||
            (typeof giftDef?.icon === 'string' ? giftDef.icon : '');
          const iconUrl =
            iconRaw && (iconRaw.startsWith('http://') || iconRaw.startsWith('https://') || iconRaw.startsWith('/'))
              ? (iconRaw.startsWith('http') ? iconRaw : resolveGiftAssetUrl(iconRaw.startsWith('/') ? iconRaw : `/${iconRaw}`))
              : null;
          const target = data.battleTarget;
          const side = normalizeBattleGiftTarget(target);
          if (iconUrl) {
            setLastGifts((prev) => {
              if (target === 'player3') return { ...prev, player3: iconUrl, host: iconUrl };
              if (target === 'player4') return { ...prev, player4: iconUrl, opponent: iconUrl };
              if (side === 'host' || target === 'host' || target === 'me') return { ...prev, host: iconUrl };
              if (side === 'opponent' || target === 'opponent') return { ...prev, opponent: iconUrl };
              return prev;
            });
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

      // Creator must play spectator gift videos. Skip only our own echo
      // (sender already queued locally).
      const selfId = selfUserIdRef.current;
      const isOwnGift = !!(gifterId && selfId && gifterId === selfId);
      if (isOwnGift) return;

      // Battle: each creator only plays big gift video for gifts sent to their side.
      // The other side stays as the small tile icon (lastGifts) — never fullscreen.
      const giftSide = isBattleModeRef.current
        ? normalizeBattleGiftTarget(data.battleTarget)
        : null;
      if (
        isBattleModeRef.current &&
        battleStateRef.current === 'IN_BATTLE'
      ) {
        const myRole =
          battleRoleRef.current ||
          (isBroadcast ? 'host' : isBattleJoiner ? 'opponent' : null);
        if (giftSide && myRole && giftSide !== myRole) return;
      }

      // Spectator already played from local catalog; creator must resolve from
      // WS payload and/or catalog. If catalog is still loading, retry once.
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

      const enqueueCreatorGiftVideo = (url: string) => {
        if (!url) return;
        if (txnId) {
          if (playedGiftVideoTxnRef.current.has(txnId)) return;
          playedGiftVideoTxnRef.current.add(txnId);
          if (playedGiftVideoTxnRef.current.size > 200) {
            const keep = [...playedGiftVideoTxnRef.current].slice(-100);
            playedGiftVideoTxnRef.current = new Set(keep);
          }
        }
        enqueueGiftVideoRef.current(url, giftSide);
      };

      const playUrl = resolvePlayUrl(giftsCatalogRef.current);
      if (playUrl) {
        enqueueCreatorGiftVideo(playUrl);
        return;
      }

      if (!wsGiftId) return;
      void fetchGiftsFromDatabase().then((gifts) => {
        if (!mounted) return;
        if (txnId && playedGiftVideoTxnRef.current.has(txnId)) return;
        if (gifts.length) {
          giftsCatalogRef.current = gifts;
          setGiftsCatalog(gifts);
        }
        const retryUrl = resolvePlayUrl(giftsCatalogRef.current);
        if (retryUrl) enqueueCreatorGiftVideo(retryUrl);
      });
    };

    // Server-controlled battle events — single source of truth
    const applyBattleScores = (data) => {
      const pick = (v: unknown, fallback: number) => {
        if (v === undefined || v === null) return fallback;
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
      };
      const prevS = battleServerTotalsRef.current;
      const nextS = {
        h: pick(data.hostScore ?? data.host_score, prevS.h),
        o: pick(data.opponentScore ?? data.opponent_score, prevS.o),
        p3: pick(data.player3Score ?? data.player3_score, prevS.p3),
        p4: pick(data.player4Score ?? data.player4_score, prevS.p4),
      };
      const redDelta = (nextS.h - prevS.h) + (nextS.p3 - prevS.p3);
      const blueDelta = (nextS.o - prevS.o) + (nextS.p4 - prevS.p4);
      battleServerTotalsRef.current = nextS;
      setBattleServerTotals(nextS);
      setPlayer3Score(nextS.p3);
      setPlayer4Score(nextS.p4);

      if (redDelta > blueDelta && redDelta > 0) triggerBattleVfx('red', redDelta);
      else if (blueDelta > 0) triggerBattleVfx('blue', blueDelta);

      const redTotal = nextS.h + nextS.p3;
      const blueTotal = nextS.o + nextS.p4;
      const prevRedTotal = prevS.h + prevS.p3;
      const prevBlueTotal = prevS.o + prevS.p4;
      if (redTotal > blueTotal && redTotal - prevRedTotal >= 25) {
        maybeTauntLeadChange('host', redTotal - prevRedTotal);
        pushBattleTaunt(createTauntBurst('opponent', 'lead'));
      } else if (blueTotal > redTotal && blueTotal - prevBlueTotal >= 25) {
        maybeTauntLeadChange('opponent', blueTotal - prevBlueTotal);
        pushBattleTaunt(createTauntBurst('host', 'lead'));
      }

      const hostScore = nextS.h;
      const oppScore = nextS.o;

      const selfId = user?.id || '';
      const payloadHostId = typeof data.hostUserId === 'string' ? data.hostUserId : '';
      const payloadOpponentId = typeof data.opponentUserId === 'string' ? data.opponentUserId : '';
      if (selfId && payloadHostId && selfId === payloadHostId) battleRoleRef.current = 'host';
      else if (selfId && payloadOpponentId && selfId === payloadOpponentId) battleRoleRef.current = 'opponent';

      const role = battleRoleRef.current || (isBattleJoiner ? 'opponent' : (isBroadcast ? 'host' : 'host'));
      
      if (role === 'opponent') {
        setMyScore(oppScore);
        setOpponentScore(hostScore);
      } else {
        setMyScore(hostScore);
        setOpponentScore(oppScore);
      }
      setBattleUiRole(role);
    };

    const handleBattleStateSync = (data) => {
      if (!mounted) return;
      const syncStatus = typeof data.status === 'string' ? data.status : '';
      if (syncStatus === 'ACTIVE' && prevBattleSyncStatusRef.current !== 'ACTIVE') {
        battleTapScoreRemainingRef.current = 5;
        // New match — everyone gets their single +5 tap again.
        spectatorTapPointsRef.current = 0;
        setSpectatorTapsUsed(0);
      }
      prevBattleSyncStatusRef.current = syncStatus || null;
      battleStreamIdsRef.current = {
        hostRoomId: typeof data.hostRoomId === 'string' ? data.hostRoomId : '',
        hostUserId: typeof data.hostUserId === 'string' ? data.hostUserId : '',
        opponentRoomId: typeof data.opponentRoomId === 'string' ? data.opponentRoomId : '',
        opponentUserId: typeof data.opponentUserId === 'string' ? data.opponentUserId : '',
        player3UserId: typeof data.player3UserId === 'string' ? data.player3UserId : '',
        player4UserId: typeof data.player4UserId === 'string' ? data.player4UserId : '',
      };
      const selfId = user?.id || '';
      if (selfId && typeof data.hostUserId === 'string' && data.hostUserId === selfId) battleRoleRef.current = 'host';
      else if (selfId && typeof data.opponentUserId === 'string' && data.opponentUserId === selfId) battleRoleRef.current = 'opponent';
      else if (effectiveStreamId && typeof data.hostRoomId === 'string' && data.hostRoomId === effectiveStreamId) battleRoleRef.current = 'host';
      else if (effectiveStreamId && typeof data.opponentRoomId === 'string' && data.opponentRoomId === effectiveStreamId) battleRoleRef.current = 'opponent';

      if (data.status === 'WAITING') {
        setIsBattleMode(true);
        setBattleState('INVITING');
      } else if (data.status === 'COUNTDOWN') {
        setIsBattleMode(true);
        setBattleState('INVITING');
        setBattleCountdown(null);
      } else if (data.status === 'ACTIVE') {
        setIsBattleMode(true);
        setBattleState('IN_BATTLE');
        setBattleCountdown(null);
      } else if (data.status === 'ENDED') {
        setBattleState('ENDED');
      }
      applyBattleScores(data);
      setBattleTime(data.timeLeft ?? 300);
      if (data.hostReady != null) setHostIsReady(!!data.hostReady);
      if (data.opponentReady != null) setOpponentIsReady(!!data.opponentReady);
      // Host receives battle opponent video in own LiveKit room — never second-room connect.
      if (!isBattleJoiner) {
        setOpponentStreamKey(null);
      }
      
      setBattleSlots(prev => {
        const next = [...prev];
        const seenIds = new Set<string>();
        // Preserve the avatar we already resolved locally when the sync (which
        // carries no avatars) re-confirms the same user in the same pane.
        const keepAvatar = (slotIdx: number, userId: string) =>
          userId && prev[slotIdx]?.userId === userId ? prev[slotIdx].avatar : '';

        // Pane 2 always shows the OTHER main creator: the opponent on the
        // host's screen, the HOST on the battle joiner's screen. Both creators
        // get the identical split battle layout — never self in a pane.
        const selfIsOpponent =
          !!selfId && typeof data.opponentUserId === 'string' && !!data.opponentUserId && data.opponentUserId === selfId;
        const paneUserId = selfIsOpponent
          ? (typeof data.hostUserId === 'string' ? data.hostUserId : '')
          : (typeof data.opponentUserId === 'string' ? data.opponentUserId : '');
        const paneName = selfIsOpponent
          ? (typeof data.hostName === 'string' ? data.hostName : '')
          : (typeof data.opponentName === 'string' ? data.opponentName : '');
        if (paneName) {
          next[0] = { userId: paneUserId || '', name: paneName, status: 'accepted', avatar: keepAvatar(0, paneUserId || '') };
          if (paneUserId) seenIds.add(paneUserId);
        } else if (!paneUserId) {
          // Opponent dropped mid-match — keep pane on reconnecting, not "Add creator".
          if (!isBattleJoiner && prev[0]?.status === 'accepted' && prev[0]?.userId) {
            next[0] = { ...prev[0] };
            setHasOpponentStream(false);
          } else if (!isBattleJoiner) {
            next[0] = { userId: '', name: '', status: 'empty', avatar: '' };
            setHasOpponentStream(false);
          }
        }
        if (selfId) seenIds.add(selfId);

        // Player 3
        if (data.player3Name && data.player3UserId && !seenIds.has(data.player3UserId)) {
          next[1] = { userId: data.player3UserId || '', name: data.player3Name, status: 'accepted', avatar: keepAvatar(1, data.player3UserId) };
          seenIds.add(data.player3UserId);
        } else {
          next[1] = { userId: '', name: '', status: 'empty', avatar: '' };
        }

        // Player 4
        if (data.player4Name && data.player4UserId && !seenIds.has(data.player4UserId)) {
          next[2] = { userId: data.player4UserId || '', name: data.player4Name, status: 'accepted', avatar: keepAvatar(2, data.player4UserId) };
        } else {
          next[2] = { userId: '', name: '', status: 'empty', avatar: '' };
        }
        return next;
      });
    };

    const handleBattleScore = (data) => {
      if (!mounted) return;
      applyBattleScores(data);
    };

    const handleBattleEnded = (data) => {
      if (!mounted) return;
      if (battleEndedTimeoutRef.current) {
        clearTimeout(battleEndedTimeoutRef.current);
        battleEndedTimeoutRef.current = null;
      }
      setBattleState('ENDED');
      applyBattleScores(data);
      const winner = data.winner;
      const role = battleRoleRef.current || (isBattleJoiner ? 'opponent' : (isBroadcast ? 'host' : null));
      // Server endBattle: winner is red team (host) vs blue (opponent) or draw — not individual P3/P4.
      setBattleWinner(normalizeBattleWinner(winner, role));
      const teamWinner =
        winner === 'host' || winner === 'opponent' || winner === 'draw' ? winner : 'draw';
      setBattleTeamWinner(teamWinner);
      if (!battleStreakCountedForEndRef.current) {
        battleStreakCountedForEndRef.current = true;
        setBattleWinStreak((prev) => applyBattleWinStreak(prev, teamWinner));
      }
      if (winner === 'host') {
        playBattleTauntSound('win');
        pushBattleTaunt(createTauntBurst('host', 'win'));
      } else if (winner === 'opponent') {
        playBattleTauntSound('win');
        pushBattleTaunt(createTauntBurst('opponent', 'win'));
      }
      battleEndedTimeoutRef.current = setTimeout(() => {
        battleEndedTimeoutRef.current = null;
        if (!mounted) return;
        endBattleCleanup();
        // After the result shows, the opponent returns to their own live page and
        // stays live; the host remains on their own room and continues live solo.
        if (isBattleJoiner) navigate('/live/broadcast', { replace: true });
      }, 2000);
    };

    const handleHeartSent = (data) => {
      if (!mounted) return;
      if (typeof data.live_likes === 'number' && Number.isFinite(data.live_likes)) {
        setLiveLikes((prev) => Math.max(prev, Math.max(0, data.live_likes)));
      } else if (data.user_id !== user?.id) {
        addLiveLikes(1);
      }
      if (data.user_id === user?.id) return;
      const layer = chatHeartLayerRef.current;
      if (layer && layer.clientWidth > 0 && layer.clientHeight > 0) {
        const w = layer.clientWidth;
        const h = layer.clientHeight;
        const x = w * (0.58 + Math.random() * 0.35);
        const y = h * (0.18 + Math.random() * 0.58);
        spawnHeartAt(x, y, undefined, data.username, data.avatar);
      }
    };

    const handleGiftGoalSync = (data: unknown) => {
      if (!mounted) return;
      if (data == null) {
        setGiftGoal(null);
        return;
      }
      const parsed = parseLiveGiftGoal(data);
      if (parsed) {
        setGiftGoal((prev) => {
          const wasDone = prev ? isGiftGoalComplete(prev) : false;
          if (!wasDone && isGiftGoalComplete(parsed)) {
            playGiftGoalReachedSound();
          }
          return parsed;
        });
      }
    };

    const unbindRoomWs = bindLiveRoomWs({
      onRoomState: handleRoomState,
      onUserJoined: handleUserJoined,
      onUserLeft: handleUserLeft,
      onChatMessage: handleChatMessage,
      onGiftSent: handleGiftSent,
      onGiftGoalSync: handleGiftGoalSync,
      onHeartSent: handleHeartSent,
    });
    const handleBoosterActivated = (data: unknown) => {
      const d = data as { multiplier?: number; username?: string; user_id?: string; expires_at?: number; duration_ms?: number };
      const id = `${Date.now()}-${Math.random()}`;
      const userId = String(d?.user_id || '');
      // The glove stays on screen for the full server-authoritative active window
      // (default 30s) so viewers can see it is live and catching gifts — not a 1.8s flash.
      const expiresAt = Number(d?.expires_at) || (Date.now() + (Number(d?.duration_ms) || 30000));
      setBoosterActivations((prev) => [...prev, { id, userId, multiplier: Number(d?.multiplier) || 0, username: String(d?.username || ''), expiresAt }]);
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

    // Server is the authority on remaining battle time (processBattleTick, 1 Hz).
    // Sync the local countdown to it every tick so a throttled/backgrounded
    // webview timer self-corrects instead of drifting. Scores keep flowing via
    // battle_score, so the tick only touches time (no duplicate score/VFX).
    const handleBattleTick = (data: { timeLeft?: number }) => {
      const t = applyBattleTickTime(data?.timeLeft);
      if (t != null) setBattleTime(t);
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

    // Battle & Co-Host invite / request signalling over WebSocket
    const handleBattleInvite = (data) => {
      if (!user?.id) return;
      setPendingInvite({
        hostName: data.hostName || 'Creator',
        hostAvatar: data.hostAvatar || '',
        streamKey: data.streamKey || effectiveStreamId,
        hostUserId: data.hostUserId,
      });
      // A battle invite kills any pending co-host invite: the two banners look
      // identical, and tapping the co-host Join would send this creator to the
      // spectator page instead of into the battle.
      setPendingCohostInvite(null);
      // Invite arrives → Creators panel comes up with Reject / Join.
      setShowViewerList(false);
      setShowGiftPanel(false);
      setShowSharePanel(false);
      setShowRankingPanel(false);
      setShowFanClub(false);
      setIsFindCreatorsOpen(true);
    };

    const handleBattleInviteAccepted = (data) => {
      // Host and battle-playing creators all update slots when someone joins.
      if (!isBroadcast && !isBattleJoiner) return;
      const requesterId = data.requesterUserId as string | undefined;
      const requesterName = data.requesterName as string | undefined;
      const requesterAvatar = data.requesterAvatar as string | undefined;
      if (!requesterId || !requesterName) return;
      clearBattleInviteTimer(requesterId);
      // Invite accepted → bottom panel comes down alone; battle screen stays up.
      setIsFindCreatorsOpen(false);
      setShowViewerList(false);
      setShowGiftPanel(false);
      setShowSharePanel(false);
      setShowRankingPanel(false);
      setShowFanClub(false);
      setHasOpponentStream(false);
      setIsBattleMode(true);
      setBattleState('INVITING');
      setOpponentCreatorName(requesterName);
      // Opponent publishes into this host room after accept — do not chase solo stream key.
      setOpponentStreamKey(null);
      setBattleSlots(prev => {
        const next = [...prev];
        const existingIdx = next.findIndex((s) => s.userId === requesterId);
        if (existingIdx !== -1) {
          next[existingIdx] = {
            userId: requesterId,
            name: requesterName,
            status: 'accepted',
            avatar: requesterAvatar || next[existingIdx].avatar,
          };
        } else {
          const emptyIdx = next.findIndex((s) => s.status === 'empty');
          if (emptyIdx !== -1) {
            next[emptyIdx] = {
              userId: requesterId,
              name: requesterName,
              status: 'accepted',
              avatar: requesterAvatar || '',
            };
          }
        }
        return next;
      });
      // Do NOT battle_create here — each accept used to wipe the previous
      // creator. Host taps Start Match once every accepted creator is ready.
    };

    const handleBattleInviteAck = (data: { targetUserId?: string; delivered?: boolean }) => {
      if (!mounted) return;
      const tid = typeof data?.targetUserId === 'string' ? data.targetUserId : '';
      if (!tid || data?.delivered !== false) return;
      clearInvitedBattleSlot(tid);
      showToast('Creator is not available for battle');
    };

    const handleBattleInviteDeclined = (data: { userId?: string }) => {
      if (!mounted) return;
      if (!isBroadcast && !isBattleJoiner) return;
      const uid = typeof data?.userId === 'string' ? data.userId : '';
      if (!uid) return;
      clearInvitedBattleSlot(uid);
    };

    const handleCohostRequest = (data) => {
      if (!isBroadcast) return;
      setPendingJoinRequest({
        requesterId: data.requesterUserId,
        requesterName: data.requesterName,
        requesterAvatar: data.requesterAvatar || '',
        type: 'cohost',
      });
      // Show Accept/Reject only in Join requests & Spectators panel (no center modal).
      setShowGiftPanel(false);
      setShowSharePanel(false);
      setIsFindCreatorsOpen(false);
      setViewerListMode('spectators');
      setShowViewerList(true);
      showToast(`@${data.requesterName || 'User'} requested to co-host — tap Join or Reject`);
    };

    const handleCohostRequestAccepted = (data) => {
      if (!user?.id) return;
      const streamKey = data.streamKey || effectiveStreamId;
      if (streamKey) {
        navigate(`/watch/${streamKey}?cohost=1`, { state: { fromCohostInvite: true } });
      }
    };

    const handleCohostInvite = (data) => {
      if (!user?.id) return;
      if (sameUserId(data.hostUserId, user.id)) return;
      // In battle mode co-host invites are never shown: accepting one would
      // route this creator to the spectator page mid-battle.
      if (isBattleModeRef.current) return;
      setPendingCohostInvite({
        hostName: data.hostName || 'Creator',
        hostAvatar: data.hostAvatar || '',
        streamKey: data.streamKey || '',
        hostUserId: data.hostUserId || '',
      });
      // Invite arrives → bottom panel comes up with Join/Reject.
      setShowGiftPanel(false);
      setShowSharePanel(false);
      setIsFindCreatorsOpen(false);
      setViewerListMode('spectators');
      setShowViewerList(true);
      showToast(`@${data.hostName || 'Creator'} wants you to co-host — tap Join or Reject`);
    };

    const handleCohostInviteAck = (data) => {
      if (!mounted) return;
      if (data?.delivered === false) {
        const tid = typeof data?.targetUserId === 'string' ? data.targetUserId : '';
        if (tid) {
          setCoHosts((prev) => prev.filter((h) => !(sameUserId(h.userId, tid) && h.status === 'invited')));
        }
      }
    };

    const handleCohostInviteAccepted = (data) => {
      if (!mounted) return;
      const cohostUserId = typeof data.cohostUserId === 'string' ? data.cohostUserId : '';
      if (!cohostUserId) return;
      if (isBroadcast && sameUserId(cohostUserId, user?.id)) return;
      const accepterStreamKey = typeof data.streamKey === 'string' ? data.streamKey : '';
      setCoHosts((prev) => {
        const idx = prev.findIndex(
          (h) =>
            sameUserId(h.userId, cohostUserId) ||
            (accepterStreamKey && sameUserId(h.userId, accepterStreamKey)),
        );
        if (idx !== -1) {
          return prev.map((h, i) =>
            i === idx ? { ...h, userId: cohostUserId, status: 'live' as const } : h,
          );
        }
        return [
          ...prev,
          {
            id: `host-${Date.now()}`,
            userId: cohostUserId,
            name: data.cohostName || 'Co-host',
            avatar: data.cohostAvatar || '',
            status: 'live' as const,
            isMuted: false,
          },
        ];
      });
    };

    const unbindBattleInviteWs = bindLiveBattleInviteWs({
      onInvite: handleBattleInvite,
      onInviteAck: handleBattleInviteAck,
      onInviteDeclined: handleBattleInviteDeclined,
      onInviteAccepted: handleBattleInviteAccepted,
    });
    const unbindCohostWs = bindLiveCohostWs({
      onInvite: handleCohostInvite,
      onInviteAck: handleCohostInviteAck,
      onInviteAccepted: handleCohostInviteAccepted,
      onRequest: handleCohostRequest,
      onRequestAccepted: handleCohostRequestAccepted,
    });

    const handleModerationWarning = (data: { message?: string }) => {
      if (!mounted) return;
      setModerationWarningMessage(data?.message || 'Your stream may violate our safety guidelines. Please avoid dangerous or illegal activity.');
      setShowModerationWarning(true);
    };
    const handleModerationPause = (data: { message?: string }) => {
      if (!mounted) return;
      showToast(data?.message || 'Stream paused for safety. Please review our community guidelines.');
      navigate(-1);
    };
    const handleModerationSuspend = (data: { message?: string }) => {
      if (!mounted) return;
      showToast(data?.message || 'Your account is under review. Contact support if you have questions.');
      navigate('/');
    };
    const unbindModerationWs = bindLiveModerationWs({
      onWarning: handleModerationWarning,
      onPause: handleModerationPause,
      onSuspend: handleModerationSuspend,
    });

    connect();

    return () => {
      mounted = false;
      if (battleEndedTimeoutRef.current) {
        clearTimeout(battleEndedTimeoutRef.current);
        battleEndedTimeoutRef.current = null;
      }
      unbindRoomWs();
      unbindBattleWs();
      unbindBattleInviteWs();
      unbindCohostWs();
      unbindModerationWs();
      joinAnnouncedRef.current.clear();
      // Do NOT disconnect here — unstable handler deps were dropping the host WS
      // mid-battle and server treated that as "host left" → stream_ended.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStreamId, user?.id]);

  // Disconnect WS only when leaving the LiveStream page entirely.
  useEffect(() => {
    return () => {
      websocket.disconnect();
    };
  }, []);

  // AI moderation: periodic frame check when broadcasting (flag + assist, all actions logged)
  const moderationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!isBroadcast || !user?.id || !effectiveStreamId) return;

    const captureFrame = (): string | null => {
      const video = videoRef.current;
      if (!video?.srcObject || video.readyState < 2) return null;
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return null;
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(w, 640);
        canvas.height = Math.min(h, (640 * h) / w);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const base64 = dataUrl.split(',')[1];
        return base64 || null;
      } catch {
        return null;
      }
    };

    const runCheck = async () => {
      const base64 = captureFrame();
      if (!base64) return;
      try {
        if (!useAuthStore.getState().session?.access_token) return;
        const { data: json, error: modErr } = await apiLiveModerationCheck({
          stream_key: effectiveStreamId,
          image_base64: base64,
        });
        if (modErr || !json) return;
        const action = typeof json?.action === 'string' ? json.action : '';
        const message = typeof json?.message === 'string' ? json.message : '';
        if (action === 'warning') {
          setModerationWarningMessage(message);
          setShowModerationWarning(true);
        } else if (action === 'pause') {
          showToast(message);
          navigate(-1);
        } else if (action === 'suspend') {
          showToast(message);
          navigate('/');
        }
      } catch {
        // ignore
      }
    };

    moderationIntervalRef.current = setInterval(runCheck, 30000);

    return () => {
      if (moderationIntervalRef.current) {
        clearInterval(moderationIntervalRef.current);
        moderationIntervalRef.current = null;
      }
    };
  }, [isBroadcast, user?.id, effectiveStreamId, navigate]);

  const [_giftBanner, _setGiftBanner] = useState<{ username: string; giftName: string; icon: string } | null>(null);
  const _giftBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSentGift, setLastSentGift] = useState<GiftUiItem | null>(null);
  const [userLevel, setUserLevel] = useState(() => Math.max(1, Number(user?.level) || 0));


  const [userXP, setUserXP] = useState(0);
  const [comboCount, setComboCount] = useState(0);
  const [showComboButton, setShowComboButton] = useState(false);
  const [comboStack, setComboStack] = useState<{ key: string; icon: string; count: number; gift: GiftUiItem }[]>([]);
  const [missionWatchMin, setMissionWatchMin] = useState(0);
  const [missionGiftsSent, setMissionGiftsSent] = useState(0);
  const [missionWatchGoal, setMissionWatchGoal] = useState(10);
  const [missionGiftsGoal, setMissionGiftsGoal] = useState(10);
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
  // Host also reports watch progress server-side (same contract as spectator).
  useEffect(() => {
    if (!isBroadcast || !effectiveStreamId) return;
    const roomId = effectiveStreamId;
    const id = window.setInterval(() => {
      setMissionWatchMin((m) => Math.min(missionWatchGoal, m + 1));
      earnBattleEnergyQuiet('watch', roomId);
      void apiLiveEngagementProgress({
        metric: 'watch_minutes',
        delta: 1,
        roomId,
      }).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(id);
  }, [isBroadcast, effectiveStreamId, missionWatchGoal]);
  useEffect(() => {
    if (!isBattleMode || !effectiveStreamId) return;
    void apiLiveEngagementProgress({
      metric: 'battles_joined',
      delta: 1,
      roomId: effectiveStreamId,
    }).catch(() => {});
  }, [isBattleMode, effectiveStreamId]);
  const sideMissions = {
        watchMin: missionWatchMin,
        watchGoal: missionWatchGoal,
        giftsSent: missionGiftsSent,
        giftsGoal: missionGiftsGoal,
        battleJoined: isBattleMode ? 1 : 0,
        battleGoal: 1,
        claimable: false as const,
      };
  const sideSupporters = useMemo(() => {
    if (topGifters.length > 0) {
      return topGifters.slice(0, 3).map((g) => ({
        id: g.user_id,
        name: g.username || 'Supporter',
        avatar: g.avatar_url || '',
        points: g.total_coins,
      }));
    }
    const fromMvp = topMvpViewers.slice(0, 3).map((v) => ({
      id: v.id,
      name: v.displayName || v.username || '',
      avatar: v.avatar || '',
      points: mvpGiftScores[v.id] ?? 0,
    }));
    return fromMvp.length > 0 ? fromMvp : [];
  }, [topGifters, topMvpViewers, mvpGiftScores]);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushComboStack = useCallback((gift: GiftUiItem, nextCount: number) => {
    const key = String(gift.id || gift.name || 'gift');
    setComboStack((prev) => {
      const without = prev.filter((i) => i.key !== key);
      return [...without, { key, icon: typeof gift.icon === 'string' ? gift.icon : '', count: nextCount, gift }].slice(-3);
    });
  }, []);
  const [activeFaceARGift, setActiveFaceARGift] = useState<
    | { type: 'crown' | 'glasses' | 'mask' | 'ears' | 'hearts' | 'stars' | 'age' | 'youth'; color?: string }
    | null
  >(null);
  const liveFilterBeforeFaceGiftRef = useRef<string>('none');

  const maybeTriggerFaceARGift = (gift: GiftUiItem) => {
    const mapping: Record<string, { type: 'crown' | 'glasses' | 'mask' | 'ears' | 'hearts' | 'stars' | 'age' | 'youth'; color?: string } | undefined> = {
      face_ar_crown: { type: 'crown', color: '#FFD700' },
      face_ar_glasses: { type: 'glasses', color: '#00D4FF' },
      face_ar_hearts: { type: 'hearts', color: '#FF3B7A' },
      face_ar_mask: { type: 'mask', color: '#9B59B6' },
      face_ar_ears: { type: 'ears', color: '#FFB6C1' },
      face_ar_stars: { type: 'stars', color: '#F59E0B' },
    };

    const next = mapping[gift.id];
    if (!next) return;
    liveFilterBeforeFaceGiftRef.current = liveFilterCss;
    if (next.type === 'age') {
      setLiveFilterCss('sepia(0.38) saturate(0.72) contrast(1.1) brightness(0.9)');
    } else if (next.type === 'youth') {
      setLiveFilterCss('brightness(1.12) contrast(0.88) saturate(1.22) blur(0.35px)');
    }
    setActiveFaceARGift(next);
  };

  const clearActiveFaceARGift = useCallback(() => {
    setActiveFaceARGift(null);
    setLiveFilterCss(liveFilterBeforeFaceGiftRef.current);
  }, []);

  useEffect(() => {
    if (giftQueue.length > 0 && !currentGift) {
      setCurrentGift(giftQueue[0]);
      setGiftKey((k) => k + 1);
      setGiftQueue((prev) => prev.slice(1));
    }
  }, [giftQueue, currentGift]);

  const handleGiftEnded = useCallback(() => {
    setCurrentGift(null);
  }, []);

  const handleSendGift = async (gift: GiftUiItem) => {
    // Creators normally don't gift on their own live; exception: gifting a selected co-host tile.
    if (!gift) return;
    if (isCreatorParticipant && (!selectedCohostGiftUserId || isBattleMode)) return;

    // Host never uses test coins — always real wallet / starter / promo.
    const spendable =
      giftSource === 'starter_coins'
        ? starterCoinBalance
        : giftSource === 'promotional_coins'
          ? promotionalCoinBalance
          : walletCoinBalanceRef.current;
    if (spendable < gift.coins) {
      showToast(`Not enough coins (have ${spendable.toLocaleString()}, need ${gift.coins.toLocaleString()})`);
      return;
    }

    try {
      let newLevel = userLevel;
      let giftTransactionId: string | null = null;

      if (user?.id) {
        try {
          const idsForBattleGiftRest = battleStreamIdsRef.current;
          const restBattleTarget =
            isBattleMode
              ? liveStreamUiGiftTargetToServerBattleTarget(giftTarget, {
                  isBroadcast,
                  isBattleJoiner,
                  effectiveStreamId,
                  hostRoomId: idsForBattleGiftRest?.hostRoomId ?? '',
                  opponentRoomId: idsForBattleGiftRest?.opponentRoomId ?? '',
                })
              : undefined;
          const playableVideo =
            gift.video && gift.video.trim()
              ? preferPlayableGiftVideoUrl(
                  gift.video.startsWith('http://') || gift.video.startsWith('https://')
                    ? gift.video.trim()
                    : resolveGiftAssetUrl(gift.video.startsWith('/') ? gift.video : `/${gift.video}`),
                )
              : null;
          const paid = await sendLivePaidGift({
            streamKey: effectiveStreamId,
            giftId: gift.id,
            channel: 'host',
            giftSource,
            video: playableVideo,
            ...(restBattleTarget ? { battleTarget: restBattleTarget } : {}),
            ...(!isBattleMode && selectedCohostGiftUserId
              ? { cohostTargetUserId: selectedCohostGiftUserId }
              : {}),
          });
          const result = paid.result;
          if (!paid.ok || !result) {
            const msg = paid.errorToast || giftSendErrorToast('');
            if (msg.includes('co-host')) setSelectedCohostGiftUserId(null);
            showToast(msg);
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
            setCoinBalance(nextWallet);
          }
          if (result.newLevel != null) {
            const updatedLevel = Number(result.newLevel);
            setUserLevel(updatedLevel);
            updateUser({ level: updatedLevel });
            newLevel = updatedLevel;
          }
          if (result.totalXp != null) {
            setUserXP(Math.max(0, Number(result.totalXp) || 0));
          }
          if (result.leveledUp) {
            const levelBannerId = `levelup-${Date.now()}`;
            setMessages((prev) => appendCapped(prev, {
                id: levelBannerId,
                username: isBroadcast ? creatorName : viewerName,
                text: `reached Level ${newLevel}`,
                level: newLevel,
                isGift: false,
                avatar: isBroadcast ? myAvatar : viewerAvatar,
                isSystem: true,
              }, LIVE_CHAT_MESSAGE_CAP));
            liveChatSend( {
              text: `reached Level ${newLevel}`,
              level: newLevel,
              avatar: isBroadcast ? myAvatar : viewerAvatar,
            });
          }
          giftTransactionId = result.transactionId;
          if (!giftTransactionId) {
            showToast('Gift failed');
            return;
          }
        } catch {
          showToast('Gift failed');
          return;
        }
      } else {
        showToast('Please sign in to send gifts');
        return;
      }

      const idsForBattleGift = battleStreamIdsRef.current;
      const serverBattleTarget =
        isBattleMode
          ? liveStreamUiGiftTargetToServerBattleTarget(giftTarget, {
              isBroadcast,
              isBattleJoiner,
              effectiveStreamId,
              hostRoomId: idsForBattleGift?.hostRoomId ?? '',
              opponentRoomId: idsForBattleGift?.opponentRoomId ?? '',
            })
          : undefined;

      if (gift.video && gift.video.trim()) {
        const raw = gift.video;
        const ext = raw.split('?')[0].toLowerCase();
        const isVid = ext.endsWith('.mp4') || ext.endsWith('.webm') || ext.endsWith('.mov');
        if (isVid) {
          const videoUrl = preferPlayableGiftVideoUrl(
            (raw.startsWith('http://') || raw.startsWith('https://'))
              ? raw
              : resolveGiftAssetUrl(raw.startsWith('/') ? raw : `/${raw}`),
          );
          if (videoUrl) {
            const localBattleSide = isBattleMode
              ? normalizeBattleGiftTarget(serverBattleTarget)
              : null;
            setGiftQueue(prev => appendCapped(prev, { video: videoUrl, battleSide: localBattleSide }, LIVE_GIFT_QUEUE_CAP));
          }
        }
      }
      setShowGiftPanel(false);
      setMissionGiftsSent((n) => n + 1);
      setSessionContribution(prev => prev + gift.coins);

      maybeEnqueueUniverse(gift.name, viewerName);

      // Flower/rose → Speed unlock is counted once in gift_sent WS handler.

      if (isBroadcast && !isBattleMode) {
        maybeTriggerFaceARGift(gift);
      }
      
      // Add to chat
      const giftMsg: LiveMessage = {
          id: Date.now().toString(),
          username: isBroadcast ? creatorName : viewerName,
          text: `Sent a ${gift.name}`,
          isGift: true,
          level: newLevel,
          avatar: isBroadcast ? myAvatar : viewerAvatar,
      };
      setMessages(prev => appendCapped(prev, giftMsg, LIVE_CHAT_MESSAGE_CAP));

      // Paid gifts: server already broadcasts gift_sent.

      // Handle Combo Logic
      setLastSentGift(gift);
      setComboCount(1);
      pushComboStack(gift, 1);
      setShowComboButton(true);
      resetComboTimer();
      pushLocalGiftPill({
        username: isBroadcast ? creatorName : viewerName,
        giftName: gift.name,
        giftIcon: gift.icon || '🎁',
        avatar: isBroadcast ? myAvatar : viewerAvatar,
        quantity: 1,
        creatorName: hostName || creatorName || 'Creator',
        streamId: effectiveStreamId,
      });
      if (isBattleMode && serverBattleTarget && gift.icon && (gift.icon.startsWith('http') || gift.icon.startsWith('/'))) {
        const iconUrl = gift.icon.startsWith('http')
          ? gift.icon
          : resolveGiftAssetUrl(gift.icon.startsWith('/') ? gift.icon : `/${gift.icon}`);
        setLastGifts((prev) => ({
          ...prev,
          ...(serverBattleTarget === 'opponent' ? { opponent: iconUrl } : {}),
          ...(serverBattleTarget === 'player3' ? { player3: iconUrl } : {}),
          ...(serverBattleTarget === 'player4' ? { player4: iconUrl } : {}),
        }));
      }
    } catch {
      showToast('Gift failed');
    }
  };

  const toggleMic = () => {
    const next = !isMicMuted;
    setIsMicMuted(next);
    const stream = cameraStreamRef.current;
    if (stream) stream.getAudioTracks().forEach((t) => (t.enabled = !next));
  };

  const toggleCam = () => {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;
    const nextCamOff = !isCamOff;
    videoTrack.enabled = !nextCamOff;
    setIsCamOff(nextCamOff);
    void hostLifecycleRef.current.liveKit?.setCamEnabled(!nextCamOff);
  };

  const flipCamera = async () => {
    if (!isBroadcast) return;
    setCameraFacing((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const resetComboTimer = () => {
      if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
      comboTimerRef.current = setTimeout(() => {
          setShowComboButton(false);
          setComboCount(0);
          setComboStack([]);
          setLastSentGift(null);
      }, 8000); // keep combo on screen while gift video plays
  };

  const handleComboClick = async () => {
      if (!lastSentGift) return;
      if (isCreatorParticipant && (!selectedCohostGiftUserId || isBattleMode)) return;
      if (comboCount >= GIFT_COMBO_MAX) return;

      // Host never uses test coins — always real wallet / starter / promo.
      const spendable =
        giftSource === 'starter_coins'
          ? starterCoinBalance
          : giftSource === 'promotional_coins'
            ? promotionalCoinBalance
            : walletCoinBalanceRef.current;
      if (spendable < lastSentGift.coins) {
        showToast("Not enough coins!");
        return;
      }

      let newLevel = userLevel;
      let giftTransactionId: string | null = null;
      if (user?.id) {
        try {
          const comboPlayableVideo =
            lastSentGift.video && lastSentGift.video.trim()
              ? lastSentGift.video.startsWith('http://') || lastSentGift.video.startsWith('https://')
                ? lastSentGift.video.trim()
                : resolveGiftAssetUrl(
                    lastSentGift.video.startsWith('/')
                      ? lastSentGift.video
                      : `/${lastSentGift.video}`,
                  )
              : null;
          const comboBattleTarget = isBattleMode
            ? (() => {
                const ids = battleStreamIdsRef.current;
                return liveStreamUiGiftTargetToServerBattleTarget(giftTarget, {
                  isBroadcast,
                  isBattleJoiner,
                  effectiveStreamId,
                  hostRoomId: ids?.hostRoomId ?? '',
                  opponentRoomId: ids?.opponentRoomId ?? '',
                });
              })()
            : undefined;
          const paid = await sendLivePaidGift({
            streamKey: effectiveStreamId,
            giftId: lastSentGift.id,
            channel: 'host',
            giftSource,
            video: comboPlayableVideo,
            ...(comboBattleTarget ? { battleTarget: comboBattleTarget } : {}),
            ...(!isBattleMode && selectedCohostGiftUserId
              ? { cohostTargetUserId: selectedCohostGiftUserId }
              : {}),
          });
          const result = paid.result;
          if (!paid.ok || !result) {
            const msg = paid.errorToast || giftSendErrorToast('');
            if (msg.includes('co-host')) setSelectedCohostGiftUserId(null);
            showToast(msg);
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
            setCoinBalance(nextWallet);
          }
          if (result.newLevel != null) {
            newLevel = Number(result.newLevel);
            setUserLevel(newLevel);
            updateUser({ level: newLevel });
          }
          if (result.totalXp != null) {
            setUserXP(Math.max(0, Number(result.totalXp) || 0));
          }
          if (result.leveledUp) {
            const levelBannerId = `levelup-${Date.now()}`;
            setMessages((prev) => appendCapped(prev, {
                id: levelBannerId,
                username: isBroadcast ? creatorName : viewerName,
                text: `reached Level ${newLevel}`,
                level: newLevel,
                isGift: false,
                avatar: isBroadcast ? myAvatar : viewerAvatar,
                isSystem: true,
              }, LIVE_CHAT_MESSAGE_CAP));
            liveChatSend( {
              text: `reached Level ${newLevel}`,
              level: newLevel,
              avatar: isBroadcast ? myAvatar : viewerAvatar,
            });
          }
          giftTransactionId = result.transactionId;
          if (!giftTransactionId) {
            showToast('Gift failed');
            return;
          }
        } catch {
          showToast('Gift failed');
          return;
        }
      } else {
        showToast('Please sign in to send gifts');
        return;
      }

      setSessionContribution(prev => prev + lastSentGift.coins);

      maybeEnqueueUniverse(lastSentGift.name, viewerName);

      // Flower/rose → Speed unlock is counted once in gift_sent WS handler.

      if (isBroadcast && !isBattleMode) {
        maybeTriggerFaceARGift(lastSentGift);
      }
      
      if (lastSentGift.video && lastSentGift.video.trim()) {
        const videoUrl = preferPlayableGiftVideoUrl(
          (lastSentGift.video.startsWith('http://') || lastSentGift.video.startsWith('https://'))
            ? lastSentGift.video
            : resolveGiftAssetUrl(lastSentGift.video.startsWith('/') ? lastSentGift.video : `/${lastSentGift.video}`),
        );
        if (videoUrl) {
          const comboBattleSide = isBattleMode
            ? normalizeBattleGiftTarget(
                liveStreamUiGiftTargetToServerBattleTarget(giftTarget, {
                  isBroadcast,
                  isBattleJoiner,
                  effectiveStreamId,
                  hostRoomId: battleStreamIdsRef.current?.hostRoomId ?? '',
                  opponentRoomId: battleStreamIdsRef.current?.opponentRoomId ?? '',
                }),
              )
            : null;
          setGiftQueue(prev => appendCapped(prev, { video: videoUrl, battleSide: comboBattleSide }, LIVE_GIFT_QUEUE_CAP));
          setShowGiftPanel(false);
        }
      }
      
      // Add to chat
      const giftMsg = {
          id: Date.now().toString(),
          username: viewerName,
          text: `Sent a ${lastSentGift.name}`,
          isGift: true,
          level: newLevel,
          avatar: viewerAvatar,
      };
      setMessages(prev => appendCapped(prev, giftMsg, LIVE_CHAT_MESSAGE_CAP));

      // Paid gifts: server already broadcasts gift_sent.

      // Handle Combo Logic
      setComboCount((prev) => {
        const next = Math.min(prev + 1, GIFT_COMBO_MAX);
        if (lastSentGift) pushComboStack(lastSentGift, next);
        return next;
      });
      setShowComboButton(true);
      resetComboTimer();
      pushLocalGiftPill({
        username: isBroadcast ? creatorName : viewerName,
        giftName: lastSentGift.name,
        giftIcon: lastSentGift.icon || '🎁',
        avatar: giftMsg.avatar,
        quantity: 1,
        creatorName: hostName || creatorName || 'Creator',
        streamId: effectiveStreamId,
      });
  };

  const onComboButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    void handleComboClick();
  }, [handleComboClick]);

  const handleSendMessage = (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim()) return;
      
      const newMsg: LiveMessage = {
          id: Date.now().toString(),
          username: isBroadcast ? creatorName : viewerName,
          text: inputValue,
          level: userLevel,
          avatar: isBroadcast ? myAvatar : viewerAvatar,
          isMod: isBroadcast || moderators.has(user?.id || ''),
      };
      setMessages(prev => appendCapped(prev, newMsg, LIVE_CHAT_MESSAGE_CAP));

      liveChatSend( {
        text: inputValue,
        level: userLevel,
        avatar: newMsg.avatar,
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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stopBroadcast = async () => {
    const roomId = effectiveStreamId;
    setIsMyStreamLive(false);

    // Stop local camera/mic
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setCameraStream(null);
    }
    clearCachedCameraStream();

    // Remember last ended stream locally so For You feed can hide it immediately for this device
    if (roomId && typeof window !== 'undefined') {
      try {
        const payload = { roomId, endedAt: Date.now() };
        window.localStorage.setItem('elix_last_ended_stream', JSON.stringify(payload));
      } catch {
        // ignore storage errors
      }
    }

    const { restEnded, error: endErr } = await hostSession.endHostBroadcast(roomId);
    if (restEnded) {
      /* registeredRef cleared inside session */
    } else if (liveRegisteredRef.current) {
      showToast(endErr || 'Could not end stream on server. It may still appear live — try again.');
    }

    websocket.disconnect();
    navigate('/feed', { replace: true });
  };

  const closeLiveWithSlide = useCallback(() => {
    if (pageExiting) return;
    // Battle / co-host: close the mode and stay on normal live — do not disconnect.
    if (isBroadcast && isBattleMode) {
      exitBattleMode();
      return;
    }
    const hasCoHostSeats = coHosts.some(
      (h) =>
        (h.status === 'live' ||
          h.status === 'accepted' ||
          h.status === 'invited' ||
          h.status === 'pending_accept') &&
        !sameUserId(h.userId, user?.id),
    );
    if (isBroadcast && (hasCoHostSeats || featuredUserId)) {
      endCoHostMode();
      return;
    }
    setPageExiting(true);
    window.setTimeout(() => {
      if (!isBroadcast) {
        navigate('/feed', { replace: true });
      } else {
        void stopBroadcast();
      }
    }, 250);
  }, [
    pageExiting,
    isBroadcast,
    isBattleMode,
    exitBattleMode,
    navigate,
    stopBroadcast,
    coHosts,
    featuredUserId,
    user?.id,
    endCoHostMode,
  ]);

  const openGiftPanel = useCallback(() => {
    setSelectedCohostGiftUserId(null);
    setShowGiftPanel(true);
  }, []);

  const openGiftPanelForCohost = useCallback((userId: string) => {
    setSelectedCohostGiftUserId(userId);
    setShowGiftPanel(true);
  }, []);

  const openGiftPanelIfSpectator = useCallback(() => {
    if (isCreatorParticipant) return;
    openGiftPanel();
  }, [isCreatorParticipant, openGiftPanel]);

  const closeGiftPanel = useCallback(() => {
    setShowGiftPanel(false);
    setSelectedCohostGiftUserId(null);
  }, []);

  const openSharePanel = useCallback(() => {
    setShowSharePanel(true);
  }, []);

  const closeSharePanel = useCallback(() => {
    setShowSharePanel(false);
  }, []);

  const openMoreMenu = useCallback(() => {
    setIsMoreMenuOpen(true);
  }, []);

  const closeMoreMenu = useCallback(() => {
    setIsMoreMenuOpen(false);
  }, []);

  const closeReportModal = useCallback(() => {
    setIsReportModalOpen(false);
  }, []);

  const moreReport = useCallback(() => {
    setIsReportModalOpen(true);
    setIsMoreMenuOpen(false);
  }, []);

  const shareReport = useCallback(() => {
    setIsReportModalOpen(true);
    setShowSharePanel(false);
  }, []);

  const moreShare = useCallback(() => {
    setShowSharePanel(true);
    setIsMoreMenuOpen(false);
  }, []);

  const moreToggleChat = useCallback(() => {
    setIsChatVisible((v) => !v);
    setIsMoreMenuOpen(false);
  }, []);

  const closeRankingPanel = useCallback(() => {
    setShowRankingPanel(false);
  }, []);

  const openDailyRanking = useCallback(() => {
    setRankingInitialTab('daily');
    setShowRankingPanel(true);
  }, []);

  const openWeeklyRanking = useCallback(() => {
    setRankingInitialTab('weekly');
    setShowRankingPanel(true);
  }, []);

  const openGiftGoalPanel = useCallback(() => {
    setRankingInitialTab('goal');
    setShowRankingPanel(true);
  }, []);

  const openFindCreatorsFromHeader = useCallback(() => {
    setShowViewerList(false);
    setIsFindCreatorsOpen(true);
  }, []);

  const closeViewerList = useCallback(() => {
    setShowViewerList(false);
  }, []);

  const openGiftFromRanking = useCallback(() => {
    setShowRankingPanel(false);
    setShowGiftPanel(true);
  }, []);

  const openWeeklyRankingFromGift = useCallback(() => {
    setShowGiftPanel(false);
    setRankingInitialTab('weekly');
    setShowRankingPanel(true);
  }, []);

  const openMembershipFromGift = useCallback(() => {
    setShowGiftPanel(false);
    setShowFanClub(true);
  }, []);

  const recordLiveShareProgress = useCallback(() => {
    if (!effectiveStreamId) return;
    earnBattleEnergyQuiet('share', effectiveStreamId);
    void apiLiveEngagementProgress({
      metric: 'shares',
      delta: 1,
      roomId: effectiveStreamId,
    }).catch(() => {});
  }, [effectiveStreamId]);

  const shareWhatsApp = useCallback(() => {
    openExternalLink(`https://wa.me/?text=${encodeURIComponent('Watch my LIVE on Elix! ' + `${window.location.origin}/live/${effectiveStreamId}`)}`);
    recordLiveShareProgress();
    setShowSharePanel(false);
  }, [effectiveStreamId, recordLiveShareProgress]);

  const shareFacebook = useCallback(() => {
    openExternalLink(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}/live/${effectiveStreamId}`)}`);
    recordLiveShareProgress();
    setShowSharePanel(false);
  }, [effectiveStreamId, recordLiveShareProgress]);

  const shareCopyLink = useCallback(() => {
    navigator.clipboard.writeText(`${typeof window !== 'undefined' ? window.location.origin : 'https://www.elixstarlive.co.uk'}/live/${effectiveStreamId}`);
    recordLiveShareProgress();
    showToast('Link copied!');
    setShowSharePanel(false);
  }, [effectiveStreamId, recordLiveShareProgress]);

  const shareRepostLive = useCallback(async () => {
    const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://www.elixstarlive.co.uk'}/live/${effectiveStreamId}`;
    const ok = await nativeShareUrl({
      title: 'Repost live on Elix',
      text: `Watch this LIVE on Elix!`,
      url,
    });
    if (ok) {
      recordLiveShareProgress();
      showToast('Live ready to repost');
    } else {
      showToast('Could not open repost share');
    }
    setShowSharePanel(false);
  }, [effectiveStreamId, recordLiveShareProgress]);

  const sharePromote = useCallback(() => {
    setShowSharePanel(false);
    setShowPromotePanel(true);
  }, []);

  const closePromotePanel = useCallback(() => {
    setShowPromotePanel(false);
  }, []);

  const openLiveEffectsPanel = useCallback(() => {
    setShowLiveEffectsPanel(true);
    setIsMoreMenuOpen(false);
  }, []);

  const closeLiveEffectsPanel = useCallback(() => {
    setShowLiveEffectsPanel(false);
  }, []);

  const toggleHostPollCore = useCallback(() => {
    const activePoll =
      engagementState?.poll &&
      engagementNowMs < (engagementState.poll.endsAt || 0);
    if (activePoll) endPoll();
    else {
      startPoll(
        'What should we do next?',
        ['Dance', 'Sing', 'Q&A', 'Shoutouts'],
        'poll',
      );
    }
  }, [engagementState?.poll, engagementNowMs, endPoll, startPoll]);

  const toggleHostPoll = useCallback(() => {
    toggleHostPollCore();
    showToast('Poll started — viewers tap Poll');
  }, [toggleHostPollCore]);

  const toggleHostPollFromMore = useCallback(() => {
    toggleHostPollCore();
    setIsMoreMenuOpen(false);
    showToast('Poll started — viewers tap Poll chip');
  }, [toggleHostPollCore]);

  const startMysteryFromMore = useCallback((mins: 5 | 10 | 15) => {
    startMystery(mins, 'poll');
    setIsMoreMenuOpen(false);
    showToast(`Mystery set for ${mins}m`);
  }, [startMystery]);

  const openSpectatorPoll = useCallback(() => {
    if (engagementState.poll) {
      window.dispatchEvent(new Event('elix-open-live-poll'));
    } else {
      showToast('No active poll right now');
    }
  }, [engagementState.poll]);

  const openBattleChrome = useCallback(() => {
    setShowViewerList(false);
    setIsFindCreatorsOpen(false);
    toggleBattle();
  }, [toggleBattle]);

  const closeFindCreatorsPanel = useCallback(() => {
    (document.activeElement as HTMLElement)?.blur();
    setIsFindCreatorsOpen(false);
    setCreatorQuery('');
  }, []);

  const closeTeamStatus = useCallback(() => {
    setShowTeamStatus(false);
  }, []);

  const closeFanClub = useCallback(() => {
    setShowFanClub(false);
  }, []);

  const acceptBattleInviteClick = useCallback(() => {
    void acceptBattleInvite();
  }, [acceptBattleInvite]);

  const acceptCohostInviteClick = useCallback(() => {
    void acceptCohostInvite();
  }, [acceptCohostInvite]);

  const resetBattleForRematch = useCallback(() => {
    setBattleTime(300);
    setMyScore(0);
    setOpponentScore(0);
    setPlayer3Score(0);
    setPlayer4Score(0);
    battleServerTotalsRef.current = { h: 0, o: 0, p3: 0, p4: 0 };
    setBattleServerTotals({ h: 0, o: 0, p3: 0, p4: 0 });
    setBattleWinner(null);
    setBattleTeamWinner(null);
    battleStreakCountedForEndRef.current = false;
    setBattleCountdown(null);
    reachedThresholdsRef.current.clear();
    roseCountRef.current = 0;
    setRoseCount(0);
    battleScreenTapCountRef.current = 0;
    setBattleScreenTapCount(0);
  }, []);

  const triggerRematch = useCallback(() => {
    startBattleWithAcceptedCreators();
    resetBattleForRematch();
  }, [startBattleWithAcceptedCreators, resetBattleForRematch]);

  const triggerRematchFromMore = useCallback(() => {
    triggerRematch();
    setIsMoreMenuOpen(false);
  }, [triggerRematch]);

  const startMatchFromFindCreators = useCallback(() => {
    setIsFindCreatorsOpen(false);
    startBattleWithAcceptedCreators();
  }, [startBattleWithAcceptedCreators]);

  const sendSpectatorCohostRequest = useCallback(() => {
    if (!user?.id || !effectiveStreamId || spectatorCoHostRequestSent) return;
    const requesterName = user?.username || user?.name || 'Someone';
    cohostRequestSend({
      hostUserId: effectiveStreamId,
      requesterName,
      requesterAvatar: user?.avatar || '',
    });
    setSpectatorCoHostRequestSent(true);
  }, [user?.id, user?.username, user?.name, user?.avatar, effectiveStreamId, spectatorCoHostRequestSent]);

  const openEngagementFromMore = useCallback(() => {
    setEngagementPanel('hub');
    setEngagementOpen(true);
    setIsMoreMenuOpen(false);
  }, []);

  const openEngagementMissions = useCallback(() => {
    setEngagementPanel('missions');
    setEngagementOpen(true);
  }, []);

  const applyLiveFilterPreset = useCallback((css: string) => {
    setLiveFilterCss(css);
    setShowLiveEffectsPanel(false);
  }, []);

  const applyLiveFaceEffectPreset = useCallback((fx: (typeof LIVE_FACE_EFFECT_OPTIONS)[number]) => {
    if (fx.type === 'none') {
      setActiveLiveFaceEffect(null);
    } else {
      setActiveLiveFaceEffect({ type: fx.type, color: fx.color });
      if (fx.type === 'age') {
        setLiveFilterCss('sepia(0.38) saturate(0.72) contrast(1.1) brightness(0.9)');
      } else if (fx.type === 'youth') {
        setLiveFilterCss('brightness(1.12) contrast(0.88) saturate(1.22) blur(0.35px)');
      }
    }
    setShowLiveEffectsPanel(false);
  }, []);

  const declineJoinRequestFromViewerList = useCallback(() => {
    void declineJoinRequest();
    setShowViewerList(false);
  }, [declineJoinRequest]);

  const acceptJoinRequestFromViewerList = useCallback(() => {
    void acceptJoinRequest();
    setShowViewerList(false);
  }, [acceptJoinRequest]);

  const inviteCoHostRef = useRef(inviteCoHost);
  inviteCoHostRef.current = inviteCoHost;

  const inviteCoHostFromViewer = useCallback((viewer: { id: string; name: string; avatar?: string }) => {
    // Always call latest inviteCoHost (creator → spectator invite). Empty-deps
    // previously froze a stale invite that no-op'd while stream was not live yet.
    void inviteCoHostRef.current({
      id: viewer.id,
      name: viewer.name,
      avatar: viewer.avatar,
      streamKey: viewer.id,
    });
    setShowViewerList(false);
  }, []);

  const openCoHostGiftFromGrid = useCallback((userId: string) => {
    if (isBattleModeRef.current) return;
    openGiftPanelForCohost(userId);
  }, [openGiftPanelForCohost]);

  const openTopGiftersHost = useCallback(() => openTopGiftersPanel('host'), [openTopGiftersPanel]);
  const openTopGiftersOpponent = useCallback(() => openTopGiftersPanel('opponent'), [openTopGiftersPanel]);
  const openTopGiftersAll = useCallback(() => openTopGiftersPanel('all'), [openTopGiftersPanel]);

  const moreFlipCamera = useCallback(() => {
    void flipCamera();
    setIsMoreMenuOpen(false);
  }, []);

  const moreToggleMic = useCallback(() => {
    toggleMic();
    setIsMoreMenuOpen(false);
  }, []);

  const moreToggleCam = useCallback(() => {
    toggleCam();
    setIsMoreMenuOpen(false);
  }, []);

  const handleScreenTap = (e?: React.MouseEvent | React.TouchEvent) => {
    let clientX: number | undefined;
    let clientY: number | undefined;
    if (e) {
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      }
    }

    // Count battle screen taps for automatic Speed unlock (x2/x3/x5).
    if (isBattleMode && battleTime > 0 && !battleWinner) {
      battleScreenTapCountRef.current += 1;
      setBattleScreenTapCount(battleScreenTapCountRef.current);
    }

    // Spectator tap vote only — creators playing a match never enter this path.
    if (!isCreatorParticipant && clientX !== undefined && clientY !== undefined && isBattleMode && battleTime > 0 && !battleWinner) {
      const watchedTarget = resolveSpectatorVoteTargetFromWatchedStream();
      const overlayEl = battleSpectatorOverlayRef.current;
      const gridEl = battleVoteGridRef.current;
      if (watchedTarget) {
        const hitEl = overlayEl || gridEl;
        if (hitEl) {
          const rect = hitEl.getBoundingClientRect();
          if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
            handleBattleTap(watchedTarget);
            setGiftTarget(watchedTarget);
            spawnHeartFromClient(clientX, clientY, undefined, heartFloatName, heartFloatAvatar);
            return;
          }
        }
      } else if (gridEl) {
        const rect = gridEl.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          const nx = (clientX - rect.left) / rect.width;
          const ny = (clientY - rect.top) / rect.height;
          const is4Player = battleSlots[1].status !== 'empty' || battleSlots[2].status !== 'empty';
          const target: 'me' | 'opponent' | 'player3' | 'player4' = !is4Player
            ? (nx < 0.5 ? 'me' : 'opponent')
            : (nx < 0.5 ? (ny < 0.5 ? 'me' : 'player3') : (ny < 0.5 ? 'opponent' : 'player4'));
          handleBattleTap(target);
          setGiftTarget(target);
          spawnHeartFromClient(clientX, clientY, undefined, heartFloatName, heartFloatAvatar);
          return;
        }
      }
    }

    if (clientX !== undefined && clientY !== undefined) {
      spawnHeartFromClient(clientX, clientY, undefined, heartFloatName, heartFloatAvatar);
    } else {
      spawnHeartAtSide('me');
    }
  };

  const handleLikeTap = (e?: React.MouseEvent | React.TouchEvent) => {
    // Only spawn heart and add like if NOT in battle mode (or explicit chat tap)
    if (e) {
      let clientX, clientY;
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      }
      if (clientX !== undefined && clientY !== undefined) {
        spawnHeartFromClient(clientX, clientY, undefined, heartFloatName, heartFloatAvatar);
      }
    }
    addLiveLikes(1);
    if (websocket.isConnected()) {
      liveHeartSend({
        username: isBroadcast ? creatorName : viewerName,
        avatar: isBroadcast ? (user?.avatar || myAvatar || '') : viewerAvatar,
      });
    }
  };

  const openMiniProfile = async (
    username: string,
    coins?: number,
    opts?: { userId?: string; avatar?: string; level?: number | null },
  ) => {
    const avatar = opts?.avatar ?? (username === myCreatorName
      ? myAvatar
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=121212&color=FFFFFF`);
    const level = opts?.level ?? (username === myCreatorName ? userLevel : null);
    const donated = username === myCreatorName ? sessionContribution : 0;
    setMiniProfile({ username, avatar, level, coins, donated, id: opts?.userId });
    try {
      if (opts?.userId) {
        const { body, error } = await apiFetchProfileById(opts.userId);
        if (error) return;
        const prof = (body?.profile ?? null) as Record<string, unknown> | null;
        if (prof) {
          setMiniProfile((prev) => prev ? {
            ...prev,
            id: opts.userId,
            username: String(prof.displayName || prof.username || prev.username),
            bio: String(prof.bio || ''),
            avatar: String(prof.avatarUrl || prev.avatar),
            level: Number(prof.level) || prev.level,
            followers_count: Number(prof.followers) || 0,
            following_count: Number(prof.following) || 0,
          } : prev);
          return;
        }
      }
      const { body: prof } = await apiFetchProfileByUsername(username);
      if (prof?.user_id) {
        const resolvedId = typeof prof.user_id === 'string' ? prof.user_id : '';
        const resolvedBio = typeof prof.bio === 'string' ? prof.bio : '';
        const resolvedAvatar = typeof prof.avatar_url === 'string' ? prof.avatar_url : '';
        const resolvedLevel = Number(prof.level);
        const resolvedFollowers = Number(prof.followers_count);
        const resolvedFollowing = Number(prof.following_count);
        setMiniProfile(prev => prev ? {
          ...prev,
          id: resolvedId || prev.id,
          bio: resolvedBio,
          avatar: resolvedAvatar || prev.avatar,
          level: Number.isFinite(resolvedLevel) ? resolvedLevel : prev.level,
          followers_count: Number.isFinite(resolvedFollowers) ? resolvedFollowers : 0,
          following_count: Number.isFinite(resolvedFollowing) ? resolvedFollowing : 0,
        } : prev);
      }
    } catch { /* keep what we have */ }
  };

  const openViewerMiniProfile = useCallback((
    displayName: string,
    viewer: { userId: string; avatar?: string; level?: number },
  ) => {
    void openMiniProfile(displayName, undefined, { userId: viewer.userId, avatar: viewer.avatar, level: viewer.level });
    setShowViewerList(false);
  }, []);

  const closeMiniProfile = () => setMiniProfile(null);

  const goMiniProfileFromMini = useCallback(() => {
    if (!miniProfile) return;
    closeMiniProfile();
    navigate(`/profile/${miniProfile.id ?? miniProfile.username}`);
  }, [miniProfile, navigate]);

  const handleMiniProfileFollowToggle = useCallback(async () => {
    if (!miniProfile) return;
    if (!user?.id) {
      showToast('Log in to follow');
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    let targetId = miniProfile.id;
    if (!targetId && miniProfile.username) {
      try {
        const { body: prof, error } = await apiFetchProfileByUsername(miniProfile.username);
        if (error || !prof?.user_id) {
          showToast('Could not load profile. Try again.');
          return;
        }
        targetId = typeof prof.user_id === 'string' ? prof.user_id : '';
        const resolvedBio = typeof prof.bio === 'string' ? prof.bio : undefined;
        const resolvedAvatar = typeof prof.avatar_url === 'string' ? prof.avatar_url : undefined;
        const resolvedLevel = Number(prof.level);
        const resolvedFollowers = Number(prof.followers_count);
        const resolvedFollowing = Number(prof.following_count);
        setMiniProfile((prev) =>
          prev && prev.username === miniProfile.username
            ? {
                ...prev,
                id: targetId || prev.id,
                bio: resolvedBio ?? prev.bio,
                avatar: resolvedAvatar || prev.avatar,
                level: Number.isFinite(resolvedLevel) ? resolvedLevel : prev.level,
                followers_count: Number.isFinite(resolvedFollowers) ? resolvedFollowers : prev.followers_count,
                following_count: Number.isFinite(resolvedFollowing) ? resolvedFollowing : prev.following_count,
              }
            : prev,
        );
      } catch {
        showToast('Could not load profile. Try again.');
        return;
      }
    }
    if (!targetId) {
      showToast('Could not load profile. Try again.');
      return;
    }
    if (targetId === user.id) {
      showToast("You can't follow yourself");
      return;
    }

    const wasFollowing =
      miniProfileFollowsThem === true ||
      (miniProfileFollowsThem === undefined && useVideoStore.getState().followingUsers.includes(targetId));

    try {
      const { error } = await apiToggleFollow(targetId, wasFollowing);
      if (error) throw new Error('follow failed');

      const prev = useVideoStore.getState().followingUsers;
      const nextIds = wasFollowing
        ? prev.filter((id) => id !== targetId)
        : prev.includes(targetId)
          ? prev
          : [...prev, targetId];
      useVideoStore.setState({ followingUsers: nextIds });
      setMiniProfileFollowsThem(!wasFollowing);
      setMiniProfile((p) =>
        p && p.id === targetId && typeof p.followers_count === 'number'
          ? { ...p, followers_count: Math.max(0, p.followers_count + (wasFollowing ? -1 : 1)) }
          : p,
      );
      showToast(wasFollowing ? 'Unfollowed' : 'Following!');
    } catch {
      showToast('Could not update follow. Try again.');
    }
  }, [miniProfile, user?.id, miniProfileFollowsThem, navigate, location.pathname]);

  const handleMiniProfileShare = useCallback(async () => {
    if (!miniProfile) return;
    const username = typeof miniProfile.username === 'string' ? miniProfile.username : 'User';
    const profileSlug = miniProfile.id ?? username;
    if (!profileSlug) {
      showToast('Could not share profile. Try again.');
      return;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.elixstarlive.co.uk';
    const profileUrl = `${origin}/profile/${encodeURIComponent(profileSlug)}`;
    const bioSnippet = miniProfile.bio ? ` - ${miniProfile.bio}` : '';
    const ok = await nativeShareUrl({
      title: `Check out ${username}'s profile`,
      text: `Check out ${username} (@${username}) on Elix Star${bioSnippet}`,
      url: profileUrl,
    });
    if (!ok) {
      showToast('Sharing not available');
    } else if (!platform.isNative && typeof navigator !== 'undefined' && !navigator.share) {
      showToast('Profile link copied to clipboard!');
    }
  }, [miniProfile]);

  const miniProfileFollowClick = useCallback(() => {
    void handleMiniProfileFollowToggle();
  }, [handleMiniProfileFollowToggle]);

  const miniProfileShareClick = useCallback(() => {
    void handleMiniProfileShare();
  }, [handleMiniProfileShare]);

  const toggleMiniProfileModerator = useCallback(() => {
    if (!miniProfile?.id) return;
    setModerators(prev => {
      const next = new Set(prev);
      const mpId = miniProfile.id as NonNullable<typeof miniProfile.id>;
      if (next.has(mpId)) { next.delete(mpId); showToast(`@${miniProfile.username} removed as moderator`); }
      else { next.add(mpId); showToast(`@${miniProfile.username} is now a moderator`); }
      return next;
    });
    closeMiniProfile();
  }, [miniProfile]);

  const blockMiniProfileUser = useCallback(async () => {
    if (!user?.id || !miniProfile?.id) return;
    try {
      await apiLiveBlockUser(miniProfile.id);
      showToast(`@${miniProfile.username} blocked`);
      closeMiniProfile();
    } catch { /* intentionally empty */ }
  }, [user?.id, miniProfile]);

  const _startBattleMatch = () => {
    if (!isBattleMode) return;
    setMyScore(0);
    setOpponentScore(0);
    battleServerTotalsRef.current = { h: 0, o: 0, p3: 0, p4: 0 };
    setBattleServerTotals({ h: 0, o: 0, p3: 0, p4: 0 });
    setBattleWinner(null);
    setBattleTeamWinner(null);
    battleFreeTapUsedRef.current = false;
    battleTapScoreRemainingRef.current = 5;
    setBattleTime(0);
    setBattleCountdown(null);
  };

  const _closeBattleMatch = () => {
    if (!isBattleMode) return;
    setBattleCountdown(null);
    setBattleTime(0);
    const winner = determine4PlayerWinner();
    setBattleWinner(winner);
    const teamWinner =
      winner === 'me' || winner === 'player3'
        ? 'host'
        : winner === 'opponent' || winner === 'player4'
          ? 'opponent'
          : 'draw';
    setBattleTeamWinner(teamWinner);
    if (!battleStreakCountedForEndRef.current) {
      battleStreakCountedForEndRef.current = true;
      setBattleWinStreak((prev) => applyBattleWinStreak(prev, teamWinner));
    }
  };

  // Team totals for bar: always server host + P3 (red) vs server opponent + P4 (blue) — do not use role-swapped myScore.
  const redTeamScore = battleServerTotals.h + battleServerTotals.p3;
  const blueTeamScore = battleServerTotals.o + battleServerTotals.p4;
  const totalScore = redTeamScore + blueTeamScore;
  const leftPctRaw = totalScore > 0 ? (redTeamScore / totalScore) * 100 : 50;
  const leftPct = Math.max(3, Math.min(97, leftPctRaw));
  const universeText = currentUniverse
    ? `${currentUniverse.sender} sent ${universeGiftLabel} to ${currentUniverse.receiver}`
    : '';
  const _universeDurationSeconds = Math.max(6, Math.min(16, universeText.length * 0.12));
  const _isLiveNormal = isBroadcast && !isBattleMode;
  const activeLikes = liveLikes;


  return {
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
    shareRepostLive,
    shareQuery,
    shareReport,
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
    votePoll,
    walletCoinBalanceRef,
    engagementState,
    engagementNowMs,
    milestoneFlash,
    stageFlash,
    startMystery,
    startPoll,
    endPoll,
  };
}
