import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { RoyceCloseIcon } from '../components/royce';
import { showToast } from '../lib/toast';
import { platform, openExternalLink } from '../lib/platform';
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
  Zap,
  Trophy,
  Copy,
  AlertTriangle,
  PlusCircle,
  TrendingUp,
  Plus,
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
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { FILTER_PRESETS } from '../lib/ai/filters';
import { GiftUiItem, GIFT_COMBO_MAX, resolveGiftAssetUrl, fetchGiftsFromDatabase, pickGiftVideoUrl, formatGiftDisplayName } from '../lib/giftsCatalog';
import { BattleVfxOverlays, GloveIcon, type BattleMistSide, type GloveBurst } from '../components/BattleVfxOverlays';
import {
  addPersistedTestCoins,
  addTestGiftXp,
  debitTestCoinsForGift,
  getPersistedTestCoinsBalance,
  getSpendableGiftBalance,
  getTestLevel,
  resolveGiftUiBalance,
  shouldUseTestCoinsForGifts,
} from '../lib/testCoins';
import { GiftOverlay } from '../components/GiftOverlay';
import GiftAnimationOverlay, { pushLocalGiftPill } from '../components/GiftAnimationOverlay';
import { ChatOverlay } from '../components/ChatOverlay';
import { FaceARGift } from '../components/FaceARGift';
import { useLivePromoStore } from '../store/useLivePromoStore';
import { AvatarRing } from '../components/AvatarRing';
import {
  CREATOR_NAME_PILL_CLASSNAME,
  getCreatorNamePillStyle,
  LIVE_MVP_PROFILE_RING_PX,
  SPECTATOR_BATTLE_PROFILE_RING_PX,
  LIVE_BATTLE_VIDEO_HEIGHT,
  LIVE_BATTLE_CHAT_HEIGHT,
  LIVE_BATTLE_CHAT_SHIFT_Y,
  LIVE_TOP_AVATAR_RING_PX,
  LIVE_BOTTOM_ACTION_PADDING,
  LIVE_BOTTOM_ACTION_RESERVE,
} from '../lib/profileFrame';
import { resolveUiAvatarUrl } from '../lib/royceAssets';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import { clearCachedCameraStream, getCachedCameraStream } from '../lib/cameraStream';
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
import { RankingPanel } from '../components/RankingPanel';
import { websocket } from '../lib/websocket';
import { parseLiveGiftGoal, type LiveGiftGoal } from '../lib/liveGiftGoal';
import { liveStreamUiGiftTargetToServerBattleTarget, normalizeBattleGiftTarget } from '../lib/liveBattleGiftTarget';
import { IS_STORE_BUILD } from '../config/build';
import { purchaseMembership } from '../lib/iap';
import { Room, RoomEvent, LocalVideoTrack, LocalAudioTrack } from 'livekit-client';

