/**
 * Global "creator is live" top banner.
 *
 * Slides down from the top of the screen when a creator goes live, tappable to
 * open the live. Listens on the shared websocket singleton (App already keeps
 * `/live/__feed__` connected while browsing) — no second feed socket.
 * Gated by the user's "Live notifications" setting. OS push while the app is
 * closed is handled separately by the server (follower-targeted `live_started` -> FCM/APNs).
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

interface LiveBanner {
  room: string;
  name: string;
  avatar: string;
}

const SEEN_CAP = 80;

export function LiveNotifyBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.session?.access_token) || '';
  const liveNotifications = useSettingsStore((s) => s.liveNotifications);

  const [banner, setBanner] = useState<LiveBanner | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    setBanner(null);
  }, []);

  useEffect(() => {
    if (!token || !liveNotifications) return;
    let cancelled = false;

    const show = async (data: unknown) => {
      const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const room = String(payload.stream_key ?? payload.room_id ?? '');
      const uid = String(payload.user_id ?? '');
      if (!room) return;
      // Never notify about your own live.
      if (uid && user?.id && uid === user.id) return;
      // One banner per stream per session.
      if (seenRef.current.has(room)) return;
      seenRef.current.add(room);
      if (seenRef.current.size > SEEN_CAP) {
        const first = seenRef.current.values().next().value as string | undefined;
        if (first) seenRef.current.delete(first);
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
      setBanner({ room, name: name || 'Someone', avatar });
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => setBanner(null), 6000);
    };

    websocket.on('stream_started', show);
    return () => {
      cancelled = true;
      websocket.off('stream_started', show);
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
  }, [token, liveNotifications, user?.id]);

  // Don't interrupt while the user is already inside a live / broadcasting.
  const suppressed =
    location.pathname.startsWith('/live') ||
    location.pathname.startsWith('/watch') ||
    location.pathname.startsWith('/create');

  const openLiveWatch = useCallback(() => {
    if (!banner) return;
    dismiss();
    navigate(`/watch/${encodeURIComponent(banner.room)}`);
  }, [banner, dismiss, navigate]);

  if (!banner || suppressed) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[9999] flex justify-center px-3 pointer-events-none"
      style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}
    >
      <div className="pointer-events-auto w-full max-w-[480px] flex items-center gap-2 rounded-full elix-panel border border-[#D8D9DD]/40 pl-1.5 pr-2 py-1 shadow-[0_8px_30px_rgba(0,0,0,0.55)]">
        <button
          type="button"
          onClick={openLiveWatch}
          className="flex-1 min-w-0 flex items-center gap-2 text-left active:scale-[0.99] transition-transform"
        >
          <StoryGoldRingAvatar size={26} src={banner.avatar} alt={banner.name} live />
          <span className="flex-1 min-w-0 flex items-baseline gap-1.5 truncate">
            <span className="text-white font-bold text-xs truncate">{banner.name}</span>
            <span className="text-[#F5F5F7] text-[11px] font-semibold whitespace-nowrap">
              is live now — tap to watch
            </span>
          </span>
        </button>
        <span className="text-[9px] font-bold text-white bg-red-600 rounded-full px-1.5 py-0.5 tracking-wide">
          LIVE
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="p-0.5 text-white/50 active:text-white/80"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
