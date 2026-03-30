import React, { useEffect, useState, useRef } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AvatarRing } from '../components/AvatarRing';
import { StoryGoldRingAvatar } from '../components/StoryGoldRingAvatar';
import { TrendingSnapFeed } from '../components/TrendingSnapFeed';
import { request } from '../lib/apiClient';
import { useVideoStore } from '../store/useVideoStore';

const FALLBACK_SEARCHES = [
  'Dance challenge',
  'Funny cats',
  'Cooking hacks',
  'Travel vlog',
  'Gaming highlights',
  'Fitness tips'
];

export default function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [matchedUsers, setMatchedUsers] = useState<{ id: string; username: string; name: string; avatar: string }[]>([]);
  const [matchedVideos, setMatchedVideos] = useState<{ id: string; description: string; thumbnail: string; url: string; username: string; hashtags: string[] }[]>([]);
  const [searching, setSearching] = useState(false);
  const [visible, setVisible] = useState(false);
  const [suggestedUsers, setSuggestedUsers] = useState<{ id: string; username: string; name: string; avatar: string; is_live?: boolean }[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trendingSearches, setTrendingSearches] = useState<string[]>(FALLBACK_SEARCHES);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const panelRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const { videos, fetchVideos } = useVideoStore();

  const RECENT_KEY = 'elix_recent_searches_v1';

  const FIXED_CATEGORIES = ['All', 'For You', 'Trending', 'Dance', 'Comedy', 'Music', 'Food', 'Sports', 'Fashion', 'Gaming', 'Travel', 'Fitness', 'Beauty', 'Pets', 'Art'];

  const filteredVideos = React.useMemo(() => {
    const all = (videos || []).slice(0, 60);
    if (activeCategory === 'All') return all;
    if (activeCategory === 'For You') {
      const store = useVideoStore.getState();
      const userId = (store as any).currentUserId || '';
      const rec = store.getRecommendedVideos(userId);
      return rec.length > 0 ? rec.slice(0, 30) : all;
    }
    if (activeCategory === 'Trending') {
      const store = useVideoStore.getState();
      const trending = store.getTrendingVideos();
      return trending.length > 0 ? trending.slice(0, 30) : all;
    }
    const cat = activeCategory.toLowerCase();
    const matched = all.filter(v => {
      const desc = (v.description || '').toLowerCase();
      const tags = (v.hashtags || []).map(h => h.replace(/^#/, '').toLowerCase());
      return tags.some(t => t === cat || t.includes(cat)) || desc.includes(cat);
    });
    return matched.length > 0 ? matched : all;
  }, [videos, activeCategory]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const storeState = useVideoStore.getState();
    const hashtags = (storeState as any).trendingHashtags as string[] | undefined;
    if (hashtags && hashtags.length > 0) {
      setTrendingSearches(hashtags.slice(0, 8));
    } else {
      request('/api/videos').then(({ data }) => {
        const allVideos = data?.videos || [];
        const tagCounts = new Map<string, number>();
        for (const v of allVideos) {
          const tags = (v.hashtags || []) as string[];
          for (const t of tags) {
            tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
          }
        }
        const sorted = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 8);
        if (sorted.length > 0) setTrendingSearches(sorted);
      }).catch(() => {});
    }
  }, []);

  const closePanel = () => {
    setVisible(false);
    setTimeout(() => navigate(-1), 250);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - touchStart.current.x;
    const dy = endY - touchStart.current.y;
    const minSwipe = 80;
    if (dy > minSwipe || Math.abs(dx) > minSwipe) closePanel(); // swipe down or to the side to close
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = query.trim();
    const params = new URLSearchParams(location.search);
    if (next) {
      params.set('q', next);
      try {
        const prev = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[];
        const merged = [next, ...prev.filter((s) => s.toLowerCase() !== next.toLowerCase())].slice(0, 10);
        localStorage.setItem(RECENT_KEY, JSON.stringify(merged));
        setRecentSearches(merged);
      } catch { /* ignore */ }
    } else {
      params.delete('q');
    }
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q') ?? '';
    setQuery(q);
  }, [location.search]);

  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    if (!normalizedQuery) {
      setMatchedUsers([]);
      setMatchedVideos([]);
      return;
    }

    let cancelled = false;
    setSearching(true);

    (async () => {
      try {
        // Users: filter the backend /api/profiles list client-side
        const profilesResult = await request('/api/profiles');
        const profilesBody = profilesResult.data ?? { profiles: [] };
        const profiles = Array.isArray(profilesBody?.profiles) ? profilesBody.profiles : [];
        const users = profiles
          .map((p: any) => ({
            id: p.user_id || p.userId,
            username: (p.username || 'user') as string,
            name: (p.display_name || p.displayName || p.username || '') as string,
            avatar: (p.avatar_url || p.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.username || 'U')}&background=121212&color=C9A96E`) as string,
          }))
          .filter((u: any) => !!u.id)
          .filter((u: any) => {
            const hay = `${u.username} ${u.name}`.toLowerCase();
            return hay.includes(normalizedQuery);
          })
          .slice(0, 20);

        // Videos: filter current For You list client-side
        if (videos.length === 0) {
          await fetchVideos();
        }
        const q = normalizedQuery;
        const vids = (useVideoStore.getState().videos || [])
          .filter((v) => {
            const d = (v.description || '').toLowerCase();
            const tags = (v.hashtags || []).join(' ').toLowerCase();
            return d.includes(q) || tags.includes(q);
          })
          .slice(0, 30)
          .map((v) => ({
            id: v.id,
            description: v.description || '',
            thumbnail: v.thumbnail || '',
            url: v.url || '',
            username: v.user?.username || 'user',
            hashtags: v.hashtags || [],
          }));

        if (cancelled) return;
        setMatchedUsers(users);
        setMatchedVideos(vids);
      } catch { /* ignore */ }
      if (!cancelled) setSearching(false);
    })();

    return () => { cancelled = true; };
  }, [normalizedQuery, fetchVideos, videos.length]);

  useEffect(() => {
    // Load recent searches
    try {
      const prev = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[];
      setRecentSearches(Array.isArray(prev) ? prev.slice(0, 10) : []);
    } catch {
      setRecentSearches([]);
    }
  }, []);

  useEffect(() => {
    if (videos.length === 0) fetchVideos();
  }, [fetchVideos, videos.length]);

  useEffect(() => {
    // Suggested users for empty state (always show) + live status
    let cancelled = false;
    (async () => {
      try {
        const [profilesResult, liveResult] = await Promise.all([
          request('/api/profiles'),
          request('/api/live/streams').catch(() => ({ data: null, error: null })),
        ]);
        const body = profilesResult.data ?? { profiles: [] };
        const liveBody = liveResult.data ?? { streams: [] };
        const liveSet = new Set((liveBody?.streams || []).map((s: any) => s.userId || s.user_id).filter(Boolean));
        const profiles = Array.isArray(body?.profiles) ? body.profiles : [];
        const blocklist = new Set(['', 'user', 'demo', 'test', 'unknown', 'anonymous', 'guest']);
        const mapped = profiles
          .map((p: any) => ({
            id: p.user_id || p.userId,
            username: (p.username || 'user') as string,
            name: (p.display_name || p.displayName || p.username || 'User') as string,
            avatar: (p.avatar_url || p.avatarUrl || '') as string,
            is_live: liveSet.has(p.user_id || p.userId),
          }))
          .filter((u: any) => !!u.id)
          .filter((u: any) => {
            const n = (u.name || u.username || '').trim().toLowerCase();
            return n.length >= 2 && !blocklist.has(n);
          })
          .slice(0, 12);
        mapped.sort((a: any, b: any) => (a.is_live === b.is_live ? 0 : a.is_live ? -1 : 1));
        if (!cancelled) setSuggestedUsers(mapped);
      } catch {
        if (!cancelled) setSuggestedUsers([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="fixed inset-0 z-[99999] flex justify-center">
      {/* Backdrop — tap to close */}
      <div
        className="absolute inset-0 transition-opacity duration-250"
        style={{ backgroundColor: visible ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0)' }}
        onClick={closePanel}
      />

      {/* Panel — full screen */}
      <div
        ref={panelRef}
        className="absolute inset-0 flex justify-center transition-transform duration-250 ease-out"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <div
          className="w-full max-w-[480px] bg-[#13151A] flex flex-col overflow-hidden pt-[env(safe-area-inset-top,0px)]"
          style={{ boxShadow: '0 -8px 30px rgba(0,0,0,0.5)', marginTop: 0, height: 'calc(100dvh - var(--feed-main-pb))', maxHeight: 'calc(100dvh - var(--feed-main-pb))' }}
        >
          {/* Top: drag handle + power (back) — swipe down here to close */}
          <div
            className="flex items-center justify-between px-2 pt-0 pb-0"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex-1 flex justify-center">
              <div className="w-8 h-[2px] rounded-full bg-[#C9A96E]/30" />
            </div>
            <button type="button" onClick={closePanel} className="p-1 -mr-1" title="Back">
              <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
            </button>
          </div>

          {/* Search bar — nudged down from handle row */}
          <div className="px-4 pb-0.5 mt-[1mm]">
            <div className="flex items-center gap-2">
              <form onSubmit={handleSearch} className="flex-1 relative">
                <input 
                  type="text" 
                  placeholder="Search" 
                  className="w-full bg-[#1C1E24] text-gold-metallic placeholder-[#C9A96E]/40 rounded-full py-0.5 pl-9 pr-9 text-sm focus:outline-none border border-white/15 focus:border-white/40"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                <SearchIcon size={10} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C9A96E]" />
                {query && (
                  <button 
                    type="button" 
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#C9A96E]/60"
                  >
                    <X size={10} />
                  </button>
                )}
              </form>
              <button className="text-gold-metallic font-semibold text-xs" onClick={closePanel}>Cancel</button>
            </div>
          </div>

          {/* Results */}
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            {!normalizedQuery ? (
              (videos || []).length > 0 ? (
                <>
                  <div className="shrink-0">
                    {/* Quick chips */}
                    <div className="mt-2 px-4">
                      <h2 className="font-bold mb-2 text-gold-metallic text-sm">You may like</h2>
                      <div className="flex flex-wrap gap-2">
                        {trendingSearches.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => {
                              const params = new URLSearchParams(location.search);
                              params.set('q', tag);
                              navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
                            }}
                            className="bg-[#1C1E24] px-3 py-1.5 rounded-full text-xs border border-[#C9A96E]/30 text-gold-metallic hover:border-[#C9A96E] transition-colors"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    {recentSearches.length > 0 && (
                      <div className="mt-4 px-4 pb-2">
                        <div className="flex items-center justify-between mb-2">
                          <h2 className="font-bold text-gold-metallic text-sm">Recent</h2>
                          <button
                            type="button"
                            onClick={() => { try { localStorage.removeItem(RECENT_KEY); } catch {} setRecentSearches([]); }}
                            className="text-[11px] text-white/40 hover:text-white/70"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {recentSearches.map((tag) => (
                            <button
                              key={tag}
                              onClick={() => {
                                const params = new URLSearchParams(location.search);
                                params.set('q', tag);
                                navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
                              }}
                              className="bg-[#13151A] px-3 py-1.5 rounded-full text-xs border border-white/10 text-white/70 hover:border-white/20 transition-colors"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {suggestedUsers.length > 0 && (
                      <div className="mt-2 px-4 pb-2">
                        <h2 className="font-bold mb-1 text-gold-metallic text-sm">Trending users</h2>
                        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                          {suggestedUsers.map((u) => (
                            <button
                              key={u.id}
                              onClick={() => u.is_live ? navigate(`/watch/${u.id}`) : navigate(`/profile/${u.id}`)}
                              className="flex-shrink-0 flex flex-col items-center gap-1" style={{ width: 85, minWidth: 85 }}
                            >
                              <StoryGoldRingAvatar
                                live={u.is_live}
                                src={u.avatar || '/Icons/Profile icon.png'}
                                alt={u.name || u.username}
                              />
                              <div className="text-[10px] text-white/80 truncate w-full text-center">
                                {u.name || u.username}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {FIXED_CATEGORIES.length > 1 && (
                    <div className="px-3 pt-2 pb-1 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
                      {FIXED_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setActiveCategory(cat)}
                          className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap border transition-colors ${activeCategory === cat ? 'bg-[#C9A96E]/20 border-[#C9A96E] text-[#C9A96E]' : 'bg-[#13151A] border-white/15 text-white/60'}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="w-full">
                    <TrendingSnapFeed videos={filteredVideos} />
                  </div>
                </>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto pb-0">
                  <div className="mt-2 px-4">
                    <h2 className="font-bold mb-2 text-gold-metallic text-sm">You may like</h2>
                    <div className="flex flex-wrap gap-2">
                      {trendingSearches.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => {
                            const params = new URLSearchParams(location.search);
                            params.set('q', tag);
                            navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
                          }}
                          className="bg-[#1C1E24] px-3 py-1.5 rounded-full text-xs border border-[#C9A96E]/30 text-gold-metallic hover:border-[#C9A96E] transition-colors"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {recentSearches.length > 0 && (
                    <div className="mt-4 px-4">
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="font-bold text-gold-metallic text-sm">Recent</h2>
                        <button
                          type="button"
                          onClick={() => { try { localStorage.removeItem(RECENT_KEY); } catch {} setRecentSearches([]); }}
                          className="text-[11px] text-white/40 hover:text-white/70"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {recentSearches.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => {
                              const params = new URLSearchParams(location.search);
                              params.set('q', tag);
                              navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
                            }}
                            className="bg-[#13151A] px-3 py-1.5 rounded-full text-xs border border-white/10 text-white/70 hover:border-white/20 transition-colors"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {suggestedUsers.length > 0 && (
                    <div className="mt-4 px-4">
                      <h2 className="font-bold mb-1 text-gold-metallic text-sm">Trending users</h2>
                      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                        {suggestedUsers.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => u.is_live ? navigate(`/watch/${u.id}`) : navigate(`/profile/${u.id}`)}
                            className="flex-shrink-0 flex flex-col items-center gap-1" style={{ width: 85, minWidth: 85 }}
                          >
                            <StoryGoldRingAvatar
                              live={u.is_live}
                              src={u.avatar || '/Icons/Profile icon.png'}
                              alt={u.name || u.username}
                            />
                            <div className="text-[10px] text-white/80 truncate w-full text-center">
                              {u.name || u.username}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-1 w-full">
                    <TrendingSnapFeed videos={filteredVideos} />
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-4 px-4 pb-4">
                {searching && <div className="text-xs text-[#C9A96E]/60 text-center py-3">Searching...</div>}

                {matchedUsers.length > 0 && (
                  <div>
                    <h2 className="font-bold mb-2 text-gold-metallic text-sm">Users</h2>
                    <div className="space-y-1">
                      {matchedUsers.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => navigate(`/profile/${u.id}`)}
                          className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition"
                        >
                          <AvatarRing src={u.avatar} alt={u.username} size={32} />
                          <div className="text-left">
                            <div className="text-xs font-semibold text-gold-metallic">@{u.username}</div>
                            <div className="text-[10px] text-white/50">{u.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h2 className="font-bold mb-2 text-gold-metallic text-sm">Videos</h2>
                  {!searching && matchedVideos.length === 0 ? (
                    <div className="text-xs text-white/40">No videos found.</div>
                  ) : (
                    <div className="space-y-2">
                      {matchedVideos.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => navigate(`/video/${v.id}`)}
                          className="w-full flex gap-3 p-2 rounded-xl hover:bg-white/5 transition"
                        >
                          <video
                            src={v.url}
                            poster={v.thumbnail || undefined}
                            className="w-16 h-22 rounded-lg object-cover bg-[#1C1E24] border border-[#C9A96E]/20"
                            muted
                            playsInline
                            preload="metadata"
                          />
                          <div className="text-left flex-1">
                            <div className="text-xs font-semibold line-clamp-2">{v.description}</div>
                            <div className="text-[10px] text-[#C9A96E] mt-1">@{v.username}</div>
                            <div className="text-[10px] text-white/40 mt-1 line-clamp-1">
                              {v.hashtags.map((h: string) => `#${h}`).join(' ')}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
