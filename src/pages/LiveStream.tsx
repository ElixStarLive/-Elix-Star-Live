import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { showToast } from '../lib/toast';
import { platform } from '../lib/platform';
import {
  Send,
  Search,
  Heart,
  MessageCircle,
  Share2,
  RefreshCw,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
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
  Check,
  Smile,
  User,
  UserPlus,
  X,
  Sword,
  Coins,
  Lock,
  Flag,
  Camera,
  CameraOff,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { GiftUiItem, GIFT_COMBO_MAX, resolveGiftAssetUrl, fetchGiftsFromDatabase } from '../lib/giftsCatalog';
import { GiftOverlay } from '../components/GiftOverlay';
import GiftAnimationOverlay from '../components/GiftAnimationOverlay';
import { ChatOverlay } from '../components/ChatOverlay';
import { FaceARGift } from '../components/FaceARGift';
import { useLivePromoStore } from '../store/useLivePromoStore';
import { AvatarRing } from '../components/AvatarRing';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { GoldProfileFrame } from '../components/GoldProfileFrame';
import {
  CREATOR_NAME_PILL_CLASSNAME,
  getCreatorNamePillStyle,
  LIVE_MVP_PROFILE_RING_PX,
  LIVE_TOP_AVATAR_RING_PX,
} from '../lib/profileFrame';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import { clearCachedCameraStream, getCachedCameraStream } from '../lib/cameraStream';
import { apiUrl, getLiveKitUrl } from '../lib/api';
import { request } from '../lib/apiClient';
import { fetchAllSharePanelContacts } from '../lib/sharePanelContacts';
import { LevelBadge } from '../components/LevelBadge';
import ReportModal from '../components/ReportModal';
import PromotePanel from '../components/PromotePanel';
import { GiftPanel } from '../components/GiftPanel';
import { RankingPanel } from '../components/RankingPanel';
import { websocket } from '../lib/websocket';
import LiveAIFilters from '../components/LiveAIFilters';
import { liveStreamUiGiftTargetToServerBattleTarget, normalizeBattleGiftTarget } from '../lib/liveBattleGiftTarget';
import { IS_STORE_BUILD } from '../config/build';
import { Room, RoomEvent, LocalVideoTrack, LocalAudioTrack } from 'livekit-client';

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

const EMOJI_LIST = ['😀','😂','🥰','😍','🔥','💯','👏','🎉','❤️','💜','💙','⭐','🌟','✨','🙌','👑','💎','🚀','🎵','💃','🕺','😎','🤩','💪','🫶','💖'];
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
  const [viewerHasStream, setViewerHasStream] = useState(false);
  const [giftsCatalog, setGiftsCatalog] = useState<GiftUiItem[]>([]);
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
  const [messages, setMessages] = useState<LiveMessage[]>(() => []);
  const [coinBalance, setCoinBalance] = useState(0);
  const [inputValue, setInputValue] = useState('');
  // Consolidate broadcast logic: host if streamId is broadcast OR if streamId matches my own user ID
  const isBroadcast = streamId === 'broadcast' || location.pathname === '/live/broadcast' || (user?.id && streamId === user.id);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [showModerationWarning, setShowModerationWarning] = useState(false);
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
  const getPersistedTestCoinsBalance = (userId: string | undefined) => {
    if (!userId || typeof localStorage === 'undefined') return 0;
    try {
      const v = localStorage.getItem(`elix_test_coins_balance_${userId}`);
      return v ? Math.max(0, parseInt(v, 10)) : 0;
    } catch { return 0; }
  };
  const persistTestCoinsBalance = (userId: string | undefined, balance: number) => {
    if (!userId || typeof localStorage === 'undefined') return;
    try { localStorage.setItem(`elix_test_coins_balance_${userId}`, String(Math.max(0, balance))); } catch {}
  };
  const [showViewerList, setShowViewerList] = useState(false);
  const [moderators, setModerators] = useState<Set<string>>(new Set());
  const attachRemoteAudio = useCallback((track: import('livekit-client').Track, el: HTMLAudioElement | null) => {
    if (track.kind !== 'audio') return;
    if (el) {
      track.attach(el);
      el.muted = false;
      el.volume = 1;
      el.autoplay = true;
      (el as any).playsInline = true;
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
  const formatStreamName = (id: string) =>
    id
      .split(/[-_]/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  const resolveCircleAvatar = useCallback((avatar: string | null | undefined, name: string | null | undefined) => {
    const direct = typeof avatar === 'string' ? avatar.trim() : '';
    if (direct) return direct;
    const label = String(name || 'User').trim() || 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=121212&color=C9A96E`;
  }, []);
  const [hostName, setHostName] = useState('');
  const [hostAvatar, setHostAvatar] = useState('');
  const creatorName = isBroadcast
    ? user?.name || user?.username || 'Creator'
    : hostName || 'Creator';
  const myCreatorName = creatorName;
  const myAvatar = isBroadcast
    ? user?.avatar || ''
    : hostAvatar || '';
  const [opponentCreatorName, setOpponentCreatorName] = useState('');
  const viewerName = user?.username || user?.name || 'viewer_123';
  const viewerAvatar =
    user?.avatar || `https://ui-avatars.com/api/?name=&background=121212&color=C9A96E`;
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
        showToast('Following');
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

  // Auto-close Viewer List after 10 seconds of inactivity
  useEffect(() => {
    if (showViewerList) {
      const timer = setTimeout(() => {
        setShowViewerList(false);
      }, 10000);
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
    setHostAvatar(`https://ui-avatars.com/api/?name=${encodeURIComponent(hostLabel)}&background=121212&color=C9A96E`);
  }, [isBroadcast, effectiveStreamId]);

  useEffect(() => {
    if (!user?.id) return;
    
    setUserLevel(user.level || 1);
    setUserXP(0);

    request('/api/wallet/').then(({ data, error: walletErr }) => {
      if (!walletErr && data?.balance != null) {
        setCoinBalance(Math.max(0, Number(data.balance)));
      } else {
        const persisted = getPersistedTestCoinsBalance(user.id);
        setCoinBalance(Math.max(0, persisted));
      }
    }).catch(() => {
      const persisted = getPersistedTestCoinsBalance(user.id);
      setCoinBalance(Math.max(0, persisted));
    });
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
      } catch (startErr) {
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

      // Try battle opponent slot — attach to whichever battle ref doesn't have a stream yet
      if (isBattleModeRef.current) {
        const oppEl = opponentVideoRef.current;
        if (oppEl && !oppEl.srcObject) {
          track.attach(oppEl);
          setHasOpponentStream(true);
          return;
        }
        if (player3VideoRef.current && !player3VideoRef.current.srcObject) { track.attach(player3VideoRef.current); return; }
        if (player4VideoRef.current && !player4VideoRef.current.srcObject) { track.attach(player4VideoRef.current); return; }
      }
    };

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      attachRemoteTrack(track, participant);
    });

    (async () => {
      try {
        await room.connect(liveKitCreds.url, liveKitCreds.token);
        for (const [, participant] of room.remoteParticipants) {
          for (const [, pub] of participant.videoTrackPublications) {
            if (pub.track && pub.isSubscribed) attachRemoteTrack(pub.track, participant);
          }
          for (const [, pub] of participant.audioTrackPublications) {
            if (pub.track && pub.isSubscribed) attachRemoteAudio(pub.track, roomRemoteAudioRef.current);
          }
        }
        if (videoTrack) {
          const localVideo = new LocalVideoTrack(videoTrack);
          await room.localParticipant.publishTrack(localVideo, { name: 'camera' });
        }
        if (audioTrack) {
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
      liveKitRoomRef.current = null;
      room.disconnect();
    };
  }, [isBroadcast, liveKitCreds, cameraStream]);

  const [isFindCreatorsOpen, setIsFindCreatorsOpen] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
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
  const [creators, setCreators] = useState<{ id: string; name: string; username: string; followers: string; avatar: string; isLive: boolean }[]>([]);
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
        .map((s: any) => {
          const uid = s.user_id ?? s.userId ?? s.hostUserId ?? '';
          const title = s.title ?? s.display_name ?? s.displayName ?? '';
          const label = title ? title.slice(0, 20) : (uid ? uid.slice(0, 8) : 'Creator');
          return { uid, label };
        })
        .filter(({ uid }) => uid && uid !== user.id)
        .map(({ uid, label }) => {
          const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=121212&color=C9A96E`;
          return {
            id: uid,
            name: label,
            username: label,
            followers: '0',
            avatar,
            isLive: true,
          };
        });
      setCreators(liveCreators);
      setCreatorsLoadFailed(false);
    } catch (error) {
      setCreatorsLoadFailed(true);
      setCreators([]);
    } finally {
      setCreatorsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) loadCreators();
  }, [user?.id, loadCreators]);

  // Refetch creators when opening Invite panel so list is fresh
  useEffect(() => {
    if (isFindCreatorsOpen && user?.id) loadCreators();
  }, [isFindCreatorsOpen, loadCreators]);

  const filteredCreators = creators.filter((c) => {
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
  const inviteTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const inviteCreatorToSlot = async (creatorId: string) => {
    const slotIndex = battleSlots.findIndex(s => s.status === 'empty');
    if (slotIndex === -1) return;
    if (battleSlots.some(s => s.userId === creatorId && s.status !== 'empty')) return;

    const creator = creators.find(c => c.id === creatorId);
    if (!creator) return;
    const avatar = creator.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.username)}&background=121212&color=C9A96E`;
    setBattleSlots(prev => {
      const next = [...prev];
      next[slotIndex] = { userId: creatorId, name: creator.username, status: 'invited', avatar };
      return next;
    });

    if (!user?.id) return;
    websocket.send('battle_invite_send', {
      targetUserId: creatorId,
      hostName: myCreatorName,
      hostAvatar: myAvatar,
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
      setIsFindCreatorsOpen(true);
      const inviter = pendingInvite;
      setCreators(prev => {
        if (prev.some(c => c.id === inviter.hostUserId)) return prev;
        return [...prev, { id: inviter.hostUserId, name: inviter.hostName, username: inviter.hostName, followers: '0', avatar: inviter.hostAvatar, isLive: true }];
      });
    }
  }, [pendingInvite]);

  const acceptBattleInvite = async () => {
    if (!pendingInvite || !user?.id) return;
    const invite = pendingInvite;
    setPendingInvite(null);
    if (!invite.streamKey) {
      showToast('Invalid invite — missing stream key');
      return;
    }
    try {
      const myUsername = user?.username || user?.name || viewerName;
      websocket.send('battle_invite_accept', {
        hostUserId: invite.hostUserId,
        requesterName: myUsername,
        requesterAvatar: viewerAvatar,
        streamKey: effectiveStreamId,
      });
    } catch { /* fire-and-forget */ }

    if (isBroadcast) {
      showToast(`Battle with @${invite.hostName} starting!`);
      setIsBattleMode(true);
      setBattleState('INVITING');
      setOpponentCreatorName(invite.hostName);
      if (invite.streamKey) setOpponentStreamKey(invite.streamKey);
      setBattleSlots(prev => {
        const next = [...prev];
        const emptyIdx = next.findIndex(s => s.status === 'empty');
        if (emptyIdx !== -1) {
          next[emptyIdx] = { userId: invite.hostUserId, name: invite.hostName, status: 'accepted', avatar: invite.hostAvatar };
        }
        return next;
      });
      websocket.send('battle_create', {
        hostName: myCreatorName,
        opponentUserId: invite.hostUserId,
        opponentName: invite.hostName,
        opponentRoomId: invite.streamKey,
      });
    } else {
      showToast(`Joining @${invite.hostName}'s battle...`);
      navigate(`/live/${invite.streamKey}?battle=1`);
    }
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

  const removePlayerFromSlot = (slotIndex: number) => {
    setBattleSlots(prev => {
      const next = [...prev];
      next[slotIndex] = { userId: '', name: '', status: 'empty', avatar: '' };
      return next;
    });
  };

  const filledSlots = battleSlots.filter(s => s.status !== 'empty');
  const allFilledAccepted = filledSlots.length > 0 && filledSlots.every(s => s.status === 'accepted');
  const anySlotFilled = filledSlots.length > 0;
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
  const [hostSearchQuery, setHostSearchQuery] = useState('');
  const [featuredHostId, setFeaturedHostId] = useState<string | null>(null);
  const coHostTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const coHostsRef = useRef<CoHost[]>([]);
  const isBroadcastRef = useRef(false);
  const MAX_CO_HOSTS = 8;

  // Keep refs in sync for use inside WebSocket handlers (avoid stale closure)
  useEffect(() => {
    coHostsRef.current = coHosts;
    isBroadcastRef.current = isBroadcast;
  }, [coHosts, isBroadcast]);

  // Broadcast co-host layout to room so spectators see same layout (single source of truth; no duplicate userIds)
  useEffect(() => {
    if (!isBroadcast || !effectiveStreamId || !user?.id) return;
    const list = coHosts.map((h) => ({ id: h.id, userId: h.userId, name: h.name, avatar: h.avatar, status: h.status }));
    const payload = { roomId: effectiveStreamId, coHosts: list, hostUserId: user.id };
    websocket.send('cohost_layout_sync', payload);
  }, [isBroadcast, effectiveStreamId, user?.id, coHosts]);

  const inviteCoHost = async (creator: { id: string; name: string; avatar?: string }) => {
    if (!isBroadcast || !isMyStreamLive) {
      showToast('You must be live to invite co-hosts');
      return;
    }
    if (coHosts.length >= MAX_CO_HOSTS) return;
    if (coHosts.some(h => h.userId === creator.id)) return;

    const newHost: CoHost = {
      id: `host-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: creator.id,
      name: creator.name,
      avatar: creator.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.name)}&background=121212&color=C9A96E`,
      status: 'invited',
      isMuted: false,
    };
    setCoHosts(prev => {
      if (prev.some(h => h.userId === creator.id)) return prev;
      return [...prev, newHost];
    });

    if (!user?.id) return;
    websocket.send('cohost_invite_send', {
      targetUserId: creator.id,
      hostName: myCreatorName,
      hostAvatar: myAvatar,
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
      return [...prev, { id: inv.hostUserId, name: inv.hostName, username: inv.hostName, followers: '', avatar: inv.hostAvatar, isLive: true }];
    });
  }, [pendingCohostInvite]);

  const acceptCohostInvite = async () => {
    if (!pendingCohostInvite || !user?.id) return;
    const inv = pendingCohostInvite;
    setPendingCohostInvite(null);
    const myName = user?.username || user?.name || 'Creator';
    websocket.send('cohost_invite_accept', {
      hostUserId: inv.hostUserId,
      cohostName: myName,
      cohostAvatar: user?.avatar || '',
      streamKey: inv.streamKey,
    });
    showToast(`Joining @${inv.hostName}'s live as spectator`);
    if (inv.streamKey) navigate(`/watch/${inv.streamKey}`);
  };

  const declineCohostInvite = () => {
    setPendingCohostInvite(null);
  };

  // ─── JOIN REQUEST: creator receives when someone asked to join (from viewer) ───
  type PendingJoinRequest = { requesterName: string; requesterAvatar: string; requesterId: string; type: 'cohost' | 'battle' };
  const [pendingJoinRequest, setPendingJoinRequest] = useState<PendingJoinRequest | null>(null);

  const acceptJoinRequest = async () => {
    if (!pendingJoinRequest || !user?.id) return;
    const req = pendingJoinRequest;
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
        avatar: req.requesterAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(req.requesterName)}&background=121212&color=C9A96E`,
        status: 'live',
        isMuted: false,
      }];
    });
    showToast(`Accepted @${req.requesterName}'s co-host request!`);
  };

  const declineJoinRequest = async () => {
    if (!pendingJoinRequest) return;
    const requesterId = pendingJoinRequest.requesterId;
    setPendingJoinRequest(null);
    if (requesterId) websocket.send('cohost_request_decline', { requesterUserId: requesterId });
    showToast('Request declined');
  };

  const removeCoHost = (hostId: string) => {
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

  const liveCoHosts = coHosts.filter(h => h.status === 'live');
  const featuredHost = featuredHostId ? liveCoHosts.find(h => h.id === featuredHostId) : null;
  const smallHosts = featuredHost ? liveCoHosts.filter(h => h.id !== featuredHostId) : liveCoHosts;
  const hostGridCols = smallHosts.length <= 1 ? 1 : smallHosts.length <= 4 ? 2 : smallHosts.length <= 9 ? 3 : 4;

  const toggleFeatured = (hostId: string) => {
    setFeaturedHostId(prev => prev === hostId ? null : hostId);
  };

  const filteredHostCreators = creators.filter(c =>
    c.name.toLowerCase().includes(hostSearchQuery.trim().toLowerCase()) &&
    !coHosts.some(h => h.userId === c.id || h.name === c.name)
  );
  const liveHostCreators = filteredHostCreators.filter(c => c.isLive);
  const offlineHostCreators = filteredHostCreators.filter(c => !c.isLive);

  useEffect(() => {
    return () => {
      coHostTimersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // Battle Mode State
  const [battleState, setBattleState] = useState<BattleState>('LIVE_SOLO');
  const [isBattleMode, setIsBattleMode] = useState(false);
  const isBattleModeRef = useRef(false);
  const battleEndedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { isBattleModeRef.current = isBattleMode; }, [isBattleMode]);
  const isBattleJoiner = !isBroadcast && new URLSearchParams(location.search).get('battle') === '1';

  // If joining as battle participant, enter battle mode and start camera (server drives timer/countdown)
  const battleLkRoomRef = useRef<Room | null>(null);
  useEffect(() => {
    if (!isBattleJoiner || !user?.id) return;
    setIsBattleMode(true);
    setBattleState('INVITING');
    setMyScore(0);
    setOpponentScore(0);

    let cancelled = false;
    (async () => {
      const hostLabel = effectiveStreamId.slice(0, 8).toUpperCase();
      let hName = `Host ${hostLabel}`;
      let hAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(hostLabel)}&background=121212&color=C9A96E`;
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
        next[0] = { userId: effectiveStreamId, name: hName, status: 'accepted', avatar: hAvatar };
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
        const { data: tokenData, error: tokenErr } = await request(`/api/live/token?room=${encodeURIComponent(effectiveStreamId)}&publish=1`);
        if (tokenErr || cancelled) return;
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
            setHasOpponentStream(true);
          }
        });

        await room.connect(lkUrl, lkToken);
        if (cancelled) { room.disconnect(); return; }

        for (const [, participant] of room.remoteParticipants) {
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
  }, [isBattleJoiner, user?.id, effectiveStreamId]);

  // Battle state driven by WebSocket backend.
  useEffect(() => {
    if (!effectiveStreamId || (!isBroadcast && !isBattleJoiner)) return;
    return () => {
      if (battlePeerRef.current) { battlePeerRef.current.close(); battlePeerRef.current = null; }
    };
  }, [effectiveStreamId, isBroadcast, isBattleJoiner]);
  const [liveFilterCss, setLiveFilterCss] = useState('none');
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
  const lastBattleTapTimeRef = useRef<number>(0);
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
  const [battleReadiness, setBattleReadiness] = useState(0);
  const [hasOpponentStream, setHasOpponentStream] = useState(false);
  const [opponentStreamKey, setOpponentStreamKey] = useState<string | null>(null);
  const battleRoleRef = useRef<'host' | 'opponent' | null>(null);
  const [battleUiRole, setBattleUiRole] = useState<'host' | 'opponent'>(() =>
    isBattleJoiner ? 'opponent' : 'host',
  );
  /** Authoritative host/opponent/P3/P4 totals from server (never role-swapped) — fixes bar showing 0 for the other team. */
  const battleServerTotalsRef = useRef({ h: 0, o: 0, p3: 0, p4: 0 });
  const lastBattleScoreUpdateTraceSigRef = useRef('');
  const [battleServerTotals, setBattleServerTotals] = useState({ h: 0, o: 0, p3: 0, p4: 0 });
  const opponentLkRoomRef = useRef<Room | null>(null);
  const [iAmReady, setIAmReady] = useState(false);
  const [hostIsReady, setHostIsReady] = useState(false);
  const [opponentIsReady, setOpponentIsReady] = useState(false);

  // Peer connections for battle & co-host
  const isBattleParticipant = !isBroadcast && new URLSearchParams(location.search).get('battle') === '1';
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

  const isRegularViewer = !isBroadcast && !isBattleParticipant;

  // Connect to opponent's LiveKit room to receive their video (both creators are live in separate rooms)
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
            setHasOpponentStream(true);
          }
        });

        await room.connect(url, token);
        if (!mounted) { room.disconnect(); return; }

        for (const [, participant] of room.remoteParticipants) {
          for (const [, pub] of participant.videoTrackPublications) {
            if (pub.track && pub.isSubscribed && opponentVideoRef.current) {
              pub.track.attach(opponentVideoRef.current);
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
      opponentLkRoomRef.current = null;
      setHasOpponentStream(false);
    };
  }, [isBattleMode, opponentStreamKey, isBroadcast, effectiveStreamId, attachRemoteAudio]);

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

  useEffect(() => { speedChallengeActiveRef.current = speedChallengeActive; }, [speedChallengeActive]);
  useEffect(() => { speedMultiplierRef.current = speedMultiplier; }, [speedMultiplier]);

  const speedChallengeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reachedThresholdsRef = useRef<Set<number>>(new Set());
  const [lastGifts, setLastGifts] = useState<{ opponent: string | null; player3: string | null; player4: string | null }>({ opponent: null, player3: null, player4: null });
  const [floatingHearts, setFloatingHearts] = useState<
    Array<{ id: string; x: number; y: number; dx: number; rot: number; size: number; color: string; username?: string; avatar?: string }>
  >([]);
  const [miniProfile, setMiniProfile] = useState<null | { id?: string; username: string; avatar: string; level: number | null; coins?: number; donated?: number; bio?: string; followers_count?: number; following_count?: number }>(null);
  /** Synced from GET /following when panel user id is known; used so Follow matches server (does not touch host top-bar isFollowing). */
  const [miniProfileFollowsThem, setMiniProfileFollowsThem] = useState<boolean | undefined>(undefined);
  const [showMembershipBar, setShowMembershipBar] = useState(false);
  const [showTeamStatus, setShowTeamStatus] = useState(false);
  const [showJoinAnimation, setShowJoinAnimation] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [membershipHeartActive, setMembershipHeartActive] = useState(false);
  const membershipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FAN CLUB PANEL - removed top bar, now using Sheet
  const [showFanClub, setShowFanClub] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Photo Stickers
  const [creatorStickers, setCreatorStickers] = useState<{ id: number; image_url: string; label: string }[]>([]);
  const [stickerUploading, setStickerUploading] = useState(false);
  const stickersFetchedRef = useRef(false);

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
        if (!cancelled) setMiniProfileFollowsThem(ids.includes(miniProfile.id!));
      } catch {
        if (!cancelled) setMiniProfileFollowsThem(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
      showToast('Subscriptions are available through in-app purchases.');
    } catch {
      /* ignore */
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

  const openMembershipBar = useCallback(() => {
    if (membershipTimerRef.current) clearTimeout(membershipTimerRef.current);
    // Instead of opening the top bar, we now open the bottom sheet Fan Club
    setShowFanClub(true);
  }, [closeMembershipBar]);
  const [sessionContribution, setSessionContribution] = useState(0); // total coins gifted this session
  const [universeQueue, setUniverseQueue] = useState<UniverseTickerMessage[]>([]);
  const [currentUniverse, setCurrentUniverse] = useState<UniverseTickerMessage | null>(null);

  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
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
    const label = shareFollowers.find((f) => f.user_id === targetUserId)?.username || 'user';
    try {
      const { data: j, error: shareErr } = await request('/api/live-share', {
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
      showToast(`Shared live with ${label}`);
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

  const toggleBattle = useCallback(() => {
    if (isBattleMode) {
      endBattleCleanup();
      // Tell server to end battle
      websocket.send('battle_end', {});
      const params = new URLSearchParams(location.search);
      if (params.has('battle')) {
        params.delete('battle');
        navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
      }
      return;
    }
    // Enter battle mode -> INVITING state, everything clean
    setBattleState('INVITING');
    setIsBattleMode(true);
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
    setIsFindCreatorsOpen(true);
    websocket.send('battle_create', { hostName: creatorName });
  }, [isBattleMode, location.search, location.pathname, navigate, endBattleCleanup, creatorName]);

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
    const colors = ['#FF0000', '#FF2D55', '#E60026', '#DC143C', '#FF1744', '#CC0000'];
    const color = colorOverride ?? colors[Math.floor(Math.random() * colors.length)];
    
    // Check if this is a membership heart (triggered by "Joined the team")
    const isMembership = likerName === 'You' && likerAvatar === '/Icons/elix-logo.png';

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
    spawnHeartAt(x, y, colorOverride ?? '#FF2D55', likerName, likerAvatar);
  };

  const spawnHeartAtSide = useCallback((target: 'me' | 'opponent') => {
    const layer = chatHeartLayerRef.current;
    if (!layer) return;
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    if (w <= 0 || h <= 0) return;
    const x = w * (target === 'me' ? 0.35 : 0.65);
    const y = h * (0.55 + Math.random() * 0.15);
    spawnHeartAt(x, y, '#FF2D55', heartFloatName, heartFloatAvatar);
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


  // Speed challenge: total battle score thresholds — 200 → x2, 1000 → x3, 5000 → x5 (each 60s once crossed)
  useEffect(() => {
    if (!SPEED_CHALLENGE_ENABLED || !isBattleMode || battleWinner) return;
    if (speedChallengeActive) return;

    const totalScore = myScore + opponentScore + player3Score + player4Score;

    if (totalScore >= 5000 && !reachedThresholdsRef.current.has(5000)) {
      reachedThresholdsRef.current.add(5000);
      reachedThresholdsRef.current.add(1000);
      reachedThresholdsRef.current.add(200);
      setSpeedMultiplier(5);
      speedMultiplierRef.current = 5;
      startSpeedChallenge();
      return;
    }
    if (totalScore >= 1000 && !reachedThresholdsRef.current.has(1000)) {
      reachedThresholdsRef.current.add(1000);
      reachedThresholdsRef.current.add(200);
      setSpeedMultiplier(3);
      speedMultiplierRef.current = 3;
      startSpeedChallenge();
      return;
    }
    if (totalScore >= 200 && !reachedThresholdsRef.current.has(200)) {
      reachedThresholdsRef.current.add(200);
      setSpeedMultiplier(2);
      speedMultiplierRef.current = 2;
      startSpeedChallenge();
    }
  }, [myScore, opponentScore, player3Score, player4Score, isBattleMode, battleWinner, speedChallengeActive, startSpeedChallenge]);

  // Auto-cycle multiplier during speed challenge (changes every 2-3s) - DISABLED to follow user's score-based rule
  /*
  useEffect(() => {
    if (!speedChallengeActive) {
      setSpeedMultiplier(1);
      return;
    }
    const multipliers = [2, 3, 5];
    const cycle = () => {
      const next = multipliers[Math.floor(Math.random() * multipliers.length)];
      setSpeedMultiplier(next);
    };
    cycle(); // Start with a random multiplier
    const interval = setInterval(cycle, 2000 + Math.random() * 1000);
    return () => clearInterval(interval);
  }, [speedChallengeActive]);
  */

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

      if (key === 'ArrowLeft' || key === 'a' || key === 'A' || code === 'Numpad4') {
        e.preventDefault();
        handleBattleTap('me');
        spawnHeartAtSide('me');
        addLiveLikes(1);
        return;
      }

      if (key === 'ArrowRight' || key === 'd' || key === 'D' || code === 'Numpad6') {
        e.preventDefault();
        handleBattleTap('opponent');
        spawnHeartAtSide('opponent');
        addLiveLikes(1);
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
  }, [effectiveStreamId]);

  const topMvpViewers = useMemo(() => {
    return [...activeViewers].sort((a, b) => {
      const sa = mvpGiftScores[a.id] ?? 0;
      const sb = mvpGiftScores[b.id] ?? 0;
      if (sb !== sa) return sb - sa;
      return b.level - a.level;
    });
  }, [activeViewers, mvpGiftScores]);

  const topMvpHostBattle = useMemo(() => {
    return [...activeViewers].sort((a, b) => {
      const sa = mvpGiftScoresHost[a.id] ?? 0;
      const sb = mvpGiftScoresHost[b.id] ?? 0;
      if (sb !== sa) return sb - sa;
      return b.level - a.level;
    });
  }, [activeViewers, mvpGiftScoresHost]);

  const topMvpOpponentBattle = useMemo(() => {
    return [...activeViewers].sort((a, b) => {
      const sa = mvpGiftScoresOpponent[a.id] ?? 0;
      const sb = mvpGiftScoresOpponent[b.id] ?? 0;
      if (sb !== sa) return sb - sa;
      return b.level - a.level;
    });
  }, [activeViewers, mvpGiftScoresOpponent]);
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

    const handleRoomState = (data: any) => {
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
          avatar: cached?.avatar || (typeof v.avatar_url === 'string' ? v.avatar_url : ''),
          country: v.country || '',
          joinedAt: Date.now(),
          isActive: true,
          chatFrequency: 0,
          supportDays: 0,
          lastVisitDaysAgo: 0,
        });
        const socketAvatar = typeof v.avatar_url === 'string' ? v.avatar_url.trim() : '';
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

    const handleUserJoined = (data: any) => {
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
      setMessages(prev => [...prev, {
        id: `join-${Date.now()}`,
        username: joinName,
        text: 'joined the stream',
        isSystem: true,
        level: typeof data.level === 'number' && Number.isFinite(data.level) ? data.level : 1,
        avatar: typeof data.avatar_url === 'string' ? data.avatar_url : '',
      }]);
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

    const handleUserLeft = (data: any) => {
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

    const handleChatMessage = (data: any) => {
      if (!mounted) return;
      if (data.user_id === user?.id) return;
      const msg: LiveMessage = {
        id: `ws-${Date.now()}-${Math.random()}`,
        username: typeof data.username === 'string' ? data.username : 'User',
        text: typeof data.text === 'string' ? data.text : '',
        level: typeof data.level === 'number' && Number.isFinite(data.level) ? data.level : 1,
        avatar: typeof data.avatar === 'string' ? data.avatar : '',
        stickerUrl: typeof data.stickerUrl === 'string' ? data.stickerUrl : undefined,
      };
      setMessages(prev => [...prev, msg]);
    };

    const handleGiftSent = (data: any) => {
      if (!mounted) return;
      const giftDef = giftsCatalog.find(g => g.id === data.giftId);
      const gifterId = typeof data.user_id === 'string' ? data.user_id : '';
      const giftCoins =
        giftDef?.coins ??
        (typeof data.coins === 'number' && Number.isFinite(data.coins) ? data.coins : 0);
      if (gifterId && giftCoins > 0) {
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
      if (giftDef) {
        const msg: LiveMessage = {
          id: `gift-ws-${Date.now()}-${Math.random()}`,
          username: typeof data.username === 'string' ? data.username : 'User',
          text: `sent ${giftDef.name}`,
          level: typeof data.level === 'number' && Number.isFinite(data.level) ? data.level : 1,
          avatar: typeof data.avatar === 'string' ? data.avatar : '',
          isGift: true,
        };
        setMessages(prev => [...prev, msg]);
        

        const isVideoFile = (value: string) => {
          const p = value.split('?')[0].toLowerCase();
          return p.endsWith('.mp4') || p.endsWith('.webm');
        };
        const incomingVideo = typeof data.video === 'string' ? data.video : '';
        const defVideo = typeof giftDef.video === 'string' ? giftDef.video : '';
        const pickedRawVideo = defVideo && isVideoFile(defVideo)
          ? defVideo
          : (incomingVideo && isVideoFile(incomingVideo) ? incomingVideo : '');
        if (pickedRawVideo && pickedRawVideo.trim()) {
          const videoUrl = (pickedRawVideo.startsWith('http://') || pickedRawVideo.startsWith('https://'))
            ? pickedRawVideo
            : resolveGiftAssetUrl(pickedRawVideo.startsWith('/') ? pickedRawVideo : `/${pickedRawVideo}`);
          
          setGiftQueue(prev => [...prev, { video: videoUrl }]);
        }
      }
    };

    // Server-controlled battle events — single source of truth
    const applyBattleScores = (data: any) => {
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
      battleServerTotalsRef.current = nextS;
      setBattleServerTotals(nextS);
      setPlayer3Score(nextS.p3);
      setPlayer4Score(nextS.p4);

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

    const handleBattleStateSync = (data: any) => {
      if (!mounted) return;
      const syncStatus = typeof data.status === 'string' ? data.status : '';
      if (syncStatus === 'ACTIVE' && prevBattleSyncStatusRef.current !== 'ACTIVE') {
        battleTapScoreRemainingRef.current = 5;
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
      
      setBattleSlots(prev => {
        const next = [...prev];
        const seenIds = new Set<string>();

        // Opponent
        if (data.opponentName) {
          next[0] = { userId: data.opponentUserId || '', name: data.opponentName, status: 'accepted', avatar: '' };
          if (data.opponentUserId) seenIds.add(data.opponentUserId);
        } else {
          // Keep existing if not provided? Or clear? 
          // battle_state_sync sends FULL state. If opponentName is missing, it's empty.
          // But data.opponentName check is safe?
          // The sync payload has empty strings for empty slots.
          if (!data.opponentUserId) next[0] = { userId: '', name: '', status: 'empty', avatar: '' };
        }

        // Player 3
        if (data.player3Name && data.player3UserId && !seenIds.has(data.player3UserId)) {
          next[1] = { userId: data.player3UserId || '', name: data.player3Name, status: 'accepted', avatar: '' };
          seenIds.add(data.player3UserId);
        } else {
          next[1] = { userId: '', name: '', status: 'empty', avatar: '' };
        }

        // Player 4
        if (data.player4Name && data.player4UserId && !seenIds.has(data.player4UserId)) {
          next[2] = { userId: data.player4UserId || '', name: data.player4Name, status: 'accepted', avatar: '' };
        } else {
          next[2] = { userId: '', name: '', status: 'empty', avatar: '' };
        }
        return next;
      });
    };

    const handleBattleScore = (data: any) => {
      if (!mounted) return;
      applyBattleScores(data);
    };

    /** Server ~300ms authoritative snapshot — never let stale tick lower scores (async DB race). */
    const handleBattleScoreUpdate = (data: any) => {
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

    const handleBattleCountdown = (data: any) => {
      if (!mounted) return;
      setBattleCountdown(data.count ?? null);
      if (data.count <= 0) setBattleCountdown(null);
    };

    const handleBattleReadyState = (data: any) => {
      if (!mounted) return;
      setHostIsReady(!!data.hostReady);
      setOpponentIsReady(!!data.opponentReady);
    };

    const handleBattleEnded = (data: any) => {
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
        if (mounted) endBattleCleanup();
      }, 2000);
    };

    const handleHeartSent = (data: any) => {
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

    websocket.on('room_state', handleRoomState);
    websocket.on('user_joined', handleUserJoined);
    websocket.on('user_left', handleUserLeft);
    websocket.on('chat_message', handleChatMessage);
    websocket.on('gift_sent', handleGiftSent);
    websocket.on('heart_sent', handleHeartSent);
    websocket.on('battle_state_sync', handleBattleStateSync);
    websocket.on('battle_score', handleBattleScore);
    websocket.on('battle:score_update', handleBattleScoreUpdate);
    websocket.on('battle_countdown', handleBattleCountdown);
    websocket.on('battle_ended', handleBattleEnded);
    websocket.on('battle_ready_state', handleBattleReadyState);

    // Battle & Co-Host invite / request signalling over WebSocket
    const handleBattleInvite = (data: any) => {
      if (!user?.id) return;
      setPendingInvite({
        hostName: data.hostName || 'Creator',
        hostAvatar: data.hostAvatar || '',
        streamKey: data.streamKey || effectiveStreamId,
        hostUserId: data.hostUserId,
      });
    };

    const handleBattleInviteAccepted = (data: any) => {
      if (!isBroadcast) return;
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
        const emptyIdx = next.findIndex(s => s.status === 'empty');
        if (emptyIdx !== -1) {
          next[emptyIdx] = { userId: requesterId, name: requesterName, status: 'accepted', avatar: requesterAvatar || '' };
        }
        return next;
      });
      websocket.send('battle_create', {
        hostName: myCreatorName,
        opponentUserId: requesterId,
        opponentName: requesterName,
        opponentRoomId: oppStreamKey,
      });
    };

    const handleCohostRequest = (data: any) => {
      if (!isBroadcast) return;
      setPendingJoinRequest({
        requesterId: data.requesterUserId,
        requesterName: data.requesterName,
        requesterAvatar: data.requesterAvatar || '',
        type: 'cohost',
      });
    };

    const handleCohostRequestAccepted = (data: any) => {
      if (!user?.id) return;
      const hostName = data.hostName || 'Creator';
      showToast(`@${hostName} accepted your co-host request!`);
      /* Host already added this co-host in acceptJoinRequest; do not duplicate. This event is for spectator UX (toast/navigate). */
    };

    const handleCohostInvite = (data: any) => {
      if (!user?.id) return;
      setPendingCohostInvite({
        hostName: data.hostName || 'Creator',
        hostAvatar: data.hostAvatar || '',
        streamKey: data.streamKey || '',
        hostUserId: data.hostUserId || '',
      });
    };

    const handleCohostInviteAck = (data: any) => {
    };

    const handleCohostInviteAccepted = (data: any) => {
      if (!mounted) return;
      const cohostUserId = typeof data.cohostUserId === 'string' ? data.cohostUserId : '';
      if (!cohostUserId) return;
      setCoHosts((prev) =>
        prev.map((h) =>
          h.userId === cohostUserId ? { ...h, status: 'live' as const } : h
        )
      );
      showToast(`${data.cohostName || 'Co-host'} joined the live`);
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
      websocket.off('heart_sent', handleHeartSent);
      websocket.off('battle_state_sync', handleBattleStateSync);
      websocket.off('battle_score', handleBattleScore);
      websocket.off('battle:score_update', handleBattleScoreUpdate);
      websocket.off('battle_countdown', handleBattleCountdown);
      websocket.off('battle_ended', handleBattleEnded);
      websocket.off('battle_ready_state', handleBattleReadyState);
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
      websocket.disconnect();
    };
  }, [effectiveStreamId, user?.id, navigate, maybeResolveViewerIdentity, isGenericViewerName]);

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

  const [giftQueue, setGiftQueue] = useState<{ video: string }[]>([]);
  const [giftBanner, setGiftBanner] = useState<{ username: string; giftName: string; icon: string } | null>(null);
  const giftBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPlayingGift, setIsPlayingGift] = useState(false);
  const [lastSentGift, setLastSentGift] = useState<GiftUiItem | null>(null);
  const [userLevel, setUserLevel] = useState(1);


  const [userXP, setUserXP] = useState(0);
  const [comboCount, setComboCount] = useState(0);
  const [showComboButton, setShowComboButton] = useState(false);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeFaceARGift, setActiveFaceARGift] = useState<
    | { type: 'crown' | 'glasses' | 'mask' | 'ears' | 'hearts' | 'stars'; color?: string }
    | null
  >(null);

  const maybeTriggerFaceARGift = (gift: GiftUiItem) => {
    const mapping: Record<string, { type: 'crown' | 'glasses' | 'mask' | 'ears' | 'hearts' | 'stars'; color?: string } | undefined> = {
      face_ar_crown: { type: 'crown', color: '#FFD700' },
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

  const [giftKey, setGiftKey] = useState(0);
  useEffect(() => {
    if (!isPlayingGift && giftQueue.length > 0) {
      setCurrentGift(giftQueue[0]);
      setGiftKey(k => k + 1);
      setIsPlayingGift(true);
      setGiftQueue(prev => prev.slice(1));
    }
  }, [giftQueue, isPlayingGift]);

  const handleGiftEnded = () => {
    setCurrentGift(null);
    setIsPlayingGift(false);
  };

  const handleSendGift = async (gift: GiftUiItem) => {
    if (!gift) return;

    try {
      // Local/dev: always allow sending gifts, even if coinBalance is low,
      // so video gifts are never blocked from playing.
      if (gift.video && gift.video.trim()) {
        const raw = gift.video;
        const ext = raw.split('?')[0].toLowerCase();
        const isVid = ext.endsWith('.mp4') || ext.endsWith('.webm');
        if (isVid) {
          const videoUrl = (raw.startsWith('http://') || raw.startsWith('https://'))
            ? raw
            : resolveGiftAssetUrl(raw.startsWith('/') ? raw : `/${raw}`);
          if (videoUrl) setGiftQueue(prev => [...prev, { video: videoUrl }]);
        }
      }
      
      let newLevel = userLevel;
      
      if (user?.id) {
        try {
          const { data: result, error: giftErr } = await request('/api/gifts/send', {
            method: 'POST',
            body: JSON.stringify({ streamKey: effectiveStreamId, giftId: gift.id, channel: platform.name }),
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
          } else {
            if (result.new_balance != null) {
              const nb = Number(result.new_balance);
              setCoinBalance(nb);
              persistTestCoinsBalance(user?.id, nb);
            }
            if (result.new_level != null) {
              const updatedLevel = Number(result.new_level);
              setUserLevel(updatedLevel);
              updateUser({ level: updatedLevel });
              newLevel = updatedLevel;
            }
            if (result.new_xp != null) {
              setUserXP(Number(result.new_xp));
            }
          }
        } catch {
          showToast('Gift failed');
          return;
        }

        const xpGained = gift.coins;
        let currentXP = userXP + xpGained;
        let currentLevel = userLevel;
        for (let i = 0; i < 300 && currentXP >= currentLevel * 1000 && currentLevel < 300; i++) {
          currentXP -= currentLevel * 1000;
          currentLevel++;
        }
        setUserLevel(currentLevel);
        setUserXP(currentXP);
        updateUser({ level: currentLevel });
        newLevel = currentLevel;
      } else {
        setCoinBalance(prev => { const n = Math.max(0, prev - gift.coins); persistTestCoinsBalance(user?.id, n); return n; });
      }

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

      websocket.send('gift_sent', {
        giftId: gift.id,
        giftName: gift.name,
        coins: gift.coins,
        gift_icon: gift.icon || '🎁',
        quantity: 1,
        level: newLevel,
        avatar: giftMsg.avatar,
        video: gift.video || null,
        transactionId: `${user?.id || 'anon'}-${Date.now()}`,
        battleTarget: serverBattleTarget,
        creator_name: hostName || 'Creator',
        ...(!isBroadcast && { host_user_id: effectiveStreamId }),
      });
      

      // Handle Combo Logic
      setLastSentGift(gift);
      setComboCount(1);
      setShowComboButton(true);
      resetComboTimer();
    } catch (error) {
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
      }, 5000); // 5 seconds to combo
  };

  const handleComboClick = async () => {
      if (!lastSentGift) return;
      if (comboCount >= GIFT_COMBO_MAX) return;

      // Check balance
      if (coinBalance < lastSentGift.coins) {
        showToast("Not enough coins!");
        return;
      }

      let newLevel = userLevel;
      if (user?.id) {
        try {
          const { data: result, error: giftErr } = await request('/api/gifts/send', {
            method: 'POST',
            body: JSON.stringify({ streamKey: effectiveStreamId, giftId: lastSentGift.id, channel: platform.name }),
          });

          if (giftErr) {
            const msg = giftErr.message || '';
            if (msg.includes('insufficient_funds')) {
              showToast('Not enough coins');
              return;
            }
            showToast('Gift failed');
            return;
          } else {
            if (result.new_balance != null) {
              const nb = Number(result.new_balance);
              setCoinBalance(nb);
              persistTestCoinsBalance(user?.id, nb);
            }
            if (result.new_level != null) {
              newLevel = Number(result.new_level);
              setUserLevel(newLevel);
              updateUser({ level: newLevel });
            }
            if (result.new_xp != null) setUserXP(Number(result.new_xp));
          }
        } catch {
          showToast('Gift failed');
          return;
        }
      } else {
        setCoinBalance(prev => { const n = Math.max(0, prev - lastSentGift.coins); persistTestCoinsBalance(user?.id, n); return n; });
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
        if (videoUrl) setGiftQueue(prev => [...prev, { video: videoUrl }]);
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

      websocket.send('gift_sent', {
        giftId: lastSentGift.id,
        giftName: lastSentGift.name,
        coins: lastSentGift.coins,
        gift_icon: lastSentGift.icon || '🎁',
        quantity: 1,
        level: newLevel,
        avatar: giftMsg.avatar,
        video: lastSentGift.video || null,
        transactionId: `${user?.id || 'anon'}-${Date.now()}`,
        battleTarget: serverBattleTargetCombo,
        creator_name: hostName || 'Creator',
        ...(!isBroadcast && { host_user_id: effectiveStreamId }),
      });


      // Handle Combo Logic
      setComboCount((prev) => Math.min(prev + 1, GIFT_COMBO_MAX));
      resetComboTimer();
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

    // Battle (spectators): +5 to the creator they watch (URL matches battle participant), else by tap position on the grid.
    if (!isBroadcast && clientX !== undefined && clientY !== undefined && isBattleMode && battleTime > 0 && !battleWinner) {
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
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=121212&color=C9A96E`;
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
      showToast(wasFollowing ? 'Unfollowed' : 'Following');
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
    <div className="min-h-[100dvh] h-[100dvh] w-full flex justify-center bg-[#0A0B0E]">
      <div className="relative w-full max-w-[480px] h-full bg-[#13151A] overflow-hidden border-none">
        <div className="h-full w-full relative">
        <audio ref={roomRemoteAudioRef} autoPlay playsInline className="hidden" />
        <audio ref={opponentRemoteAudioRef} autoPlay playsInline className="hidden" />
        {/* BACKGROUND: VIDEO AREA (Unified frame) */}
        <div className="absolute inset-0 z-0 bg-[#13151A] overflow-hidden">
          <div className="video-zone relative w-full h-full">
            <div ref={stageRef} className="relative w-full h-full">
            {/* Base Video Layer */}
        {!isBattleMode && (() => {
          const hasAnyCoHost = coHosts.length > 0;
          return (
          <div
            className={hasAnyCoHost ? 'absolute inset-x-0 z-[25] flex flex-row' : 'relative w-full h-full'}
            style={hasAnyCoHost ? { top: '90px', height: 'calc(36dvh + 10mm)', filter: liveFilterCss !== 'none' ? liveFilterCss : undefined } : { filter: liveFilterCss !== 'none' ? liveFilterCss : undefined }}
            onPointerDown={isBroadcast ? undefined : (e) => {
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
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#13151A] z-[5]">
                    {(user?.avatar || myAvatar) ? (
                      <img src={user?.avatar || myAvatar || ''} alt="" className="w-16 h-16 rounded-full border-2 border-[#C9A96E]/40 object-cover object-center" />
                    ) : (
                      <div className="w-16 h-16 rounded-full border-2 border-[#C9A96E]/40 bg-[#1C1E24] flex items-center justify-center">
                        <span className="text-2xl font-black text-[#C9A96E]/60">{(creatorName || user?.username || 'Me').charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <span className="text-white font-bold text-xs">{creatorName || user?.username || user?.name || 'Me'}</span>
                  </div>
                )}
                {isBroadcast && hasAnyCoHost && (
                  <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 pointer-events-auto">
                    <button type="button" onClick={(e) => { e.stopPropagation(); toggleMic(); }} className="p-0.5 rounded bg-black/50" title={isMicMuted ? 'Unmute' : 'Mute'}>
                      {isMicMuted ? <MicOff className="w-3 h-3 text-white" strokeWidth={2.5} /> : <Mic className="w-3 h-3 text-white" strokeWidth={2.5} />}
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); toggleCam(); }} className="p-0.5 rounded" title={isCamOff ? 'Camera on' : 'Camera off'}>
                      {isCamOff ? <CameraOff className="w-3 h-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" strokeWidth={2.5} /> : <Camera className="w-3 h-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" strokeWidth={2.5} />}
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
                  <div className="w-full h-full bg-[#13151A] flex flex-col items-center justify-center relative">
                    {myAvatar ? (
                      <img src={myAvatar} alt="" className="w-28 h-28 rounded-full object-cover object-center border-2 border-[#C9A96E]/40 mb-4 opacity-80" />
                    ) : (
                      <div className="w-28 h-28 rounded-full bg-[#1C1E24] border-2 border-[#C9A96E]/30 flex items-center justify-center mb-4">
                        <span className="text-4xl font-black text-[#C9A96E]/60">{creatorName.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <p className="text-white font-bold text-lg">{creatorName}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-white/50 text-xs font-semibold">LIVE</span>
                    </div>
                    <div className="absolute inset-0 pointer-events-none" style={{background: 'radial-gradient(circle at center 40%, rgba(201,169,110,0.06) 0%, transparent 60%)'}} />
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
                  color={activeFaceARGift.color || '#C9A96E'}
                />
              </>
            )}

            {isBroadcast && cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#13151A] text-white font-bold">
                {cameraError}
              </div>
            )}
            </div>

            {/* Right: co-host 8-slot grid */}
            {hasAnyCoHost && (() => {
              const list = isBroadcast ? coHosts.filter(h => h.userId !== user?.id) : coHosts;
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
                  return (
                    <>
                      <video
                        ref={(el) => { if (el) coHostVideoRefs.current.set(host.userId, el); else coHostVideoRefs.current.delete(host.userId); }}
                        className="absolute inset-0 w-full h-full object-cover rounded-sm"
                        autoPlay playsInline muted={host.isMuted}
                        style={coHostCameraOff[host.id] ? { display: 'none' } : undefined}
                      />
                      {coHostCameraOff[host.id] && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#13151A] z-[6] rounded-sm">
                          {host.avatar ? <img src={host.avatar} alt="" className="w-10 h-10 rounded-full border-2 border-[#C9A96E]/40 object-cover object-center" /> : (
                            <div className="w-10 h-10 rounded-full border-2 border-[#C9A96E]/40 bg-[#1C1E24] flex items-center justify-center"><span className="text-[#C9A96E]/60 text-sm font-bold">{(host.name || '?').charAt(0)}</span></div>
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
                    </>
                  );
                }
                if (slot.type === 'invited' && slot.host) return (
                  <>
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#C9A96E]/40 bg-[#1C1E24]">
                      {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover opacity-60" /> : <div className="w-full h-full flex items-center justify-center text-[#C9A96E]/60 text-base font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                    </div>
                    <p className="text-white/60 text-[9px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                    <span className="text-[#C9A96E]/70 text-[8px] font-semibold">Invited</span>
                  </>
                );
                if (slot.type === 'pending' && slot.host) return (
                  <>
                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#C9A96E] bg-[#1C1E24]">
                      {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[#C9A96E] text-sm font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                    </div>
                    <p className="text-white text-[8px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                    <span className="text-[#C9A96E]/70 text-[8px] font-semibold">Pending</span>
                  </>
                );
                return (
                  <button type="button" onClick={() => setShowViewerList(true)} className="flex flex-col items-center justify-center w-full h-full active:scale-95">
                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                      <span className="text-white/30 text-2xl font-light">+</span>
                    </div>
                    <p className="text-white/30 text-[9px] font-semibold mt-0.5">Invite</p>
                  </button>
                );
              };

              return (
                <div className="w-1/2 h-full grid grid-cols-2 grid-rows-4 gap-[1px] bg-[#1a1c22]">
                  {smallSlots.slice(0, 8).map((slot, i) => (
                    <div key={i} className="relative bg-[#13151A] flex flex-col items-center justify-center p-1">
                      {renderCoHostCell(slot)}
                    </div>
                  ))}
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
            {/* Battle timer — overlay on top of screen/video */}
            <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none flex justify-center max-w-[480px] mx-auto py-1.5 px-2 bg-gradient-to-b from-black/50 to-transparent" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4cm - 7.5mm)' }}>
              <div className="flex items-center gap-1 bg-black/40 backdrop-blur-md rounded-full px-2 py-0.5 border border-white/10 shadow-sm">
                <div className="relative w-[16px] h-[16px] flex items-center justify-center">
                  <svg viewBox="0 0 40 44" className="absolute inset-0 w-full h-full drop-shadow-md">
                    <path d="M20 2 L36 10 L36 26 Q36 38 20 42 Q4 38 4 26 L4 10 Z" fill="url(#vsGrad2)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
                    <defs><linearGradient id="vsGrad2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#DC143C"/><stop offset="50%" stopColor="#8B0000"/><stop offset="100%" stopColor="#1E90FF"/></linearGradient></defs>
                  </svg>
                  <span className="relative z-10 text-white text-[5px] font-black italic drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">VS</span>
                </div>
                <span className="text-white text-[10px] font-black tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{formatTime(battleTime)}</span>
              </div>
            </div>
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
                <div className="flex flex-col items-center gap-1 px-6 py-3 rounded-xl bg-[#13151A]/70 backdrop-blur-md border border-white/15 shadow-[0_0_20px_rgba(0,0,0,0.6)]">
                  <span className="text-white text-[10px] font-bold uppercase tracking-widest">⚡ Speed Challenge Result</span>
                  <span className="text-white text-lg font-black drop-shadow-[0_0_15px_rgba(230,179,106,0.8)] animate-bounce">{speedChallengeResult}</span>
                </div>
              </div>
            )}

            {/* Dynamic Battle Grid: 2-split or 4-split based on players */}
            {(() => {
              const is4Player = battleSlots[1].status !== 'empty' || battleSlots[2].status !== 'empty';
              return (
                <div className={`relative w-full flex-none flex flex-col ${is4Player ? 'aspect-square' : 'h-[44dvh]'}`}>

                  {/* Battle score: totals inside PK bar only (no name strip above) */}
                  <div className="relative z-20 w-full flex-none bg-[#13151A]/95 border-b border-white/10">
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
                        <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-0">
                          <AnimatedScore value={typeof redTeamScore === 'number' && Number.isFinite(redTeamScore) ? redTeamScore : 0} durationMs={0} format={formatCoinsShort} className="text-white font-black text-[11px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" />
                          {is4Player && (
                            <span className="text-[5px] text-white/80 tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                              P1 {battleServerTotals.h} + P3 {battleServerTotals.p3}
                            </span>
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col items-end justify-center gap-0">
                          <AnimatedScore value={typeof blueTeamScore === 'number' && Number.isFinite(blueTeamScore) ? blueTeamScore : 0} durationMs={0} format={formatCoinsShort} className="text-white font-black text-[11px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" />
                          {is4Player && (
                            <span className="text-[5px] text-white/80 tabular-nums leading-none text-right drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                              P2 {battleServerTotals.o} + P4 {battleServerTotals.p4}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Spectator Tap Indicator: 1 tap = 5 pts, then done */}
                  {!isBroadcast && battleTime > 0 && !battleWinner && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#13151A]/70 backdrop-blur-md border border-[#C9A96E]/30">
                        <span className="text-[9px] font-bold text-white">
                          Tap to vote +5
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Grid Container — ref for spectator tap→vote mapping */}
                  <div ref={battleVoteGridRef} className="flex-1 min-h-0 flex flex-col">
                    {/* Row 1: P1 & P2 */}
                    <div className="flex flex-1 min-h-0">
                      <div
                        className={`w-1/2 h-full overflow-hidden relative bg-[#13151A] pointer-events-auto border-r border-white/5 ${is4Player ? 'border-b' : ''}`}
                      >
                      <video ref={videoRef} className="w-full h-full object-cover transform scale-x-[-1]" autoPlay playsInline muted style={isCamOff ? { opacity: 0 } : undefined} />
                      {isCamOff && (
                        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-1 bg-[#13151A]">
                          {(user?.avatar || myAvatar) ? (
                            <img src={user?.avatar || myAvatar || ''} alt="" className="w-12 h-12 rounded-full border-2 border-[#C9A96E]/40 object-cover object-center" />
                          ) : (
                            <div className="w-12 h-12 rounded-full border-2 border-[#C9A96E]/40 bg-[#1C1E24] flex items-center justify-center">
                              <span className="text-lg font-black text-[#C9A96E]/60">{(creatorName || user?.username || 'Me').charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <span className="text-white font-bold text-[10px] truncate max-w-full px-1">{creatorName || user?.username || user?.name || 'Me'}</span>
                        </div>
                      )}
                      {/* P1 mic + gold power (public icon) — no background chips */}
                      <div className="absolute bottom-4 right-2 z-10 pointer-events-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); togglePlayerMute('me'); }}
                          title={mutedPlayers['me'] ? 'Unmute' : 'Mute'}
                          className="flex items-center justify-center border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                        >
                          {mutedPlayers['me']
                            ? <MicOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />
                            : <Mic className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                        </button>
                        <button
                          type="button"
                          className="flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                          onClick={(e) => { e.stopPropagation(); toggleBattle(); }}
                          title="End Battle"
                        >
                          <img src="/Icons/Gold power buton.png" alt="" className="h-3 w-3 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]" />
                        </button>
                      </div>


                      {battleWinner && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${battleWinner === 'me' ? 'text-white' : battleWinner === 'draw' ? 'text-white' : 'text-red-400'}`}>
                            {battleWinner === 'me' ? 'WIN' : battleWinner === 'draw' ? 'DRAW' : 'LOSS'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div
                      className={`w-1/2 h-full overflow-hidden relative bg-[#13151A] pointer-events-auto ${is4Player ? 'border-b border-white/5' : ''}`}
                    >
                      {battleSlots[0].status === 'accepted' ? (
                        <div className="w-full h-full relative bg-[#13151A]">
                          <video ref={opponentVideoRef} className="w-full h-full object-cover absolute inset-0 z-10" autoPlay playsInline muted={!!mutedPlayers['opponent']} style={{ left: '3px', top: '-3px', ...(cameraOffPlayers['opponent'] ? { display: 'none' } : {}) }} />
                          {cameraOffPlayers['opponent'] && (
                            <div className="absolute inset-0 z-[11] flex flex-col items-center justify-center gap-2 bg-[#13151A]">
                              {battleSlots[0].avatar ? (
                                <img src={battleSlots[0].avatar} alt="" className="w-16 h-16 rounded-full border-2 border-[#C9A96E]/40 object-cover object-center" />
                              ) : (
                                <div className="w-16 h-16 rounded-full border-2 border-[#C9A96E]/40 bg-[#1C1E24] flex items-center justify-center">
                                  <span className="text-2xl font-black text-[#C9A96E]/60">{(battleSlots[0].name || 'P').charAt(0).toUpperCase()}</span>
                                </div>
                              )}
                              <span className="text-white font-bold text-xs">{battleSlots[0].name}</span>
                            </div>
                          )}
                          {!hasOpponentStream && !cameraOffPlayers['opponent'] && (
                            <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 bg-[#13151A]">
                              {battleSlots[0].avatar ? (
                                <img src={battleSlots[0].avatar} alt={battleSlots[0].name} className="w-16 h-16 rounded-full border-2 border-[#C9A96E] object-cover object-center" />
                              ) : (
                                <div className="w-16 h-16 rounded-full border-2 border-[#C9A96E] bg-[#1C1E24] flex items-center justify-center">
                                  <span className="text-2xl font-black text-[#C9A96E]">{(battleSlots[0].name || 'P').charAt(0).toUpperCase()}</span>
                                </div>
                              )}
                              <span className="text-white text-xs font-bold">{battleSlots[0].name}</span>
                              <div className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-green-400 text-[10px] font-bold">Connecting...</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : battleSlots[0].status === 'invited' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#13151A]">
                          <img src={battleSlots[0].avatar} alt={battleSlots[0].name} className="w-12 h-12 rounded-full border-2 border-[#C9A96E] object-cover object-center opacity-60" />
                          <div className="w-5 h-5 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
                          <span className="text-white text-[10px] font-bold">Waiting...</span>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#13151A]/80 pointer-events-auto" onClick={(e) => { e.stopPropagation(); setIsFindCreatorsOpen(true); }}>
                          <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                            <span className="text-white/30 text-2xl">+</span>
                          </div>
                          <span className="text-white/40 text-[10px] font-bold">Invite P2</span>
                        </div>
                      )}

                      {battleSlots[0].status !== 'empty' && (
                        <div className="absolute bottom-4 left-2 z-10 pointer-events-auto flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); togglePlayerMute('opponent'); }}
                            title={mutedPlayers['opponent'] ? 'Unmute opponent' : 'Mute opponent'}
                            className="flex items-center justify-center border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                          >
                            {mutedPlayers['opponent']
                              ? <MicOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />
                              : <Mic className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removePlayerFromSlot(0); }}
                            title="Remove opponent"
                            className="flex items-center justify-center border-0 bg-transparent p-0 hover:opacity-90 active:scale-95"
                          >
                            <img src="/Icons/Gold power buton.png" alt="" className="h-3 w-3 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]" />
                          </button>
                        </div>
                      )}

                      <div 
                        className="absolute bottom-1 right-1 flex items-center cursor-pointer hover:scale-105 transition-transform active:scale-95 pointer-events-auto"
                        onClick={(e) => { e.stopPropagation(); openMiniProfile(battleSlots[0].name); }}
                      >
                        {lastGifts.opponent && (
                          <div className="w-5 h-5 rounded-full bg-[#13151A] border border-[#C9A96E]/40 overflow-hidden flex items-center justify-center drop-shadow-md z-10 relative">
                            <img src={lastGifts.opponent} alt="gift" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div 
                          className={`h-4 flex items-center rounded-full text-[8px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] relative z-0 bg-[#13151A]/40 backdrop-blur-md border border-white/10 ${lastGifts.opponent ? '-ml-2 pl-3 pr-1.5' : 'px-1.5'}`}
                        >
                          {battleSlots[0].status !== 'empty' ? battleSlots[0].name : 'P2'}
                        </div>
                      </div>

                      {battleWinner && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${battleWinner === 'opponent' ? 'text-white' : battleWinner === 'draw' ? 'text-white' : 'text-red-400'}`}>
                            {battleWinner === 'opponent' ? 'WIN' : battleWinner === 'draw' ? 'DRAW' : 'LOSS'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 2: P3 & P4 — only when 4 players, same container */}
                  {is4Player && (
                    <div className="flex flex-1 min-h-0">
                      <div
                        className="w-1/2 h-full overflow-hidden relative bg-[#13151A] pointer-events-auto border-r border-white/5"
                      >
                        {battleSlots[1].status === 'accepted' ? (
                          <div className="w-full h-full relative bg-[#13151A]">
                            <video ref={player3VideoRef} className="w-full h-full object-cover" autoPlay playsInline muted={!!mutedPlayers['player3']} style={player3VideoRef.current?.srcObject && !cameraOffPlayers['player3'] ? {} : { display: 'none' }} />
                            {cameraOffPlayers['player3'] && (
                              <div className="absolute inset-0 z-[11] flex flex-col items-center justify-center gap-1 bg-[#13151A]">
                                {battleSlots[1].avatar ? (
                                  <img src={battleSlots[1].avatar} alt="" className="w-12 h-12 rounded-full border-2 border-[#C9A96E]/40 object-cover object-center" />
                                ) : (
                                  <div className="w-12 h-12 rounded-full border-2 border-[#C9A96E]/40 bg-[#1C1E24] flex items-center justify-center">
                                    <span className="text-lg font-black text-[#C9A96E]/60">{(battleSlots[1].name || '?').charAt(0).toUpperCase()}</span>
                                  </div>
                                )}
                                <span className="text-white font-bold text-[10px] truncate max-w-full px-1">{battleSlots[1].name}</span>
                              </div>
                            )}
                            {!player3VideoRef.current?.srcObject && !cameraOffPlayers['player3'] && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <img src={battleSlots[1].avatar} alt={battleSlots[1].name} className="w-12 h-12 rounded-full border-2 border-[#C9A96E] object-cover object-center" />
                                <span className="text-white text-[10px] font-bold">{battleSlots[1].name}</span>
                                <div className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                  <span className="text-green-400 text-[9px] font-bold">JOINED</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : battleSlots[1].status === 'invited' ? (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#13151A]">
                            <img src={battleSlots[1].avatar} alt={battleSlots[1].name} className="w-12 h-12 rounded-full border-2 border-[#C9A96E] object-cover object-center opacity-60" />
                            <div className="w-5 h-5 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
                            <span className="text-white text-[10px] font-bold">Waiting...</span>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#13151A]/80 pointer-events-auto" onClick={(e) => { e.stopPropagation(); setIsFindCreatorsOpen(true); }}>
                            <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                              <span className="text-white/30 text-2xl">+</span>
                            </div>
                            <span className="text-white/40 text-[10px] font-bold">Invite P3</span>
                          </div>
                        )}

                        {battleSlots[1].status !== 'empty' && (
                          <div className="absolute top-1 right-1 z-10 pointer-events-auto flex items-center gap-1">
                            <button type="button" className="border-0 bg-transparent p-0 hover:opacity-90 active:scale-95" onClick={(e) => { e.stopPropagation(); togglePlayerMute('player3'); }} title={mutedPlayers['player3'] ? 'Unmute' : 'Mute'}>
                              {mutedPlayers['player3'] ? <MicOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} /> : <Mic className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                            </button>
                            <button type="button" className="border-0 bg-transparent p-0 hover:opacity-90 active:scale-95" onClick={(e) => { e.stopPropagation(); removePlayerFromSlot(1); }} title="Remove player">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF4D6A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                            </button>
                        </div>
                      )}

                      <div 
                        className="absolute bottom-1 left-1 flex items-center cursor-pointer hover:scale-105 transition-transform active:scale-95 pointer-events-auto"
                        onClick={(e) => { e.stopPropagation(); openMiniProfile(battleSlots[1].name); }}
                      >
                        {lastGifts.player3 && (
                          <div className="w-5 h-5 rounded-full bg-[#13151A] border border-[#C9A96E]/40 overflow-hidden flex items-center justify-center drop-shadow-md z-10 relative">
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
                            <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${battleWinner === 'me' ? 'text-white' : battleWinner === 'draw' ? 'text-white' : 'text-red-400'}`}>
                              {battleWinner === 'me' ? 'WIN' : battleWinner === 'draw' ? 'DRAW' : 'LOSS'}
                            </span>
                          </div>
                        )}
                      </div>
                      <div
                        className="w-1/2 h-full overflow-hidden relative bg-[#13151A] pointer-events-auto"
                      >
                        {battleSlots[2].status === 'accepted' ? (
                          <div className="w-full h-full relative bg-[#13151A]">
                            <video ref={player4VideoRef} className="w-full h-full object-cover" autoPlay playsInline muted={!!mutedPlayers['player4']} style={player4VideoRef.current?.srcObject && !cameraOffPlayers['player4'] ? {} : { display: 'none' }} />
                            {cameraOffPlayers['player4'] && (
                              <div className="absolute inset-0 z-[11] flex flex-col items-center justify-center gap-1 bg-[#13151A]">
                                {battleSlots[2].avatar ? (
                                  <img src={battleSlots[2].avatar} alt="" className="w-12 h-12 rounded-full border-2 border-[#C9A96E]/40 object-cover object-center" />
                                ) : (
                                  <div className="w-12 h-12 rounded-full border-2 border-[#C9A96E]/40 bg-[#1C1E24] flex items-center justify-center">
                                    <span className="text-lg font-black text-[#C9A96E]/60">{(battleSlots[2].name || '?').charAt(0).toUpperCase()}</span>
                                  </div>
                                )}
                                <span className="text-white font-bold text-[10px] truncate max-w-full px-1">{battleSlots[2].name}</span>
                              </div>
                            )}
                            {!player4VideoRef.current?.srcObject && !cameraOffPlayers['player4'] && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <img src={battleSlots[2].avatar} alt={battleSlots[2].name} className="w-12 h-12 rounded-full border-2 border-[#C9A96E] object-cover object-center" />
                                <span className="text-white text-[10px] font-bold">{battleSlots[2].name}</span>
                                <div className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                  <span className="text-green-400 text-[9px] font-bold">JOINED</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : battleSlots[2].status === 'invited' ? (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#13151A]">
                            <img src={battleSlots[2].avatar} alt={battleSlots[2].name} className="w-12 h-12 rounded-full border-2 border-[#C9A96E] object-cover object-center opacity-60" />
                            <div className="w-5 h-5 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
                            <span className="text-white text-[10px] font-bold">Waiting...</span>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#13151A]/80 pointer-events-auto" onClick={(e) => { e.stopPropagation(); setIsFindCreatorsOpen(true); }}>
                            <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                              <span className="text-white/30 text-2xl">+</span>
                            </div>
                            <span className="text-white/40 text-[10px] font-bold">Invite P4</span>
                          </div>
                        )}

                        {battleSlots[2].status !== 'empty' && (
                          <div className="absolute top-1 right-1 z-10 pointer-events-auto flex items-center gap-1">
                            <button type="button" className="border-0 bg-transparent p-0 hover:opacity-90 active:scale-95" onClick={(e) => { e.stopPropagation(); togglePlayerMute('player4'); }} title={mutedPlayers['player4'] ? 'Unmute' : 'Mute'}>
                              {mutedPlayers['player4'] ? <MicOff className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} /> : <Mic className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" strokeWidth={2.2} />}
                            </button>
                            <button type="button" className="border-0 bg-transparent p-0 hover:opacity-90 active:scale-95" onClick={(e) => { e.stopPropagation(); removePlayerFromSlot(2); }} title="Remove player">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF4D6A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                            </button>
                        </div>
                      )}

                      <div 
                        className="absolute bottom-1 right-1 flex items-center cursor-pointer hover:scale-105 transition-transform active:scale-95 pointer-events-auto"
                        style={{ right: '2.5rem' }}
                        onClick={(e) => { e.stopPropagation(); openMiniProfile(battleSlots[2].name); }}
                      >
                        {lastGifts.player4 && (
                          <div className="w-5 h-5 rounded-full bg-[#13151A] border border-[#C9A96E]/40 overflow-hidden flex items-center justify-center drop-shadow-md z-10 relative">
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
                            <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${battleWinner === 'opponent' ? 'text-white' : battleWinner === 'draw' ? 'text-white' : 'text-red-400'}`}>
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
              <div className="flex items-center gap-[0mm] min-w-0 flex-1 justify-start pointer-events-auto" style={{ transform: 'translateX(-3mm)' }} onClick={() => setShowViewerList(true)}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={`mvp-l-${i}`}
                    className="relative flex flex-col items-center"
                    style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '-2mm' }}
                  >
                    <GoldProfileFrame size={LIVE_MVP_PROFILE_RING_PX}>
                      {topMvpHostBattle[i] ? (
                        <img src={resolveCircleAvatar(topMvpHostBattle[i].avatar, topMvpHostBattle[i].displayName || topMvpHostBattle[i].username)} alt="" className="h-full w-full rounded-full object-cover object-center" />
                      ) : (
                        <Plus className="text-[#C9A96E]" size={12} strokeWidth={2.5} />
                      )}
                    </GoldProfileFrame>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-[0mm] min-w-0 flex-1 justify-end pointer-events-auto" style={{ transform: 'translateX(3mm)' }} onClick={() => setShowViewerList(true)}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={`mvp-r-${i}`}
                    className="relative flex flex-col items-center"
                    style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '-2mm' }}
                  >
                    <GoldProfileFrame size={LIVE_MVP_PROFILE_RING_PX}>
                      {topMvpOpponentBattle[i] ? (
                        <img src={resolveCircleAvatar(topMvpOpponentBattle[i].avatar, topMvpOpponentBattle[i].displayName || topMvpOpponentBattle[i].username)} alt="" className="h-full w-full rounded-full object-cover object-center" />
                      ) : (
                        <Plus className="text-[#C9A96E]" size={12} strokeWidth={2.5} />
                      )}
                    </GoldProfileFrame>
                  </div>
                ))}
              </div>
            </div>

            {SPEED_CHALLENGE_ENABLED && speedChallengeActive && (
              <div className="w-full px-3 py-2 flex items-center justify-center flex-none pointer-events-none mt-1 relative z-30" style={{ transform: 'translateY(-19mm)' }}>
                <div className="flex items-center gap-3 px-5 py-1 rounded-full bg-[#B91C1C]/90 backdrop-blur-md border border-red-900/70 shadow-[0_0_15px_rgba(185,28,28,0.45)] animate-luxury-fade-in">
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
                  <div className="px-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2px)' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="pointer-events-auto flex flex-col gap-2">
                        {/* BROADCASTER INFO */}
                        <div className="px-0 py-1 animate-luxury-fade-in -ml-2 relative" style={{ transform: 'translateY(-2mm)' }}>
                          <div className="flex items-center relative">
                            <div 
                              className="relative z-10 flex-shrink-0 pointer-events-auto cursor-pointer active:scale-95 transition-transform"
                              onClick={(e) => { e.stopPropagation(); openMiniProfile(myCreatorName); }}
                            >
                              <AvatarRing src={myAvatar} alt={myCreatorName} size={LIVE_TOP_AVATAR_RING_PX} />
                            </div>
                            <div className={CREATOR_NAME_PILL_CLASSNAME} style={getCreatorNamePillStyle()}>
                              <span className="text-white text-[11px] font-bold truncate max-w-[100px] leading-tight">{myCreatorName}</span>
                              <button
                  type="button"
                  className="flex items-center gap-0.5 pointer-events-auto -mt-0.5"
                  onPointerDown={(e) => {
                    handleLikeTap(e);
                  }}
                >
                                <Heart className="w-2 h-2 text-[#FF2D55]" strokeWidth={2.5} fill="#FF2D55" />
                                <span className="text-white/70 text-[8px] font-bold tabular-nums">{(typeof activeLikes === 'number' && Number.isFinite(activeLikes) ? activeLikes : 0).toLocaleString()}</span>
                              </button>
                              
                              {(() => {
                                const redCount = 0;
                                const greyCount = 0;
                                return (
                                  <div className="absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center pointer-events-auto">
                                    {/* Membership / Join Button (Bottom) */}
                                    <button
                                      type="button"
                                      className={`col-start-1 row-start-1 flex items-center justify-center gap-1 ${hasJoinedToday ? 'bg-[#FF4500] border-[#FF4500]' : 'bg-[#13151A] border-[#C9A96E]/40'} rounded-full px-1.5 py-0.5 shadow-sm border w-[58px] h-7 z-0 transition-colors duration-200`}
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
                                          
                                          // Send animated heart to chat
                                          const newMessage: LiveMessage = {
                                            id: Date.now().toString(),
                                            username: 'You',
                                            text: '❤️ Joined the team!',
                                            level: userLevel,
                                            isGift: false,
                                            avatar: '/Icons/elix-logo.png',
                                            isSystem: true,
                                            membershipIcon: '/icons/Membership.png'
                                          };
                                          setMessages(prev => [...prev, newMessage]);
                                          spawnHeartFromClient(e.clientX, e.clientY, undefined, 'You', '/Icons/elix-logo.png');

                                        } else if (hasJoinedToday) {
                                          setShowTeamStatus(true);
                                        }
                                      }}
                                    >
                                      <div className="relative">
                                        <Heart
                                          className={`w-3.5 h-3.5 ${hasJoinedToday ? 'text-white fill-white' : 'text-[#C9A96E] fill-[#C9A96E]'}`}
                                          strokeWidth={2.5}
                                        />
                                        {!hasJoinedToday && (
                                          <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#C9A96E] rounded-full flex items-center justify-center border border-white">
                                            <span className="text-white text-[6px] font-bold leading-none">+</span>
                                          </div>
                                        )}
                                      </div>
                                      <span className={`${hasJoinedToday ? 'text-white' : 'text-[#C9A96E]'} text-[10px] font-bold`}>Join</span>
                                    </button>

                                    {/* Follow Button (Top) — viewers only; calls POST /api/profiles/:id/follow */}
                                    {!isBroadcast && !isFollowing && (
                                      <button
                                        type="button"
                                        className="col-start-1 row-start-1 z-20 relative flex items-center justify-center gap-1 bg-[#FF2D55] rounded-full px-1.5 py-0.5 shadow-sm border border-white/20 w-[58px] h-7"
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
                          <div className="flex items-center gap-2 mt-0.5 ml-9 pointer-events-auto relative z-20 flex-wrap" style={{ transform: 'translateY(-2mm)' }}>
                            <div 
                              className="flex items-center gap-1 bg-[#13151A] rounded-full px-2 py-0.5 border border-[#C9A96E]/40 shadow-sm cursor-pointer" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowRankingPanel(true);
                              }}
                            >
                              <Trophy className="w-2.5 h-2.5 text-[#C9A96E]" />
                              <span className="text-[#C9A96E] text-[9px] font-bold whitespace-nowrap">Weekly Ranking &gt;</span>
                            </div>
                            <div 
                              className="flex items-center gap-1 bg-[#13151A] rounded-full px-2 py-0.5 border border-[#C9A96E]/40 shadow-sm cursor-pointer" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowFanClub(true);
                              }}
                            >
                              <img src="/icons/Membership.png" alt="Membership" className="w-3.5 h-3.5 object-contain" onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }} />
                              <Heart className="w-2.5 h-2.5 text-[#C9A96E] fill-[#C9A96E] hidden" />
                              <span className="text-[#C9A96E] text-[9px] font-bold whitespace-nowrap">Membership</span>
                            </div>
                            {currentUniverse && (
                              <div className="flex items-center gap-1 bg-[#13151A] rounded-full px-2 py-0.5 border border-[#C9A96E]/40 shadow-sm">
                                <span className="text-[#C9A96E] text-[9px] font-bold whitespace-nowrap truncate max-w-[140px]">✨ {universeText} ✨</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pointer-events-auto flex items-center gap-[0mm] mt-1">
                        <div className="flex items-center gap-[0mm] pointer-events-auto flex-shrink-0" onClick={() => setShowViewerList(prev => !prev)}>
                          {[0, 1, 2].map((i) => (
                            <div
                              key={`top-viewers-${i}`}
                              style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '-2mm' }}
                              className="relative"
                            >
                              <GoldProfileFrame size={LIVE_MVP_PROFILE_RING_PX}>
                                {topMvpViewers[i] ? (
                                  <img
                                    src={resolveCircleAvatar(topMvpViewers[i].avatar, topMvpViewers[i].displayName || topMvpViewers[i].username)}
                                    alt=""
                                    className="h-full w-full rounded-full object-cover object-center"
                                    style={{ transform: 'translateY(0.5mm)' }}
                                  />
                                ) : (
                                  <Plus className="text-[#C9A96E]" size={16} strokeWidth={2.5} />
                                )}
                              </GoldProfileFrame>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          title="Viewers"
                          onClick={() => setShowViewerList(prev => !prev)}
                          className="flex items-center gap-1.5 px-0 py-1 rounded-full bg-transparent border-0 active:scale-95 transition-transform pointer-events-auto"
                        >
                          <span className="text-white text-[9px] font-bold tabular-nums">{formatCountShort(viewerCount)}</span>
                          <UserPlus size={16} className="text-[#C9A96E]" strokeWidth={2.2} />
                        </button>
                        <button type="button" onClick={() => { if (!isBroadcast) { navigate('/feed', { replace: true }); } else if (isBattleMode) { toggleBattle(); } else { stopBroadcast(); } }} className="w-7 h-7 rounded-full flex items-center justify-center active:scale-95 transition-transform" title={isBroadcast ? (isBattleMode ? 'End battle' : 'End broadcast') : 'Leave'}>
                          <img src="/Icons/Gold power buton.png" alt="Close" className="w-5 h-5 object-contain" />
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
            <div className="chat-zone fixed left-0 right-0 bottom-[calc(52px+max(8px,env(safe-area-inset-bottom)))] z-[20] flex justify-center pointer-events-none">
              <div
                className="w-full max-w-[480px] relative"
                style={{ height: 'calc(25dvh + 2cm + 4mm)', maxHeight: 'calc(25dvh + 2cm + 4mm)' }}
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
                      isModerator={isBroadcast || moderators.has(user?.id || '')}
                      onLike={() => handleLikeTap()}
                      onHeartSpawn={(cx, cy) => handleLikeTap()}
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

      {/* BOTTOM RIGHT: Action buttons (same area as before, aligned right) */}
      <div className="bottom-zone flex-none pointer-events-auto bg-transparent px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-0 min-h-[44px] flex flex-col items-end fixed left-0 right-0 bottom-0 z-[120] justify-end">
        <div className="w-full max-w-[480px] mx-auto flex flex-col items-end gap-0">
        {/* Combo Button - on top of 3 dots, 1cm up */}
        <AnimatePresence>
          {showComboButton && lastSentGift && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="flex flex-col items-center pointer-events-auto mb-[1cm] ml-[2mm]"
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleComboClick(); }}
                disabled={comboCount >= GIFT_COMBO_MAX}
                className="w-16 h-14 rounded-full bg-gradient-to-r from-secondary to-[#C9A96E] flex flex-col items-center justify-center animate-pulse active:scale-90 transition-transform shadow-[0_0_20px_rgba(201,169,110,0.5)] border-2 border-white/30 disabled:opacity-50 disabled:animate-none"
              >
                <span className={`font-black italic text-white drop-shadow-md ${comboCount >= 1000 ? 'text-sm' : 'text-xl'}`}>
                  x{comboCount >= 1000 ? `${(comboCount / 1000).toFixed(comboCount % 1000 === 0 ? 0 : 1)}K` : comboCount}
                </span>
                <span className="text-[9px] font-bold text-white uppercase tracking-widest">Combo</span>
              </button>
              <div className="mt-1 px-3 py-1 text-[10px] text-secondary font-bold bg-[#13151A]/60 rounded-full backdrop-blur-md border border-white/10 shadow-lg">
                Send {lastSentGift.name}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex flex-col items-end">
          {/* Spectator bar only: chat, Co-Host, Gift, Share, More. Shown only when watching (not broadcasting). */}
          {!isBroadcast && !currentGift && (
            <div className="flex items-end gap-2 w-full max-w-[480px] pointer-events-auto">
              <form className="flex-1 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full px-3 py-2 border border-white/10 h-10 min-w-0" onSubmit={(e) => { e.preventDefault(); handleSendMessage(e); }}>
                <input type="text" inputMode="text" enterKeyHint="send" autoComplete="off" placeholder="Say something..." className="bg-transparent text-white text-xs outline-none flex-1 placeholder:text-white/30 min-w-0" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
                {inputValue.trim() && <button type="submit" title="Send message" className="text-[#C9A96E] flex-shrink-0"><Send size={16} /></button>}
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
                  showToast('Co-host request sent!');
                }}
                className="w-10 h-10 rounded-full bg-[#13151A] backdrop-blur-md border border-[#C9A96E]/40 flex items-center justify-center shadow-lg relative disabled:opacity-60 active:scale-95 transition-transform flex-shrink-0"
              >
                <span className="flex items-center justify-center w-full h-full relative z-[2]"><UserPlus size={20} className="text-[#C9A96E] shrink-0" strokeWidth={2} /></span>
                <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
              </button>
              <button type="button" title="Send gift" onClick={() => setShowGiftPanel(true)} className="w-10 h-10 rounded-full bg-[#13151A] backdrop-blur-md border border-[#C9A96E]/40 flex items-center justify-center shadow-lg active:scale-95 transition-transform relative flex-shrink-0">
                <Gift size={20} className="text-[#C9A96E] relative z-[2]" />
                <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
              </button>
              <button type="button" title="Share" onClick={() => setShowSharePanel(true)} className="w-10 h-10 rounded-full bg-[#13151A] backdrop-blur-md border border-[#C9A96E]/40 flex items-center justify-center shadow-lg active:scale-95 transition-transform relative flex-shrink-0">
                <Share2 size={20} className="text-[#C9A96E] relative z-[2]" />
                <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
              </button>
              <button type="button" title="More options" onClick={() => setIsMoreMenuOpen(true)} className="w-10 h-10 rounded-full bg-[#13151A] backdrop-blur-md border border-[#C9A96E]/40 flex items-center justify-center shadow-lg active:scale-95 transition-transform relative flex-shrink-0">
                <MoreVertical size={20} className="text-[#C9A96E] relative z-[2]" />
                <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
              </button>
            </div>
          )}

          {/* Creator-only bottom bar (Co-Host, Battle, Share, More). No chat, no Gift — creator speaks. Shown only when broadcasting. */}
          {isBroadcast && !currentGift && (
            <div className="flex items-end gap-2 w-full max-w-[480px] pointer-events-auto">
              <div className="flex items-end justify-center gap-3 flex-shrink-0 flex-1">
              {isBattleMode && battleWinner && (
                <button 
                  type="button" 
                  onClick={() => {
                    if (battleSlots[0]?.userId) {
                      websocket.send('battle_create', {
                        hostName: myCreatorName,
                        opponentUserId: battleSlots[0].userId,
                        opponentName: battleSlots[0].name,
                        opponentRoomId: opponentStreamKey || '',
                      });
                    }
                    setBattleTime(300);
                    setMyScore(0);
                    setOpponentScore(0);
                    setPlayer3Score(0);
                    setPlayer4Score(0);
                    setBattleWinner(null);
                    setBattleCountdown(null);
                    reachedThresholdsRef.current.clear();
                  }}  
                  className="px-4 h-10 rounded-full bg-[#13151A] backdrop-blur-md border border-[#C9A96E]/40 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                >
                  <RefreshCw size={20} className="text-[#C9A96E] mr-2" />
                  <span className="text-[#C9A96E] text-xs font-bold">Rematch</span>
                </button>
              )}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setShowViewerList(true)}
                  className="w-10 h-10 rounded-full bg-[#13151A] backdrop-blur-md border border-[#C9A96E]/40 flex items-center justify-center shadow-lg relative"
                >
                  <span className="flex items-center justify-center w-full h-full relative z-[2]"><UserPlus size={20} className="text-[#C9A96E] shrink-0" strokeWidth={2} /></span>
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                </button>
                <span className="text-white/60 text-[8px] font-medium">Co-Host</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <button type="button" onClick={() => { if (!isBattleMode) toggleBattle(); else setIsFindCreatorsOpen(true); }} className="w-10 h-10 rounded-full bg-[#13151A] backdrop-blur-md border border-[#C9A96E]/40 flex items-center justify-center shadow-lg relative">
                  <Users size={20} className="text-[#C9A96E] relative z-[2]" />
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                </button>
                <span className="text-white/60 text-[8px] font-medium">Battle</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <button type="button" title="Share" onClick={() => setShowSharePanel(true)} className="w-10 h-10 rounded-full bg-[#13151A] backdrop-blur-md border border-[#C9A96E]/40 flex items-center justify-center shadow-lg active:scale-95 transition-transform relative">
                  <Share2 size={20} className="text-[#C9A96E] relative z-[2]" />
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                </button>
                <span className="text-white/60 text-[8px] font-medium">Share</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <button type="button" title="More options" onClick={() => setIsMoreMenuOpen(true)} className="w-10 h-10 rounded-full bg-[#13151A] backdrop-blur-md border border-[#C9A96E]/40 flex items-center justify-center shadow-lg relative">
                  <MoreVertical size={20} className="text-[#C9A96E] relative z-[2]" />
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
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
      {showGiftPanel && !isBroadcast && (
        <>
          <div className="fixed inset-0 bg-black/50 pointer-events-auto" style={{ zIndex: 200 }} onClick={() => setShowGiftPanel(false)} />
          <div className="fixed bottom-0 left-0 right-0 pointer-events-auto max-w-[480px] mx-auto" style={{ zIndex: 201 }}>
            <GiftPanel
              onSelectGift={handleSendGift}
              userCoins={coinBalance}
              onRechargeSuccess={(newBalance) => { setCoinBalance(newBalance); persistTestCoinsBalance(user?.id, newBalance); }}
              onWeeklyRanking={() => { setShowGiftPanel(false); setShowRankingPanel(true); }}
              onMembership={() => { setShowGiftPanel(false); setShowFanClub(true); }}
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
            className="bg-[#1C1E24]/95 backdrop-blur-md rounded-t-2xl h-[40vh] flex flex-col shadow-2xl border-t border-[#C9A96E]/20 pointer-events-auto w-full relative z-10 overflow-hidden pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>
            {/* Header */}
            <div className="flex items-center px-4 py-2 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#C9A96E]" strokeWidth={1.8} />
                <span className="text-white font-bold text-[13px]">Invite Creators</span>
              </div>
            </div>

            {/* Search */}
            <div className="px-4 py-1 flex-shrink-0">
              <div className="flex items-center gap-1.5 bg-white/[0.03] rounded-md px-2.5 py-1 border border-white/10">
                <Search className="w-3 h-3 text-white/25" strokeWidth={1.5} />
                <input
                  value={creatorQuery}
                  onChange={(e) => setCreatorQuery(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 bg-transparent outline-none text-white text-[11px] placeholder:text-white/20"
                />
              </div>
            </div>

            {/* Creator list */}
            <div className="flex-1 overflow-y-auto px-2" style={{ scrollbarWidth: 'none' }}>
              <div className="space-y-1 pb-4">
                {creatorsToInvite.length === 0 ? (
                  <p className="text-white/50 text-xs py-4 text-center">No live creators match your search.</p>
                ) : null}
                {creatorsToInvite.map((c) => {
                  const slotStatus = battleSlots.find(s => s.userId === c.id)?.status;
                  const isInvited = slotStatus === 'invited';
                  const isAccepted = slotStatus === 'accepted';
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
                      onClick={() => !slotStatus && !allFull && inviteCreatorToSlot(c.id)}
                      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors active:scale-[0.98] cursor-pointer ${!!slotStatus || allFull ? 'opacity-70' : ''}`}
                    >
                      <div className="relative flex-shrink-0">
                        <AvatarRing src={c.avatar} alt={c.name} size={30} />
                        {c.isLive && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-[#1C1E24]" />}
                      </div>
                      <p className="flex-1 text-left text-white text-xs font-semibold truncate min-w-0">{c.name || c.username}</p>

                      {isAccepted ? (
                        <div className="px-2 py-1 rounded-full bg-green-500/20 border border-green-500/40 flex items-center gap-0.5 flex-shrink-0">
                          <Check size={9} className="text-green-400" />
                          <span className="text-green-400 text-[9px] font-bold">Joined</span>
                        </div>
                      ) : isIncomingBattleInvite ? (
                        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="px-2 py-1 rounded-full bg-red-500/20 border border-red-500/30 flex items-center gap-0.5 active:scale-95 transition-transform cursor-pointer"
                            onClick={handleReject}
                          >
                            <span className="text-red-400 text-[9px] font-bold">Reject</span>
                          </button>
                          <button
                            type="button"
                            className="px-2.5 py-1 rounded-full bg-green-500 flex items-center gap-0.5 active:scale-95 transition-transform cursor-pointer"
                            onClick={handleJoin}
                          >
                            <span className="text-black text-[9px] font-bold">Join</span>
                          </button>
                        </div>
                      ) : isInvited ? (
                        <div className="px-2 py-1 rounded-full bg-white/5 border border-white/20 flex items-center gap-0.5 flex-shrink-0">
                          <span className="text-white/50 text-[9px] font-bold">Invited</span>
                        </div>
                      ) : (
                        <div className="px-2 py-1 rounded-full bg-[#C9A96E] flex items-center justify-center gap-0.5 flex-shrink-0">
                          <UserPlus size={9} className="text-black shrink-0 flex-shrink-0" strokeWidth={2} />
                          <span className="text-black text-[9px] font-bold">Invite</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredCreators.length === 0 && (
                  <div className="py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-[#13151A] border border-[#C9A96E]/40 flex items-center justify-center mx-auto mb-3">
                      {creatorsLoading ? (
                        <div className="w-5 h-5 border-2 border-[#C9A96E]/40 border-t-transparent rounded-full animate-spin" />
                      ) : creatorsLoadFailed ? (
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                      ) : (
                        <Search className="w-5 h-5 text-[#C9A96E]/40" />
                      )}
                    </div>
                    <p className="text-white/40 text-xs font-medium">
                      {creatorsLoading ? 'Loading creators...' : creatorsLoadFailed ? "Couldn't load creators" : creators.some(c => c.isLive) ? 'No creators match your search' : 'No other creators are live right now. When someone else goes live, they\'ll appear here so you can invite them.'}
                    </p>
                    {creatorsLoadFailed && (
                      <button type="button" onClick={() => loadCreators()} className="mt-2 px-3 py-1.5 rounded-lg bg-[#C9A96E]/20 border border-[#C9A96E]/40 text-[#C9A96E] text-[10px] font-bold active:scale-95">
                        Retry
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Start Match Button */}
            {battleSlots.some(s => s.status === 'accepted') && (
              <div className="px-4 py-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsFindCreatorsOpen(false);
                    const accepted = battleSlots.find(s => s.status === 'accepted');
                    websocket.send('battle_create', {
                      hostName: myCreatorName,
                      opponentUserId: accepted?.userId ?? '',
                      opponentName: accepted?.name ?? 'Opponent',
                      opponentRoomId: opponentStreamKey || '',
                    });
                  }}
                  className="w-full py-2.5 bg-[#C9A96E] text-black text-xs font-bold rounded-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
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
              className="bg-[#1C1E24] rounded-t-2xl border-t border-white/10 px-4 pt-4 pb-[calc(20px+env(safe-area-inset-bottom))] pointer-events-auto shadow-2xl relative z-10"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="relative -mt-6 flex-shrink-0">
                    <AvatarRing src={typeof miniProfile.avatar === 'string' ? miniProfile.avatar : ''} alt={typeof miniProfile.username === 'string' ? miniProfile.username : 'User'} size={80} />
                  </div>
                  <div className="min-w-0 pt-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <div className="text-white font-black text-[16px] truncate">{typeof miniProfile.username === 'string' ? miniProfile.username : 'User'}</div>
                      {miniProfile?.id && moderators.has(miniProfile.id) && (
                        <User className="w-3.5 h-3.5 text-[#C9A96E] flex-shrink-0" strokeWidth={2.25} aria-hidden />
                      )}
                    </div>
                    <div className="text-white/70 text-[12px] font-bold">
                      {typeof miniProfile.level === 'number' ? (
                        <span className="inline-flex items-center gap-2">
                          <LevelBadge level={miniProfile.level} size={16} layout="fixed" avatar={miniProfile.avatar} />
                          <span>Level {miniProfile.level}</span>
                        </span>
                      ) : (
                        'Level —'
                      )}
                      {miniProfile.coins != null ? ` • 🪙 ${formatCoinsShort(miniProfile.coins)}` : ''}
                    </div>
                    
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
                      : 'bg-[#C9A96E] text-black font-black hover:bg-[#C9A96E]/90'
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
                        if (next.has(miniProfile.id!)) { next.delete(miniProfile.id!); showToast(`@${miniProfile.username} removed as moderator`); }
                        else { next.add(miniProfile.id!); showToast(`@${miniProfile.username} is now a moderator`); }
                        return next;
                      });
                      closeMiniProfile();
                    }} className={`h-9 rounded-lg text-[11px] font-bold active:scale-95 transition-all ${miniProfile?.id && moderators.has(miniProfile.id) ? 'bg-purple-950/50 text-purple-400 border border-purple-900/50' : 'bg-purple-600 text-white'}`}>
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
                    } catch {}
                  }} className="h-9 rounded-lg bg-red-950/50 text-red-400 text-[11px] font-bold border border-red-900/50 hover:bg-red-900/50 active:scale-95 transition-all">
                    Block
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══ VIEWER LIST + JOIN REQUESTS PANEL — host only: see join requests (Accept/Decline) and invite spectators as co-host ═══ */}
      {showViewerList && (
        <>
          <div
            className="fixed inset-0 bg-black/40 pointer-events-auto"
            style={{ zIndex: 99998 }}
            onClick={() => setShowViewerList(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[999999] pointer-events-auto max-w-[480px] mx-auto">
            <div className="bg-[#1C1E24]/95 backdrop-blur-md rounded-t-2xl h-[40vh] flex flex-col shadow-2xl border-t border-[#C9A96E]/20 overflow-hidden">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>
              <div className="flex items-center justify-between px-4 pb-2">
                <h3 className="text-white font-bold text-sm">Join requests & Spectators</h3>
                <div className="flex items-center gap-1">
                  <Users size={12} className="text-white/50" />
                  <span className="text-white/60 text-xs font-semibold">{formatCountShort(viewerCount)}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4 min-h-0">
                {/* Spectators — invite as co-host or open profile; join request (Accept/Decline) shown on requester's row */}
                <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider mb-1.5">Spectators</p>
                {activeViewers.length > 0 ? (
                  activeViewers.map((v, i) => {
                    const alreadyInvited = coHosts.some(h => h.userId === v.id);
                    const isJoinRequester = pendingJoinRequest?.requesterId === v.id;
                    return (
                      <div
                        key={v.id}
                        className="flex items-center gap-3 w-full py-2 rounded-lg hover:bg-white/[0.03]"
                      >
                        <span className="text-white/30 text-xs font-bold w-5 text-right flex-shrink-0">{i + 1}</span>
                        <button
                          type="button"
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                          onClick={() => { openMiniProfile(v.displayName); setShowViewerList(false); }}
                        >
                          <div className="w-10 h-10 rounded-full border-2 border-[#C9A96E]/30 overflow-hidden bg-[#13151A] flex-shrink-0">
                            {v.avatar ? (
                              <img src={v.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="text-[#C9A96E] font-bold text-sm">{v.displayName.slice(0, 1).toUpperCase()}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{v.displayName}</p>
                            <p className="text-white/40 text-[10px] font-medium">{isJoinRequester ? 'Requested to co-host' : `Level ${v.level}`}</p>
                          </div>
                        </button>
                        {isBroadcast && isMyStreamLive && (
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
                              onClick={(e) => { e.stopPropagation(); inviteCoHost({ id: v.id, name: v.displayName, avatar: v.avatar }); setShowViewerList(false); }}
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
              src="/icons/Membership.png" 
              alt="Membership" 
              className="w-20 h-20 object-contain drop-shadow-2xl animate-pulse"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <Heart className="w-20 h-20 text-[#FF2D55] fill-[#FF2D55] drop-shadow-2xl animate-pulse hidden" />
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
            className="bg-[#1C1E24]/95 backdrop-blur-md rounded-t-2xl p-3 pb-safe h-full flex flex-col shadow-2xl w-full overflow-hidden border-t border-[#C9A96E]/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <Heart className="w-3 h-3 text-[#C9A96E]" strokeWidth={2} fill="#C9A96E" />
                <span className="text-gold-metallic font-bold text-sm">Your Team Status</span>
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar min-h-0">
               {/* Team Status Card */}
               <div className="bg-white/5 rounded-xl p-3 border border-[#C9A96E]/20 relative overflow-hidden">
                 <div className="flex items-center gap-3 relative z-10">
                   <div 
                     className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C9A96E] to-[#E8D5A3] flex items-center justify-center border-2 border-[#C9A96E]/30 shadow-lg cursor-pointer active:scale-95 transition-transform"
                     onClick={(e) => {
                       e.stopPropagation();
                       setShowJoinAnimation(true);
                       setTimeout(() => setShowJoinAnimation(false), 2000);
                     }}
                   >
                     <Heart className="w-4 h-4 text-black fill-black" />
                   </div>
                   <div>
                     <div className="text-[#C9A96E]/60 text-[9px] font-bold uppercase tracking-wider">Member Hearts</div>
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
               <div className="bg-white/5 rounded-xl p-3 border border-[#C9A96E]/20 mt-2">
                 <div className="text-[#C9A96E]/60 text-[9px] font-bold uppercase tracking-wider">Total Gift Coins Received</div>
                 <div className="text-gold-metallic font-bold text-lg">{totalGiftCoins.toLocaleString()}</div>
               </div>

               {/* Top Gifters */}
               <div className="mt-3">
                 <h4 className="text-[#C9A96E]/60 text-[9px] font-bold uppercase tracking-wider mb-2 px-1">Top Supporters</h4>
                 <div className="space-y-1">
                   {topGifters.length === 0 && (
                     <p className="text-white/30 text-[10px] text-center py-2">No gifts yet</p>
                   )}
                   {topGifters.map((g, i) => (
                     <div key={g.user_id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#C9A96E]/5 border border-[#C9A96E]/15">
                       <div className="w-5 text-center font-bold text-[10px] text-[#C9A96E]/60">{i + 1}</div>
                       <img src={g.avatar_url || '/Icons/elix-logo.png'} alt="" className="w-7 h-7 rounded-full object-cover border border-[#C9A96E]/20" />
                       <div className="flex-1 min-w-0">
                         <div className="text-[10px] font-bold text-white truncate">{g.username || g.user_id.slice(0, 8)}</div>
                       </div>
                       <div className="text-[#C9A96E] text-[10px] font-bold">{g.total_coins.toLocaleString()}</div>
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
            className="bg-[#1C1E24]/95 rounded-t-2xl p-3 pb-safe max-h-[40vh] overflow-y-auto no-scrollbar shadow-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2">
              <div className="flex items-center gap-1.5">
                <Heart className="w-3 h-3 text-[#C9A96E]" strokeWidth={2} fill="#C9A96E" />
                <span className="text-gold-metallic font-bold text-sm">Super Fan Goal</span>
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
              <div className="flex flex-col gap-3">
                {/* Subscription Banner */}
                <div className="bg-gradient-to-r from-[#C9A96E]/10 to-[#B8943F]/5 rounded-xl p-3 border border-[#C9A96E]/20 relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-gold-metallic font-bold text-xs">Membership</h3>
                        <p className="text-white/50 text-[9px]">Unlock photo stickers & exclusive perks</p>
                      </div>
                      <div className="w-6 h-6 bg-[#C9A96E]/20 rounded-full flex items-center justify-center border border-[#C9A96E]/30">
                        <Heart className="w-2.5 h-2.5 text-[#C9A96E] fill-[#C9A96E] animate-pulse" />
                      </div>
                    </div>
                    
                    <div className="flex items-end gap-1 mb-2">
                      <span className="text-lg font-black text-gold-metallic">£3.00</span>
                      <span className="text-white/40 text-[10px] font-medium mb-0.5">/ month</span>
                    </div>

                    <button
                      onClick={handleSubscribe}
                      disabled={isSubscribing}
                      className="w-full py-2 bg-gradient-to-r from-[#C9A96E] to-[#E8D5A3] text-black font-bold text-[10px] uppercase tracking-wide rounded-xl active:scale-[0.98] transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
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
                <div className="bg-white/5 rounded-xl p-3 border border-[#C9A96E]/20">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-gold-metallic font-bold text-[10px] flex items-center gap-1">
                      <div className="w-4 h-4 rounded-full bg-[#13151A] flex items-center justify-center border border-[#C9A96E]/40">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      </div>
                      Photo Stickers
                    </h3>
                    <span className="bg-[#C9A96E]/10 text-[#C9A96E] text-[7px] font-bold px-1.5 py-0.5 rounded-full border border-[#C9A96E]/20">
                      {creatorStickers.length}/20
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {creatorStickers.map((sticker) => (
                      <div key={sticker.id} className="aspect-square rounded-lg bg-white/5 border border-[#C9A96E]/10 relative overflow-hidden group">
                        <img src={sticker.image_url} alt={sticker.label} className="w-full h-full object-cover" />
                        <button
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteSticker(sticker.id)}
                        >
                          <X size={8} className="text-red-400" />
                        </button>
                      </div>
                    ))}
                    {creatorStickers.length < 20 && (
                      <button
                        className="aspect-square rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center border border-dashed border-[#C9A96E]/30 relative overflow-hidden"
                        onClick={uploadSticker}
                        disabled={stickerUploading}
                      >
                        {stickerUploading ? (
                          <div className="w-4 h-4 border-2 border-[#C9A96E]/30 border-t-[#C9A96E] rounded-full animate-spin" />
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <PlusCircle size={14} className="text-[#C9A96E]/60" />
                            <span className="text-[6px] text-[#C9A96E]/60 font-bold uppercase">Upload</span>
                          </div>
                        )}
                      </button>
                    )}
                  </div>
                  {creatorStickers.length === 0 && (
                    <p className="text-white/30 text-[8px] text-center mt-2">Upload photo stickers for your subscribers</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>
        </>
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
            className="bg-[#1C1E24]/95 rounded-t-2xl p-3 pb-safe h-[40vh] overflow-y-auto no-scrollbar shadow-2xl w-full border-t border-[#C9A96E]/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center mb-2">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Content — luxury compact grid */}
            <div className="grid grid-cols-4 gap-y-4 gap-x-2 pt-1 pb-2 px-1">

              {!IS_STORE_BUILD && (
              <button type="button" onClick={() => { setShowTestCoinsModal(true); setTestCoinsStep(sessionStorage.getItem('elix_test_coins_unlocked') ? 'amount' : 'password'); setTestCoinsPwd(''); setTestCoinsError(''); setTestCoinsAmount(''); setIsMoreMenuOpen(false); }} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
                <div className="w-11 h-11 rounded-full relative flex items-center justify-center">
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[1]" />
                  <Coins className="w-[18px] h-[18px] text-[#C9A96E] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70">Test</span>
              </button>
              )}

              <button type="button" onClick={() => { setShowSharePanel(true); setIsMoreMenuOpen(false); }} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
                <div className="w-11 h-11 rounded-full relative flex items-center justify-center">
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[1]" />
                  <Share2 className="w-[18px] h-[18px] text-[#C9A96E] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70">Share</span>
              </button>

              <button type="button" disabled={!isBroadcast} onClick={() => { flipCamera(); setIsMoreMenuOpen(false); }} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-40">
                <div className="w-11 h-11 rounded-full relative flex items-center justify-center">
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[1]" />
                  <RefreshCw className="w-[18px] h-[18px] text-[#C9A96E] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70">Flip</span>
              </button>

              <button type="button" disabled={!isBroadcast} onClick={() => { toggleMic(); setIsMoreMenuOpen(false); }} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-40">
                <div className="w-11 h-11 rounded-full relative flex items-center justify-center">
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[1]" />
                  {isMicMuted ? <MicOff className="w-[18px] h-[18px] text-[#C9A96E] relative z-[2]" strokeWidth={1.8} /> : <Mic className="w-[18px] h-[18px] text-[#C9A96E] relative z-[2]" strokeWidth={1.8} />}
                </div>
                <span className="text-[10px] font-semibold text-white/70">{isMicMuted ? 'Unmute' : 'Mute'}</span>
              </button>

              <button type="button" disabled={!isBroadcast} onClick={() => { toggleCam(); setIsMoreMenuOpen(false); }} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-40">
                <div className="w-11 h-11 rounded-full relative flex items-center justify-center">
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[1]" />
                  {isCamOff ? <CameraOff className="w-[18px] h-[18px] text-red-400 relative z-[2]" strokeWidth={1.8} /> : <Camera className="w-[18px] h-[18px] text-[#C9A96E] relative z-[2]" strokeWidth={1.8} />}
                </div>
                <span className="text-[10px] font-semibold text-white/70">{isCamOff ? 'Cam On' : 'Cam Off'}</span>
              </button>

              <button type="button" onClick={() => { setIsChatVisible((v) => !v); setIsMoreMenuOpen(false); }} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
                <div className="w-11 h-11 rounded-full relative flex items-center justify-center">
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[1]" />
                  <MessageCircle className="w-[18px] h-[18px] text-[#C9A96E] relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-white/70">{isChatVisible ? 'Hide Chat' : 'Show Chat'}</span>
              </button>

              <button type="button" onClick={() => { setIsReportModalOpen(true); setIsMoreMenuOpen(false); }} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
                <div className="w-11 h-11 rounded-full relative flex items-center justify-center">
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[1]" />
                  <Flag className="w-[18px] h-[18px] text-red-400 relative z-[2]" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-red-400/70">Report</span>
              </button>

              {isBattleMode && battleWinner && isBroadcast && (
                <button type="button" onClick={() => { if (battleSlots[0]?.userId) { websocket.send('battle_create', { hostName: myCreatorName, opponentUserId: battleSlots[0].userId, opponentName: battleSlots[0].name, opponentRoomId: opponentStreamKey || '' }); } setBattleTime(300); setMyScore(0); setOpponentScore(0); setPlayer3Score(0); setPlayer4Score(0); battleServerTotalsRef.current = { h: 0, o: 0, p3: 0, p4: 0 }; setBattleServerTotals({ h: 0, o: 0, p3: 0, p4: 0 }); setBattleWinner(null); setBattleCountdown(null); reachedThresholdsRef.current.clear(); setIsMoreMenuOpen(false); }} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
                  <div className="w-11 h-11 rounded-full relative flex items-center justify-center">
                    <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[1]" />
                    <RefreshCw className="w-[18px] h-[18px] text-[#C9A96E] relative z-[2]" strokeWidth={1.8} />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70">Rematch</span>
                </button>
              )}

              {isBattleMode && isBroadcast && !battleWinner && battleTime > 0 && (
                <button type="button" onClick={() => { startSpeedChallenge(); setIsMoreMenuOpen(false); }} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
                  <div className="w-11 h-11 rounded-full relative flex items-center justify-center">
                    <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[1]" />
                    <Zap className="w-[18px] h-[18px] text-[#C9A96E] relative z-[2]" strokeWidth={1.8} />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70">Speed</span>
                </button>
              )}

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
              className="bg-[#1C1E24] rounded-2xl p-5 mx-6 w-full max-w-xs shadow-2xl border border-[#C9A96E]/30 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-4">
                <Lock className="w-5 h-5 text-[#C9A96E]" />
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
                          } catch {}
                        } else {
                          try {
                            localStorage.removeItem(TEST_COINS_VERIFIED_KEY);
                            localStorage.removeItem(TEST_COINS_PWD_KEY);
                          } catch {}
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
                    className="w-full bg-[#13151A] text-white text-sm rounded-xl px-4 py-3 border border-white/10 focus:border-[#C9A96E]/60 focus:outline-none placeholder:text-white/30 mb-2"
                  />
                  <label className="flex items-center gap-2 mt-2 mb-2 cursor-pointer">
                    <input type="checkbox" checked={testCoinsSavePwd} onChange={(e) => setTestCoinsSavePwd(e.target.checked)} className="rounded border-white/30" />
                    <span className="text-white/60 text-xs">Save password (stay unlocked 24h)</span>
                  </label>
                  {testCoinsError && (
                    <p className="text-red-400 text-xs mb-2">{testCoinsError}</p>
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
                      className="flex-1 py-2.5 rounded-xl bg-[#C9A96E] text-black text-sm font-bold disabled:opacity-40"
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
                    const newBal = coinBalance + amount;
                    setCoinBalance(newBal);
                    persistTestCoinsBalance(user?.id, newBal);
                    showToast(`+${amount.toLocaleString()} test added`);
                    setShowTestCoinsModal(false);
                    if (user?.id) {
                      request('/api/test-coins', {
                        method: 'POST',
                        body: JSON.stringify({ amount }),
                      }).catch(() => {});
                    }
                  }}
                >
                  <p className="text-white/40 text-xs mb-3">These coins are for testing only and have no real value.</p>
                  <div className="flex items-center gap-2 mb-2">
                    <Coins className="w-4 h-4 text-[#C9A96E]" />
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
                    className="w-full bg-[#13151A] text-white text-sm rounded-xl px-4 py-3 border border-white/10 focus:border-[#C9A96E]/60 focus:outline-none placeholder:text-white/30 mb-2"
                  />
                  {testCoinsError && (
                    <p className="text-red-400 text-xs mb-2">{testCoinsError}</p>
                  )}
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    {[1000, 5000, 10000, 25000, 50000, 100000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTestCoinsAmount(String(amt))}
                        className="py-1.5 rounded-lg text-xs font-bold transition-colors bg-white/5 text-white/70 hover:bg-[#C9A96E]/20"
                      >
                        {amt >= 1000 ? `${amt / 1000}K` : amt}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const amount = 100000000;
                        const newBal = coinBalance + amount;
                        setCoinBalance(newBal);
                        persistTestCoinsBalance(user?.id, newBal);
                        showToast(`+${amount.toLocaleString()} test added`);
                        setShowTestCoinsModal(false);
                        if (user?.id) {
                          request('/api/test-coins', {
                            method: 'POST',
                            body: JSON.stringify({ amount }),
                          }).catch(() => {});
                        }
                      }}
                      className="py-1.5 rounded-lg text-xs font-bold transition-colors bg-[#C9A96E]/30 text-[#C9A96E] hover:bg-[#C9A96E]/40 col-span-3"
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
                      className="flex-1 py-2.5 rounded-xl bg-[#C9A96E] text-black text-sm font-bold disabled:opacity-40"
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

      {/* Full-screen Video Effect Overlay (Behind controls but above video) */}
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
          <div className="bg-[#1C1E24]/95 backdrop-blur-md rounded-t-2xl p-3 pb-safe flex flex-col shadow-2xl w-full h-[40vh] overflow-hidden border-t border-[#C9A96E]/20">
            <div className="flex justify-center pt-1 pb-2">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>
            <div className="flex items-center justify-between gap-2 px-4 pb-2 flex-shrink-0">
              <h3 className="text-white font-bold whitespace-nowrap text-sm">Share to</h3>
              <div className="flex-none w-[120px] bg-white/5 rounded-lg px-2 py-1.5 flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-white/30" />
                <input
                  value={shareQuery}
                  onChange={(e) => setShareQuery(e.target.value)}
                  placeholder="Search..."
                  className="bg-transparent text-white text-xs outline-none w-full placeholder:text-white/20"
                />
              </div>
            </div>

            {/* Create + all users row — same as Spectator / watch share */}
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden pb-3 flex-shrink-0 px-4 no-scrollbar">
              <button
                type="button"
                onClick={() => { navigate('/create'); setShowSharePanel(false); }}
                className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform"
                style={{ width: 95, minWidth: 95 }}
              >
                <div className="relative w-[85px] h-[85px] flex items-center justify-center">
                  <StoryGoldRingAvatar size={85} src={myAvatar || '/Icons/Profile icon.png'} alt="Create" />
                  <Plus size={28} className="text-[#C9A96E] absolute" strokeWidth={2.5} />
                </div>
                <span className="text-white/80 text-[11px] font-medium">Create</span>
              </button>
              {shareFollowers.filter(f => f.username?.toLowerCase().includes(shareQuery.toLowerCase())).map((f) => (
                <button
                  key={f.user_id}
                  className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  style={{ width: 95, minWidth: 95 }}
                  onClick={() => sendShareToFollower(f.user_id)}
                >
                  <StoryGoldRingAvatar size={85} src={f.avatar_url || '/Icons/Profile icon.png'} alt={f.username} />
                  <span className="text-white/80 text-[11px] font-medium truncate w-full text-center">{shareSentTo.has(f.user_id) ? 'Sent' : f.username || 'User'}</span>
                </button>
              ))}
            </div>

            {/* Share options — same layout as ShareModal */}
            <div className="flex-1 overflow-y-scroll overflow-x-hidden min-h-0 px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:bg-[#C9A96E]/60 [&::-webkit-scrollbar-thumb]:rounded-full">
              <div className="grid grid-cols-5 gap-y-3 gap-x-1.5 pt-1">
                {[
                  { name: 'WhatsApp', icon: <MessageCircle size={22} className="text-white" />, action: () => { window.open(`https://wa.me/?text=${encodeURIComponent('Watch my LIVE on Elix! ' + window.location.href)}`); setShowSharePanel(false); } },
                  { name: 'Facebook', icon: <Share2 size={22} className="text-white" />, action: () => { window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`); setShowSharePanel(false); } },
                  { name: 'Copy Link', icon: <Copy size={22} className="text-white" />, action: () => { navigator.clipboard.writeText(`https://www.elixlive.co.uk/live/${effectiveStreamId}`); showToast('Link copied!'); setShowSharePanel(false); } },
                  { name: 'Promote', icon: <TrendingUp size={22} className="text-white" />, action: () => { setShowSharePanel(false); setShowPromotePanel(true); } },
                  { name: 'Report', icon: <Flag size={22} className="text-red-400" />, isRed: true, action: () => { setIsReportModalOpen(true); setShowSharePanel(false); } },
                  { name: 'Story', icon: <PlusCircle size={22} className="text-white" />, action: () => { navigate('/create'); setShowSharePanel(false); } },
                ].map((item) => (
                  <button key={item.name} onClick={item.action} className="flex flex-col items-center gap-1 active:scale-95 transition-transform">
                    <div className="relative w-9 h-9 rounded-full bg-[#13151A] overflow-hidden flex items-center justify-center flex-shrink-0">
                      <div className={`relative z-[2] ${item.name === 'Report' ? 'translate-y-0.5' : ''}`}>{React.cloneElement((item.icon as React.ReactElement), { className: `w-3.5 h-3.5 ${(item as { isRed?: boolean }).isRed ? 'text-red-400' : 'text-white'}`, strokeWidth: 1.8 })}</div>
                      <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                    </div>
                    <span className={`text-[8px] font-semibold truncate w-full text-center ${(item as { isRed?: boolean }).isRed ? 'text-red-400/70' : 'text-white/70'}`}>{item.name}</span>
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
          <div className="bg-[#1C1E24] border border-white/10 rounded-xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
              <h3 className="font-semibold text-white">Safety reminder</h3>
            </div>
            <p className="text-white/80 text-sm mb-4">{moderationWarningMessage}</p>
            <button
              type="button"
              onClick={() => { setShowModerationWarning(false); setModerationWarningMessage(''); }}
              className="w-full py-2.5 rounded-lg bg-[#C9A96E] text-black font-semibold"
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
