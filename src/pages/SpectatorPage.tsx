import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { showToast } from '../lib/toast';
import {
  Send,
  Search,
  Heart,
  Share2,
  Gift,
  MoreVertical,
  Copy,
  AlertTriangle,
  Check,
  UserPlus,
  X,
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
  Trophy,
  Plus,
  PlusCircle,
  ExternalLink,
  Play,
  Users,
} from 'lucide-react';
import { GiftPanel } from '../components/GiftPanel';
import { GiftUiItem, GIFT_COMBO_MAX, resolveGiftAssetUrl, fetchGiftsFromDatabase } from '../lib/giftsCatalog';
import { GiftOverlay } from '../components/GiftOverlay';
import GiftAnimationOverlay from '../components/GiftAnimationOverlay';
import { ChatOverlay } from '../components/ChatOverlay';
import { AvatarRing } from '../components/AvatarRing';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { GoldProfileFrame } from '../components/GoldProfileFrame';
import {
  CREATOR_NAME_PILL_CLASSNAME,
  getCreatorNamePillStyle,
  SPECTATOR_BATTLE_PROFILE_RING_PX,
  SPECTATOR_MVP_PROFILE_RING_PX,
  LIVE_TOP_AVATAR_RING_PX,
} from '../lib/profileFrame';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import { getLiveKitUrl } from '../lib/api';
import { fetchAllSharePanelContacts } from '../lib/sharePanelContacts';
import { api, request } from '../lib/apiClient';
import ReportModal from '../components/ReportModal';
import PromotePanel from '../components/PromotePanel';
import { RankingPanel } from '../components/RankingPanel';
import { websocket } from '../lib/websocket';
import { normalizeBattleGiftTarget } from '../lib/liveBattleGiftTarget';
import { IS_STORE_BUILD } from '../config/build';
import { Room, RoomEvent, LocalVideoTrack, LocalAudioTrack } from 'livekit-client';

function formatBattleScoreShort(coins: number) {
  const n = typeof coins === 'number' && Number.isFinite(coins) ? coins : 0;
  return n.toLocaleString();
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
  }, [value, durationMs]);
  return <span className={className}>{fmt(display)}</span>;
}

