import React, { useState, useEffect, useCallback } from 'react';
import { RoyceCloseIcon } from './royce';
import { Ban, Play, MoreHorizontal, Flag, Search, Video } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVideoStore } from '../store/useVideoStore';
import { useAuthStore } from '../store/useAuthStore';
import { StoryGoldRingAvatar } from './StoryGoldRingAvatar';
import { LevelBadge } from './LevelBadge';
import { useSafetyStore } from '../store/useSafetyStore';
import ReportModal from './ReportModal';
import { api } from '../lib/apiClient';
import { navigateToDmWithUser } from '../lib/openDmThread';
import { getVideoPosterUrl, resolveGridThumbnailUrl, resolveVideoPlaybackUrl } from '../lib/bunnyStorage';
import { apiSetBlockUserAction } from '../features/safety/safetyApi';
import { apiFetchFollowingIds } from '../features/feed/feedApi';
import { apiLiveStreams, findLiveWatchTarget } from '../lib/live';
import { showToast } from '../lib/toast';
import { reportFailure } from '../lib/reportFailure';
import { formatCompactNumber as formatNumber } from '../lib/formatCompactNumber';
import { initiateCall } from '../lib/callService';
import { containerReturnState } from '../lib/settingsNav';

interface User {
  id: string;
  username: string;
  name: string;
  avatar: string;
  /** Account email when known (own profile from auth; others if API provides). */
  email?: string;
  level?: number;
  isVerified?: boolean;
  followers: number;
  following: number;
  isFollowing?: boolean;
  bio?: string;
  website?: string;
  location?: string;
  joinedDate?: string;
}

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  /** Optional — when omitted, modal uses store toggleFollow. */
  onFollow?: () => void;
  /** Optional hint from feed (For You) when creator is already known live. */
  isLiveHint?: boolean;
}

