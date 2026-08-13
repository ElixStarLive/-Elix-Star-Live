import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { RoyceBackIcon } from '../../components/royce';
import { StoryGoldRingAvatar } from '../../components/StoryGoldRingAvatar';
import { showToast } from '../../lib/toast';
import { apiListNotifications } from '../../features/notifications/notificationsApi';
import { apiLiveStreams } from '../../lib/live/liveApi';
import { apiFetchProfiles } from '../../features/feed/feedApi';

interface AlertItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  created_at: string;
  image_url: string | null;
}

function isFollowNotification(n: { type?: string; title?: string; body?: string }): boolean {
  if (n.type === 'follow') return true;
  const text = `${n.title || ''} ${n.body || ''}`.toLowerCase();
  return (
    text.includes('new follower') ||
    text.includes('started following') ||
    text.includes('follow you') ||
    text.includes('follows you')
  );
}

function liveHostIdFromActionUrl(actionUrl: string | null | undefined): string | null {
  if (!actionUrl) return null;
  try {
    const path = actionUrl.startsWith('http')
      ? new URL(actionUrl).pathname
      : actionUrl.split('?')[0];
    const m = path.match(/\/live\/([^/]+)/i);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function isLiveStartedNotification(n: AlertItem): boolean {
  if (n.type === 'live_started') return true;
  return /\bis live\b/i.test(n.title || '');
}

function formatTimeAgo(dateStr: string): string {
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}w`;
  const month = Math.floor(day / 30);
  return `${Math.max(1, month)}mo`;
}

/**
 * System / live alerts — dedicated page (not under Inbox Messages).
 * Uses Bell icon (not Archive/bin).
 */
export default function AlertsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [liveAvatarByHost, setLiveAvatarByHost] = useState<Record<string, string>>({});

  const goInbox = useCallback(() => {
    navigate('/inbox');
  }, [navigate]);

  const openActionUrl = useCallback(
    (actionUrl: string) => {
      navigate(actionUrl);
    },
    [navigate],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { rows, error } = await apiListNotifications();
        if (cancelled) return;
        if (error) {
          showToast(error);
          return;
        }
        let activeLiveIds = new Set<string>();
        try {
          const { streams } = await apiLiveStreams();
          for (const raw of streams) {
            const s = raw as Record<string, unknown>;
            const room = String(s.room_id ?? s.stream_key ?? '').trim();
            const uid = String(s.user_id ?? '').trim();
            if (room) activeLiveIds.add(room);
            if (uid) activeLiveIds.add(uid);
          }
        } catch {
          activeLiveIds = new Set();
        }

        const list: AlertItem[] = rows
          .filter(
            (n: { type?: string }) =>
              n.type !== 'battle_invite' &&
              n.type !== 'cohost_invite' &&
              n.type !== 'battle_accepted' &&
              n.type !== 'cohost_accepted',
          )
          .filter((n: { type?: string; title?: string; body?: string }) => !isFollowNotification(n))
          .map((n: Record<string, unknown>) => ({
            id: String(n.id ?? ''),
            type: String(n.type ?? 'system'),
            title: String(n.title ?? ''),
            body: n.body != null ? String(n.body) : null,
            action_url: n.action_url != null ? String(n.action_url) : null,
            created_at: String(n.created_at ?? ''),
            image_url: n.image_url != null ? String(n.image_url) : null,
          }))
          .filter((n) => n.type === 'system' || n.type === 'live_started')
          .filter((n) => n.type !== 'like' && n.type !== 'comment' && n.type !== 'gift')
          .filter((n) => {
            const isLiveRow =
              n.type === 'live_started' || /\bis live\b/i.test(String(n.title || ''));
            if (!isLiveRow) return true;
            const hostId = liveHostIdFromActionUrl(n.action_url);
            if (!hostId) return false;
            return activeLiveIds.has(hostId);
          });

        setItems(list);

        const liveHosts = list
          .filter(isLiveStartedNotification)
          .map((n) => liveHostIdFromActionUrl(n.action_url))
          .filter((id): id is string => !!id);
        if (liveHosts.length > 0) {
          try {
            const { profiles } = await apiFetchProfiles();
            if (cancelled) return;
            const map: Record<string, string> = {};
            for (const p of profiles) {
              const row = p as Record<string, unknown>;
              const id = String(row.user_id ?? row.userId ?? '');
              const av = String(row.avatar_url ?? row.avatarUrl ?? '');
              if (id && liveHosts.includes(id) && av) map[id] = av;
            }
            setLiveAvatarByHost(map);
          } catch {
            /* keep empty avatars */
          }
        }
      } catch {
        if (!cancelled) showToast('Could not load alerts');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveLiveAvatar = useCallback(
    (n: AlertItem): string => {
      const hostId = liveHostIdFromActionUrl(n.action_url);
      if (hostId && liveAvatarByHost[hostId]) return liveAvatarByHost[hostId];
      return n.image_url || '';
    },
    [liveAvatarByHost],
  );

  const rows = useMemo(() => items, [items]);

  return (
    <div className="page-above-bottom-nav bg-transparent">
      <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
          <div className="px-3 pt-page-header pb-1 flex items-center justify-between relative bg-transparent">
            <div className="w-8" aria-hidden />
            <h2 className="text-sm font-bold text-gold-bright absolute left-1/2 transform -translate-x-1/2">
              Alerts
            </h2>
            <button
              type="button"
              onClick={goInbox}
              className="p-1 z-10"
              title="Back to inbox"
              aria-label="Back to inbox"
            >
              <RoyceBackIcon />
            </button>
          </div>

          <div className="px-4 py-2 space-y-0.5 pb-4">
            {rows.length === 0 ? (
              <p className="text-gold-bright/50 text-sm py-8 text-center">No alerts yet.</p>
            ) : (
              rows.map((notif) => {
                const liveNotif = isLiveStartedNotification(notif);
                const liveAvatar = liveNotif ? resolveLiveAvatar(notif) : '';
                const liveInitial =
                  (notif.title || '?').replace(/\s+is live.*$/i, '').trim().charAt(0).toUpperCase() ||
                  '?';
                return (
                  <button
                    key={notif.id}
                    type="button"
                    onClick={() => {
                      if (notif.action_url) openActionUrl(notif.action_url);
                    }}
                    className="flex items-center gap-3 w-full text-left py-2 px-2 bg-transparent"
                  >
                    {liveNotif ? (
                      <div className="flex-shrink-0">
                        <StoryGoldRingAvatar
                          size={48}
                          src={liveAvatar}
                          alt={liveInitial}
                          live
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center flex-shrink-0">
                        <Bell className="w-6 h-6 stroke-gold-metallic" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm text-gold-metallic">{notif.title}</h3>
                      <p className="text-gold-bright text-xs truncate">{notif.body}</p>
                    </div>
                    <span className="text-[10px] text-gold-bright">
                      {notif.created_at ? formatTimeAgo(notif.created_at) : ''}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
