/**
 * Shared vertical snap video slides (Following / Friends).
 */

import EnhancedVideoPlayer from './EnhancedVideoPlayer';

export function FeedSnapVideoSlides({
  videoIds,
  keyPrefix,
  activeIndex,
  onVideoEnd,
}: {
  videoIds: string[];
  keyPrefix: string;
  activeIndex: number;
  onVideoEnd: (index: number) => void;
}) {
  return (
    <>
      {videoIds.map((videoId, index) => (
        <div
          key={`${keyPrefix}-${videoId}-${index}`}
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
              onVideoEnd={() => onVideoEnd(index)}
              edgeToBottomNav
            />
          </div>
        </div>
      ))}
    </>
  );
}