const LIVE_BOTTOM_ICON_BTN =
  'w-10 h-10 flex items-center justify-center bg-transparent border-0 shadow-none active:scale-95 transition-transform flex-shrink-0';

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
  const [viewerHasStream, _setViewerHasStream] = useState(false);
  const [giftsCatalog, setGiftsCatalog] = useState<GiftUiItem[]>([]);
  const giftsCatalogRef = useRef<GiftUiItem[]>([]);
  useEffect(() => { giftsCatalogRef.current = giftsCatalog; }, [giftsCatalog]);
  // Dedup gift_sent (REST + WS + owner-global can all deliver the same txn once).
  const seenGiftTxnRef = useRef<Set<string>>(new Set());
  useEffect(() => { let c = false; fetchGiftsFromDatabase().then(g => { if (!c) setGiftsCatalog(g); }); return () => { c = true; }; }, []);
  const setPromo = useLivePromoStore((s) => s.setPromo);
  const { user, updateUser } = useAuthStore();
  const followingUsers = useVideoStore((s) => s.followingUsers);
  const _rawStreamId = streamId;
  const PROMOTE_LIKES_THRESHOLD_LIVE = 100;
  const _PROMOTE_LIKES_THRESHOLD_BATTLE = 50;
  
  const [showRankingPanel, setShowRankingPanel] = useState(false);
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
    setGiftQueue((prev) => [...prev, { video: url }]);
  };
  const [messages, setMessages] = useState<LiveMessage[]>(() => []);
  const [coinBalance, setCoinBalance] = useState(0);
  const [starterCoinBalance, setStarterCoinBalance] = useState(0);
  const [giftSource, setGiftSource] = useState<"starter_coins" | "paid_coins">(
    "paid_coins",
  );
  const [inputValue, setInputValue] = useState('');
  // Consolidate broadcast logic: host if streamId is broadcast OR if streamId matches my own user ID
  const isBroadcast = streamId === 'broadcast' || location.pathname === '/live/broadcast' || (user?.id && streamId === user.id);
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

  // FaceAR State
  const faceARCanvasRef = useRef<HTMLCanvasElement>(null);
  const [_faceARVideoEl, setFaceARVideoEl] = useState<HTMLVideoElement | null>(null);
  const [_faceARCanvasEl, setFaceARCanvasEl] = useState<HTMLCanvasElement | null>(null);
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

  useEffect(() => {
    if (videoRef.current) setFaceARVideoEl(videoRef.current);
    if (faceARCanvasRef.current) setFaceARCanvasEl(faceARCanvasRef.current);
  }, [isBroadcast]);

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

    Promise.all([request('/api/wallet/'), request('/api/progression/me')])
      .then(([wallet, progression]) => {
        if (cancelled) return;
        const walletRaw = wallet.data?.coin_balance ?? wallet.data?.balance;
        const walletBal =
          !wallet.error && walletRaw != null
            ? Math.max(0, Number(walletRaw))
            : 0;
        setCoinBalance(resolveGiftUiBalance(walletBal, user.id));
        const p = progression.data?.progression;
        const starter = Math.max(0, Number(p?.starter_coin_balance) || 0);
        setStarterCoinBalance(starter);
        setGiftSource(starter > 0 ? 'starter_coins' : 'paid_coins');
        const serverLevel = Math.max(0, Number(p?.current_level) || 0);
        const serverXp = Math.max(0, Number(p?.total_xp) || 0);
        // While testing with test coins, show the local simulated level if it's
        // higher (local-only, never real progression).
        const testLvl = shouldUseTestCoinsForGifts(user.id) ? getTestLevel(user.id) : 0;
        setUserLevel(Math.max(serverLevel, testLvl));
        setUserXP(serverXp);
      })
      .catch(() => {
        if (cancelled) return;
        setCoinBalance(getPersistedTestCoinsBalance(user.id));
      });
    return () => { cancelled = true; };
  }, [user?.id, user?.level]);

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

      return () => {
        setIsMyStreamLive(false);
        websocket.send('stream_end', {
          stream_key: key,
          user_id: user.id,
        });
      };
    } else {
      // Viewer mode - rely on WebSocket events for stream status
      return () => {};
    }
  }, [effectiveStreamId, isBroadcast, user?.id]);

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

    return () => {
      setLiveKitCreds(null);
      if (!liveRegisteredRef.current) return;
      (async () => {
        try {
          await request('/api/live/end', {
            method: 'POST',
            body: JSON.stringify({ room: effectiveStreamId }),
          });
        } catch {
          // ignore
        } finally {
          liveRegisteredRef.current = false;
        }
      })();
    };
  }, [isBroadcast, user?.id, effectiveStreamId]);

  // Live: LiveKit. Host publishes here; viewers subscribe via SpectatorPage.
  useEffect(() => {
    if (!isBroadcast || !liveKitCreds || !cameraStreamRef.current) return;

    const stream = cameraStreamRef.current;
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    if (!videoTrack && !audioTrack) return;

    const room = new Room({ adaptiveStream: true });
    liveKitRoomRef.current = room;

    const attachRemoteTrack = (track: import('livekit-client').Track, participant: import('livekit-client').RemoteParticipant) => {
      const identity = participant.identity;
      if (identity === user?.id) return;

      if (track.kind === 'audio') {
        // Co-host audio must be attached on host side, otherwise host can see but not hear co-hosts.
        attachRemoteAudio(track, roomRemoteAudioRef.current);
        return;
      }
      if (track.kind !== 'video') return;

      // Try co-host slot first
      const coHostEl = coHostVideoRefs.current.get(identity);
      if (coHostEl) { track.attach(coHostEl); return; }

      // Battle: opponent publishes into THIS (host) LiveKit room — attach to the
      // matching battle pane. Do not wait on a second connection to their old solo room.
      if (isBattleModeRef.current) {
        const slots = battleSlotsRef.current;
        const markAttached = (el: HTMLVideoElement | null) => {
          if (!el) return false;
          track.attach(el);
          void el.play().catch(() => {});
          return true;
        };
        if (slots[0]?.userId && identity === slots[0].userId) {
          if (markAttached(opponentVideoRef.current)) {
            setHasOpponentStream(true);
            return;
          }
        }
        if (slots[1]?.userId && identity === slots[1].userId) {
          if (markAttached(player3VideoRef.current)) return;
        }
        if (slots[2]?.userId && identity === slots[2].userId) {
          if (markAttached(player4VideoRef.current)) return;
        }
        // Pane accepted but userId not synced yet — fill first free battle video.
        if (!hasOpponentStreamRef.current && markAttached(opponentVideoRef.current)) {
          setHasOpponentStream(true);
          return;
        }
        if (player3VideoRef.current && !player3VideoRef.current.srcObject) {
          markAttached(player3VideoRef.current);
          return;
        }
        if (player4VideoRef.current && !player4VideoRef.current.srcObject) {
          markAttached(player4VideoRef.current);
          return;
        }
      }
    };

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      attachRemoteTrack(track, participant);
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
            if (pub.track && pub.isSubscribed) attachRemoteTrack(pub.track, participant);
          }
          for (const [, pub] of participant.audioTrackPublications) {
            if (pub.track && pub.isSubscribed) attachRemoteAudio(pub.track, roomRemoteAudioRef.current);
          }
        }
        if (videoTrack) {
          if (cancelled) { room.disconnect(); return; }
          const localVideo = new LocalVideoTrack(videoTrack);
          await room.localParticipant.publishTrack(localVideo, { name: 'camera' });
        }
        if (audioTrack) {
          if (cancelled) { room.disconnect(); return; }
          const localAudio = new LocalAudioTrack(audioTrack);
          await room.localParticipant.publishTrack(localAudio, { name: 'mic' });
        }
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
  }, [isBroadcast, liveKitCreds, cameraStream]);

  const [isFindCreatorsOpen, setIsFindCreatorsOpen] = useState(false);
  const [_memberCount, setMemberCount] = useState(0);
  const [hasJoinedToday, setHasJoinedToday] = useState(false);
  const [myHeartCount, setMyHeartCount] = useState(0);
  const [dailyHeartCount, setDailyHeartCount] = useState(0);
  const [totalGiftCoins, setTotalGiftCoins] = useState(0);
  const [topGifters, setTopGifters] = useState<{ user_id: string; total_coins: number; username?: string; avatar_url?: string }[]>([]);

  // Fetch membership stats for creator
  useEffect(() => {
    if (!user?.id) return;
    const fetchStats = () => {
      request(`/api/membership/${user.id}`).then(({ data: d }) => {
        if (!d) return;
        if (typeof d.todayHearts === 'number') setDailyHeartCount(d.todayHearts);
        if (typeof d.totalHearts === 'number') setMyHeartCount(d.totalHearts);
        if (typeof d.totalGiftCoins === 'number') setTotalGiftCoins(d.totalGiftCoins);
        if (Array.isArray(d.topGifters)) setTopGifters(d.topGifters);
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

  useEffect(() => {
    if (showViewerList && user?.id) loadCreators();
  }, [showViewerList, user?.id, loadCreators]);

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
  const inviteTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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
  };

  // ─── INCOMING INVITE (for viewers / other broadcasters) ─────
  type PendingInvite = {
    hostName: string;
    hostAvatar: string;
    streamKey: string;
    hostUserId: string;
  };
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);

  useEffect(() => {
    if (pendingInvite) {
      setShowViewerList(false);
      setIsFindCreatorsOpen(true);
      const inviter = pendingInvite;
      setCreators(prev => {
        if (prev.some(c => c.id === inviter.hostUserId)) return prev;
        return [...prev, { id: inviter.hostUserId, streamKey: inviter.streamKey || inviter.hostUserId, name: inviter.hostName, username: inviter.hostName, followers: '0', avatar: inviter.hostAvatar, isLive: true }];
      });
    }
  }, [pendingInvite]);

  const acceptBattleInvite = async () => {
    if (!pendingInvite || !user?.id) return;
    const invite = pendingInvite;
    setPendingInvite(null);
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
    setPendingInvite(null);
  };

  // Mute state per player pane
  const [mutedPlayers, setMutedPlayers] = useState<Record<string, boolean>>({});
  const [cameraOffPlayers, setCameraOffPlayers] = useState<Record<string, boolean>>({});
  const togglePlayerMute = (player: string) => {
    setMutedPlayers(prev => ({ ...prev, [player]: !prev[player] }));
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
    for (const [key, ref] of Object.entries(map)) {
      if (ref.current) ref.current.muted = !!mutedPlayers[key];
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
  const [featuredHostId, setFeaturedHostId] = useState<string | null>(null);
  const coHostTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const coHostsRef = useRef<CoHost[]>([]);
  const isBroadcastRef = useRef(false);
  const selfUserIdRef = useRef<string | null>(null);
  const MAX_CO_HOSTS = 8;

  // Keep refs in sync for use inside WebSocket handlers (avoid stale closure)
  useEffect(() => {
    coHostsRef.current = coHosts;
    isBroadcastRef.current = isBroadcast;
    selfUserIdRef.current = user?.id ?? null;
  }, [coHosts, isBroadcast, user?.id]);

  // Broadcast co-host layout to room so spectators see same layout (single source of truth; no duplicate userIds)
  useEffect(() => {
    if (!isBroadcast || !effectiveStreamId || !user?.id) return;
    const list = coHosts.map((h) => ({ id: h.id, userId: h.userId, name: h.name, avatar: h.avatar, status: h.status }));
    const payload = { roomId: effectiveStreamId, coHosts: list, hostUserId: user.id };
    websocket.send('cohost_layout_sync', payload);
  }, [isBroadcast, effectiveStreamId, user?.id, coHosts]);

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
  };

  const acceptCohostInvite = async () => {
    if (!pendingCohostInvite || !user?.id) return;
    // Never accept a co-host invite while battling — it would pull this
    // creator out of the battle onto the spectator page.
    if (isBattleMode) {
      setPendingCohostInvite(null);
      return;
    }
    const inv = pendingCohostInvite;
    setPendingCohostInvite(null);
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
      return;
    }
    setPendingJoinRequest(null);
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
    if (requesterId) websocket.send('cohost_request_decline', { requesterUserId: requesterId });
  };

  const _removeCoHost = (hostId: string) => {
    const host = coHosts.find(h => h.id === hostId);
    setCoHosts(prev => prev.filter(h => h.id !== hostId));
    if (host) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        username: 'System',
        text: `${host.name} left the co-host`,
        isSystem: true,
      }]);
    }
  };

  const toggleCoHostMute = (hostId: string) => {
    setCoHosts(prev => prev.map(h =>
      h.id === hostId ? { ...h, isMuted: !h.isMuted } : h
    ));
  };
  const [coHostCameraOff, setCoHostCameraOff] = useState<Record<string, boolean>>({});
  const toggleCoHostCamera = (hostId: string) => {
    setCoHostCameraOff(prev => ({ ...prev, [hostId]: !prev[hostId] }));
  };
  // Identities currently speaking (from LiveKit ActiveSpeakersChanged) — drives the box pulse.
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  // Co-host identities whose own camera is off (video track muted) — show their avatar.
  const [remoteCamOff, setRemoteCamOff] = useState<Set<string>>(new Set());

  const liveCoHosts = coHosts.filter(h => h.status === 'live');
  const featuredHost = featuredHostId ? liveCoHosts.find(h => h.id === featuredHostId) : null;
  const smallHosts = featuredHost ? liveCoHosts.filter(h => h.id !== featuredHostId) : liveCoHosts;
  const _hostGridCols = smallHosts.length <= 1 ? 1 : smallHosts.length <= 4 ? 2 : smallHosts.length <= 9 ? 3 : 4;

  const _toggleFeatured = (hostId: string) => {
    setFeaturedHostId(prev => prev === hostId ? null : hostId);
  };

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
  const battleEndedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { isBattleModeRef.current = isBattleMode; }, [isBattleMode]);
  // If joining as battle participant, enter battle mode and start camera (server drives timer/countdown)
  const battleLkRoomRef = useRef<Room | null>(null);
  useEffect(() => {
    if (!isBattleJoiner || !user?.id) return;
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
          videoRef.current.play().catch(() => {});
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

        const room = new Room({ adaptiveStream: true });
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
      if (battleLkRoomRef.current) { battleLkRoomRef.current.disconnect(); battleLkRoomRef.current = null; }
      if (battlePeerRef.current) { battlePeerRef.current.close(); battlePeerRef.current = null; }
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
    videoRef.current.play().catch(() => {});
  }, [isBattleParticipant, battleParticipantStream]);

  const _isRegularViewer = !isBroadcast && !isBattleParticipant;

  // Connect to opponent's LiveKit room to receive their video (creators may still
  // be publishing there). Host-room attach below covers when they join this room.
  useEffect(() => {
    if (!isBattleMode || !opponentStreamKey || !isBroadcast) return;
    if (opponentStreamKey === effectiveStreamId) return;
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
      room.disconnect();
      if (opponentLkRoomRef.current === room) opponentLkRoomRef.current = null;
      // Connection-bug fix only: do not clear hasOpponentStream here.
      // Opponent may already be attached from the host LiveKit room; clearing
      // on this cleanup left the pane stuck on "Connecting...".
    };
  }, [isBattleMode, opponentStreamKey, isBroadcast, effectiveStreamId, attachRemoteAudio]);

  // Re-attach remote LiveKit tracks when battle/co-host video elements mount after subscribe
  useEffect(() => {
    const room = liveKitRoomRef.current;
    if (!room || !isBroadcast) return;

    const attachAll = () => {
      const battleVideoByUserId: Record<string, React.RefObject<HTMLVideoElement | null>> = {
        [battleSlotsRef.current[0]?.userId || '']: opponentVideoRef,
        [battleSlotsRef.current[1]?.userId || '']: player3VideoRef,
        [battleSlotsRef.current[2]?.userId || '']: player4VideoRef,
      };

      for (const [, participant] of room.remoteParticipants) {
        const identity = participant.identity;
        if (!identity || identity === user?.id) continue;

        for (const [, pub] of participant.videoTrackPublications) {
          if (!pub.track || !pub.isSubscribed) continue;
          const coHostEl = coHostVideoRefs.current.get(identity);
          if (coHostEl) {
            pub.track.attach(coHostEl);
            continue;
          }
          const battleEl = battleVideoByUserId[identity]?.current;
          if (battleEl) {
            pub.track.attach(battleEl);
            void battleEl.play().catch(() => {});
            if (identity === battleSlotsRef.current[0]?.userId) setHasOpponentStream(true);
            continue;
          }
          if (
            isBattleModeRef.current &&
            battleSlotsRef.current[0]?.status === 'accepted' &&
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
    const poll = window.setInterval(attachAll, 2000);
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
  const [_roseCount, setRoseCount] = useState(0);

  useEffect(() => { speedChallengeActiveRef.current = speedChallengeActive; }, [speedChallengeActive]);
  useEffect(() => { speedMultiplierRef.current = speedMultiplier; }, [speedMultiplier]);

  const _speedChallengeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reachedThresholdsRef = useRef<Set<number>>(new Set());
  const [lastGifts, setLastGifts] = useState<{ opponent: string | null; player3: string | null; player4: string | null }>({ opponent: null, player3: null, player4: null });
  /** Per co-host tile: gift totals + last gift icon (synced from gift_sent). */
  const [cohostGiftScores, setCohostGiftScores] = useState<Record<string, number>>({});
  const [cohostLastGifts, setCohostLastGifts] = useState<Record<string, string>>({});
  const [floatingHearts, setFloatingHearts] = useState<
    Array<{ id: string; x: number; y: number; dx: number; rot: number; size: number; color: string; username?: string; avatar?: string }>
  >([]);
  const [miniProfile, setMiniProfile] = useState<null | { id?: string; username: string; avatar: string; level: number | null; coins?: number; donated?: number; bio?: string; followers_count?: number; following_count?: number }>(null);
  /** Synced from GET /following when panel user id is known; used so Follow matches server (does not touch host top-bar isFollowing). */
  const [miniProfileFollowsThem, setMiniProfileFollowsThem] = useState<boolean | undefined>(undefined);
  const [_showMembershipBar, _setShowMembershipBar] = useState(false);
  const [showTeamStatus, setShowTeamStatus] = useState(false);
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
    websocket.send('gift_goal_set', {
      giftId: goalPick.id,
      giftName: goalPick.name,
      giftIcon: goalPick.icon,
      targetCount: goalTargetCount,
      currentCount: giftGoal?.giftId === goalPick.id ? giftGoal.currentCount : 0,
    });
    setGoalSaving(false);
  }, [goalPick, goalTargetCount, giftGoal, isBroadcast]);

  const clearGiftGoal = useCallback(() => {
    if (!isBroadcast) return;
    websocket.send('gift_goal_clear', {});
    setGiftGoal(null);
    setGoalPick(null);
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
      return;
    }
    request('/api/wallet/').then(({ data, error: walletErr }) => {
      const walletRaw = data?.coin_balance ?? data?.balance;
      if (!walletErr && walletRaw != null) {
        setCoinBalance(Math.max(0, Number(walletRaw)));
      }
    }).catch(() => {});
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
    battleFreeTapUsedRef.current = false;
    battleTapScoreRemainingRef.current = 5;
    prevBattleSyncStatusRef.current = null;
    battleStreamIdsRef.current = null;
    battleTripleTapRef.current = { target: null, lastTapAt: 0, count: 0 };
    setMiniProfile(null);
    setSpeedChallengeActive(false);
    setSpeedChallengeTime(30);
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
    inviteTimersRef.current.forEach(t => clearTimeout(t));
    inviteTimersRef.current = [];
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

  const toggleBattle = useCallback(() => {
    if (isBattleMode) {
      exitBattleMode();
      return;
    }
    // Enter battle mode -> INVITING state, everything clean
    setBattleState('INVITING');
    setIsBattleMode(true);
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
  }, [isBattleMode, location.search, location.pathname, navigate, endBattleCleanup, creatorName, exitBattleMode]);

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

  const awardBattlePoints = useCallback((target: 'me' | 'opponent' | 'player3' | 'player4', points: number, _isSpeedTap?: boolean) => {
    if (!isBattleMode || battleTime <= 0 || battleWinner) return;
    const rawPoints = speedChallengeActiveRef.current ? points * speedMultiplierRef.current : points;
    const finalPoints = points <= 5 ? Math.min(rawPoints, 5) : rawPoints;

    if (target === 'me') {
      setMyScore((prev) => prev + finalPoints);
    } else if (target === 'opponent') {
      setOpponentScore((prev) => prev + finalPoints);
    } else if (target === 'player3') {
      setPlayer3Score((prev) => prev + finalPoints);
    } else {
      setPlayer4Score((prev) => prev + finalPoints);
    }
  }, [isBattleMode, battleTime, battleWinner]);

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

  // Battle Tap Logic: spectator taps broadcaster side → 5 points, once per match
  const handleBattleTap = useCallback((target: 'me' | 'opponent' | 'player3' | 'player4') => {
    if (!isBattleMode || battleWinner || battleTime <= 0) return;
    if (target !== 'me') return;
    if (spectatorTapPointsRef.current > 0) return;

    setGiftTarget(target);
    spectatorTapPointsRef.current = 1;
    setSpectatorTapsUsed(1);
    awardBattlePoints('me', 5, false);
  }, [battleWinner, battleTime, awardBattlePoints, isBattleMode]);

  // ─── SPEED CHALLENGE LOGIC ───
  const startSpeedChallenge = useCallback(() => {
    if (!SPEED_CHALLENGE_ENABLED) return;
    if (speedChallengeActive || !isBattleMode || battleWinner) return;
    setSpeedChallengeTaps({ me: 0, opponent: 0, player3: 0, player4: 0 });
    setSpeedChallengeResult(null);
    setSpeedChallengeActive(true);
    setSpeedChallengeTime(30);
  }, [speedChallengeActive, isBattleMode, battleWinner, SPEED_CHALLENGE_ENABLED]);

  // Speed challenge timer: 30 → 0
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


  // Speed challenge: single fixed x2 round per match. Once the battle heats up
  // (total score crosses the threshold) it starts once, runs for 30s at x2, then
  // disappears. Thresholds reset when a new battle starts, so it returns next match.
  useEffect(() => {
    if (!SPEED_CHALLENGE_ENABLED || !isBattleMode || battleWinner) return;
    if (speedChallengeActive) return;

    const totalScore = myScore + opponentScore + player3Score + player4Score;

    if (totalScore >= 200 && !reachedThresholdsRef.current.has(200)) {
      reachedThresholdsRef.current.add(200);
      setSpeedMultiplier(2);
      speedMultiplierRef.current = 2;
      startSpeedChallenge();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myScore, opponentScore, player3Score, player4Score, isBattleMode, battleWinner, speedChallengeActive, startSpeedChallenge]);

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
    if (shouldStartBattle && !isBattleMode) {
      toggleBattle();
    }
  }, [location.search, isBattleMode, toggleBattle]);

  useEffect(() => {
    if (!isBroadcast) return;

    let cancelled = false;

    let keepStreamAliveOnCleanup = false;

    const stop = () => {
      const current = cameraStreamRef.current;
      if (!current) return;
      current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
      setCameraStream(null);
    };

    const start = async () => {
      try {
        setCameraError(null);

        if (cameraFacing !== 'user') {
          clearCachedCameraStream();
        }

        const cached = getCachedCameraStream();
        if (cached) {
          keepStreamAliveOnCleanup = true;
          cameraStreamRef.current = cached;
          setCameraStream(cached);
          cached.getAudioTracks().forEach((t) => (t.enabled = !isMicMuted));
          if (videoRef.current) {
            videoRef.current.srcObject = cached;
            videoRef.current.play().catch(() => {});
          }
          return;
        }

        stop();

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

        cameraStreamRef.current = stream;
        setCameraStream(stream);
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
          videoRef.current.play().catch(() => {});
        }
      } catch {
        setCameraError('Camera access denied');
      }
    };

    start();

    return () => {
      cancelled = true;
      if (!keepStreamAliveOnCleanup) stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBroadcast, cameraFacing]);

  // Re-attach camera stream to videoRef when battle mode toggles (the <video> element changes)
  useEffect(() => {
    if (!isBroadcast && !isBattleJoiner) return;
    const stream = cameraStreamRef.current;
    if (!stream || !videoRef.current) return;
    if (videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [isBattleMode, isBroadcast, isBattleJoiner]);

  useEffect(() => {
    if (!isBroadcast) return;
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      const stream = cameraStreamRef.current;
      const track = stream?.getVideoTracks()[0];
      if (!track || track.readyState === 'ended') {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: cameraFacing },
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          cameraStreamRef.current = newStream;
          setCameraStream(newStream);
          newStream.getAudioTracks().forEach(t => (t.enabled = !isMicMuted));
          if (videoRef.current) {
            videoRef.current.srcObject = newStream;
            videoRef.current.play().catch(() => {});
          }
        } catch { /* camera unavailable */ }
      } else if (videoRef.current) {
        videoRef.current.play().catch(() => {});
      }
      websocket.reconnectOnForeground();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isBroadcast, cameraFacing, isMicMuted]);

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
  useEffect(() => { activeViewersRef.current = activeViewers; }, [activeViewers]);
  const isGenericViewerName = useCallback((value: string | null | undefined) => {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return true;
    return v === 'anonymous' || v === 'user' || v === 'viewer' || v === 'guest' || v.startsWith('user_');
  }, []);
  const maybeResolveViewerIdentity = useCallback((viewerId: string) => {
    if (!viewerId || viewerId === user?.id) return;
    if (viewerIdentityCacheRef.current.has(viewerId) || viewerIdentityInflightRef.current.has(viewerId)) return;
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
          typeof profile.level === 'number' && Number.isFinite(profile.level) && profile.level > 0
            ? Math.floor(profile.level)
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
    (scores: Record<string, number>, limit: number): LiveViewer[] => {
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
      const ranked = [...byId.values()].sort((a, b) => {
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

  const topMvpHostBattle = useMemo(
    () => buildMvpRanked(mvpGiftScoresHost, 3),
    [buildMvpRanked, mvpGiftScoresHost],
  );

  const topMvpOpponentBattle = useMemo(
    () => buildMvpRanked(mvpGiftScoresOpponent, 3),
    [buildMvpRanked, mvpGiftScoresOpponent],
  );
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
      websocket.connect(effectiveStreamId, token);
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
      setActiveViewers(prev => {
        if (prev.some(v => v.id === uid)) return prev;
        return [...prev, {
          id: uid,
          username: cached?.username || joinName,
          displayName: cached?.displayName || (typeof data.display_name === 'string' ? data.display_name : joinName),
          level: cached?.level || (typeof data.level === 'number' && Number.isFinite(data.level) ? data.level : 1),
          avatar: cached?.avatar || (typeof data.avatar_url === 'string' ? data.avatar_url : ''),
          country: data.country || '',
          joinedAt: Date.now(),
          isActive: true,
          chatFrequency: 0,
          supportDays: 0,
          lastVisitDaysAgo: 0,
        }];
      });
      const joinMsgId = `join-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: joinMsgId,
        username: joinName,
        text: 'joined the stream',
        isSystem: true,
        level: typeof data.level === 'number' && Number.isFinite(data.level) ? data.level : 1,
        avatar: typeof data.avatar_url === 'string' ? data.avatar_url : '',
      }]);
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
      setActiveViewers(prev => prev.filter(v => String(v.id) !== String(data.user_id)));
      setViewerCount(prev => Math.max(0, prev - 1));
      if (data.user_id) {
        setCoHosts(prev => prev.filter(h => h.userId !== data.user_id));
        setBattleSlots(prev => prev.map(s =>
          s.userId === data.user_id ? { userId: '', name: '', status: 'empty' as const, avatar: '' } : s
        ));
      }
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
          : typeof data.level === 'number' && Number.isFinite(data.level)
            ? data.level
            : 1,
        avatar: typeof data.avatar === 'string' ? data.avatar : '',
        stickerUrl: typeof data.stickerUrl === 'string' ? data.stickerUrl : undefined,
        isSystem: !!levelUpMatch,
      };
      setMessages(prev => [...prev, msg]);
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
      const videoUrl =
        pickGiftVideoUrl(data, giftsCatalogRef.current) ||
        (wsGiftId
          ? pickGiftVideoUrl(
              { giftId: wsGiftId, gift_id: wsGiftId },
              giftsCatalogRef.current,
            )
          : null);
      const alreadySeen = !!(txnId && seenGiftTxnRef.current.has(txnId));
      const videoAlreadyPlayed = !!(txnId && playedGiftVideoTxnRef.current.has(txnId));

      // If REST arrived first without a video URL, a later gift_sent with the
      // playable URL must still be allowed to queue the animation.
      if (alreadySeen && (videoAlreadyPlayed || !videoUrl)) return;

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
            (typeof data.level === 'number' && Number.isFinite(data.level) ? data.level : null) ??
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
        const msg: LiveMessage = {
          id: `gift-ws-${txnId || Date.now()}-${Math.random()}`,
          username: typeof data.username === 'string' ? data.username : 'User',
          text: `sent ${giftName}`,
          level: typeof data.level === 'number' && Number.isFinite(data.level) ? data.level : 1,
          avatar: typeof data.avatar === 'string' ? data.avatar : '',
          isGift: true,
        };
        setMessages((prev) => [...prev, msg]);
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

      // In battle, each creator only plays gift videos addressed to their own
      // side — a gift sent to me must not play on the opponent's screen.
      // (Chat, MVP, and PK score stay shared for the whole battle.)
      if (isBattleModeRef.current) {
        const giftSide = normalizeBattleGiftTarget(data.battleTarget);
        const myRole =
          battleRoleRef.current || (isBattleJoiner ? 'opponent' : (isBroadcast ? 'host' : null));
        if (giftSide && myRole && giftSide !== myRole) return;
      }

      const playUrl =
        videoUrl ||
        pickGiftVideoUrl(
          {
            giftId: wsGiftId,
            gift_id: wsGiftId,
            video: typeof data?.video === 'string' ? data.video : '',
            animation_url:
              typeof data?.animation_url === 'string' ? data.animation_url : '',
          },
          giftsCatalogRef.current,
        );
      if (!playUrl) return;

      if (txnId) {
        playedGiftVideoTxnRef.current.add(txnId);
        if (playedGiftVideoTxnRef.current.size > 200) {
          const keep = [...playedGiftVideoTxnRef.current].slice(-100);
          playedGiftVideoTxnRef.current = new Set(keep);
        }
      }
      enqueueGiftVideoRef.current(playUrl);
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
      if (typeof data.opponentRoomId === 'string' && data.opponentRoomId.trim()) {
        setOpponentStreamKey(data.opponentRoomId.trim());
      } else if (typeof data.opponentUserId === 'string' && data.opponentUserId.trim()) {
        setOpponentStreamKey(data.opponentUserId.trim());
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
          // battle_state_sync sends FULL state — but on the joiner's screen an
          // empty/ENDED sync must not wipe the host pane we seeded on arrival
          // (the host is still live in front of us until we leave the battle).
          if (!isBattleJoiner) next[0] = { userId: '', name: '', status: 'empty', avatar: '' };
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

    websocket.on('battle_state_sync', handleBattleStateSync);
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
      // Open ONLY the battle panel so the red Reject / green Join buttons show
      // immediately. Never open the co-host panel here — it covers the battle
      // panel and its Add buttons send co-host invites, not battle invites.
      setShowViewerList(false);
      setIsFindCreatorsOpen(true);
    };

    const handleBattleInviteAccepted = (data) => {
      // Host and battle-playing creators all update slots when someone joins.
      if (!isBroadcast && !isBattleJoiner) return;
      const requesterId = data.requesterUserId as string | undefined;
      const requesterName = data.requesterName as string | undefined;
      const requesterAvatar = data.requesterAvatar as string | undefined;
      if (!requesterId || !requesterName) return;
      setIsBattleMode(true);
      setBattleState('INVITING');
      setOpponentCreatorName(requesterName);
      const oppStreamKey = (data.streamKey as string) || '';
      if (oppStreamKey) setOpponentStreamKey(oppStreamKey);
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

    const handleCohostRequest = (data) => {
      if (!isBroadcast) return;
      setPendingJoinRequest({
        requesterId: data.requesterUserId,
        requesterName: data.requesterName,
        requesterAvatar: data.requesterAvatar || '',
        type: 'cohost',
      });
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
      websocket.off('battle_score', handleBattleScore);
      websocket.off('battle:score_update', handleBattleScoreUpdate);
      websocket.off('battle_countdown', handleBattleCountdown);
      websocket.off('battle_ended', handleBattleEnded);
      websocket.off('battle_ready_state', handleBattleReadyState);
      websocket.off('booster_activated', handleBoosterActivated);
      websocket.off('booster_caught', handleBoosterCaught);
      websocket.off('mist_activated', handleMistActivated);
      websocket.off('battle_invite', handleBattleInvite);
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
  const [userLevel, setUserLevel] = useState(1);


  const [_userXP, setUserXP] = useState(0);
  const [comboCount, setComboCount] = useState(0);
  const [showComboButton, setShowComboButton] = useState(false);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeFaceARGift, setActiveFaceARGift] = useState<
    | { type: 'crown' | 'glasses' | 'mask' | 'ears' | 'hearts' | 'stars'; color?: string }
    | null
  >(null);

  const maybeTriggerFaceARGift = (gift: GiftUiItem) => {
    const mapping: Record<string, { type: 'crown' | 'glasses' | 'mask' | 'ears' | 'hearts' | 'stars'; color?: string } | undefined> = {
      face_ar_crown: { type: 'crown', color: '#FFFFFF' },
      face_ar_glasses: { type: 'glasses', color: '#00D4FF' },
      face_ar_hearts: { type: 'hearts', color: '#FF3B7A' },
      face_ar_mask: { type: 'mask', color: '#7C3AED' },
      face_ar_ears: { type: 'ears', color: '#22C55E' },
      face_ar_stars: { type: 'stars', color: '#F59E0B' },
    };

    const next = mapping[gift.id];
    if (!next) return;
    setActiveFaceARGift(next);
  };

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
    if (!gift || isCreatorParticipant) return;

    const usedTestCoins = Boolean(user?.id && shouldUseTestCoinsForGifts(user.id));
    const spendable = usedTestCoins
      ? getSpendableGiftBalance(coinBalance, user?.id)
      : giftSource === 'starter_coins'
        ? starterCoinBalance
        : coinBalance;
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
        setCoinBalance(debit.newBalance);
        // Test-only: drive a LOCAL level using the same curve as the server so
        // the level visibly climbs while testing. Never sent to the server.
        const sim = addTestGiftXp((user as NonNullable<typeof user>).id, gift.coins);
        if (sim.level > userLevel) {
          setUserLevel(sim.level);
          updateUser({ level: sim.level });
          newLevel = sim.level;
          const levelBannerId = `levelup-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: levelBannerId,
              username: isBroadcast ? creatorName : viewerName,
              text: `reached Level ${sim.level}`,
              level: sim.level,
              isGift: false,
              avatar: isBroadcast ? myAvatar : viewerAvatar,
              isSystem: true,
            },
          ]);
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
              ? gift.video.startsWith('http://') || gift.video.startsWith('https://')
                ? gift.video.trim()
                : resolveGiftAssetUrl(gift.video.startsWith('/') ? gift.video : `/${gift.video}`)
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
            }),
          });

          if (giftErr) {
            const msg = giftErr.message || '';
            if (msg.includes('frozen')) {
              showToast('Account is frozen. Contact support.');
              return;
            }
            if (msg.includes('insufficient_funds')) {
              showToast('Not enough coins');
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
          } else if (result.new_balance != null) {
            setCoinBalance(Math.max(0, Number(result.new_balance)));
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
            setMessages((prev) => [
              ...prev,
              {
                id: levelBannerId,
                username: isBroadcast ? creatorName : viewerName,
                text: `reached Level ${newLevel}`,
                level: newLevel,
                isGift: false,
                avatar: isBroadcast ? myAvatar : viewerAvatar,
                isSystem: true,
              },
            ]);
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
        setCoinBalance(prev => Math.max(0, prev - gift.coins));
      }

      if (gift.video && gift.video.trim()) {
        const raw = gift.video;
        const ext = raw.split('?')[0].toLowerCase();
        const isVid = ext.endsWith('.mp4') || ext.endsWith('.webm');
        if (isVid) {
          const videoUrl = (raw.startsWith('http://') || raw.startsWith('https://'))
            ? raw
            : resolveGiftAssetUrl(raw.startsWith('/') ? raw : `/${raw}`);
          if (videoUrl) {
            setGiftQueue(prev => [...prev, { video: videoUrl }]);
          }
        }
      }
      setShowGiftPanel(false);

      // Track session contribution for membership
      setSessionContribution(prev => prev + gift.coins);

      maybeEnqueueUniverse(gift.name, viewerName);

      // Rose trigger for Speed Challenge
      if (gift.name.toLowerCase().includes('rose')) {
        roseCountRef.current += 1;
        setRoseCount(roseCountRef.current);
      }

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
      setMessages(prev => [...prev, giftMsg]);

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

      // Test coins never touch payments, goals, or battle scores — the server
      // broadcasts them animation-only so everyone in the room sees the video.
      // Persisted gifts include the REST transaction id for source verification.
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
          username: isBroadcast ? creatorName : viewerName,
          coins: usedTestCoins ? 0 : gift.coins,
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
        });
      }
      

      // Handle Combo Logic
      setLastSentGift(gift);
      setComboCount(1);
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

  const handleShare = async () => {
    setShowSharePanel(true);
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
    if (videoTrack) {
      videoTrack.enabled = isCamOff;
      setIsCamOff(!isCamOff);
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
          setLastSentGift(null);
      }, 8000); // keep combo on screen while gift video plays
  };

  const handleComboClick = async () => {
      if (!lastSentGift || isCreatorParticipant) return;
      if (comboCount >= GIFT_COMBO_MAX) return;

      const usedTestCoins = Boolean(user?.id && shouldUseTestCoinsForGifts(user.id));
      const spendable = usedTestCoins
        ? getSpendableGiftBalance(coinBalance, user?.id)
        : giftSource === 'starter_coins'
          ? starterCoinBalance
          : coinBalance;
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
        setCoinBalance(debit.newBalance);
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
            }),
          });

          if (giftErr) {
            const msg = giftErr.message || '';
            if (msg.includes('insufficient_funds')) {
              showToast('Not enough coins');
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
          } else if (result.new_balance != null) {
            setCoinBalance(Math.max(0, Number(result.new_balance)));
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
            setMessages((prev) => [
              ...prev,
              {
                id: levelBannerId,
                username: isBroadcast ? creatorName : viewerName,
                text: `reached Level ${newLevel}`,
                level: newLevel,
                isGift: false,
                avatar: isBroadcast ? myAvatar : viewerAvatar,
                isSystem: true,
              },
            ]);
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
        setCoinBalance(prev => Math.max(0, prev - lastSentGift.coins));
      }

      // Track session contribution for membership
      setSessionContribution(prev => prev + lastSentGift.coins);

      maybeEnqueueUniverse(lastSentGift.name, viewerName);

      // Rose trigger for Speed Challenge
      if (lastSentGift.name.toLowerCase().includes('rose')) {
        roseCountRef.current += 1;
        setRoseCount(roseCountRef.current);
      }

      if (isBroadcast && !isBattleMode) {
        maybeTriggerFaceARGift(lastSentGift);
      }
      
      if (lastSentGift.video && lastSentGift.video.trim()) {
        const videoUrl = (lastSentGift.video.startsWith('http://') || lastSentGift.video.startsWith('https://'))
          ? lastSentGift.video
          : resolveGiftAssetUrl(lastSentGift.video.startsWith('/') ? lastSentGift.video : `/${lastSentGift.video}`);
        if (videoUrl) {
          setGiftQueue(prev => [...prev, { video: videoUrl }]);
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
      setMessages(prev => [...prev, giftMsg]);

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
            ? lastSentGift.video.startsWith('http://') || lastSentGift.video.startsWith('https://')
              ? lastSentGift.video.trim()
              : resolveGiftAssetUrl(
                  lastSentGift.video.startsWith('/')
                    ? lastSentGift.video
                    : `/${lastSentGift.video}`,
                )
            : null;
        websocket.send('gift_sent', {
          giftId: lastSentGift.id,
          giftName: lastSentGift.name,
          username: isBroadcast ? creatorName : viewerName,
          coins: usedTestCoins ? 0 : lastSentGift.coins,
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
        });
      }


      // Handle Combo Logic
      setComboCount((prev) => Math.min(prev + 1, GIFT_COMBO_MAX));
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
      setMessages(prev => [...prev, newMsg]);

      websocket.send('chat_message', {
        text: inputValue,
        level: userLevel,
        avatar: newMsg.avatar,
      });

      setInputValue('');
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
    if (isBroadcast && isBattleMode) {
      exitBattleMode();
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
  }, [pageExiting, isBroadcast, isBattleMode, exitBattleMode, navigate, stopBroadcast]);

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

  const openMiniProfile = async (username: string, coins?: number) => {
    const avatar = username === myCreatorName
      ? myAvatar
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=121212&color=FFFFFF`;
    const level = username === myCreatorName ? userLevel : null;
    const donated = username === myCreatorName ? sessionContribution : 0;
    setMiniProfile({ username, avatar, level, coins, donated });
    try {
      const { data: prof } = await request(`/api/profiles/by-username/${encodeURIComponent(username)}`);
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
        const { data: prof } = await request(`/api/profiles/by-username/${encodeURIComponent(miniProfile.username)}`);
        if (prof?.user_id) {
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
        }
      } catch {
        /* keep */
      }
    }
    if (!targetId) {
      showToast('Could not load profile. Try again.');
      return;
    }
    if (targetId === user.id) return;

    const wasFollowing =
      miniProfileFollowsThem === true ||
      (miniProfileFollowsThem === undefined && useVideoStore.getState().followingUsers.includes(targetId));

    try {
      const session = useAuthStore.getState().session;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const endpoint = wasFollowing
        ? apiUrl(`/api/profiles/${encodeURIComponent(targetId)}/unfollow`)
        : apiUrl(`/api/profiles/${encodeURIComponent(targetId)}/follow`);
      const res = await fetch(endpoint, { method: 'POST', credentials: 'include', headers });
      if (!res.ok) throw new Error('follow failed');

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
    } catch {
      showToast('Could not update follow. Try again.');
    }
  }, [miniProfile, user?.id, miniProfileFollowsThem, navigate, location.pathname]);

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
            style={hasAnyCoHost ? { top: '90px', height: 'calc(36dvh + 10mm)', filter: liveFilterCss !== 'none' ? liveFilterCss : undefined } : { filter: liveFilterCss !== 'none' ? liveFilterCss : undefined }}
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
            {/* Left: Host camera — 50% when co-hosts present, else full */}
            <div
              className={hasAnyCoHost ? 'w-1/2 min-w-0 relative' : 'relative w-full h-full'}
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
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                  style={isBroadcast ? { transform: 'scaleX(-1)', opacity: isCamOff ? 0 : 1, transition: 'opacity 0.3s ease' } : undefined}
                />
                {isCamOff && (
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
                {isBroadcast && hasAnyCoHost && (
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
                )}
              </>
            ) : (
              <>
                <video
                  ref={viewerVideoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
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
              <>
                <canvas
                  ref={faceARCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
                <FaceARGift
                  giftType={activeFaceARGift.type}
                  color={activeFaceARGift.color || '#FFFFFF'}
                />
              </>
            )}

            {isBroadcast && cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#111111] text-white font-bold">
                {cameraError}
              </div>
            )}
            </div>

            {/* Right: co-host 8-slot grid */}
            {hasAnyCoHost && (() => {
              // Self is always shown in the big box only — never in a small tile.
              const list = coHosts.filter(h => !sameUserId(h.userId, user?.id));
              const liveList = list.filter(h => h.status === 'live' || h.status === 'accepted');
              const firstLive = liveList[0];
              const restLive = liveList.slice(1);
              const invitedPending = list.filter(h => h.status === 'invited' || h.status === 'pending_accept');
              const smallSlots: Array<{ type: 'live' | 'invited' | 'pending' | 'empty'; host?: (typeof coHosts)[0] }> = [];
              if (firstLive) smallSlots.push({ type: 'live', host: firstLive });
              restLive.forEach(h => smallSlots.push({ type: 'live', host: h }));
              invitedPending.forEach(h => smallSlots.push({ type: h.status === 'invited' ? 'invited' : 'pending', host: h }));
              while (smallSlots.length < 8) smallSlots.push({ type: 'empty' });

              const renderCoHostCell = (slot: { type: 'live' | 'invited' | 'pending' | 'empty'; host?: (typeof coHosts)[0] }) => {
                if (slot.type === 'live' && slot.host) {
                  const host = slot.host;
                  const camOff = coHostCameraOff[host.id] || remoteCamOff.has(host.userId);
                  const score = cohostGiftScores[host.userId] || 0;
                  const lastGiftIcon = cohostLastGifts[host.userId];
                  return (
                    <>
                      <video
                        ref={(el) => { if (el) coHostVideoRefs.current.set(host.userId, el); else coHostVideoRefs.current.delete(host.userId); }}
                        className="absolute inset-0 w-full h-full object-cover"
                        autoPlay playsInline muted={host.isMuted}
                        style={camOff ? { display: 'none' } : undefined}
                      />
                      {camOff && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#111111] z-[6]">
                          {host.avatar ? <img src={host.avatar} alt="" className="w-10 h-10 object-cover object-center" /> : (
                            <div className="w-10 h-10 bg-[#111111] flex items-center justify-center"><span className="text-[#E8D5A3]/60 text-sm font-bold">{(host.name || '?').charAt(0)}</span></div>
                          )}
                          <span className="text-white/90 text-[8px] font-bold truncate max-w-full px-1">{host.name}</span>
                        </div>
                      )}
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
                    </>
                  );
                }
                if (slot.type === 'invited' && slot.host) return (
                  <>
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-[#111111]">
                      {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover opacity-60" /> : <div className="w-full h-full flex items-center justify-center text-[#E8D5A3]/60 text-base font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                    </div>
                    <p className="text-white/60 text-[9px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                    <span className="text-[#E8D5A3]/70 text-[8px] font-semibold">Waiting</span>
                  </>
                );
                if (slot.type === 'pending' && slot.host) return (
                  <>
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-[#111111]">
                      {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[#D4AF37] text-sm font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                    </div>
                    <p className="text-white text-[8px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                    <span className="text-[#E8D5A3]/70 text-[8px] font-semibold">Pending</span>
                  </>
                );
                return (
                  <button type="button" onClick={() => setShowViewerList(true)} className="flex flex-col items-center justify-center w-full h-full active:scale-95">
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
                    const cellSpeaking = !!cellHost && speakingIds.has(cellHost.userId);
                    return (
                      <div
                        key={i}
                        className={`relative bg-[#111111] flex flex-col items-center justify-center overflow-hidden p-0 min-h-0 border border-[#C9A96E]/40 ${cellSpeaking ? 'elix-speaking-pulse' : ''}`}
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

                  {/* Battle score: totals inside PK bar only (no name strip above) */}
                  <div className="relative z-20 w-full flex-none bg-[#111111]/95 border-b border-white/10">
                    <div
                      className="relative w-full overflow-hidden cursor-pointer pointer-events-auto"
                      style={{ minHeight: is4Player ? '20px' : '16px' }}
                      onClick={(e) => { e.stopPropagation(); if (isBroadcast) { toggleBattle(); } else { spawnHeartFromClient(e.clientX, e.clientY, undefined, heartFloatName, heartFloatAvatar); } }}
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
                    {/* Match timer — flush under battle score bar (0mm gap); SPEED beside timer when active */}
                    <div className="absolute left-0 right-0 top-full z-30 flex justify-center pointer-events-none m-0 p-0">
                      <div className="flex items-center gap-1.5 bg-black/55 backdrop-blur-md rounded-full px-2.5 py-1 border border-white/15 shadow-sm">
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
                      </div>
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
                    {/* Row 1: P1 & P2 — equal joined panes */}
                    <div className="flex flex-1 min-h-0 gap-0">
                      <div
                        className="flex-1 basis-0 min-w-0 h-full overflow-hidden relative bg-[#111111] pointer-events-auto"
                      >
                      <video ref={videoRef} className="w-full h-full object-cover transform scale-x-[-1]" autoPlay playsInline muted style={isCamOff ? { opacity: 0 } : undefined} />
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
                      {/* P1 close — top outer corner (top-left), icon only */}
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
                          <video ref={opponentVideoRef} className="absolute inset-0 w-full h-full object-cover z-10" autoPlay playsInline muted={!!mutedPlayers['opponent']} style={cameraOffPlayers['opponent'] ? { display: 'none' } : undefined} />
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
                          {/* P2 close/remove — top outer corner (top-right), icon only */}
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
                            <video ref={player3VideoRef} className="w-full h-full object-cover" autoPlay playsInline muted={!!mutedPlayers['player3']} style={player3VideoRef.current?.srcObject && !cameraOffPlayers['player3'] ? {} : { display: 'none' }} />
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
                            <video ref={player4VideoRef} className="w-full h-full object-cover" autoPlay playsInline muted={!!mutedPlayers['player4']} style={player4VideoRef.current?.srcObject && !cameraOffPlayers['player4'] ? {} : { display: 'none' }} />
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
              <div className="flex items-center gap-[0mm] min-w-0 flex-1 justify-start pointer-events-auto" style={{ transform: 'translateX(-3mm)' }} onClick={() => { setShowViewerList(false); setIsFindCreatorsOpen(true); }}>
                {topMvpHostBattle.map((viewer, i) => {
                  const isMvp = i === 0 && (mvpGiftScoresHost[viewer.id] ?? 0) > 0;
                  return (
                  <div
                    key={`mvp-l-${viewer.id}`}
                    className="relative flex flex-col items-center"
                    style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '1.5mm' }}
                  >
                    <div className={isMvp ? 'rounded-full ring-2 ring-[#D4AF37] p-[1px] shadow-[0_0_6px_rgba(212,175,55,0.55)]' : ''}>
                      <AvatarRing
                        src={resolveCircleAvatar(viewer.avatar, viewer.displayName || viewer.username)}
                        alt={viewer.displayName || viewer.username || ''}
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
              <div className="flex items-center gap-[0mm] min-w-0 flex-1 justify-end pointer-events-auto" style={{ transform: 'translateX(3mm)' }} onClick={() => { setShowViewerList(false); setIsFindCreatorsOpen(true); }}>
                {topMvpOpponentBattle.map((viewer, i) => {
                  const isMvp = i === 0 && (mvpGiftScoresOpponent[viewer.id] ?? 0) > 0;
                  return (
                  <div
                    key={`mvp-r-${viewer.id}`}
                    className="relative flex flex-col items-center"
                    style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '1.5mm' }}
                  >
                    <div className={isMvp ? 'rounded-full ring-2 ring-[#D4AF37] p-[1px] shadow-[0_0_6px_rgba(212,175,55,0.55)]' : ''}>
                      <AvatarRing
                        src={resolveCircleAvatar(viewer.avatar, viewer.displayName || viewer.username)}
                        alt={viewer.displayName || viewer.username || ''}
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
                        {/* BROADCASTER INFO */}
                        <div className="px-0 py-1 animate-luxury-fade-in relative">
                          <div className="flex items-center relative">
                            <div className={CREATOR_NAME_PILL_CLASSNAME} style={getCreatorNamePillStyle()}>
                            <div 
                              className="relative z-[10] flex-shrink-0 pointer-events-auto cursor-pointer active:scale-95 transition-transform"
                              onClick={(e) => { e.stopPropagation(); openMiniProfile(myCreatorName); }}
                            >
                              <AvatarRing src={resolveCircleAvatar(myAvatar, myCreatorName)} alt={myCreatorName} size={LIVE_TOP_AVATAR_RING_PX} />
                            </div>
                            <div className="flex flex-col justify-center min-w-0 pl-1">
                              <span className="text-white text-[11px] font-bold truncate max-w-[100px] leading-tight">{myCreatorName}</span>
                              <button
                  type="button"
                  className="flex items-center gap-0.5 pointer-events-auto -mt-0.5"
                  onPointerDown={(e) => {
                    handleLikeTap(e);
                  }}
                >
                                <Heart className="w-2 h-2 text-[#D4AF37]" strokeWidth={2.5} fill="#D4AF37" />
                                <span className="text-white/70 text-[8px] font-bold tabular-nums">{(typeof activeLikes === 'number' && Number.isFinite(activeLikes) ? activeLikes : 0).toLocaleString()}</span>
                              </button>
                            </div>
                              
                              {(() => {
                                const _redCount = 0;
                                const _greyCount = 0;
                                return (
                                  <div className="ml-auto self-stretch grid place-items-center pointer-events-auto flex-shrink-0 w-[58px] rounded-full overflow-hidden">
                                    {/* Membership / Join — round end of the capsule (one piece) */}
                                    <button
                                      type="button"
                                      className={`col-start-1 row-start-1 flex items-center justify-center gap-1 self-stretch h-full rounded-full ${hasJoinedToday ? 'bg-[#FF4500]' : 'bg-transparent'} w-full z-0 transition-colors duration-200`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!hasJoinedToday && user?.id && effectiveStreamId) {
                                          const today = new Date().toISOString().split('T')[0];
                                          const storageKey = `joined_stream_${effectiveStreamId}_${user.id}_${today}`;
                                          localStorage.setItem(storageKey, 'true');
                                          
                                          // Update total heart count
                                          const heartKey = `my_heart_count_${effectiveStreamId}_${user.id}`;
                                          const newCount = myHeartCount + 1;
                                          localStorage.setItem(heartKey, newCount.toString());
                                          setMyHeartCount(newCount);
                                          
                                          setMemberCount(prev => prev + 1);
                                          setHasJoinedToday(true);
                                          setShowTeamStatus(true);
                                          
                                          // Send animated heart to chat (ephemeral join banner)
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
                                          setMessages(prev => [...prev, newMessage]);
                                          window.setTimeout(() => {
                                            setMessages(prev => prev.filter(m => m.id !== joinBannerId));
                                          }, 5000);
                                          spawnHeartFromClient(e.clientX, e.clientY, undefined, 'You', '/royce/elix-mark.svg');

                                        } else if (hasJoinedToday) {
                                          setShowTeamStatus(true);
                                        }
                                      }}
                                    >
                                      <div className="relative">
                                        <Heart
                                          className={`w-3.5 h-3.5 ${hasJoinedToday ? 'text-white fill-white' : 'text-[#D4AF37] fill-[#FFFFFF]'}`}
                                          strokeWidth={2.5}
                                        />
                                        {!hasJoinedToday && (
                                          <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#FFFFFF] rounded-full flex items-center justify-center border border-white">
                                            <span className="text-white text-[6px] font-bold leading-none">+</span>
                                          </div>
                                        )}
                                      </div>
                                      <span className={`${hasJoinedToday ? 'text-white' : 'text-[#D4AF37]'} text-[10px] font-bold`}>Join</span>
                                    </button>

                                    {/* Follow Button (Top) — viewers only; calls POST /api/profiles/:id/follow */}
                                    {!isBroadcast && !isFollowing && (
                                      <button
                                        type="button"
                                        className="col-start-1 row-start-1 z-20 relative flex items-center justify-center gap-1 self-stretch h-full rounded-full bg-[#ffffff] w-full"
                                        onClick={followCreatorLive}
                                      >
                                        <Plus size={12} className="text-white" strokeWidth={3} />
                                        <span className="text-white text-[10px] font-bold">Follow</span>
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1 ml-12 pointer-events-auto relative z-20 flex-wrap">
                            <div 
                              className="flex items-center gap-1 bg-black/75 rounded-full px-2.5 py-1 border border-[#D4AF37]/80 shadow-[0_0_8px_rgba(212,175,55,0.35)] cursor-pointer" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowRankingPanel(true);
                              }}
                            >
                              <Trophy className="w-3.5 h-3.5 text-[#D4AF37] flex-shrink-0" strokeWidth={2.25} />
                              <span className="text-[#F5E6A8] text-[11px] font-bold whitespace-nowrap drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">Weekly Ranking &gt;</span>
                            </div>
                            <div 
                              className="flex items-center gap-1 bg-black/75 rounded-full px-2.5 py-1 border border-[#D4AF37]/80 shadow-[0_0_8px_rgba(212,175,55,0.35)] cursor-pointer" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowFanClub(true);
                              }}
                            >
                              <img src="/royce/membership.svg" alt="Membership" className="w-4 h-4 object-contain flex-shrink-0" onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }} />
                              <Heart className="w-3.5 h-3.5 text-[#D4AF37] fill-[#D4AF37] hidden flex-shrink-0" />
                              <span className="text-[#F5E6A8] text-[11px] font-bold whitespace-nowrap drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">Membership</span>
                            </div>
                            {currentUniverse && (
                              <div className="flex items-center gap-1 bg-[#111111]/90 rounded-full px-2.5 py-1 border border-[#D4AF37]/80 shadow-sm">
                                <span className="text-[#F5E6A8] text-[11px] font-bold whitespace-nowrap truncate max-w-[140px]">✨ {universeText} ✨</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pointer-events-auto flex items-center gap-[0mm] mt-1">
                        {topMvpViewers.length > 0 ? (
                          <div
                            className="flex items-center gap-[0mm] pointer-events-auto flex-shrink-0"
                            style={{ transform: 'translateX(-2mm)' }}
                            onClick={() => setShowViewerList((prev) => !prev)}
                          >
                            {topMvpViewers.map((viewer, i) => {
                              const isMvp = i === 0 && (mvpGiftScores[viewer.id] ?? 0) > 0;
                              return (
                              <div
                                key={`top-viewers-${viewer.id}`}
                                style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '1.5mm' }}
                                className="relative"
                              >
                                <div className={isMvp ? 'rounded-full ring-2 ring-[#D4AF37] p-[1px] shadow-[0_0_6px_rgba(212,175,55,0.55)]' : ''}>
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
                          title="Viewers"
                          onClick={() => {
                            // In battle: this opens the battle creator invite panel only,
                            // never the co-host panel.
                            if (isBattleMode) {
                              setShowViewerList(false);
                              setIsFindCreatorsOpen(true);
                              return;
                            }
                            setShowViewerList(prev => !prev);
                          }}
                          className="flex items-center gap-1.5 px-0 py-1 rounded-full bg-transparent border-0 active:scale-95 transition-transform pointer-events-auto"
                          style={{ marginRight: '1mm' }}
                        >
                          <span className="text-white text-[9px] font-bold tabular-nums">{formatCountShort(viewerCount)}</span>
                          <UserPlus size={16} className="text-[#D4AF37]" strokeWidth={2.2} />
                        </button>
                        <button type="button" onClick={closeLiveWithSlide} className="w-8 h-8 royce-glow-disc flex items-center justify-center active:scale-95 transition-transform" title={isBroadcast ? (isBattleMode ? 'End battle' : 'End broadcast') : 'Leave'} aria-label="Close">
                          <RoyceCloseIcon size={18} />
                        </button>
                      </div>
                    </div>
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
              className="chat-zone fixed left-0 right-0 z-[20] flex justify-center pointer-events-none"
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

      {/* Combo — TikTok-style round combo tap (above bottom bar + gift video) */}
      <AnimatePresence>
        {showComboButton && lastSentGift && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed left-0 right-0 bottom-[calc(58px+max(2px,env(safe-area-inset-bottom,0px)))] z-[50001] flex justify-center pointer-events-none"
          >
            <div className="w-full max-w-[480px] mx-auto px-3 flex justify-end pointer-events-auto">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleComboClick(); }}
              disabled={comboCount >= GIFT_COMBO_MAX}
              className="w-[48px] h-[48px] rounded-full bg-gradient-to-b from-[#FF5A7A] to-[#FF2D55] flex flex-col items-center justify-center active:scale-90 transition-transform shadow-[0_0_12px_rgba(255,45,85,0.45)] border border-white/30 disabled:opacity-50"
            >
              {typeof lastSentGift.icon === 'string' && (lastSentGift.icon.startsWith('http') || lastSentGift.icon.startsWith('/')) ? (
                <img src={lastSentGift.icon} alt="" className="w-4 h-4 object-contain mb-0.5" draggable={false} />
              ) : null}
              <span className={`font-black italic text-white drop-shadow-md leading-none ${comboCount >= 1000 ? 'text-[9px]' : 'text-xs'}`}>
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
              <button type="button" title="Send gift" onClick={() => setShowGiftPanel(true)} className={`${LIVE_BOTTOM_ICON_BTN} relative`}>
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
                    onClick={() => {
                      setIsFindCreatorsOpen(false);
                      setShowViewerList(true);
                    }}
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

      {/* Gift panel: spectators open it from their bar; creator has no Gift button. */}
      {showGiftPanel && !isCreatorParticipant && (
        <>
          <div className="fixed inset-0 bg-black/50 pointer-events-auto" style={{ zIndex: 99998 }} onClick={() => setShowGiftPanel(false)} />
          <div className="fixed bottom-0 left-0 right-0 pointer-events-auto max-w-[480px] mx-auto" style={{ zIndex: 99999 }}>
            <GiftPanel
              onSelectGift={handleSendGift}
              userCoins={coinBalance}
              starterCoins={starterCoinBalance}
              giftSource={giftSource}
              onGiftSourceChange={setGiftSource}
              onRechargeSuccess={(newBalance) => { setCoinBalance(newBalance); }}
              onWeeklyRanking={() => { setShowGiftPanel(false); setShowRankingPanel(true); }}
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
            <RankingPanel onClose={() => setShowRankingPanel(false)} />
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
                  const allFull = battleSlots.every(s => s.status !== 'empty');

                  const handleReject = (ev: React.MouseEvent) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setBattleSlots(prev => prev.map(s => s.userId === c.id ? { userId: '', name: '', status: 'empty' as const, avatar: '' } : s));
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
                      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors ${allFull ? 'opacity-70' : ''}`}
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
                          disabled={allFull || !(isBroadcast || isBattleJoiner)}
                          onClick={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            if (!allFull) void inviteCreatorToSlot(c.id);
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
                      {(() => {
                        const lvl = typeof miniProfile.level === 'number' ? miniProfile.level : userLevel;
                        const grad =
                          lvl >= 90 ? 'linear-gradient(180deg,#ffffff 0%,#7a1027 55%,#ffffff 100%)'
                          : lvl >= 60 ? 'linear-gradient(180deg,#a855f7 0%,#4c1d95 55%,#a855f7 100%)'
                          : lvl >= 30 ? 'linear-gradient(180deg,#3b82f6 0%,#1e3a8a 55%,#3b82f6 100%)'
                          : 'linear-gradient(180deg,#22c55e 0%,#14532d 55%,#22c55e 100%)';
                        return (
                          <span
                            className="flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-white text-[10px] font-black italic leading-none border border-white/25"
                            style={{ background: grad, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
                          >
                            LV {lvl}
                          </span>
                        );
                      })()}
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
                <button type="button" onClick={handleShare} className="h-9 rounded-lg bg-white/10 text-white text-[11px] font-bold hover:bg-white/20 active:scale-95 transition-all">
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

      {/* ═══ VIEWER LIST + JOIN REQUESTS PANEL — host only: see join requests (Accept/Decline) and invite spectators as co-host ═══ */}
      {/* NEVER rendered in battle mode: battle invites creators via the battle
          panel only. The co-host Add/Invite button must not exist in battle —
          a co-host invite joins the LIVE page, not the battle. */}
      {showViewerList && !isBattleMode && (
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
              <div className="flex items-center justify-center px-4 pb-2">
                <h3 className="text-white font-bold text-sm">Creators</h3>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4 min-h-0">
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

                {creatorsToInvite
                  .filter((c) => !isSelfUser(c.id, user?.id, effectiveStreamId) && !coHosts.some((h) => sameUserId(h.userId, c.id)))
                  .map((c) => (
                    <div key={c.id} className="flex items-center gap-3 w-full py-2 rounded-lg hover:bg-white/[0.03]">
                      <div
                        className="rounded-full overflow-hidden bg-[#111111] flex-shrink-0"
                        style={{ width: SHARE_PANEL_AVATAR_PX, height: SHARE_PANEL_AVATAR_PX }}
                      >
                        <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{c.name || c.username}</p>
                      </div>
                      {isBroadcast && isMyStreamLive && (
                        <button
                          type="button"
                          onClick={() => {
                            // Co-host only — this panel cannot render in battle mode.
                            inviteCoHost({ id: c.id, streamKey: c.streamKey, name: c.name || c.username, avatar: c.avatar });
                          }}
                          className="px-2.5 py-1 rounded-full bg-[#C9A96E] text-black text-[10px] font-bold flex-shrink-0"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  ))}
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
                       <div className="text-[#D4AF37] text-[10px] font-bold">{g.total_coins.toLocaleString()}</div>
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

              {!IS_STORE_BUILD && (
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

              <button type="button" onClick={() => { setIsReportModalOpen(true); setIsMoreMenuOpen(false); }} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform">
                <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                  <Flag className="w-[18px] h-[18px] text-white/60 relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/60 text-center leading-tight w-full">Report</span>
              </button>

              {isBattleMode && battleWinner && isBroadcast && (
                <button type="button" onClick={() => { startBattleWithAcceptedCreators(); setBattleTime(300); setMyScore(0); setOpponentScore(0); setPlayer3Score(0); setPlayer4Score(0); battleServerTotalsRef.current = { h: 0, o: 0, p3: 0, p4: 0 }; setBattleServerTotals({ h: 0, o: 0, p3: 0, p4: 0 }); setBattleWinner(null); setBattleCountdown(null); reachedThresholdsRef.current.clear(); setIsMoreMenuOpen(false); }} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform">
                  <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                    <RefreshCw className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Rematch</span>
                </button>
              )}

              {isBattleMode && isBroadcast && !battleWinner && battleTime > 0 && (
                <button type="button" onClick={() => { startSpeedChallenge(); setIsMoreMenuOpen(false); }} className="!flex !flex-col !items-center !justify-start gap-1.5 w-full active:scale-95 transition-transform">
                  <div className="royce-glow-disc w-11 h-11 rounded-full relative !flex !items-center !justify-center shrink-0">
                    <Zap className="w-[18px] h-[18px] text-[#D4AF37] relative z-[2]" strokeWidth={1.8} />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70 text-center leading-tight w-full">Speed</span>
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
              <div className="flex items-center justify-center gap-1.5 mb-3">
                <Sparkles size={14} className="text-[#D4AF37]" />
                <span className="text-white text-sm font-bold">Effects</span>
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 px-1">
                {FILTER_PRESETS.filter((f) =>
                  ['none', 'cinema-warm', 'cinema-cold', 'cinema-teal', 'port-soft', 'port-beauty', 'mood-dreamy', 'mood-neon', 'art-bw-high'].includes(f.id),
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
            </div>
          </div>
        </>
      )}

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

      {/* CO-HOST REQUEST PROMPT — a spectator asked to send their video; the creator
          accepts (grants publish so their camera reaches this page) or declines. */}
      {isBroadcast && pendingJoinRequest && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center pointer-events-auto px-6">
          <div className="absolute inset-0 bg-black/50" onClick={declineJoinRequest} />
          <div className="relative w-full max-w-[320px] bg-[#111111]/95 backdrop-blur-md rounded-2xl border border-[#D4AF37]/40 shadow-2xl p-5 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-[#13151A]">
              <img
                src={pendingJoinRequest.requesterAvatar || '/royce/default-avatar.svg'}
                alt={pendingJoinRequest.requesterName}
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>
            <p className="text-white font-bold text-sm text-center">@{pendingJoinRequest.requesterName}</p>
            <p className="text-white/60 text-xs text-center">wants to join your live as co-host</p>
            <div className="flex items-center gap-3 w-full mt-1">
              <button
                type="button"
                onClick={declineJoinRequest}
                className="flex-1 py-2.5 rounded-full bg-white/10 text-white/80 text-xs font-bold active:scale-95 transition-transform"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={acceptJoinRequest}
                className="flex-1 py-2.5 rounded-full bg-[#D4AF37] text-black text-xs font-bold active:scale-95 transition-transform"
              >
                Accept
              </button>
            </div>
          </div>
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
                    className="rounded-full overflow-hidden bg-[#13151A] flex-shrink-0 royce-avatar-glow"
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
                  { name: 'WhatsApp', icon: <MessageCircle size={22} className="text-white" />, action: () => { openExternalLink(`https://wa.me/?text=${encodeURIComponent('Watch my LIVE on Elix! ' + `${window.location.origin}/live/${effectiveStreamId}`)}`); setShowSharePanel(false); } },
                  { name: 'Facebook', icon: <Share2 size={22} className="text-white" />, action: () => { openExternalLink(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}/live/${effectiveStreamId}`)}`); setShowSharePanel(false); } },
                  { name: 'Copy Link', icon: <Copy size={22} className="text-white" />, action: () => { navigator.clipboard.writeText(`${typeof window !== 'undefined' ? window.location.origin : 'https://www.elixstarlive.co.uk'}/live/${effectiveStreamId}`); showToast('Link copied!'); setShowSharePanel(false); } },
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

      {/* Report Modal */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        videoId={effectiveStreamId || ''}
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
