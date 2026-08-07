import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RoyceCloseIcon } from '../components/royce';
import { Share2, Menu, Lock, Play, Heart, Sparkles, LogOut, UserPlus, Bookmark, Grid3X3, ShoppingBag, Repeat2, ChevronDown, Search, Copy, MessageCircle, Check, TrendingUp, Flag, Settings } from 'lucide-react';
import { LevelBadge } from '../components/LevelBadge';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { showToast } from '../lib/toast';
import { uploadAvatar } from '../lib/avatarUpload';
import { AvatarRing } from '../components/AvatarRing';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { trackEvent } from '../lib/analytics';
import ReportModal from '../components/ReportModal';
import PromotePanel from '../components/PromotePanel';
import { useVideoStore } from '../store/useVideoStore';
import {
  apiFetchFollowingIds,
  apiFetchLikedVideos,
  apiFetchProfileById,
  apiFetchProfileByUsername,
  apiFetchSavedVideos,
  apiFetchUserVideos,
  apiRegisterProfileView,
  apiToggleFollow,
} from '../features/feed/feedApi';
import { sendDmToUser } from '../lib/chatMessages';
import {
  fetchAllSharePanelContacts,
  SHARE_PANEL_ACTION_DISC_PX,
  SHARE_PANEL_ACTION_ICON_PX,
  SHARE_PANEL_AVATAR_PX,
  SHARE_PANEL_ITEM_WIDTH_PX,
} from '../lib/sharePanelContacts';
import { PROFILE_PAGE_AVATAR_PX } from '../lib/profileFrame';
import { PROFILE_EXIT_TO } from '../lib/settingsNav';
import { getVideoPosterUrl, resolveGridThumbnailUrl, resolveVideoPlaybackUrl } from '../lib/bunnyStorage';
import { openExternalLink } from '../lib/platform';
import { fetchActiveStories, type StoryUserGroup } from '../lib/storiesApi';
import { subscribeVideoCollection } from '../lib/videoCollectionEvents';
import { apiRisingStarsUserBadges } from '../features/risingStars/risingStarsApi';
import { apiShopItemsByUser } from '../features/shop/shopApi';
import { apiLiveSendDailyHeart } from '../features/live/engagement/liveEngagementApi';

interface Video {
  id: string;
  thumbnail_url: string;
  url?: string;
  views: number;
  is_public: boolean;
}

interface ProfileData {
  user_id: string;
  username: string;
  display_name: string | null;
  /** Account email when available (own profile from auth; others only if API provides). */
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
  likes_count: number;
  /** Unique viewers — public profile counter from backend. */
  unique_views: number;
  level?: number;
  is_creator?: boolean;
}

