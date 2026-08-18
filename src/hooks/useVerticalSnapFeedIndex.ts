/**
 * Shared vertical snap-feed active index + scroll/observer wiring
 * (Following / Friends / Stem-style pages). No visual output.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function useVerticalSnapFeedIndex(videoIds: string[]) {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoCount = videoIds.length;
  const videoIdsKey = videoIds.join(',');

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollPos = containerRef.current.scrollTop;
    const height = containerRef.current.clientHeight;
    const index = Math.round(scrollPos / height);
    if (index >= 0 && index < videoCount) setActiveIndex(index);
  }, [videoCount]);

  useEffect(() => {
    if (!containerRef.current || videoCount === 0) return;
    const container = containerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const idx = Number((entry.target as HTMLElement).dataset.slideIndex);
          if (!Number.isNaN(idx) && idx >= 0 && idx < videoCount) setActiveIndex(idx);
        });
      },
      { root: container, rootMargin: '0px', threshold: 0.51 },
    );
    const slides = container.querySelectorAll('[data-slide-index]');
    slides.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [videoIdsKey, videoCount]);

  const handleVideoEnd = useCallback(
    (index: number) => {
      if (!containerRef.current || index >= videoCount - 1) return;
      containerRef.current.scrollTo({
        top: (index + 1) * containerRef.current.clientHeight,
        behavior: 'smooth',
      });
    },
    [videoCount],
  );

  return { activeIndex, setActiveIndex, containerRef, handleScroll, handleVideoEnd };
}
