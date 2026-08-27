import { Film, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function VideoFeed() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center p-4 text-center text-white">
      <Film className="mb-4 h-16 w-16 text-white/40" />
      <h1 className="text-fluid-xl font-bold">For You</h1>
      <p className="mt-2 max-w-xs text-fluid-sm text-white/60">
        The first videos will appear here once creators start sharing.
      </p>
      <Link
        to="/create"
        className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/40 px-6 py-3 text-fluid-sm font-bold"
      >
        <Plus className="h-4 w-4" />
        Upload a video
      </Link>
    </div>
  );
}
