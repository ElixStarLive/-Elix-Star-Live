import React, { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import EnhancedVideoPlayer from "../components/EnhancedVideoPlayer";
import { useVideoStore } from "../store/useVideoStore";

export default function StemFeed() {
  const navigate = useNavigate();
  const location = useLocation();
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

  const handleScroll = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const index = Math.round(container.scrollTop / container.clientHeight);
    if (index >= 0 && index < stemVideos.length) {
      setActiveIndex(index);
    }
  };

  const handleVideoEnd = (index: number) => {
    if (!containerRef.current || index >= stemVideos.length - 1) return;
    containerRef.current.scrollTo({
      top: (index + 1) * containerRef.current.clientHeight,
      behavior: "smooth",
    });
  };

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
    <div className="h-full min-h-0 w-full flex flex-col bg-[#13151A]">
      {/* Header — same vertical band as For You golden top bar */}
      <div
        className="fixed left-0 right-0 z-[9999] flex justify-center pointer-events-none"
        style={{ top: "var(--topnav-anchor-top)" }}
      >
        <div
          className="w-full max-w-[480px] px-3 flex items-center justify-between pointer-events-auto"
          style={{ minHeight: "var(--topnav-bar-height)" }}
        >
          <button
            onClick={() => navigate("/search")}
            className="p-1"
            aria-label="Search"
          >
            <Search size={18} className="text-white" />
          </button>
          <h1 className="text-sm font-bold text-white">STEM</h1>
          <button
            onClick={() => navigate(-1)}
            title="Back"
            className="p-1"
          >
            <img
              src="/Icons/Gold power buton.png"
              alt="Back"
              className="w-5 h-5"
            />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 min-h-0 w-full overflow-y-scroll snap-y snap-mandatory relative bg-[#13151A]"
        style={{ scrollSnapType: "y mandatory" }}
        onScroll={handleScroll}
      >
      {stemVideos.map((video, index) => (
        <div
          key={`stem-${video.id}-${index}`}
          className="h-full w-full shrink-0 snap-start flex flex-col items-center bg-[#13151A]"
          style={{
            scrollSnapAlign: "start",
            scrollSnapStop: "always",
            boxSizing: "border-box",
            paddingTop: "0",
            paddingBottom: "3mm",
          }}
        >
          <div className="w-full max-w-[480px] flex-1 min-h-0 relative overflow-hidden bg-[#13151A]">
            <EnhancedVideoPlayer
              videoId={video.id}
              isActive={activeIndex === index}
              onVideoEnd={() => handleVideoEnd(index)}
            />
          </div>
        </div>
      ))}

      {stemLoading && stemVideos.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]">
          <div className="w-8 h-8 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!stemLoading && stemVideos.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-[1]">
          <div className="w-20 h-20 rounded-full bg-[#13151A] border border-white/10 flex items-center justify-center mb-4">
            <span className="text-3xl">🔥</span>
          </div>
          <p className="text-white/60 font-semibold text-base mb-1">
            Most viewed
          </p>
          <p className="text-white/30 text-sm mb-4 text-center px-6">
            Nothing in the global list yet. STEM uses trending views plus caption-tagged clips.
          </p>
          <button
            onClick={() => fetchStemVideos()}
            className="px-5 py-2 bg-[#C9A96E]/20 border border-[#C9A96E]/40 rounded-full text-[#C9A96E] text-sm font-bold pointer-events-auto active:scale-95 transition-transform"
          >
            Refresh
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