export default function Profile() {
  const navigate = useNavigate();
  const { userId: routeUserId } = useParams<{ userId?: string }>();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const { user, updateUser, signOut } = useAuthStore();
  
  const validTabs = ['videos', 'shop', 'private', 'reposts', 'saved', 'liked'] as const;
  type ProfileTab = typeof validTabs[number];
  const [activeTab, setActiveTab] = useState<ProfileTab>(
    tabParam && validTabs.includes(tabParam as ProfileTab) ? (tabParam as ProfileTab) : 'videos'
  );
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosHasMore, setVideosHasMore] = useState(false);
  const [videosLoadingMore, setVideosLoadingMore] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [shopItems, setShopItems] = useState<{ id: string; title: string; price: number; image_url: string | null }[]>([]);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shareQuery, setShareQuery] = useState('');
  const [showPromotePanel, setShowPromotePanel] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [shareFollowers, setShareFollowers] = useState<{ user_id: string; username: string; avatar_url: string | null }[]>([]);
  const [shareSent, setShareSent] = useState<Set<string>>(new Set());
  const [risingBadges, setRisingBadges] = useState<{ code: string; title: string; kind: string }[]>([]);
  const [profileStoryGroup, setProfileStoryGroup] = useState<StoryUserGroup | null>(null);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerCenterLabelRef = useRef<HTMLDivElement | null>(null);
  /** Prevents duplicate register calls for the same owner within one mount cycle. */
  const registeredViewOwnerRef = useRef<string | null>(null);

  const goBack = useCallback(() => {
    // Own profile (tab): leave to For You. Other profiles: leave to For You too —
    // never history.back() (that reopened Settings after Settings→Profile).
    navigate(PROFILE_EXIT_TO);
  }, [navigate]);

  const goSettings = useCallback(() => {
    setShowAccountMenu(false);
    navigate('/settings');
  }, [navigate]);

  const goLoginAfterSignOut = useCallback(async () => {
    setShowAccountMenu(false);
    await signOut();
    navigate('/login', { replace: true });
  }, [navigate, signOut]);

  const closeAccountMenu = useCallback(() => {
    setShowAccountMenu(false);
  }, []);

  const goAiStudio = useCallback(() => {
    navigate('/ai-studio');
  }, [navigate]);

  const goCreatorLoginDetails = useCallback(() => {
    navigate('/creator/login-details');
  }, [navigate]);

  const goShop = useCallback(() => {
    navigate('/shop');
  }, [navigate]);

  const goUploadStory = useCallback(() => {
    navigate('/upload?type=story');
  }, [navigate]);

  const goUploadStoryFromRing = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      goUploadStory();
    },
    [goUploadStory],
  );

  const goVideo = useCallback(
    (videoId: string) => {
      navigate(`/video/${videoId}`);
    },
    [navigate],
  );

  const goFollowingList = useCallback(() => {
    const id = resolvedUserId || routeUserId || user?.id;
    if (id) navigate(`/profile/${id}/following`);
  }, [navigate, resolvedUserId, routeUserId, user?.id]);

  const goFollowersList = useCallback(() => {
    const id = resolvedUserId || routeUserId || user?.id;
    if (id) navigate(`/profile/${id}/followers`);
  }, [navigate, resolvedUserId, routeUserId, user?.id]);

  const tabVideos = useCallback(() => setActiveTab('videos'), []);
  const tabShop = useCallback(() => setActiveTab('shop'), []);
  const tabPrivate = useCallback(() => setActiveTab('private'), []);
  const tabReposts = useCallback(() => setActiveTab('reposts'), []);
  const tabSaved = useCallback(() => setActiveTab('saved'), []);
  const tabLiked = useCallback(() => setActiveTab('liked'), []);

  const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const isOwnProfile = !routeUserId || routeUserId === user?.id;
  const displayUserId = routeUserId || user?.id;
  const effectiveUserId = resolvedUserId ?? displayUserId;

  const goInbox = useCallback(() => {
    navigate('/inbox');
  }, [navigate]);

  const openThread = useCallback(async () => {
    if (!effectiveUserId) {
      goInbox();
      return;
    }
    try {
      const { apiEnsureDmThread } = await import('../features/chat/chatApi');
      const { threadId, error: threadErr } = await apiEnsureDmThread(effectiveUserId);
      if (!threadErr && threadId) {
        navigate(`/inbox/${threadId}`);
        return;
      }
    } catch {
      // fall through to inbox
    }
    goInbox();
  }, [navigate, effectiveUserId, goInbox]);

  const openSharePanel = async () => {
    setShowSharePanel(true);
    setShareSent(new Set());
    try {
      const rows = await fetchAllSharePanelContacts(user?.id);
      setShareFollowers(rows);
    } catch {
      setShareFollowers([]);
    }
  };

  const sendShareTo = async (targetUserId: string) => {
    if (!user?.id || shareSent.has(targetUserId)) return;
    const profileUrl = `${window.location.origin}/profile/${effectiveUserId}`;
    const msgText = `Check out this profile: ${displayName} ${profileUrl}`;
    const { message, error } = await sendDmToUser(targetUserId, msgText);
    if (!message) {
      showToast(error || 'Failed to send');
      return;
    }
    setShareSent((prev) => new Set(prev).add(targetUserId));
  };
  
  const _isFallback = (n: string | null | undefined) =>
    !n || /^User [0-9a-f]{8}$/i.test(n) || /^user_[0-9a-f]{8}$/i.test(n);
  /** Real display name from account/profile — never put this in the top header. */
  const _rawDisplay = isOwnProfile
    ? (user?.name || profileData?.display_name || profileData?.username || user?.username || 'User')
    : (profileData?.display_name || profileData?.username || displayUserId || 'User');
  const displayName = _isFallback(_rawDisplay)
    ? (user?.name || profileData?.display_name || profileData?.username || user?.username || _rawDisplay)
    : _rawDisplay;
  const rawUsername = isOwnProfile
    ? (profileData?.username || user?.username || user?.email?.split('@')[0] || 'user')
    : (profileData?.username || 'user');
  const displayUsername = (rawUsername || '').replace(/^@+/, '');
  /** Local part + @ only (e.g. info@) — never show domain. */
  const profileEmailLine = (() => {
    const ownEmail = (isOwnProfile ? user?.email : null) || profileData?.email || '';
    const trimmed = String(ownEmail).trim();
    if (trimmed.includes('@')) return `${trimmed.split('@')[0]}@`;
    return displayUsername ? `${displayUsername}@` : '';
  })();
  const localAvatar = isOwnProfile && user?.id ? localStorage.getItem('elix_avatar_' + user.id) : null;
  const isHttpUrl = (s: string | null | undefined) => !!s && /^https?:\/\//i.test(s.trim());
  /** Prefer CDN/http URLs from server; avoid stale giant data: URLs in localStorage masking the real profile. */
  const displayAvatar = isOwnProfile
    ? (
        (isHttpUrl(profileData?.avatar_url) ? (profileData as NonNullable<typeof profileData>).avatar_url : null) ||
        (isHttpUrl(user?.avatar) ? user.avatar : null) ||
        (localAvatar && !localAvatar.startsWith('data:') ? localAvatar : null) ||
        localAvatar ||
        profileData?.avatar_url ||
        user?.avatar ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`
      )
    : (profileData?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`);

  useEffect(() => {
    if (!displayUserId) {
      setLoading(false);
      setResolvedUserId(null);
      return;
    }
    if (isUuid(displayUserId)) {
      setResolvedUserId(displayUserId);
      return;
    }
    let cancelled = false;
    const usernameClean = (displayUserId || '').replace(/^@+/, '');
    apiFetchProfileByUsername(usernameClean)
      .then(({ body, error }) => {
        if (cancelled) return;
        if (error || !body) {
          setResolvedUserId(null);
          setProfileData(null);
          setLoading(false);
          return;
        }
        const profile = body?.profile as { userId?: string } | undefined;
        const uid = profile?.userId || (body?.user_id as string | undefined);
        if (uid) setResolvedUserId(uid);
        else {
          setResolvedUserId(null);
          setProfileData(null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedUserId(null);
        setProfileData(null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [displayUserId]);


  useEffect(() => {
    if (!effectiveUserId) return;
    setLoading(true);
    loadProfile();
    loadVideos();
    apiRisingStarsUserBadges(effectiveUserId)
      .then(({ badges }) => {
        const list = Array.isArray(badges) ? badges : [];
        setRisingBadges(
          list.map((b: { code?: string; title?: string; kind?: string }) => ({
            code: String(b.code || ""),
            title: String(b.title || b.code || "Badge"),
            kind: String(b.kind || ""),
          })),
        );
      })
      .catch(() => setRisingBadges([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, activeTab]);

  useEffect(() => {
    if (!effectiveUserId) {
      setProfileStoryGroup(null);
      return;
    }
    let cancelled = false;
    void fetchActiveStories().then((groups) => {
      if (cancelled) return;
      setProfileStoryGroup(groups.find((g) => g.userId === effectiveUserId) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveUserId]);

  // Keep Profile liked/saved grids in sync with feed/action-menu toggles.
  useEffect(() => {
    if (!isOwnProfile) return;
    return subscribeVideoCollection((ev) => {
      if (ev.type === 'refresh') {
        if (
          ev.collection === 'all' ||
          (ev.collection === 'saved' && activeTab === 'saved') ||
          (ev.collection === 'liked' && activeTab === 'liked')
        ) {
          void loadVideos();
        }
        return;
      }
      if (ev.type === 'saved' && activeTab === 'saved') {
        if (!ev.saved) {
          setVideos((prev) => prev.filter((v) => v.id !== ev.videoId));
        } else {
          void loadVideos();
        }
        return;
      }
      if (ev.type === 'liked' && activeTab === 'liked') {
        if (!ev.liked) {
          setVideos((prev) => prev.filter((v) => v.id !== ev.videoId));
        } else {
          void loadVideos();
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwnProfile, activeTab]);

  const loadProfile = async () => {
    if (!effectiveUserId) { setLoading(false); return; }

    try {
      const fallback: ProfileData = {
        user_id: effectiveUserId,
        username: user?.username || user?.email?.split('@')[0] || 'user',
        display_name: user?.name || user?.email?.split('@')[0] || 'User',
        email: isOwnProfile ? (user?.email || null) : null,
        avatar_url: user?.avatar || null,
        bio: null,
        followers_count: 0,
        following_count: 0,
        likes_count: 0,
        unique_views: 0,
        is_creator: false,
      };

      const { body, error } = await apiFetchProfileById(effectiveUserId);
      if (error || !body) {
        setProfileData(effectiveUserId === user?.id ? fallback : null);
        setLoading(false);
        return;
      }

      const p = body?.profile as {
        userId?: string;
        username?: string;
        displayName?: string;
        avatarUrl?: string;
        bio?: string;
        email?: string;
        followers?: number;
        followers_count?: number;
        following?: number;
        following_count?: number;
        uniqueProfileViews?: number;
        unique_profile_views?: number;
        level?: number;
        isVerified?: boolean;
      } | undefined;
      if (!p) {
        setProfileData(effectiveUserId === user?.id ? fallback : null);
        setLoading(false);
        return;
      }

      const data: ProfileData = {
        user_id: p.userId || effectiveUserId,
        username: p.username || fallback.username,
        display_name: p.displayName || fallback.display_name,
        email:
          (typeof p.email === 'string' && p.email.includes('@') ? p.email : null) ||
          (effectiveUserId === user?.id ? user?.email || null : null),
        avatar_url: p.avatarUrl || fallback.avatar_url,
        bio: p.bio || null,
        followers_count: Number(p.followers ?? p.followers_count) || 0,
        following_count: Number(p.following ?? p.following_count) || 0,
        likes_count: 0,
        unique_views: Number(p.uniqueProfileViews ?? p.unique_profile_views) || 0,
        level: Number(p.level) || 1,
        is_creator: p.isVerified || false,
      };

      try {
        const { videos: vids } = await apiFetchUserVideos(effectiveUserId);
        data.likes_count = vids.reduce<number>(
          (sum: number, v: unknown) =>
            sum + Number((v as { likes?: number })?.likes || 0),
          0,
        );
      } catch { /* intentionally empty */ }

      setProfileData(data);
      trackEvent('profile_view', { user_id: effectiveUserId, is_own: isOwnProfile });

      // Backend registers unique viewers + total visits. Client never increments locally.
      if (user?.id && registeredViewOwnerRef.current !== effectiveUserId) {
        registeredViewOwnerRef.current = effectiveUserId;
        void apiRegisterProfileView(effectiveUserId).then((reg) => {
          if (reg.error) return;
          setProfileData((prev) =>
            prev && prev.user_id === effectiveUserId
              ? { ...prev, unique_views: reg.uniqueViews }
              : prev,
          );
        });
      }

      if (!isOwnProfile && user?.id) {
        await checkFollowing(data.user_id);
      }
    } catch (_) {
      if (effectiveUserId === user?.id) {
        setProfileData({
          user_id: effectiveUserId,
          username: user?.username || user?.email?.split('@')[0] || 'user',
          display_name: user?.name || user?.email?.split('@')[0] || 'User',
          email: user?.email || null,
          avatar_url: user?.avatar || null,
          bio: null,
          followers_count: 0,
          following_count: 0,
          likes_count: 0,
          unique_views: 0,
          is_creator: false,
        } as ProfileData);
      } else {
        setProfileData(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadVideos = async () => {
    if (!effectiveUserId) return;
    setVideosLoading(true);
    try {
      if (activeTab === 'shop') {
        setVideos([]);
        try {
          const { items, error } = await apiShopItemsByUser(effectiveUserId);
          if (error) {
            setShopItems([]);
            showToast('Failed to load shop items');
          } else {
            setShopItems(items.map((i: { id: string; title?: string; price?: number | string; image_url?: string | null }) => ({
              id: i.id,
              title: i.title || '',
              price: typeof i.price === 'number' ? i.price : parseFloat(i.price) || 0,
              image_url: i.image_url || null,
            })));
          }
        } catch {
          setShopItems([]);
          showToast('Failed to load shop items');
        }
        setVideosLoading(false);
        return;
      }

      if (activeTab === 'videos' || activeTab === 'private') {
        const { videos: allVids, error } = await apiFetchUserVideos(effectiveUserId);
        if (error) { setVideos([]); setVideosLoading(false); return; }
        const filtered = activeTab === 'private'
          ? allVids.filter((v: { privacy?: string }) => v.privacy === 'private')
          : allVids.filter((v: { privacy?: string }) => v.privacy !== 'private');
        const mapped = filtered.map((v: { id: string; thumbnail?: string; thumbnail_url?: string; url?: string; views?: number; privacy?: string }) => ({
          id: v.id,
          thumbnail_url: resolveGridThumbnailUrl(v.thumbnail || v.thumbnail_url, v.url),
          url: v.url || '',
          views: v.views || 0,
          is_public: v.privacy !== 'private',
        }));
        setVideos(mapped);
      } else if (activeTab === 'liked') {
        const { videos: vids, error } = await apiFetchLikedVideos(50, 0);
        if (error) {
          setVideos([]);
          setVideosHasMore(false);
          setVideosLoading(false);
          showToast(error || 'Failed to load liked videos');
          return;
        }
        setVideosHasMore(vids.length >= 50);
        setVideos(vids.map((v: { id: string; thumbnail?: string; thumbnail_url?: string; url?: string; views?: number }) => ({
          id: v.id,
          thumbnail_url: resolveGridThumbnailUrl(v.thumbnail || v.thumbnail_url, v.url),
          url: v.url || '',
          views: v.views || 0,
          is_public: true,
        })));
      } else if (activeTab === 'saved') {
        const { videos: vids, error } = await apiFetchSavedVideos(50, 0);
        if (error) {
          setVideos([]);
          setVideosHasMore(false);
          setVideosLoading(false);
          showToast(error || 'Failed to load saved videos');
          return;
        }
        setVideosHasMore(vids.length >= 50);
        setVideos(vids.map((v: { id: string; thumbnail?: string; thumbnail_url?: string; url?: string; views?: number }) => ({
          id: v.id,
          thumbnail_url: resolveGridThumbnailUrl(v.thumbnail || v.thumbnail_url, v.url),
          url: v.url || '',
          views: v.views || 0,
          is_public: true,
        })));
      } else {
        setVideosHasMore(false);
        setVideos([]);
      }
    } catch {
      setVideos([]);
    } finally {
      setVideosLoading(false);
    }
  };

  const loadMoreProfileVideos = async () => {
    if (videosLoadingMore || !videosHasMore) return;
    if (activeTab !== 'liked' && activeTab !== 'saved') return;
    setVideosLoadingMore(true);
    try {
      const { videos: vids, error } =
        activeTab === 'liked'
          ? await apiFetchLikedVideos(50, videos.length)
          : await apiFetchSavedVideos(50, videos.length);
      if (error) {
        showToast(error || 'Failed to load more');
        return;
      }
      setVideosHasMore(vids.length >= 50);
      setVideos((prev) => [
        ...prev,
        ...vids.map(
          (v: {
            id: string;
            thumbnail?: string;
            thumbnail_url?: string;
            url?: string;
            views?: number;
          }) => ({
            id: v.id,
            thumbnail_url: resolveGridThumbnailUrl(
              v.thumbnail || v.thumbnail_url,
              v.url,
            ),
            url: v.url || '',
            views: v.views || 0,
            is_public: true,
          }),
        ),
      ]);
    } finally {
      setVideosLoadingMore(false);
    }
  };

  const checkFollowing = async (profileUserId?: string) => {
    if (!user?.id || isOwnProfile) return;
    const idToCheck = profileUserId ?? profileData?.user_id ?? effectiveUserId;
    if (!idToCheck) return;

    try {
      const { following } = await apiFetchFollowingIds(user.id);
      setIsFollowing(following.includes(idToCheck));
    } catch { /* ignore */ }
  };

  const toggleFollow = async () => {
    if (!user?.id || isOwnProfile) return;
    const targetProfileId = profileData?.user_id ?? effectiveUserId;
    if (!targetProfileId) return;

    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    try {
      const { error: followError } = await apiToggleFollow(targetProfileId, wasFollowing);
      if (followError) throw new Error(followError || 'Follow action failed');

      if (!wasFollowing) {
        trackEvent('user_follow', { target_user_id: targetProfileId });
      }

      // Sync video store so feed reflects the change without refresh
      const videoStore = useVideoStore.getState();
      const currentFollowing = videoStore.followingUsers;
      const updatedFollowing = wasFollowing
        ? currentFollowing.filter((id: string) => id !== targetProfileId)
        : [...currentFollowing, targetProfileId];
      useVideoStore.setState({
        followingUsers: updatedFollowing,
        videos: videoStore.videos.map(v =>
          v.user.id === targetProfileId ? { ...v, isFollowing: !wasFollowing } : v
        ),
      });
      loadProfile();
    } catch {
      setIsFollowing(wasFollowing);
    }
  };

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { setAvatarError('Please select an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Image too large (max 5MB).'); return; }

    setAvatarError(null);
    setIsUploadingAvatar(true);

    try {
      // Persist to Bunny CDN + Neon via uploadAvatar (PATCH with https URL). Never store base64 data URLs in Postgres.
      const cdnUrl = await uploadAvatar(file, user.id);
      localStorage.setItem('elix_avatar_' + user.id, cdnUrl);
      updateUser({ avatar: cdnUrl });
      setProfileData(prev => (prev ? { ...prev, avatar_url: cdnUrl } : prev));
    } catch (err) {
      setAvatarError(err?.message || 'Failed');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  if (!displayUserId) {
     return <div className="bg-transparent text-white flex items-center justify-center min-h-[50vh]">Loading...</div>;
  }

  if (routeUserId && resolvedUserId === null && !loading) {
    return (
      <div className="bg-transparent text-white flex flex-col items-center justify-center min-h-[50vh] px-4">
        <button onClick={goBack} className="absolute top-4 right-4 p-1" title="Close" aria-label="Close">
          <RoyceCloseIcon size={20} />
        </button>
        <p className="text-white/70 text-center">Profile not found.</p>
        <button onClick={goBack} className="mt-4 text-gold-metallic font-semibold text-sm">Go back</button>
      </div>
    );
  }

  if (!loading && !profileData && !isOwnProfile) {
    return (
      <div className="bg-transparent text-white flex flex-col items-center justify-center min-h-[50vh] px-4">
        <button onClick={goBack} className="absolute top-4 right-4 p-1" title="Close" aria-label="Close">
          <RoyceCloseIcon size={20} />
        </button>
        <p className="text-white/70 text-center">Profile not found or couldn&apos;t load.</p>
        <button onClick={goBack} className="mt-4 text-gold-metallic font-semibold text-sm">Go back</button>
      </div>
    );
  }

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner bg-transparent">
        {/* Small top header with Share + Exit buttons — same panel height as Inbox */}
        <header className="flex items-center justify-between px-4 pt-page-header pb-2 relative z-10">
          <button
            type="button"
            onClick={openSharePanel}
            title="Share profile"
            className="p-1"
          >
            <span className="royce-glow-disc" style={{ width: 34, height: 34 }} aria-hidden>
              <Share2 size={18} className="royce-icon-gold" strokeWidth={2} />
            </span>
          </button>
          <div className="flex-1 flex items-center justify-center min-w-0 px-2">
            <div className="min-w-0 text-center">
              <div
                ref={headerCenterLabelRef}
                className="text-[16px] font-bold text-gold-metallic truncate"
              >
                Profile
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={goBack}
            title="Close"
            aria-label="Close"
            className="p-1"
          >
            <RoyceCloseIcon size={20} />
          </button>
        </header>

        {/* ═══ Account Menu Modal ═══ */}
        {showAccountMenu && (
          <div
            className="fixed inset-0 z-[9999] bg-black/40 flex items-end justify-center pb-[var(--bottom-nav-top)]"
            onClick={() => setShowAccountMenu(false)}
          >
            <div 
              className="w-full max-w-[480px] bg-transparent rounded-t-2xl border border-black pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-center px-5 pt-4 pb-3 border-b border-white/10">
                <h3 className="text-white font-bold text-base">Account</h3>
              </div>
              <div className="px-5 py-4 flex items-center gap-3 border-b border-white/5">
                <AvatarRing src={displayAvatar} alt="Avatar" size={40} />
                <div>
                  <p className="text-gold-metallic font-semibold text-sm">{displayName}</p>
                  <p className="text-white text-xs">{profileEmailLine}</p>
                </div>
              </div>
              <div className="py-2">
                <button onClick={goSettings} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors">
                  <Menu size={20} className="text-white/70" />
                  <span className="text-white text-sm font-medium">Settings</span>
                </button>
                <button onClick={() => { void goLoginAfterSignOut(); }} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors">
                  <UserPlus size={20} className="text-white" />
                  <span className="text-white text-sm font-medium">Switch Account</span>
                </button>
                <button onClick={() => { void goLoginAfterSignOut(); }} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors">
                  <LogOut size={20} className="text-white/60" />
                  <span className="text-white/60 text-sm font-medium">Log Out</span>
                </button>
              </div>
              <div className="px-5 pb-4 pt-1">
                <button onClick={closeAccountMenu} className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-sm font-semibold">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Share Panel ═══ */}
        {showSharePanel && (
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end justify-center pb-[var(--bottom-nav-top)]"
            onClick={() => setShowSharePanel(false)}
          >
            <div
              className="w-full max-w-[480px] elix-glass rounded-t-2xl max-h-[40dvh] flex flex-col overflow-hidden border border-black"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-1 pb-0.5">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>
              <div className="flex items-center justify-between gap-2 px-4 pb-0.5">
                <h3 className="text-gold-metallic font-bold text-sm">Share to</h3>
                <div className="flex-none w-[120px] bg-white/5 rounded-lg px-2 py-0.5 flex items-center gap-2 border border-[#D8D9DD]/20">
                  <Search className="w-3.5 h-3.5 text-[#F5F5F7]/40" />
                  <input placeholder="Search..." value={shareQuery ?? ''} onChange={(e) => setShareQuery(e.target.value)} className="bg-transparent text-white text-xs outline-none w-full placeholder:text-white/20" />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4">
                {/* Share to followers */}
                <div className="w-full overflow-hidden shrink-0 mb-0">
                  <div className="flex gap-3 overflow-x-auto pt-2 pb-3 no-scrollbar items-center px-4">
                    {shareFollowers.filter((f) => (f.username || '').toLowerCase().includes((shareQuery || '').toLowerCase())).map((f) => (
                      <button
                        key={f.user_id}
                        className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform"
                        style={{ width: SHARE_PANEL_ITEM_WIDTH_PX, minWidth: SHARE_PANEL_ITEM_WIDTH_PX }}
                        onClick={() => sendShareTo(f.user_id)}
                      >
                        <div className="relative flex flex-col items-center gap-1" style={{ width: SHARE_PANEL_ITEM_WIDTH_PX, minWidth: SHARE_PANEL_ITEM_WIDTH_PX }}>
                          <div
                            className="rounded-full overflow-hidden bg-[#1A1A1F] flex-shrink-0"
                            style={{ width: SHARE_PANEL_AVATAR_PX, height: SHARE_PANEL_AVATAR_PX }}
                          >
                            <img
                              src={f.avatar_url || '/royce/default-avatar.svg'}
                              alt={f.username || 'User'}
                              className="h-full w-full object-cover object-center"
                              draggable={false}
                            />
                          </div>
                          {shareSent.has(f.user_id) && (
                            <div className="absolute bottom-0 right-0 w-4 h-4 bg-[#FFFFFF] rounded-full flex items-center justify-center border-2 border-[#1C1E24]">
                              <Check size={8} className="text-black" />
                            </div>
                          )}
                          <span className="text-white/80 text-[11px] font-medium truncate w-full text-center">{shareSent.has(f.user_id) ? 'Sent' : f.username || 'User'}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Line between user circles and action icons */}
                <div className="border-t border-[#D8D9DD]/45 flex-shrink-0 mb-0" aria-hidden />

                {/* Share options — same layout as ShareModal */}
                <div className="flex-1 overflow-y-scroll overflow-x-hidden min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:bg-[#313845] [&::-webkit-scrollbar-thumb]:rounded-full">
                  <div className="grid grid-cols-5 gap-y-3 gap-x-1.5 pt-0">
                    {[
                      { name: 'WhatsApp', icon: <MessageCircle size={22} className="text-white" />, action: () => openExternalLink(`https://wa.me/?text=${encodeURIComponent(`Check out ${displayName}'s profile on Elix! ${window.location.origin}/profile/${displayUserId}`)}`) },
                      { name: 'Facebook', icon: <Share2 size={22} className="text-white" />, action: () => openExternalLink(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}/profile/${displayUserId}`)}`) },
                      { name: 'Twitter', icon: <Share2 size={22} className="text-white" />, action: () => openExternalLink(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out ${displayName} on Elix!`)}&url=${encodeURIComponent(`${window.location.origin}/profile/${displayUserId}`)}`) },
                      { name: 'Copy Link', icon: <Copy size={22} className="text-white" />, action: () => { navigator.clipboard.writeText(`${window.location.origin}/profile/${displayUserId}`).then(() => showToast('Profile link copied!')).catch(() => showToast('Could not copy link')); } },
                      { name: 'Promote', icon: <TrendingUp size={22} className="text-white" />, action: () => { setShowSharePanel(false); setShowPromotePanel(true); } },
                      { name: 'Report', icon: <Flag size={22} className="text-white/60" />, isRed: true, action: () => { setShowSharePanel(false); setShowReportModal(true); } },
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
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
        {/* ═══ AVATAR ═══ */}
        <div className="flex flex-col items-center mt-2 mb-3 overflow-visible">
          <div
            className={`relative overflow-visible ${isOwnProfile || (profileStoryGroup?.items?.length ?? 0) > 0 ? 'cursor-pointer' : ''}`}
            style={{ width: PROFILE_PAGE_AVATAR_PX + 8, height: PROFILE_PAGE_AVATAR_PX + 8 }}
            onClick={() => {
              // Own profile: tap avatar → change profile photo (plus button is for stories).
              if (isOwnProfile) {
                if (isUploadingAvatar) return;
                fileInputRef.current?.click();
                return;
              }
              // Others: tap ring opens their story if present.
              if (profileStoryGroup && profileStoryGroup.items.length > 0) {
                setStoryViewerIndex(0);
                setStoryViewerOpen(true);
              }
            }}
            onContextMenu={(e) => {
              if (!isOwnProfile) return;
              e.preventDefault();
              if (isUploadingAvatar) return;
              fileInputRef.current?.click();
            }}
          >
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full p-[2px]"
              style={{
                background:
                  (profileStoryGroup?.items?.length ?? 0) > 0
                    ? 'linear-gradient(135deg, #D8D9DD, #F5E6A8, #D8D9DD)'
                    : 'transparent',
              }}
            >
              <StoryGoldRingAvatar size={PROFILE_PAGE_AVATAR_PX} src={displayAvatar} alt="Profile" />
            </div>
            {isOwnProfile && (
              <button
                type="button"
                className="profile-add-story-btn bottom-0 right-0 z-50"
                title="Add story"
                aria-label="Add story"
                onClick={goUploadStoryFromRing}
              >
                <span className="profile-add-story-btn__plus" aria-hidden>
                  +
                </span>
              </button>
            )}
          </div>
          <input 
            ref={fileInputRef}
            type="file" 
            className="hidden" 
            accept="image/*"
            aria-label="Upload profile photo"
            onChange={(e) => { handleAvatarFile(e.target.files?.[0]); if (e.target) e.target.value = ''; }} 
          />
          {isUploadingAvatar && <div className="text-xs text-white/70 mt-1">Uploading...</div>}
          {avatarError && <div className="text-xs text-rose-300 mt-1">{avatarError}</div>}
        </div>

        {/* ═══ REAL NAME + REAL EMAIL + LEVEL ═══ */}
        <div className="flex flex-col items-center px-4" style={{ marginTop: '-6px' }}>
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-extrabold text-gold-metallic tracking-tight">{displayName}</h1>
            {profileData?.is_creator && (
              <span className="w-4 h-4 rounded-full bg-[#FFFFFF] flex items-center justify-center">
                <Sparkles size={10} className="text-black" />
              </span>
            )}
            <button
              type="button"
              title="Copy profile link"
              aria-label="Copy profile link"
              className="p-0.5 active:opacity-70"
              onClick={() => {
                const id = displayUserId || effectiveUserId;
                if (!id) {
                  showToast('Could not copy link');
                  return;
                }
                void navigator.clipboard
                  .writeText(`${window.location.origin}/profile/${id}`)
                  .then(() => showToast('Profile link copied!'))
                  .catch(() => showToast('Could not copy link'));
              }}
            >
              <Copy size={14} className="royce-icon-gold" strokeWidth={2.25} />
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            {profileEmailLine ? (
              <span className="text-[13px] text-white/80 font-medium">{profileEmailLine}</span>
            ) : null}
            <LevelBadge
              level={profileData?.level ?? 1}
              hideCircle
              layout="fixed"
            />
          </div>
          {risingBadges.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mt-2 max-w-[280px]">
              {risingBadges.slice(0, 6).map((b) => (
                <span
                  key={b.code}
                  className="px-2 py-0.5 rounded-full text-[10px] bg-white/10 text-[#F5F5F7] border border-[#D8D9DD]/30"
                  title={b.title}
                >
                  {b.title}
                </span>
              ))}
            </div>
          )}
        </div>


        {/* ═══ STATS ROW ═══ */}
        <div className="flex items-center justify-center gap-6 mt-4 px-4">
          <button
            type="button"
            className="flex flex-col items-center min-w-[60px] active:opacity-80"
            onClick={goFollowingList}
          >
            <span className="text-[17px] font-extrabold text-white">{formatNumber(profileData?.following_count || 0)}</span>
            <span className="text-[11px] text-white/40 font-medium">Following</span>
          </button>
          <button
            type="button"
            className="flex flex-col items-center min-w-[60px] active:opacity-80"
            onClick={goFollowersList}
          >
            <span className="text-[17px] font-extrabold text-white">{formatNumber(profileData?.followers_count || 0)}</span>
            <span className="text-[11px] text-white/40 font-medium">Followers</span>
          </button>
          <div className="flex flex-col items-center min-w-[60px]">
            <span className="text-[17px] font-extrabold text-white">{formatNumber(profileData?.likes_count || 0)}</span>
            <span className="text-[11px] text-white/40 font-medium">Likes</span>
          </div>
          <div className="flex flex-col items-center min-w-[60px]">
            <span className="text-[17px] font-extrabold text-white">{formatNumber(profileData?.unique_views || 0)}</span>
            <span className="text-[11px] text-white/40 font-medium">Views</span>
          </div>
        </div>

        {/* ═══ BIO ═══ */}
        {profileData?.bio && (
          <p className="text-center text-[13px] text-white/70 mt-3 px-8 leading-relaxed">{profileData.bio}</p>
        )}

        {/* ═══ FOLLOW / APPRECIATE / MESSAGE (other user) ═══ */}
        {!isOwnProfile && (
          <div className="flex items-center justify-center gap-2 mt-4 px-6">
            <button
              onClick={toggleFollow}
              className={`flex-1 max-w-[120px] py-2.5 rounded-md text-sm font-bold transition ${
                isFollowing
                  ? 'bg-white/10 text-white border border-white/10'
                  : 'bg-[#6F3FF5] text-white elix-solid-accent'
              }`}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!user?.id || !effectiveUserId) {
                  showToast('Log in to appreciate');
                  return;
                }
                try {
                  const { data, error } = await apiLiveSendDailyHeart(effectiveUserId);
                  if (error) {
                    showToast('Could not send appreciate');
                    return;
                  }
                  showToast(data?.already ? 'Already appreciated today' : 'Appreciate sent!');
                } catch {
                  showToast('Could not send appreciate');
                }
              }}
              className="flex-1 max-w-[120px] py-2.5 bg-white/10 border border-white/10 rounded-md text-sm font-bold text-white flex items-center justify-center gap-1"
            >
              <Heart size={14} className="text-[#F5F5F7]" fill="#D8D9DD" />
              Appreciate
            </button>
            <button
              onClick={() => { void openThread(); }}
              className="flex-1 max-w-[120px] py-2.5 bg-white/10 border border-white/10 rounded-md text-sm font-bold text-white"
            >
              Message
            </button>
            <button type="button" onClick={openSharePanel} className="w-10 h-10 bg-white/10 border border-white/10 rounded-md flex items-center justify-center" title="Share profile">
              <span className="royce-glow-disc" style={{ width: 32, height: 32 }} aria-hidden>
                <Share2 size={16} className="royce-icon-gold" strokeWidth={2} />
              </span>
            </button>
          </div>
        )}

        {/* ═══ ACTION BAR (scrollable) — compact so Edit Profile is visible ═══ */}
        <div className="mt-2 border-y border-[#6F3FF5]">
          <div className="flex justify-center overflow-x-auto no-scrollbar">
            <button onClick={goAiStudio} className="flex flex-col items-center gap-0.5 px-3 py-2 whitespace-nowrap">
              <span className="royce-glow-disc" style={{ width: 26, height: 26 }} aria-hidden>
                <Sparkles size={12} className="royce-icon-gold" />
              </span>
              <span className="text-[11px] font-bold text-white">AI Studio</span>
            </button>
            <button onClick={goCreatorLoginDetails} className="flex flex-col items-center gap-0.5 px-3 py-2 whitespace-nowrap">
              <span className="royce-glow-disc" style={{ width: 26, height: 26 }} aria-hidden>
                <Sparkles size={12} className="royce-icon-gold" />
              </span>
              <span className="text-[11px] font-bold text-white">Elix Studio</span>
            </button>
            <button onClick={goShop} className="flex flex-col items-center gap-0.5 px-3 py-2 whitespace-nowrap">
              <span className="royce-glow-disc" style={{ width: 26, height: 26 }} aria-hidden>
                <ShoppingBag size={12} className="royce-icon-gold" />
              </span>
              <span className="text-[11px] font-bold text-white">Shop</span>
            </button>
            <button onClick={tabShop} className="flex flex-col items-center gap-0.5 px-3 py-2 whitespace-nowrap">
              <span className="royce-glow-disc" style={{ width: 26, height: 26 }} aria-hidden>
                <ShoppingBag size={12} className="royce-icon-gold" />
              </span>
              <span className="text-[11px] font-bold text-white">Showcase</span>
            </button>
            {isOwnProfile && (
              <button onClick={goSettings} className="flex flex-col items-center gap-0.5 px-3 py-2 whitespace-nowrap">
                <span className="royce-glow-disc" style={{ width: 26, height: 26 }} aria-hidden>
                  <Settings size={12} className="royce-icon-gold" />
                </span>
                <span className="text-[11px] font-bold text-white">Settings</span>
              </button>
            )}
          </div>
        </div>

        {/* ═══ CONTENT TABS (6 icons) ═══ */}
        <div className="border-b border-white/10 flex">
          <button
            type="button"
            onClick={tabVideos}
            className={`flex-1 pb-2.5 pt-2.5 flex items-center justify-center gap-0.5 border-b-2 transition-colors ${
              activeTab === 'videos' ? 'border-white text-white' : 'border-transparent text-white/30'
            }`}
            aria-label="Videos"
          >
            <Grid3X3 size={18} className="royce-icon-gold" />
            <ChevronDown size={12} className="royce-icon-gold" />
          </button>
          <button
            type="button"
            onClick={tabShop}
            className={`flex-1 pb-2.5 pt-2.5 flex justify-center border-b-2 transition-colors ${
              activeTab === 'shop' ? 'border-white text-white' : 'border-transparent text-white/30'
            }`}
            aria-label="Shop"
          >
            <ShoppingBag size={18} className="royce-icon-gold" />
          </button>
          {isOwnProfile && (
            <button
              type="button"
              onClick={tabPrivate}
              className={`flex-1 pb-2.5 pt-2.5 flex justify-center border-b-2 transition-colors ${
                activeTab === 'private' ? 'border-white text-white' : 'border-transparent text-white/30'
              }`}
              aria-label="Private"
            >
              <Lock size={18} className="royce-icon-gold" />
            </button>
          )}
          <button
            type="button"
            onClick={tabReposts}
            className={`flex-1 pb-2.5 pt-2.5 flex justify-center border-b-2 transition-colors ${
              activeTab === 'reposts' ? 'border-white text-white' : 'border-transparent text-white/30'
            }`}
            aria-label="Reposts"
          >
            <Repeat2 size={18} className="royce-icon-gold" />
          </button>
          <button
            type="button"
            onClick={tabSaved}
            className={`flex-1 pb-2.5 pt-2.5 flex justify-center border-b-2 transition-colors ${
              activeTab === 'saved' ? 'border-white text-white' : 'border-transparent text-white/30'
            }`}
            aria-label="Saved"
          >
            <Bookmark size={18} className="royce-icon-gold" />
          </button>
          <button
            type="button"
            onClick={tabLiked}
            className={`flex-1 pb-2.5 pt-2.5 flex justify-center border-b-2 transition-colors ${
              activeTab === 'liked' ? 'border-white text-white' : 'border-transparent text-white/30'
            }`}
            aria-label="Liked"
          >
            <Heart size={18} className="royce-icon-gold" />
          </button>
        </div>

        {isOwnProfile && activeTab === 'private' && (
          <div className="px-3 pt-2 pb-1 flex justify-end">
            <button
              type="button"
              onClick={goUploadStory}
              className="px-3 py-1.5 rounded-md bg-[#6F3FF5] text-white text-[11px] font-bold"
            >
              Post Story
            </button>
          </div>
        )}

        {/* ═══ VIDEO GRID ═══ */}
        {activeTab !== 'shop' && (
          <div className="grid grid-cols-3 gap-[2px] px-3 pt-3 pb-2 flex-1">
            {videosLoading && videos.length === 0 ? (
              <div className="col-span-3 flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-[#6F3FF5]/25 border-t-[#6F3FF5] rounded-full animate-spin elix-loader" />
              </div>
            ) : (
              videos.map((video) => {
                const thumb = video.thumbnail_url || resolveGridThumbnailUrl(undefined, video.url);
                const playbackUrl = resolveVideoPlaybackUrl(video.url || '');
                return (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => goVideo(video.id)}
                  className="aspect-[3/4] bg-transparent relative group text-left rounded-xl overflow-hidden"
                >
                  {playbackUrl ? (
                    <video
                      src={`${playbackUrl}#t=0.1`}
                      poster={thumb || undefined}
                      muted
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 size-full object-cover opacity-90 group-hover:opacity-100 transition pointer-events-none"
                      aria-hidden
                    />
                  ) : null}
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="absolute inset-0 size-full object-cover opacity-90 group-hover:opacity-100 transition pointer-events-none"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (img.dataset.fallback) {
                          img.style.display = 'none';
                          return;
                        }
                        img.dataset.fallback = '1';
                        const poster = getVideoPosterUrl(video.url || '');
                        if (poster && img.src !== poster) {
                          img.src = poster;
                          return;
                        }
                        img.style.display = 'none';
                      }}
                    />
                  ) : null}
                  <span className="absolute inset-0 z-[1]" aria-hidden />
                  {!video.is_public && (
                    <div className="absolute top-2 right-2 z-[2]">
                      <Lock size={14} className="text-white drop-shadow" />
                    </div>
                  )}
                  <span className="absolute bottom-1.5 left-1.5 z-[2] flex flex-col items-start gap-0.5 text-[11px] font-bold text-white drop-shadow-md">
                    <Play size={10} fill="white" />
                    <span className="leading-none">{formatNumber(video.views)}</span>
                  </span>
                </button>
                );
              })
            )}
          </div>
        )}
        {!videosLoading &&
          videosHasMore &&
          (activeTab === 'liked' || activeTab === 'saved') && (
            <div className="flex justify-center py-3">
              <button
                type="button"
                disabled={videosLoadingMore}
                onClick={() => void loadMoreProfileVideos()}
                className="px-4 py-2 rounded-lg bg-white/10 text-xs font-semibold text-white/80 disabled:opacity-40"
              >
                {videosLoadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}

        {/* ═══ SHOP ITEMS GRID ═══ */}
        {activeTab === 'shop' && videosLoading && shopItems.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#6F3FF5]/25 border-t-[#6F3FF5] rounded-full animate-spin elix-loader" />
          </div>
        )}
        {activeTab === 'shop' && shopItems.length > 0 && (
          <div className="grid grid-cols-2 gap-3 px-3 py-3 flex-1">
            {shopItems.map((item) => (
              <button
                key={item.id}
                onClick={goShop}
                className="bg-white/5 rounded-2xl overflow-hidden border border-white/5 text-left"
              >
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square bg-white/5 flex items-center justify-center">
                    <ShoppingBag size={28} className="text-white/20" />
                  </div>
                )}
                <div className="p-2.5">
                  <h3 className="text-xs font-bold text-gold-metallic truncate">{item.title}</h3>
                  <p className="text-sm font-extrabold text-white mt-0.5">${item.price.toFixed(2)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        
        {!videosLoading && activeTab !== 'shop' && videos.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-16 text-white/30 text-sm">
            {activeTab === 'videos' && 'No videos yet'}
            {activeTab === 'private' && (
              <div className="flex flex-col items-center gap-2">
                <span>No private videos</span>
                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={goUploadStory}
                    className="px-3 py-1.5 rounded-md bg-[#6F3FF5] text-white text-[11px] font-bold"
                  >
                    Post Story
                  </button>
                )}
              </div>
            )}
            {activeTab === 'reposts' && 'No reposts yet'}
            {activeTab === 'saved' && 'No saved videos'}
            {activeTab === 'liked' && 'No liked videos'}
          </div>
        )}
        {!videosLoading && activeTab === 'shop' && shopItems.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-2">
            <ShoppingBag size={32} className="text-white/20" />
            <span className="text-white/30 text-sm">No items for sale</span>
            {isOwnProfile && (
              <button onClick={goShop} className="mt-2 px-4 py-2 rounded-xl bg-[#6F3FF5] text-white font-bold text-xs">
                Start Selling
              </button>
            )}
          </div>
        )}

        </div>

        <PromotePanel
          isOpen={showPromotePanel}
          onClose={() => setShowPromotePanel(false)}
          contentType="profile"
          content={{
            id: effectiveUserId,
            title: `${displayName} on Elix`,
            thumbnail: displayAvatar,
            username: displayName,
            avatar: displayAvatar,
            postedAt: new Date().toLocaleDateString(),
          }}
        />

      </div>

      {showReportModal && effectiveUserId && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          videoId=""
          contentType="user"
          contentId={effectiveUserId}
        />
      )}

      {storyViewerOpen && profileStoryGroup?.items?.[storyViewerIndex] && (
        <div
          className="fixed inset-0 z-[10060] bg-transparent flex justify-center"
          onClick={() => {
            if (storyViewerIndex + 1 < profileStoryGroup.items.length) {
              setStoryViewerIndex((i) => i + 1);
            } else {
              setStoryViewerOpen(false);
            }
          }}
        >
          <div className="relative w-full max-w-[480px] h-full min-h-0 overflow-hidden bg-transparent">
            <button
              type="button"
              className="absolute top-[calc(env(safe-area-inset-top,0px)+12px)] left-3 z-10 text-white text-sm font-bold px-2 py-1"
              onClick={(e) => {
                e.stopPropagation();
                setStoryViewerOpen(false);
              }}
            >
              Close
            </button>
            {profileStoryGroup.items[storyViewerIndex].mediaType === 'image' ? (
              <img
                src={profileStoryGroup.items[storyViewerIndex].mediaUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <video
                key={profileStoryGroup.items[storyViewerIndex].id}
                src={profileStoryGroup.items[storyViewerIndex].mediaUrl}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                playsInline
                controls={false}
                onEnded={() => {
                  if (storyViewerIndex + 1 < profileStoryGroup.items.length) {
                    setStoryViewerIndex((i) => i + 1);
                  } else {
                    setStoryViewerOpen(false);
                  }
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}