function battleTeamLabelsFromPayload(data: any): { red: string; blue: string } {
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
  useEffect(() => { let c = false; fetchGiftsFromDatabase().then(g => { if (!c) setGiftsCatalog(g); }); return () => { c = true; }; }, []);
  const [hostName, setHostName] = useState('Creator');
  const [hostAvatar, setHostAvatar] = useState('');
  const [hostUserId, setHostUserId] = useState('');
  const hostUserIdRef = useRef('');
  const [streamIsLive, setStreamIsLive] = useState<boolean | null>(null);
  const [streamRetryKey, setStreamRetryKey] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [activeLikes, setActiveLikes] = useState(0);

  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [coinBalance, setCoinBalance] = useState(0);
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

  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showPromotePanel, setShowPromotePanel] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [showRankingPanel, setShowRankingPanel] = useState(false);
  const [showFanClub, setShowFanClub] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  const [streamEndedReceived, setStreamEndedReceived] = useState(false);

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
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetComboTimer = () => {
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    comboTimerRef.current = setTimeout(() => { setShowComboButton(false); setComboCount(0); }, 8000);
  };

  const [spectatorCoHostRequestSent, setSpectatorCoHostRequestSent] = useState(false);
  const [showViewersPanel, setShowViewersPanel] = useState(false);
  const [viewersList, setViewersList] = useState<{ id: string; name: string; avatar: string; level?: number }[]>([]);
  const actualViewersRef = useRef<Map<string, { name: string; avatar: string; level: number }>>(new Map());
  /** Gift coins — global (top bar #1–3), host team, opponent team (battle rows). */
  const mvpGiftScoresRef = useRef<Record<string, number>>({});
  const mvpGiftScoresHostRef = useRef<Record<string, number>>({});
  const mvpGiftScoresOpponentRef = useRef<Record<string, number>>({});

  type MvpSlotRow = { id: string; name: string; avatar: string; level: number };
  const [mvpSlots, setMvpSlots] = useState<{
    global: MvpSlotRow[];
    host: MvpSlotRow[];
    opponent: MvpSlotRow[];
  }>({ global: [], host: [], opponent: [] });
  const resolveCircleAvatar = useCallback((avatar: string | null | undefined, name: string | null | undefined) => {
    const direct = typeof avatar === 'string' ? avatar.trim() : '';
    if (direct) return direct;
    const label = String(name || 'User').trim() || 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=121212&color=C9A96E`;
  }, []);

  const syncMvpSlots = useCallback(() => {
    const hid = hostUserIdRef.current || hostUserId || effectiveStreamId || '';
    const base = Array.from(actualViewersRef.current.entries())
      .filter(([id]) => id && id !== hid && id !== effectiveStreamId)
      .map(([id, v]) => ({ id, name: v.name, avatar: v.avatar, level: v.level }));

    const sortBy = (scores: Record<string, number>) => (a: MvpSlotRow, b: MvpSlotRow) => {
      const sa = scores[a.id] ?? 0;
      const sb = scores[b.id] ?? 0;
      if (sb !== sa) return sb - sa;
      return (b.level ?? 0) - (a.level ?? 0);
    };

    setMvpSlots({
      global: [...base].sort(sortBy(mvpGiftScoresRef.current)).slice(0, 3),
      host: [...base].sort(sortBy(mvpGiftScoresHostRef.current)).slice(0, 3),
      opponent: [...base].sort(sortBy(mvpGiftScoresOpponentRef.current)).slice(0, 3),
    });
  }, [effectiveStreamId, hostUserId]);

  const syncMvpSlotsRef = useRef(syncMvpSlots);
  syncMvpSlotsRef.current = syncMvpSlots;

  useEffect(() => {
    mvpGiftScoresRef.current = {};
    mvpGiftScoresHostRef.current = {};
    mvpGiftScoresOpponentRef.current = {};
    syncMvpSlotsRef.current();
  }, [effectiveStreamId]);

  const [joinRequested, setJoinRequested] = useState(false);

  const [userLevel, setUserLevel] = useState(user?.level || 1);
  const [userXP, setUserXP] = useState(0);

  const viewerName = user?.username || user?.name || 'Viewer';
  const viewerAvatar = user?.avatar || '';
  const spectatorTopAvatars = useMemo(() => {
    const hid = hostUserIdRef.current || hostUserId || effectiveStreamId;
    const list = Array.from(actualViewersRef.current.entries())
      .filter(([id]) => id && id !== hid && id !== effectiveStreamId)
      .map(([id, v]) => ({ id, avatar: v.avatar, name: v.name }));

    if (user?.id && !list.some((v) => v.id === user.id)) {
      list.unshift({
        id: user.id,
        avatar: user.avatar || '',
        name: user.username || user.name || 'You',
      });
    }
    return list.slice(0, 3);
  }, [viewerCount, hostUserId, effectiveStreamId, user?.id, user?.avatar, user?.username, user?.name]);

  const [moderators, setModerators] = useState<Set<string>>(new Set());
  const isModerator = moderators.has(user?.id || '');

  const [hasJoinedToday, setHasJoinedToday] = useState(false);
  const [myHeartCount, setMyHeartCount] = useState(0);
  const [dailyHeartCount, setDailyHeartCount] = useState(0);
  const dailyHeartFetchedRef = useRef(false);

  useEffect(() => {
    if (!hostUserId || dailyHeartFetchedRef.current) return;
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
    active: boolean;
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
  const lastBattleScoreUpdateTraceSigRef = useRef('');
  /** When battle is active, gifts credit host (red) or opponent (blue) MVP tallies. */
  const [spectatorGiftBattleTarget, setSpectatorGiftBattleTarget] = useState<'host' | 'opponent'>('host');
  /** From battle_state_sync — map /watch/:streamId to red vs blue team for gifts (defaults were always host). */
  const [battleStreamIds, setBattleStreamIds] = useState<{
    hostRoomId: string;
    hostUserId: string;
    opponentRoomId: string;
    opponentUserId: string;
  } | null>(null);

  const opponentVideoRef = useRef<HTMLVideoElement>(null);
  const opponentLkRoomRef = useRef<Room | null>(null);
  const [hasOpponentStream, setHasOpponentStream] = useState(false);
  const [showOpponentPanel, setShowOpponentPanel] = useState(false);
  const [opponentProfile, setOpponentProfile] = useState<{
    displayName: string; username: string; avatarUrl: string;
    followers: number; following: number; level: number; bio: string;
  } | null>(null);
  const opponentProfileFetchedRef = useRef('');
  /** One server +5 PK vote per spectator per battle (matches LiveStream `battleTapScoreRemainingRef`). */
  const spectatorBattleVoteRemainingRef = useRef(1);
  const prevSpectatorBattleActiveRef = useRef(false);
  useEffect(() => {
    const active = !!spectatorBattle?.active;
    if (active && !prevSpectatorBattleActiveRef.current) {
      spectatorBattleVoteRemainingRef.current = 1;
    }
    prevSpectatorBattleActiveRef.current = active;
  }, [spectatorBattle?.active]);

  const openOpponentPanel = useCallback(() => {
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

  const handleSpectatorVote = useCallback((target: 'host' | 'opponent' | 'player3' | 'player4') => {
    if (!spectatorBattle?.active) return;
    if (spectatorBattleVoteRemainingRef.current <= 0) return;
    if (!websocket.isConnected()) return;
    spectatorBattleVoteRemainingRef.current = 0;
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12);
    } catch {
      /* ignore */
    }
    websocket.send('battle_spectator_vote', { target });
  }, [spectatorBattle?.active]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Battle countdown locally while active (no battle_tick WebSocket).
  useEffect(() => {
    if (!spectatorBattle?.active) return;
    const id = window.setInterval(() => {
      setSpectatorBattle((prev) => {
        if (!prev?.active) return prev;
        return { ...prev, timeLeft: Math.max(0, prev.timeLeft - 1) };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [spectatorBattle?.active]);

  // Connect to opponent's LiveKit room so spectators see both battle videos
  useEffect(() => {
    const roomId = spectatorBattle?.opponentRoomId;
    if (!spectatorBattle?.active || !roomId) {
      if (opponentLkRoomRef.current) { opponentLkRoomRef.current.disconnect(); opponentLkRoomRef.current = null; }
      setHasOpponentStream(false);
      return;
    }
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
          if (el) { track.attach(el); setHasOpponentStream(true); }
        });
        await room.connect(url, token);
        if (!mounted) { room.disconnect(); return; }
        for (const [, p] of room.remoteParticipants) {
          for (const [, pub] of p.videoTrackPublications) {
            if (pub.track && pub.isSubscribed && opponentVideoRef.current) {
              pub.track.attach(opponentVideoRef.current);
              setHasOpponentStream(true);
            }
          }
        }
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; room.disconnect(); opponentLkRoomRef.current = null; setHasOpponentStream(false); };
  }, [spectatorBattle?.active, spectatorBattle?.opponentRoomId]);

  // ═══════════════════════════════════════════════════
  // CO-HOST STATE (synced from host so spectators see same layout)
  // ═══════════════════════════════════════════════════
  type SpectatorCoHost = { id: string; userId: string; name: string; avatar: string; status: string };
  const [spectatorCoHosts, setSpectatorCoHosts] = useState<SpectatorCoHost[]>([]);
  const coHostVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [selectedSpectatorUserId, setSelectedSpectatorUserId] = useState<string | null>(null);
  const currentMainTrackRef = useRef<import('livekit-client').Track | null>(null);

  const [isCoHosting, setIsCoHosting] = useState(false);
  const [coHostStream, setCoHostStream] = useState<MediaStream | null>(null);
  const coHostChanRef = useRef<any>(null);
  const [pendingCoHostInvite, setPendingCoHostInvite] = useState<{ notifId: string; hostName: string; hostAvatar: string; streamKey: string; hostUserId: string } | null>(null);
  const [showCoHostPanel, setShowCoHostPanel] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    // Cohost invite uses explicit navigation / WebSocket.
    return () => {};
  }, [user?.id]);
  const myVideoRef = useRef<HTMLVideoElement>(null);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [isCamOff, setIsCamOff] = useState(false);

  // Co-host publish is invite/accept only — URL alone is not enough.
  const cohostState = (location.state as any) || {};
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

  const startCoHosting = async () => {
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
      setMessages(prev => [...prev, {
        id: `cohost-${Date.now()}`,
        username: 'System',
        text: 'You joined as co-host',
        isSystem: true,
      }]);
    } catch {
      showToast('Camera access denied');
    }
  };

  const stopCoHosting = () => {
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
    if (videoTrack) {
      videoTrack.enabled = isCamOff;
      setIsCamOff(!isCamOff);
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
    const colors = ['#FF0000', '#FF2D55', '#E60026', '#DC143C', '#FF1744', '#CC0000'];
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
    spawnHeartAt(x, y, colorOverride ?? '#FF2D55', likerName, likerAvatar);
  }, [spawnHeartAt]);

  const spawnHeartAtSideSpectator = useCallback(() => {
    const layer = spectatorChatHeartsRef.current;
    if (!layer) return;
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    if (w <= 0 || h <= 0) return;
    const x = w * (0.58 + Math.random() * 0.35);
    const y = h * (0.2 + Math.random() * 0.55);
    spawnHeartAt(x, y, '#FF2D55', viewerName, viewerAvatar);
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

  // Fetch host / stream state from backend
  useEffect(() => {
    if (!effectiveStreamId) return;
    (async () => {
      try {
        const { data: json, error: streamsErr } = await request('/api/live/streams');
        if (streamsErr || !json) {
          setStreamIsLive(false);
          showToast('Stream is offline');
          return;
        }
        const streams = Array.isArray(json.streams) ? json.streams : [];
        const stream =
          streams.find((s: any) => s.stream_key === effectiveStreamId) ||
          streams.find((s: any) => s.room_id === effectiveStreamId);

        if (!stream) {
          setStreamIsLive(false);
          showToast('Stream is offline');
          return;
        }

        setStreamIsLive(true);
        if (stream.user_id) {
          const uid = String(stream.user_id);
          setHostUserId(uid);
          hostUserIdRef.current = uid;
          actualViewersRef.current.delete(uid);
          setViewerCount(stream.viewer_count || 0);
          syncMvpSlotsRef.current();

          // First guess: title from live stream or short id label
          const label = uid.slice(0, 8);
          const initialName = stream.title || label || 'Creator';
          setHostName(initialName);
          setHostAvatar('');

          // Try to match Live page exactly by loading creator profile
          // (same source as the creator page uses for display name / avatar).
          try {
            const { data: profileBody } = await request(`/api/profiles/${encodeURIComponent(uid)}`);
            if (profileBody) {
              const profile = profileBody?.profile || profileBody?.data || {};
              const profileName =
                (typeof profile.displayName === 'string' && profile.displayName.trim()) ||
                (typeof profile.username === 'string' && profile.username.trim()) ||
                initialName;
              const profileAvatar =
                (typeof profile.avatarUrl === 'string' && profile.avatarUrl.trim()) || '';
              setHostName(profileName);
              if (profileAvatar) setHostAvatar(profileAvatar);
            }
          } catch {
            // Non-fatal: keep initialName/empty avatar
          }
        }
      } catch {
        setStreamIsLive(false);
        showToast('Stream is offline');
      }
    })();
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
              track.attach(videoRef.current);
              mainVideoAttached = true;
              setHasStream(true);
            } else if (!mainVideoAttached) {
              track.attach(videoRef.current);
              mainVideoAttached = true;
              setHasStream(true);
            } else {
              const el = coHostVideoRefs.current.get(identity);
              if (el) track.attach(el);
            }
          }
        };

        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          onTrackSubscribed(track, publication, participant);
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
            if (publication.track && publication.isSubscribed && videoRef.current) {
              if (isHost) {
                publication.track.attach(videoRef.current);
                currentMainTrackRef.current = publication.track;
                mainVideoAttached = true;
                setHasStream(true);
              } else if (!mainVideoAttached) {
                publication.track.attach(videoRef.current);
                currentMainTrackRef.current = publication.track;
                mainVideoAttached = true;
                setHasStream(true);
              } else {
                const el = coHostVideoRefs.current.get(identity);
                if (el) publication.track.attach(el);
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

  // If we're still "connecting" after 18s, hint that host may not be publishing
  useEffect(() => {
    if (!streamIsLive || hasStream) return;
    const t = setTimeout(() => {
      showToast('Stream not loading? Make sure the host is live and try again.');
    }, 18000);
    return () => clearTimeout(t);
  }, [streamIsLive, hasStream]);

  // Load user profile (coins, level, XP)
  // Note: Without a database, we use persisted test coins and user data
  useEffect(() => {
    if (!user?.id) return;
    
    const persisted = getPersistedTestCoinsBalance(user.id);
    setCoinBalance(Math.max(0, persisted));
    setUserLevel(user.level || 1);
    setUserXP(0);
  }, [user?.id, user?.level]);

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

  // Refresh coins when gift panel opens - use max of local, DB and persisted so test coins stay
  useEffect(() => {
    if (showGiftPanel && user?.id) {
      api.profiles.get(user.id).then(({ data }) => {
          if (data?.coins != null) {
            const dbCoins = Number(data.coins);
            const persisted = getPersistedTestCoinsBalance(user.id);
            setCoinBalance(prev => Math.max(prev, dbCoins, persisted));
          }
        });
    }
  }, [showGiftPanel, user?.id]);

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

  // Viewer count: increment on join, decrement on leave + realtime updates
  useEffect(() => {
    if (!effectiveStreamId) return;

    // Viewer count from WebSocket/backend events.
    return () => {};
  }, [effectiveStreamId, navigate]);

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
    let roomStateReceived = false;
    let roomUsers: string[] = [];

    const handleRoomState = (data: any) => {
      if (!mounted) return;
      roomStateReceived = true;
      const viewers = data.viewers;
      const hid = hostUserIdRef.current;
      if (Array.isArray(viewers)) {
        actualViewersRef.current.clear();
        roomUsers = viewers.map((v: any) => v.user_id).filter(Boolean);
        hostFoundInRoom = false;
        let count = 0;
        for (const v of viewers) {
          if (v.user_id === hid || v.user_id === effectiveStreamId || v.is_host) {
            hostFoundInRoom = true;
          } else if (v.user_id && v.user_id !== user?.id) {
            actualViewersRef.current.set(v.user_id, {
              name: v.display_name || v.username || 'User',
              avatar: v.avatar_url || '',
              level: v.level || 1,
            });
            count++;
          }
        }
        setViewerCount(Math.max(count, viewers.length - 1));
        if (!hostFoundInRoom && !hid) {
          hostFoundInRoom = true;
        }
        syncMvpSlots();
      }
      if (typeof data.live_likes === 'number' && Number.isFinite(data.live_likes)) {
        setActiveLikes(Math.max(0, data.live_likes));
      }
    };

    const handleUserJoined = (data: any) => {
      if (!mounted) return;
      if (data.user_id === user?.id) return;
      if (data.user_id === hostUserIdRef.current || data.user_id === effectiveStreamId) {
        hostFoundInRoom = true;
        return;
      }
      if (data.user_id) {
        actualViewersRef.current.set(data.user_id, {
          name: data.display_name || data.username || 'User',
          avatar: data.avatar_url || '',
          level: typeof data.level === 'number' ? data.level : 1,
        });
      }
      const joinName = data.username || 'User';
      setMessages(prev => [...prev, {
        id: `join-${Date.now()}`,
        username: joinName,
        text: 'joined the stream',
        isSystem: true,
        level: typeof data.level === 'number' && Number.isFinite(data.level) ? data.level : 1,
        avatar: typeof data.avatar_url === 'string' ? data.avatar_url : '',
      }]);
      setViewerCount(prev => prev + 1);
      syncMvpSlots();
    };

    const handleUserLeft = (data: any) => {
      if (!mounted) return;
      if (data.user_id) actualViewersRef.current.delete(data.user_id);
      setViewerCount(prev => Math.max(0, prev - 1));
      syncMvpSlots();
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
      if (giftDef) {
        if (data.user_id !== user?.id) {
          const msg: LiveMessage = {
            id: `gift-ws-${Date.now()}-${Math.random()}`,
            username: typeof data.username === 'string' ? data.username : 'User',
            text: `sent ${giftDef.name}`,
            level: typeof data.level === 'number' && Number.isFinite(data.level) ? data.level : 1,
            avatar: typeof data.avatar === 'string' ? data.avatar : '',
            isGift: true,
          };
          setMessages(prev => [...prev, msg]);
        }
        // Match creator (LiveStream): only queue real video assets; prefer catalog path, else WS payload.
        if (data.user_id !== user?.id) {
          const isVideoFile = (value: string) => {
            const p = value.split('?')[0].toLowerCase();
            return p.endsWith('.mp4') || p.endsWith('.webm');
          };
          const incomingVideo = typeof data.video === 'string' ? data.video : '';
          const defVideo = typeof giftDef.video === 'string' ? giftDef.video : '';
          const pickedRawVideo =
            defVideo && isVideoFile(defVideo)
              ? defVideo
              : incomingVideo && isVideoFile(incomingVideo)
                ? incomingVideo
                : '';
          if (pickedRawVideo && pickedRawVideo.trim()) {
            const raw = pickedRawVideo;
            const videoUrl =
              raw.startsWith('http://') || raw.startsWith('https://')
                ? raw
                : resolveGiftAssetUrl(raw.startsWith('/') ? raw : `/${raw}`);
            setGiftQueue(prev => [...prev, { video: videoUrl }]);
          }
        }
      }
    };

    const handleStreamEnded = (data?: any) => {

      if (!mounted) return;
      setStreamEndedReceived(true);
      setStreamIsLive(false);
      websocket.disconnect();
      setTimeout(() => { if (mounted) navigate('/feed', { replace: true }); }, 2000);
    };

    const handleBattleStateSync = (data: any) => {
      if (!mounted) return;
      const toScore = (value: unknown, fallback = 0) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
      };
      if (data.status === 'ENDED') {
        setBattleStreamIds(null);
      } else {
        setBattleStreamIds({
          hostRoomId: typeof data.hostRoomId === 'string' ? data.hostRoomId : '',
          hostUserId: typeof data.hostUserId === 'string' ? data.hostUserId : '',
          opponentRoomId: typeof data.opponentRoomId === 'string' ? data.opponentRoomId : '',
          opponentUserId: typeof data.opponentUserId === 'string' ? data.opponentUserId : '',
        });
      }
      if (data.status === 'ACTIVE' || data.status === 'active' || data.status === 'IN_BATTLE') {
        const labels = battleTeamLabelsFromPayload(data);
        setSpectatorBattle(prev => ({
          active: true,
          hostScore: toScore(data.hostScore ?? data.host_score, prev?.hostScore ?? 0),
          opponentScore: toScore(data.opponentScore ?? data.opponent_score, prev?.opponentScore ?? 0),
          player3Score: toScore(data.player3Score ?? data.player3_score, prev?.player3Score ?? 0),
          player4Score: toScore(data.player4Score ?? data.player4_score, prev?.player4Score ?? 0),
          timeLeft: toScore(data.timeLeft, prev?.timeLeft ?? 300),
          opponentName: data.opponentName || data.opponent_name || prev?.opponentName,
          opponentRoomId: data.opponentRoomId || prev?.opponentRoomId,
          redTeamLabel: labels.red,
          blueTeamLabel: labels.blue,
        }));
      } else if (data.status === 'ENDED') {
        setSpectatorBattle(prev => prev ? { ...prev, active: false } : null);
        setTimeout(() => setSpectatorBattle(null), 5000);
      } else if (data.status === 'WAITING') {
        setSpectatorBattle(prev => ({
          active: false,
          hostScore: 0,
          opponentScore: 0,
          player3Score: 0,
          player4Score: 0,
          timeLeft: toScore(data.timeLeft, 300),
          opponentName: data.opponentName || prev?.opponentName,
          opponentRoomId: data.opponentRoomId || prev?.opponentRoomId,
          redTeamLabel: '',
          blueTeamLabel: '',
        }));
      }
    };

    const handleBattleScore = (data: any) => {
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
      setSpectatorBattle(prev => {
        const newH = toScore(data.hostScore, prev?.hostScore ?? 0);
        const newO = toScore(data.opponentScore, prev?.opponentScore ?? 0);
        const newP3 = toScore(data.player3Score ?? data.player3_score, prev?.player3Score ?? 0);
        const newP4 = toScore(data.player4Score ?? data.player4_score, prev?.player4Score ?? 0);
        const newOppName = (typeof data.opponentName === 'string' && data.opponentName) || prev?.opponentName;
        const newOppRoom = (typeof data.opponentRoomId === 'string' && data.opponentRoomId) || prev?.opponentRoomId;
        if (prev?.active && newH === prev.hostScore && newO === prev.opponentScore &&
            newP3 === (prev.player3Score ?? 0) && newP4 === (prev.player4Score ?? 0) &&
            newOppName === prev.opponentName && newOppRoom === prev.opponentRoomId &&
            labels.red === prev.redTeamLabel && labels.blue === prev.blueTeamLabel) {
          return prev;
        }
        return {
          active: prev?.active ?? true,
          timeLeft: prev?.timeLeft ?? 300,
          hostScore: newH,
          opponentScore: newO,
          player3Score: newP3,
          player4Score: newP4,
          opponentName: newOppName,
          opponentRoomId: newOppRoom,
          winner: prev?.winner,
          redTeamLabel: labels.red,
          blueTeamLabel: labels.blue,
        };
      });
    };

    const handleBattleEnded = (data: any) => {
      if (!mounted) return;
      const toScore = (value: unknown, fallback = 0) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
      };
      setSpectatorBattle(prev => {
        if (!prev) return null;
        const h = toScore(data.hostScore ?? data.host_score, prev.hostScore);
        const o = toScore(data.opponentScore ?? data.opponent_score, prev.opponentScore);
        const p3 = toScore(data.player3Score ?? data.player3_score, prev.player3Score ?? 0);
        const p4 = toScore(data.player4Score ?? data.player4_score, prev.player4Score ?? 0);
        const teamA = h + p3;
        const teamB = o + p4;
        const winner =
          (typeof data.winner === 'string' && data.winner) ||
          (teamA > teamB ? 'host' : teamA < teamB ? 'opponent' : 'draw');
        const labels = battleTeamLabelsFromPayload(data);
        return {
          ...prev,
          active: false,
          hostScore: h,
          opponentScore: o,
          player3Score: p3,
          player4Score: p4,
          winner,
          redTeamLabel: labels.red,
          blueTeamLabel: labels.blue,
        };
      });
      setTimeout(() => setSpectatorBattle(null), 5000);
    };

    const handleHeartSent = (data: any) => {
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
    const handleCohostLayoutSync = (data: any) => {
      if (!mounted) return;
      const list = Array.isArray(data.coHosts) ? data.coHosts : [];
      setSpectatorCoHosts(list.map((h: any) => ({
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

    const handleCohostRequestAccepted = (data: any) => {
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

    const handleCohostInvite = (data: any) => {
      if (!mounted) return;
      setPendingCoHostInvite({
        notifId: '',
        hostName: data.hostName || 'Creator',
        hostAvatar: data.hostAvatar || '',
        streamKey: data.streamKey || '',
        hostUserId: data.hostUserId || '',
      });
      setShowCoHostPanel(true);
    };

    websocket.on('room_state', handleRoomState);
    websocket.on('user_joined', handleUserJoined);
    websocket.on('user_left', handleUserLeft);
    websocket.on('chat_message', handleChatMessage);
    websocket.on('gift_sent', handleGiftSent);
    websocket.on('heart_sent', handleHeartSent);
    websocket.on('stream_ended', handleStreamEnded);
    const handleBattleScoreUpdateColon = (data: any) => {
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
    websocket.on('battle_state_sync', handleBattleStateSync);
    websocket.on('battle_score', handleBattleScore);
    websocket.on('battle:score_update', handleBattleScoreUpdateColon);
    websocket.on('battle_ended', handleBattleEnded);
    websocket.on('cohost_layout_sync', handleCohostLayoutSync);
    websocket.on('cohost_request_accepted', handleCohostRequestAccepted);
    websocket.on('cohost_request_declined', handleCohostRequestDeclined);
    websocket.on('cohost_invite', handleCohostInvite);

    connect();

    const goOffline = async (reason: string) => {
      if (!mounted) return;
      try {
        const { data: goOfflineJson } = await request('/api/live/streams');
        if (goOfflineJson) {
          const streams = Array.isArray(goOfflineJson.streams) ? goOfflineJson.streams : [];
          const stillLive = streams.some((s: any) => (s.stream_key === effectiveStreamId || s.room_id === effectiveStreamId));
          if (stillLive) return;
        }
      } catch {}
      if (!mounted) return;
      showToast('Stream is offline');
      setStreamIsLive(false);
      websocket.disconnect();
      setTimeout(() => { if (mounted) navigate('/feed', { replace: true }); }, 2000);
    };

    const connectTimeout = setTimeout(() => {
      if (!mounted) return;
      const hid = hostUserIdRef.current;
      if (roomStateReceived && hid && !roomUsers.includes(hid)) {
        hostFoundInRoom = false;
      }
      if (!hostFoundInRoom) goOffline('host_not_found_after_connect_timeout');
    }, 15000);

    const videoTimeout = setTimeout(() => {
      if (!mounted) return;
      const vid = document.querySelector('video');
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
      websocket.disconnect();
    };
  }, [effectiveStreamId, user?.id, streamIsLive, syncMvpSlots, spawnHeartAt]);

  // Share panel contacts: all platform users (same list as live share / ShareModal).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchAllSharePanelContacts(user?.id);
      const mapped = rows.map((r) => ({
        id: r.user_id,
        name: r.username,
        avatar: r.avatar_url || '',
      }));
      if (!cancelled) setShareContacts(mapped);
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
    };
    setMessages(prev => [...prev, newMsg]);
    websocket.send('chat_message', {
      text: inputValue,
      level: userLevel,
      avatar: viewerAvatar,
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
    if (coinBalance < gift.coins) {
      showToast(`Not enough coins (have ${coinBalance.toLocaleString()}, need ${gift.coins.toLocaleString()})`);
      // In local/dev builds, still preview the gift animation so video gifts can play even without balance.
      let queuedPreview = false;
      if (
        import.meta.env.MODE !== 'production' &&
        gift.video &&
        gift.video.trim() &&
        isGiftVideoFile(gift.video)
      ) {
        const raw = gift.video;
        const videoUrl =
          raw.startsWith('http://') || raw.startsWith('https://')
            ? raw
            : resolveGiftAssetUrl(raw.startsWith('/') ? raw : `/${raw}`);
        setGiftQueue(prev => [...prev, { video: videoUrl }]);
        queuedPreview = true;
      }
      // Ensure the preview is visible instead of hidden behind the gift panel.
      if (queuedPreview) {
        setShowGiftPanel(false);
      }
      return;
    }
    if (!websocket.isConnected()) {
      showToast('Connecting... try again in a moment');
      return;
    }

    const prevBalance = coinBalance;
    const afterDeduct = Math.max(0, coinBalance - gift.coins);
    setCoinBalance(afterDeduct);
    persistTestCoinsBalance(user?.id, afterDeduct);

    let newLevel = userLevel;

    // Calculate XP and level up
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

    setShowGiftPanel(false);

    if (gift.video && gift.video.trim() && isGiftVideoFile(gift.video)) {
      const raw = gift.video;
      const videoUrl =
        raw.startsWith('http://') || raw.startsWith('https://')
          ? raw
          : resolveGiftAssetUrl(raw.startsWith('/') ? raw : `/${raw}`);
      setGiftQueue(prev => [...prev, { video: videoUrl }]);
    }

    const giftMsg: LiveMessage = {
      id: Date.now().toString(),
      username: viewerName,
      text: `Sent a ${gift.name}`,
      isGift: true,
      level: newLevel,
      avatar: viewerAvatar,
    };
    setMessages(prev => [...prev, giftMsg]);
    websocket.send('gift_sent', {
      giftId: gift.id,
      giftName: gift.name,
      coins: gift.coins,
      gift_icon: gift.icon || '🎁',
      quantity: 1,
      level: newLevel,
      avatar: viewerAvatar,
      video: gift.video || null,
      transactionId: `${user?.id || 'anon'}-${Date.now()}`,
      creator_name: hostName || 'Creator',
      host_user_id: hostUserId || effectiveStreamId,
      ...(spectatorBattle?.active
        ? { battleTarget: spectatorGiftBattleTarget }
        : {}),
    });
    

    setLastSentGift(gift);
    if (opts?.fromCombo) {
      setComboCount((prev) => Math.min(prev + 1, GIFT_COMBO_MAX));
    } else {
      setComboCount(1);
    }
    setShowComboButton(true);
    resetComboTimer();
  };

  const handleComboClick = () => {
    if (!lastSentGift) return;
    if (comboCount >= GIFT_COMBO_MAX) return;
    void handleSendGift(lastSentGift, { fromCombo: true });
  };

  if (streamIsLive === null) {
    return (
      <div className="fixed inset-0 bg-[#0A0B0E] flex justify-center">
        <div className="relative w-full max-w-[480px] h-full bg-[#13151A] flex flex-col items-center justify-center gap-4 p-6">
          <div className="w-10 h-10 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Checking stream...</p>
        </div>
      </div>
    );
  }

  if (streamIsLive === false) {
    return (
      <div className="fixed inset-0 bg-[#0A0B0E] flex justify-center">
        <div className="relative w-full max-w-[480px] h-full bg-[#13151A] flex flex-col items-center justify-center gap-4 p-6">
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
                className="px-6 py-2.5 rounded-lg bg-[#C9A96E]/20 border border-[#C9A96E]/50 text-[#C9A96E] font-semibold"
              >
                Retry connection
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/feed', { replace: true })}
              className="px-6 py-2.5 rounded-lg bg-[#C9A96E] text-black font-semibold"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex justify-center">
      <div className="relative w-full max-w-[480px] h-full overflow-hidden flex flex-col">

        {/* Video container: fixed between top creator bar and bottom spectator bar; black background behind the live video. */}
        {/* Video container */}
        {(() => {
          const myUserId = user?.id || '';
          const hostId = hostUserIdRef.current || hostUserId || effectiveStreamId;
          const externalCoHosts = spectatorCoHosts.filter(h => h.userId !== hostId);
          const showGrid = isCoHosting || externalCoHosts.length > 0;

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
            return (
              <div
                className="absolute inset-0 z-[80] flex flex-col"
                style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 90px)' }}
              >
                <div className="relative z-20 w-full flex-none bg-[#13151A]/95 border-b border-white/10">
                  <div className="relative w-full overflow-hidden" style={{ minHeight: showPkBreakdown ? '20px' : '16px' }}>
                    <div className="absolute inset-0 flex">
                      <div
                        className="h-full transition-[width] duration-[1200ms] ease-out motion-reduce:transition-none"
                        style={{ width: `${leftPct}%`, backgroundImage: 'linear-gradient(90deg, #DC143C, #FF1744, #C41E3A)' }}
                      />
                      <div className="h-full flex-1 min-w-0" style={{ backgroundImage: 'linear-gradient(90deg, #1E90FF, #4169E1, #0047AB)' }} />
                    </div>
                    <div className="relative z-10 flex h-full min-h-[16px] items-center justify-between gap-1.5 px-2 pointer-events-none leading-none">
                      <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-0">
                        <AnimatedScore value={typeof redTeamScore === 'number' && Number.isFinite(redTeamScore) ? redTeamScore : 0} durationMs={0} format={formatBattleScoreShort} className="text-white font-black text-[11px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" />
                        {showPkBreakdown && (
                          <span className="text-[5px] text-white/80 tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                            P1 {hS} + P3 {p3s}
                          </span>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col items-end justify-center gap-0">
                        <AnimatedScore value={typeof blueTeamScore === 'number' && Number.isFinite(blueTeamScore) ? blueTeamScore : 0} durationMs={0} format={formatBattleScoreShort} className="text-white font-black text-[11px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]" />
                        {showPkBreakdown && (
                          <span className="text-[5px] text-white/80 tabular-nums leading-none text-right drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                            P2 {oS} + P4 {p4s}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Battle grid — videos + tap overlay (2-way or 4-way PK); one +5 vote per spectator per battle */}
                <div className="relative w-full flex-none flex flex-col h-[44dvh]">
                  <div className="flex-1 min-h-0 flex flex-col relative">
                    <div className="absolute inset-0 flex flex-row">
                      <div className="w-1/2 h-full overflow-hidden relative bg-[#13151A] border-r border-white/5">
                        <video
                          ref={videoRef}
                          className="absolute inset-0 w-full h-full object-cover"
                          playsInline
                          autoPlay
                          style={{ opacity: hasStream ? 1 : 0, transition: 'opacity 0.4s ease' }}
                        />
                        {!hasStream && (
                          <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 bg-[#13151A]">
                            {hostAvatar ? (
                              <img src={hostAvatar} alt="" className="w-16 h-16 rounded-full border-2 border-[#C9A96E] object-cover object-center" />
                            ) : (
                              <div className="w-16 h-16 rounded-full border-2 border-[#C9A96E] bg-[#1C1E24] flex items-center justify-center">
                                <span className="text-2xl font-black text-[#C9A96E]">{(hostName || 'H').charAt(0).toUpperCase()}</span>
                              </div>
                            )}
                            <span className="text-white text-xs font-bold">{hostName}</span>
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                              <span className="text-green-400 text-[10px] font-bold">Connecting...</span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div
                        className="w-1/2 h-full overflow-hidden relative bg-[#13151A] cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); openOpponentPanel(); }}
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
                          <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 bg-[#13151A]">
                            {spectatorBattle.opponentName ? (
                              <div className="w-16 h-16 rounded-full border-2 border-[#C9A96E] bg-[#1C1E24] flex items-center justify-center">
                                <span className="text-2xl font-black text-[#C9A96E]">{spectatorBattle.opponentName.charAt(0).toUpperCase()}</span>
                              </div>
                            ) : (
                              <div className="w-16 h-16 rounded-full border-2 border-[#C9A96E] bg-[#1C1E24] flex items-center justify-center">
                                <span className="text-2xl font-black text-[#C9A96E]">O</span>
                              </div>
                            )}
                            <span className="text-white text-xs font-bold truncate max-w-[90%]">{spectatorBattle.opponentName || 'Opponent'}</span>
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                              <span className="text-green-400 text-[10px] font-bold">Connecting...</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {spectatorBattle.winner && (
                      <div className="absolute inset-0 z-[8] pointer-events-none flex flex-row">
                        <div className="w-1/2 h-full flex items-center justify-center">
                          <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${spectatorBattle.winner === 'host' ? 'text-white' : spectatorBattle.winner === 'draw' ? 'text-white' : 'text-red-400'}`}>
                            {spectatorBattle.winner === 'host' ? 'WIN' : spectatorBattle.winner === 'draw' ? 'DRAW' : 'LOSS'}
                          </span>
                        </div>
                        <div className="w-1/2 h-full flex items-center justify-center">
                          <span className={`text-sm font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${spectatorBattle.winner === 'opponent' ? 'text-white' : spectatorBattle.winner === 'draw' ? 'text-white' : 'text-red-400'}`}>
                            {spectatorBattle.winner === 'opponent' ? 'WIN' : spectatorBattle.winner === 'draw' ? 'DRAW' : 'LOSS'}
                          </span>
                        </div>
                      </div>
                    )}
                    {spectatorBattle.opponentRoomId && (
                      <button
                        type="button"
                        className="absolute top-1 right-1 z-30 flex items-center justify-center rounded-full bg-black/50 p-1.5 border border-white/15 pointer-events-auto active:scale-95"
                        title="Watch opponent stream"
                        onClick={(e) => {
                          e.stopPropagation();
                          openOpponentPanel();
                        }}
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-white/90" strokeWidth={2} />
                      </button>
                    )}
                    <div className="absolute inset-0 z-10 flex flex-row touch-manipulation">
                      {showPkBreakdown ? (
                        <>
                          <div className="w-1/2 h-full flex flex-col min-h-0">
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
                          <div className="w-1/2 h-full flex flex-col min-h-0">
                            <button
                              type="button"
                              className="flex-1 min-h-0 w-full touch-manipulation cursor-pointer border-0 bg-transparent p-0 active:bg-white/5"
                              aria-label="Vote blue team P2"
                              onClick={() => { handleSpectatorVote('opponent'); openOpponentPanel(); }}
                            />
                            <button
                              type="button"
                              className="flex-1 min-h-0 w-full touch-manipulation cursor-pointer border-0 bg-transparent p-0 active:bg-white/5 border-t border-white/10"
                              aria-label="Vote blue team P4"
                              onClick={() => { handleSpectatorVote('player4'); openOpponentPanel(); }}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="w-1/2 h-full touch-manipulation cursor-pointer border-0 bg-transparent p-0 active:bg-white/5"
                            aria-label="Vote red team"
                            onClick={() => handleSpectatorVote('host')}
                          />
                          <button
                            type="button"
                            className="w-1/2 h-full touch-manipulation cursor-pointer border-0 bg-transparent p-0 active:bg-white/5"
                            aria-label="Vote blue team"
                            onClick={() => { handleSpectatorVote('opponent'); openOpponentPanel(); }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="w-full px-3 py-1.5 flex items-center justify-between flex-none z-30" style={{ transform: 'translateY(1mm)' }}>
                  <div
                    className="flex items-center gap-[0mm] min-w-0 flex-1 justify-start pointer-events-auto"
                    style={{ transform: 'translateX(-3mm)' }}
                    onClick={() => setShowViewersPanel(true)}
                  >
                    {[0, 1, 2].map((i) => {
                      const slot = mvpSlots.host[i];
                      return (
                        <div
                          key={`mvp-l-${i}`}
                          className="relative flex flex-col items-center"
                          style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '-2mm' }}
                        >
                          <GoldProfileFrame size={SPECTATOR_BATTLE_PROFILE_RING_PX}>
                            {slot ? (
                              <img src={resolveCircleAvatar(slot.avatar, slot.name)} alt="" className="h-full w-full rounded-full object-cover object-center" />
                            ) : (
                              <Plus className="text-[#C9A96E]" size={10} strokeWidth={2.5} />
                            )}
                          </GoldProfileFrame>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="flex items-center gap-[0mm] min-w-0 flex-1 justify-end pointer-events-auto"
                    style={{ transform: 'translateX(3mm)' }}
                    onClick={() => setShowViewersPanel(true)}
                  >
                    {[0, 1, 2].map((i) => {
                      const slot = mvpSlots.opponent[i];
                      return (
                        <div
                          key={`mvp-r-${i}`}
                          className="relative flex flex-col items-center"
                          style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '-2mm' }}
                        >
                          <GoldProfileFrame size={SPECTATOR_BATTLE_PROFILE_RING_PX}>
                            {slot ? (
                              <img src={resolveCircleAvatar(slot.avatar, slot.name)} alt="" className="h-full w-full rounded-full object-cover object-center" />
                            ) : (
                              <Plus className="text-[#C9A96E]" size={10} strokeWidth={2.5} />
                            )}
                          </GoldProfileFrame>
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
                      className="absolute left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-[456px] bg-[#1C1E24] rounded-2xl overflow-hidden shadow-xl border border-white/10 animate-[slideInFromBottom_0.2s_ease-out]"
                      style={{ bottom: 'calc(70px + max(8px, env(safe-area-inset-bottom)))' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-3.5 py-3 flex items-center gap-3">
                        {(opponentProfile?.avatarUrl) ? (
                          <img src={opponentProfile.avatarUrl} alt="" className="w-10 h-10 rounded-full border-[1.5px] border-[#C9A96E] object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full border-[1.5px] border-[#C9A96E] bg-[#13151A] flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-black text-[#C9A96E]">
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
                                  <><span>·</span><span className="font-bold text-[#C9A96E]">Lv.{opponentProfile.level}</span></>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            type="button"
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#C9A96E] active:scale-95 transition-transform"
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
                              className="flex items-center px-3 py-2 rounded-full border border-[#C9A96E]/40 active:scale-95 transition-transform"
                              onClick={(e) => {
                                e.stopPropagation();
                                const uid = battleStreamIds.opponentUserId;
                                setShowOpponentPanel(false);
                                navigate(`/profile/${uid}`);
                              }}
                            >
                              <span className="text-[#C9A96E] font-bold text-[11px]">Profile</span>
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
                  <video
                    ref={myVideoRef}
                    className="absolute inset-0 w-full h-full object-cover rounded-sm"
                    autoPlay playsInline muted
                    style={isCamOff ? { display: 'none' } : undefined}
                  />
                  {isCamOff && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#13151A] z-[6] rounded-sm">
                      <CameraOff size={24} className="text-white/30" />
                      <span className="text-white/60 text-[9px] font-bold">Camera off</span>
                    </div>
                  )}
                  <div className="absolute top-0.5 right-0.5 z-10 flex items-center gap-0.5 pointer-events-auto">
                    <button type="button" onClick={toggleMic} className="p-1" title={isMicMuted ? 'Unmute' : 'Mute'}>
                      {isMicMuted ? <MicOff className="text-red-400 w-3.5 h-3.5" strokeWidth={2.5} /> : <Mic className="text-green-400 w-3.5 h-3.5" strokeWidth={2.5} />}
                    </button>
                    <button type="button" onClick={toggleCam} className="p-1" title={isCamOff ? 'Camera on' : 'Camera off'}>
                      {isCamOff ? <CameraOff className="text-red-400 w-3.5 h-3.5" strokeWidth={2.5} /> : <Camera className="text-green-400 w-3.5 h-3.5" strokeWidth={2.5} />}
                    </button>
                  </div>
                  <p className="absolute bottom-0.5 left-0.5 z-10 text-white/80 text-[8px] font-bold bg-black/50 rounded px-1">You</p>
                </>
              );
            }
            if (slot.type === 'live' && slot.host) {
              const h = slot.host;
              return (
                <>
                  <video
                    ref={(el) => { if (el) coHostVideoRefs.current.set(h.userId, el); else coHostVideoRefs.current.delete(h.userId); }}
                    className="absolute inset-0 w-full h-full object-cover rounded-sm"
                    autoPlay playsInline
                  />
                  <p className="absolute bottom-0.5 left-0.5 z-10 text-white/80 text-[8px] font-bold bg-black/50 rounded px-1 truncate max-w-[90%]">{h.name}</p>
                </>
              );
            }
            if (slot.type === 'invited' && slot.host) {
              return (
                <>
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#C9A96E]/40 bg-[#1C1E24]">
                    {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover opacity-60" /> : <div className="w-full h-full flex items-center justify-center text-[#C9A96E]/60 text-base font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                  </div>
                  <p className="text-white/60 text-[9px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                  <span className="text-[#C9A96E]/70 text-[8px] font-semibold">Invited</span>
                </>
              );
            }
            if (slot.type === 'pending' && slot.host) {
              return (
                <>
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#C9A96E] bg-[#1C1E24]">
                    {slot.host.avatar ? <img src={slot.host.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[#C9A96E] text-sm font-bold">{(slot.host.name || '?').charAt(0)}</div>}
                  </div>
                  <p className="text-white text-[8px] font-bold mt-0.5 truncate max-w-[95%] text-center">{slot.host.name}</p>
                  <span className="text-[#C9A96E]/70 text-[8px] font-semibold">Pending</span>
                </>
              );
            }
            return (
              <div className="flex flex-col items-center justify-center w-full h-full">
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                  <span className="text-white/30 text-2xl font-light">+</span>
                </div>
                <p className="text-white/30 text-[9px] font-semibold mt-0.5">Invite</p>
              </div>
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
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover rounded-none"
                  playsInline
                  autoPlay
                  style={{ opacity: hasStream ? 1 : 0, transition: 'opacity 0.4s ease' }}
                />
                {!hasStream && (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4" style={{ transform: 'translateX(15mm)' }}>
                    <div className="w-24 h-24 rounded-full border-[3px] border-red-500/40 overflow-hidden">
                      {hostAvatar ? (
                        <img src={hostAvatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[#C9A96E]/20 flex items-center justify-center">
                          <span className="text-[#C9A96E] font-bold text-3xl">{hostName.slice(0, 1).toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                    {!user?.id ? (
                      <>
                        <span className="text-white/80 text-sm text-center">Log in to watch the live stream</span>
                        <button
                          type="button"
                          onClick={() => navigate('/login', { state: { from: `/watch/${effectiveStreamId}` } })}
                          className="mt-2 px-5 py-2.5 rounded-lg bg-[#C9A96E] text-black font-semibold text-sm"
                        >
                          Log in
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
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
                            className="mt-2 px-5 py-2 rounded-lg bg-[#C9A96E]/20 border border-[#C9A96E]/40 text-[#C9A96E] text-sm font-medium"
                          >
                            Tap to retry
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Right: 8-slot co-host grid — same as creator */}
              {showGrid && (
                <div className="w-1/2 h-full grid grid-cols-2 grid-rows-4 gap-[1px] bg-[#1a1c22]">
                  {slots.slice(0, 8).map((slot, i) => (
                    <div key={i} className="relative bg-[#13151A] flex flex-col items-center justify-center p-1">
                      {renderSlot(slot)}
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          );
        })()}

        {/* Battle VS timer — fixed overlay (score bar, videos, MVPs are in the unified battle container above) */}
        {spectatorBattle?.active && (
          <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none flex justify-center max-w-[480px] mx-auto py-1.5 px-2 bg-gradient-to-b from-black/50 to-transparent" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4cm - 10.5mm)' }}>
            <div className="flex items-center gap-1 bg-black/40 backdrop-blur-md rounded-full px-2 py-0.5 border border-white/10 shadow-sm">
              <div className="relative w-[16px] h-[16px] flex items-center justify-center">
                <svg viewBox="0 0 40 44" className="absolute inset-0 w-full h-full drop-shadow-md">
                  <path d="M20 2 L36 10 L36 26 Q36 38 20 42 Q4 38 4 26 L4 10 Z" fill="url(#vsGradSpectator)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
                  <defs><linearGradient id="vsGradSpectator" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#DC143C"/><stop offset="50%" stopColor="#8B0000"/><stop offset="100%" stopColor="#1E90FF"/></linearGradient></defs>
                </svg>
                <span className="relative z-10 text-white text-[5px] font-black italic drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">VS</span>
              </div>
              <span className="text-white text-[10px] font-black tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                {formatTime(spectatorBattle.timeLeft)}
              </span>
            </div>
          </div>
        )}

        {/* CREATOR TOP BAR — only connection to creator page: spectator has access to full creator top bar (avatar, name, likes, Follow, Weekly Ranking, Membership, viewer count, close). Rest is single video + spectator's own bottom bar. */}
        <div className="absolute top-0 left-0 right-0 z-[110] pointer-events-none">
          <div className="px-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2px)' }}>
            <div className="flex items-center justify-between gap-2 relative">
              {/* Left: Creator info — full creator top bar */}
              <div
                className="pointer-events-auto flex items-center gap-0 -ml-1 flex-shrink min-w-0"
                style={{ transform: 'translateY(-2mm)' }}
              >
                <div
                  className="relative z-10 flex-shrink-0 cursor-pointer active:scale-95 transition-transform"
                  onClick={() => navigate(`/profile/${hostUserId}`)}
                >
                  <AvatarRing src={hostAvatar} alt={hostName} size={LIVE_TOP_AVATAR_RING_PX} />
                </div>
                <div
                  className={`${CREATOR_NAME_PILL_CLASSNAME} cursor-pointer`}
                  style={getCreatorNamePillStyle()}
                  onClick={() => navigate(`/profile/${hostUserId}`)}
                >
                  <span className="text-white text-[11px] font-bold truncate max-w-[100px] leading-tight">{hostName}</span>
                  <button
                    type="button"
                    className="flex items-center gap-0.5 pointer-events-auto -mt-0.5"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handleLikeTap(e);
                    }}
                  >
                    <Heart className="w-2 h-2 text-[#FF2D55]" strokeWidth={2.5} fill="#FF2D55" />
                    <span className="text-white/70 text-[8px] font-bold tabular-nums">{(typeof activeLikes === 'number' && Number.isFinite(activeLikes) ? activeLikes : 0).toLocaleString()}</span>
                  </button>
                  {/* Follow / Join — matches creator top bar exactly */}
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center pointer-events-auto">
                    {/* Join Button (Bottom layer) — visible after following */}
                    <button
                      type="button"
                      className={`col-start-1 row-start-1 flex items-center justify-center gap-1 ${hasJoinedToday ? 'bg-[#FF4500] border-[#FF4500]' : 'bg-[#13151A] border-[#C9A96E]/40'} rounded-full px-1.5 py-0.5 shadow-sm border w-[58px] h-7 z-0 transition-colors duration-200`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!hasJoinedToday && user?.id && hostUserId) {
                          const token = useAuthStore.getState().session?.access_token;
                          if (!token) return;
                          setHasJoinedToday(true);
                          spawnHeartFromClient(e.clientX, e.clientY);
                          const newMessage: LiveMessage = {
                            id: Date.now().toString(),
                            username: viewerName,
                            text: '\u2764\ufe0f Joined the team!',
                            level: userLevel,
                            isGift: false,
                            avatar: viewerAvatar,
                            isSystem: true,
                            membershipIcon: '/icons/Membership.png'
                          };
                          setMessages(prev => [...prev, newMessage]);
                          try {
                            const { data: d } = await request('/api/hearts/daily', {
                              method: 'POST',
                              body: JSON.stringify({ creatorId: hostUserId }),
                            });
                            if (d) {
                              if (typeof d.todayCount === 'number') setDailyHeartCount(d.todayCount);
                              if (typeof d.totalCount === 'number') setMyHeartCount(d.totalCount);
                            }
                          } catch { /* non-fatal */ }
                        }
                      }}
                    >
                      <div className="relative">
                        <Heart
                          className={`w-3.5 h-3.5 ${hasJoinedToday ? 'text-white' : 'text-[#C9A96E]'}`}
                          strokeWidth={2.5}
                          fill={hasJoinedToday ? 'white' : '#C9A96E'}
                        />
                        {!hasJoinedToday && (
                          <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#C9A96E] rounded-full flex items-center justify-center border border-white">
                            <span className="text-white text-[6px] font-bold leading-none">+</span>
                          </div>
                        )}
                      </div>
                      <span className={`${hasJoinedToday ? 'text-white' : 'text-[#C9A96E]'} text-[10px] font-bold`}>Join</span>
                    </button>

                    {/* Follow Button (Top layer) — covers Join until user follows */}
                    {!isFollowing && (
                      <button
                        type="button"
                        className="col-start-1 row-start-1 z-20 relative flex items-center justify-center gap-1 bg-[#FF2D55] rounded-full px-1.5 py-0.5 shadow-sm border border-white/20 w-[58px] h-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          followHost(e);
                        }}
                      >
                        <Plus size={12} className="text-white" strokeWidth={3} />
                        <span className="text-white text-[10px] font-bold">Follow</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="pointer-events-auto flex items-center gap-[0mm] flex-shrink-0 min-w-0">
                <div
                  className="flex items-center gap-[0mm] pointer-events-auto flex-shrink-0"
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
                  {[0, 1, 2].map((i) => {
                    const slot = spectatorTopAvatars[i];
                    return (
                      <div
                        key={`spectator-top-mvp-${i}`}
                        style={{ zIndex: 3 - i, marginLeft: i === 0 ? '0mm' : '-2mm' }}
                        className="relative"
                      >
                        <GoldProfileFrame size={SPECTATOR_MVP_PROFILE_RING_PX}>
                          {slot ? (
                            <img
                              src={resolveCircleAvatar(slot.avatar, slot.name)}
                              alt={slot.name || ''}
                              className="h-full w-full rounded-full object-cover object-center"
                              style={{ transform: 'translateY(0.9mm)' }}
                            />
                          ) : (
                            <Plus className="text-[#C9A96E]" size={10} strokeWidth={2.5} />
                          )}
                        </GoldProfileFrame>
                      </div>
                    );
                  })}
                </div>
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
                >
                  <span className="text-white text-[11px] font-bold tabular-nums">
                    {typeof viewerCount === 'number' && Number.isFinite(viewerCount) ? viewerCount.toLocaleString() : String(viewerCount)}
                  </span>
                  <UserPlus size={16} className="text-[#C9A96E]" strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  title="Leave stream"
                  onClick={() => {
                    websocket.disconnect();
                    if (coHostStream) { coHostStream.getTracks().forEach(t => t.stop()); setCoHostStream(null); }
                    navigate('/feed', { replace: true });
                  }}
                  className="w-8 h-8 rounded-full bg-transparent border-0 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <img src="/Icons/Gold power buton.png" alt="Leave stream" className="w-5 h-5 object-contain" />
                </button>
              </div>
            </div>

            {/* Second row: Weekly Ranking + Membership — spectator sees same creator top bar */}
            <div
              className="flex items-center gap-2 mt-0.5 ml-9 pointer-events-auto relative z-20 flex-wrap"
              style={{ transform: 'translateY(-2mm)' }}
            >
              <div
                className="flex items-center gap-1 bg-[#13151A] rounded-full px-2 py-0.5 border border-[#C9A96E]/40 shadow-sm cursor-pointer active:scale-95 transition-transform"
                onClick={() => { setShowGiftPanel(false); setShowRankingPanel(true); }}
              >
                <Trophy className="w-3 h-3 text-[#C9A96E]" strokeWidth={2} />
                <span className="text-[#C9A96E] text-[10px] font-bold">Weekly Ranking</span>
                <span className="text-[#C9A96E]/70 text-[10px]">&gt;</span>
              </div>
              <div
                className="flex items-center gap-1 bg-[#13151A] rounded-full px-2 py-0.5 border border-[#C9A96E]/40 shadow-sm cursor-pointer active:scale-95 transition-transform"
                onClick={() => { setShowGiftPanel(false); setShowFanClub(true); }}
              >
                <Heart className="w-3 h-3 text-[#C9A96E]" strokeWidth={2} fill="#C9A96E" />
                <span className="text-[#C9A96E] text-[10px] font-bold">Membership</span>
              </div>
            </div>
          </div>
        </div>

        {/* CHAT — same pattern as LiveStream (!isBroadcast): scroll area tap sends like on empty space */}
        <div className="chat-zone fixed left-0 right-0 bottom-[calc(52px+max(8px,env(safe-area-inset-bottom)))] z-[100] flex justify-center pointer-events-none">
          <div className="w-full max-w-[480px] relative" style={{ height: 'calc(25dvh + 2cm + 4mm)', maxHeight: 'calc(25dvh + 2cm + 4mm)' }}>
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
                compact
                isModerator={isModerator}
                onLike={handleLikeTap}
                onProfileTap={() => {}}
              />
            </div>
          </div>
        </div>

        {/* COMBO BUTTON — above bottom buttons */}
        {showComboButton && lastSentGift && (
          <div className="fixed bottom-[calc(63px+max(12px,env(safe-area-inset-bottom)))] right-3 z-[121] pointer-events-auto max-w-[480px]">
            <button
              type="button"
              onClick={handleComboClick}
              disabled={comboCount >= GIFT_COMBO_MAX}
              className="w-16 h-14 rounded-full bg-gradient-to-r from-[#C9A96E] to-[#D4A017] flex flex-col items-center justify-center animate-pulse active:scale-90 transition-transform shadow-[0_0_20px_rgba(201,169,110,0.5)] border-2 border-white/30 disabled:opacity-50 disabled:animate-none"
            >
              <span className={`font-black italic text-white drop-shadow-md ${comboCount >= 1000 ? 'text-sm' : 'text-xl'}`}>
                x{comboCount >= 1000 ? `${(comboCount / 1000).toFixed(comboCount % 1000 === 0 ? 0 : 1)}K` : comboCount}
              </span>
              <span className="text-[9px] font-bold text-white uppercase tracking-widest">Combo</span>
            </button>
          </div>
        )}

        {/* Bottom bar — chat + Invite / Gift / Share / More (labels under icons, spectator) */}
        <div className="fixed left-0 right-0 bottom-0 z-[120] pointer-events-auto flex justify-center">
          <div className="w-full max-w-[480px] px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-0 bg-transparent">
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
                  <button type="submit" title="Send message" className="text-[#C9A96E] flex-shrink-0">
                    <Send size={16} />
                  </button>
                ) : null}
              </form>
              <button
                type="button"
                title={spectatorCoHostRequestSent ? 'Request sent' : 'Request to co-host'}
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
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0 disabled:opacity-60"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-[#13151A] backdrop-blur-md border border-[#C9A96E]/40 shadow-lg">
                  <span className="flex items-center justify-center w-full h-full relative z-[2]">
                    <UserPlus size={20} className="text-[#C9A96E] shrink-0" strokeWidth={2} />
                  </span>
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                </div>
                <span className="text-[10px] font-semibold text-[#C9A96E] mt-0.5">Invite</span>
              </button>
              <button
                type="button"
                title="Send gift"
                onClick={() => setShowGiftPanel(true)}
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-[#13151A] backdrop-blur-md border border-[#C9A96E]/40 shadow-lg">
                  <Gift size={20} className="text-[#C9A96E] relative z-[2]" />
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[1] scale-125 translate-y-0.5" />
                </div>
                <span className="text-[10px] font-semibold text-[#C9A96E] mt-0.5">Gift</span>
              </button>
              <button
                type="button"
                title="Share"
                onClick={() => setShowSharePanel(true)}
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-[#13151A] backdrop-blur-md border border-[#C9A96E]/40 shadow-lg">
                  <Share2 size={20} className="text-[#C9A96E] relative z-[2]" />
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[1] scale-125 translate-y-0.5" />
                </div>
                <span className="text-[10px] font-semibold text-[#C9A96E] mt-0.5">Share</span>
              </button>
              <button
                type="button"
                title="More options"
                onClick={() => setIsMoreMenuOpen(true)}
                className="flex flex-col items-center justify-center w-12 active:scale-95 transition-transform select-none flex-shrink-0"
              >
                <div className="relative w-10 h-10 flex items-center justify-center rounded-full bg-[#13151A] backdrop-blur-md border border-[#C9A96E]/40 shadow-lg">
                  <MoreVertical size={20} className="text-[#C9A96E] relative z-[2]" />
                  <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[1] scale-125 translate-y-0.5" />
                </div>
                <span className="text-[10px] font-semibold text-[#C9A96E] mt-0.5">More</span>
              </button>
            </div>
          </div>
        </div>

        {/* GIFT ANIMATION OVERLAY */}
        <GiftAnimationOverlay streamId={effectiveStreamId} />

        {/* GIFT VIDEO OVERLAY */}
        <GiftOverlay
          key={`gift-${giftKey}`}
          videoSrc={currentGift?.video ?? null}
          onEnded={handleGiftEnded}
          isBattleMode={!!spectatorBattle?.active}
          muted={false}
        />


        {/* ═══ CO-HOST PANEL — spectator Accept/Reject when creator invited, or Request to co-host. No layout control. */}
        {showCoHostPanel && (
          <>
            <div className="fixed inset-0 z-[99998] bg-black/40 pointer-events-auto" onClick={() => { setShowCoHostPanel(false); }} />
            <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
              <div className="bg-[#1C1E24]/95 backdrop-blur-md rounded-t-2xl h-[40vh] flex flex-col shadow-2xl border-t border-[#C9A96E]/20 overflow-hidden pb-safe" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-white/20 rounded-full" /></div>
                <div className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <Crown size={14} className="text-[#C9A96E]" strokeWidth={1.8} />
                    <span className="text-white font-bold text-[13px]">Co-Host</span>
                  </div>
                  <button type="button" title="Close" onClick={() => setShowCoHostPanel(false)} className="p-1 rounded-full active:bg-white/10">
                    <X size={18} className="text-white/70" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0 flex flex-col gap-4">
                  {pendingCoHostInvite ? (
                    <div className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg bg-white/[0.03] flex-shrink-0">
                      <div className="w-10 h-10 rounded-full border-2 border-[#C9A96E]/50 overflow-hidden bg-[#13151A] flex-shrink-0">
                        {pendingCoHostInvite.hostAvatar ? <img src={pendingCoHostInvite.hostAvatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[#C9A96E] font-bold">{pendingCoHostInvite.hostName.slice(0, 1).toUpperCase()}</div>}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-white text-xs font-semibold truncate">@{pendingCoHostInvite.hostName}</p>
                        <p className="text-white/40 text-[10px]">wants you to co-host</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => { setPendingCoHostInvite(null); setShowCoHostPanel(false); }} className="px-2 py-1 rounded-full bg-red-500/20 border border-red-500/30 flex items-center gap-0.5 active:scale-95 transition-transform cursor-pointer">
                          <span className="text-red-400 text-[9px] font-bold">Reject</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!pendingCoHostInvite || !user?.id) return;
                            const inv = pendingCoHostInvite;
                            setPendingCoHostInvite(null);
                            setShowCoHostPanel(false);
                            websocket.send('cohost_invite_accept', { hostUserId: inv.hostUserId, cohostName: user?.username || user?.name || 'User', cohostAvatar: user?.avatar || '', streamKey: inv.streamKey });
                            showToast(`Joining @${inv.hostName}'s live as co-host`);
                            if (inv.streamKey) {
                              navigate(`/watch/${inv.streamKey}?cohost=1`, {
                                replace: true,
                                state: { fromCohostInvite: true },
                              });
                            }
                          }}
                          className="px-2.5 py-1 rounded-full bg-green-500 flex items-center gap-0.5 active:scale-95 transition-transform cursor-pointer"
                        >
                          <span className="text-black text-[9px] font-bold">Join</span>
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
                        onClick={() => {
                          if (!user?.id || joinRequested) return;
                          const targetHostId = hostUserId || effectiveStreamId;
                          if (!targetHostId) return;
                          setJoinRequested(true);
                          // Spectator-initiated co-host request; creator must still Accept before co-hosting starts
                          websocket.send('cohost_request_send', { hostUserId: targetHostId, requesterName: user?.username || user?.name || 'User', requesterAvatar: user?.avatar || '' });
                          showToast('Co-host request sent!');
                        }}
                        className={`w-full py-3 rounded-xl font-bold text-sm ${joinRequested ? 'bg-white/10 text-white/40 cursor-not-allowed' : 'bg-[#C9A96E] text-black active:scale-95'}`}
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
                className="bg-[#1C1E24]/95 rounded-t-2xl p-3 pb-safe h-[40vh] overflow-y-auto no-scrollbar shadow-2xl w-full border-t border-[#C9A96E]/20"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col items-center justify-center pt-3 pb-1 gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#C9A96E] shadow-[0_0_6px_rgba(201,169,110,0.5)]" />
                  <div className="w-10 h-1 bg-white/20 rounded-full" />
                </div>
                <div className="flex items-center justify-between px-4 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Heart className="w-3 h-3 text-[#C9A96E]" strokeWidth={2} fill="#C9A96E" />
                    <span className="text-gold-metallic font-bold text-sm">Super Fan Goal</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
                  <div className="flex flex-col gap-3">
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
                    <div className="bg-white/5 rounded-xl p-3 border border-[#C9A96E]/20">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-gold-metallic font-bold text-[10px] flex items-center gap-1">
                          <div className="w-4 h-4 rounded-full bg-[#13151A] flex items-center justify-center border border-[#C9A96E]/40">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          </div>
                          Photo Stickers
                        </h3>
                        <span className="bg-[#C9A96E]/10 text-[#C9A96E] text-[7px] font-bold px-1.5 py-0.5 rounded-full border border-[#C9A96E]/20">SUBSCRIBER ONLY</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {['🔥', '💎', '👑', '🚀', '💯', '🎉', '💖', '👀'].map((emoji, i) => (
                          <button
                            key={i}
                            className="aspect-square rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center text-sm border border-[#C9A96E]/10 relative overflow-hidden group"
                            onClick={() => {
                              const newMessage: LiveMessage = {
                                id: Date.now().toString(),
                                username: 'You',
                                text: emoji,
                                level: userLevel,
                                isGift: false,
                                avatar: '/Icons/elix-logo.png',
                                isSystem: false,
                              };
                              setMessages(prev => [...prev, newMessage]);
                              setShowFanClub(false);
                            }}
                          >
                            <span className="group-hover:scale-110 transition-transform duration-200">{emoji}</span>
                            {!isSubscribing && (
                              <div className="absolute inset-0 bg-[#13151A]/60 backdrop-blur-[1px] flex items-center justify-center">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              </div>
                            )}
                          </button>
                        ))}
                        <button
                          className="aspect-square rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center border border-[#C9A96E]/10 relative overflow-hidden group"
                          onClick={() => {
                            if (!isSubscribing) return;
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
                                    avatar: '/Icons/elix-logo.png',
                                    isSystem: false,
                                  };
                                  setMessages(prev => [...prev, newMessage]);
                                  setShowFanClub(false);
                                };
                                reader.readAsDataURL(file);
                              }
                            };
                            input.click();
                          }}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <PlusCircle size={12} className="text-[#C9A96E]/50 group-hover:text-[#C9A96E] transition-colors" />
                            <span className="text-[6px] text-[#C9A96E]/50 font-bold uppercase">Upload</span>
                          </div>
                          {!isSubscribing && (
                            <div className="absolute inset-0 bg-[#13151A]/60 backdrop-blur-[1px] flex items-center justify-center">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            </div>
                          )}
                        </button>
                      </div>
                      <p className="text-white/30 text-[8px] text-center mt-1.5">Subscribe to unlock photo stickers and send them in chat!</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* GIFT PANEL — anchored to bottom, above all buttons */}
        {showGiftPanel && (
          <>
            <div
              className="fixed inset-0 bg-black/50 pointer-events-auto"
              style={{ zIndex: 200 }}
              onClick={() => setShowGiftPanel(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 pointer-events-auto max-w-[480px] mx-auto" style={{ zIndex: 201 }}>
              {spectatorBattle?.active && (
                <div className="px-3 pb-2 pt-1 flex items-center justify-center gap-2 bg-[#13151A]/95 border-t border-[#C9A96E]/20 rounded-t-xl">
                  <div className="flex rounded-full overflow-hidden border border-[#C9A96E]/40">
                    <button
                      type="button"
                      title="Gift left side"
                      onClick={() => setSpectatorGiftBattleTarget('host')}
                      className={`px-4 py-1.5 text-[10px] font-bold transition-colors ${spectatorGiftBattleTarget === 'host' ? 'bg-[#DC143C]/90 text-white' : 'bg-[#13151A] text-white/70'}`}
                    >
                      Left
                    </button>
                    <button
                      type="button"
                      title="Gift right side"
                      onClick={() => setSpectatorGiftBattleTarget('opponent')}
                      className={`px-4 py-1.5 text-[10px] font-bold transition-colors ${spectatorGiftBattleTarget === 'opponent' ? 'bg-[#1E90FF]/90 text-white' : 'bg-[#13151A] text-white/70'}`}
                    >
                      Right
                    </button>
                  </div>
                </div>
              )}
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

        {/* TOP VIEWERS PANEL */}
        {showViewersPanel && (
          <>
            <div
              className="fixed inset-0 bg-black/40 pointer-events-auto"
              style={{ zIndex: 99998 }}
              onClick={() => setShowViewersPanel(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-[999999] pointer-events-auto max-w-[480px] mx-auto">
              <div className="bg-[#1C1E24]/95 backdrop-blur-md rounded-t-2xl h-[40vh] flex flex-col shadow-2xl border-t border-[#C9A96E]/20 overflow-hidden">
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
                        <div className="w-10 h-10 rounded-full border-2 border-[#C9A96E]/30 overflow-hidden bg-[#13151A] flex-shrink-0">
                          {v.avatar ? (
                            <img src={v.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-[#C9A96E] font-bold text-sm">{v.name.slice(0, 1).toUpperCase()}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-white text-sm font-semibold truncate">{v.name}</p>
                          {v.level && <p className="text-white/40 text-[10px] font-medium">Level {v.level}</p>}
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
              <div className="bg-[#1C1E24]/95 rounded-t-2xl p-4 pb-safe flex flex-col gap-1 shadow-2xl w-full h-[40vh] overflow-y-auto overflow-x-hidden border-t border-[#C9A96E]/20">
                <div className="flex justify-center mb-2">
                  <div className="w-10 h-1 bg-white/20 rounded-full" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-white font-bold whitespace-nowrap">Share to</h3>
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
                <div className="w-full overflow-hidden shrink-0">
                  <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar items-center px-4">
                    <button type="button" onClick={() => { setShowSharePanel(false); navigate('/create'); }} className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform" style={{ width: 95, minWidth: 95 }}>
                      <div className="relative w-[85px] h-[85px] flex items-center justify-center">
                        <StoryGoldRingAvatar size={85} src={user?.avatar || '/Icons/Profile icon.png'} alt="Create" />
                        <Plus size={28} className="text-[#C9A96E] absolute" strokeWidth={2.5} />
                      </div>
                      <span className="text-white/80 text-[11px] font-medium">Create</span>
                    </button>
                    {shareContacts.filter(c => c.name.toLowerCase().includes(shareQuery.toLowerCase())).map((u) => (
                      <button
                        key={u.id}
                        className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform"
                        style={{ width: 95, minWidth: 95 }}
                        onClick={async () => {
                          setShowSharePanel(false);
                          if (!user?.id) {
                            showToast('Log in to share');
                            navigate('/login', { state: { from: location.pathname } });
                            return;
                          }
                          const hid = hostUserIdRef.current || hostUserId || effectiveStreamId;
                          try {
                            const { data: j, error: shareErr } = await request('/api/live-share', {
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
                        <StoryGoldRingAvatar size={85} src={u.avatar || '/Icons/Profile icon.png'} alt={u.name} />
                        <span className="text-white/80 text-[11px] font-medium truncate w-full text-center">{u.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-scroll overflow-x-hidden min-h-0 px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:bg-[#C9A96E]/60 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {/* Share creator's live: all links use /watch/{creatorStreamId} */}
                  <div className="grid grid-cols-5 gap-y-3 gap-x-1.5 pt-1">
                    {[
                      { name: 'WhatsApp', icon: <MessageCircle size={22} className="text-white" />, action: () => { window.open(`https://wa.me/?text=${encodeURIComponent('Watch this on Elix! ' + `${window.location.origin}/watch/${effectiveStreamId}`)}`); setShowSharePanel(false); } },
                      { name: 'Facebook', icon: <Share2 size={22} className="text-white" />, action: () => { window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}/watch/${effectiveStreamId}`)}`); setShowSharePanel(false); } },
                      { name: 'Copy Link', icon: <Copy size={22} className="text-white" />, action: () => { navigator.clipboard.writeText(`${window.location.origin}/watch/${effectiveStreamId}`); showToast('Link copied!'); setShowSharePanel(false); } },
                      { name: 'Promote', icon: <TrendingUp size={22} className="text-white" />, action: () => { setShowSharePanel(false); setShowPromotePanel(true); } },
                      { name: 'Report', icon: <Flag size={22} className="text-red-400" />, isRed: true, action: () => { setIsReportModalOpen(true); setShowSharePanel(false); } },
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
              <div className="bg-[#1C1E24]/95 rounded-t-2xl p-4 pb-safe shadow-2xl w-full">
                <div className="flex justify-center mb-3">
                  <div className="w-10 h-1 bg-white/20 rounded-full" />
                </div>
                <div className="flex flex-col gap-1">
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
                    className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors w-full"
                  >
                    <Coins size={18} className="text-[#C9A96E]" />
                    <span className="text-white text-sm font-medium">Test</span>
                  </button>
                  )}
                  <button
                    onClick={() => { setIsReportModalOpen(true); setIsMoreMenuOpen(false); }}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors w-full"
                  >
                    <Flag size={18} className="text-red-400" />
                    <span className="text-white text-sm font-medium">Report</span>
                  </button>
                  <button
                    onClick={() => { setShowSharePanel(true); setIsMoreMenuOpen(false); }}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors w-full"
                  >
                    <Share2 size={18} className="text-[#C9A96E]" />
                    <span className="text-white text-sm font-medium">Share</span>
                  </button>
                  <button
                    onClick={() => setIsMoreMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors w-full"
                  >
                    <X size={18} className="text-white/50" />
                    <span className="text-white text-sm font-medium">Cancel</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TEST COINS MODAL — hidden in store build */}
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
                      // In memory-only mode, coins are persisted locally
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
                      min={1}
                      max={100000000}
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
                          {amt.toLocaleString()}
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
                          // In memory-only mode, coins are persisted locally
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
