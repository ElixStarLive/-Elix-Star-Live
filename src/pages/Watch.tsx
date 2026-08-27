import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchVideo } from '../features/feed/feedApi';
import { fetchLiveStream } from '../features/live/liveApi';

export default function Watch() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const resolve = async () => {
      const video = await fetchVideo(id);
      if (cancelled) return;
      if (video.data) {
        navigate(`/video/${id}`, { replace: true });
        return;
      }

      const live = await fetchLiveStream(id);
      if (cancelled) return;
      if (live.data) {
        navigate(`/live/${id}`, { replace: true });
        return;
      }

      navigate('/feed', { replace: true });
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-black text-white">
      <p className="text-fluid-sm text-white/60">Opening…</p>
    </div>
  );
}
