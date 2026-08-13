import { useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import { FeedStoryCirclesOverlay } from '../components/FeedStoryCirclesOverlay';
import { FeedSnapVideoSlides } from '../components/FeedSnapVideoSlides';
import { useVerticalSnapFeedIndex } from '../hooks/useVerticalSnapFeedIndex';
import { useFeedChromeNav } from '../hooks/useFeedChromeNav';

export default function FriendsFeed() {
  const { user } = useAuthStore();
  const { friendVideos, fetchFriendVideos, friendsLoading: loading } = useVideoStore();
  const pageRef = useRef<HTMLDivElement>(null);
  const friendVideoIds = friendVideos.map((v) => v.id);
  const { activeIndex, containerRef, handleScroll, handleVideoEnd } =
    useVerticalSnapFeedIndex(friendVideoIds);
  const { navigate, goSearch, goBack, goDiscover } = useFeedChromeNav();

  useEffect(() => {
    fetchFriendVideos();
  }, [user?.id, fetchFriendVideos]);

  const goUploadStory = useCallback(() => {
    navigate('/upload?type=story');
  }, [navigate]);

  return (
    <div ref={pageRef} className="app-live-column bg-transparent relative">
      <FeedStoryCirclesOverlay
        pageRef={pageRef}
        initiallyVisible
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
          <FeedSnapVideoSlides
            videoIds={friendVideoIds}
            keyPrefix="friends"
            activeIndex={activeIndex}
            onVideoEnd={handleVideoEnd}
          />

          {loading && friendVideoIds.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
            </div>
          )}

          {!loading && friendVideoIds.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 px-6 text-center">
              <p className="text-base font-semibold mb-1">No friend videos yet</p>
              <p className="text-xs text-white/30 mb-4">Add a photo or video story, or follow people who post</p>
              <button
                type="button"
                onClick={goUploadStory}
                className="px-5 py-2 bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] rounded-full text-sm font-bold mb-3"
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
