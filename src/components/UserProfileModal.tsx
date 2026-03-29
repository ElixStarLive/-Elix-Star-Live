import React, { useState, useEffect } from 'react';
import { Share2, Ban, Play, MoreHorizontal, Flag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useVideoStore } from '../store/useVideoStore';
import { useAuthStore } from '../store/useAuthStore';
import { AvatarRing } from './AvatarRing';
import { useSafetyStore } from '../store/useSafetyStore';
import ReportModal from './ReportModal';
import { showToast } from '../lib/toast';
import { api, request } from '../lib/apiClient';
import { navigateToDmWithUser } from '../lib/openDmThread';

interface User {
  id: string;
  username: string;
  name: string;
  avatar: string;
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
  onFollow: () => void;
}

export default function UserProfileModal({ isOpen, onClose, user, onFollow }: UserProfileModalProps) {
  const navigate = useNavigate();
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);

  const { videos } = useVideoStore();
  const { user: currentUser, session } = useAuthStore();
  const blockedUserIds = useSafetyStore((s) => s.blockedUserIds);
  const blockUser = useSafetyStore((s) => s.blockUser);
  const unblockUser = useSafetyStore((s) => s.unblockUser);

  const displayUser: User = profileUser
    ? { ...user, ...profileUser }
    : user;

  const userVideos = videos.filter(video => video.user.id === user.id);
  const isOwnProfile = currentUser?.id === user.id;
  const isBlocked = blockedUserIds.includes(user.id);

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    setProfileUser(null);
    let cancelled = false;
    (async () => {
      try {
        const { data: profile } = await api.profiles.get(user.id);
        if (cancelled || !profile) return;
        const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
          api.profiles.getFollowerCount(user.id),
          api.profiles.getFollowingCount(user.id),
        ]);
        if (cancelled) return;
        const uname = profile.username || profile.display_name || 'user';
        setProfileUser({
          id: user.id,
          username: uname,
          name: profile.display_name || uname,
          avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(uname)}`,
          level: 1,
          isVerified: !!profile.is_creator,
          followers: followersCount ?? 0,
          following: followingCount ?? 0,
          isFollowing: user.isFollowing,
        });
      } catch {
        if (!cancelled) setProfileUser(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, user.id]);

  if (!isOpen) return null;

  const handleMessage = async () => {
    onClose();
    const token = useAuthStore.getState().session?.access_token;
    await navigateToDmWithUser(user.id, navigate, token);
  };

  const handleReportUser = () => {
    setShowMoreOptions(false);
    setShowReportModal(true);
  };

  const handleBlockUser = async () => {
    await request('/api/block-user', {
      method: 'POST',
      body: JSON.stringify({ blockedUserId: user.id, action: 'block' }),
    }).catch(() => null);
    blockUser(user.id);
    onClose();
  };


  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  };

  if (isBlocked) {
    return (
      <div className="fixed inset-0 z-modals bg-[#13151A] flex items-center justify-center p-4">
        <div className="bg-[#13151A] rounded-2xl p-6 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Ban className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-white font-semibold mb-2">User Blocked</h3>
          <p className="text-white/60 text-sm mb-4">
            You have blocked @{displayUser.username}. You will no longer see their content.
          </p>
          <button
            onClick={async () => {
              await request('/api/block-user', {
                method: 'POST',
                body: JSON.stringify({ blockedUserId: user.id, action: 'unblock' }),
              }).catch(() => null);
              unblockUser(user.id);
            }}
            className="px-4 py-2 bg-white text-white rounded-lg hover:bg-white transition-colors"
          >
            Unblock User
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[10001] bg-black/60 flex items-end justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="w-full max-w-[480px] bg-[#1C1E24] overflow-y-auto animate-in slide-in-from-bottom duration-300 relative border border-b-0 border-[#C9A96E]/30 shadow-2xl"
        style={{ marginBottom: 'calc(var(--nav-height) + var(--safe-bottom) - 5mm)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[#1C1E24]/98 backdrop-blur-md border-b border-white/5">
          <button
            onClick={handleShareProfile}
            className="p-2 rounded-full hover:bg-white/5 transition-colors"
            aria-label="Share profile"
          >
            <img src="/Icons/Share Icon.png" alt="Share" className="w-5 h-5 object-contain opacity-90" />
          </button>
          <h3 className="text-[#C9A96E] font-semibold text-sm absolute left-1/2 -translate-x-1/2">{displayUser.username}</h3>
          <button 
            onClick={onClose} 
            className="p-2 rounded-full hover:bg-white/5 transition-colors"
            aria-label="Close profile"
          >
            <img src="/Icons/Gold power buton.png" alt="Close" className="w-5 h-5 object-contain opacity-90" />
          </button>
        </div>

        <div className="p-5 pb-safe">
          {/* Profile Header */}
          <div className="flex flex-col items-center mb-4">
            <div className="mb-3">
              <AvatarRing src={displayUser.avatar} alt={displayUser.name} size={80} />
            </div>
            <h2 className="text-lg font-bold text-white flex items-center gap-1.5">
              @{displayUser.username}
              {displayUser.isVerified && (
                <span className="w-2 h-2 rounded-full bg-[#C9A96E] flex-shrink-0" />
              )}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-white/80 font-medium">{displayUser.name}</span>
              {displayUser.level != null && (
                <span className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-bold text-[#C9A96E] border border-[#C9A96E]/30">
                  LV {displayUser.level}
                </span>
              )}
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
                  {displayUser.isFollowing ? (
                    <button
                      onClick={onFollow}
                      className="flex-1 h-9 flex items-center justify-center bg-white/10 text-white rounded-xl font-semibold text-xs hover:bg-white/15 transition-colors"
                    >
                      Following
                    </button>
                  ) : (
                    <button
                      onClick={onFollow}
                      className="flex-1 h-9 flex items-center justify-center bg-[#C9A96E] text-black rounded-xl font-semibold text-xs hover:bg-[#C9A96E]/90 transition-colors"
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
                      <div className="absolute top-full right-0 mt-2 w-40 bg-[#25262b] rounded-xl shadow-xl border border-white/10 z-50 overflow-hidden py-1">
                        <button
                          onClick={handleReportUser}
                          className="w-full px-4 py-2.5 text-left text-xs text-white/90 hover:bg-white/5 flex items-center gap-2"
                        >
                          <Flag size={14} /> Report
                        </button>
                        <button
                          onClick={handleBlockUser}
                          className="w-full px-4 py-2.5 text-left text-xs text-red-400/90 hover:bg-white/5 flex items-center gap-2 border-t border-white/5"
                        >
                          <Ban size={14} /> Block
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
              <div className="w-0.5 h-4 rounded-full bg-[#C9A96E]/80" />
              <span className="text-sm font-semibold text-white/90">Videos</span>
            </div>
            {userVideos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {userVideos.map((video) => (
                  <div key={video.id} onClick={() => { onClose(); navigate(`/video/${video.id}`); }} className="aspect-[3/4] bg-[#0A0B0E] rounded-xl overflow-hidden relative cursor-pointer">
                    <video
                      src={video.url}
                      poster={video.thumbnail || undefined}
                      muted
                      autoPlay
                      loop
                      playsInline
                      className="w-full h-full object-cover"
                      ref={(el) => { if (el) el.play().catch(() => {}); }}
                    />
                    {video.thumbnail && (
                      <img
                        src={video.thumbnail}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        onLoad={(e) => {
                          const vid = (e.target as HTMLImageElement).parentElement?.querySelector('video');
                          if (vid) vid.addEventListener('playing', () => { (e.target as HTMLImageElement).style.display = 'none'; }, { once: true });
                        }}
                      />
                    )}
                    <div className="absolute bottom-1.5 left-1.5 text-[10px] font-bold text-white drop-shadow-md flex items-center gap-0.5">
                      <Play size={10} fill="white" />
                      {formatNumber(video.stats?.views || 0)}
                    </div>
                    {video.description && (
                      <div className="absolute top-1.5 left-1.5 right-1.5 text-[9px] text-white/80 truncate drop-shadow-md">
                        {video.description}
                      </div>
                    )}
                  </div>
                ))}
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

  function handleShareProfile() {
    const profileUrl = `${window.location.origin}/profile/${displayUser.username}`;
    if (navigator.share) {
      navigator.share({
        title: `Check out ${displayUser.name}'s profile`,
        text: `Check out ${displayUser.name} (@${displayUser.username}) on Elix Star${displayUser.bio ? ` - ${displayUser.bio}` : ''}`,
        url: profileUrl,
      });
    } else {
      navigator.clipboard.writeText(profileUrl);
      showToast('Profile link copied to clipboard!');
    }
  }
}
