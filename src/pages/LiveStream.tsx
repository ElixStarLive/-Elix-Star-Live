import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { showToast } from '../lib/toast';
import { platform, openExternalLink, nativeShareUrl, copyTextToClipboard } from '../lib/platform';
import {
  prepareLiveVideoEl,
  LIVE_WEBRTC_VIDEO_CLASS,
  LIVE_VIDEO_TRANSPARENT_POSTER,
} from '../lib/prepareLiveVideoEl';
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
import { FILTER_PRESETS } from '../lib/ai/filters';
import { GiftUiItem, GIFT_COMBO_MAX, resolveGiftAssetUrl, preferPlayableGiftVideoUrl, fetchGiftsFromDatabase, pickGiftVideoUrl, formatGiftDisplayName } from '../lib/giftsCatalog';
import { appendCapped, LIVE_CHAT_MESSAGE_CAP, LIVE_GIFT_QUEUE_CAP, LIVE_VIEWER_CAP } from '../lib/liveRuntimeCaps';
import { BattleVfxOverlays, GloveIcon, type BattleMistSide, type GloveBurst } from '../components/BattleVfxOverlays';
import { BattleTauntOverlays } from '../components/BattleTauntOverlays';
import { LiveFaceEffectsLayer } from '../components/LiveFaceEffectsLayer';
import { LIVE_FACE_EFFECT_OPTIONS, getLiveFaceEngineLabel } from '../lib/liveFaceEffectsProvider';
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
  areTestCoinsEnabled,
} from '../lib/testCoins';
import { GiftOverlay } from '../components/GiftOverlay';
import GiftAnimationOverlay, { pushLocalGiftPill } from '../components/GiftAnimationOverlay';
import { LiveGiftFeedStack } from '../components/LiveGiftFeedStack';
import { ChatOverlay } from '../components/ChatOverlay';
import { FaceARGift } from '../components/FaceARGift';
import { useLivePromoStore } from '../store/useLivePromoStore';
import { AvatarRing } from '../components/AvatarRing';
import { LevelBadge } from '../components/LevelBadge';
import {
  LIVE_MVP_PROFILE_RING_PX,
  BATTLE_MVP_ROW_EDGE_OFFSET_MM,
  LIVE_BATTLE_VIDEO_HEIGHT,
  LIVE_BATTLE_CHAT_HEIGHT,
  LIVE_BATTLE_CHAT_SHIFT_Y,
  LIVE_TOP_AVATAR_RING_PX,
  LIVE_BOTTOM_ACTION_PADDING,
  LIVE_BOTTOM_ACTION_RESERVE,
} from '../lib/profileFrame';
import { resolveUiAvatarUrl } from '../lib/royceAssets';
import { RoyceCloseIcon } from '../components/royce';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import { clearCachedCameraStream, getCachedCameraStream, setCachedCameraStream } from '../lib/cameraStream';
import { apiUrl, getLiveKitUrl } from '../lib/api';
import { request } from '../lib/apiClient';
import {
  fetchAllSharePanelContacts,
  SHARE_PANEL_ACTION_DISC_PX,
  SHARE_PANEL_ACTION_ICON_PX,
  SHARE_PANEL_AVATAR_PX,
  SHARE_PANEL_ITEM_WIDTH_PX,
} from '../lib/sharePanelContacts';
import ReportModal from '../components/ReportModal';
import PromotePanel from '../components/PromotePanel';
import { GiftPanel } from '../components/GiftPanel';
import { GiftGoalGallery } from '../components/GiftGoalGallery';
import { LiveGiftGoalBar } from '../components/LiveGiftGoalBar';
import { LiveEngagementOverlay } from '../components/LiveEngagementOverlay';
import { useLiveEngagement } from '../hooks/useLiveEngagement';
import { RankingPanel } from '../components/RankingPanel';
import { type LiveRankTab } from '../components/CyclingRankBadge';
import {
  LiveComboMissionDock,
  LiveHostProfileHeader,
  LiveJoinPill,
  LiveMarkedSubHeaderBar,
} from '../components/LiveMarkedTopUi';
import {
  LiveSideMissionStack,
} from '../components/LiveSideMissionStack';
import { websocket } from '../lib/websocket';
import { parseLiveGiftGoal, type LiveGiftGoal } from '../lib/liveGiftGoal';
import { liveStreamUiGiftTargetToServerBattleTarget, normalizeBattleGiftTarget } from '../lib/liveBattleGiftTarget';
import { engagementFlags } from '../config/engagementFlags';
import { earnBattleEnergyQuiet } from '../components/BattleEnergyBoostControls';
import {
  EngagementDrawer,
  type EngagementPanel,
} from '../components/engagement/EngagementDrawer';
import { purchaseMembership } from '../lib/iap';
import { Room, RoomEvent, LocalVideoTrack, LocalAudioTrack, ConnectionState } from 'livekit-client';
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

type UniverseTickerMessage = {
  id: string;
  sender: string;
  receiver: string;
};

const _EMOJI_LIST = ['😀','😂','🥰','😍','🔥','💯','👏','🎉','❤️','💜','💙','⭐','🌟','✨','🙌','👑','💎','🚀','🎵','💃','🕺','😎','🤩','💪','🫶','💖'];
type LiveViewer = {
  id: string;
  username: string;
  displayName: string;
  level: number;
  avatar: string;
  country: string;
  joinedAt: number;
  isActive: boolean;
  chatFrequency: number;
  supportDays: number;
  lastVisitDaysAgo: number;
};






type BattleState = 'LIVE_SOLO' | 'INVITING' | 'IN_BATTLE' | 'ENDED';

/** Compare auth ids / stream keys case-insensitively (avoids self showing in invite lists). */
function normalizeUserId(id: string | null | undefined): string {
  return typeof id === 'string' ? id.trim().toLowerCase() : '';
}

function sameUserId(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeUserId(a);
  const nb = normalizeUserId(b);
  return !!na && !!nb && na === nb;
}

function isSelfUser(
  candidateId: string | null | undefined,
  userId: string | null | undefined,
  streamId: string | null | undefined,
): boolean {
  if (sameUserId(candidateId, userId)) return true;
  if (streamId && sameUserId(candidateId, streamId)) return true;
  return false;
}

