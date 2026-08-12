/**
 * Global live top banners:
 * - stream_started: creator you follow went live
 * - live_share: someone shared an active live with you in-app
 *
 * Uses the shared websocket singleton (App keeps `/live/__feed__` connected while
 * browsing). User-global `live_share` is delivered via sendToUserGlobal on any open socket.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { websocket } from '../lib/websocket';
import { StoryGoldRingAvatar } from './StoryGoldRingAvatar';
import {
  isGenericLiveCreatorName,
  liveNameFromStreamFields,
  profileToLiveDisplay,
} from '../lib/liveCreatorDisplay';
import { apiFetchProfileById } from '../features/feed/feedApi';
import { apiLiveStreams, apiLiveToken } from '../lib/live/liveApi';
import { showToast } from '../lib/toast';

interface StartedBanner {
  kind: 'started';
  room: string;
  name: string;
  avatar: string;
}

interface ShareBanner {
  kind: 'share';
  streamKey: string;
  sharerName: string;
  sharerAvatar: string;
  hostName: string;
  hostAvatar: string;
}

const SEEN_CAP = 80;
const STARTED_DISMISS_MS = 6000;
const SHARE_DISMISS_MS = 12000;

function parseSharePayload(data: unknown): ShareBanner | null {
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const streamKey = String(payload.streamKey ?? payload.stream_key ?? '').trim();
  if (!streamKey) return null;
  const sharerName = String(payload.sharerName ?? payload.sharer_name ?? 'Someone').trim() || 'Someone';
  const hostName = String(payload.hostName ?? payload.host_name ?? '').trim();
  return {
    kind: 'share',
    streamKey,
    sharerName,
    sharerAvatar: String(payload.sharerAvatar ?? payload.sharer_avatar ?? ''),
    hostName: hostName || 'a creator',
    hostAvatar: String(payload.hostAvatar ?? payload.host_avatar ?? ''),
  };
}

async function isStreamJoinable(streamKey: string): Promise<boolean> {
  const { streams, error } = await apiLiveStreams();
  if (!error) {
    const rows = (Array.isArray(streams) ? streams : []) as Array<{
      stream_key?: string;
      room_id?: string;
    }>;
    if (rows.some((s) => s.stream_key === streamKey || s.room_id === streamKey)) {
      return true;
    }
  }
  const { creds, error: tokenErr } = await apiLiveToken(streamKey, false);
  return !tokenErr && !!creds?.token;
}

export function LiveNotifyBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.session?.access_token) || '';
  const liveNotifications = useSettingsStore((s) => s.liveNotifications);

  const [startedBanner, setStartedBanner] = useState<StartedBanner | null>(null);
  const [shareBanner, setShareBanner] = useState<ShareBanner | null>(null);
  const shareBannerRef = useRef<ShareBanner | null>(null);
  shareBannerRef.current = shareBanner;

  const seenStartedRef = useRef<Set<string>>(new Set());
  const startedDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissStarted = useCallback(() => {
    if (startedDismissTimer.current) {
      clearTimeout(startedDismissTimer.current);
      startedDismissTimer.current = null;
    }
    setStartedBanner(null);
  }, []);

  const dismissShare = useCallback(() => {
    if (shareDismissTimer.current) {
      clearTimeout(shareDismissTimer.current);
      shareDismissTimer.current = null;
    }
    setShareBanner(null);
  }, []);

  // stream_started — follower live notifications (settings-gated)
  useEffect(() => {
    if (!token || !liveNotifications) return;
    let cancelled = false;

    const showStarted = async (data: unknown) => {
      const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const room = String(payload.stream_key ?? payload.room_id ?? '');
      const uid = String(payload.user_id ?? '');
      if (!room) return;
      if (uid && user?.id && uid === user.id) return;
      if (seenStartedRef.current.has(room)) return;
      seenStartedRef.current.add(room);
      if (seenStartedRef.current.size > SEEN_CAP) {
        const first = seenStartedRef.current.values().next().value as string | undefined;
        if (first) seenStartedRef.current.delete(first);
      }

      let name = liveNameFromStreamFields(
        payload.title,
        (payload.display_name ?? payload.displayName) as string | undefined,
        uid,
      );
      let avatar = '';
      if (uid && isGenericLiveCreatorName(name)) {
        try {
          const { body: prof } = await apiFetchProfileById(uid);
          if (prof) {
            const d = profileToLiveDisplay(prof);
            name = d.name || name;
            avatar = d.avatar || '';
          }
        } catch {
          /* best-effort enrichment */
        }
      }
      if (cancelled) return;
      setStartedBanner({ kind: 'started', room, name: name || 'Someone', avatar });
      if (startedDismissTimer.current) clearTimeout(startedDismissTimer.current);
      startedDismissTimer.current = setTimeout(() => setStartedBanner(null), STARTED_DISMISS_MS);
    };

    websocket.on('stream_started', showStarted);
    return () => {
      cancelled = true;
      websocket.off('stream_started', showStarted);
      if (startedDismissTimer.current) {
        clearTimeout(startedDismissTimer.current);
        startedDismissTimer.current = null;
      }
    };
  }, [token, liveNotifications, user?.id]);

  // live_share — in-app share from another user (always on when authenticated)
  useEffect(() => {
    if (!token || !user?.id) return;

    const showShare = (data: unknown) => {
      const parsed = parseSharePayload(data);
      if (!parsed) return;
      const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const sharerId = String(payload.sharerUserId ?? payload.sharer_user_id ?? '').trim();
      if (sharerId && sharerId === user.id) return;
      setShareBanner(parsed);
      if (shareDismissTimer.current) clearTimeout(shareDismissTimer.current);
      shareDismissTimer.current = setTimeout(() => setShareBanner(null), SHARE_DISMISS_MS);
    };

    const onStreamEnded = (data: unknown) => {
      const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const endedKey = String(payload.stream_key ?? payload.streamKey ?? '').trim();
      const current = shareBannerRef.current;
      if (endedKey && current?.streamKey === endedKey) {
        dismissShare();
      }
    };

    websocket.on('live_share', showShare);
    websocket.on('stream_ended', onStreamEnded);
    return () => {
      websocket.off('live_share', showShare);
      websocket.off('stream_ended', onStreamEnded);
      if (shareDismissTimer.current) {
        clearTimeout(shareDismissTimer.current);
        shareDismissTimer.current = null;
      }
    };
  }, [token, user?.id, dismissShare]);

  const onLiveSurface =
    location.pathname.startsWith('/live') ||
    location.pathname.startsWith('/watch') ||
    location.pathname.startsWith('/create');

  const startedSuppressed = onLiveSurface;
  const shareSuppressed =
    !!shareBanner &&
    (location.pathname === `/watch/${shareBanner.streamKey}` ||
      location.pathname.startsWith(`/watch/${shareBanner.streamKey}/`));

  const openStartedLive = useCallback(() => {
    if (!startedBanner) return;
    dismissStarted();
    navigate(`/watch/${encodeURIComponent(startedBanner.room)}`);
  }, [startedBanner, dismissStarted, navigate]);

  const openSharedLive = useCallback(async () => {
    if (!shareBanner) return;
    const key = shareBanner.streamKey;
    dismissShare();
    try {
      const joinable = await isStreamJoinable(key);
      if (!joinable) {
        showToast('This live has ended');
        return;
      }
      navigate(`/watch/${encodeURIComponent(key)}`);
    } catch {
      showToast('Could not join live');
    }
  }, [shareBanner, dismissShare, navigate]);

  const bannerShell = (
    label: string,
    name: string,
    avatar: string,
    badge: string,
    onOpen: () => void,
    onDismiss: () => void,
    liveRing?: boolean,
  ) => (
    <div
      className="fixed left-0 right-0 top-0 z-[9999] flex justify-center px-3 pointer-events-none"
      style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}
    >
      <div className="pointer-events-auto w-full max-w-[480px] flex items-center gap-2 rounded-full elix-panel border border-[#D8D9DD]/40 pl-1.5 pr-2 py-1 shadow-[0_8px_30px_rgba(0,0,0,0.55)]">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 flex items-center gap-2 text-left active:scale-[0.99] transition-transform"
        >
          <StoryGoldRingAvatar size={26} src={avatar} alt={name} live={liveRing} />
          <span className="flex-1 min-w-0 flex items-baseline gap-1.5 truncate">
            <span className="text-white font-bold text-xs truncate">{name}</span>
            <span className="text-[#F5F5F7] text-[11px] font-semibold whitespace-nowrap truncate">
              {label}
            </span>
          </span>
        </button>
        <span className="text-[9px] font-bold text-white bg-red-600 rounded-full px-1.5 py-0.5 tracking-wide shrink-0">
          {badge}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="p-0.5 text-white/50 active:text-white/80 shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );

  if (shareBanner && !shareSuppressed) {
    const hostLabel = shareBanner.hostName.trim() || 'a live';
    return bannerShell(
      `shared ${hostLabel} — tap to join`,
      shareBanner.sharerName,
      shareBanner.sharerAvatar,
      'LIVE',
      () => { void openSharedLive(); },
      dismissShare,
      true,
    );
  }

  if (startedBanner && !startedSuppressed) {
    return bannerShell(
      'is live now — tap to watch',
      startedBanner.name,
      startedBanner.avatar,
      'LIVE',
      openStartedLive,
      dismissStarted,
      true,
    );
  }

  return null;
}
