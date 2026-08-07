import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import EnhancedVideoPlayer from "../components/EnhancedVideoPlayer";
import { FeedStoryCirclesOverlay } from "../components/FeedStoryCirclesOverlay";
import { useVideoStore } from "../store/useVideoStore";

export default function StemFeed() {
  const navigate = useNavigate();
  const location = useLocation();
  const pageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const { stemVideos, fetchStemVideos, stemLoading } = useVideoStore();

  useEffect(() => {
    fetchStemVideos();
  }, [fetchStemVideos]);

  useEffect(() => {
    if (location.pathname === "/stem") {
      setActiveIndex(0);
      fetchStemVideos();
      setTimeout(() => {
        containerRef.current?.scrollTo({ top: 0, behavior: "auto" });
      }, 0);
    }
  }, [location.pathname, fetchStemVideos]);

  const goSearch = useCallback(() => {
    navigate('/search');
  }, [navigate]);

  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const refreshStem = useCallback(() => {
    fetchStemVideos();
  }, [fetchStemVideos]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const index = Math.round(container.scrollTop / container.clientHeight);
    if (index >= 0 && index < stemVideos.length) {
      setActiveIndex(index);
    }
  }, [stemVideos.length]);

  const handleVideoEnd = useCallback((index: number) => {
    if (!containerRef.current || index >= stemVideos.length - 1) return;
    containerRef.current.scrollTo({
      top: (index + 1) * containerRef.current.clientHeight,
      behavior: "smooth",
    });
  }, [stemVideos.length]);

  const prevCountRef = useRef(stemVideos.length);
  useEffect(() => {
    const prev = prevCountRef.current;
    const cur = stemVideos.length;
    prevCountRef.current = cur;
    if (cur < prev && activeIndex >= cur && cur > 0) {
      setActiveIndex(cur - 1);
      containerRef.current?.scrollTo({
        top: (cur - 1) * (containerRef.current?.clientHeight || 0),
        behavior: "smooth",
      });
    }
  }, [stemVideos.length, activeIndex]);

  return (
    <div ref={pageRef} className="app-live-column bg-transparent relative">
      <FeedStoryCirclesOverlay
        pageRef={pageRef}
        topOffset="var(--topnav-anchor-top)"
        title="STEM"
        onSearch={goSearch}
        onBack={goBack}
      />

      <div
        ref={containerRef}
        className="flex-1 min-h-0 w-full overflow-y-scroll snap-y snap-mandatory relative bg-transparent"
        style={{ scrollSnapType: "y mandatory" }}
        onScroll={handleScroll}
      >
      {stemVideos.map((video, index) => (
        <div
          key={`stem-${video.id}-${index}`}
          className="h-full w-full shrink-0 snap-start flex flex-col items-center bg-transparent"
          style={{
            scrollSnapAlign: "start",
            scrollSnapStop: "always",
            boxSizing: "border-box",
            paddingTop: "0",
            paddingBottom: "3mm",
          }}
        >
          <div className="w-full max-w-[480px] flex-1 min-h-0 relative overflow-hidden bg-transparent">
            <EnhancedVideoPlayer
              videoId={video.id}
              isActive={activeIndex === index}
              onVideoEnd={() => handleVideoEnd(index)}
              edgeToBottomNav
            />
          </div>
        </div>
      ))}

      {stemLoading && stemVideos.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]">
          <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
        </div>
      )}

      {!stemLoading && stemVideos.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-[1]">
          <div className="w-20 h-20 rounded-full bg-transparent border border-white/10 flex items-center justify-center mb-4">
            <span className="text-3xl">🔥</span>
          </div>
          <p className="text-white/60 font-semibold text-base mb-1">
            Most viewed
          </p>
          <p className="text-white/30 text-sm mb-4 text-center px-6">
            Nothing in the global list yet. STEM uses trending views plus caption-tagged clips.
          </p>
          <button
            onClick={refreshStem}
            className="px-5 py-2 bg-white/10 border border-[#D8D9DD]/40 rounded-full text-[#F5F5F7] text-sm font-bold pointer-events-auto active:scale-95 transition-transform"
          >
            Refresh
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