export default function UserProfileModal({ isOpen, onClose, user, onFollow, isLiveHint = false }: UserProfileModalProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [liveWatchKey, setLiveWatchKey] = useState<string | null>(null);

  const videos = useVideoStore((s) => s.videos);
  const followingUsers = useVideoStore((s) => s.followingUsers);
  const toggleFollow = useVideoStore((s) => s.toggleFollow);
  const setUserFollowing = useVideoStore((s) => s.setUserFollowing);
  const { user: currentUser, session: _session } = useAuthStore();
  const blockedUserIds = useSafetyStore((s) => s.blockedUserIds);
  const blockUser = useSafetyStore((s) => s.blockUser);
  const unblockUser = useSafetyStore((s) => s.unblockUser);

  const displayUser: User = profileUser
    ? { ...user, ...profileUser }
    : user;

  const userVideos = videos.filter(video => video.user.id === user.id);
  const isOwnProfile = currentUser?.id === user.id;
  const isBlocked = blockedUserIds.includes(user.id);
  const isFollowingUser = followingUsers.includes(user.id);
  const isLiveNow = !!liveWatchKey && !isOwnProfile;

  const handleJoinLive = useCallback(() => {
    const key = String(liveWatchKey || user.id || '').trim();
    if (!key) return;
    onClose();
    navigate(`/watch/${encodeURIComponent(key)}`);
  }, [liveWatchKey, user.id, onClose, navigate]);

  const handleFollowToggle = useCallback(() => {
    if (!user?.id || isOwnProfile) return;
    if (onFollow) {
      onFollow();
      return;
    }
    void toggleFollow(user.id);
  }, [user?.id, isOwnProfile, onFollow, toggleFollow]);

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    setProfileUser((prev) => (prev && prev.id !== user.id ? null : prev));
    setLiveWatchKey(isLiveHint ? String(user.id) : null);
    let cancelled = false;
    (async () => {
      try {
        const livePromise = apiLiveStreams().catch((err) => {
          reportFailure('user_profile_live_streams', err);
          return null;
        });
        const profilePromise = api.profiles.get(user.id).catch((err) => {
          reportFailure('user_profile_get', err);
          return { data: null };
        });
        const countsPromise = Promise.all([
          api.profiles.getFollowerCount(user.id).then((r) => {
            if (r.error || r.count == null) {
              reportFailure(
                'user_profile_follower_count',
                r.error ?? { message: 'NULL_FOLLOWER_COUNT' },
              );
              return { count: null as number | null };
            }
            return { count: r.count };
          }).catch((err) => {
            reportFailure('user_profile_follower_count', err);
            return { count: null as number | null };
          }),
          api.profiles.getFollowingCount(user.id).then((r) => {
            if (r.error || r.count == null) {
              reportFailure(
                'user_profile_following_count',
                r.error ?? { message: 'NULL_FOLLOWING_COUNT' },
              );
              return { count: null as number | null };
            }
            return { count: r.count };
          }).catch((err) => {
            reportFailure('user_profile_following_count', err);
            return { count: null as number | null };
          }),
        ]);
        const followPromise =
          currentUser?.id && currentUser.id !== user.id
            ? apiFetchFollowingIds(currentUser.id)
            : Promise.resolve({ following: [] as string[], error: null as string | null });

        const [liveResult, profileRes, [{ count: followersCount }, { count: followingCount }], followResult] =
          await Promise.all([livePromise, profilePromise, countsPromise, followPromise]);
        if (cancelled) return;

        if (liveResult) {
          const watchTarget = findLiveWatchTarget(liveResult.streams || [], user.id);
          setLiveWatchKey(watchTarget || (isLiveHint ? String(user.id) : null));
        }

        if (currentUser?.id && currentUser.id !== user.id && !followResult.error) {
          const follows = followResult.following.some((id) => String(id) === String(user.id));
          setUserFollowing(user.id, follows, 0);
        }

        const body = profileRes?.data;
        if (!body) {
          /* keep prior profileUser — do not wipe on profile fail */
          return;
        }
        // API returns { profile: { username, displayName, avatarUrl, isVerified, ... } } (camelCase).
        const profile = (body as { profile?: Record<string, unknown> })?.profile ?? body;

        const pUsername = typeof profile.username === 'string' ? profile.username : '';
        const pDisplayName = typeof profile.displayName === 'string' ? profile.displayName : '';
        const pAvatarUrl = typeof profile.avatarUrl === 'string' ? profile.avatarUrl : '';
        const pEmail = typeof profile.email === 'string' ? profile.email : '';
        const pLevel = typeof profile.level === 'number' ? profile.level : 1;
        const uname = pUsername || user.username || pDisplayName || 'user';
        const ownEmail =
          currentUser?.id === user.id && typeof currentUser?.email === 'string'
            ? currentUser.email
            : '';
        setProfileUser((prev) => {
          const sameUser = prev?.id === user.id ? prev : null;
          const nextFollowers =
            typeof followersCount === 'number' && Number.isFinite(followersCount)
              ? followersCount
              : (sameUser?.followers ?? user.followers);
          const nextFollowing =
            typeof followingCount === 'number' && Number.isFinite(followingCount)
              ? followingCount
              : (sameUser?.following ?? user.following);
          return {
            id: user.id,
            username: uname,
            // Real account display name — never put this in the top header.
            name: pDisplayName || user.name || uname,
            email: (pEmail.includes('@') ? pEmail : '') || ownEmail || user.email || '',
            avatar: pAvatarUrl || user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(uname)}`,
            level: pLevel,
            isVerified: !!profile.isVerified,
            followers: nextFollowers,
            following: nextFollowing,
          };
        });
      } catch (e) {
        if (!cancelled) {
          reportFailure('user_profile_modal', e);
          /* keep prior profileUser / liveWatchKey — do not fake empty */
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user.id, isLiveHint]);

  /* Hide home TopNav while this profile is open (stacking keeps TopNav visible otherwise). */
  useEffect(() => {
    if (!isOpen) return;
    document.body.setAttribute('data-user-profile-open', '1');
    return () => {
      document.body.removeAttribute('data-user-profile-open');
    };
  }, [isOpen]);

  const openVideoFromGrid = useCallback((videoId: string) => {
    onClose();
    const path = location.pathname.split('?')[0] || '/feed';
    navigate(`/video/${videoId}`, {
      state: { ...containerReturnState(path), fromProfile: true },
    });
  }, [onClose, navigate, location.pathname]);

  const goSearch = useCallback(() => {
    onClose();
    const path = location.pathname.split('?')[0] || '/feed';
    navigate('/search', { state: containerReturnState(path) });
  }, [onClose, navigate, location.pathname]);

  if (!isOpen) return null;

  const realName = displayUser.name || displayUser.username || 'User';
  /** Show only local part + @ (e.g. info@) — never the domain. */
  const realEmail = (() => {
    const full =
      (isOwnProfile && currentUser?.email?.includes('@') ? currentUser.email : '') ||
      (displayUser.email?.includes('@') ? displayUser.email : '') ||
      '';
    const trimmed = full.trim();
    if (!trimmed.includes('@')) return '';
    return `${trimmed.split('@')[0]}@`;
  })();

  const handleMessage = async () => {
    onClose();
    const token = useAuthStore.getState().session?.access_token;
    await navigateToDmWithUser(user.id, navigate, token);
  };

  const handleVideoCall = async () => {
    if (!user?.id || isOwnProfile) return;
    try {
      const callId = await initiateCall({
        id: user.id,
        username: displayUser.username || displayUser.name || 'User',
        avatar: displayUser.avatar || '',
      });
      if (callId) {
        onClose();
        navigate('/call');
      } else {
        showToast('Could not start video call');
      }
    } catch {
      showToast('Could not start video call');
    }
  };

  const handleReportUser = () => {
    setShowMoreOptions(false);
    setShowReportModal(true);
  };

  const handleBlockUser = async () => {
    const result = await apiSetBlockUserAction(user.id, 'block');
    if (!result.ok) {
      showToast(result.error || 'Could not block user. Try again.');
      return;
    }
    blockUser(user.id);
    onClose();
  };


  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  };

  if (isBlocked) {
    return (
      <div
        className="page-above-bottom-nav elix-user-panel bg-transparent text-white"
        style={{ zIndex: 100020, bottom: 'var(--bottom-nav-top)' }}
      >
        <div className="page-above-bottom-nav__inner bg-transparent flex flex-col">
          <div
            className="flex justify-center pt-0.5 pb-1 flex-shrink-0"
            aria-hidden
            style={{ transform: 'translateY(0.6mm)' }}
          >
            <div className="w-10 h-1 rounded-full bg-white/25" />
          </div>
          <header className="flex items-center justify-between px-4 pt-page-header pb-2 relative z-20">
            <button
              type="button"
              onClick={goSearch}
              className="relative z-20 p-1"
              aria-label="Search"
              title="Search"
            >
              <Search size={20} className="stroke-gold-metallic" strokeWidth={2} />
            </button>
            <h3 className="pointer-events-none text-[12px] font-bold text-gold-metallic">User Profile</h3>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              className="relative z-20 p-1"
              aria-label="Close profile"
              title="Close"
            >
              <RoyceCloseIcon />
            </button>
          </header>
          <div className="flex-1 min-h-0 flex items-center justify-center p-6">
            <div className="text-center max-w-sm w-full">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Ban className="w-8 h-8 text-white/70" />
              </div>
              <h3 className="text-white font-semibold mb-2">User Blocked</h3>
              <p className="text-white/60 text-sm mb-4">
                You have blocked @{displayUser.username}. You will no longer see their content.
              </p>
              <button
                type="button"
                onClick={async () => {
                  const result = await apiSetBlockUserAction(user.id, 'unblock');
                  if (!result.ok) {
                    showToast(result.error || 'Could not unblock user. Try again.');
                    return;
                  }
                  unblockUser(user.id);
                }}
                className="px-4 py-2.5 rounded-lg bg-white/10 text-white font-bold text-sm border border-[#2A2D33] hover:bg-white/15 active:scale-95 transition"
              >
                Unblock User
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="page-above-bottom-nav elix-user-panel bg-transparent text-white"
      style={{ zIndex: 100020, bottom: 'var(--bottom-nav-top)' }}
    >
      <div className="page-above-bottom-nav__inner bg-transparent flex flex-col">
        {/* Header — Search + Close only (home TopNav hidden while open) */}
        <div
          className="flex justify-center pt-0.5 pb-1 flex-shrink-0"
          aria-hidden
          style={{ transform: 'translateY(0.6mm)' }}
        >
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>
        <header className="flex items-center justify-between px-4 pt-page-header pb-2 relative z-20 flex-shrink-0">
          <button
            type="button"
            onClick={goSearch}
            className="relative z-20 p-1"
            aria-label="Search"
            title="Search"
          >
            <Search size={20} className="stroke-gold-metallic" strokeWidth={2} />
          </button>
          <h3 className="pointer-events-none text-[12px] font-bold text-gold-metallic absolute left-1/2 -translate-x-1/2 truncate max-w-[50%]">
            User Profile
          </h3>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="relative z-20 p-1"
            aria-label="Close profile"
            title="Close"
          >
            <RoyceCloseIcon />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pb-safe">
          {/* Profile Header */}
          <div className="flex flex-col items-center mb-4">
            <div className="mb-3 overflow-visible">
              <StoryGoldRingAvatar
                size={80}
                src={displayUser.avatar}
                alt={displayUser.name}
                live={!!liveWatchKey}
              />
            </div>
            <h2 className="text-lg font-bold text-white flex items-center gap-1.5 -translate-y-[2mm]">
              {realName}
              {displayUser.isVerified && (
                <span className="w-2 h-2 rounded-full bg-[#FFFFFF] flex-shrink-0" />
              )}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              {realEmail ? (
                <span className="text-sm text-white/80 font-medium">{realEmail}</span>
              ) : null}
              <LevelBadge
                level={displayUser.level ?? 1}
                hideCircle
                layout="fixed"
                className="translate-y-[0.5mm]"
              />
            </div>

            {/* Stats */}
            <div className="flex items-center gap-10 mt-4 w-full justify-center pb-4 border-b border-white/5">
              <div className="flex flex-col items-center">
                <span className="font-bold text-lg text-white">{formatNumber(displayUser.following)}</span>
                <span className="text-xs text-white/50">Following</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="font-bold text-lg text-white">{formatNumber(displayUser.followers)}</span>
                <span className="text-xs text-white/50">Followers</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="font-bold text-lg text-white">{userVideos.length}</span>
                <span className="text-xs text-white/50">Videos</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 mt-4 mx-auto w-full max-w-[300px]">
              {!isOwnProfile && (
                <>
                  {isLiveNow ? (
                    <button
                      type="button"
                      onClick={handleJoinLive}
                      className="flex-1 h-9 flex items-center justify-center bg-white/10 text-white rounded-xl font-semibold text-xs hover:bg-white/15 transition-colors"
                      aria-label="Watch Live"
                      title="Watch Live"
                    >
                      Watch Live
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => { void handleVideoCall(); }}
                    className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/15 transition-colors flex-shrink-0 active:scale-95"
                    aria-label="Video call"
                    title="Video call"
                  >
                    <Video size={18} strokeWidth={2} className="text-[#F5F5F7]" />
                  </button>
                  {isFollowingUser ? (
                    <button
                      type="button"
                      onClick={handleFollowToggle}
                      className="flex-1 h-9 flex items-center justify-center bg-white/10 rounded-xl font-semibold text-xs hover:bg-white/15 transition-colors text-red-500"
                      style={{ color: '#D91F2D', WebkitTextFillColor: '#D91F2D', backgroundImage: 'none' }}
                    >
                      Unfollow
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleFollowToggle}
                      className="flex-1 h-9 flex items-center justify-center bg-white/10 text-white rounded-xl font-semibold text-xs hover:bg-white/15 transition-colors"
                    >
                      Follow
                    </button>
                  )}
                  <button
                    onClick={handleMessage}
                    className="flex-1 h-9 flex items-center justify-center bg-white/10 text-white rounded-xl font-semibold text-xs hover:bg-white/15 transition-colors"
                  >
                    Message
                  </button>
                  <button
                    onClick={() => setShowMoreOptions(!showMoreOptions)}
                    className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/15 transition-colors relative flex-shrink-0"
                    aria-label="More options"
                  >
                    <MoreHorizontal size={18} strokeWidth={2} />
                    {showMoreOptions && (
                      <div className="absolute top-full right-0 mt-2 w-40 elix-glass rounded-xl shadow-xl border border-black z-50 overflow-hidden py-1">
                        <button
                          type="button"
                          onClick={handleReportUser}
                          className="w-full px-4 py-2.5 text-left text-xs hover:bg-white/5 flex items-center gap-2"
                          style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF', backgroundImage: 'none' }}
                        >
                          <Flag size={14} className="shrink-0" />
                          <span style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF', backgroundImage: 'none' }}>Report</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleBlockUser}
                          className="w-full px-4 py-2.5 text-left text-xs hover:bg-white/5 flex items-center gap-2 border-t border-white/5"
                          style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF', backgroundImage: 'none' }}
                        >
                          <Ban size={14} className="shrink-0" />
                          <span style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF', backgroundImage: 'none' }}>Block</span>
                        </button>
                      </div>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Bio */}
            {displayUser.bio && (
              <p className="mt-3 text-xs text-white/80 text-center px-4 leading-relaxed max-w-md">
                {displayUser.bio}
              </p>
            )}
            
            {(displayUser.location || displayUser.website || displayUser.joinedDate) && (
               <div className="flex flex-wrap justify-center gap-4 mt-4 text-xs text-white/50">
                  {displayUser.location && <span>📍 {displayUser.location}</span>}
                  {displayUser.joinedDate && <span>📅 Joined {formatDate(displayUser.joinedDate)}</span>}
                  {displayUser.website && (
                    <a
                      href={displayUser.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white text-sm hover:underline"
                    >
                      {displayUser.website}
                    </a>
                  )}
               </div>
            )}
          </div>

          {/* Video Feed */}
          <div className="mt-6 pt-4 border-t border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-0.5 h-4 rounded-full bg-[#E6E9EE]/80" />
              <span className="text-sm font-semibold text-white/90">Videos</span>
            </div>
            {userVideos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {userVideos.map((video) => {
                  const thumb = resolveGridThumbnailUrl(video.thumbnail, video.url);
                  const playbackUrl = resolveVideoPlaybackUrl(video.url || '');
                  const bunnyPoster = getVideoPosterUrl(video.url || '');
                  return (
                  <div key={video.id} onClick={() => openVideoFromGrid(video.id)} className="aspect-[3/4] bg-black rounded-xl overflow-hidden relative cursor-pointer">
                    {playbackUrl ? (
                      <video
                        src={`${playbackUrl}#t=0.1`}
                        poster={thumb || undefined}
                        muted
                        playsInline
                        preload="metadata"
                        className="absolute inset-0 w-full h-full object-cover"
                        aria-hidden
                      />
                    ) : null}
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (img.dataset.fallback) {
                            img.style.display = 'none';
                            return;
                          }
                          img.dataset.fallback = '1';
                          if (bunnyPoster && img.src !== bunnyPoster) { img.src = bunnyPoster; return; }
                          img.style.display = 'none';
                        }}
                      />
                    ) : null}
                    <div className="absolute bottom-1.5 left-1.5 text-[10px] font-bold text-white drop-shadow-md flex flex-col items-start gap-0.5">
                      <Play size={10} fill="white" />
                      <span className="leading-none">{formatNumber(video.stats?.views || 0)}</span>
                    </div>
                    {video.description && (
                      <div className="absolute top-1.5 left-1.5 right-1.5 text-[9px] text-white/80 truncate drop-shadow-md">
                        {video.description}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 text-center text-white/40 text-sm rounded-lg bg-white/[0.02]">
                No videos yet
              </div>
            )}
          </div>
        </div>
      </div>

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        videoId=""
        contentType="user"
        contentId={user.id}
      />
    </div>
  );
}
