import React, { useEffect, useState } from 'react';
import { Music, Play, Search } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/apiClient';

interface MusicVideo {
  id: string;
  url: string;
  video_url?: string;
  thumbnail_url?: string;
}

export default function MusicFeed() {
  const navigate = useNavigate();
  const { songId } = useParams();
  const [videos, setVideos] = useState<MusicVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true);
      try {
        const { data, error } = await api.videos.list();

        if (!error && data) {
          if (songId) {
            const filtered = (data as any[]).filter((v: any) => {
              const music = v.music;
              if (music?.id === songId) return true;
              const desc = (v.description || '').toLowerCase();
              const title = (music?.title || '').toLowerCase();
              return desc.includes(songId.toLowerCase()) || title.includes(songId.toLowerCase());
            });
            setVideos(filtered);
          } else {
            setVideos(data);
          }
        }
      } catch {
        // Failed to load
      } finally {
        setLoading(false);
      }
    };
    fetchVideos();
  }, [songId]);

  return (
    <div className="fixed inset-0 bg-[#13151A] text-white flex justify-center">
      <div
        className="w-full max-w-[480px] flex flex-col overflow-hidden h-above-bottom-nav"
        style={{ marginTop: 0 }}
      >
        {/* Header Info - match Explore layout */}
        <div className="mx-2 mt-2 rounded-t-2xl bg-[#13151A] z-10 shrink-0">
          <div className="px-3 pt-[calc(env(safe-area-inset-top,8px)+4px)] pb-3 flex items-center justify-between relative">
            <button
              onClick={() => navigate('/search')}
              className="p-1 z-10"
              aria-label="Search"
            >
              <Search className="w-4 h-4 text-[#C9A96E]" />
            </button>
            <h1 className="text-sm font-bold text-gold-metallic absolute left-1/2 transform -translate-x-1/2">
              Sound
            </h1>
            <button
              onClick={() => navigate(-1)}
              className="p-1 z-10"
              title="Back"
            >
              <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
            </button>
          </div>

          {/* Sound card */}
          <div className="px-3 pb-3">
            <div className="p-4 rounded-2xl bg-gradient-to-b from-[#13151A] to-[#13151A] flex gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0 relative">
                <img
                  src="/Icons/Music Icon.png"
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                />
                <Music size={20} className="text-white/90 relative z-[1]" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold mb-1">
                  Original Sound{songId ? ` #${songId}` : ''}
                </h1>
                <p className="text-white/60 text-sm mb-4">Trending</p>
                <button
                  onClick={() => navigate('/create')}
                  className="bg-[#C9A96E] text-black px-6 py-1.5 rounded-sm font-semibold flex items-center gap-1.5 text-sm w-fit active:scale-95 transition-transform"
                >
                  <Play size={6} fill="black" /> Use this sound
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto mx-2 rounded-b-2xl bg-[#13151A] pb-24">
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {loading ? (
              <div className="col-span-3 flex items-center justify-center h-[40vh]">
                <div className="w-8 h-8 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : videos.length === 0 ? (
              <div className="col-span-3 flex flex-col items-center justify-center h-[40vh] text-center opacity-60">
                <Music size={48} className="mb-4" />
                <p className="text-sm">No videos yet</p>
              </div>
            ) : (
              videos.map((video) => (
                <div
                  key={video.id}
                  className="aspect-[3/4] bg-[#13151A] relative cursor-pointer"
                  onClick={() => navigate(`/feed?video=${video.id}`)}
                >
                  <video
                    src={video.url || video.video_url}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    playsInline
                    preload="auto"
                    onMouseOver={(e) => e.currentTarget.play()}
                    onMouseOut={(e) => {
                      e.currentTarget.pause();
                      e.currentTarget.currentTime = 0;
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
