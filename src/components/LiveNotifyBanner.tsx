/**
 * Global "creator is live" top banner.
 *
 * Slides down from the top of the screen when a creator goes live, tappable to
 * open the live. Uses the existing subscribe-only `/live/__feed__` WebSocket
 * (same source the For You feed uses) — no extra polling. Gated by the user's
 * "Live notifications" setting. OS push while the app is closed is handled
 * separately by the server (follower-targeted `live_started` -> FCM/APNs).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getWsUrl } from '../lib/api';
import { request } from '../lib/apiClient';
import { StoryGoldRingAvatar } from './StoryGoldRingAvatar';
import {
  isGenericLiveCreatorName,
  liveNameFromStreamFields,
  profileToLiveDisplay,
} from '../lib/liveCreatorDisplay';

interface LiveBanner {
  room: string;
  name: string;
  avatar: string;
}

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
    const wsUrl = getWsUrl();
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const show = async (data: Record<string, unknown>) => {
      const room = String(data.stream_key ?? data.room_id ?? '');
      const uid = String(data.user_id ?? '');
      if (!room) return;
      // Never notify about your own live.
      if (uid && user?.id && uid === user.id) return;
      // One banner per stream per session.
      if (seenRef.current.has(room)) return;
      seenRef.current.add(room);

      let name = liveNameFromStreamFields(
        data.title,
        (data.display_name ?? data.displayName) as string | undefined,
        uid,
      );
      let avatar = '';
      if (uid && isGenericLiveCreatorName(name)) {
        try {
          const { data: prof } = await request(`/api/profiles/${encodeURIComponent(uid)}`);
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

    const connect = () => {
      if (cancelled) return;
      try {
        ws = new WebSocket(`${wsUrl}/live/__feed__?token=${encodeURIComponent(token)}`);
      } catch {
        reconnectTimer = setTimeout(connect, 4000);
        return;
      }
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg?.event === 'stream_started') void show(msg.data || {});
        } catch {
          /* malformed frame */
        }
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        ws = null;
        if (!cancelled) reconnectTimer = setTimeout(connect, 4000);
      };
    };
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [token, liveNotifications, user?.id]);

  // Don't interrupt while the user is already inside a live / broadcasting.
  const suppressed =
    location.pathname.startsWith('/live') ||
    location.pathname.startsWith('/watch') ||
    location.pathname.startsWith('/create');

  if (!banner || suppressed) return null;

  const room = banner.room;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[9999] flex justify-center px-3 pointer-events-none"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
    >
      <div className="pointer-events-auto w-full max-w-[480px] flex items-center gap-2 rounded-2xl bg-[#111111]/95 border border-[#C9A227]/40 px-3 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.55)]">
        <button
          type="button"
          onClick={() => {
            dismiss();
            navigate(`/watch/${encodeURIComponent(room)}`);
          }}
          className="flex-1 min-w-0 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
        >
          <StoryGoldRingAvatar size={40} src={banner.avatar} alt={banner.name} live />
          <span className="flex-1 min-w-0">
            <span className="block text-white font-bold text-sm truncate">{banner.name}</span>
            <span className="block text-[#D4AF37] text-xs font-semibold">
              is live now — tap to watch
            </span>
          </span>
        </button>
        <span className="text-[9px] font-bold text-white bg-red-600 rounded px-1.5 py-0.5 tracking-wide">
          LIVE
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="p-1 text-white/50 active:text-white/80"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