export default function LiveStream() {
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
  const [giftsCatalog, setGiftsCatalog] = useState<GiftUiItem[]>([]);
  const giftsCatalogRef = useRef<GiftUiItem[]>([]);
  useEffect(() => { giftsCatalogRef.current = giftsCatalog; }, [giftsCatalog]);
  // Dedup gift_sent (REST + WS + owner-global can all deliver the same txn once).
  const seenGiftTxnRef = useRef<Set<string>>(new Set());
  // Dedup chat_message (room broadcast + owner-global fallback deliver once each).
  const seenChatMsgIdRef = useRef<Set<string>>(new Set());
  useEffect(() => { let c = false; fetchGiftsFromDatabase().then(g => { if (!c) setGiftsCatalog(g); }); return () => { c = true; }; }, []);
  const setPromo = useLivePromoStore((s) => s.setPromo);
  const { user, updateUser } = useAuthStore();
  const followingUsers = useVideoStore((s) => s.followingUsers);
  const _rawStreamId = streamId;
  const PROMOTE_LIKES_THRESHOLD_LIVE = 100;
  const _PROMOTE_LIKES_THRESHOLD_BATTLE = 50;
  
  const [showRankingPanel, setShowRankingPanel] = useState(false);
  const [rankingInitialTab, setRankingInitialTab] = useState<LiveRankTab>('weekly');
  const [isFollowing, setIsFollowing] = useState(false);
  const [currentGift, setCurrentGift] = useState<{ video: string } | null>(null);
  // Gift video queue must live above the WS effect so creator playback never depends
  // on hook-order / late state declarations.
  const [giftQueue, setGiftQueue] = useState<{ video: string }[]>([]);
  const [giftKey, setGiftKey] = useState(0);
  const enqueueGiftVideoRef = useRef<(url: string) => void>(() => {});
  const playedGiftVideoTxnRef = useRef<Set<string>>(new Set());
  enqueueGiftVideoRef.current = (url: string) => {
    if (!url) return;
    setGiftQueue((prev) => appendCapped(prev, { video: url }, LIVE_GIFT_QUEUE_CAP));
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
  const [showTestCoinsModal, setShowTestCoinsModal] = useState(false);
  const [testCoinsStep, setTestCoinsStep] = useState<'password' | 'amount'>('password');
  const TEST_COINS_PWD_KEY = 'elix_test_coins_pwd_saved';
  const TEST_COINS_VERIFIED_KEY = 'elix_test_coins_verified';
  const [testCoinsPwd, setTestCoinsPwd] = useState('');
  const [testCoinsSavePwd, setTestCoinsSavePwd] = useState(!!(typeof localStorage !== 'undefined' && localStorage.getItem(TEST_COINS_PWD_KEY)));
  const [testCoinsError, setTestCoinsError] = useState('');
  const [testCoinsAmount, setTestCoinsAmount] = useState('');
  const testCoinsPwdRef = useRef<HTMLInputElement>(null);
  const TEST_COINS_HASH = '169a9bfc269089e14090ad2e393b17e945d798598c33993bcab5feef93e68508';
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
  const liveRegisteredRef = useRef(false);
  const effectiveStreamIdRef = useRef(effectiveStreamId);
  effectiveStreamIdRef.current = effectiveStreamId;
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
  const [opponentCreatorName, setOpponentCreatorName] = useState('');
  const viewerName = user?.username || user?.name || 'viewer_123';
  const viewerAvatar = resolveUiAvatarUrl(user?.avatar, viewerName);
  /** Floating like hearts: host shows self; spectator shows their own name (not the creator’s). */
  const heartFloatName = isBroadcast ? myCreatorName : viewerName;
  const heartFloatAvatar = isBroadcast ? (user?.avatar || myAvatar || '') : viewerAvatar;
  const universeGiftLabel = 'Universe';

  const followCreatorLive = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!user?.id) {
        showToast('Log in to follow');
        navigate('/login', { state: { from: location.pathname } });
        return;
      }
      const targetId = effectiveStreamId;
      if (!targetId || targetId === 'broadcast' || targetId === user.id) return;
      try {
        const { error } = await request(`/api/profiles/${encodeURIComponent(targetId)}/follow`, {
          method: 'POST',
        });
        if (error) throw new Error('follow failed');
        setIsFollowing(true);
        const prev = useVideoStore.getState().followingUsers;
        if (!prev.includes(targetId)) {
          useVideoStore.setState({ followingUsers: [...prev, targetId] });
        }
      } catch {
        showToast('Could not follow. Try again.');
      }
    },
    [user?.id, effectiveStreamId, navigate, location.pathname],
  );

  useEffect(() => {
    if (!user?.id || isBroadcast || !effectiveStreamId) return;
    if (effectiveStreamId === user.id || effectiveStreamId === 'broadcast') {
      setIsFollowing(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: body, error } = await request(`/api/profiles/${encodeURIComponent(user.id)}/following`);
        if (error || cancelled) return;
        const ids: string[] = Array.isArray(body?.following) ? body.following : [];
        if (!cancelled) setIsFollowing(ids.includes(effectiveStreamId));
      } catch {
        if (!cancelled) setIsFollowing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isBroadcast, effectiveStreamId]);

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7293/ingest/e7fb8ad3-ac4d-422a-955a-8c318a5cd9e2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fa77db'},body:JSON.stringify({sessionId:'fa77db',runId:'follow-join-restore',hypothesisId:'H1',location:'LiveStream.tsx:hostHeaderSlot',message:'follow/membership slot flags',data:{isBroadcast:!!isBroadcast,isFollowing:!!isFollowing,showFollow:!isBroadcast&&!isFollowing,showJoinMembership:!!(isBroadcast||isFollowing)},timestamp:Date.now()})}).catch(()=>{});
  }, [isBroadcast, isFollowing]);
  // #endregion

  useEffect(() => {
    const creatorId = isBroadcast ? (user?.id || '') : effectiveStreamId;
    if (!creatorId || creatorId === 'broadcast') {
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
      request('/api/wallet/'),
      request('/api/progression/me'),
      request('/api/engagement/wallet'),
    ])
      .then(([wallet, progression, engagementWallet]) => {
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
        const serverLevel = Math.max(0, Number(p?.current_level) || 0);
        const serverXp = Math.max(0, Number(p?.total_xp) || 0);
        // While testing with test coins, show the local simulated level if it's
        // higher (local-only, never real progression).
        const testLvl = shouldUseTestCoinsForGifts(user.id) ? getTestLevel(user.id) : 0;
        const resolvedLevel = Math.max(serverLevel, testLvl, Number(user.level) || 0);
        setUserLevel(resolvedLevel);
        if (serverLevel > 0) updateUser({ level: serverLevel });
        setUserXP(serverXp);
      })
      .catch(() => {
        if (cancelled) return;
        if (shouldUseTestCoinsForGifts(user.id)) {
          setCoinBalance(getPersistedTestCoinsBalance(user.id));
        }
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
      websocket.send('stream_start', {
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
      void request('/api/live/end', {
        method: 'POST',
        body: JSON.stringify({ room }),
      }).finally(() => {
        liveRegisteredRef.current = false;
      });
    };
  }, []);

  useEffect(() => {
    // Title is set at stream start via POST /api/live/start; no DB update needed here
  }, [creatorName, isBroadcast, isMyStreamLive, effectiveStreamId, user?.id]);

  useEffect(() => {
    if (showTestCoinsModal) {
      const verified = localStorage.getItem(TEST_COINS_VERIFIED_KEY);
      const ts = verified ? parseInt(verified, 10) : 0;
      if (ts && Date.now() - ts < 24 * 60 * 60 * 1000) {
        setTestCoinsStep('amount');
      } else {
        setTestCoinsStep('password');
      }
    }
  }, [showTestCoinsModal]);

  useEffect(() => {
    if (user?.id && effectiveStreamId) {
      const today = new Date().toISOString().split('T')[0];
      const storageKey = `joined_stream_${effectiveStreamId}_${user.id}_${today}`;
      const hasJoined = localStorage.getItem(storageKey);
      if (hasJoined) {
        setHasJoinedToday(true);
      }
      
      // Load total heart count
      const heartKey = `my_heart_count_${effectiveStreamId}_${user.id}`;
      const savedHearts = localStorage.getItem(heartKey);
      if (savedHearts) {
        setMyHeartCount(parseInt(savedHearts, 10));
      }
    }
  }, [user?.id, effectiveStreamId]);

  // LiveKit credentials from /api/live/start (so we can connect and publish)
  const [liveKitCreds, setLiveKitCreds] = useState<{ token: string; url: string } | null>(null);
  const liveKitRoomRef = useRef<Room | null>(null);
  const liveKitPublishGenRef = useRef(0);

  const publishHostLiveKitTracks = useCallback(async () => {
    const room = liveKitRoomRef.current;
    const stream = cameraStreamRef.current;
    if (!room || room.state !== ConnectionState.Connected || !stream) return;
    const gen = ++liveKitPublishGenRef.current;
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    const wantVideoId = videoTrack?.readyState === 'live' ? videoTrack.id : null;
    const wantAudioId = audioTrack?.readyState === 'live' ? audioTrack.id : null;

    const pubs = [...room.localParticipant.trackPublications.values()];
    const pubVideo = pubs.find((p) => p.kind === 'video');
    const pubAudio = pubs.find((p) => p.kind === 'audio');
    const publishedVideoId = pubVideo?.track?.mediaStreamTrack?.id ?? null;
    const publishedAudioId = pubAudio?.track?.mediaStreamTrack?.id ?? null;

    // Already publishing the correct live tracks — never unpublish/republish (causes black flicker).
    if (
      publishedVideoId === wantVideoId &&
      publishedAudioId === wantAudioId &&
      wantVideoId &&
      (wantAudioId || !audioTrack)
    ) {
      return;
    }

    try {
      if (pubVideo?.track && publishedVideoId !== wantVideoId) {
        try {
          // Keep MediaStreamTrack alive for local preview — LiveKit must not stop it.
          await room.localParticipant.unpublishTrack(pubVideo.track, false);
        } catch {
          /* ignore unpublish race */
        }
      }
      if (pubAudio?.track && publishedAudioId !== wantAudioId) {
        try {
          await room.localParticipant.unpublishTrack(pubAudio.track, false);
        } catch {
          /* ignore unpublish race */
        }
      }
      if (gen !== liveKitPublishGenRef.current) return;

      const hasVideoPub = [...room.localParticipant.trackPublications.values()].some(
        (p) => p.kind === 'video' && p.track?.mediaStreamTrack?.id === wantVideoId,
      );
      if (!hasVideoPub && wantVideoId && videoTrack) {
        await room.localParticipant.publishTrack(new LocalVideoTrack(videoTrack), { name: 'camera' });
      }
      if (gen !== liveKitPublishGenRef.current) return;

      const hasAudioPub = [...room.localParticipant.trackPublications.values()].some(
        (p) => p.kind === 'audio' && p.track?.mediaStreamTrack?.id === wantAudioId,
      );
      if (!hasAudioPub && wantAudioId && audioTrack) {
        await room.localParticipant.publishTrack(new LocalAudioTrack(audioTrack), { name: 'mic' });
      }
    } catch (e) {
      console.warn('[LiveKit] publish failed:', e);
    }
  }, []);

  // Register/unregister live stream in backend list; get LiveKit token+url for host
  useEffect(() => {
    if (!isBroadcast || !user?.id || !effectiveStreamId || liveRegisteredRef.current) return;

    (async () => {
      try {
        const { data, error: startError } = await request('/api/live/start', {
          method: 'POST',
          body: JSON.stringify({
            room: effectiveStreamId,
            // so viewers / ForYou can see the real creator name instead of the raw stream key
            displayName: creatorNameRef.current,
          }),
        });
        if (!startError) {
          liveRegisteredRef.current = true;
          let url = (data?.url ?? '').trim();
          if (!url) url = getLiveKitUrl();
          if (data?.token && url) {
            setLiveKitCreds({ token: data.token, url });
          } else {
            showToast('Live server missing token or LIVEKIT_URL. Check server .env and restart.');
          }
        } else {
          showToast('Failed to start stream');
        }
      } catch {
        showToast('Failed to start live stream. Please try again.');
      }
    })();

  }, [isBroadcast, user?.id, effectiveStreamId]);

  // Live: LiveKit room connection (host). Camera publish is separate so restarts
  // (flip cam, app resume, battle layout) never leave viewers on a dead track.
  useEffect(() => {
    if (!isBroadcast || !liveKitCreds) return;

    const room = new Room({
      adaptiveStream: true,
      // Preview and publish share the same getUserMedia tracks. If LiveKit stops
      // them on unpublish/disconnect, the host <video> goes permanently black.
      stopLocalTrackOnUnpublish: false,
    });
    liveKitRoomRef.current = room;

    const attachRemoteTrack = (track: import('livekit-client').Track, participant: import('livekit-client').RemoteParticipant) => {
      const identity = participant.identity;
      if (sameUserId(identity, user?.id)) return;

      if (track.kind === 'audio') {
        // Co-host audio must be attached on host side, otherwise host can see but not hear co-hosts.
        attachRemoteAudio(track, roomRemoteAudioRef.current);
        return;
      }
      if (track.kind !== 'video') return;

      // Battle: opponent publishes into THIS (host) LiveKit room — attach to battle panes.
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
      // Accepted pane but userId not synced yet — attach first open battle slot.
      if (isBattleModeRef.current && slots[0]?.status === 'accepted' && !hasOpponentStreamRef.current) {
        if (markAttached(opponentVideoRef.current)) {
          setHasOpponentStream(true);
          return;
        }
      }
      if (isBattleModeRef.current && slots[1]?.status === 'accepted' && player3VideoRef.current && !player3VideoRef.current.srcObject) {
        markAttached(player3VideoRef.current);
        return;
      }
      if (isBattleModeRef.current && slots[2]?.status === 'accepted' && player4VideoRef.current && !player4VideoRef.current.srcObject) {
        markAttached(player4VideoRef.current);
        return;
      }

      // Co-host on big screen (featured)
      if (featuredUserIdRef.current && sameUserId(identity, featuredUserIdRef.current) && featuredBigVideoRef.current) {
        track.attach(featuredBigVideoRef.current);
        prepareLiveVideoEl(featuredBigVideoRef.current);
      }
      // Co-host tiles (non-battle) — match identity case-insensitively
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
    };

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (publication.kind === 'video' && publication.isMuted && participant?.identity) {
        setRemoteCamOff((prev) => { const n = new Set(prev); n.add(participant.identity); return n; });
      }
      attachRemoteTrack(track, participant);
    });
    room.on(RoomEvent.TrackPublished, (publication, participant) => {
      if (publication.track && publication.isSubscribed) {
        attachRemoteTrack(publication.track, participant);
      }
    });
    room.on(RoomEvent.ParticipantConnected, (participant) => {
      for (const [, pub] of participant.videoTrackPublications) {
        if (pub.track && pub.isSubscribed) attachRemoteTrack(pub.track, participant);
      }
      for (const [, pub] of participant.audioTrackPublications) {
        if (pub.track && pub.isSubscribed) attachRemoteAudio(pub.track, roomRemoteAudioRef.current);
      }
    });

    // Read-only: highlight (pulse) whichever participant is currently speaking.
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setSpeakingIds(new Set(speakers.map((s) => s.identity).filter(Boolean)));
    });
    // Read-only: track a co-host turning their own camera off (video track muted) to show their avatar.
    room.on(RoomEvent.TrackMuted, (pub, participant) => {
      if (pub.kind !== 'video') return;
      const id = participant?.identity;
      if (!id) return;
      setRemoteCamOff((prev) => { const n = new Set(prev); n.add(id); return n; });
    });
    room.on(RoomEvent.TrackUnmuted, (pub, participant) => {
      if (pub.kind !== 'video') return;
      const id = participant?.identity;
      if (!id) return;
      setRemoteCamOff((prev) => { const n = new Set(prev); n.delete(id); return n; });
    });

    let cancelled = false;
    (async () => {
      try {
        await room.connect(liveKitCreds.url, liveKitCreds.token);
        // The effect was cleaned up while connecting — tear down instead of
        // publishing a ghost camera/mic track into a room we've left.
        if (cancelled) { room.disconnect(); return; }
        for (const [, participant] of room.remoteParticipants) {
          for (const [, pub] of participant.videoTrackPublications) {
            if (pub.isMuted && participant.identity) {
              setRemoteCamOff((prev) => { const n = new Set(prev); n.add(participant.identity); return n; });
            }
            if (pub.track && pub.isSubscribed) attachRemoteTrack(pub.track, participant);
          }
          for (const [, pub] of participant.audioTrackPublications) {
            if (pub.track && pub.isSubscribed) attachRemoteAudio(pub.track, roomRemoteAudioRef.current);
          }
        }
        await publishHostLiveKitTracks();
      } catch (e) {
        const errMsg = String(e).includes('401') ? 'LiveKit auth failed — check API keys'
          : String(e).includes('timeout') ? 'LiveKit connection timed out — retrying...'
          : `Live video could not start (${String(e).slice(0, 80)})`;
        showToast(errMsg);
      }
    })();

    return () => {
      cancelled = true;
      liveKitRoomRef.current = null;
      room.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBroadcast, liveKitCreds, publishHostLiveKitTracks]);

  // Republish when the local camera stream is recreated (flip, resume, permission blip).
  useEffect(() => {
    if (!isBroadcast || !cameraStream) return;
    let cancelled = false;
    let attempts = 0;
    const run = () => {
      if (cancelled || attempts > 12) return;
      attempts += 1;
      const room = liveKitRoomRef.current;
      if (!room || room.state !== ConnectionState.Connected) {
        window.setTimeout(run, 500);
        return;
      }
      void publishHostLiveKitTracks();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isBroadcast, cameraStream, publishHostLiveKitTracks]);

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

  // Fetch membership stats for creator (hearts + real gift coins / top supporters)
  useEffect(() => {
    if (!user?.id) return;
    const fetchStats = () => {
      request(`/api/membership/${user.id}`).then(({ data: d }) => {
        if (!d) return;
        if (typeof d.todayHearts === 'number') setDailyHeartCount(d.todayHearts);
        if (typeof d.totalHearts === 'number') setMyHeartCount(d.totalHearts);
        if (typeof d.totalGiftCoins === 'number') setTotalGiftCoins(d.totalGiftCoins);
        if (Array.isArray(d.topGifters)) setTopGifters(d.topGifters);
        if (Array.isArray(d.heartMembers)) setHeartMembers(d.heartMembers);
      }).catch(() => {});
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const [creatorQuery, setCreatorQuery] = useState('');
  const [creators, setCreators] = useState<{ id: string; streamKey: string; name: string; username: string; followers: string; avatar: string; isLive: boolean }[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);
  const [creatorsLoadFailed, setCreatorsLoadFailed] = useState(false);

  const loadCreators = useCallback(async () => {
    if (!user?.id) return;
    setCreatorsLoading(true);
    setCreatorsLoadFailed(false);
    try {
      const url = apiUrl('/api/live/streams');
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load live streams (${res.status})`);
      }
      const json = await res.json();
      const streams = Array.isArray(json.streams) ? json.streams : [];
      // Support both snake_case and camelCase from /api/live/streams
      const liveCreators = streams
        .map((s) => {
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
  type BattleSlot = { userId: string; name: string; status: 'empty' | 'invited' | 'accepted'; avatar: string };
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
    websocket.send('battle_invite_send', {
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

  const acceptBattleInvite = async () => {
    if (!pendingInvite || !user?.id) return;
    const invite = pendingInvite;
    setPendingInvite(null);
    closeAllBottomPanels();
    if (!invite.streamKey) {
      showToast('Missing stream key');
      return;
    }

    // Real handshake: the server validates the invite, records the battle
    // grant, and only then sends battle_accept_ack. Navigation happens after
    // the ack, so the joiner page is guaranteed to receive a publish token.
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
      const myUsername = user?.username || user?.name || viewerName;
      websocket.send('battle_invite_accept', {
        hostUserId: invite.hostUserId,
        requesterName: myUsername,
        requesterAvatar: viewerAvatar,
        streamKey: user?.id || effectiveStreamId,
        // Host's room — lets the server transition our spectators into the battle.
        hostStreamKey: invite.streamKey,
      });
    } catch { /* fire-and-forget */ }

    const granted = await ackPromise;
    if (!granted) {
      return;
    }
    // Mark this as a REAL accepted battle invite in sessionStorage so the
    // "never demote to spectator" guard survives a reload / remount even if
    // React Router navigation state is lost. Cleared when the battle ends.
    try { sessionStorage.setItem(`battleAccept:${invite.streamKey}`, '1'); } catch { /* ignore */ }
    // Display-only host info so the joiner's pane 2 shows the host right away
    // (authorization stays server-side via the battle grant / publish token).
    navigate(`/live/${invite.streamKey}?battle=1`, {
      state: { battleHost: { userId: invite.hostUserId, name: invite.hostName, avatar: invite.hostAvatar } },
    });
  };

  const declineBattleInvite = async () => {
    if (!pendingInvite) return;
    websocket.send('battle_invite_decline', {
      hostStreamKey: pendingInvite.streamKey,
      hostUserId: pendingInvite.hostUserId,
    });
    setPendingInvite(null);
    closeAllBottomPanels();
  };

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
      const room = liveKitRoomRef.current;
      if (room && targetUserId) {
        for (const [, p] of room.remoteParticipants) {
          if (!sameUserId(p.identity, targetUserId)) continue;
          for (const [, pub] of p.audioTrackPublications) {
            const t = pub.track as { setVolume?: (v: number) => void } | null;
            t?.setVolume?.(vol);
          }
        }
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
    websocket.send('cohost_layout_sync', payload);
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
      return;
    }
    websocket.send('cohost_invite_send', {
      targetUserId: creator.id,
      targetStreamKey: creator.streamKey || creator.id,
      hostName: myCreatorName,
      hostAvatar: myAvatar,
      streamKey: effectiveStreamId,
    });
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

  const declineCohostInvite = () => {
    setPendingCohostInvite(null);
    closeAllBottomPanels();
  };

  const acceptCohostInvite = async () => {
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
    websocket.send('cohost_invite_accept', {
      hostUserId: inv.hostUserId,
      cohostName: myName,
      cohostAvatar: user?.avatar || '',
      streamKey: user?.id || effectiveStreamId,
    });
    if (inv.streamKey) {
      navigate(`/watch/${inv.streamKey}?cohost=1`, { state: { fromCohostInvite: true } });
    }
  };

  // ─── JOIN REQUEST: creator receives when someone asked to join (from viewer) ───
  type PendingJoinRequest = { requesterName: string; requesterAvatar: string; requesterId: string; type: 'cohost' | 'battle' };
  const [pendingJoinRequest, setPendingJoinRequest] = useState<PendingJoinRequest | null>(null);

  const acceptJoinRequest = async () => {
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
    websocket.send('cohost_request_accept', {
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
  };

  const declineJoinRequest = async () => {
    if (!pendingJoinRequest) return;
    const requesterId = pendingJoinRequest.requesterId;
    setPendingJoinRequest(null);
    closeAllBottomPanels();
    if (requesterId) websocket.send('cohost_request_decline', { requesterUserId: requesterId });
  };

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
      const room = liveKitRoomRef.current;
      if (room) {
        for (const [, p] of room.remoteParticipants) {
          if (!sameUserId(p.identity, h.userId)) continue;
          for (const [, pub] of p.audioTrackPublications) {
            const t = pub.track as { setVolume?: (v: number) => void } | null;
            t?.setVolume?.(nextMuted ? 0 : 1);
          }
        }
      }
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
      let tokenData: { url?: string; token?: string } | null = null;
      let deniedCount = 0;
      for (let attempt = 0; attempt < 12 && !cancelled; attempt += 1) {
        const tokenResult = await request(
          `/api/live/token?room=${encodeURIComponent(effectiveStreamId)}&publish=1`,
        );
        if (!tokenResult.error && tokenResult.data?.token) {
          tokenData = tokenResult.data;
          break;
        }
        const msg = tokenResult.error?.message || '';
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
      if (!tokenData?.token) {
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
        const { data: profileBody } = await request(`/api/profiles/${encodeURIComponent(effectiveStreamId)}`);
        if (profileBody) {
          const profile = profileBody?.profile || profileBody?.data || {};
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
        const lkUrl = (tokenData?.url ?? '').trim() || getLiveKitUrl();
        const lkToken = tokenData?.token;
        if (!lkUrl || !lkToken || cancelled) return;

        const room = new Room({
          adaptiveStream: true,
          stopLocalTrackOnUnpublish: false,
        });
        battleLkRoomRef.current = room;

        // Subscribe to host's video for the opponent panel
        room.on(RoomEvent.TrackSubscribed, (track) => {
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
        });

        await room.connect(lkUrl, lkToken);
        if (cancelled) { room.disconnect(); return; }

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

        // Publish our camera and mic to the host's room
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          await room.localParticipant.publishTrack(new LocalVideoTrack(videoTrack), { name: 'camera' });
        }
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          await room.localParticipant.publishTrack(new LocalAudioTrack(audioTrack), { name: 'mic' });
        }

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
      if (battleLkRoomRef.current) { battleLkRoomRef.current.disconnect(); battleLkRoomRef.current = null; }
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

  /** Start / rematch with EVERY accepted creator seat (opponent + P3 + P4). */
  const startBattleWithAcceptedCreators = useCallback(() => {
    const accepted = battleSlots.filter((s) => s.status === 'accepted' && s.userId);
    const opp = accepted[0];
    const p3 = accepted[1];
    const p4 = accepted[2];
    websocket.send('battle_create', {
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
    const room = new Room();
    opponentLkRoomRef.current = room;

    (async () => {
      try {
        const { data: payload, error: tokenErr } = await request(`/api/live/token?room=${encodeURIComponent(opponentStreamKey)}`);
        if (tokenErr || !mounted) return;
        const token = payload?.token;
        const url = (payload?.url ?? '').trim() || getLiveKitUrl();
        if (!token || !url || !mounted) return;

        room.on(RoomEvent.TrackSubscribed, (track) => {
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
        });

        await room.connect(url, token);
        if (!mounted) { room.disconnect(); return; }

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
      room.disconnect();
      if (opponentLkRoomRef.current === room) opponentLkRoomRef.current = null;
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
  const [lastGifts, setLastGifts] = useState<{ opponent: string | null; player3: string | null; player4: string | null }>({ opponent: null, player3: null, player4: null });
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
    void request(`/api/membership/${user.id}`)
      .then(({ data: d }) => {
        if (!d) return;
        if (typeof d.todayHearts === 'number') setDailyHeartCount(d.todayHearts);
        if (typeof d.totalHearts === 'number') setMyHeartCount(d.totalHearts);
        if (typeof d.totalGiftCoins === 'number') setTotalGiftCoins(d.totalGiftCoins);
        if (Array.isArray(d.topGifters)) setTopGifters(d.topGifters);
        if (Array.isArray(d.heartMembers)) setHeartMembers(d.heartMembers);
      })
      .catch(() => {});
  }, [showTeamStatus, user?.id]);
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
  const [goalTargetCount, setGoalTargetCount] = useState(50);
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
    websocket.send('gift_goal_set', nextGoal);
    setGiftGoal(nextGoal);
    setGoalSaving(false);
    showToast('Gift goal set');
  }, [goalPick, goalTargetCount, giftGoal, isBroadcast]);

  const clearGiftGoal = useCallback(() => {
    if (!isBroadcast) return;
    websocket.send('gift_goal_clear', {});
    setGiftGoal(null);
    setGoalPick(null);
    showToast('Gift goal cleared');
  }, [isBroadcast]);

  useEffect(() => {
    if (!showFanClub || stickersFetchedRef.current || !user?.id) return;
    stickersFetchedRef.current = true;
    request(`/api/stickers/${user.id}`).then(({ data: d }) => {
      if (d?.stickers) setCreatorStickers(d.stickers);
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
        const { data: body, error } = await request(`/api/profiles/${encodeURIComponent(user.id)}/following`);
        if (error || cancelled) return;
        const ids: string[] = Array.isArray(body?.following) ? body.following : [];
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
    const { error } = await request(`/api/stickers/${id}`, { method: 'DELETE' });
    if (!error) setCreatorStickers(prev => prev.filter(s => s.id !== id));
  }, []);

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
    // Instead of opening the top bar, we now open the bottom sheet Fan Club
    setShowFanClub(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeMembershipBar]);
  const [sessionContribution, setSessionContribution] = useState(0); // total coins gifted this session
  const [universeQueue, setUniverseQueue] = useState<UniverseTickerMessage[]>([]);
  const [currentUniverse, setCurrentUniverse] = useState<UniverseTickerMessage | null>(null);

  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showGiftPanel, setShowGiftPanel] = useState(false);

  useEffect(() => {
    if (!showGiftPanel || !user?.id) return;
    const testBal = getPersistedTestCoinsBalance(user.id);
    if (testBal > 0) {
      setCoinBalance(testBal);
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
      }
    }).catch(() => {});
    request('/api/engagement/wallet').then(({ data, error }) => {
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
      const { data: _j, error: shareErr } = await request('/api/live-share', {
        method: 'POST',
        body: JSON.stringify({
          targetUserId,
          streamKey: effectiveStreamId,
          hostUserId: user.id,
          hostName: myCreatorName,
          hostAvatar: myAvatar || '',
          sharerName: user?.username || user?.name || 'Someone',
          sharerAvatar: user?.avatar || '',
        }),
      });
      if (shareErr) {
        showToast(shareErr.message || 'Could not share');
        return;
      }
      setShareSentTo((prev) => new Set(prev).add(targetUserId));
      if (effectiveStreamId) {
        earnBattleEnergyQuiet('share', effectiveStreamId);
        void request('/api/engagement/progress', {
          method: 'POST',
          body: JSON.stringify({
            metric: 'shares',
            delta: 1,
            roomId: effectiveStreamId,
          }),
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
    setBattleCountdown(null);
    setHasOpponentStream(false);
    setOpponentStreamKey(null);
    if (opponentLkRoomRef.current) { opponentLkRoomRef.current.disconnect(); opponentLkRoomRef.current = null; }
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
    websocket.send('battle_end', {});
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
    setGiftTarget('me');
    setBattleCountdown(null);
    setHasOpponentStream(false);
    setOpponentStreamKey(null);
    if (opponentLkRoomRef.current) { opponentLkRoomRef.current.disconnect(); opponentLkRoomRef.current = null; }
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
    setIsFindCreatorsOpen(true);
    websocket.send('battle_create', { hostName: creatorName });
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
    const colors = ['#FF0000', '#ffffff', '#E60026', '#DC143C', '#FF1744', '#CC0000'];
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

  // Battle tap: spectators vote via server (+5 once). Creators never self-score locally.
  const handleBattleTap = useCallback((target: 'me' | 'opponent' | 'player3' | 'player4') => {
    if (!isBattleMode || battleWinner || battleTime <= 0) return;
    if (isCreatorParticipant) return;
    if (spectatorTapPointsRef.current > 0) return;
    if (!websocket.isConnected()) return;

    setGiftTarget(target);
    spectatorTapPointsRef.current = 1;
    setSpectatorTapsUsed(1);
    const voteTarget =
      target === 'opponent' || target === 'player4' ? 'opponent' : 'host';
    websocket.send('battle_spectator_vote', { target: voteTarget });
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
        const { data: body, error: profileErr } = await request(`/api/profiles/${encodeURIComponent(viewerId)}`);
        if (profileErr || !body) return;
        const profile = body?.profile || body?.data || {};
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
        if (!resolvedUsername && !resolvedDisplayName && !resolvedAvatar) return;
        const nextIdentity = {
          username: resolvedUsername || resolvedDisplayName || `user_${viewerId.slice(0, 8)}`,
          displayName: resolvedDisplayName || resolvedUsername || `User ${viewerId.slice(0, 8)}`,
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
      needsIdentityLookup.forEach((uid) => maybeResolveViewerIdentity(uid));

      // Creator: push layout to server as soon as we connect so spectators who join later get creator layout
      if (isBroadcastRef.current && effectiveStreamId && user?.id) {
        const list = coHostsRef.current.map((h) => ({ id: h.id, userId: h.userId, name: h.name, avatar: h.avatar, status: h.status }));
        websocket.send('cohost_layout_sync', { roomId: effectiveStreamId, coHosts: list, hostUserId: user.id });
      }

      // Opponent: once connected to the room, tell the server we're joining the battle
      if (isBattleJoiner) {
        websocket.send('battle_join', { opponentName: user?.username || user?.name || 'Player' });
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
      const cached = uid ? viewerIdentityCacheRef.current.get(uid) : undefined;
      const wsLevel = Number(data.level);
      const initialLevel =
        cached?.level && cached.level > 0
          ? cached.level
          : Number.isFinite(wsLevel) && wsLevel >= 0
            ? Math.floor(wsLevel)
            : 1;
      setActiveViewers(prev => {
        if (prev.some(v => v.id === uid)) return prev;
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
        websocket.send('cohost_layout_sync', { roomId: effectiveStreamId, coHosts: list, hostUserId: user.id });
      }
    };

    const handleUserLeft = (data) => {
      if (!mounted) return;
      const leftId = data.user_id != null ? String(data.user_id) : '';
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
          if (iconUrl && (target === 'opponent' || target === 'player3' || target === 'player4')) {
            setLastGifts((prev) => ({
              ...prev,
              ...(target === 'opponent' ? { opponent: iconUrl } : {}),
              ...(target === 'player3' ? { player3: iconUrl } : {}),
              ...(target === 'player4' ? { player4: iconUrl } : {}),
            }));
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

      // Host always plays spectator gift videos (that is the product rule).
      // Only battle joiners filter to their own side during an active battle.
      if (
        !isBroadcast &&
        isBattleModeRef.current &&
        battleStateRef.current === 'IN_BATTLE'
      ) {
        const giftSide = normalizeBattleGiftTarget(data.battleTarget);
        const myRole =
          battleRoleRef.current || (isBattleJoiner ? 'opponent' : null);
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
        enqueueGiftVideoRef.current(url);
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

    /** Server ~300ms authoritative snapshot — never let stale tick lower scores (async DB race). */
    const handleBattleScoreUpdate = (data) => {
      if (!mounted) return;
      const p = data?.players;
      if (!p || typeof p !== "object") return;
      const ids = battleStreamIdsRef.current;
      const prev = battleServerTotalsRef.current;
      const toNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
      const newH = Math.max(prev.h, toNum(p.A1));
      const newO = Math.max(prev.o, toNum(p.B1));
      const newP3 = Math.max(prev.p3, toNum(p.A2));
      const newP4 = Math.max(prev.p4, toNum(p.B2));
      if (newH === prev.h && newO === prev.o && newP3 === prev.p3 && newP4 === prev.p4) return;
      applyBattleScores({
        hostScore: newH,
        opponentScore: newO,
        player3Score: newP3,
        player4Score: newP4,
        hostUserId: ids?.hostUserId,
        opponentUserId: ids?.opponentUserId,
      });
    };

    const handleBattleCountdown = (data) => {
      if (!mounted) return;
      setBattleCountdown(data.count ?? null);
      if (data.count <= 0) setBattleCountdown(null);
    };

    const handleBattleReadyState = (data) => {
      if (!mounted) return;
      setHostIsReady(!!data.hostReady);
      setOpponentIsReady(!!data.opponentReady);
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
      if (winner === 'host') setBattleWinner(role === 'opponent' ? 'opponent' : 'me');
      else if (winner === 'opponent') setBattleWinner(role === 'opponent' ? 'me' : 'opponent');
      else setBattleWinner('draw');
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
        setLiveLikes(Math.max(0, data.live_likes));
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
      if (parsed) setGiftGoal(parsed);
    };

    websocket.on('room_state', handleRoomState);
    websocket.on('user_joined', handleUserJoined);
    websocket.on('user_left', handleUserLeft);
    websocket.on('chat_message', handleChatMessage);
    websocket.on('gift_sent', handleGiftSent);
    websocket.on('gift_goal_sync', handleGiftGoalSync);
    websocket.on('heart_sent', handleHeartSent);
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
      if (typeof data?.timeLeft === 'number' && Number.isFinite(data.timeLeft)) {
        setBattleTime(Math.max(0, Math.round(data.timeLeft)));
      }
    };

    websocket.on('battle_state_sync', handleBattleStateSync);
    websocket.on('battle_tick', handleBattleTick);
    websocket.on('battle_score', handleBattleScore);
    websocket.on('battle:score_update', handleBattleScoreUpdate);
    websocket.on('battle_countdown', handleBattleCountdown);
    websocket.on('battle_ended', handleBattleEnded);
    websocket.on('battle_ready_state', handleBattleReadyState);
    websocket.on('booster_activated', handleBoosterActivated);
    websocket.on('booster_caught', handleBoosterCaught);
    websocket.on('mist_activated', handleMistActivated);

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

    websocket.on('battle_invite', handleBattleInvite);
    websocket.on('battle_invite_ack', handleBattleInviteAck);
    websocket.on('battle_invite_declined', handleBattleInviteDeclined);
    websocket.on('battle_invite_accepted', handleBattleInviteAccepted);
    websocket.on('cohost_invite', handleCohostInvite);
    websocket.on('cohost_invite_ack', handleCohostInviteAck);
    websocket.on('cohost_invite_accepted', handleCohostInviteAccepted);
    websocket.on('cohost_request', handleCohostRequest);
    websocket.on('cohost_request_accepted', handleCohostRequestAccepted);

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
    websocket.on('moderation_warning', handleModerationWarning);
    websocket.on('moderation_pause', handleModerationPause);
    websocket.on('moderation_suspend', handleModerationSuspend);

    connect();

    return () => {
      mounted = false;
      if (battleEndedTimeoutRef.current) {
        clearTimeout(battleEndedTimeoutRef.current);
        battleEndedTimeoutRef.current = null;
      }
      websocket.off('room_state', handleRoomState);
      websocket.off('user_joined', handleUserJoined);
      websocket.off('user_left', handleUserLeft);
      websocket.off('chat_message', handleChatMessage);
      websocket.off('gift_sent', handleGiftSent);
      websocket.off('gift_goal_sync', handleGiftGoalSync);
      websocket.off('heart_sent', handleHeartSent);
      websocket.off('battle_state_sync', handleBattleStateSync);
      websocket.off('battle_tick', handleBattleTick);
      websocket.off('battle_score', handleBattleScore);
      websocket.off('battle:score_update', handleBattleScoreUpdate);
      websocket.off('battle_countdown', handleBattleCountdown);
      websocket.off('battle_ended', handleBattleEnded);
      websocket.off('battle_ready_state', handleBattleReadyState);
      websocket.off('booster_activated', handleBoosterActivated);
      websocket.off('booster_caught', handleBoosterCaught);
      websocket.off('mist_activated', handleMistActivated);
      websocket.off('battle_invite', handleBattleInvite);
      websocket.off('battle_invite_ack', handleBattleInviteAck);
      websocket.off('battle_invite_declined', handleBattleInviteDeclined);
      websocket.off('battle_invite_accepted', handleBattleInviteAccepted);
      websocket.off('cohost_invite', handleCohostInvite);
      websocket.off('cohost_invite_ack', handleCohostInviteAck);
      websocket.off('cohost_invite_accepted', handleCohostInviteAccepted);
      websocket.off('cohost_request', handleCohostRequest);
      websocket.off('cohost_request_accepted', handleCohostRequestAccepted);
      websocket.off('moderation_warning', handleModerationWarning);
      websocket.off('moderation_pause', handleModerationPause);
      websocket.off('moderation_suspend', handleModerationSuspend);
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
        const { data: json, error: modErr } = await request('/api/live/moderation/check', {
          method: 'POST',
          body: JSON.stringify({ stream_key: effectiveStreamId, image_base64: base64 }),
        });
        if (modErr || !json) return;
        const action = json?.action;
        const message = json?.message || '';
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
      void request('/api/engagement/missions')
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
      void request('/api/engagement/progress', {
        method: 'POST',
        body: JSON.stringify({ metric: 'watch_minutes', delta: 1, roomId }),
      }).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(id);
  }, [isBroadcast, effectiveStreamId, missionWatchGoal]);
  useEffect(() => {
    if (!isBattleMode || !effectiveStreamId) return;
    void request('/api/engagement/progress', {
      method: 'POST',
      body: JSON.stringify({
        metric: 'battles_joined',
        delta: 1,
        roomId: effectiveStreamId,
      }),
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
        name: g.username || g.user_id.slice(0, 8),
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

    try {
      let newLevel = userLevel;
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
        // Test-only: drive a LOCAL level using the same curve as the server so
        // the level visibly climbs while testing. Never sent to the server.
        const sim = addTestGiftXp((user as NonNullable<typeof user>).id, gift.coins);
        if (sim.level > userLevel) {
          setUserLevel(sim.level);
          updateUser({ level: sim.level });
          newLevel = sim.level;
          const levelBannerId = `levelup-${Date.now()}`;
          setMessages((prev) => appendCapped(prev, {
              id: levelBannerId,
              username: isBroadcast ? creatorName : viewerName,
              text: `reached Level ${sim.level}`,
              level: sim.level,
              isGift: false,
              avatar: isBroadcast ? myAvatar : viewerAvatar,
              isSystem: true,
            }, LIVE_CHAT_MESSAGE_CAP));
        }
        setUserXP(sim.totalXp);
      } else if (user?.id) {
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
          const { data: result, error: giftErr } = await request('/api/gifts/send', {
            method: 'POST',
            body: JSON.stringify({
              streamKey: effectiveStreamId,
              giftId: gift.id,
              channel: platform.name,
              transaction_id: crypto.randomUUID(),
              gift_source: giftSource,
              ...(playableVideo
                ? { video: playableVideo, animation_url: playableVideo }
                : {}),
              ...(restBattleTarget ? { battleTarget: restBattleTarget } : {}),
              ...(!isBattleMode && selectedCohostGiftUserId
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
            if (msg.includes('insufficient_funds') || msg.includes('INSUFFICIENT') || msg.includes('insufficient')) {
              showToast('Not enough coins');
              return;
            }
            if (msg.includes('INVALID_COHOST_TARGET')) {
              showToast('That co-host is no longer available');
              setSelectedCohostGiftUserId(null);
              return;
            }
            showToast('Gift failed');
            return;
          }
          if (result.gift_source === 'starter_coins') {
            setStarterCoinBalance(
              Math.max(0, Number(result.new_starter_balance) || 0),
            );
            if (Number(result.new_starter_balance) <= 0) {
              setGiftSource('paid_coins');
            }
          } else if (result.gift_source === 'promotional_coins') {
            const nextPromo = Math.max(
              0,
              Number(result.new_promotional_balance) || 0,
            );
            setPromotionalCoinBalance(nextPromo);
            if (nextPromo <= 0) {
              setGiftSource(
                starterCoinBalance > 0 ? 'starter_coins' : 'paid_coins',
              );
            }
          } else if (result.new_balance != null) {
            const nextWallet = Math.max(0, Number(result.new_balance));
            walletCoinBalanceRef.current = nextWallet;
            setCoinBalance(resolveGiftUiBalance(nextWallet, user?.id));
          }
          if (result.new_level != null) {
            const updatedLevel = Number(result.new_level);
            setUserLevel(updatedLevel);
            updateUser({ level: updatedLevel });
            newLevel = updatedLevel;
          }
          if (result.total_xp != null) {
            setUserXP(Math.max(0, Number(result.total_xp) || 0));
          }
          if (result.leveled_up) {
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
            websocket.send('chat_message', {
              text: `reached Level ${newLevel}`,
              level: newLevel,
              avatar: isBroadcast ? myAvatar : viewerAvatar,
            });
          }
          giftTransactionId =
            typeof result.transaction_id === 'string' && result.transaction_id
              ? result.transaction_id
              : null;
          if (!giftTransactionId) {
            showToast('Gift failed');
            return;
          }
        } catch {
          showToast('Gift failed');
          return;
        }
      } else {
        const nextWallet = Math.max(0, walletCoinBalanceRef.current - gift.coins);
        walletCoinBalanceRef.current = nextWallet;
        setCoinBalance(resolveGiftUiBalance(nextWallet, user?.id));
      }

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
            setGiftQueue(prev => appendCapped(prev, { video: videoUrl }, LIVE_GIFT_QUEUE_CAP));
          }
        }
      }
      setShowGiftPanel(false);
      // Test coins are local-only — never inflate gifts mission bar.
      if (!usedTestCoins) {
        setMissionGiftsSent((n) => n + 1);
      }

      // Track session contribution for membership (real gifts only — never test coins).
      if (!usedTestCoins) {
        setSessionContribution(prev => prev + gift.coins);
      }

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
        websocket.send('gift_sent', {
          giftId: gift.id,
          giftName: gift.name,
          username: isBroadcast ? creatorName : viewerName,
          coins: gift.coins,
          gift_icon: gift.icon || '🎁',
          quantity: 1,
          level: newLevel,
          avatar: giftMsg.avatar,
          video: wsVideo,
          animation_url: wsVideo,
          transactionId: usedTestCoins ? null : giftTransactionId,
          giftSource: usedTestCoins ? 'test_coins' : giftSource,
          battleTarget: serverBattleTarget,
          creator_name: hostName || 'Creator',
          ...(!isBroadcast && { host_user_id: effectiveStreamId }),
          ...(!isBattleMode && selectedCohostGiftUserId
            ? {
                cohostTargetUserId: selectedCohostGiftUserId,
                cohost_target_user_id: selectedCohostGiftUserId,
              }
            : {}),
        });
      }
      

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
    const room = liveKitRoomRef.current;
    if (room?.state === ConnectionState.Connected) {
      void room.localParticipant.setCameraEnabled(!nextCamOff).catch(() => {});
    }
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

      const usedTestCoins = Boolean(user?.id && shouldUseTestCoinsForGifts(user.id));
      const spendable = usedTestCoins
        ? getSpendableGiftBalance(coinBalance, user?.id)
        : giftSource === 'starter_coins'
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
      if (usedTestCoins) {
        const debit = debitTestCoinsForGift((user as NonNullable<typeof user>).id, lastSentGift.coins);
        if (!debit.ok) {
          showToast("Not enough coins!");
          return;
        }
        setCoinBalance(
          displayBalanceAfterTestSpend(debit.newBalance, walletCoinBalanceRef.current),
        );
      } else if (user?.id) {
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
          const { data: result, error: giftErr } = await request('/api/gifts/send', {
            method: 'POST',
            body: JSON.stringify({
              streamKey: effectiveStreamId,
              giftId: lastSentGift.id,
              channel: platform.name,
              transaction_id: crypto.randomUUID(),
              gift_source: giftSource,
              ...(comboPlayableVideo
                ? { video: comboPlayableVideo, animation_url: comboPlayableVideo }
                : {}),
              ...(isBattleMode
                ? (() => {
                    const ids = battleStreamIdsRef.current;
                    const t = liveStreamUiGiftTargetToServerBattleTarget(giftTarget, {
                      isBroadcast,
                      isBattleJoiner,
                      effectiveStreamId,
                      hostRoomId: ids?.hostRoomId ?? '',
                      opponentRoomId: ids?.opponentRoomId ?? '',
                    });
                    return t ? { battleTarget: t } : {};
                  })()
                : {}),
              ...(!isBattleMode && selectedCohostGiftUserId
                ? { cohostTargetUserId: selectedCohostGiftUserId }
                : {}),
            }),
          });

          if (giftErr) {
            const msg = giftErr.message || '';
            if (msg.includes('insufficient_funds') || msg.includes('INSUFFICIENT') || msg.includes('insufficient')) {
              showToast('Not enough coins');
              return;
            }
            if (msg.includes('INVALID_COHOST_TARGET')) {
              showToast('That co-host is no longer available');
              setSelectedCohostGiftUserId(null);
              return;
            }
            showToast('Gift failed');
            return;
          }
          if (result.gift_source === 'starter_coins') {
            setStarterCoinBalance(
              Math.max(0, Number(result.new_starter_balance) || 0),
            );
            if (Number(result.new_starter_balance) <= 0) {
              setGiftSource('paid_coins');
            }
          } else if (result.gift_source === 'promotional_coins') {
            const nextPromo = Math.max(
              0,
              Number(result.new_promotional_balance) || 0,
            );
            setPromotionalCoinBalance(nextPromo);
            if (nextPromo <= 0) {
              setGiftSource(
                starterCoinBalance > 0 ? 'starter_coins' : 'paid_coins',
              );
            }
          } else if (result.new_balance != null) {
            const nextWallet = Math.max(0, Number(result.new_balance));
            walletCoinBalanceRef.current = nextWallet;
            setCoinBalance(resolveGiftUiBalance(nextWallet, user?.id));
          }
          if (result.new_level != null) {
            newLevel = Number(result.new_level);
            setUserLevel(newLevel);
            updateUser({ level: newLevel });
          }
          if (result.total_xp != null) {
            setUserXP(Math.max(0, Number(result.total_xp) || 0));
          }
          if (result.leveled_up) {
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
            websocket.send('chat_message', {
              text: `reached Level ${newLevel}`,
              level: newLevel,
              avatar: isBroadcast ? myAvatar : viewerAvatar,
            });
          }
          giftTransactionId =
            typeof result.transaction_id === 'string' && result.transaction_id
              ? result.transaction_id
              : null;
          if (!giftTransactionId) {
            showToast('Gift failed');
            return;
          }
        } catch {
          showToast('Gift failed');
          return;
        }
      } else {
        const nextWallet = Math.max(0, walletCoinBalanceRef.current - lastSentGift.coins);
        walletCoinBalanceRef.current = nextWallet;
        setCoinBalance(resolveGiftUiBalance(nextWallet, user?.id));
      }

      // Track session contribution for membership (real gifts only — never test coins).
      if (!usedTestCoins) {
        setSessionContribution(prev => prev + lastSentGift.coins);
      }

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
          setGiftQueue(prev => appendCapped(prev, { video: videoUrl }, LIVE_GIFT_QUEUE_CAP));
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

      const idsForBattleGiftCombo = battleStreamIdsRef.current;
      const serverBattleTargetCombo =
        isBattleMode
          ? liveStreamUiGiftTargetToServerBattleTarget(giftTarget, {
              isBroadcast,
              isBattleJoiner,
              effectiveStreamId,
              hostRoomId: idsForBattleGiftCombo?.hostRoomId ?? '',
              opponentRoomId: idsForBattleGiftCombo?.opponentRoomId ?? '',
            })
          : undefined;

      if (usedTestCoins || giftTransactionId) {
        const comboWsVideo =
          lastSentGift.video && lastSentGift.video.trim()
            ? preferPlayableGiftVideoUrl(
                lastSentGift.video.startsWith('http://') || lastSentGift.video.startsWith('https://')
                  ? lastSentGift.video.trim()
                  : resolveGiftAssetUrl(
                      lastSentGift.video.startsWith('/')
                        ? lastSentGift.video
                        : `/${lastSentGift.video}`,
                    ),
              )
            : null;
        websocket.send('gift_sent', {
          giftId: lastSentGift.id,
          giftName: lastSentGift.name,
          username: isBroadcast ? creatorName : viewerName,
          coins: lastSentGift.coins,
          gift_icon: lastSentGift.icon || '🎁',
          quantity: 1,
          level: newLevel,
          avatar: giftMsg.avatar,
          video: comboWsVideo,
          animation_url: comboWsVideo,
          transactionId: usedTestCoins ? null : giftTransactionId,
          giftSource: usedTestCoins ? 'test_coins' : giftSource,
          battleTarget: serverBattleTargetCombo,
          creator_name: hostName || 'Creator',
          ...(!isBroadcast && { host_user_id: effectiveStreamId }),
          ...(!isBattleMode && selectedCohostGiftUserId
            ? {
                cohostTargetUserId: selectedCohostGiftUserId,
                cohost_target_user_id: selectedCohostGiftUserId,
              }
            : {}),
        });
      }


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

      websocket.send('chat_message', {
        text: inputValue,
        level: userLevel,
        avatar: newMsg.avatar,
      });

      setInputValue('');
      if (effectiveStreamId) {
        earnBattleEnergyQuiet('comment', effectiveStreamId);
        void request('/api/engagement/progress', {
          method: 'POST',
          body: JSON.stringify({
            metric: 'comments',
            delta: 1,
            roomId: effectiveStreamId,
          }),
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

    // Hard-stop LiveKit room so billing/minutes stop immediately
    if (liveKitRoomRef.current) {
      try {
        await liveKitRoomRef.current.disconnect();
      } catch {
        // ignore disconnect errors
      } finally {
        liveKitRoomRef.current = null;
      }
    }

    // Tell websocket listeners this stream ended
    websocket.send('stream_end', { stream_key: roomId, user_id: user?.id });
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

    // Mark stream ended on backend list so it disappears from /api/live/streams
    if (roomId && liveRegisteredRef.current) {
      try {
        await request('/api/live/end', {
          method: 'POST',
          body: JSON.stringify({ room: roomId }),
        });
      } catch {
        // backend failure is non-fatal for client shutdown
      } finally {
        liveRegisteredRef.current = false;
      }
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
      websocket.send('heart_sent', {
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
        const { data: body } = await request<{ profile?: Record<string, unknown> }>(`/api/profiles/${encodeURIComponent(opts.userId)}`);
        const prof = body?.profile;
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
      const { data: prof } = await request<{
        user_id?: string;
        bio?: string;
        avatar_url?: string;
        level?: number;
        followers_count?: number;
        following_count?: number;
      }>(`/api/profiles/by-username/${encodeURIComponent(username)}`);
      if (prof?.user_id) {
        setMiniProfile(prev => prev ? {
          ...prev,
          id: prof.user_id,
          bio: prof.bio || '',
          avatar: prof.avatar_url || prev.avatar,
          level: prof.level ?? prev.level,
          followers_count: prof.followers_count ?? 0,
          following_count: prof.following_count ?? 0,
        } : prev);
      }
    } catch { /* keep what we have */ }
  };

  const closeMiniProfile = () => setMiniProfile(null);

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
        const { data: prof, error } = await request<{ user_id?: string; bio?: string; avatar_url?: string; level?: number; followers_count?: number; following_count?: number }>(
          `/api/profiles/by-username/${encodeURIComponent(miniProfile.username)}`,
        );
        if (error || !prof?.user_id) {
          showToast('Could not load profile. Try again.');
          return;
        }
        targetId = prof.user_id;
        setMiniProfile((prev) =>
          prev && prev.username === miniProfile.username
            ? {
                ...prev,
                id: prof.user_id,
                bio: prof.bio ?? prev.bio,
                avatar: prof.avatar_url || prev.avatar,
                level: prof.level ?? prev.level,
                followers_count: prof.followers_count ?? prev.followers_count,
                following_count: prof.following_count ?? prev.following_count,
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
      const endpoint = wasFollowing
        ? `/api/profiles/${encodeURIComponent(targetId)}/unfollow`
        : `/api/profiles/${encodeURIComponent(targetId)}/follow`;
      const { error } = await request(endpoint, { method: 'POST' });
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

  const _startBattleMatch = () => {
    if (!isBattleMode) return;
    setMyScore(0);
    setOpponentScore(0);
    battleServerTotalsRef.current = { h: 0, o: 0, p3: 0, p4: 0 };
    setBattleServerTotals({ h: 0, o: 0, p3: 0, p4: 0 });
    setBattleWinner(null);
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

  return (
    <div
      className="fixed inset-0 flex justify-center bg-black z-[9990] transition-transform duration-[250ms] ease-out"
      style={{ transform: pageExiting ? 'translateX(100%)' : undefined }}
    >
      <div className="relative w-full max-w-[480px] h-full bg-[#111111] overflow-hidden border-none">
        <div className="h-full w-full relative">
        <audio ref={roomRemoteAudioRef} autoPlay playsInline className="hidden" />
        <audio ref={opponentRemoteAudioRef} autoPlay playsInline className="hidden" />
        {/* BACKGROUND: VIDEO AREA (Unified frame) */}
        <div className="absolute inset-0 z-0 bg-[#111111] overflow-hidden">
          <div className="video-zone relative w-full h-full">
            <div ref={stageRef} className="relative w-full h-full">
            {/* Base Video Layer */}
        {!isBattleMode && (() => {
          const hasAnyCoHost = coHosts.some(
            (h) =>
              (h.status === 'live' || h.status === 'accepted') &&
              !sameUserId(h.userId, user?.id),
          );
          return (
          <div
            className={hasAnyCoHost ? 'absolute inset-x-0 z-[25] flex flex-row' : 'relative w-full h-full'}
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
            {/* Left: Host camera (or featured co-host) — 50% when co-hosts present, else full */}
            <div
              className={`${hasAnyCoHost ? 'w-1/2 min-w-0 relative' : 'relative w-full h-full'} border border-[#C9A96E]/40 ${
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
                  className={`w-full h-full object-cover ${LIVE_WEBRTC_VIDEO_CLASS}`}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  poster={LIVE_VIDEO_TRANSPARENT_POSTER}
                  style={isBroadcast ? {
                    transform: 'scaleX(-1)',
                    opacity: featuredHost || isCamOff ? 0 : 1,
                    transition: 'opacity 0.3s ease',
                    position: featuredHost ? 'absolute' : undefined,
                    inset: featuredHost ? 0 : undefined,
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
                      style={{ backgroundColor: '#111111' }}
                    />
                    <div className="absolute top-1 left-1 z-20 flex items-center gap-1 pointer-events-auto">
                      <button
                        type="button"
                        title="Remove co-host"
                        aria-label="Remove co-host"
                        onClick={(e) => { e.stopPropagation(); removeCoHost(featuredHost.id); }}
                        className="flex items-center justify-center border-0 bg-transparent p-0.5 hover:opacity-90 active:scale-95"
                      >
                        <X size={14} strokeWidth={2.35} className="text-[#D4AF37]" />
                      </button>
                      <button
                        type="button"
                        title="Back to host on big screen"
                        onClick={(e) => { e.stopPropagation(); setFeaturedUserId(null); }}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/60 border border-[#D4AF37]/50 active:scale-95"
                      >
                        <ArrowLeftRight className="w-3 h-3 text-[#D4AF37]" strokeWidth={2.5} />
                        <span className="text-[8px] font-bold text-[#D4AF37]">Host</span>
                      </button>
                    </div>
                    <span className="absolute bottom-1 left-1 z-20 text-white/90 text-[9px] font-bold bg-black/55 rounded px-1 truncate max-w-[90%]">
                      {featuredHost.name}
                    </span>
                  </>
                )}
                {isCamOff && !featuredHost && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#111111] z-[5]">
                    {(user?.avatar || myAvatar) ? (
                      <img src={user?.avatar || myAvatar || ''} alt="" className="w-16 h-16 rounded-full border-2 border-[#C9A227]/40 object-cover object-center" />
                    ) : (
                      <div className="w-16 h-16 rounded-full border-2 border-[#C9A227]/40 bg-[#111111] flex items-center justify-center">
                        <span className="text-2xl font-black text-[#E8D5A3]/60">{(creatorName || user?.username || 'Me').charAt(0).toUpperCase()}</span>
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
                      className="absolute top-1 left-1 z-20 flex items-center justify-center border-0 bg-transparent p-0.5 pointer-events-auto hover:opacity-90 active:scale-95"
                    >
                      <X size={14} strokeWidth={2.35} className="text-[#D4AF37]" />
                    </button>
                    <div className="absolute top-1 right-1 z-10 flex items-end gap-1.5 pointer-events-auto">
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleMic(); }} className="flex flex-col items-center gap-0.5 p-0.5 rounded bg-black/50">
                        {isMicMuted ? <MicOff className="w-3 h-3 text-white" strokeWidth={2.5} /> : <Mic className="w-3 h-3 text-white" strokeWidth={2.5} />}
                        <span className="text-[7px] font-semibold text-white/85 leading-none">{isMicMuted ? 'Unmute' : 'Mute'}</span>
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleCam(); }} className="flex flex-col items-center gap-0.5 p-0.5 rounded">
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
                  <div className="w-full h-full bg-[#111111] flex flex-col items-center justify-center relative">
                    {myAvatar ? (
                      <img src={myAvatar} alt="" className="w-28 h-28 rounded-full object-cover object-center mb-4 opacity-80" />
                    ) : (
                      <div className="w-28 h-28 rounded-full bg-[#111111] flex items-center justify-center mb-4">
                        <span className="text-4xl font-black text-[#E8D5A3]/60">{creatorName.charAt(0).toUpperCase()}</span>
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
              <div className="absolute inset-0 flex items-center justify-center bg-[#111111] text-white font-bold">
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
                        style={{ opacity: isCamOff ? 0 : 1, transform: 'scaleX(-1)', backgroundColor: '#111111' }}
                      />
                      {isCamOff && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#111111] z-[5]">
                          {(user?.avatar || myAvatar) ? (
                            <img src={user?.avatar || myAvatar || ''} alt="" className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-[#111111] flex items-center justify-center">
                              <span className="text-[#E8D5A3]/60 text-sm font-bold">{(creatorName || 'Me').charAt(0)}</span>
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
                          className="flex items-center justify-center border-0 bg-transparent p-0.5 hover:opacity-90 active:scale-95"
                        >
                          <X size={14} strokeWidth={2.35} className="text-[#D4AF37]" />
                        </button>
                        <button
                          type="button"
                          title="Host on big screen"
                          onClick={(e) => { e.stopPropagation(); setFeaturedUserId(null); }}
                          className="rounded bg-black/55 p-0.5 border border-[#D4AF37]/45 active:scale-95"
                        >
                          <ArrowLeftRight className="w-3 h-3 text-[#D4AF37]" strokeWidth={2.5} />
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
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#111111] z-[5]">
                        {host.avatar ? (
                          <img src={host.avatar} alt="" className="w-10 h-10 rounded-full object-cover object-center" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#111111] flex items-center justify-center">
                            <span className="text-[#E8D5A3]/60 text-sm font-bold">{(host.name || '?').charAt(0)}</span>
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
                          className="flex items-center justify-center border-0 bg-transparent p-0.5 hover:opacity-90 active:scale-95"
                        >
                          <X size={14} strokeWidth={2.35} className="text-[#D4AF37]" />
                        </button>
                        <button
                          type="button"
                          title="Put on big screen"
                          onClick={(e) => { e.stopPropagation(); toggleFeaturedUser(host.userId); }}
                          className="rounded bg-black/55 p-0.5 border border-[#D4AF37]/45 active:scale-95"
                        >
                          <ArrowLeftRight className="w-3 h-3 text-[#D4AF37]" strokeWidth={2.5} />
                        </button>
                      </div>
                      <div className="absolute top-0.5 right-0.5 z-10 flex items-center gap-0.5 pointer-events-auto">
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleCoHostMute(host.id); }} className="rounded bg-black/50 p-0.5" title={host.isMuted ? 'Unmute' : 'Mute'}>
                          {host.isMuted ? <MicOff className="text-white w-3 h-3" strokeWidth={2.5} /> : <Mic className="text-white w-3 h-3" strokeWidth={2.5} />}
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleCoHostCamera(host.id); }} className="p-0.5 rounded" title={coHostCameraOff[host.id] ? 'Camera on' : 'Camera off'}>
                          {coHostCameraOff[host.id] ? <CameraOff className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] w-3 h-3" strokeWidth={2.5} /> : <Camera className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] w-3 h-3" strokeWidth={2.5} />}
                        </button>
                      </div>
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
                              {formatCountShort(score)}
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
                if (slot.type === 'invited' && slot.host) return (
                  <>
                    <button
                      type="button"
                      title="Cancel invite"
                      aria-label="Cancel invite"
                      onClick={(e) => { e.stopPropagation(); removeCoHost(slot.host!.id); }}
                      className="absolute top-0.5 left-0.5 z-10 flex items-center justify-center border-0 bg-transparent p-0.5 pointer-events-auto hover:opacity-90 active:scale-95"
                    >
                      <X size={14} strokeWidth={2.35} className="text-[#D4AF37]" />
                    </button>
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-[#111111]">
                      {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover opacity-60" /> : <div className="w-full h-full flex items-center justify-center text-[#E8D5A3]/60 text-base font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                    </div>
                    <p className="text-white/60 text-[9px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                    <span className="text-[#E8D5A3]/70 text-[8px] font-semibold">Waiting</span>
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
                      <X size={14} strokeWidth={2.35} className="text-[#D4AF37]" />
                    </button>
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-[#111111]">
                      {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[#D4AF37] text-sm font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                    </div>
                    <p className="text-white text-[8px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                    <span className="text-[#E8D5A3]/70 text-[8px] font-semibold">Pending</span>
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
                <div className="w-1/2 h-full grid grid-cols-2 grid-rows-4 gap-[1px] bg-[#1a1c22]">
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
                        onClick={() => {
                          if (!cellHost || isBattleMode) return;
                          setSelectedCohostGiftUserId(cellHost.userId);
                          setShowGiftPanel(true);
                        }}
                        onKeyDown={(e) => {
                          if (!cellHost || isBattleMode) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedCohostGiftUserId(cellHost.userId);
                            setShowGiftPanel(true);
                          }
                        }}
                        className={`relative bg-[#111111] flex flex-col items-center justify-center overflow-hidden p-0 min-h-0 border border-[#C9A96E]/40 ${cellSpeaking ? 'elix-speaking-pulse' : ''} ${cellHost && !isBattleMode ? 'cursor-pointer' : ''}`}
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

        {/* Battle Split Screen Overlay — shown whenever in battle mode */}
        {isBattleMode && (location.pathname.startsWith('/live') || location.pathname.startsWith('/watch')) && (
          <div
            ref={battleSpectatorOverlayRef}
            className={`absolute inset-0 z-[80] flex flex-col ${isBroadcast ? 'pointer-events-none' : ''}`}
            style={{
              // Slightly lower than top overlays: safe-area + 90px
              paddingTop: 'calc(env(safe-area-inset-top, 0px) + 90px)',
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
                <div className="flex flex-col items-center gap-1 px-6 py-3 rounded-xl bg-[#111111]/70 backdrop-blur-md border border-white/15 shadow-[0_0_20px_rgba(0,0,0,0.6)]">
                  <span className="text-white text-[10px] font-bold uppercase tracking-widest">⚡ Speed Challenge Result</span>
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
                  className="relative w-full flex-none flex flex-col overflow-hidden"
                  style={{
                    height: LIVE_BATTLE_VIDEO_HEIGHT,
                    filter: liveFilterCss !== 'none' ? liveFilterCss : undefined,
                  }}
                >

                  {/* Battle score: tap bar to hide (keeps battle video + chat visible). Tap VS to show again. */}
                  <div className={`relative z-20 w-full flex-none ${battleScoreBarHidden ? '' : 'bg-[#111111]/95 border-b border-white/10'}`}>
                    {!battleScoreBarHidden ? (
                      <div
                        className="relative w-full overflow-hidden cursor-pointer pointer-events-auto"
                        style={{ minHeight: is4Player ? '20px' : '16px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setBattleScoreBarHidden(true);
                        }}
                        title="Hide score bar"
                      >
                        <div className="absolute inset-0 flex">
                          <div
                            className="h-full transition-[width] duration-[1200ms] ease-out motion-reduce:transition-none"
                            style={{ width: `${leftPct}%`, backgroundImage: 'linear-gradient(90deg, #DC143C, #FF1744, #C41E3A)' }}
                          />
                          <div className="h-full flex-1 min-w-0" style={{ backgroundImage: 'linear-gradient(90deg, #1E90FF, #4169E1, #0047AB)' }} />
                        </div>
                        <div className="relative z-10 flex h-full min-h-[16px] items-center justify-between gap-1.5 px-2 pointer-events-none leading-none">
                          <div className={`flex min-w-0 flex-1 flex-col items-start justify-center gap-0 ${hideRedScore ? 'opacity-0' : ''}`}>
                            <AnimatedScore value={typeof redTeamScore === 'number' && Number.isFinite(redTeamScore) ? redTeamScore : 0} durationMs={0} format={formatCoinsShort} className="text-white font-black text-[11px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" />
                            {is4Player && (
                              <span className="text-[5px] text-white/80 tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                                P1 {battleServerTotals.h} + P3 {battleServerTotals.p3}
                              </span>
                            )}
                          </div>
                          <div className={`flex min-w-0 flex-1 flex-col items-end justify-center gap-0 ${hideBlueScore ? 'opacity-0' : ''}`}>
                            <AnimatedScore value={typeof blueTeamScore === 'number' && Number.isFinite(blueTeamScore) ? blueTeamScore : 0} durationMs={0} format={formatCoinsShort} className="text-white font-black text-[11px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" />
                            {is4Player && (
                              <span className="text-[5px] text-white/80 tabular-nums leading-none text-right drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                                P2 {battleServerTotals.o} + P4 {battleServerTotals.p4}
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
                    {/* Match timer — flush under battle score bar (0mm gap); SPEED beside timer when active */}
                    <div className={`absolute left-0 right-0 z-30 flex justify-center m-0 p-0 ${battleScoreBarHidden ? 'top-0 pointer-events-auto' : 'top-full pointer-events-none'}`}>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 bg-black/35 backdrop-blur-md rounded-full px-2.5 py-1 border border-white/12 shadow-none pointer-events-auto"
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

                  {/* Grid Container — ref for spectator tap→vote mapping */}
                  <div ref={battleVoteGridRef} className="flex-1 min-h-0 flex flex-col relative">
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
                    {/* Row 1: P1 & P2 — equal joined panes */}
                    <div className="flex flex-1 min-h-0 gap-0">
                      <div
                        className="flex-1 basis-0 min-w-0 h-full overflow-hidden relative bg-[#111111] pointer-events-auto"
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
                        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-1 bg-[#111111]">
                          {(user?.avatar || myAvatar) ? (
                            <img src={user?.avatar || myAvatar || ''} alt="" className="w-12 h-12 rounded-full object-cover object-center" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-[#111111] flex items-center justify-center">
                              <span className="text-lg font-black text-[#E8D5A3]/60">{(creatorName || user?.username || 'Me').charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <span className="text-white font-bold text-[10px] truncate max-w-full px-1">{creatorName || user?.username || user?.name || 'Me'}</span>
                        </div>
                      )}
                      {/* P1 close — top outer corner (top-left), away from VS timer */}
                      <div className="absolute top-3 left-1.5 z-40 pointer-events-auto">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); closeLiveWithSlide(); }}
                          aria-label="Close"
                          className="flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                        >
                          <X size={14} strokeWidth={2.35} className="text-[#D4AF37]" />
                        </button>
                      </div>
                      {/* P1 mic + cam — icons only */}
                      <div className="absolute bottom-3 right-1.5 z-40 pointer-events-auto flex items-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); togglePlayerMute('me'); }}
                          aria-label={mutedPlayers['me'] ? 'Unmute' : 'Mute'}
                          className="flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                        >
                          {mutedPlayers['me']
                            ? <MicOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />
                            : <Mic className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleCam(); }}
                          aria-label={isCamOff ? 'Cam On' : 'Cam Off'}
                          className="flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                        >
                          {isCamOff
                            ? <CameraOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />
                            : <Camera className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                        </button>
                      </div>


                      {battleWinner && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${battleWinner === 'me' ? 'text-white' : battleWinner === 'draw' ? 'text-white' : 'text-white/60'}`}>
                            {battleWinner === 'me' ? 'WIN' : battleWinner === 'draw' ? 'DRAW' : 'LOSS'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div
                      className="flex-1 basis-0 min-w-0 h-full overflow-hidden relative bg-[#111111] pointer-events-auto"
                    >
                      {battleSlots[0].status === 'accepted' ? (
                        <div className="w-full h-full relative bg-[#111111]">
                          <video ref={(el) => { opponentVideoRef.current = el; if (el) prepareLiveVideoEl(el); }} className={`absolute inset-0 w-full h-full object-cover z-10 ${LIVE_WEBRTC_VIDEO_CLASS}`} autoPlay playsInline muted controls={false} poster={LIVE_VIDEO_TRANSPARENT_POSTER} style={cameraOffPlayers['opponent'] ? { display: 'none' } : undefined} />
                          {cameraOffPlayers['opponent'] && (
                            <div className="absolute inset-0 z-[11] flex flex-col items-center justify-center gap-2 bg-[#111111]">
                              {battleSlots[0].avatar ? (
                                <img src={battleSlots[0].avatar} alt="" className="w-16 h-16 rounded-full object-cover object-center" />
                              ) : (
                                <div className="w-16 h-16 rounded-full bg-[#111111] flex items-center justify-center">
                                  <span className="text-2xl font-black text-[#E8D5A3]/60">{(battleSlots[0].name || 'P').charAt(0).toUpperCase()}</span>
                                </div>
                              )}
                              <span className="text-white font-bold text-xs">{battleSlots[0].name}</span>
                            </div>
                          )}
                          {!hasOpponentStream && !cameraOffPlayers['opponent'] && (
                            <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 bg-[#111111]">
                              {battleSlots[0].avatar ? (
                                <img src={battleSlots[0].avatar} alt={battleSlots[0].name} className="w-16 h-16 rounded-full object-cover object-center" />
                              ) : (
                                <div className="w-16 h-16 rounded-full bg-[#111111] flex items-center justify-center">
                                  <span className="text-2xl font-black text-[#D4AF37]">{(battleSlots[0].name || 'P').charAt(0).toUpperCase()}</span>
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
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#111111]">
                          <img src={battleSlots[0].avatar} alt={battleSlots[0].name} className="w-12 h-12 rounded-full object-cover object-center opacity-60" />
                          <div className="w-5 h-5 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
                          <span className="text-white text-[10px] font-bold">Waiting...</span>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#111111]/80 pointer-events-auto" onClick={(e) => { e.stopPropagation(); setShowViewerList(false); setIsFindCreatorsOpen(true); }}>
                          <div className="w-12 h-12 rounded-full flex items-center justify-center">
                            <span className="text-white/30 text-2xl">+</span>
                          </div>
                          <span className="text-white/40 text-[10px] font-bold">Add creator</span>
                        </div>
                      )}

                      {battleSlots[0].status !== 'empty' && (
                        <>
                          {/* P2 close/remove — top outer corner (top-right), away from VS timer */}
                          <div className="absolute top-3 right-1.5 z-10 pointer-events-auto">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removePlayerFromSlot(0); }}
                              aria-label="Remove"
                              className="flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                            >
                              <X size={14} className="text-[#D4AF37]" strokeWidth={2.25} />
                            </button>
                          </div>
                          {/* P2 mic + cam — icons only */}
                          <div className="absolute bottom-3 left-1.5 z-10 pointer-events-auto flex items-end gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); togglePlayerMute('opponent'); }}
                              aria-label={mutedPlayers['opponent'] ? 'Unmute' : 'Mute'}
                              className="flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                            >
                              {mutedPlayers['opponent']
                                ? <MicOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />
                                : <Mic className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); togglePlayerCamera('opponent'); }}
                              aria-label={cameraOffPlayers['opponent'] ? 'Cam On' : 'Cam Off'}
                              className="flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                            >
                              {cameraOffPlayers['opponent']
                                ? <CameraOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />
                                : <Camera className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                            </button>
                          </div>
                        </>
                      )}

                      <div 
                        className="absolute bottom-1 right-1 flex items-center cursor-pointer hover:scale-105 transition-transform active:scale-95 pointer-events-auto"
                        onClick={(e) => { e.stopPropagation(); openMiniProfile(battleSlots[0].name); }}
                      >
                        {lastGifts.opponent && (
                          <div className="w-5 h-5 rounded-full bg-[#111111] border border-[#C9A227]/40 overflow-hidden flex items-center justify-center drop-shadow-md z-10 relative">
                            <img src={lastGifts.opponent} alt="gift" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div 
                          className={`h-4 flex items-center rounded-full text-[8px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] relative z-0 bg-[#111111]/40 backdrop-blur-md border border-white/10 ${lastGifts.opponent ? '-ml-2 pl-3 pr-1.5' : 'px-1.5'}`}
                        >
                          {battleSlots[0].status !== 'empty' ? battleSlots[0].name : 'P2'}
                        </div>
                      </div>

                      {battleWinner && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${battleWinner === 'opponent' ? 'text-white' : battleWinner === 'draw' ? 'text-white' : 'text-white/60'}`}>
                            {battleWinner === 'opponent' ? 'WIN' : battleWinner === 'draw' ? 'DRAW' : 'LOSS'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 2: P3 & P4 — only when 4 players, same joined container */}
                  {is4Player && (
                    <div className="flex flex-1 min-h-0 gap-0">
                      <div
                        className="flex-1 basis-0 min-w-0 h-full overflow-hidden relative bg-[#111111] pointer-events-auto"
                      >
                        {battleSlots[1].status === 'accepted' ? (
                          <div className="w-full h-full relative bg-[#111111]">
                            <video ref={(el) => { player3VideoRef.current = el; if (el) prepareLiveVideoEl(el); }} className={`w-full h-full object-cover ${LIVE_WEBRTC_VIDEO_CLASS}`} autoPlay playsInline muted controls={false} poster={LIVE_VIDEO_TRANSPARENT_POSTER} style={player3VideoRef.current?.srcObject && !cameraOffPlayers['player3'] ? {} : { display: 'none' }} />
                            {cameraOffPlayers['player3'] && (
                              <div className="absolute inset-0 z-[11] flex flex-col items-center justify-center gap-1 bg-[#111111]">
                                {battleSlots[1].avatar ? (
                                  <img src={battleSlots[1].avatar} alt="" className="w-12 h-12 rounded-full object-cover object-center" />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-[#111111] flex items-center justify-center">
                                    <span className="text-lg font-black text-[#E8D5A3]/60">{(battleSlots[1].name || '?').charAt(0).toUpperCase()}</span>
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
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#111111]">
                            <img src={battleSlots[1].avatar} alt={battleSlots[1].name} className="w-12 h-12 rounded-full object-cover object-center opacity-60" />
                            <div className="w-5 h-5 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
                            <span className="text-white text-[10px] font-bold">Waiting...</span>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#111111]/80 pointer-events-auto" onClick={(e) => { e.stopPropagation(); setShowViewerList(false); setIsFindCreatorsOpen(true); }}>
                            <div className="w-12 h-12 rounded-full flex items-center justify-center">
                              <span className="text-white/30 text-2xl">+</span>
                            </div>
                            <span className="text-white/40 text-[10px] font-bold">Add creator</span>
                          </div>
                        )}

                        {battleSlots[1].status !== 'empty' && (
                          <div className="absolute top-1 right-1 z-10 pointer-events-auto flex items-end gap-1.5">
                            <button type="button" className="flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95" onClick={(e) => { e.stopPropagation(); togglePlayerMute('player3'); }}>
                              {mutedPlayers['player3'] ? <MicOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} /> : <Mic className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                              <span className="text-[7px] font-semibold text-white/85 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">{mutedPlayers['player3'] ? 'Unmute' : 'Mute'}</span>
                            </button>
                            <button type="button" className="flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95" onClick={(e) => { e.stopPropagation(); removePlayerFromSlot(1); }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF4D6A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                              <span className="text-[7px] font-semibold text-white/85 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">Remove</span>
                            </button>
                        </div>
                      )}

                      <div 
                        className="absolute bottom-1 left-1 flex items-center cursor-pointer hover:scale-105 transition-transform active:scale-95 pointer-events-auto"
                        onClick={(e) => { e.stopPropagation(); openMiniProfile(battleSlots[1].name); }}
                      >
                        {lastGifts.player3 && (
                          <div className="w-5 h-5 rounded-full bg-[#111111] border border-[#C9A227]/40 overflow-hidden flex items-center justify-center drop-shadow-md z-10 relative">
                            <img src={lastGifts.player3} alt="gift" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div 
                          className={`h-4 flex items-center rounded-full text-[8px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] relative z-0 ${lastGifts.player3 ? '-ml-2 pl-3 pr-1.5' : 'px-1.5'}`}
                          style={{ background: 'linear-gradient(135deg, rgba(0,200,83,0.7), rgba(0,200,83,0.3))' }}
                        >
                          {battleSlots[1].status !== 'empty' ? battleSlots[1].name : 'P3'}
                        </div>
                      </div>

                      {battleWinner && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${battleWinner === 'me' ? 'text-white' : battleWinner === 'draw' ? 'text-white' : 'text-white/60'}`}>
                              {battleWinner === 'me' ? 'WIN' : battleWinner === 'draw' ? 'DRAW' : 'LOSS'}
                            </span>
                          </div>
                        )}
                      </div>
                      <div
                        className="flex-1 basis-0 min-w-0 h-full overflow-hidden relative bg-[#111111] pointer-events-auto"
                      >
                        {battleSlots[2].status === 'accepted' ? (
                          <div className="w-full h-full relative bg-[#111111]">
                            <video ref={(el) => { player4VideoRef.current = el; if (el) prepareLiveVideoEl(el); }} className={`w-full h-full object-cover ${LIVE_WEBRTC_VIDEO_CLASS}`} autoPlay playsInline muted controls={false} poster={LIVE_VIDEO_TRANSPARENT_POSTER} style={player4VideoRef.current?.srcObject && !cameraOffPlayers['player4'] ? {} : { display: 'none' }} />
                            {cameraOffPlayers['player4'] && (
                              <div className="absolute inset-0 z-[11] flex flex-col items-center justify-center gap-1 bg-[#111111]">
                                {battleSlots[2].avatar ? (
                                  <img src={battleSlots[2].avatar} alt="" className="w-12 h-12 rounded-full object-cover object-center" />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-[#111111] flex items-center justify-center">
                                    <span className="text-lg font-black text-[#E8D5A3]/60">{(battleSlots[2].name || '?').charAt(0).toUpperCase()}</span>
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
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#111111]">
                            <img src={battleSlots[2].avatar} alt={battleSlots[2].name} className="w-12 h-12 rounded-full object-cover object-center opacity-60" />
                            <div className="w-5 h-5 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
                            <span className="text-white text-[10px] font-bold">Waiting...</span>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#111111]/80 pointer-events-auto" onClick={(e) => { e.stopPropagation(); setShowViewerList(false); setIsFindCreatorsOpen(true); }}>
                            <div className="w-12 h-12 rounded-full flex items-center justify-center">
                              <span className="text-white/30 text-2xl">+</span>
                            </div>
                            <span className="text-white/40 text-[10px] font-bold">Add creator</span>
                          </div>
                        )}

                        {battleSlots[2].status !== 'empty' && (
                          <div className="absolute top-1 right-1 z-10 pointer-events-auto flex items-end gap-1.5">
                            <button type="button" className="flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95" onClick={(e) => { e.stopPropagation(); togglePlayerMute('player4'); }}>
                              {mutedPlayers['player4'] ? <MicOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} /> : <Mic className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                              <span className="text-[7px] font-semibold text-white/85 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">{mutedPlayers['player4'] ? 'Unmute' : 'Mute'}</span>
                            </button>
                            <button type="button" className="flex flex-col items-center gap-0.5 border-0 bg-transparent p-0 hover:opacity-90 active:scale-95" onClick={(e) => { e.stopPropagation(); removePlayerFromSlot(2); }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF4D6A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                              <span className="text-[7px] font-semibold text-white/85 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">Remove</span>
                            </button>
                        </div>
                      )}

                      <div 
                        className="absolute bottom-1 right-1 flex items-center cursor-pointer hover:scale-105 transition-transform active:scale-95 pointer-events-auto"
                        style={{ right: '2.5rem' }}
                        onClick={(e) => { e.stopPropagation(); openMiniProfile(battleSlots[2].name); }}
                      >
                        {lastGifts.player4 && (
                          <div className="w-5 h-5 rounded-full bg-[#111111] border border-[#C9A227]/40 overflow-hidden flex items-center justify-center drop-shadow-md z-10 relative">
                            <img src={lastGifts.player4} alt="gift" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div 
                          className={`h-4 flex items-center rounded-full text-[8px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] relative z-0 ${lastGifts.player4 ? '-ml-2 pl-3 pr-1.5' : 'px-1.5'}`}
                          style={{ background: 'linear-gradient(135deg, rgba(156,39,176,0.7), rgba(156,39,176,0.3))' }}
                        >
                          {battleSlots[2].status !== 'empty' ? battleSlots[2].name : 'P4'}
                        </div>
                      </div>

                      {battleWinner && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${battleWinner === 'opponent' ? 'text-white' : battleWinner === 'draw' ? 'text-white' : 'text-white/60'}`}>
                              {battleWinner === 'opponent' ? 'WIN' : battleWinner === 'draw' ? 'DRAW' : 'LOSS'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

            <div className="absolute bottom-1 left-0 right-0 px-3 py-2 flex items-center justify-between flex-none pointer-events-none relative z-30" style={{ transform: 'translateY(1mm)' }}>
              <div
                className="flex items-end gap-[0mm] min-w-0 flex-1 justify-start pointer-events-auto"
                style={{ transform: `translateX(-${BATTLE_MVP_ROW_EDGE_OFFSET_MM}mm)` }}
                onClick={() => openTopGiftersPanel('host')}
                title="Top gifters — red side"
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
                    <div className={isMvp ? 'rounded-full ring-2 ring-[#D4AF37] p-[1px] shadow-[0_0_6px_rgba(212,175,55,0.55)]' : 'rounded-full'}>
                      <AvatarRing
                        src={resolveCircleAvatar(viewer.avatar, label)}
                        alt={label}
                        size={LIVE_MVP_PROFILE_RING_PX}
                      />
                    </div>
                    {isMvp && (
                      <span className="absolute top-[22px] left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#D4AF37] text-black text-[6px] font-black leading-none tracking-wide">
                        MVP
                      </span>
                    )}
                    <span className="mt-1.5 text-white text-[7px] font-semibold truncate max-w-full leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                      {label}
                    </span>
                    <span className="text-[#D4AF37] text-[7px] font-black tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                      {formatCoinsShort(gifted)}
                    </span>
                  </div>
                  );
                })}
              </div>
              <div
                className="flex items-end gap-[0mm] min-w-0 flex-1 justify-end pointer-events-auto"
                style={{ transform: `translateX(${BATTLE_MVP_ROW_EDGE_OFFSET_MM}mm)` }}
                onClick={() => openTopGiftersPanel('opponent')}
                title="Top gifters — blue side"
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
                    <div className={isMvp ? 'rounded-full ring-2 ring-[#D4AF37] p-[1px] shadow-[0_0_6px_rgba(212,175,55,0.55)]' : 'rounded-full'}>
                      <AvatarRing
                        src={resolveCircleAvatar(viewer.avatar, label)}
                        alt={label}
                        size={LIVE_MVP_PROFILE_RING_PX}
                      />
                    </div>
                    {isMvp && (
                      <span className="absolute top-[22px] left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#D4AF37] text-black text-[6px] font-black leading-none tracking-wide">
                        MVP
                      </span>
                    )}
                    <span className="mt-1.5 text-white text-[7px] font-semibold truncate max-w-full leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                      {label}
                    </span>
                    <span className="text-[#D4AF37] text-[7px] font-black tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                      {formatCoinsShort(gifted)}
                    </span>
                  </div>
                  );
                })}
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
              {/* Top Bar — always show creator layout for everyone */}
                <div className="absolute top-0 left-0 right-0 z-[110] pointer-events-none">
                  <div className="px-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="pointer-events-auto flex flex-col gap-2">
                        {/* BROADCASTER INFO — photo profile (MVP circles untouched) */}
                        <div className="px-0 py-1 animate-luxury-fade-in relative">
                          <LiveHostProfileHeader
                            name={myCreatorName}
                            avatar={resolveCircleAvatar(myAvatar, myCreatorName)}
                            likes={typeof activeLikes === 'number' && Number.isFinite(activeLikes) ? activeLikes : 0}
                            level={userLevel}
                            avatarSize={LIVE_TOP_AVATAR_RING_PX}
                            showFollow={!isBroadcast && !isFollowing}
                            onAvatarClick={() => {
                              void openMiniProfile(myCreatorName, undefined, { userId: user?.id, avatar: myAvatar, level: userLevel });
                            }}
                            onLike={(e) => {
                              handleLikeTap(e);
                            }}
                            onFollow={followCreatorLive}
                            joinSlot={
                              (isBroadcast || isFollowing) ? (
                              <LiveJoinPill
                                hasJoinedToday={hasJoinedToday}
                                onJoin={async (e) => {
                                  e.stopPropagation();
                                  if (!isBroadcast && !isFollowing) {
                                    showToast('Follow first to give a membership heart');
                                    return;
                                  }
                                  if (hasJoinedToday) {
                                    setShowTeamStatus(true);
                                    return;
                                  }
                                  if (!user?.id || !effectiveStreamId) return;
                                  const today = new Date().toISOString().split('T')[0];
                                  const storageKey = `joined_stream_${effectiveStreamId}_${user.id}_${today}`;
                                  localStorage.setItem(storageKey, 'true');

                                  const heartKey = `my_heart_count_${effectiveStreamId}_${user.id}`;
                                  const newCount = myHeartCount + 1;
                                  localStorage.setItem(heartKey, newCount.toString());
                                  setMyHeartCount(newCount);

                                  setMemberCount(prev => prev + 1);
                                  setHasJoinedToday(true);
                                  setShowTeamStatus(true);

                                  const joinBannerId = Date.now().toString();
                                  const newMessage: LiveMessage = {
                                    id: joinBannerId,
                                    username: 'You',
                                    text: '❤️ Joined the team!',
                                    level: userLevel,
                                    isGift: false,
                                    avatar: '/royce/elix-mark.svg',
                                    isSystem: true,
                                    membershipIcon: '/royce/membership.svg',
                                  };
                                  setMessages(prev => appendCapped(prev, newMessage, LIVE_CHAT_MESSAGE_CAP));
                                  window.setTimeout(() => {
                                    setMessages(prev => prev.filter(m => m.id !== joinBannerId));
                                  }, 5000);
                                  spawnHeartFromClient(e.clientX, e.clientY, undefined, 'You', '/royce/elix-mark.svg');

                                  if (!isBroadcast) {
                                    const creatorId = effectiveStreamId;
                                    try {
                                      await request('/api/hearts/daily', {
                                        method: 'POST',
                                        body: JSON.stringify({ creatorId }),
                                      });
                                    } catch {
                                      /* local join already applied */
                                    }
                                  }
                                }}
                              />
                              ) : null
                            }
                          />
                          {currentUniverse && (
                            <div className="mt-1 flex items-center gap-1 bg-[#111111]/90 rounded-full px-2.5 py-1 border border-[#D4AF37]/80 shadow-sm pointer-events-auto relative z-20">
                              <span className="text-[#F5E6A8] text-[11px] font-bold whitespace-nowrap truncate max-w-[140px]">✨ {universeText} ✨</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pointer-events-auto flex items-center gap-[0mm] mt-1">
                        {topMvpViewers.length > 0 ? (
                          <div
                            className="flex items-center gap-[0mm] pointer-events-auto flex-shrink-0"
                            style={{ transform: 'translateX(-2mm)' }}
                            onClick={() => openTopGiftersPanel('all')}
                            title="Top viewers & gifters"
                          >
                            {topMvpViewers.slice(0, 1).map((viewer) => {
                              const isMvp = (mvpGiftScores[viewer.id] ?? 0) > 0;
                              return (
                              <div
                                key={`top-viewers-${viewer.id}`}
                                className="relative"
                              >
                                <div className={isMvp ? 'rounded-full ring-2 ring-[#D4AF37] p-[1px] shadow-[0_0_6px_rgba(212,175,55,0.55)]' : 'rounded-full'}>
                                  <AvatarRing
                                    src={resolveCircleAvatar(viewer.avatar, viewer.displayName || viewer.username)}
                                    alt={viewer.displayName || viewer.username || ''}
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
                        <button
                          type="button"
                          title="Spectators & invite"
                          onClick={openSpectatorsPanel}
                          className="flex items-center gap-1.5 px-0 py-1 rounded-full bg-transparent border-0 active:scale-95 transition-transform pointer-events-auto"
                          style={{ marginRight: '1mm' }}
                        >
                          <span className="text-white text-[9px] font-bold tabular-nums">{formatCountShort(viewerCount)}</span>
                          <UserPlus size={16} className="text-[#D4AF37]" strokeWidth={2.2} />
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
                    {/* Capsules right-aligned — left clear for battle gloves */}
                    <LiveMarkedSubHeaderBar
                      rank={diamondLeagueRank}
                      onDiamond={() => {
                        setRankingInitialTab('daily');
                        setShowRankingPanel(true);
                      }}
                      onMembership={() => {
                        setShowFanClub(true);
                      }}
                      onWeeklyRanking={() => {
                        setRankingInitialTab('weekly');
                        setShowRankingPanel(true);
                      }}
                      onExplore={() => {
                        setShowViewerList(false);
                        setIsFindCreatorsOpen(true);
                      }}
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

            {/* MIDDLE ZONE: CHAT (Scrollable) — floating hearts only here, not over battle/video */}
            <div
              className="chat-zone fixed left-0 right-0 z-[100] flex justify-center pointer-events-none"
              style={{
                bottom: LIVE_BOTTOM_ACTION_RESERVE,
                transform: isBattleMode ? `translateY(${LIVE_BATTLE_CHAT_SHIFT_Y})` : undefined,
              }}
            >
              <div
                className="w-full max-w-[480px] relative"
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
                  className="relative z-[10] h-full overflow-y-auto pointer-events-auto bg-transparent"
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

      {/* Mission dock (combo button is separate — TikTok pink round tap) */}
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
            onViewAllSupporters={() => openTopGiftersPanel('all')}
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
                onClick={(e) => { e.stopPropagation(); void handleComboClick(); }}
                disabled={comboCount >= GIFT_COMBO_MAX}
                className="w-[72px] h-[72px] rounded-full bg-gradient-to-b from-[#FF5A7A] to-[#FF2D55] flex flex-col items-center justify-center active:scale-90 transition-transform shadow-[0_0_18px_rgba(255,45,85,0.55)] border-2 border-white/30 disabled:opacity-50"
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
        className="bottom-zone pointer-events-auto bg-transparent px-3 pt-0 flex flex-col items-end fixed left-0 right-0 bottom-0 z-[50002] justify-end"
        style={{ paddingBottom: LIVE_BOTTOM_ACTION_PADDING }}
      >
        <div className="w-full max-w-[480px] mx-auto flex flex-col items-end gap-0">
        <div className="flex flex-col items-end">
          {/* Spectator bar — watch + gift only. Never shown to a broadcasting host or a battle-playing creator. */}
          {!isCreatorParticipant && (
            <div className="flex items-end gap-2 w-full max-w-[480px] pointer-events-auto">
              <form className="flex-1 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full px-3 py-2 border border-white/10 h-10 min-w-0" onSubmit={(e) => { e.preventDefault(); handleSendMessage(e); }}>
                <input type="text" inputMode="text" enterKeyHint="send" autoComplete="off" placeholder="Say something..." className="bg-transparent text-white text-xs outline-none flex-1 placeholder:text-white/30 min-w-0" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
                {inputValue.trim() && <button type="submit" title="Send message" className="text-[#D4AF37] flex-shrink-0"><Send size={16} /></button>}
              </form>
              <div className="flex flex-col items-center gap-0.5">
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
                  className={`${LIVE_BOTTOM_ICON_BTN} relative`}
                >
                  <BarChart3 size={20} className="text-[#38BDF8] relative z-[2]" strokeWidth={2.2} />
                </button>
                <span className="text-white/60 text-[8px] font-medium">Poll</span>
              </div>
              <button
                type="button"
                title={spectatorCoHostRequestSent ? 'Request sent' : 'Co-Host'}
                disabled={spectatorCoHostRequestSent || !user?.id}
                onClick={async () => {
                  if (!user?.id || !effectiveStreamId || spectatorCoHostRequestSent) return;
                  const requesterName = user?.username || user?.name || 'Someone';
                  websocket.send('cohost_request_send', {
                    hostUserId: effectiveStreamId,
                    requesterName,
                    requesterAvatar: user?.avatar || '',
                  });
                  setSpectatorCoHostRequestSent(true);
                }}
                className={`${LIVE_BOTTOM_ICON_BTN} relative disabled:opacity-60`}
              >
                <span className="flex items-center justify-center w-full h-full relative z-[2]"><UserPlus size={20} className="text-[#D4AF37] shrink-0" strokeWidth={2} /></span>
</button>
              <button type="button" title="Send gift" onClick={() => { setSelectedCohostGiftUserId(null); setShowGiftPanel(true); }} className={`${LIVE_BOTTOM_ICON_BTN} relative`}>
                <Gift size={20} className="text-[#D4AF37] relative z-[2]" />
</button>
              <button type="button" title="Share" onClick={() => setShowSharePanel(true)} className={`${LIVE_BOTTOM_ICON_BTN} relative`}>
                <Share2 size={20} className="text-[#D4AF37] relative z-[2]" />
</button>
              <button type="button" title="More options" onClick={() => setIsMoreMenuOpen(true)} className={`${LIVE_BOTTOM_ICON_BTN} relative`}>
                <MoreVertical size={20} className="text-[#D4AF37] relative z-[2]" />
</button>
            </div>
          )}

          {/* Creator bottom bar (Co-Host, Battle, Share, More). Host and battle-playing creators — same icons, same bar. */}
          {isCreatorParticipant && !currentGift && (
            <div className="flex items-end gap-2 w-full max-w-[480px] pointer-events-auto">
              <div className="flex items-end justify-center gap-3 flex-shrink-0 flex-1">
              {isBattleMode && battleWinner && isBroadcast && (
                <button 
                  type="button" 
                  onClick={() => {
                    startBattleWithAcceptedCreators();
                    setBattleTime(300);
                    setMyScore(0);
                    setOpponentScore(0);
                    setPlayer3Score(0);
                    setPlayer4Score(0);
                    setBattleWinner(null);
                    setBattleCountdown(null);
                    reachedThresholdsRef.current.clear();
                    roseCountRef.current = 0;
                    setRoseCount(0);
                    battleScreenTapCountRef.current = 0;
                    setBattleScreenTapCount(0);
                  }}  
                  className="px-4 h-10 rounded-full bg-[#111111] backdrop-blur-md flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                >
                  <RefreshCw size={20} className="text-[#D4AF37] mr-2" />
                  <span className="text-[#D4AF37] text-xs font-bold">Rematch</span>
                </button>
              )}
              {/* Co-Host belongs to NORMAL live only. During a battle it is hidden so
                  it can never invite anyone as co-host into a match — battle creators
                  are invited from the Battle button / empty battle slots instead. */}
              {!isBattleMode && (
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    onClick={openSpectatorsPanel}
                    className={`${LIVE_BOTTOM_ICON_BTN} relative`}
                  >
                    <span className="flex items-center justify-center w-full h-full relative z-[2]"><UserPlus size={20} className="text-[#D4AF37] shrink-0" strokeWidth={2} /></span>
</button>
                  <span className="text-white/60 text-[8px] font-medium">Co-Host</span>
                </div>
              )}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowViewerList(false);
                    if (!isBattleMode) toggleBattle();
                    else setIsFindCreatorsOpen(true);
                  }}
                  className={`${LIVE_BOTTOM_ICON_BTN} relative`}
                >
                  <Users size={20} className="text-[#D4AF37] relative z-[2]" />
</button>
                <span className="text-white/60 text-[8px] font-medium">Battle</span>
              </div>
              {isBroadcast && (
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    title="Poll"
                    onClick={() => {
                      {
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
                      }
                      showToast('Poll started — viewers tap Poll');
                    }}
                    className={`${LIVE_BOTTOM_ICON_BTN} relative`}
                  >
                    <BarChart3 size={20} className="text-[#38BDF8] relative z-[2]" strokeWidth={2.2} />
                  </button>
                  <span className="text-white/60 text-[8px] font-medium">Poll</span>
                </div>
              )}
              <div className="flex flex-col items-center gap-0.5">
                <button type="button" title="Share" onClick={() => setShowSharePanel(true)} className={`${LIVE_BOTTOM_ICON_BTN} relative`}>
                  <Share2 size={20} className="text-[#D4AF37] relative z-[2]" />
</button>
                <span className="text-white/60 text-[8px] font-medium">Share</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <button type="button" title="More options" onClick={() => setIsMoreMenuOpen(true)} className={`${LIVE_BOTTOM_ICON_BTN} relative`}>
                  <MoreVertical size={20} className="text-[#D4AF37] relative z-[2]" />
</button>
                <span className="text-white/60 text-[8px] font-medium">More</span>
              </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Gift panel: spectators from bar; anyone (incl. host) after tapping a co-host tile. */}
      {showGiftPanel && (!isCreatorParticipant || !!selectedCohostGiftUserId) && (
        <>
          <div className="fixed inset-0 bg-black/50 pointer-events-auto" style={{ zIndex: 99998 }} onClick={() => { setShowGiftPanel(false); setSelectedCohostGiftUserId(null); }} />
          <div className="fixed bottom-0 left-0 right-0 pointer-events-auto max-w-[480px] mx-auto" style={{ zIndex: 99999 }}>
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

      {/* Single co-host panel: Join requests & Spectators (viewer list). No duplicate Invite Co-Hosts panel. */}

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
                  : () => {
                      setShowRankingPanel(false);
                      setShowGiftPanel(true);
                    }
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
            className="absolute inset-0 bg-black/40 pointer-events-auto" 
            onClick={() => {
              (document.activeElement as HTMLElement)?.blur();
              setIsFindCreatorsOpen(false);
              setCreatorQuery('');
            }}
          />
          <div
            className="bg-[#111111]/95 backdrop-blur-md rounded-t-2xl h-[40vh] flex flex-col shadow-2xl pointer-events-auto w-full relative z-10 overflow-hidden pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>
            {/* Header — title centered */}
            <div className="flex items-center justify-center px-4 py-2 flex-shrink-0">
              <span className="text-white font-bold text-[13px]">Creators</span>
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
                    <div className="w-5 h-5 border-2 border-[#C9A227]/40 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : null}
                {filteredCreators.length === 0 && creatorsLoadFailed ? (
                  <div className="py-6 flex justify-center">
                    <button type="button" onClick={() => loadCreators()} className="px-3 py-1.5 rounded-lg bg-[#C9A227]/20 border border-[#C9A227]/40 text-[#D4AF37] text-[10px] font-bold active:scale-95">
                      Retry
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Start Match Button — host only: the server only accepts battle_create from the room owner */}
            {isBroadcast && battleSlots.some(s => s.status === 'accepted') && (
              <div className="px-4 py-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsFindCreatorsOpen(false);
                    startBattleWithAcceptedCreators();
                  }}
                  className="w-full py-2.5 bg-[#D4AF37] text-black text-xs font-bold rounded-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
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
              className="bg-[#111111] rounded-t-2xl border-t border-white/10 px-4 pt-4 pb-[calc(20px+env(safe-area-inset-bottom))] pointer-events-auto shadow-2xl relative z-10"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="relative -mt-4 flex-shrink-0">
                    <AvatarRing src={typeof miniProfile.avatar === 'string' ? miniProfile.avatar : ''} alt={typeof miniProfile.username === 'string' ? miniProfile.username : 'User'} size={56} />
                  </div>
                  <div className="min-w-0 pt-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="text-white font-black text-[16px] truncate">{typeof miniProfile.username === 'string' ? miniProfile.username : 'User'}</div>
                      {miniProfile?.id && moderators.has(miniProfile.id) && (
                        <User className="w-3.5 h-3.5 text-[#D4AF37] flex-shrink-0" strokeWidth={2.25} aria-hidden />
                      )}
                      <LevelBadge
                        level={typeof miniProfile.level === 'number' ? miniProfile.level : userLevel}
                        layout="fixed"
                        hideCircle
                      />
                    </div>
                    {miniProfile.coins != null && (
                      <div className="text-white/70 text-[12px] font-bold">
                        🪙 {formatCoinsShort(miniProfile.coins)}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-white/50">
                      <div className="flex items-center gap-1">
                        <span className="text-white font-bold tabular-nums">{formatCountShort(miniProfile.followers_count ?? 0)}</span>
                        <span>Followers</span>
                      </div>
                      <div className="w-px h-2 bg-white/20" />
                      <div className="flex items-center gap-1">
                        <span className="text-white font-bold tabular-nums">{formatCountShort(miniProfile.following_count ?? 0)}</span>
                        <span>Following</span>
                      </div>
                    </div>

                    {miniProfile.bio && (
                      <div className="mt-2 text-[11px] text-white/80 leading-snug line-clamp-2">
                        {miniProfile.bio}
                      </div>
                    )}

                    {miniProfile.donated != null && miniProfile.donated > 0 && (
                      <div className="text-white text-[11px] font-bold mt-2 pt-2 border-t border-white/10">
                        Donated: {formatCoinsShort(miniProfile.donated)} coins
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-4 gap-2">
                {!(miniProfile?.id && user?.id && miniProfile.id === user.id) && (
                <button
                  type="button"
                  onClick={() => void handleMiniProfileFollowToggle()}
                  className={`h-9 rounded-lg text-[11px] active:scale-95 transition-all ${
                    miniProfile?.id &&
                    (miniProfileFollowsThem === true ||
                      (miniProfileFollowsThem === undefined && followingUsers.includes(miniProfile.id)))
                      ? 'bg-white/10 text-white border border-white/10 font-bold'
                      : 'bg-[#D4AF37] text-black font-black hover:bg-[#C9A227]/90'
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
                  onClick={() => {
                    closeMiniProfile();
                    navigate(`/profile/${miniProfile.id ?? miniProfile.username}`);
                  }}
                  className="h-9 rounded-lg bg-white/10 text-white text-[11px] font-bold hover:bg-white/20 active:scale-95 transition-all"
                >
                  Profile
                </button>
                <button type="button" onClick={() => void handleMiniProfileShare()} className="h-9 rounded-lg bg-white/10 text-white text-[11px] font-bold hover:bg-white/20 active:scale-95 transition-all">
                  Share
                </button>
              </div>
              {/* Moderator actions — only creator and mods see these */}
              {(isBroadcast || (miniProfile?.id && moderators.has(user?.id || ''))) && miniProfile?.id && miniProfile.id !== user?.id && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {isBroadcast && (
                    <button type="button" onClick={() => {
                      if (!miniProfile?.id) return;
                      setModerators(prev => {
                        const next = new Set(prev);
                        const mpId = miniProfile.id as NonNullable<typeof miniProfile.id>;
                        if (next.has(mpId)) { next.delete(mpId); showToast(`@${miniProfile.username} removed as moderator`); }
                        else { next.add(mpId); showToast(`@${miniProfile.username} is now a moderator`); }
                        return next;
                      });
                      closeMiniProfile();
                    }} className={`h-9 rounded-lg text-[11px] font-bold active:scale-95 transition-all ${miniProfile?.id && moderators.has(miniProfile.id) ? 'bg-purple-950/50 text-white/70 border border-purple-900/50' : 'bg-purple-600 text-white'}`}>
                      {miniProfile?.id && moderators.has(miniProfile.id) ? 'Remove Mod' : 'Make Mod'}
                    </button>
                  )}
                  <button type="button" onClick={async () => {
                    if (!user?.id || !miniProfile?.id) return;
                    try {
                      await request('/api/block-user', {
                        method: 'POST',
                        body: JSON.stringify({ blockedId: miniProfile.id }),
                      });
                      showToast(`@${miniProfile.username} blocked`);
                      closeMiniProfile();
                    } catch { /* intentionally empty */ }
                  }} className="h-9 rounded-lg bg-black/50 text-white/60 text-[11px] font-bold border border-white/20/50 hover:bg-white/10/50 active:scale-95 transition-all">
                    Block
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══ VIEWER LIST: Top gifters (MVP) OR Join requests & Spectators (invite) ═══ */}
      {showViewerList && (
        <>
          <div
            className="fixed inset-0 bg-black/40 pointer-events-auto"
            style={{ zIndex: 99998 }}
            onClick={() => setShowViewerList(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[999999] pointer-events-auto max-w-[480px] mx-auto">
            <div className="bg-[#111111]/95 backdrop-blur-md rounded-t-2xl h-[36vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>
              <div className="flex items-center justify-between px-4 pb-2">
                <h3 className="text-white font-bold text-sm">
                  {viewerListMode === 'topGifters'
                    ? topGiftersSide === 'host'
                      ? 'Top gifters · Red'
                      : topGiftersSide === 'opponent'
                        ? 'Top gifters · Blue'
                        : 'Top viewers & gifters'
                    : 'Join requests & Spectators'}
                </h3>
                <div className="flex items-center gap-1">
                  <Users size={12} className="text-white/50" />
                  <span className="text-white/60 text-xs font-semibold">
                    {viewerListMode === 'topGifters'
                      ? formatCountShort(topGiftersForPanel.length)
                      : formatCountShort(viewerCount)}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4 min-h-0">
                {viewerListMode === 'topGifters' ? (
                  <>
                    <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider mb-1.5">MVP · Gift coins this live</p>
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
                              <div className={isMvp ? 'rounded-full ring-2 ring-[#D4AF37] p-[1px] shadow-[0_0_6px_rgba(212,175,55,0.55)]' : 'rounded-full'}>
                                <AvatarRing
                                  src={resolveCircleAvatar(v.avatar, displayName)}
                                  alt={displayName}
                                  size={LIVE_MVP_PROFILE_RING_PX}
                                />
                              </div>
                              {isMvp ? (
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-[2] px-1 rounded-full bg-[#D4AF37] text-black text-[6px] font-black leading-none tracking-wide">
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
                            <span className="text-[#D4AF37] text-xs font-bold tabular-nums flex-shrink-0">
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
                  <div className="mb-3 flex items-center gap-2.5 w-full py-1 px-2 rounded-full bg-[#C9A227]/10 border border-[#C9A227]/30">
                    <div
                      className="rounded-full overflow-hidden bg-[#111111] flex-shrink-0"
                      style={{ width: SHARE_PANEL_AVATAR_PX, height: SHARE_PANEL_AVATAR_PX }}
                    >
                      {pendingInvite.hostAvatar ? (
                        <img src={pendingInvite.hostAvatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#D4AF37] font-bold">{pendingInvite.hostName.slice(0, 1).toUpperCase()}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">@{pendingInvite.hostName}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button type="button" onClick={declineBattleInvite} className="h-6 px-3 rounded-full bg-red-500/25 border border-red-400/50 inline-flex items-center justify-center active:scale-95">
                        <span className="text-red-300 text-[10px] font-bold leading-none whitespace-nowrap">Reject</span>
                      </button>
                      <button type="button" onClick={() => void acceptBattleInvite()} className="h-6 px-3.5 rounded-full bg-green-500 inline-flex items-center justify-center active:scale-95">
                        <span className="text-black text-[10px] font-bold leading-none whitespace-nowrap">Join</span>
                      </button>
                    </div>
                  </div>
                )}

                {pendingCohostInvite && (
                  <div className="mb-3 flex items-center gap-2.5 w-full py-1 px-2 rounded-full bg-[#C9A227]/10 border border-[#C9A227]/30">
                    <div
                      className="rounded-full overflow-hidden bg-[#111111] flex-shrink-0"
                      style={{ width: SHARE_PANEL_AVATAR_PX, height: SHARE_PANEL_AVATAR_PX }}
                    >
                      {pendingCohostInvite.hostAvatar ? (
                        <img src={pendingCohostInvite.hostAvatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#D4AF37] font-bold">{pendingCohostInvite.hostName.slice(0, 1).toUpperCase()}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">@{pendingCohostInvite.hostName}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button type="button" onClick={declineCohostInvite} className="h-6 px-3 rounded-full bg-red-500/25 border border-red-400/50 inline-flex items-center justify-center active:scale-95">
                        <span className="text-red-300 text-[10px] font-bold leading-none whitespace-nowrap">Reject</span>
                      </button>
                      <button type="button" onClick={() => void acceptCohostInvite()} className="h-6 px-3.5 rounded-full bg-green-500 inline-flex items-center justify-center active:scale-95">
                        <span className="text-black text-[10px] font-bold leading-none whitespace-nowrap">Join</span>
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider mb-1.5">Spectators</p>
                {activeViewers.length > 0 ? (
                  activeViewers.map((v, i) => {
                    const alreadyInvited = coHosts.some((h) => sameUserId(h.userId, v.id));
                    const isJoinRequester = pendingJoinRequest?.requesterId === v.id;
                    const displayName = liveViewerLabel(v);
                    return (
                      <div
                        key={v.id}
                        className="flex items-center gap-3 w-full py-2 rounded-lg hover:bg-white/[0.03]"
                      >
                        <span className="text-white/30 text-xs font-bold w-5 text-right flex-shrink-0">{i + 1}</span>
                        <button
                          type="button"
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                          onClick={() => { void openMiniProfile(displayName, undefined, { userId: v.id, avatar: v.avatar, level: v.level }); setShowViewerList(false); }}
                        >
                          <LevelBadge
                            level={typeof v.level === 'number' ? v.level : 1}
                            avatar={resolveCircleAvatar(v.avatar, displayName)}
                            layout="fixed"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{displayName}</p>
                            {isJoinRequester ? (
                              <p className="text-white/40 text-[10px] font-medium">Requested to co-host</p>
                            ) : null}
                          </div>
                        </button>
                        {isBroadcast && isMyStreamLive && !isBattleMode && (
                          isJoinRequester ? (
                            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button type="button" onClick={() => { declineJoinRequest(); setShowViewerList(false); }} className="px-2 py-1 rounded-full bg-red-500/20 border border-red-500/30 flex items-center gap-0.5 active:scale-95 transition-transform cursor-pointer">
                                <span className="text-red-400 text-[9px] font-bold">Reject</span>
                              </button>
                              <button type="button" onClick={() => { acceptJoinRequest(); setShowViewerList(false); }} className="px-2.5 py-1 rounded-full bg-green-500 flex items-center gap-0.5 active:scale-95 transition-transform cursor-pointer">
                                <span className="text-black text-[9px] font-bold">Join</span>
                              </button>
                            </div>
                          ) : coHosts.length < MAX_CO_HOSTS && !alreadyInvited ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                inviteCoHost({ id: v.id, name: displayName, avatar: v.avatar });
                                setShowViewerList(false);
                              }}
                              className="px-2.5 py-1 rounded-full bg-[#C9A96E] text-black text-[10px] font-bold flex-shrink-0"
                            >
                              Invite
                            </button>
                          ) : alreadyInvited ? (
                            <span className="text-[#C9A96E] text-[10px] font-semibold flex-shrink-0">Invited</span>
                          ) : null
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Users className="w-7 h-7 text-white/10 mb-2" />
                    <p className="text-white/50 text-sm">No spectators yet</p>
                  </div>
                )}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      
      


      {/* ═══ JOIN ANIMATION OVERLAY ═══ */}
      {showJoinAnimation && (
        <div className="absolute inset-0 z-[99999] flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center animate-in zoom-in-50 duration-300">
            <img 
              src="/royce/membership.svg" 
              alt="Membership" 
              className="w-20 h-20 object-contain drop-shadow-2xl animate-pulse"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <Heart className="w-20 h-20 text-[#D4AF37] fill-[#ffffff] drop-shadow-2xl animate-pulse hidden" />
            <span className="text-white font-black text-2xl mt-2 drop-shadow-lg tracking-wider animate-bounce">JOIN</span>
          </div>
        </div>
      )}

      {/* ═══ TEAM STATUS PANEL (Heart Icon) ═══ */}
      {showTeamStatus && (
        <>
          <div 
            className="fixed inset-0 bg-black/40 pointer-events-auto" 
            style={{ zIndex: 99998 }}
            onClick={() => setShowTeamStatus(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 h-[40vh] z-[99999] pointer-events-auto max-w-[480px] mx-auto">
          <div
            className="bg-[#111111]/95 backdrop-blur-md rounded-t-2xl p-3 pb-safe h-full flex flex-col shadow-2xl w-full overflow-hidden "
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <Heart className="w-3 h-3 text-[#D4AF37]" strokeWidth={2} fill="#D4AF37" />
                <span className="text-gold-metallic font-bold text-sm">Your Team Status</span>
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar min-h-0">
               {/* Team Status Card */}
               <div className="bg-white/5 rounded-xl p-3 border border-[#C9A227]/20 relative overflow-hidden">
                 <div className="flex items-center gap-3 relative z-10">
                   <div 
                     className="w-10 h-10 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#E8D5A3] flex items-center justify-center shadow-lg cursor-pointer active:scale-95 transition-transform"
                     onClick={(e) => {
                       e.stopPropagation();
                       setShowJoinAnimation(true);
                       setTimeout(() => setShowJoinAnimation(false), 2000);
                     }}
                   >
                     <Heart className="w-4 h-4 text-black fill-black" />
                   </div>
                   <div>
                     <div className="text-[#E8D5A3]/60 text-[9px] font-bold uppercase tracking-wider">Member Hearts</div>
                     <div className="text-gold-metallic font-bold text-sm">
                      {dailyHeartCount} today
                    </div>
                     <div className="text-white/50 text-[9px] font-bold mt-0.5">
                      {myHeartCount} total hearts received
                    </div>
                   </div>
                 </div>
               </div>

               {/* Heart senders — days each spectator gave a membership heart */}
               <div className="mt-3">
                 <h4 className="text-[#E8D5A3]/60 text-[9px] font-bold uppercase tracking-wider mb-2 px-1">Hearts Sent</h4>
                 <div className="space-y-1">
                   {heartMembers.length === 0 && (
                     <p className="text-white/30 text-[10px] text-center py-2">No membership hearts yet</p>
                   )}
                   {heartMembers.map((m, i) => (
                     <div key={m.user_id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#C9A227]/5 border border-[#C9A227]/15">
                       <div className="w-5 text-center font-bold text-[10px] text-[#E8D5A3]/60">{i + 1}</div>
                       <img src={m.avatar_url || '/royce/elix-mark.svg'} alt="" className="w-7 h-7 rounded-full object-cover border border-[#C9A227]/20" />
                       <div className="flex-1 min-w-0">
                         <div className="text-[10px] font-bold text-white truncate">{m.username || m.user_id.slice(0, 8)}</div>
                       </div>
                       <div className="text-[#D4AF37] text-[10px] font-bold whitespace-nowrap">
                         {m.heart_days} {m.heart_days === 1 ? 'day' : 'days'}
                       </div>
                     </div>
                   ))}
                 </div>
               </div>

               {/* Total Gift Coins */}
               <div className="bg-white/5 rounded-xl p-3 border border-[#C9A227]/20 mt-2">
                 <div className="text-[#E8D5A3]/60 text-[9px] font-bold uppercase tracking-wider">Total Gift Coins Received</div>
                 <div className="text-gold-metallic font-bold text-lg">{totalGiftCoins.toLocaleString()}</div>
               </div>

               {/* Top Gifters */}
               <div className="mt-3">
                 <h4 className="text-[#E8D5A3]/60 text-[9px] font-bold uppercase tracking-wider mb-2 px-1">Top Supporters</h4>
                 <div className="space-y-1">
                   {topGifters.length === 0 && (
                     <p className="text-white/30 text-[10px] text-center py-2">No gifts yet</p>
                   )}
                   {topGifters.map((g, i) => (
                     <div key={g.user_id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#C9A227]/5 border border-[#C9A227]/15">
                       <div className="w-5 text-center font-bold text-[10px] text-[#E8D5A3]/60">{i + 1}</div>
                       <img src={g.avatar_url || '/royce/elix-mark.svg'} alt="" className="w-7 h-7 rounded-full object-cover border border-[#C9A227]/20" />
                       <div className="flex-1 min-w-0">
                         <div className="text-[10px] font-bold text-white truncate">{g.username || g.user_id.slice(0, 8)}</div>
                       </div>
                       <div className="text-[#D4AF37] text-[10px] font-bold whitespace-nowrap">{g.total_coins.toLocaleString()} coins</div>
                     </div>
                   ))}
                 </div>
               </div>
            </div>
          </div>
          </div>
        </>
      )}

      {/* ═══ SUPER FAN GOAL PANEL (Membership) ═══ */}
      {showFanClub && (
        <>
          <div 
            className="fixed inset-0 bg-black/40 pointer-events-auto" 
            style={{ zIndex: 99998 }}
            onClick={() => setShowFanClub(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
          <div
            className="bg-[#111111]/95 rounded-t-2xl p-3 pb-safe max-h-[40vh] overflow-y-auto no-scrollbar shadow-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2">
              <div className="flex items-center gap-1.5">
                <Heart className="w-3 h-3 text-[#D4AF37]" strokeWidth={2} fill="#D4AF37" />
                <span className="text-gold-metallic font-bold text-sm">Super Fan Goal</span>
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
              <div className="flex flex-col gap-3">
                {/* Subscription Banner */}
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

                {/* Photo Stickers - Creator Upload */}
                <div className="bg-white/5 rounded-xl p-3 border border-[#C9A227]/20">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-gold-metallic font-bold text-[10px] flex items-center gap-1">
                      <div className="w-4 h-4 rounded-full bg-[#111111] flex items-center justify-center border border-[#C9A227]/40">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      </div>
                      Photo Stickers
                    </h3>
                    <span className="bg-[#C9A227]/10 text-[#D4AF37] text-[7px] font-bold px-1.5 py-0.5 rounded-full border border-[#C9A227]/20">
                      {creatorStickers.length}/20
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {creatorStickers.map((sticker) => (
                      <div key={sticker.id} className="aspect-square rounded-lg bg-white/5 border border-[#C9A227]/10 relative overflow-hidden group">
                        <img src={sticker.image_url} alt={sticker.label} className="w-full h-full object-cover" />
                        <button
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteSticker(sticker.id)}
                        >
                          <X size={8} className="text-white/60" />
                        </button>
                      </div>
                    ))}
                    {creatorStickers.length < 20 && (
                      <button
                        className="aspect-square rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center border border-dashed border-[#C9A227]/30 relative overflow-hidden"
                        onClick={uploadSticker}
                        disabled={stickerUploading}
                      >
                        {stickerUploading ? (
                          <div className="w-4 h-4 border-t-[#FFFFFF] rounded-full animate-spin" />
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <PlusCircle size={14} className="text-[#E8D5A3]/60" />
                            <span className="text-[6px] text-[#E8D5A3]/60 font-bold uppercase">Upload</span>
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

      {giftGoal && (
        <div
          className="fixed left-0 right-0 z-[95] flex justify-center pointer-events-none px-3"
          style={{ bottom: 'calc(66px + max(2px, env(safe-area-inset-bottom, 0px)))' }}
        >
          <div className="w-full max-w-[480px] flex justify-start">
            <LiveGiftGoalBar
              goal={giftGoal}
              onTap={() => { if (!isCreatorParticipant) setShowGiftPanel(true); }}
              showSend={!isCreatorParticipant}
            />
          </div>
        </div>
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
            className="fixed inset-0 bg-black/40 pointer-events-auto" 
            style={{ zIndex: 99998 }}
            onClick={() => setIsMoreMenuOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto"
          >
          <div
            className="bg-[#111111]/95 rounded-t-2xl p-3 pb-safe h-[40vh] overflow-y-auto no-scrollbar shadow-2xl w-full "
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center mb-2">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Content — icon on top, label under (same as Share / Effects) */}
            <div className="grid grid-cols-4 gap-y-4 gap-x-2 pt-1 pb-2 px-1">

              {areTestCoinsEnabled() && (
              <button type="button" onClick={() => { setShowTestCoinsModal(true); setTestCoinsStep(sessionStorage.getItem('elix_test_coins_unlocked') ? 'amount' : 'password'); setTestCoinsPwd(''); setTestCoinsError(''); setTestCoinsAmount(''); setIsMoreMenuOpen(false); }} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  <Coins className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Test</span>
              </button>
              )}

              <button type="button" onClick={() => { setShowSharePanel(true); setIsMoreMenuOpen(false); }} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  <Share2 className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} />
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
                  <Gift className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Engagement</span>
              </button>
              ) : null}

              <button type="button" disabled={!isBroadcast} onClick={() => { flipCamera(); setIsMoreMenuOpen(false); }} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform disabled:opacity-40">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  <RefreshCw className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Flip</span>
              </button>

              <button type="button" disabled={!isBroadcast} onClick={() => { toggleMic(); setIsMoreMenuOpen(false); }} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform disabled:opacity-40">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  {isMicMuted ? <MicOff className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} /> : <Mic className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} />}
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">{isMicMuted ? 'Unmute' : 'Mute'}</span>
              </button>

              <button type="button" disabled={!isBroadcast} onClick={() => { toggleCam(); setIsMoreMenuOpen(false); }} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform disabled:opacity-40">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  {isCamOff ? <CameraOff className="w-[18px] h-[18px] text-white/60 relative z-[2]" strokeWidth={1.8} /> : <Camera className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} />}
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">{isCamOff ? 'Cam On' : 'Cam Off'}</span>
              </button>

              <button
                type="button"
                disabled={!isBroadcast}
                onClick={() => { setShowLiveEffectsPanel(true); setIsMoreMenuOpen(false); }}
                className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform disabled:opacity-40"
              >
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  <Sparkles className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Effects</span>
              </button>

              <button type="button" onClick={() => { setIsChatVisible((v) => !v); setIsMoreMenuOpen(false); }} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  <MessageCircle className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">{isChatVisible ? 'Hide Chat' : 'Show Chat'}</span>
              </button>

              {isBroadcast && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      {
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
                      }
                      setIsMoreMenuOpen(false);
                      showToast('Poll started — viewers tap Poll chip');
                    }}
                    className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
                  >
                    <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                      <Sparkles className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} />
                    </div>
                    <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Poll</span>
                  </button>
                  {([5, 10, 15] as const).map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => {
                        startMystery(mins, 'poll');
                        setIsMoreMenuOpen(false);
                        showToast(`Mystery set for ${mins}m`);
                      }}
                      className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform"
                    >
                      <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                        <Timer className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} />
                      </div>
                      <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">M{mins}m</span>
                    </button>
                  ))}
                </>
              )}

              <button type="button" onClick={() => { setIsReportModalOpen(true); setIsMoreMenuOpen(false); }} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  <Flag className="w-[18px] h-[18px] text-white/60 relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/60 text-center leading-tight w-full">Report</span>
              </button>

              {isBattleMode && battleWinner && isBroadcast && (
                <button type="button" onClick={() => { startBattleWithAcceptedCreators(); setBattleTime(300); setMyScore(0); setOpponentScore(0); setPlayer3Score(0); setPlayer4Score(0); battleServerTotalsRef.current = { h: 0, o: 0, p3: 0, p4: 0 }; setBattleServerTotals({ h: 0, o: 0, p3: 0, p4: 0 }); setBattleWinner(null); setBattleCountdown(null); reachedThresholdsRef.current.clear(); roseCountRef.current = 0; setRoseCount(0); battleScreenTapCountRef.current = 0; setBattleScreenTapCount(0); setIsMoreMenuOpen(false); }} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform">
                  <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                    <RefreshCw className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} />
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
            className="fixed inset-0 bg-black/40 pointer-events-auto"
            style={{ zIndex: 99998 }}
            onClick={() => setShowLiveEffectsPanel(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
            <div
              className="bg-[#111111]/95 rounded-t-2xl p-3 pb-safe shadow-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-2">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <Sparkles size={14} className="text-[#D4AF37]" />
                <span className="text-white text-sm font-bold">Effects</span>
                <span className="text-[9px] text-white/40">({getLiveFaceEngineLabel()})</span>
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 px-1">
                {FILTER_PRESETS.filter((f) =>
                  ['none', 'cinema-warm', 'cinema-cold', 'cinema-teal', 'port-soft', 'port-beauty', 'port-youth', 'port-age', 'mood-dreamy', 'mood-neon', 'art-bw-high'].includes(f.id),
                ).map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => {
                      setLiveFilterCss(filter.css);
                      setShowLiveEffectsPanel(false);
                    }}
                    className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[56px] transition-all active:scale-95 ${
                      liveFilterCss === filter.css
                        ? 'bg-[#C9A227]/20'
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
                    onClick={() => {
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
                    }}
                    className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[56px] transition-all active:scale-95 ${
                      activeLiveFaceEffect?.type === fx.type || (fx.type === 'none' && !activeLiveFaceEffect)
                        ? 'bg-[#C9A227]/20'
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

      {areTestCoinsEnabled() && showTestCoinsModal && (
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
                        // Fallback: simple comparison for non-secure contexts
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
                    min="1"
                    max="100000000"
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
                        {amt >= 1000 ? `${amt / 1000}K` : amt}
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


      {/* Full-screen Gift Overlay Animation */}
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

      {/* Gift video — default z 50000 so it is visible on creator (including battle).
          Combo/bottom icons use 50001+ so they stay above the gift. */}
      <GiftOverlay
        key={`gift-${giftKey}`}
        videoSrc={currentGift?.video ?? null}
        onEnded={handleGiftEnded}
        isBattleMode={isBattleMode}
        muted={false}
      />
      
      {/* ═══ SHARE PANEL ═══ */}
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
                    className="rounded-full overflow-hidden bg-[#13151A] flex-shrink-0"
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
            <div className="mx-4 my-1 border-t border-[#D4AF37]/45 flex-shrink-0" aria-hidden />

            {/* Share options — same layout as ShareModal */}
            <div className="flex-1 overflow-y-scroll overflow-x-hidden min-h-0 px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:bg-[#C9A227]/60 [&::-webkit-scrollbar-thumb]:rounded-full">
              <div className="grid grid-cols-5 gap-y-3 gap-x-1.5 pt-4" style={{ marginTop: '6mm' }}>
                {[
                  { name: 'WhatsApp', icon: <MessageCircle size={22} className="text-white" />, action: () => { openExternalLink(`https://wa.me/?text=${encodeURIComponent('Watch my LIVE on Elix! ' + `${window.location.origin}/live/${effectiveStreamId}`)}`); if (effectiveStreamId) { earnBattleEnergyQuiet('share', effectiveStreamId); void request('/api/engagement/progress', { method: 'POST', body: JSON.stringify({ metric: 'shares', delta: 1, roomId: effectiveStreamId }) }).catch(() => {}); } setShowSharePanel(false); } },
                  { name: 'Facebook', icon: <Share2 size={22} className="text-white" />, action: () => { openExternalLink(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}/live/${effectiveStreamId}`)}`); if (effectiveStreamId) { earnBattleEnergyQuiet('share', effectiveStreamId); void request('/api/engagement/progress', { method: 'POST', body: JSON.stringify({ metric: 'shares', delta: 1, roomId: effectiveStreamId }) }).catch(() => {}); } setShowSharePanel(false); } },
                  { name: 'Copy Link', icon: <Copy size={22} className="text-white" />, action: () => { void copyTextToClipboard(`${typeof window !== 'undefined' ? window.location.origin : 'https://www.elixstarlive.co.uk'}/live/${effectiveStreamId}`); if (effectiveStreamId) { earnBattleEnergyQuiet('share', effectiveStreamId); void request('/api/engagement/progress', { method: 'POST', body: JSON.stringify({ metric: 'shares', delta: 1, roomId: effectiveStreamId }) }).catch(() => {}); } showToast('Link copied!'); setShowSharePanel(false); } },
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
          title: `Watch ${myCreatorName}'s LIVE on Elix!`,
          thumbnail: myAvatar,
          username: myCreatorName,
          avatar: myAvatar,
          postedAt: new Date().toLocaleDateString(),
        }}
      />

      {/* Engagement Hub — side drawer only (battle screen unchanged) */}
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
        onClose={() => setIsReportModalOpen(false)}
        videoId={effectiveStreamId || ''}
        contentId={user?.id || effectiveStreamId || ''}
        contentType="live"
      />

      {/* Battle invite overlay removed — invite is now shown inside the bottom panel */}

      {/* Moderation warning (AI flag + assist; first detection only) */}
      {showModerationWarning && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70" onClick={() => { setShowModerationWarning(false); setModerationWarningMessage(''); }}>
          <div className="bg-[#111111] border border-white/10 rounded-xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
              <h3 className="font-semibold text-white">Safety reminder</h3>
            </div>
            <p className="text-white/80 text-sm mb-4">{moderationWarningMessage}</p>
            <button
              type="button"
              onClick={() => { setShowModerationWarning(false); setModerationWarningMessage(''); }}
              className="w-full py-2.5 rounded-lg bg-[#D4AF37] text-black font-semibold"
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
