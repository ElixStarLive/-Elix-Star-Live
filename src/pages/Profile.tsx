import React, { useState, useEffect, useRef } from 'react';
import { Share2, Menu, Lock, Play, Heart, Sparkles, LogOut, UserPlus, X, Bookmark, Grid3X3, ShoppingBag, Repeat2, ChevronDown, Search, Copy, MessageCircle, Check, TrendingUp, Flag, Plus, Settings } from 'lucide-react';
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
import { request } from '../lib/apiClient';
import { fetchAllSharePanelContacts } from '../lib/sharePanelContacts';
import { getVideoPosterUrl } from '../lib/bunnyStorage';
import { openExternalLink } from '../lib/platform';

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
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
  likes_count: number;
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
  
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerCenterLabelRef = useRef<HTMLDivElement | null>(null);

  const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const isOwnProfile = !routeUserId || routeUserId === user?.id;
  const displayUserId = routeUserId || user?.id;
  const effectiveUserId = resolvedUserId ?? displayUserId;

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
    try {
      const { data: threadData, error: threadError } = await request('/api/chat/threads/ensure', {
        method: "POST",
        body: JSON.stringify({ otherUserId: targetUserId }),
      });
      if (threadError) { showToast('Failed to send'); return; }
      const threadId = threadData?.threadId || threadData?.thread?.id || threadData?.data?.id;
      if (threadId) {
        await request(`/api/chat/threads/${threadId}/messages`, {
          method: "POST",
          body: JSON.stringify({ text: msgText }),
        });
      }
      setShareSent(prev => new Set(prev).add(targetUserId));
    } catch {
      showToast('Failed to send');
    }
  };
  
  const _isFallback = (n: string | null | undefined) =>
    !n || /^User [0-9a-f]{8}$/i.test(n) || /^user_[0-9a-f]{8}$/i.test(n);
  const _rawDisplay = isOwnProfile
    ? (profileData?.display_name || user?.name || profileData?.username || user?.email?.split('@')[0] || 'User')
    : (profileData?.display_name || profileData?.username || displayUserId || 'User');
  const displayName = _isFallback(_rawDisplay)
    ? (profileData?.username || user?.username || user?.email?.split('@')[0] || _rawDisplay)
    : _rawDisplay;
  const rawUsername = isOwnProfile
    ? (user?.email?.split('@')[0] || profileData?.username || 'user')
    : (profileData?.username || 'user');
  const displayUsername = (rawUsername || '').replace(/^@+/, '');
  const localAvatar = isOwnProfile && user?.id ? localStorage.getItem('elix_avatar_' + user.id) : null;
  const isHttpUrl = (s: string | null | undefined) => !!s && /^https?:\/\//i.test(s.trim());
  /** Prefer CDN/http URLs from server; avoid stale giant data: URLs in localStorage masking the real profile. */
  const displayAvatar = isOwnProfile
    ? (
        (isHttpUrl(profileData?.avatar_url) ? profileData!.avatar_url : null) ||
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
    request(`/api/profiles/by-username/${encodeURIComponent(usernameClean)}`)
      .then(({ data: body, error }) => {
        if (cancelled) return;
        if (error || !body) {
          setResolvedUserId(null);
          setProfileData(null);
          setLoading(false);
          return;
        }
        const uid = body?.profile?.userId || body?.user_id;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, activeTab]);

  const loadProfile = async () => {
    if (!effectiveUserId) { setLoading(false); return; }

    try {
      const fallback: ProfileData = {
        user_id: effectiveUserId,
        username: user?.username || user?.email?.split('@')[0] || 'user',
        display_name: user?.name || user?.email?.split('@')[0] || 'User',
        avatar_url: user?.avatar || null,
        bio: null,
        followers_count: 0,
        following_count: 0,
        likes_count: 0,
        is_creator: false,
      };

      const { data: body, error } = await request(`/api/profiles/${effectiveUserId}`);
      if (error) {
        setProfileData(effectiveUserId === user?.id ? fallback : null);
        setLoading(false);
        return;
      }

      const p = body?.profile;
      if (!p) {
        setProfileData(effectiveUserId === user?.id ? fallback : null);
        setLoading(false);
        return;
      }

      const data: ProfileData = {
        user_id: p.userId || effectiveUserId,
        username: p.username || fallback.username,
        display_name: p.displayName || fallback.display_name,
        avatar_url: p.avatarUrl || fallback.avatar_url,
        bio: p.bio || null,
        followers_count: Number(p.followers ?? p.followers_count) || 0,
        following_count: Number(p.following ?? p.following_count) || 0,
        likes_count: 0,
        is_creator: p.isVerified || false,
      };

      try {
        const { data: vidsBody } = await request(`/api/videos/user/${effectiveUserId}`);
        if (vidsBody) {
          const vids = Array.isArray(vidsBody?.videos) ? vidsBody.videos : [];
          data.likes_count = vids.reduce((sum: number, v: any) => sum + (v.likes || 0), 0);
        }
      } catch {}

      setProfileData(data);
      trackEvent('profile_view', { user_id: effectiveUserId, is_own: isOwnProfile });
      if (!isOwnProfile && user?.id) {
        await checkFollowing(data.user_id);
      }
    } catch (_) {
      if (effectiveUserId === user?.id) {
        setProfileData({
          user_id: effectiveUserId,
          username: user?.username || user?.email?.split('@')[0] || 'user',
          display_name: user?.name || user?.email?.split('@')[0] || 'User',
          avatar_url: user?.avatar || null,
          bio: null,
          followers_count: 0,
          following_count: 0,
          likes_count: 0,
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
          const { data, error } = await request(`/api/shop/items?user_id=${encodeURIComponent(effectiveUserId)}`);
          if (error) {
            setShopItems([]);
            showToast('Failed to load shop items');
          } else {
            const items = Array.isArray(data?.items) ? data.items : [];
            setShopItems(items.map((i: any) => ({
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
        const { data: body, error } = await request(`/api/videos/user/${effectiveUserId}`);
        if (error) { setVideos([]); setVideosLoading(false); return; }
        const allVids = Array.isArray(body?.videos) ? body.videos : [];
        const filtered = activeTab === 'private'
          ? allVids.filter((v: any) => v.privacy === 'private')
          : allVids.filter((v: any) => v.privacy !== 'private');
        const mapped = filtered.map((v: any) => ({
          id: v.id,
          thumbnail_url: v.thumbnail || v.thumbnail_url || v.url || '',
          url: v.url || '',
          views: v.views || 0,
          is_public: v.privacy !== 'private',
        }));
        setVideos(mapped);
      } else if (activeTab === 'liked') {
        const { likedVideos, videos: storeVideos } = useVideoStore.getState();
        const likedSet = new Set(likedVideos);
        const liked = storeVideos.filter(v => likedSet.has(v.id)).map(v => ({
          id: v.id,
          thumbnail_url: v.thumbnail || v.url || '',
          url: v.url || '',
          views: v.stats?.views || 0,
          is_public: true,
        }));
        setVideos(liked);
      } else if (activeTab === 'saved') {
        const { savedVideos, videos: storeVideos } = useVideoStore.getState();
        const savedSet = new Set(savedVideos);
        const saved = storeVideos.filter(v => savedSet.has(v.id)).map(v => ({
          id: v.id,
          thumbnail_url: v.thumbnail || v.url || '',
          url: v.url || '',
          views: v.stats?.views || 0,
          is_public: true,
        }));
        setVideos(saved);
      } else {
        setVideos([]);
      }
    } catch {
      setVideos([]);
    } finally {
      setVideosLoading(false);
    }
  };

  const checkFollowing = async (profileUserId?: string) => {
    if (!user?.id || isOwnProfile) return;
    const idToCheck = profileUserId ?? profileData?.user_id ?? effectiveUserId;
    if (!idToCheck) return;

    try {
      const { data: body } = await request(`/api/profiles/${user.id}/following`);
      if (body) {
        const ids: string[] = Array.isArray(body?.following) ? body.following : (Array.isArray(body) ? body : []);
        setIsFollowing(ids.includes(idToCheck));
      }
    } catch { /* ignore */ }
  };

  const toggleFollow = async () => {
    if (!user?.id || isOwnProfile) return;
    const targetProfileId = profileData?.user_id ?? effectiveUserId;
    if (!targetProfileId) return;

    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    try {
      const endpoint = wasFollowing
        ? `/api/profiles/${targetProfileId}/unfollow`
        : `/api/profiles/${targetProfileId}/follow`;

      const { error: followError } = await request(endpoint, { method: 'POST' });
      if (followError) throw new Error('Follow action failed');

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
    } catch (err: any) {
      setAvatarError(err?.message || 'Failed');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  if (!displayUserId) {
     return <div className="bg-[#13151A] text-white flex items-center justify-center min-h-[50vh]">Loading...</div>;
  }

  if (routeUserId && resolvedUserId === null && !loading) {
    return (
      <div className="bg-[#13151A] text-white flex flex-col items-center justify-center min-h-[50vh] px-4">
        <button onClick={() => navigate(-1)} className="absolute top-4 right-4 p-1">
          <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
        </button>
        <p className="text-white/70 text-center">Profile not found.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-gold-metallic font-semibold text-sm">Go back</button>
      </div>
    );
  }

  if (!loading && !profileData && !isOwnProfile) {
    return (
      <div className="bg-[#13151A] text-white flex flex-col items-center justify-center min-h-[50vh] px-4">
        <button onClick={() => navigate(-1)} className="absolute top-4 right-4 p-1">
          <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
        </button>
        <p className="text-white/70 text-center">Profile not found or couldn&apos;t load.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-gold-metallic font-semibold text-sm">Go back</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#13151A] text-white flex justify-center">
      <div
        className="w-full max-w-[480px] flex flex-col overflow-hidden bg-[#13151A] h-above-bottom-nav"
        style={{ marginTop: 0 }}
      >
        {/* Small top header with Share + Exit buttons — same panel height as Inbox */}
        <header className="flex items-center justify-between px-4 pt-[env(safe-area-inset-top,8px)] pb-2 relative z-10">
          <button
            type="button"
            onClick={openSharePanel}
            title="Share profile"
            className="p-1"
          >
            <img src="/Icons/Share Icon.png" alt="Share" className="w-5 h-5 object-contain" />
          </button>
          <div className="flex-1 flex items-center justify-center min-w-0 px-2">
            <div className="min-w-0 text-center">
              <div
                ref={headerCenterLabelRef}
                className="text-[12px] font-bold text-gold-metallic truncate"
              >
                Profile
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            title="Back"
            className="p-1"
          >
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
        </header>

        {/* ═══ Account Menu Modal ═══ */}
        {showAccountMenu && (
          <div className="fixed inset-0 z-[9999] bg-[#13151A]/70 flex items-end justify-center" onClick={() => setShowAccountMenu(false)}>
            <div 
              className="w-full max-w-[480px] bg-[#111] rounded-t-2xl border-t border-white/10 pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
                <h3 className="text-white font-bold text-base">Account</h3>
                <button onClick={() => setShowAccountMenu(false)} title="Close">
                  <X size={20} className="text-white/50" />
                </button>
              </div>
              <div className="px-5 py-4 flex items-center gap-3 border-b border-white/5">
                <AvatarRing src={displayAvatar} alt="Avatar" size={40} />
                <div>
                  <p className="text-gold-metallic font-semibold text-sm">{displayName}</p>
                  <p className="text-white text-xs">{displayUsername}</p>
                </div>
              </div>
              <div className="py-2">
                <button onClick={() => { setShowAccountMenu(false); navigate('/settings'); }} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors">
                  <Menu size={20} className="text-white/70" />
                  <span className="text-white text-sm font-medium">Settings</span>
                </button>
                <button onClick={async () => { setShowAccountMenu(false); await signOut(); navigate('/login', { replace: true }); }} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors">
                  <UserPlus size={20} className="text-white" />
                  <span className="text-white text-sm font-medium">Switch Account</span>
                </button>
                <button onClick={async () => { setShowAccountMenu(false); await signOut(); navigate('/login', { replace: true }); }} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors">
                  <LogOut size={20} className="text-rose-400" />
                  <span className="text-rose-400 text-sm font-medium">Log Out</span>
                </button>
              </div>
              <div className="px-5 pb-4 pt-1">
                <button onClick={() => setShowAccountMenu(false)} className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-sm font-semibold">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Share Panel ═══ */}
        {showSharePanel && (
          <div className="fixed inset-0 z-[9999] bg-black/60 flex items-end justify-center" onClick={() => setShowSharePanel(false)}>
            <div
              className="w-full max-w-[480px] bg-[#1C1E24]/95 rounded-t-2xl border-2 border-b-0 border-white/10 max-h-[40dvh] flex flex-col overflow-hidden"
              style={{ marginBottom: 'var(--bottom-ui-reserve)', boxShadow: '0 -4px 30px rgba(201,169,110,0.25)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>
              <div className="flex items-center justify-between gap-2 px-4 pb-2">
                <h3 className="text-gold-metallic font-bold text-sm">Share to</h3>
                <div className="flex-none w-[120px] bg-white/5 rounded-lg px-2 py-1.5 flex items-center gap-2 border border-[#C9A96E]/20">
                  <Search className="w-3.5 h-3.5 text-[#C9A96E]/40" />
                  <input placeholder="Search..." value={shareQuery ?? ''} onChange={(e) => setShareQuery(e.target.value)} className="bg-transparent text-white text-xs outline-none w-full placeholder:text-white/20" />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4">
                {/* Create + Followers row — same as LiveStream share panel */}
                <div className="w-full overflow-hidden shrink-0 mb-3">
                  <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar items-center px-4">
                    <button type="button" onClick={() => { setShowSharePanel(false); navigate('/create'); }} className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform" style={{ width: 95, minWidth: 95 }}>
                      <div className="relative w-[85px] h-[85px] flex items-center justify-center">
                        <StoryGoldRingAvatar
                          size={85}
                          src={displayAvatar || '/Icons/Profile icon.png'}
                          alt="Create"
                        />
                        <Plus size={28} className="text-[#C9A96E] absolute" strokeWidth={2.5} />
                      </div>
                      <span className="text-white/80 text-[11px] font-medium">Create</span>
                    </button>
                    {shareFollowers.filter((f) => (f.username || '').toLowerCase().includes((shareQuery || '').toLowerCase())).map((f) => (
                      <button
                        key={f.user_id}
                        className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform"
                        style={{ width: 95, minWidth: 95 }}
                        onClick={() => sendShareTo(f.user_id)}
                      >
                        <div className="relative w-[95px] min-w-[95px] flex flex-col items-center gap-1">
                          <StoryGoldRingAvatar
                            size={85}
                            src={f.avatar_url || '/Icons/Profile icon.png'}
                            alt={f.username || 'User'}
                          />
                          {shareSent.has(f.user_id) && (
                            <div className="absolute bottom-0 right-0 w-4 h-4 bg-[#C9A96E] rounded-full flex items-center justify-center border-2 border-[#1C1E24]">
                              <Check size={8} className="text-black" />
                            </div>
                          )}
                          <span className="text-white/80 text-[11px] font-medium truncate w-full text-center">{shareSent.has(f.user_id) ? 'Sent' : f.username || 'User'}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Share options — same layout as ShareModal */}
                <div className="flex-1 overflow-y-scroll overflow-x-hidden min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:bg-[#C9A96E]/60 [&::-webkit-scrollbar-thumb]:rounded-full">
                  <div className="grid grid-cols-5 gap-y-3 gap-x-1.5 pt-1">
                    {[
                      { name: 'WhatsApp', icon: <MessageCircle size={22} className="text-white" />, action: () => openExternalLink(`https://wa.me/?text=${encodeURIComponent(`Check out ${displayName}'s profile on Elix! ${window.location.origin}/profile/${displayUserId}`)}`) },
                      { name: 'Facebook', icon: <Share2 size={22} className="text-white" />, action: () => openExternalLink(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}/profile/${displayUserId}`)}`) },
                      { name: 'Twitter', icon: <Share2 size={22} className="text-white" />, action: () => openExternalLink(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out ${displayName} on Elix!`)}&url=${encodeURIComponent(`${window.location.origin}/profile/${displayUserId}`)}`) },
                      { name: 'Copy Link', icon: <Copy size={22} className="text-white" />, action: () => { navigator.clipboard.writeText(`${window.location.origin}/profile/${displayUserId}`).then(() => showToast('Profile link copied!')).catch(() => showToast('Could not copy link')); } },
                      { name: 'Promote', icon: <TrendingUp size={22} className="text-white" />, action: () => { setShowSharePanel(false); setShowPromotePanel(true); } },
                      { name: 'Report', icon: <Flag size={22} className="text-red-400" />, isRed: true, action: () => { setShowSharePanel(false); setShowReportModal(true); } },
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
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
        {/* ═══ AVATAR ═══ */}
        <div className="flex flex-col items-center mt-2 mb-3">
          <div
            className={`relative ${isOwnProfile ? 'cursor-pointer' : ''}`}
            onClick={() => { if (isOwnProfile) fileInputRef.current?.click(); }}
          >
            <StoryGoldRingAvatar size={130} src={displayAvatar} alt="Profile" />
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

        {/* ═══ NAME + USERNAME ═══ */}
        <div className="flex flex-col items-center px-4" style={{ marginTop: '-6px' }}>
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-extrabold text-gold-metallic tracking-tight">{displayName}</h1>
            {profileData?.is_creator && (
              <span className="w-4 h-4 rounded-full bg-[#C9A96E] flex items-center justify-center">
                <Sparkles size={10} className="text-black" />
              </span>
            )}
          </div>
          <span className="text-[13px] text-white/80 font-medium">{displayUsername}</span>
        </div>


        {/* ═══ STATS ROW ═══ */}
        <div className="flex items-center justify-center gap-6 mt-4 px-4">
          <div className="flex flex-col items-center min-w-[60px]">
            <span className="text-[17px] font-extrabold text-white">{formatNumber(profileData?.following_count || 0)}</span>
            <span className="text-[11px] text-white/40 font-medium">Following</span>
          </div>
          <div className="flex flex-col items-center min-w-[60px]">
            <span className="text-[17px] font-extrabold text-white">{formatNumber(profileData?.followers_count || 0)}</span>
            <span className="text-[11px] text-white/40 font-medium">Followers</span>
          </div>
          <div className="flex flex-col items-center min-w-[60px]">
            <span className="text-[17px] font-extrabold text-white">{formatNumber(profileData?.likes_count || 0)}</span>
            <span className="text-[11px] text-white/40 font-medium">Likes</span>
          </div>
        </div>

        {/* ═══ BIO ═══ */}
        {profileData?.bio && (
          <p className="text-center text-[13px] text-white/70 mt-3 px-8 leading-relaxed">{profileData.bio}</p>
        )}

        {/* ═══ FOLLOW / MESSAGE (other user) ═══ */}
        {!isOwnProfile && (
          <div className="flex items-center justify-center gap-2 mt-4 px-6">
            <button
              onClick={toggleFollow}
              className={`flex-1 max-w-[160px] py-2.5 rounded-md text-sm font-bold transition ${
                isFollowing
                  ? 'bg-white/10 text-white border border-white/10'
                  : 'bg-[#C9A96E] text-black'
              }`}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </button>
            <button
              onClick={async () => {
                try {
                  const { data: threadBody, error: threadErr } = await request('/api/chat/threads/ensure', {
                    method: "POST",
                    body: JSON.stringify({ otherUserId: effectiveUserId }),
                  });
                  const tid = threadBody?.threadId || threadBody?.thread?.id || threadBody?.data?.id;
                  if (!threadErr && tid) {
                    navigate(`/inbox/${tid}`);
                  }
                } catch { navigate('/inbox'); }
              }}
              className="flex-1 max-w-[160px] py-2.5 bg-white/10 border border-white/10 rounded-md text-sm font-bold text-white"
            >
              Message
            </button>
            <button type="button" onClick={openSharePanel} className="w-10 h-10 bg-white/10 border border-white/10 rounded-md flex items-center justify-center" title="Share profile">
              <Share2 size={18} className="text-white" />
            </button>
          </div>
        )}

        {/* ═══ ACTION BAR (scrollable) — compact so Edit Profile is visible ═══ */}
        <div className="mt-2 border-b border-white/5">
          <div className="flex overflow-x-auto no-scrollbar">
            <button onClick={() => navigate('/ai-studio')} className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap">
              <Sparkles size={14} className="text-[#C9A96E]" />
              <span className="text-[11px] font-bold text-white">AI Studio</span>
            </button>
            <button onClick={() => navigate('/creator/login-details')} className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap">
              <Sparkles size={14} className="text-[#ff2d55]" />
              <span className="text-[11px] font-bold text-white">Elix Studio</span>
            </button>
            <button onClick={() => navigate('/shop')} className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap">
              <ShoppingBag size={14} className="text-[#C9A96E]" />
              <span className="text-[11px] font-bold text-white">Shop</span>
            </button>
            <button onClick={() => setActiveTab('shop')} className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap">
              <ShoppingBag size={14} className="text-[#ff2d55]" />
              <span className="text-[11px] font-bold text-white">Showcase</span>
            </button>
            {isOwnProfile && (
              <button onClick={() => navigate('/settings')} className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap">
                <Settings size={14} className="text-[#C9A96E]" />
                <span className="text-[11px] font-bold text-white">Settings</span>
              </button>
            )}
          </div>
        </div>

        {/* ═══ CONTENT TABS (6 icons) ═══ */}
        <div className="border-b border-white/10 flex">
          <button
            type="button"
            onClick={() => setActiveTab('videos')}
            className={`flex-1 pb-2.5 pt-2.5 flex items-center justify-center gap-0.5 border-b-2 transition-colors ${
              activeTab === 'videos' ? 'border-white text-white' : 'border-transparent text-white/30'
            }`}
            aria-label="Videos"
          >
            <Grid3X3 size={20} />
            <ChevronDown size={12} />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('shop')}
            className={`flex-1 pb-2.5 pt-2.5 flex justify-center border-b-2 transition-colors ${
              activeTab === 'shop' ? 'border-white text-white' : 'border-transparent text-white/30'
            }`}
            aria-label="Shop"
          >
            <ShoppingBag size={20} />
          </button>
          {isOwnProfile && (
            <button
              type="button"
              onClick={() => setActiveTab('private')}
              className={`flex-1 pb-2.5 pt-2.5 flex justify-center border-b-2 transition-colors ${
                activeTab === 'private' ? 'border-white text-white' : 'border-transparent text-white/30'
              }`}
              aria-label="Private"
            >
              <Lock size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('reposts')}
            className={`flex-1 pb-2.5 pt-2.5 flex justify-center border-b-2 transition-colors ${
              activeTab === 'reposts' ? 'border-white text-white' : 'border-transparent text-white/30'
            }`}
            aria-label="Reposts"
          >
            <Repeat2 size={20} />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`flex-1 pb-2.5 pt-2.5 flex justify-center border-b-2 transition-colors ${
              activeTab === 'saved' ? 'border-white text-white' : 'border-transparent text-white/30'
            }`}
            aria-label="Saved"
          >
            <Bookmark size={20} />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('liked')}
            className={`flex-1 pb-2.5 pt-2.5 flex justify-center border-b-2 transition-colors ${
              activeTab === 'liked' ? 'border-white text-white' : 'border-transparent text-white/30'
            }`}
            aria-label="Liked"
          >
            <Heart size={20} />
          </button>
        </div>

        {isOwnProfile && activeTab === 'private' && (
          <div className="px-3 pt-2 pb-1 flex justify-end">
            <button
              type="button"
              onClick={() => navigate('/upload?type=story')}
              className="px-3 py-1.5 rounded-md bg-[#C9A96E] text-black text-[11px] font-bold"
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
                <div className="w-8 h-8 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              videos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => navigate(`/video/${video.id}`)}
                  className="aspect-[3/4] bg-[#1C1E24] relative group text-left rounded-xl overflow-hidden"
                >
                  <img
                    src={video.thumbnail_url || getVideoPosterUrl(video.url || '')}
                    alt=""
                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition pointer-events-none"
                    loading="lazy"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (img.dataset.fallback) return;
                      img.dataset.fallback = '1';
                      const poster = getVideoPosterUrl(video.url || '');
                      if (poster && img.src !== poster) { img.src = poster; return; }
                      img.style.display = 'none';
                    }}
                  />
                  <span className="absolute inset-0 z-[1]" aria-hidden />
                  {!video.is_public && (
                    <div className="absolute top-2 right-2">
                      <Lock size={14} className="text-white drop-shadow" />
                    </div>
                  )}
                  <span className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 text-[11px] font-bold text-white drop-shadow-md">
                    <Play size={10} fill="white" /> {formatNumber(video.views)}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* ═══ SHOP ITEMS GRID ═══ */}
        {activeTab === 'shop' && videosLoading && shopItems.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {activeTab === 'shop' && shopItems.length > 0 && (
          <div className="grid grid-cols-2 gap-3 px-3 py-3 flex-1">
            {shopItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(`/shop/${item.id}`)}
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
                    onClick={() => navigate('/upload?type=story')}
                    className="px-3 py-1.5 rounded-md bg-[#C9A96E] text-black text-[11px] font-bold"
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
              <button onClick={() => navigate('/shop')} className="mt-2 px-4 py-2 rounded-xl bg-[#C9A96E] text-black font-bold text-xs">
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
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}
