import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import EnhancedVideoPlayer from '../components/EnhancedVideoPlayer';
import { FeedStoryCirclesOverlay } from '../components/FeedStoryCirclesOverlay';

export default function FriendsFeed() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { friendVideos, fetchFriendVideos, friendsLoading: loading } = useVideoStore();
  const [activeIndex, setActiveIndex] = useState(0);
  const pageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const friendVideoIds = friendVideos.map((v) => v.id);

  useEffect(() => {
    fetchFriendVideos();
  }, [user?.id, fetchFriendVideos]);

  const goSearch = useCallback(() => {
    navigate('/search');
  }, [navigate]);

  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const goUploadStory = useCallback(() => {
    navigate('/upload?type=story');
  }, [navigate]);

  const goDiscover = useCallback(() => {
    navigate('/discover');
  }, [navigate]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollPos = containerRef.current.scrollTop;
    const height = containerRef.current.clientHeight;
    const index = Math.round(scrollPos / height);
    if (index >= 0 && index < friendVideoIds.length) setActiveIndex(index);
  }, [friendVideoIds.length]);

  useEffect(() => {
    if (!containerRef.current || friendVideoIds.length === 0) return;
    const container = containerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const idx = Number((entry.target as HTMLElement).dataset.slideIndex);
          if (!Number.isNaN(idx) && idx >= 0 && idx < friendVideoIds.length) setActiveIndex(idx);
        });
      },
      { root: container, rootMargin: '0px', threshold: 0.51 },
    );
    const slides = container.querySelectorAll('[data-slide-index]');
    slides.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendVideoIds.join(',')]);

  const handleVideoEnd = useCallback(
    (index: number) => {
      if (!containerRef.current || index >= friendVideoIds.length - 1) return;
      containerRef.current.scrollTo({
        top: (index + 1) * containerRef.current.clientHeight,
        behavior: 'smooth',
      });
    },
    [friendVideoIds.length],
  );

  return (
    <div ref={pageRef} className="app-live-column bg-transparent relative">
      <FeedStoryCirclesOverlay
        pageRef={pageRef}
        topOffset="var(--topnav-anchor-top)"
        title="Friends"
        onSearch={goSearch}
        onBack={goBack}
      />

      <div className="w-full max-w-[480px] mx-auto flex-1 min-h-0 flex flex-col overflow-hidden">
        <div
          ref={containerRef}
          className="flex-1 min-h-0 w-full overflow-y-scroll snap-y snap-mandatory relative overscroll-none bg-transparent"
          style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
          onScroll={handleScroll}
        >
          {friendVideoIds.map((videoId, index) => (
            <div
              key={`friends-${videoId}-${index}`}
              data-slide-index={index}
              className="h-full w-full shrink-0 snap-start bg-transparent"
              style={{
                height: '100%',
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
              }}
            >
              <div className="w-full h-full min-h-0 relative overflow-hidden bg-transparent">
                <EnhancedVideoPlayer
                  videoId={videoId}
                  isActive={activeIndex === index}
                  onVideoEnd={() => handleVideoEnd(index)}
                  edgeToBottomNav
                />
              </div>
            </div>
          ))}

          {loading && friendVideoIds.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-8 h-8 border-2 border-[#6F3FF5]/25 border-t-[#6F3FF5] rounded-full animate-spin elix-loader" />
            </div>
          )}

          {!loading && friendVideoIds.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 px-6 text-center">
              <p className="text-base font-semibold mb-1">No friend videos yet</p>
              <p className="text-xs text-white/30 mb-4">Add a photo or video story, or follow people who post</p>
              <button
                type="button"
                onClick={goUploadStory}
                className="px-5 py-2 bg-[#6F3FF5] text-white rounded-full text-sm font-bold mb-3"
              >
                Add story
              </button>
              <button
                type="button"
                onClick={goDiscover}
                className="px-5 py-2 bg-white/10 text-white rounded-full text-sm font-bold"
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
