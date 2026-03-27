import React, { useState, useEffect } from 'react';
import { Bookmark, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, request } from '../lib/apiClient';

interface SavedVideo {
  id: string;
  url: string;
  thumbnail_url: string;
  views: number;
  description: string;
}

export default function SavedVideos() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await api.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data: saved } = await request(`/api/saved-videos?user_id=${encodeURIComponent(user.id)}`);

        if (!saved || saved.length === 0) { setVideos([]); setLoading(false); return; }

        const videoIds = saved.map((s: any) => s.video_id);
        const { data: vids } = await request(`/api/videos?ids=${videoIds.join(',')}`);

        setVideos(vids || []);
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, []);

  const formatViews = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  };

  return (
    <div className="bg-[#13151A] text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] rounded-3xl overflow-hidden overflow-y-auto bg-[#13151A] flex flex-col min-h-screen">
        <div className="p-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-gold-metallic">Saved Videos</h1>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-3 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : videos.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
            <Bookmark size={48} className="text-white/20" />
            <p className="text-white/40 text-sm text-center">No saved videos yet. Tap the bookmark icon on any video to save it.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 p-0.5 flex-1 overflow-y-auto">
            {videos.map((video) => (
              <div
                key={video.id}
                className="aspect-[3/4] bg-[#1C1E24] relative cursor-pointer group"
                onClick={() => navigate(`/video/${video.id}`)}
              >
                {video.thumbnail_url ? (
                  <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <video
                    src={video.url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                    onMouseOver={e => e.currentTarget.play()}
                    onMouseOut={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                  />
                )}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play size={24} fill="white" className="text-white" />
                </div>
                <div className="absolute bottom-1 left-1 flex items-center gap-1 text-white text-xs drop-shadow-md">
                  <Play size={10} fill="white" />
                  <span>{formatViews(video.views || 0)}</span>
                </div>
                <div className="absolute top-1 right-1">
                  <Bookmark size={12} fill="#C9A96E" className="text-[#C9A96E]" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
