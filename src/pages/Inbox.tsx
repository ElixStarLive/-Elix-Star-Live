import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiDeleteChatThread, apiListChatThreads } from '../features/chat/chatApi';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import { nativeConfirm } from '../components/NativeDialog';
import { Heart, UserPlus, Search, ShoppingBag, Archive, ChevronRight, Trash2 } from 'lucide-react';
import { AvatarRing } from '../components/AvatarRing';
import { LevelBadge } from '../components/LevelBadge';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { CHAT_LEVEL_PILL_SIZE_PX, CHAT_PROFILE_RING_PX } from '../lib/profileFrame';
import { showToast } from '../lib/toast';
import { websocket } from '../lib/websocket';
import {
  apiListActivityItems,
  apiListFollowers,
  apiListLiveShareRequests,
  apiListMyFollowingIds,
  apiListNotifications,
  apiListSuggestedUsersInput,
  apiMarkNotificationsRead,
  apiToggleInboxFollow,
} from '../features/notifications/notificationsApi';
import { apiFetchProfiles } from '../features/feed/feedApi';
import { apiLiveStreams } from '../lib/live/liveApi';
import { isGenuineAppUser } from '../lib/genuineUser';

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'gift' | 'battle_invite' | 'system' | 'shop' | 'live_started';
  actor_id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  rawData?: Record<string, string | undefined>;
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

