import React, { useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SoundLibraryView from '../components/SoundLibraryView';
import { useSoundLibraryPlayerStore } from '../store/useSoundLibraryPlayerStore';
import { FEED_HOME } from '../lib/settingsNav';

/**
 * /music — same Sound panel as Create/Upload Add sound (SoundLibraryView).
 */
export default function MusicFeed() {
  const navigate = useNavigate();
  const { songId } = useParams();
  const stopLibraryPlayer = useSoundLibraryPlayerStore((s) => s.stop);

  useEffect(() => {
    return () => {
      useSoundLibraryPlayerStore.getState().stop();
    };
  }, []);

  const goBack = useCallback(() => {
    stopLibraryPlayer();
    navigate(FEED_HOME, { replace: true });
  }, [navigate, stopLibraryPlayer]);

  const goSearch = useCallback(() => {
    navigate('/search');
  }, [navigate]);

  const openTrack = useCallback(
    (trackId: string) => {
      navigate(`/music/${encodeURIComponent(trackId)}`);
    },
    [navigate],
  );

  return (
    <div
      className="page-above-bottom-nav bg-transparent text-white"
      style={{ bottom: 'var(--bottom-nav-top)' }}
    >
      <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0">
        <SoundLibraryView
          mode="browse"
          featuredTrackId={songId || null}
          onBack={goBack}
          onHeaderSearch={goSearch}
          onOpenTrack={openTrack}
        />
      </div>
    </div>
  );
}
