import React, { useEffect, useRef, useState } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { Search, Plus } from 'lucide-react';
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
        // Match live by any id a stream may carry (user_id can fall back to the room key server-side).
        const liveSet = new Set(
          (liveBody?.streams || [])
            .flatMap((s: any) => [s.hostUserId, s.userId, s.user_id, s.stream_key, s.streamKey, s.room_id, s.roomId])
            .filter(Boolean)
            .map((v: any) => String(v)),
        );

        const rows = Array.isArray(profilesBody?.profiles) ? profilesBody.profiles : [];
        const blocklist = ['', 'user', 'demo', 'test', 'unknown', 'anonymous', 'guest'];
        const mapped: SuggestedUser[] = rows
          .map((p: any) => ({
            id: p.user_id || p.userId,
            username: p.username || 'user',
            name: p.display_name || p.displayName || p.username || 'User',
            avatar_url: p.avatar_url || p.avatarUrl,
            is_live: liveSet.has(String(p.user_id || p.userId || '')),
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
    <div className="h-full min-h-0 w-full flex justify-center bg-[#111111]">
      {/* Full height of main: header + stories + video scroll share this column (video is NOT main-high alone) */}
      <div className="w-full max-w-[480px] h-full min-h-0 flex flex-col overflow-hidden mx-auto">
        <div className="w-full shrink-0 bg-[#111111] z-10 relative pt-app-header-safe">
          <div className="px-3 pb-1 flex items-center justify-between relative">
            <button onClick={() => navigate('/search')} className="p-1 z-10" aria-label="Search"><Search size={18} className="text-white" /></button>
            <h1 className="text-sm font-bold text-white absolute left-1/2 transform -translate-x-1/2">Friends</h1>
            <div className="flex items-center gap-3 z-10">
              <button onClick={() => navigate(-1)} title="Back">
                <RoyceBackIcon />
              </button>
            </div>
          </div>

          {/* Circles — shifted down 3mm (paint only; no extra header padding) */}
          <div
            className="px-3 py-2 relative z-[11]"
            style={{ transform: 'translateY(0mm)' }}
          >
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Add story — first in Friends strip (before other users) */}
            <button
              type="button"
              onClick={() => navigate('/upload?type=story')}
              className="flex-shrink-0 flex flex-col items-center gap-1"
              style={{ width: 95, minWidth: 95 }}
              title="Add story"
            >
              <div className="relative" style={{ width: 62, height: 62 }}>
                <StoryGoldRingAvatar
                  size={62}
                  src={user?.avatar || '/royce/default-avatar.svg'}
                  alt={user?.username || 'You'}
                />
                <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[#D4AF37] border-2 border-black flex items-center justify-center">
                  <Plus size={12} className="text-black" strokeWidth={3} />
                </span>
              </div>
              <div className="text-[11px] text-white/80 truncate w-full text-center">Add story</div>
            </button>
            {/* Friends / Elix users */}
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
                  src={u.avatar_url || '/royce/default-avatar.svg'}
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
          className="flex-1 min-h-0 w-full overflow-y-scroll snap-y snap-mandatory relative overscroll-none bg-black"
          style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
          onScroll={handleScroll}
        >
          {friendVideoIds.map((videoId, index) => (
            <div
              key={`friend-${videoId}-${index}`}
              data-slide-index={index}
              className="h-full w-full shrink-0 snap-start bg-black"
              style={{
                height: '100%',
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
              }}
            >
              <div className="w-full h-full min-h-0 relative overflow-hidden bg-black">
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
              <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && friendVideoIds.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 px-6 text-center">
              <p className="text-base font-semibold mb-1">No videos yet</p>
              <p className="text-xs text-white/30 mb-4">Follow people or wait for followers to post — everyone shows in one feed</p>
              <button
                onClick={() => navigate('/discover')}
                className="px-5 py-2 bg-[#D4AF37] text-black rounded-full text-sm font-bold"
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
