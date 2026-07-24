import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { StoryGoldRingAvatar } from './StoryGoldRingAvatar';
import { useAuthStore } from '../store/useAuthStore';
import { fetchActiveStories, type StoryUserGroup } from '../lib/storiesApi';

const RING = 62;

/**
 * For You story rings — own “Add story” + Neon-backed active stories.
 * Overlay only; does not change the video snap layout height.
 */
export function ForYouStoriesStrip() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [groups, setGroups] = useState<StoryUserGroup[]>([]);
  const [viewer, setViewer] = useState<StoryUserGroup | null>(null);
  const [itemIndex, setItemIndex] = useState(0);

  const reload = () => {
    void fetchActiveStories().then((next) => {
      // #region agent log
      fetch('http://127.0.0.1:7293/ingest/e7fb8ad3-ac4d-422a-955a-8c318a5cd9e2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fa77db'},body:JSON.stringify({sessionId:'fa77db',runId:'stories-foryou',hypothesisId:'H1',location:'ForYouStoriesStrip.tsx:reload',message:'For You stories fetch',data:{groupCount:next.length,itemCount:next.reduce((n,g)=>n+(g.items?.length||0),0),hasOwn:!!(user?.id&&next.some(g=>g.userId===user.id))},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setGroups(next);
    });
  };

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7293/ingest/e7fb8ad3-ac4d-422a-955a-8c318a5cd9e2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fa77db'},body:JSON.stringify({sessionId:'fa77db',runId:'stories-foryou',hypothesisId:'H1',location:'ForYouStoriesStrip.tsx:mount',message:'For You stories strip mounted',data:{},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    reload();
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    const t = window.setInterval(reload, 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const own = user?.id ? groups.find((g) => g.userId === user.id) : undefined;
  const others = groups.filter((g) => g.userId !== user?.id && (g.items?.length ?? 0) > 0);

  const openGroup = (g: StoryUserGroup) => {
    if (!g.items?.length) return;
    setViewer(g);
    setItemIndex(0);
  };

  const current = viewer?.items[itemIndex];

  return (
    <>
      <div
        className="absolute left-0 right-0 z-[40] pointer-events-none flex justify-center"
        style={{ top: 'calc(var(--topnav-bar-height) + 2px)' }}
      >
        <div className="w-full max-w-[480px] pointer-events-auto px-2">
          <div
            className="flex gap-3 overflow-x-auto no-scrollbar py-1"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <button
              type="button"
              onClick={() => {
                if (own?.items?.length) openGroup(own);
                else navigate('/upload?type=story');
              }}
              className="flex-shrink-0 flex flex-col items-center gap-0.5"
              style={{ width: 72, minWidth: 72 }}
              title="Add story"
            >
              <div className="relative" style={{ width: RING, height: RING }}>
                <StoryGoldRingAvatar
                  size={RING}
                  glow={!!own?.items?.length}
                  src={user?.avatar || '/royce/default-avatar.svg'}
                  alt={user?.username || 'You'}
                />
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/upload?type=story');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      navigate('/upload?type=story');
                    }
                  }}
                  className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[#D4AF37] border-2 border-black flex items-center justify-center"
                >
                  <Plus size={12} className="text-black" strokeWidth={3} />
                </span>
              </div>
              <span className="text-[10px] text-white/85 truncate w-full text-center font-medium">
                {own?.items?.length ? 'Your story' : 'Add story'}
              </span>
            </button>

            {others.map((g) => (
              <button
                key={g.userId}
                type="button"
                onClick={() => openGroup(g)}
                className="flex-shrink-0 flex flex-col items-center gap-0.5"
                style={{ width: 72, minWidth: 72 }}
                title={g.displayName}
              >
                <StoryGoldRingAvatar
                  size={RING}
                  glow
                  src={g.avatar || '/royce/default-avatar.svg'}
                  alt={g.displayName}
                />
                <span className="text-[10px] text-white/85 truncate w-full text-center">
                  {g.displayName || g.username}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewer && current ? (
        <div
          className="fixed inset-0 z-[10060] bg-black flex items-center justify-center"
          onClick={() => {
            if (itemIndex + 1 < viewer.items.length) setItemIndex((i) => i + 1);
            else setViewer(null);
          }}
        >
          <button
            type="button"
            className="absolute top-[calc(env(safe-area-inset-top,0px)+12px)] left-3 z-10 text-white text-sm font-bold px-2 py-1"
            onClick={(e) => {
              e.stopPropagation();
              setViewer(null);
            }}
          >
            Close
          </button>
          <div className="absolute top-[calc(env(safe-area-inset-top,0px)+48px)] left-3 right-3 flex items-center gap-2 z-10">
            <StoryGoldRingAvatar
              size={36}
              src={viewer.avatar || '/royce/default-avatar.svg'}
              alt={viewer.displayName}
            />
            <span className="text-white text-sm font-semibold truncate">{viewer.displayName}</span>
          </div>
          {String(current.mediaType || '').toLowerCase() === 'image' ? (
            <img
              src={current.mediaUrl}
              alt=""
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />
          ) : (
            <video
              key={current.id}
              src={current.mediaUrl}
              className="max-w-full max-h-full object-contain"
              autoPlay
              playsInline
              controls={false}
              onEnded={() => {
                if (itemIndex + 1 < viewer.items.length) setItemIndex((i) => i + 1);
                else setViewer(null);
              }}
            />
          )}
        </div>
      ) : null}
    </>
  );
}
