import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { request } from '../lib/apiClient';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import { nativeConfirm } from '../components/NativeDialog';
import { Heart, UserPlus, Search, ShoppingBag, Archive, X, ChevronRight, Trash2, Bookmark, MessageCircle, AtSign, Share2 } from 'lucide-react';
import { AvatarRing } from '../components/AvatarRing';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { showToast } from '../lib/toast';

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'gift' | 'battle_invite' | 'system' | 'shop';
  actor_id: string;
  actor?: { username: string; avatar_url: string | null };
  title: string;
  body: string | null;
  image_url: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  rawData?: any;
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
  const deletedThreadIdsRef = useRef<Set<string>>(new Set());

  const INBOX_DELETED_KEY = () => `elix_inbox_deleted_${currentUserId || ''}`;
  const getDeletedThreadIds = (): Set<string> => {
    if (typeof localStorage === 'undefined' || !currentUserId) return new Set();
    try {
      const raw = localStorage.getItem(INBOX_DELETED_KEY());
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as string[];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  };
  const addDeletedThreadId = (id: string) => {
    const set = getDeletedThreadIds();
    set.add(id);
    deletedThreadIdsRef.current = set;
    try { localStorage.setItem(INBOX_DELETED_KEY(), JSON.stringify([...set])); } catch {}
  };


  useEffect(() => {
    setCurrentUserId(user?.id ?? null);
  }, [user?.id]);

  const loadMyFollowingIds = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const { data: body, error } = await request(`/api/profiles/${encodeURIComponent(currentUserId)}/following`);
      if (error) return;
      const ids: string[] = Array.isArray(body?.following) ? body.following : [];
      setIFollowIds(new Set(ids));
    } catch {
      /* ignore */
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
        const endpoint = wasFollowing
          ? `/api/profiles/${encodeURIComponent(targetUserId)}/unfollow`
          : `/api/profiles/${encodeURIComponent(targetUserId)}/follow`;
        const { error: followErr } = await request(endpoint, { method: 'POST' });
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

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    deletedThreadIdsRef.current = getDeletedThreadIds();
    const fetchNotifications = async () => {
      try {
        const { data } = await request('/api/notifications');
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : (data?.notifications ?? []);
        setNotifications(rows
          .filter((n: any) => n.type !== 'battle_invite' && n.type !== 'cohost_invite' && n.type !== 'battle_accepted' && n.type !== 'cohost_accepted')
          .map((n: any) => ({
          id: n.id,
          type: n.type || 'system',
          actor_id: n.data?.actor_id || '',
          title: n.title || 'Notification',
          body: n.body,
          image_url: n.data?.image_url || n.data?.host_avatar || n.data?.avatar_url || null,
          action_url: n.data?.action_url || null,
          is_read: n.is_read ?? n.read ?? false,
          created_at: n.created_at,
          rawData: n.data || {},
        })));
      } catch { /* ignore */ }
    };
    const fetchConversations = async () => {
      try {
        const { data: body, error: convError } = await request('/api/chat/threads');
        if (cancelled) return;
        if (convError) {
          setConversations([]);
          return;
        }
        const rows = Array.isArray(body?.threads) ? body.threads : (Array.isArray(body?.data) ? body.data : []);
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
          if (getDeletedThreadIds().has(c.id)) return false;
          return true;
        });
        setConversations(filtered);
      } catch {
        if (!cancelled) setConversations([]);
      }
    };
    const fetchFollowers = async () => {
      try {
        const { data: backendBody, error: followersErr } = await request(
          `/api/profiles/${encodeURIComponent(currentUserId)}/followers`,
        );
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
        setFollowers(list.length > 0 ? list : ids.filter((id) => id !== currentUserId).map((user_id) => ({ user_id, username: 'user', display_name: null, avatar_url: null })));
      } catch {
        if (!cancelled) setFollowers([]);
      }
    };
    const fetchSuggestedUsers = async () => {
      try {
        const [profilesResult, liveResult] = await Promise.all([
          request('/api/profiles'),
          request('/api/live/streams').catch(() => ({ data: null, error: null })),
        ]);
        if (cancelled) return;
        const profilesBody = profilesResult.data ?? { profiles: [] };
        const liveBody = liveResult.data ?? { streams: [] };
        const liveSet = new Set<string>((liveBody?.streams || []).map((s: any) => s.userId || s.user_id).filter(Boolean));
        setLiveUserIds(liveSet);

        const rows = Array.isArray(profilesBody?.profiles) ? profilesBody.profiles : [];
        const blocklist = ['', 'user', 'demo', 'test', 'unknown', 'anonymous', 'guest'];
        const mapped: SuggestedUser[] = rows
          .map((p: any) => ({
            id: p.user_id || p.userId,
            username: p.username || 'user',
            name: p.display_name || p.displayName || p.username || 'User',
            avatar_url: p.avatar_url || p.avatarUrl,
            is_live: liveSet.has(p.user_id || p.userId),
          }))
          .filter((p) => !!p.id && p.id !== currentUserId)
          .filter((p) => {
            const name = (p.name || p.username || '').trim().toLowerCase();
            return name !== '' && !blocklist.includes(name) && name.length >= 2;
          });

        mapped.sort((a, b) => (a.is_live === b.is_live ? 0 : a.is_live ? -1 : 1));
        setSuggestedUsers(mapped);
      } catch {
        if (!cancelled) setSuggestedUsers([]);
      }
    };
    const fetchActivity = async () => {
      try {
        const { data: body, error: actError } = await request('/api/activity');
        if (cancelled) return;
        if (actError) {
          setActivityItems([]);
          return;
        }
        const raw = Array.isArray(body?.activities) ? body.activities : [];
        const list: ActivityItem[] = raw
          .filter((a: any) => a && (a.kind === 'like' || a.kind === 'comment' || a.kind === 'save' || a.kind === 'mention'))
          .map((a: any) => ({
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
        const { data: body, error: lsError } = await request('/api/inbox/live-share-requests');
        if (cancelled) return;
        if (lsError) {
          setLiveShareRequests([]);
          return;
        }
        const raw = Array.isArray(body?.items) ? body.items : [];
        setLiveShareRequests(
          raw.map((row: Record<string, unknown>) => ({
            sharer_id: String(row.sharer_id ?? ''),
            stream_key: String(row.stream_key ?? ''),
            host_user_id: String(row.host_user_id ?? ''),
            host_name: String(row.host_name ?? ''),
            host_avatar: String(row.host_avatar ?? ''),
            sharer_name: String(row.sharer_name ?? ''),
            sharer_avatar: String(row.sharer_avatar ?? ''),
            created_at: String(row.created_at ?? ''),
          })),
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
    return () => { cancelled = true; };
  }, [currentUserId, location.pathname]);

  const isRealUser = (f: FollowerProfile) => {
    const name = (f.display_name || f.username || '').trim().toLowerCase();
    const blocklist = ['', 'user', 'demo', 'test', 'unknown', 'anonymous', 'guest'];
    return name !== '' && !blocklist.includes(name) && name.length >= 2;
  };

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

  const activitySummaryCount =
    activityItems.length > 0
      ? activityItems.length
      : notifications.filter((n) => n.type === 'like' || n.type === 'comment').length;

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
    <div className="fixed inset-0 bg-[#13151A] flex justify-center">
      <div
        className="w-full max-w-[480px] flex flex-col overflow-hidden h-above-bottom-nav"
        style={{ marginTop: 0 }}
      >

        {/* Header + Circles with gold frame — same as Friends */}
        <div className="mx-2 mt-2 bg-[#13151A] z-10">
        <div className="px-3 pt-[env(safe-area-inset-top,8px)] pb-1 flex items-center justify-between relative">
          <div className="flex items-center gap-3 z-10">
            <button onClick={() => navigate('/search')} aria-label="Search"><Search size={18} className="text-white" /></button>
          </div>
          <h1 className="text-sm font-bold text-white absolute left-1/2 transform -translate-x-1/2">Inbox</h1>
          <button
            type="button"
            onClick={() => navigate("/feed", { replace: true })}
            className="p-1 z-10"
            title="Close"
            aria-label="Close inbox and go to For You"
          >
            <img src="/Icons/Gold power buton.png" alt="" className="w-5 h-5" />
          </button>
        </div>

        {/* Circles — Followers hub first; suggested + per-follower avatars scroll to the right */}
        <div className="px-3 py-2">
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
                <button
                    type="button"
                    onClick={() => setShowNewFollowersPanel(true)}
                    className="flex-shrink-0 flex flex-col items-center gap-1" style={{ width: 95, minWidth: 95 }}
                >
                    <StoryGoldRingAvatar
                        data-avatar-circle="followers"
                        alt="Followers"
                        src={
                            myNewFollowers[0]?.avatar_url ||
                            user?.avatar ||
                            (user?.id && typeof localStorage !== 'undefined' ? localStorage.getItem('elix_avatar_' + user.id) : null) ||
                            '/Icons/Profile icon.png'
                        }
                    />
                    <div className="text-[11px] text-white/80 truncate w-full text-center">Followers</div>
                    <div className="text-[10px] text-[#C9A96E]/90 truncate w-full text-center">{followersCount}</div>
                </button>

                {/* Suggested (Friends-style); skip users already shown as followers */}
                {suggestedUsersNotFollowers.map((u) => (
                    <button
                        key={u.id}
                        type="button"
                        onClick={() => u.is_live ? navigate(`/watch/${u.id}`) : navigate(`/profile/${u.id}`)}
                        className="flex-shrink-0 flex flex-col items-center gap-1" style={{ width: 95, minWidth: 95 }}
                    >
                        <StoryGoldRingAvatar
                            live={u.is_live}
                            data-avatar-circle={u.is_live ? 'live' : undefined}
                            src={u.avatar_url || '/Icons/Profile icon.png'}
                            alt={u.name || u.username}
                        />
                        <div className="text-[11px] text-white/80 truncate w-full text-center">{u.name || u.username}</div>
                    </button>
                ))}

                {followersListForUi.map((f) => {
                    const fLive = liveUserIds.has(f.user_id);
                    return (
                    <button
                        key={f.user_id}
                        type="button"
                        onClick={() => fLive ? navigate(`/watch/${f.user_id}`) : navigate(`/profile/${f.user_id}`)}
                        className="flex-shrink-0 flex flex-col items-center gap-1" style={{ width: 95, minWidth: 95 }}
                    >
                        <StoryGoldRingAvatar
                            live={fLive}
                            data-avatar-circle={fLive ? 'live' : undefined}
                            src={f.avatar_url || '/Icons/Profile icon.png'}
                            alt={f.display_name || f.username || 'User'}
                        />
                        <div className="text-[11px] text-white/80 truncate w-full text-center">{f.display_name || f.username || 'User'}</div>
                    </button>
                    );
                })}
            </div>
        </div>
        </div>

        {/* Filters */}
        <div className="pl-[calc(1rem+22mm)] pr-4 py-2 flex items-center justify-center gap-2 overflow-x-auto no-scrollbar mb-2" style={{ marginLeft: '-20mm' }}>
            <button onClick={() => setActiveFilter('main')} className={`px-4 py-1.5 rounded text-xs font-bold whitespace-nowrap border text-white ${activeFilter === 'main' ? 'bg-[#13151A] border-gold-metallic' : 'bg-[#13151A] border-[#d4af37]/30'}`}>Main</button>
            <button onClick={() => setActiveFilter('requests')} className={`px-4 py-1.5 rounded text-xs font-bold whitespace-nowrap border text-white ${activeFilter === 'requests' ? 'bg-[#13151A] border-gold-metallic' : 'bg-[#13151A] border-[#d4af37]/30'}`}>Requests</button>
            <button onClick={() => setActiveFilter('unread')} className={`px-4 py-1.5 rounded text-xs font-bold whitespace-nowrap border text-white ${activeFilter === 'unread' ? 'bg-[#13151A] border-gold-metallic' : 'bg-[#13151A] border-[#d4af37]/30'}`}>Unread</button>
            <button onClick={() => setActiveFilter('starred')} className={`px-4 py-1.5 rounded text-xs font-bold whitespace-nowrap border text-white ${activeFilter === 'starred' ? 'bg-[#13151A] border-gold-metallic' : 'bg-[#13151A] border-[#d4af37]/30'}`}>Starred</button>
            <button onClick={() => setActiveFilter('activity')} className={`px-4 py-1.5 rounded text-xs font-bold whitespace-nowrap border text-white ${activeFilter === 'activity' ? 'bg-[#13151A] border-gold-metallic' : 'bg-[#13151A] border-[#d4af37]/30'}`}>Activity</button>
            <div className="ml-auto stroke-gold-metallic">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
            </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto px-4 py-1 space-y-4">
            
            {activeFilter === 'main' && (
            <>
            {/* New followers — tap to open panel with all people who follow you */}
            <button
                type="button"
                onClick={() => setShowNewFollowersPanel(true)}
                className="flex items-center gap-3 w-full text-left py-2 px-2 rounded-lg hover:bg-white/5 active:bg-white/10"
            >
                <div className="relative w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img src="/Icons/Profile icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
                    <UserPlus className="w-6 h-6 text-[#C9A96E] relative z-10" strokeWidth={2} style={{ transform: 'translate(0.5mm, -0.5mm)' }} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-gold-metallic">New followers</h3>
                    <p className="text-white/70 text-xs truncate">
                        {followersCount === 0
                            ? 'No new followers yet'
                            : `${followersCount} people follow you`}
                    </p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#C9A96E]/70 flex-shrink-0" />
            </button>

            {/* Activity - golden circle from Music Icon (likes, comments) */}
            <button onClick={() => setActiveFilter('activity')} className="flex items-center gap-3 w-full text-left py-2 px-2 rounded-lg hover:bg-white/5 active:bg-white/10">
                <div className="relative w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
                    <Heart className="w-6 h-6 text-[#C9A96E] relative z-10" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-gold-metallic">Activity</h3>
                    <p className="text-white text-xs truncate">
                      {activitySummaryCount > 0
                        ? `${activitySummaryCount} likes, comments & saves`
                        : 'No recent activity'}
                    </p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#C9A96E]/70 flex-shrink-0" />
            </button>

            {activityItems.length > 0 && (
              <div className="space-y-0.5 pl-2">
                {activityItems.slice(0, 5).map((a) => {
                  const actorName = (a.actor_display_name?.trim() || a.actor_username || 'Someone').trim();
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => { if (a.video_id) navigate(`/video/${encodeURIComponent(a.video_id)}`); }}
                      className="flex items-center gap-2.5 w-full text-left py-1.5 px-2 rounded-lg hover:bg-white/5 active:bg-white/10"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#13151A] border border-[#C9A96E]/30 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                        {a.actor_avatar_url ? (
                          <img src={a.actor_avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[#C9A96E] font-bold text-sm">{actorName.replace('@', '').charAt(0).toUpperCase()}</span>
                        )}
                        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#13151A] border border-[#C9A96E]/50 flex items-center justify-center">
                          {a.kind === 'save' ? (
                            <Bookmark className="w-2 h-2 text-[#C9A96E]" strokeWidth={2.5} />
                          ) : a.kind === 'comment' ? (
                            <MessageCircle className="w-2 h-2 text-[#C9A96E]" strokeWidth={2.5} />
                          ) : a.kind === 'mention' ? (
                            <AtSign className="w-2 h-2 text-[#C9A96E]" strokeWidth={2.5} />
                          ) : (
                            <Heart className="w-2 h-2 text-[#C9A96E]" fill="currentColor" strokeWidth={0} />
                          )}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white truncate"><span className="font-semibold">{actorName}</span> <span className="text-white/60">{activityLine(a)}</span></p>
                      </div>
                    </button>
                  );
                })}
                {activityItems.length > 5 && (
                  <button type="button" onClick={() => setActiveFilter('activity')} className="text-[11px] text-[#C9A96E]/70 font-medium pl-2 py-1">
                    View all activity →
                  </button>
                )}
              </div>
            )}

            {/* Messages (Inbox) — show right after Activity so inbox = messages */}
            <div className="space-y-1 pt-2">
                <h3 className="font-bold text-sm text-gold-metallic px-1 pb-2">Messages</h3>
                {conversations.length === 0 ? (
                    <p className="text-white/50 text-xs px-1 py-2">No messages yet</p>
                ) : (
                    conversations.map((conv) => (
                        <div key={conv.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/5 active:bg-white/10 group">
                            <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/inbox/${conv.id}`)}>
                                <AvatarRing src={conv.otherUser?.avatar_url || ''} alt={conv.otherUser?.display_name || conv.otherUser?.username || 'User'} size={48} />
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm text-white truncate flex items-center gap-1.5">
                                      {conv.otherUser?.display_name || conv.otherUser?.username || 'User'}
                                      {conv.hasUnread ? (
                                        <span className="inline-block w-2 h-2 rounded-full bg-[#C9A96E] flex-shrink-0" title="Unread" aria-label="Unread messages" />
                                      ) : null}
                                    </p>
                                    <p className="text-white/60 text-xs truncate">{conv.lastMessage || 'No messages yet'}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    const ok = await nativeConfirm('Delete this conversation? Messages will be removed.', 'Delete Conversation');
                                    if (!ok) return;
                                    try {
                                      const { error: delError } = await request(`/api/chat/threads/${encodeURIComponent(conv.id)}`, {
                                        method: 'DELETE',
                                      });
                                      if (delError) showToast('Could not delete');
                                      else {
                                        addDeletedThreadId(conv.id);
                                        setConversations((prev) => prev.filter((c) => c.id !== conv.id));
                                      }
                                    } catch {
                                      showToast('Could not delete');
                                    }
                                }}
                                className="w-10 h-10 rounded-full bg-[#13151A] border border-[#C9A96E]/40 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform hover:border-red-500/50 hover:bg-red-500/10"
                                title="Delete conversation"
                                aria-label="Delete conversation"
                            >
                                <Trash2 size={18} className="text-[#C9A96E]/90 hover:text-red-400" />
                            </button>
                        </div>
                    ))
                )}
            </div>
            </>
            )}

            {/* Unread — chats with messages you haven’t opened yet (server tracks read state) */}
            {activeFilter === 'unread' && (
            <div className="space-y-1 pt-2">
                <h3 className="font-bold text-sm text-gold-metallic px-1 pb-2">Unread messages</h3>
                <p className="text-white/45 text-[11px] px-1 pb-3 leading-snug">
                  Chats appear here when someone messaged you and you haven’t opened the conversation yet. Opening a chat marks those messages as read.
                </p>
                {conversations.filter((c) => c.hasUnread).length === 0 ? (
                    <p className="text-white/50 text-xs px-1 py-2">You’re all caught up.</p>
                ) : (
                    conversations.filter((c) => c.hasUnread).map((conv) => (
                        <div key={conv.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/5 active:bg-white/10 group">
                            <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/inbox/${conv.id}`)}>
                                <AvatarRing src={conv.otherUser?.avatar_url || ''} alt={conv.otherUser?.display_name || conv.otherUser?.username || 'User'} size={48} />
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm text-white truncate">{conv.otherUser?.display_name || conv.otherUser?.username || 'User'}</p>
                                    <p className="text-white/60 text-xs truncate">
                                      {(conv.unreadCount ?? 0) > 1
                                        ? `${conv.unreadCount} unread · ${conv.lastMessage || 'Tap to open'}`
                                        : conv.lastMessage
                                          ? `Unread · ${conv.lastMessage}`
                                          : 'Unread — tap to open'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    const ok = await nativeConfirm('Delete this conversation? Messages will be removed.', 'Delete Conversation');
                                    if (!ok) return;
                                    try {
                                      const { error: delError } = await request(`/api/chat/threads/${encodeURIComponent(conv.id)}`, {
                                        method: 'DELETE',
                                      });
                                      if (delError) showToast('Could not delete');
                                      else {
                                        addDeletedThreadId(conv.id);
                                        setConversations((prev) => prev.filter((c) => c.id !== conv.id));
                                      }
                                    } catch {
                                      showToast('Could not delete');
                                    }
                                }}
                                className="w-10 h-10 rounded-full bg-[#13151A] border border-[#C9A96E]/40 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform hover:border-red-500/50 hover:bg-red-500/10"
                                title="Delete conversation"
                                aria-label="Delete conversation"
                            >
                                <Trash2 size={18} className="text-[#C9A96E]/90 hover:text-red-400" />
                            </button>
                        </div>
                    ))
                )}
            </div>
            )}

            {/* Requests — live shares from people you don’t follow (Main stays for people you follow / DMs) */}
            {activeFilter === 'requests' && (
            <div className="space-y-1 pt-2">
                <h3 className="font-bold text-sm text-gold-metallic px-1 pb-2">Requests</h3>
                <p className="text-white/45 text-[11px] px-1 pb-3 leading-snug">
                  People who shared a live with you show here when you don’t follow them yet, so your main inbox stays clear.
                </p>
                {liveShareRequests.length === 0 ? (
                    <p className="text-white/50 text-xs px-1 py-2">No live shares right now.</p>
                ) : (
                    liveShareRequests.map((row) => {
                      const who = row.sharer_name?.trim() || 'Someone';
                      const hostLabel = row.host_name?.trim() || 'a creator';
                      return (
                        <button
                          key={`${row.sharer_id}_${row.stream_key}`}
                          type="button"
                          onClick={() => {
                            if (row.stream_key) navigate(`/watch/${encodeURIComponent(row.stream_key)}`);
                          }}
                          className="flex items-center gap-3 w-full text-left py-2.5 px-2 rounded-lg hover:bg-white/5 active:bg-white/10"
                        >
                          <div className="w-12 h-12 rounded-full bg-[#13151A] border border-[#C9A96E]/40 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                            {row.sharer_avatar ? (
                              <img src={row.sharer_avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[#C9A96E] font-bold text-lg">{who.replace('@', '').charAt(0).toUpperCase()}</span>
                            )}
                            <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[#13151A] border border-[#C9A96E]/50 flex items-center justify-center">
                              <Share2 className="w-2.5 h-2.5 text-[#C9A96E]" strokeWidth={2.5} />
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-white truncate">{who}</p>
                            <p className="text-white/70 text-xs truncate">
                              Shared {hostLabel}&apos;s live with you · Tap to watch
                            </p>
                          </div>
                        </button>
                      );
                    })
                )}
            </div>
            )}

            {/* Activity — likes, comments, saves on your videos (API); legacy notifications as fallback */}
            {activeFilter === 'activity' && (
              <>
                {activityItems.length === 0 && notifications.filter((n) => n.type === 'like' || n.type === 'comment').length === 0 ? (
                  <div className="py-8 text-center text-white/50 text-sm px-2">
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
                            if (a.video_id) navigate(`/video/${encodeURIComponent(a.video_id)}`);
                          }}
                          className="flex items-center gap-3 w-full text-left py-2.5 px-2 rounded-lg hover:bg-white/5 active:bg-white/10"
                        >
                          <div className="w-12 h-12 rounded-full bg-[#13151A] border border-[#C9A96E]/40 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                            {a.actor_avatar_url ? (
                              <img src={a.actor_avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[#C9A96E] font-bold text-lg">{actorName.replace('@', '').charAt(0).toUpperCase()}</span>
                            )}
                            <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[#13151A] border border-[#C9A96E]/50 flex items-center justify-center">
                              {a.kind === 'save' ? (
                                <Bookmark className="w-2.5 h-2.5 text-[#C9A96E]" strokeWidth={2.5} />
                              ) : a.kind === 'comment' ? (
                                <MessageCircle className="w-2.5 h-2.5 text-[#C9A96E]" strokeWidth={2.5} />
                              ) : a.kind === 'mention' ? (
                                <AtSign className="w-2.5 h-2.5 text-[#C9A96E]" strokeWidth={2.5} />
                              ) : (
                                <Heart className="w-2.5 h-2.5 text-[#C9A96E]" fill="currentColor" strokeWidth={0} />
                              )}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-white truncate">{actorName}</p>
                            <p className="text-white/70 text-xs truncate">{activityLine(a)}{a.video_id ? ' · Tap to view' : ''}</p>
                          </div>
                        </button>
                      );
                    })}
                    {activityItems.length === 0 &&
                      notifications
                        .filter((n) => n.type === 'like' || n.type === 'comment')
                        .map((notif) => {
                          const actorName =
                            notif.rawData?.actor_display_name ||
                            (notif.rawData?.actor_username ? `@${notif.rawData.actor_username}` : null) ||
                            notif.title ||
                            'Someone';
                          const actionUrl = notif.action_url || notif.rawData?.action_url;
                          return (
                            <button
                              key={notif.id}
                              type="button"
                              onClick={() => {
                                if (actionUrl) navigate(actionUrl);
                              }}
                              className="flex items-center gap-3 w-full text-left py-2.5 px-2 rounded-lg hover:bg-white/5 active:bg-white/10"
                            >
                              <div className="w-12 h-12 rounded-full bg-[#13151A] border border-[#C9A96E]/40 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                {notif.image_url || notif.rawData?.avatar_url ? (
                                  <img src={notif.image_url || notif.rawData?.avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[#C9A96E] font-bold text-lg">{(actorName || '?').replace('@', '').charAt(0).toUpperCase()}</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-white truncate">{actorName}</p>
                                <p className="text-white/70 text-xs truncate">
                                  {notif.type === 'like' ? 'liked your video' : 'commented on your video'}
                                  {actionUrl && ' · Tap to view'}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                  </div>
                )}
              </>
            )}

            {/* Battle / Co-host invites: not shown in Inbox — use banner on live page only */}

            {/* System Notification — hide "check out this profile" / profile promo so inbox shows messages, not profile */}
            {(activeFilter === 'main') && notifications
                .filter(n => n.type === 'system' && !(n.body?.toLowerCase?.().includes('check out this profile') || n.action_url?.includes('/profile/' + currentUserId)))
                .map(notif => (
                <button key={notif.id} onClick={() => notif.action_url ? navigate(notif.action_url) : null} className="flex items-center gap-3 w-full text-left">
                    <div className="w-12 h-12 rounded-full bg-[#13151A] border border-[#C9A96E]/40 flex items-center justify-center">
                        <Archive className="w-6 h-6 stroke-gold-metallic" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm text-gold-metallic">{notif.title}</h3>
                        <p className="text-white text-xs truncate">{notif.body}</p>
                    </div>
                    <span className="text-[10px] text-white">{notif.created_at ? formatTimeAgo(notif.created_at) : ''}</span>
                </button>
            ))}

             {/* Starred empty state */}
             {activeFilter === 'starred' && (
               <div className="py-8 text-center text-white/50 text-sm">No starred messages yet.</div>
             )}

             {/* Shop Notification */}
             {notifications.filter(n => n.type === 'shop').map(notif => (
                <button key={notif.id} onClick={() => navigate('/shop')} className="flex items-center gap-3 w-full text-left">
                    <div className="w-12 h-12 rounded-full bg-[#13151A] border border-[#C9A96E]/40 flex items-center justify-center">
                        <ShoppingBag className="w-6 h-6 text-[#C9A96E]" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm text-gold-metallic">{notif.title}</h3>
                        <p className="text-white text-xs truncate">{notif.body}</p>
                    </div>
                    <span className="text-[10px] text-white">{notif.created_at ? formatTimeAgo(notif.created_at) : ''}</span>
                </button>
            ))}
             
        </div>
      </div>

      {/* New followers panel — rendered on top of everything via portal */}
      {showNewFollowersPanel && createPortal(
        <>
          <div
            className="fixed inset-0 bg-black/50 pointer-events-auto z-[100]"
            onClick={() => setShowNewFollowersPanel(false)}
            aria-hidden
          />
          <div className="fixed left-0 right-0 pointer-events-auto max-w-[480px] mx-auto z-[101]" style={{ bottom: 'var(--bottom-ui-reserve)' }}>
            <div className="bg-[#1C1E24]/95 backdrop-blur-md rounded-t-2xl p-3 pb-4 overflow-y-scroll shadow-2xl w-full border-t border-[#C9A96E]/20 new-followers-panel-scroll" style={{ minHeight: 'calc(55dvh - 3cm)', maxHeight: 'calc(min(85dvh, 700px) - 3cm)' }}>
              <div className="mb-3">
                <h2 className="text-lg font-bold text-gold-metallic text-center">Followers ({followersCount})</h2>
              </div>
              {myNewFollowers.length === 0 ? (
              <p className="text-white/50 text-sm py-6 text-center">No one follows you yet. When they do, they’ll show here.</p>
            ) : (
              <div className="space-y-0.5 pb-2">
                {myNewFollowers.map((f) => (
                    <div
                      key={f.user_id}
                      className="flex items-center gap-2 w-full py-2.5 px-2 rounded-lg hover:bg-white/5 active:bg-white/10"
                    >
                      <button
                        type="button"
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        onClick={() => { setShowNewFollowersPanel(false); navigate(`/profile/${f.user_id}`); }}
                      >
                        <div className="relative w-11 h-11 rounded-full bg-[#13151A] flex items-center justify-center overflow-hidden flex-shrink-0 border border-[#C9A96E]/30">
                          {f.avatar_url ? (
                            <img src={f.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[#C9A96E] font-bold text-lg">{(f.display_name || f.username || 'U').charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-white truncate">{f.display_name || f.username || 'User'}</p>
                          <p className="text-white/60 text-xs truncate">@{f.username}</p>
                        </div>
                      </button>
                      {currentUserId && f.user_id !== currentUserId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleFollowToggle(f.user_id);
                          }}
                          className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-bold transition ${
                            iFollowIds.has(f.user_id)
                              ? 'bg-white/10 text-white border border-white/25'
                              : 'bg-[#FF2D55] text-white border border-[#FF2D55]'
                          }`}
                        >
                          {iFollowIds.has(f.user_id) ? 'Following' : 'Follow'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="p-1 rounded-lg hover:bg-white/10 flex-shrink-0"
                        onClick={() => { setShowNewFollowersPanel(false); navigate(`/profile/${f.user_id}`); }}
                        aria-label="Open profile"
                      >
                        <ChevronRight className="w-5 h-5 text-[#C9A96E]/70" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}