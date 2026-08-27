import { useEffect, useState } from 'react';
import { Music as MusicIcon } from 'lucide-react';
import { fetchSounds, type Sound } from '../features/music/musicApi';

export default function Music() {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSounds().then(({ data }) => {
      if (cancelled) return;
      if (data) setSounds(data.sounds);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <h1 className="mb-4 text-fluid-xl font-bold">Music</h1>
      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : sounds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MusicIcon className="mb-4 h-12 w-12 text-white/30" />
          <p className="text-fluid-sm text-white/60">No sounds yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sounds.map((sound) => (
            <div
              key={sound.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
            >
              {sound.thumbnail ? (
                <img src={sound.thumbnail} alt="" className="h-14 w-14 rounded-lg object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white/10">
                  <MusicIcon className="h-7 w-7 text-white/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white">{sound.title}</p>
                <p className="text-fluid-sm text-white/60">{sound.artist}</p>
              </div>
              <p className="text-fluid-xs text-white/50">{sound.useCount} uses</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