function inboxMessagePreview(raw: string | undefined | null): string {
  const t = String(raw || '').trim();
  if (!t) return 'No messages yet';
  if (/\/(watch|live)\//i.test(t)) return 'Shared a live';
  if (/\/video\//i.test(t)) return 'Shared a video';
  if (/\/profile\//i.test(t)) return 'Shared a profile';
  return t;
}

function normalizeNotificationType(value: unknown): Notification['type'] {
  if (
    value === 'like' ||
    value === 'comment' ||
    value === 'follow' ||
    value === 'gift' ||
    value === 'battle_invite' ||
    value === 'shop' ||
    value === 'system' ||
    value === 'live_started'
  ) {
    return value;
  }
  return 'system';
}

/** Host user/room id from a live inbox notification action URL. */
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

function isLiveStartedNotification(n: Notification): boolean {
  if (n.type === 'live_started') return true;
  return /\bis live\b/i.test(n.title || '');
}

function toStringRecord(input?: Record<string, unknown>): Record<string, string | undefined> {
  if (!input) return {};
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') out[key] = value;
    else if (value == null) out[key] = undefined;
    else out[key] = String(value);
  }
  return out;
}

interface Conversation {
  id: string;
  user1_id: string;
  user2_id: string;
  last_at: string;
  otherUser?: { username: string; display_name: string | null; avatar_url: string | null };
  lastMessage?: string;
  hasUnread?: boolean;
  unreadCount?: number;
}

interface FollowerProfile {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface SuggestedUser {
  id: string;
  username: string;
  name: string;
  avatar_url?: string;
  is_live?: boolean;
}

interface ActivityItem {
  id: string;
  kind: 'like' | 'comment' | 'save' | 'mention';
  video_id: string;
  actor_user_id: string;
  actor_username: string;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  snippet: string | null;
  created_at: string;
}

interface LiveShareRequestItem {
  sharer_id: string;
  stream_key: string;
  host_user_id: string;
  host_name: string;
  host_avatar: string;
  sharer_name: string;
  sharer_avatar: string;
  sharer_level: number;
  created_at: string;
}






function formatTimeAgo(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 0 || !Number.isFinite(diff)) return '';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w`;
  } catch {
    return '';
  }
}

export default function Inbox() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [followers, setFollowers] = useState<FollowerProfile[]>([]);
  const [followersTotalCount, setFollowersTotalCount] = useState(0);
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [liveUserIds, setLiveUserIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'main' | 'requests' | 'unread' | 'starred' | 'activity'>('main');
  const [showNewFollowersPanel, setShowNewFollowersPanel] = useState(false);
  /** IDs of users the current user follows — for Follow / Following in followers panel */
  const [iFollowIds, setIFollowIds] = useState<Set<string>>(() => new Set());
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [liveShareRequests, setLiveShareRequests] = useState<LiveShareRequestItem[]>([]);

  useEffect(() => {
    setCurrentUserId(user?.id ?? null);
  }, [user?.id]);

  const loadMyFollowingIds = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const { ids, error } = await apiListMyFollowingIds(currentUserId);
      if (error) {
        showToast(error);
        return;
      }
      setIFollowIds(new Set(ids));
    } catch {
      showToast('Could not load following list');
    }
  }, [currentUserId]);

  useEffect(() => {
    void loadMyFollowingIds();
  }, [loadMyFollowingIds]);

  useEffect(() => {
    if (showNewFollowersPanel) void loadMyFollowingIds();
  }, [showNewFollowersPanel, loadMyFollowingIds]);

  const handleFollowToggle = useCallback(
    async (targetUserId: string) => {
      if (!currentUserId || targetUserId === currentUserId) return;
      const wasFollowing = iFollowIds.has(targetUserId);
      setIFollowIds((prev) => {
        const r = new Set(prev);
        if (wasFollowing) r.delete(targetUserId);
        else r.add(targetUserId);
        return r;
      });
      try {
        const { error: followErr } = await apiToggleInboxFollow(targetUserId, wasFollowing);
        if (followErr) throw new Error('failed');
        const videoStore = useVideoStore.getState();
        const cur = videoStore.followingUsers;
        const updated = wasFollowing ? cur.filter((id) => id !== targetUserId) : [...cur, targetUserId];
        useVideoStore.setState({
          followingUsers: updated,
          videos: videoStore.videos.map((v) =>
            v.user.id === targetUserId ? { ...v, isFollowing: !wasFollowing } : v
          ),
        });
      } catch {
        setIFollowIds((prev) => {
          const r = new Set(prev);
          if (wasFollowing) r.add(targetUserId);
          else r.delete(targetUserId);
          return r;
        });
        showToast('Could not update follow');
      }
    },
    [currentUserId, iFollowIds],
  );

  const goSearch = useCallback(() => {
    navigate('/search');
  }, [navigate]);

  const goFeedBack = useCallback(() => {
    navigate('/feed', { replace: true });
  }, [navigate]);

  const goShop = useCallback(() => {
    navigate('/shop');
  }, [navigate]);

  const openNewFollowersPanel = useCallback(() => {
    setShowNewFollowersPanel(true);
  }, []);

  const closeNewFollowersPanel = useCallback(() => {
    setShowNewFollowersPanel(false);
  }, []);

  const openConversation = useCallback(
    (conversationId: string) => {
      navigate(`/inbox/${conversationId}`);
    },
    [navigate],
  );

  const deleteConversation = useCallback(async (conversationId: string) => {
    const ok = await nativeConfirm('Delete this conversation? Messages will be removed.', 'Delete Conversation');
    if (!ok) return;
    try {
      const { ok: deleted, error: delError } = await apiDeleteChatThread(conversationId);
      if (!deleted || delError) {
        showToast(delError || 'Could not delete');
        return;
      }
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    } catch {
      showToast('Could not delete');
    }
  }, []);

  const openUserOrLive = useCallback(
    (userId: string, isLive: boolean) => {
      navigate(isLive ? `/watch/${userId}` : `/profile/${userId}`);
    },
    [navigate],
  );

  const openVideo = useCallback(
    (videoId: string) => {
      navigate(`/video/${encodeURIComponent(videoId)}`);
    },
    [navigate],
  );

  const openWatchStream = useCallback(
    (streamKey: string) => {
      navigate(`/watch/${encodeURIComponent(streamKey)}`);
    },
    [navigate],
  );

  const openActionUrl = useCallback(
    (actionUrl: string) => {
      navigate(actionUrl);
    },
    [navigate],
  );

  const openFollowerProfile = useCallback(
    (userId: string) => {
      setShowNewFollowersPanel(false);
      navigate(`/profile/${userId}`);
    },
    [navigate],
  );

  const filterMain = useCallback(() => setActiveFilter('main'), []);
  const filterRequests = useCallback(() => setActiveFilter('requests'), []);
  const filterUnread = useCallback(() => setActiveFilter('unread'), []);
  const filterStarred = useCallback(() => setActiveFilter('starred'), []);
  const filterActivity = useCallback(() => setActiveFilter('activity'), []);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    const fetchNotifications = async () => {
      try {
        const { rows, error: listError } = await apiListNotifications();
        if (cancelled) return;
        if (listError) {
          showToast(listError);
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
        setNotifications(rows
          .filter((n: { type?: string }) => n.type !== 'battle_invite' && n.type !== 'cohost_invite' && n.type !== 'battle_accepted' && n.type !== 'cohost_accepted')
          .filter((n: { type?: string; title?: string; body?: string }) => !isFollowNotification(n))
          .filter((n: { type?: string; title?: string; action_url?: string }) => {
            // Ended lives must not stay in Inbox.
            const isLiveRow =
              n.type === 'live_started' || /\bis live\b/i.test(String(n.title || ''));
            if (!isLiveRow) return true;
            const hostId = liveHostIdFromActionUrl(n.action_url);
            if (!hostId) return false;
            return activeLiveIds.has(hostId);
          })
          .map((n: { type?: string; id?: string; title?: string; body?: string; is_read?: boolean; created_at?: string; action_url?: string; data?: Record<string, unknown> }) => ({
          id: n.id,
          type: normalizeNotificationType(n.type),
          actor_id: typeof n.data?.actor_id === 'string' ? n.data.actor_id : '',
          title: n.title || 'Notification',
          body: n.body,
          image_url:
            typeof n.data?.image_url === 'string'
              ? n.data.image_url
              : typeof n.data?.host_avatar === 'string'
                ? n.data.host_avatar
                : typeof n.data?.avatar_url === 'string'
                  ? n.data.avatar_url
                  : null,
          action_url: typeof n.action_url === 'string' ? n.action_url : null,
          is_read: !!n.is_read,
          created_at: n.created_at,
          rawData: toStringRecord(n.data),
        })));
        const unreadIds = rows
          .filter((n: { is_read?: boolean; id?: string }) => !n.is_read && n.id)
          .map((n: { id: string }) => n.id)
          .slice(0, 100);
        if (unreadIds.length > 0) {
          void apiMarkNotificationsRead(unreadIds).then(({ ok, error }) => {
            if (!ok && error) showToast(error);
          });
        }
      } catch {
        if (!cancelled) showToast('Could not load notifications');
      }
    };
    const fetchConversations = async () => {
      try {
        const { threads: rows, error: convError } = await apiListChatThreads();
        if (cancelled) return;
        if (convError) {
          setConversations([]);
          return;
        }
        const mapped: Conversation[] = rows.map((t: Record<string, unknown>) => {
          const other = (t.otherUser ?? {}) as Record<string, unknown>;
          const display =
            String(other.display_name ?? other.username ?? t.other_username ?? '')
              .trim() || 'User';
          return {
            id: String(t.id ?? ''),
            user1_id: String(t.user1_id ?? ''),
            user2_id: String(t.user2_id ?? ''),
            last_at: String(t.last_at ?? t.created_at ?? ''),
            otherUser: {
              username: String(other.username ?? t.other_username ?? display),
              display_name: display,
              avatar_url: (other.avatar_url ?? t.other_avatar ?? null) as string | null,
            },
            lastMessage: String(t.last_message ?? ''),
            hasUnread: !!t.hasUnread || Number(t.unread_count ?? 0) > 0,
            unreadCount: Number(t.unread_count ?? (t.hasUnread ? 1 : 0)),
          };
        });
        const filtered = mapped.filter((c) => {
          const name = (c.otherUser?.display_name || c.otherUser?.username || '').trim().toLowerCase();
          if (name === 'user' || name === '') return false;
          return true;
        });
        setConversations(filtered);
      } catch {
        if (!cancelled) {
          setConversations([]);
          showToast('Could not load messages');
        }
      }
    };
    const fetchFollowers = async () => {
      try {
        const { body: backendBody, error: followersErr } = await apiListFollowers(currentUserId);
        if (cancelled) return;
        if (followersErr || !backendBody) {
          setFollowers([]);
          setFollowersTotalCount(0);
          return;
        }
        const ids: string[] = Array.isArray(backendBody?.followers) ? backendBody.followers : [];
        const count = Number(backendBody?.count ?? ids.length);
        setFollowersTotalCount(Number.isFinite(count) ? count : ids.length);
        const profilesRaw = Array.isArray(backendBody?.follower_profiles) ? backendBody.follower_profiles : [];
        const list: FollowerProfile[] = profilesRaw
          .map((p: Record<string, unknown>) => ({
            user_id: String(p.user_id ?? ''),
            username: String(p.username ?? 'user'),
            display_name: (p.display_name != null ? String(p.display_name) : null) as string | null,
            avatar_url: (p.avatar_url != null ? String(p.avatar_url) : null) as string | null,
          }))
          .filter((p) => p.user_id && p.user_id !== currentUserId);
        setFollowers(list);
      } catch {
        if (!cancelled) setFollowers([]);
      }
    };
    const fetchSuggestedUsers = async () => {
      try {
        const { profiles, streams } = await apiListSuggestedUsersInput();
        if (cancelled) return;
        const liveSet = new Set<string>(streams.map((s) => {
          const row = s as { userId?: string; user_id?: string };
          return row.userId || row.user_id || '';
        }).filter(Boolean));
        setLiveUserIds(liveSet);

        const rows = profiles;
        const mapped: SuggestedUser[] = rows
          .map((p: { user_id: string; userId: string; username?: string; display_name?: string; displayName?: string; avatar_url?: string; avatarUrl?: string }) => ({
            id: p.user_id || p.userId,
            username: p.username || 'user',
            name: p.display_name || p.displayName || p.username || 'User',
            avatar_url: p.avatar_url || p.avatarUrl,
            is_live: liveSet.has(p.user_id || p.userId),
          }))
          .filter((p) => !!p.id && p.id !== currentUserId)
          .filter((p) => isGenuineAppUser(p.username, p.id, p.name));

        mapped.sort((a, b) => (a.is_live === b.is_live ? 0 : a.is_live ? -1 : 1));
        setSuggestedUsers(mapped);
      } catch {
        if (!cancelled) setSuggestedUsers([]);
      }
    };
    const fetchActivity = async () => {
      try {
        const { rows: raw, error: actError } = await apiListActivityItems();
        if (cancelled) return;
        if (actError) {
          setActivityItems([]);
          return;
        }
        const list: ActivityItem[] = raw
          .filter((a: { kind?: string }) => a && (a.kind === 'like' || a.kind === 'comment' || a.kind === 'save' || a.kind === 'mention'))
          .map((a: { id?: string | number; kind?: string; video_id?: string; actor_user_id?: string; actor_username?: string; actor_display_name?: string | null; actor_avatar_url?: string | null; snippet?: string | null; created_at?: string }) => ({
            id: String(a.id || ''),
            kind: a.kind as ActivityItem['kind'],
            video_id: String(a.video_id || ''),
            actor_user_id: String(a.actor_user_id || ''),
            actor_username: String(a.actor_username || 'user'),
            actor_display_name: a.actor_display_name ?? null,
            actor_avatar_url: a.actor_avatar_url ?? null,
            snippet: a.snippet ?? null,
            created_at: String(a.created_at || ''),
          }));
        setActivityItems(list);
      } catch {
        if (!cancelled) setActivityItems([]);
      }
    };
    const fetchLiveShareRequests = async () => {
      try {
        const { rows: raw, error: lsError } = await apiListLiveShareRequests();
        if (cancelled) return;
        if (lsError) {
          setLiveShareRequests([]);
          return;
        }
        setLiveShareRequests(
          await (async () => {
            const base = raw.map((row: Record<string, unknown>) => ({
              sharer_id: String(row.sharer_id ?? ''),
              stream_key: String(row.stream_key ?? ''),
              host_user_id: String(row.host_user_id ?? ''),
              host_name: String(row.host_name ?? ''),
              host_avatar: String(row.host_avatar ?? ''),
              sharer_name: String(row.sharer_name ?? ''),
              sharer_avatar: String(row.sharer_avatar ?? ''),
              sharer_level: 1,
              created_at: String(row.created_at ?? ''),
            }));
            try {
              const { profiles } = await apiFetchProfiles();
              const levelById = new Map<string, number>();
              for (const p of profiles as Record<string, unknown>[]) {
                const id = String(p.user_id ?? p.userId ?? '');
                const level = Number(p.level);
                if (id && Number.isFinite(level) && level > 0) levelById.set(id, Math.floor(level));
              }
              return base.map((row) => ({
                ...row,
                sharer_level: levelById.get(row.sharer_id) || 1,
              }));
            } catch {
              return base;
            }
          })(),
        );
      } catch {
        if (!cancelled) setLiveShareRequests([]);
      }
    };
    fetchNotifications();
    fetchConversations();
    fetchFollowers();
    fetchSuggestedUsers();
    fetchActivity();
    fetchLiveShareRequests();

    const onDmThreadUpdated = (raw: unknown) => {
      if (cancelled) return;
      const data = (raw ?? {}) as {
        threadId?: string;
        last_message?: string;
        last_at?: string;
        sender_id?: string;
      };
      if (!data.threadId) return;
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === data.threadId);
        if (idx < 0) {
          void fetchConversations();
          return prev;
        }
        const next = [...prev];
        const row = { ...next[idx] };
        if (data.last_message) row.lastMessage = data.last_message;
        if (data.last_at) row.last_at = data.last_at;
        if (data.sender_id && data.sender_id !== currentUserId) {
          row.hasUnread = true;
          row.unreadCount = Math.max(1, (row.unreadCount || 0) + 1);
        }
        next.splice(idx, 1);
        next.unshift(row);
        return next;
      });
    };
    websocket.on('dm_thread_updated', onDmThreadUpdated);

    return () => {
      cancelled = true;
      websocket.off('dm_thread_updated', onDmThreadUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, location.pathname]);

  const isRealUser = (f: FollowerProfile) =>
    isGenuineAppUser(f.username || '', f.user_id || '', f.display_name || '');

  /** Avatars for live_started inbox rows (resolve host from /live/:id). */
  const avatarByUserId = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of suggestedUsers) {
      if (u.id && u.avatar_url) m.set(u.id, u.avatar_url);
    }
    for (const f of followers) {
      if (f.user_id && f.avatar_url) m.set(f.user_id, f.avatar_url);
    }
    return m;
  }, [suggestedUsers, followers]);

  const resolveLiveNotifAvatar = useCallback(
    (n: Notification): string => {
      if (n.image_url) return n.image_url;
      const fromData =
        n.rawData?.avatar_url ||
        n.rawData?.host_avatar ||
        n.rawData?.image_url ||
        '';
      if (fromData) return fromData;
      const hostId = liveHostIdFromActionUrl(n.action_url);
      if (hostId && avatarByUserId.has(hostId)) return avatarByUserId.get(hostId) || '';
      return '';
    },
    [avatarByUserId],
  );

  const myNewFollowers = followers.filter(
    (f) =>
      f.user_id !== user?.id &&
      f.user_id !== currentUserId &&
      !!f.user_id
  );
  const followersCount = Math.max(followersTotalCount, myNewFollowers.length);

  /** Real followers only (for list + circles) — never mix in suggested users. */
  const followersListForUi = myNewFollowers.filter(isRealUser)
    .sort((a, b) => {
      const aLive = liveUserIds.has(a.user_id);
      const bLive = liveUserIds.has(b.user_id);
      return aLive === bLive ? 0 : aLive ? -1 : 1;
    });

  const followerIdSet = new Set(followersListForUi.map((f) => f.user_id));
  const suggestedUsersNotFollowers = suggestedUsers.filter((u) => u.id && !followerIdSet.has(u.id));

  const activitySummaryCount = activityItems.length;

  const activityLine = (a: ActivityItem): string => {
    if (a.kind === 'like') return 'Liked your video';
    if (a.kind === 'save') return 'Saved your video';
    if (a.kind === 'mention') {
      if (a.snippet?.trim()) {
        const t = a.snippet.trim();
        return t.length > 80 ? `Mentioned you: "${t.slice(0, 80)}…"` : `Mentioned you: "${t}"`;
      }
      return 'Mentioned you in a comment';
    }
    if (a.snippet?.trim()) {
      const t = a.snippet.trim();
      return t.length > 90 ? `Commented: "${t.slice(0, 90)}…"` : `Commented: "${t}"`;
    }
    return 'Commented on your video';
  };

  return (
    <div className="page-above-bottom-nav bg-transparent z-[1]">
      <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0">
        {/* One full-page scroll — same fundal colour, no framed boxes */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
        <div className="px-3 pt-page-header pb-1 flex items-center justify-between relative bg-transparent">
          <div className="flex items-center gap-3 z-10">
            <button onClick={goSearch} aria-label="Search"><Search size={18} className="text-gold-bright" /></button>
          </div>
          <h1 className="text-sm font-bold text-gold-bright absolute left-1/2 transform -translate-x-1/2">Inbox</h1>
          <button
            type="button"
            onClick={goFeedBack}
            className="p-1 z-10"
            title="Close"
            aria-label="Close inbox and go to For You"
          >
            <RoyceBackIcon />
          </button>
        </div>

        {/* Circles — Followers hub first; suggested + per-follower avatars scroll to the right */}
        <div className="px-3 pb-2 bg-transparent" style={{ marginTop: '4mm' }}>
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar pt-3" style={{ WebkitOverflowScrolling: 'touch' }}>
                <button
                    type="button"
                    onClick={openNewFollowersPanel}
                    className="flex-shrink-0 flex flex-col items-center gap-1" style={{ width: 95, minWidth: 95 }}
                >
                    <StoryGoldRingAvatar
                        data-avatar-circle="followers"
                        alt="Followers"
                        src={
                            myNewFollowers[0]?.avatar_url ||
                            user?.avatar ||
                            '/royce/default-avatar.svg'
                        }
                    />
                    <div className="text-[11px] text-gold-bright/80 truncate w-full text-center">Followers</div>
                    <div className="text-[10px] text-[#F5F5F7]/90 truncate w-full text-center">{followersCount}</div>
                </button>

                {/* Suggested (Friends-style); skip users already shown as followers */}
                {suggestedUsersNotFollowers.map((u) => (
                    <button
                        key={u.id}
                        type="button"
                        onClick={() => openUserOrLive(u.id, !!u.is_live)}
                        className="flex-shrink-0 flex flex-col items-center gap-1" style={{ width: 95, minWidth: 95 }}
                    >
                        <StoryGoldRingAvatar
                            live={u.is_live}
                            data-avatar-circle={u.is_live ? 'live' : undefined}
                            src={u.avatar_url || '/royce/default-avatar.svg'}
                            alt={u.name || u.username}
                        />
                        <div className="text-[11px] text-gold-bright/80 truncate w-full text-center">{u.name || u.username}</div>
                    </button>
                ))}

                {followersListForUi.map((f) => {
                    const fLive = liveUserIds.has(f.user_id);
                    return (
                    <button
                        key={f.user_id}
                        type="button"
                        onClick={() => openUserOrLive(f.user_id, fLive)}
                        className="flex-shrink-0 flex flex-col items-center gap-1" style={{ width: 95, minWidth: 95 }}
                    >
                        <StoryGoldRingAvatar
                            live={fLive}
                            data-avatar-circle={fLive ? 'live' : undefined}
                            src={f.avatar_url || '/royce/default-avatar.svg'}
                            alt={f.display_name || f.username || 'User'}
                        />
                        <div className="text-[11px] text-gold-bright/80 truncate w-full text-center">{f.display_name || f.username || 'User'}</div>
                    </button>
                    );
                })}
            </div>
        </div>

        {/* Filters — flat text on fundal, no bordered boxes */}
        <div className="pl-[calc(1rem+22mm)] pr-4 py-2 flex items-center justify-center gap-3 overflow-x-auto no-scrollbar mb-2 bg-transparent" style={{ marginLeft: '-20mm' }}>
            <button onClick={filterMain} className={`px-2 py-1.5 text-xs font-bold whitespace-nowrap bg-transparent border-0 ${activeFilter === 'main' ? 'text-gold-bright' : 'text-gold-bright/45'}`}>Main</button>
            <button onClick={filterRequests} className={`px-2 py-1.5 text-xs font-bold whitespace-nowrap bg-transparent border-0 ${activeFilter === 'requests' ? 'text-gold-bright' : 'text-gold-bright/45'}`}>Requests</button>
            <button onClick={filterUnread} className={`px-2 py-1.5 text-xs font-bold whitespace-nowrap bg-transparent border-0 ${activeFilter === 'unread' ? 'text-gold-bright' : 'text-gold-bright/45'}`}>Unread</button>
            <button onClick={filterStarred} className={`px-2 py-1.5 text-xs font-bold whitespace-nowrap bg-transparent border-0 ${activeFilter === 'starred' ? 'text-gold-bright' : 'text-gold-bright/45'}`}>Starred</button>
            <button onClick={filterActivity} className={`px-2 py-1.5 text-xs font-bold whitespace-nowrap bg-transparent border-0 ${activeFilter === 'activity' ? 'text-gold-bright' : 'text-gold-bright/45'}`}>Activity</button>
        </div>

        {/* List Content — continues same scroll / same fundal */}
        <div className="px-4 py-1 space-y-4 bg-transparent pb-4">
            
            {activeFilter === 'main' && (
            <>
            {/* New followers — tap to open panel with all people who follow you */}
            <button
                type="button"
                onClick={openNewFollowersPanel}
                className="flex items-center gap-3 w-full text-left py-2 px-2 bg-transparent"
            >
                <div className="relative w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 royce-tile">
                    <UserPlus className="w-6 h-6 royce-icon-gold relative z-10" strokeWidth={2} style={{ transform: 'translate(0.5mm, -0.5mm)' }} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-gold-metallic">New followers</h3>
                    <p className="text-gold-bright/70 text-xs truncate">
                        {followersCount === 0
                            ? 'No new followers yet'
                            : `${followersCount} people follow you`}
                    </p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#F5F5F7]/70 flex-shrink-0" />
            </button>

            {/* Activity — likes / comments entry */}
            <button onClick={filterActivity} className="flex items-center gap-3 w-full text-left py-2 px-2 bg-transparent">
                <div className="relative w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 royce-tile">
<Heart className="w-6 h-6 royce-icon-gold relative z-10" strokeWidth={2.25} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-gold-metallic">Activity</h3>
                    <p className="text-gold-bright text-xs truncate">
                      {activitySummaryCount > 0
                        ? `${activitySummaryCount} likes, comments & saves`
                        : 'No recent activity'}
                    </p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#F5F5F7]/70 flex-shrink-0" />
            </button>

            {activityItems.length > 0 && (
              <div className="space-y-0.5 pl-2">
                {activityItems.slice(0, 5).map((a) => {
                  const actorName = (a.actor_display_name?.trim() || a.actor_username || 'Someone').trim();
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => { if (a.video_id) openVideo(a.video_id); }}
                      className="flex items-center gap-2.5 w-full text-left py-1.5 px-2 bg-transparent"
                    >
                      <div className="w-9 h-9 rounded-full bg-transparent border border-[#D8D9DD]/30 flex items-center justify-center flex-shrink-0 overflow-hidden relative" style={{ transform: 'translateY(4mm)' }}>
                        {a.actor_avatar_url ? (
                          <img src={a.actor_avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[#F5F5F7] font-bold text-sm">{actorName.replace('@', '').charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gold-bright truncate"><span className="font-semibold">{actorName}</span> <span className="text-gold-bright/60">{activityLine(a)}</span></p>
                      </div>
                    </button>
                  );
                })}
                {activityItems.length > 5 && (
                  <button type="button" onClick={filterActivity} className="text-[11px] text-[#F5F5F7]/70 font-medium pl-2 py-1">
                    View all activity →
                  </button>
                )}
              </div>
            )}

            {/* Messages (Inbox) — show right after Activity so inbox = messages */}
            <div className="space-y-1 pt-2">
                <h3 className="font-bold text-sm text-gold-metallic px-1 pb-2">Messages</h3>
                {conversations.length === 0 && liveShareRequests.length === 0 ? (
                    <p className="text-gold-bright/50 text-xs px-1 py-2">No messages yet</p>
                ) : (
                    conversations.map((conv) => (
                        <div key={conv.id} className="flex items-center gap-3 py-2 px-2 bg-transparent group">
                            <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => openConversation(conv.id)}>
                                <AvatarRing src={conv.otherUser?.avatar_url || ''} alt={conv.otherUser?.display_name || conv.otherUser?.username || 'User'} size={48} />
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm text-gold-bright truncate flex items-center gap-1.5">
                                      {conv.otherUser?.display_name || conv.otherUser?.username || 'User'}
                                      {conv.hasUnread ? (
                                        <span className="inline-block w-2 h-2 rounded-full bg-[#E6E9EE] flex-shrink-0" title="Unread" aria-label="Unread messages" />
                                      ) : null}
                                    </p>
                                    <p className="text-gold-bright/60 text-xs truncate">{inboxMessagePreview(conv.lastMessage)}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    void deleteConversation(conv.id);
                                }}
                                className="w-10 h-10 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform hover:border-[#D8D9DD]/50 hover:bg-transparent"
                                title="Delete conversation"
                                aria-label="Delete conversation"
                            >
                                <Trash2 size={18} className="text-[#F5F5F7]/90 hover:text-gold-bright/60" />
                            </button>
                        </div>
                    ))
                )}
                {liveShareRequests.map((row) => {
                  const who = row.sharer_name?.trim() || 'Someone';
                  const hostLabel = row.host_name?.trim() || 'a creator';
                  return (
                    <button
                      key={`live-share-${row.sharer_id}_${row.stream_key}`}
                      type="button"
                      onClick={() => {
                        if (row.stream_key) openWatchStream(row.stream_key);
                      }}
                      className="flex items-center gap-3 w-full text-left py-2 px-2 bg-transparent"
                    >
                      <LevelBadge
                        level={row.sharer_level || 1}
                        avatar={row.sharer_avatar || ''}
                        name={who}
                        layout="fixed"
                        circleSize={CHAT_PROFILE_RING_PX}
                        size={CHAT_LEVEL_PILL_SIZE_PX}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gold-bright truncate">{who}</p>
                        <p className="text-gold-bright/70 text-xs truncate">
                          Shared {hostLabel}&apos;s live · Tap to watch
                        </p>
                      </div>
                    </button>
                  );
                })}
            </div>
            </>
            )}

            {/* Unread — chats with messages you haven’t opened yet (server tracks read state) */}
            {activeFilter === 'unread' && (
            <div className="space-y-1 pt-2">
                <h3 className="font-bold text-sm text-gold-metallic px-1 pb-2">Unread messages</h3>
                <p className="text-gold-bright/45 text-[11px] px-1 pb-3 leading-snug">
                  Chats appear here when someone messaged you and you haven’t opened the conversation yet. Opening a chat marks those messages as read.
                </p>
                {conversations.filter((c) => c.hasUnread).length === 0 ? (
                    <p className="text-gold-bright/50 text-xs px-1 py-2">You’re all caught up.</p>
                ) : (
                    conversations.filter((c) => c.hasUnread).map((conv) => (
                        <div key={conv.id} className="flex items-center gap-3 py-2 px-2 bg-transparent group">
                            <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => openConversation(conv.id)}>
                                <AvatarRing src={conv.otherUser?.avatar_url || ''} alt={conv.otherUser?.display_name || conv.otherUser?.username || 'User'} size={48} />
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm text-gold-bright truncate">{conv.otherUser?.display_name || conv.otherUser?.username || 'User'}</p>
                                    <p className="text-gold-bright/60 text-xs truncate">
                                      {(conv.unreadCount ?? 0) > 1
                                        ? `${conv.unreadCount} unread · ${inboxMessagePreview(conv.lastMessage)}`
                                        : conv.lastMessage
                                          ? `Unread · ${inboxMessagePreview(conv.lastMessage)}`
                                          : 'Unread — tap to open'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    void deleteConversation(conv.id);
                                }}
                                className="w-10 h-10 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform hover:border-[#D8D9DD]/50 hover:bg-transparent"
                                title="Delete conversation"
                                aria-label="Delete conversation"
                            >
                                <Trash2 size={18} className="text-[#F5F5F7]/90 hover:text-gold-bright/60" />
                            </button>
                        </div>
                    ))
                )}
            </div>
            )}

            {/* Requests — same live shares (non-following) also listed under Messages */}
            {activeFilter === 'requests' && (
            <div className="space-y-1 pt-2">
                <h3 className="font-bold text-sm text-gold-metallic px-1 pb-2">Requests</h3>
                <p className="text-gold-bright/45 text-[11px] px-1 pb-3 leading-snug">
                  Live shares from people you don’t follow yet.
                </p>
                {liveShareRequests.length === 0 ? (
                    <p className="text-gold-bright/50 text-xs px-1 py-2">No live shares right now.</p>
                ) : (
                    liveShareRequests.map((row) => {
                      const who = row.sharer_name?.trim() || 'Someone';
                      const hostLabel = row.host_name?.trim() || 'a creator';
                      return (
                        <button
                          key={`${row.sharer_id}_${row.stream_key}`}
                          type="button"
                          onClick={() => {
                            if (row.stream_key) openWatchStream(row.stream_key);
                          }}
                          className="flex items-center gap-3 w-full text-left py-2.5 px-2 bg-transparent"
                        >
                          <LevelBadge
                            level={row.sharer_level || 1}
                            avatar={row.sharer_avatar || ''}
                            name={who}
                            layout="fixed"
                            circleSize={CHAT_PROFILE_RING_PX}
                            size={CHAT_LEVEL_PILL_SIZE_PX}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gold-bright truncate">{who}</p>
                            <p className="text-gold-bright/70 text-xs truncate">
                              Shared {hostLabel}&apos;s live with you · Tap to watch
                            </p>
                          </div>
                        </button>
                      );
                    })
                )}
            </div>
            )}

            {/* Activity — likes, comments, saves, mentions from /api/activity */}
            {activeFilter === 'activity' && (
              <>
                {activityItems.length === 0 ? (
                  <div className="py-8 text-center text-gold-bright/50 text-sm px-2">
                    No activity yet. When someone likes, comments on, saves your video, or @mentions you, it will show here.
                  </div>
                ) : (
                  <div className="space-y-1 pb-4">
                    {activityItems.map((a) => {
                      const actorName = (a.actor_display_name?.trim() || a.actor_username || 'Someone').trim();
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            if (a.video_id) openVideo(a.video_id);
                          }}
                          className="flex items-center gap-3 w-full text-left py-2.5 px-2 bg-transparent"
                        >
                          <div className="w-12 h-12 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center flex-shrink-0 overflow-hidden relative" style={{ transform: 'translateY(4mm)' }}>
                            {a.actor_avatar_url ? (
                              <img src={a.actor_avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[#F5F5F7] font-bold text-lg">{actorName.replace('@', '').charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gold-bright truncate">{actorName}</p>
                            <p className="text-gold-bright/70 text-xs truncate">{activityLine(a)}{a.video_id ? ' · Tap to view' : ''}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Live / system notifications — never followers (New followers hub) or like/comment (Activity) */}
            {(activeFilter === 'main') && notifications
                .filter(n => !isFollowNotification(n))
                .filter(n => n.type !== 'like' && n.type !== 'comment')
                .filter(n => (n.type === 'system' || n.type === 'live_started') && !(n.body?.toLowerCase?.().includes('check out this profile') || n.action_url?.includes('/profile/' + currentUserId)))
                .map(notif => {
                const liveNotif = isLiveStartedNotification(notif);
                const liveAvatar = liveNotif ? resolveLiveNotifAvatar(notif) : '';
                const liveInitial = (notif.title || '?').replace(/\s+is live.*$/i, '').trim().charAt(0).toUpperCase() || '?';
                return (
                <button key={notif.id} onClick={() => { if (notif.action_url) openActionUrl(notif.action_url); }} className="flex items-center gap-3 w-full text-left py-2 px-2">
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
                        <Archive className="w-6 h-6 stroke-gold-metallic" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm text-gold-metallic">{notif.title}</h3>
                        <p className="text-gold-bright text-xs truncate">{notif.body}</p>
                    </div>
                    <span className="text-[10px] text-gold-bright">{notif.created_at ? formatTimeAgo(notif.created_at) : ''}</span>
                </button>
                );
            })}

             {/* Starred empty state */}
             {activeFilter === 'starred' && (
               <div className="py-8 text-center text-gold-bright/50 text-sm">No starred messages yet.</div>
             )}

             {/* Shop Notification */}
             {activeFilter === 'main' && notifications.filter(n => n.type === 'shop').map(notif => (
                <button key={notif.id} onClick={goShop} className="flex items-center gap-3 w-full text-left">
                    <div className="w-12 h-12 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center">
                        <ShoppingBag className="w-6 h-6 text-[#F5F5F7]" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm text-gold-metallic">{notif.title}</h3>
                        <p className="text-gold-bright text-xs truncate">{notif.body}</p>
                    </div>
                    <span className="text-[10px] text-gold-bright">{notif.created_at ? formatTimeAgo(notif.created_at) : ''}</span>
                </button>
            ))}
             
        </div>
        </div>
      </div>

      {/* Followers — full page on same fundal, no sheet box */}
      {showNewFollowersPanel && createPortal(
        <div className="page-above-bottom-nav bg-transparent z-[101] pointer-events-auto">
          <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto bg-transparent new-followers-panel-scroll">
              <div className="px-3 pt-page-header pb-1 flex items-center justify-between relative bg-transparent">
                <div className="w-8" aria-hidden />
                <h2 className="text-sm font-bold text-gold-bright absolute left-1/2 transform -translate-x-1/2">
                  Followers ({followersCount})
                </h2>
                <button
                  type="button"
                  onClick={closeNewFollowersPanel}
                  className="p-1 z-10"
                  title="Close"
                  aria-label="Close followers"
                >
                  <RoyceBackIcon />
                </button>
              </div>
              {myNewFollowers.length === 0 ? (
              <p className="text-gold-bright/50 text-sm py-6 text-center px-4">No one follows you yet. When they do, they’ll show here.</p>
            ) : (
              <div className="space-y-0.5 pb-4 px-4 bg-transparent">
                {myNewFollowers.map((f) => (
                    <div
                      key={f.user_id}
                      className="flex items-center gap-2 w-full py-2.5 px-0 bg-transparent"
                    >
                      <button
                        type="button"
                        className="flex items-center gap-3 flex-1 min-w-0 text-left bg-transparent"
                        onClick={() => openFollowerProfile(f.user_id)}
                      >
                        <div className="relative w-11 h-11 rounded-full bg-transparent flex items-center justify-center overflow-hidden flex-shrink-0">
                          {f.avatar_url ? (
                            <img src={f.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[#F5F5F7] font-bold text-lg">{(f.display_name || f.username || 'U').charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gold-bright truncate">{f.display_name || f.username || 'User'}</p>
                          <p className="text-gold-bright/60 text-xs truncate">@{f.username}</p>
                        </div>
                      </button>
                      {currentUserId && f.user_id !== currentUserId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleFollowToggle(f.user_id);
                          }}
                          className={`shrink-0 px-2 py-1.5 text-xs font-bold bg-transparent border-0 ${
                            iFollowIds.has(f.user_id)
                              ? 'text-gold-bright/45'
                              : 'text-gold-bright'
                          }`}
                        >
                          {iFollowIds.has(f.user_id) ? 'Following' : 'Follow'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="p-1 flex-shrink-0 bg-transparent"
                        onClick={() => openFollowerProfile(f.user_id)}
                        aria-label="Open profile"
                      >
                        <ChevronRight className="w-5 h-5 text-gold-bright/70" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}