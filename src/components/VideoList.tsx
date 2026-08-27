import { Film } from 'lucide-react';
import type { FeedVideo } from '../features/feed/feedApi';

export function VideoList({ videos, emptyTitle }: { videos: FeedVideo[]; emptyTitle: string }) {
  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-white/60">
        <Film className="mb-4 h-12 w-12 text-white/30" />
        <p className="text-fluid-sm">{emptyTitle}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {videos.map((video) => (
        <div key={video.id} className="relative aspect-[9/16] overflow-hidden rounded-xl border border-white/10 bg-white/5">
          {video.thumbnail ? (
            <img src={video.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Film className="h-8 w-8 text-white/30" />
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
            <p className="text-fluid-xs text-white">{video.user.displayName}</p>
            <p className="text-[10px] text-white/60">{video.stats.views} views</p>
          </div>
        </div>
      ))}
    </div>
  );
}
