import React, { useCallback, useEffect, useState } from 'react';
import { RoyceBackIcon, RoyceCloseIcon } from '../components/royce';

import { useNavigate, useParams, useLocation } from 'react-router-dom';
import EnhancedVideoPlayer from '../components/EnhancedVideoPlayer';
import { VideoViewChromeShell } from '../components/VideoViewChromeShell';
import { useVideoStore } from '../store/useVideoStore';
import { returnToFromLocationState, VIDEO_EXIT_TO } from '../lib/settingsNav';

export default function VideoView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { videoId } = useParams<{ videoId: string }>();
  const fetchVideoById = useVideoStore((s) => s.fetchVideoById);
  const video = useVideoStore((s) => (videoId ? s.getVideoById(videoId) : undefined));
  const [loadPhase, setLoadPhase] = useState<'idle' | 'loading' | 'done'>('idle');

  const goBack = useCallback(() => {
    const returnTo = returnToFromLocationState(location.state);
    navigate(returnTo || VIDEO_EXIT_TO, { replace: true });
  }, [navigate, location.state]);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    if (useVideoStore.getState().getVideoById(videoId)) {
      setLoadPhase('done');
      return;
    }
    setLoadPhase('loading');
    void fetchVideoById(videoId).finally(() => {
      if (cancelled) return;
      setLoadPhase('done');
    });
    return () => {
      cancelled = true;
    };
  }, [videoId, fetchVideoById]);

  if (!videoId) {
    return (
      <div className="min-h-[100dvh] bg-transparent text-white p-4">
        <button onClick={goBack} className="flex items-center gap-2 text-white/80">
          <RoyceBackIcon />
          Back
        </button>
        <div className="mt-6 text-white/70">Video not found.</div>
      </div>
    );
  }

  const showMissing = loadPhase === 'done' && !video;

  if (loadPhase === 'loading' || (loadPhase === 'idle' && !video)) {
    return (
      <VideoViewChromeShell onBack={goBack}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-white/50 text-sm">Loading…</span>
        </div>
      </VideoViewChromeShell>
    );
  }

  if (showMissing || !video) {
    return (
      <VideoViewChromeShell onBack={goBack}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
          <span className="text-white/70 text-sm text-center">Video not found or unavailable.</span>
          <button
            type="button"
            onClick={goBack}
            className="text-[#F5F5F7] text-sm font-semibold"
          >
            Go back
          </button>
        </div>
      </VideoViewChromeShell>
    );
  }

  return (
    <div className="page-above-bottom-nav z-[9990] bg-transparent">
      <div className="page-above-bottom-nav__inner relative bg-transparent">
        <div
          className="absolute z-[250] pointer-events-auto"
          style={{
            top: 'max(0.75rem, var(--safe-top))',
            right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          }}
        >
          <button
            onClick={goBack}
            className="p-2 rounded-full bg-transparent border border-transparent text-white"
            aria-label="Back"
          >
            <RoyceCloseIcon />
          </button>
        </div>
        <EnhancedVideoPlayer videoId={videoId} isActive={true} edgeToBottomNav />
      </div>
    </div>
  );
}
