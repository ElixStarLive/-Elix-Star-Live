import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import EnhancedVideoPlayer from '../components/EnhancedVideoPlayer';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { request } from '../lib/apiClient';

interface SuggestedUser {
  id: string;
  username: string;
  name: string;
  avatar_url?: string;
  is_live?: boolean;
}

export default function FriendsFeed() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { friendVideos, fetchFriendVideos, friendsLoading: loading } = useVideoStore();
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const friendVideoIds = friendVideos.map((v) => v.id);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const [profilesResult, liveResult] = await Promise.all([
          request('/api/profiles'),
          request('/api/live/streams').catch(() => ({ data: null, error: null })),
        ]);
        const profilesBody = profilesResult.data ?? { profiles: [] };
        const liveBody = liveResult.data ?? { streams: [] };
        const liveSet = new Set((liveBody?.streams || []).map((s: any) => s.hostUserId || s.userId || s.user_id).filter(Boolean));

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
          .filter((p) => !!p.id && p.id !== user?.id)
          .filter((p) => {
            const name = (p.name || p.username || '').trim().toLowerCase();
            return name !== '' && !blocklist.includes(name) && name.length >= 2;
          });

        mapped.sort((a, b) => (a.is_live === b.is_live ? 0 : a.is_live ? -1 : 1));
        setSuggestedUsers(mapped);
      } catch {}
    };

    fetchUsers();
    fetchFriendVideos();
  }, [user?.id, fetchFriendVideos]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollPos = containerRef.current.scrollTop;
    const height = containerRef.current.clientHeight;
    const index = Math.round(scrollPos / height);
    if (index >= 0 && index < friendVideoIds.length) {
      setActiveIndex(index);
    }
  };

  // Keep active index in sync with visible slide (so video play/pause works when scrolling)
  useEffect(() => {
    if (!containerRef.current || friendVideoIds.length === 0) return;
    const container = containerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const idx = Number((entry.target as HTMLElement).dataset.slideIndex);
          if (!Number.isNaN(idx) && idx >= 0 && idx < friendVideoIds.length) {
            setActiveIndex(idx);
          }
        });
      },
      { root: container, rootMargin: '0px', threshold: 0.51 }
    );
    const slides = container.querySelectorAll('[data-slide-index]');
    slides.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [friendVideoIds.join(',')]);

  const handleVideoEnd = (index: number) => {
    if (!containerRef.current || index >= friendVideoIds.length - 1) return;
    containerRef.current.scrollTo({
      top: (index + 1) * containerRef.current.clientHeight,
      behavior: 'smooth',
    });
  };

  return (
    <div className="h-full min-h-0 w-full flex justify-center bg-[#13151A]">
      {/* Full height of main: header + stories + video scroll share this column (video is NOT main-high alone) */}
      <div className="w-full max-w-[480px] h-full min-h-0 flex flex-col overflow-hidden mx-auto">
        <div className="w-full shrink-0 bg-[#13151A] z-10 relative pt-app-header-safe">
          <div className="px-3 pb-1 flex items-center justify-between relative">
            <button onClick={() => navigate('/search')} className="p-1 z-10" aria-label="Search"><Search size={18} className="text-white" /></button>
            <h1 className="text-sm font-bold text-white absolute left-1/2 transform -translate-x-1/2">Friends</h1>
            <div className="flex items-center gap-3 z-10">
              <button onClick={() => navigate(-1)} title="Back">
                <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Circles — shifted down 3mm (paint only; no extra header padding) */}
          <div
            className="px-3 py-2 relative z-[11]"
            style={{ transform: 'translateY(0mm)' }}
          >
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
            <button
              type="button"
              onClick={() => navigate('/create')}
              className="flex-shrink-0 flex flex-col items-center gap-1" style={{ width: 95, minWidth: 95 }}
            >
              <StoryGoldRingAvatar
                data-avatar-circle="create"
                alt="You"
                src={
                  user?.avatar ||
                  (user?.id && typeof localStorage !== 'undefined' ? localStorage.getItem('elix_avatar_' + user.id) : null) ||
                  '/Icons/Profile icon.png'
                }
              />
              <div className="text-[11px] text-white/80 truncate w-full text-center">Create</div>
            </button>

            {/* All Elix users (always visible) */}
            {suggestedUsers.map((u) => (
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
            </div>
          </div>
        </div>

        <div
          ref={containerRef}
          className="flex-1 min-h-0 w-full overflow-y-scroll snap-y snap-mandatory relative overscroll-none bg-[#0A0B0E]"
          style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
          onScroll={handleScroll}
        >
          {friendVideoIds.map((videoId, index) => (
            <div
              key={`friend-${videoId}-${index}`}
              data-slide-index={index}
              className="h-full w-full shrink-0 snap-start bg-[#0A0B0E]"
              style={{
                height: '100%',
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
              }}
            >
              <div className="w-full h-full min-h-0 relative overflow-hidden bg-[#0A0B0E]">
                <EnhancedVideoPlayer
                  videoId={videoId}
                  isActive={activeIndex === index}
                  onVideoEnd={() => handleVideoEnd(index)}
                />
              </div>
            </div>
          ))}

          {loading && friendVideoIds.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-8 h-8 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && friendVideoIds.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 px-6 text-center">
              <p className="text-base font-semibold mb-1">No videos yet</p>
              <p className="text-xs text-white/30 mb-4">Follow people or wait for followers to post — everyone shows in one feed</p>
              <button
                onClick={() => navigate('/discover')}
                className="px-5 py-2 bg-[#C9A96E] text-black rounded-full text-sm font-bold"
              >
                Discover people
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
