import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Music as MusicIcon, User } from 'lucide-react';
import { fetchSound, type Sound } from '../features/music/musicApi';
import { VideoList } from '../components/VideoList';
import type { FeedVideo } from '../features/feed/feedApi';

export default function SongDetail() {
  const { songId } = useParams<{ songId: string }>();
  const navigate = useNavigate();
  const [sound, setSound] = useState<Sound | null>(null);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!songId) return;
    let cancelled = false;
    fetchSound(songId).then(({ data }) => {
      if (cancelled) return;
      if (data) {
        setSound(data.sound);
        setVideos(data.videos);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [songId]);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center gap-3">
        <button type="button" onClick={() => navigate('/music')} className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-fluid-xl font-bold">Song</h1>
      </header>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : !sound ? (
        <p className="text-white/60">Sound not found.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            {sound.thumbnail ? (
              <img src={sound.thumbnail} alt="" className="h-20 w-20 rounded-xl object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-white/10">
                <MusicIcon className="h-10 w-10 text-white/40" />
              </div>
            )}
            <div>
              <p className="text-fluid-lg font-bold">{sound.title}</p>
              <p className="text-fluid-sm text-white/60">{sound.artist}</p>
              <p className="text-fluid-xs text-white/50">{sound.useCount} uses</p>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-fluid-base font-bold">Videos using this sound</h2>
            {videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <User className="mb-2 h-10 w-10 text-white/30" />
                <p className="text-fluid-sm text-white/60">No videos using this sound yet.</p>
              </div>
            ) : (
              <VideoList videos={videos} emptyTitle="" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
