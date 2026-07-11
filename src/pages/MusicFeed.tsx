import React, { useEffect, useState } from 'react';
import { RoyceBackIcon } from '../components/royce';
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
            const filtered = (Array.isArray(data) ? data : []).filter((v: any) => {
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
    <div className="page-above-bottom-nav bg-[#111111] text-white">
      <div className="page-above-bottom-nav__inner bg-[#111111]">
        {/* Header — full width of column (matches Explore / bottom nav) */}
        <div className="w-full shrink-0 bg-[#111111] z-10 border-b border-white/[0.06]">
          <div className="px-3 pt-page-header pb-3 flex items-center justify-between relative">
            <button
              onClick={() => navigate('/search')}
              className="p-1 z-10"
              aria-label="Search"
            >
              <Search className="w-4 h-4 text-[#D4AF37]" />
            </button>
            <h1 className="text-sm font-bold text-gold-metallic absolute left-1/2 transform -translate-x-1/2">
              Sound
            </h1>
            <button
              onClick={() => navigate(-1)}
              className="p-1 z-10"
              title="Back"
            >
              <RoyceBackIcon />
            </button>
          </div>

          {/* Sound card */}
          <div className="px-3 pb-3">
            <div className="p-4 rounded-2xl bg-gradient-to-b from-[#13151A] to-[#13151A] flex gap-4 w-full">
              <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0 royce-tile">
                <Music size={22} className="royce-icon-gold" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold mb-1 truncate">
                  Original Sound{songId ? ` #${songId}` : ''}
                </h1>
                <p className="text-white/60 text-sm mb-4">Trending</p>
                <button
                  onClick={() => navigate('/create')}
                  className="bg-[#D4AF37] text-black px-6 py-1.5 rounded-full font-semibold flex items-center gap-1.5 text-sm w-fit active:scale-95 transition-transform"
                >
                  <Play size={6} fill="black" /> Use this sound
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Grid — full width */}
        <div className="flex-1 min-h-0 overflow-y-auto w-full bg-[#111111]">
          <div className="grid grid-cols-3 gap-0.5 w-full">
            {loading ? (
              <div className="col-span-3 flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : videos.length === 0 ? (
              <div className="col-span-3 flex flex-col items-center justify-center min-h-[50vh] text-center opacity-60">
                <Music size={48} className="mb-4" />
                <p className="text-sm">No videos yet</p>
              </div>
            ) : (
              videos.map((video) => (
                <div
                  key={video.id}
                  className="aspect-[3/4] bg-[#111111] relative cursor-pointer"
                  onClick={() => navigate(`/feed?video=${video.id}`)}
                >
                  <video
                    src={video.url || video.video_url}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    playsInline
                    preload="metadata"
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
