import React, { useEffect, useRef, useState } from 'react';
import {
  CameraOff,
  ChevronLeft,
  ChevronDown,
  Music,
  X,
  Settings,
  Share2,
  LayoutGrid,
  Image as ImageIcon,
  Video,
  Type,
  Smile,
  Sparkles,
  Blend,
  Plus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { setCachedCameraStream } from '../lib/cameraStream';
import { type SoundTrack } from '../lib/soundLibrary';
import SoundPickerPanel from '../components/SoundPickerPanel';
import ElixCameraLayout from '../components/ElixCameraLayout';
import { useAuthStore } from '../store/useAuthStore';

type CreateMode = 'upload' | 'post' | 'create' | 'live';

type Sound = SoundTrack;

export default function Create() {
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const [mode, setMode] = useState<CreateMode>('create');
  const [isSoundOpen, setIsSoundOpen] = useState(false);
  const [selectedSound, setSelectedSound] = useState<Sound | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<'video' | 'image'>('video');
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [recordingDelaySeconds, setRecordingDelaySeconds] = useState<0 | 3 | 10>(0);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLandscapeStream, setIsLandscapeStream] = useState(false);
  const [hwZoomRange, setHwZoomRange] = useState<{ min: number; max: number } | null>(null);
  const [retryCamera, setRetryCamera] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const keepStreamOnUnmountRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const countdownTimeoutRef = useRef<number | null>(null);

  // Camera setup — Create opens straight to camera (no templates hub)
  useEffect(() => {

    const stopStream = () => {
      if (keepStreamOnUnmountRef.current) return;
      const current = streamRef.current;
      if (!current) return;
      current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    if (previewUrl) { stopStream(); return; }

    let cancelled = false;
    const start = async () => {
      try {
        setCameraError(null);
        const hostname = window.location.hostname;
        const isSecureContext = window.isSecureContext
          || window.location.protocol === 'https:'
          || hostname === 'localhost'
          || hostname === '127.0.0.1'
          || hostname === '[::1]';
        if (!isSecureContext) { setCameraError('Camera requires HTTPS. Access via https:// or localhost.'); return; }
        if (!navigator.mediaDevices?.getUserMedia) { setCameraError('Camera not supported on this browser.'); return; }

        try {
          const permStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (permStatus.state === 'denied') { setCameraError('Camera blocked. Allow camera in browser settings.'); return; }
        } catch { /* proceed */ }

        stopStream();
        let nextStream: MediaStream;
        try {
          nextStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: isFrontCamera ? 'user' : 'environment' }, audio: false });
        } catch (e1: unknown) {
          try {
            nextStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } catch (e2: unknown) {
            throw e2;
          }
        }
        if (cancelled) { nextStream.getTracks().forEach((t) => t.stop()); return; }

        const videoTracks = nextStream.getVideoTracks();
        if (videoTracks.length === 0) { setCameraError('Camera returned no video. Try a different browser.'); return; }

        streamRef.current = nextStream;
        const track = videoTracks[0];
        const settings = track.getSettings();
        setIsLandscapeStream((settings.width || 0) > (settings.height || 0));
        try {
          const caps = track.getCapabilities?.() as any;
          if (caps?.zoom) { setHwZoomRange({ min: caps.zoom.min, max: caps.zoom.max }); await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as any] }); }
          else { setHwZoomRange(null); }
        } catch { setHwZoomRange(null); }

        if (videoRef.current) videoRef.current.srcObject = nextStream;
        setZoomLevel(1);
      } catch (e: unknown) {
        if (cancelled) return;
        const err = e as { name?: string; message?: string };
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') { setCameraError('Camera permission denied. Allow camera access in your browser settings and tap Try Again.'); return; }
        if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') { setCameraError('No camera found on this device.'); return; }
        if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') { setCameraError('Camera is in use by another app. Close other apps and tap Try Again.'); return; }
        setCameraError(`Camera unavailable: ${err?.message || 'Unknown error'}`);
      }
    };
    start();
    return () => { cancelled = true; stopStream(); };
  }, [isFrontCamera, previewUrl, retryCamera]);

  useEffect(() => {
    return () => {
      if (countdownTimeoutRef.current !== null) clearTimeout(countdownTimeoutRef.current);
    };
  }, []);

  const openUploadPicker = () => fileInputRef.current?.click();
  const flipCamera = () => { setIsFrontCamera((v) => !v); setZoomLevel(1); };
  const showToastMsg = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 1800); };
  const cycleTimer = () => setRecordingDelaySeconds((v) => (v === 0 ? 3 : v === 3 ? 10 : 0));

  const handleFlashToggle = async () => {
    const stream = streamRef.current;
    if (!stream) { showToastMsg('Camera not ready'); return; }
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      const capabilities = track.getCapabilities?.() as any;
      if (capabilities?.torch) {
        const newTorch = !flashEnabled;
        await track.applyConstraints({ advanced: [{ torch: newTorch } as any] });
        setFlashEnabled(newTorch);
        showToastMsg(newTorch ? 'Flash ON' : 'Flash OFF');
      } else { showToastMsg('Flash not available'); }
    } catch { showToastMsg('Flash not supported'); }
  };

  const applyZoom = async (newZoom: number) => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      const caps = track.getCapabilities?.() as any;
      if (caps?.zoom) {
        const clamped = Math.max(caps.zoom.min, Math.min(newZoom, caps.zoom.max));
        await track.applyConstraints({ advanced: [{ zoom: clamped } as any] });
        setZoomLevel(clamped);
        return;
      }
    } catch { /* fallback */ }
    setZoomLevel(Math.max(1, Math.min(newZoom, 5)));
  };

  const handleZoomIn = async () => await applyZoom(zoomLevel + 0.5);
  const handleZoomOut = async () => await applyZoom(Math.max(zoomLevel - 0.5, hwZoomRange?.min ?? 1));
  const handleZoomReset = async () => { await applyZoom(hwZoomRange?.min ?? 1); showToastMsg('Zoom reset'); };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartZoomRef.current = zoomLevel;
    }
  };
  const handleTouchMove = async (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / pinchStartDistRef.current;
      const maxZoom = hwZoomRange?.max ?? 5;
      const minZoom = hwZoomRange?.min ?? 1;
      const newZoom = Math.max(minZoom, Math.min(pinchStartZoomRef.current * scale, maxZoom));
      await applyZoom(parseFloat(newZoom.toFixed(1)));
    }
  };
  const handleTouchEnd = () => { pinchStartDistRef.current = null; };
  const handleSpeedChange = (speed: number) => { setPlaybackSpeed(speed); showToastMsg(`Speed ${speed}x`); };

  const startRecordingNow = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const preferredTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const chosenType = preferredTypes.find((t) => { try { return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t); } catch { return false; } });
    recordedChunksRef.current = [];
    try {
      const recorder = new MediaRecorder(stream, chosenType ? { mimeType: chosenType } : undefined);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: chosenType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
        setPreviewKind('video');
        setIsPreviewPlaying(true);
        setMode('create');
      };
      recorder.start(250);
      setIsRecording(true);
    } catch { setCameraError('Recording not supported.'); }
  };

  const startRecording = () => {
    if (recordingDelaySeconds === 0) { startRecordingNow(); return; }
    setCountdownSeconds(recordingDelaySeconds);
    const startedAt = Date.now();
    const total = recordingDelaySeconds;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = total - elapsed;
      if (left <= 0) { setCountdownSeconds(null); countdownTimeoutRef.current = null; startRecordingNow(); return; }
      setCountdownSeconds(left);
      countdownTimeoutRef.current = window.setTimeout(tick, 200);
    };
    countdownTimeoutRef.current = window.setTimeout(tick, 200);
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    setIsRecording(false);
  };

  const discardPreview = () => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewKind('video');
    setIsPreviewPlaying(false);
  };

  const goYourStory = () => {
    if (!previewUrl) return;
    navigate('/upload?type=story');
  };

  const goNextVideoPost = () => {
    if (!previewUrl) return;
    navigate('/upload');
  };

  const storyInitials = (() => {
    const name = (authUser?.name || authUser?.username || '').trim();
    if (!name) return 'EL';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  })();

  const startLive = async () => {
    try {
      const current = streamRef.current;
      const hasAudio = (current?.getAudioTracks().length || 0) > 0;
      if (!current || !hasAudio) {
        let nextStream: MediaStream | null = null;
        try { nextStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: isFrontCamera ? 'user' : 'environment' }, audio: true }); }
        catch { try { nextStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: isFrontCamera ? 'user' : 'environment' }, audio: false }); showToastMsg('Going live without sound.'); } catch { setCameraError('Camera access denied'); return; } }
        if (current) current.getTracks().forEach((t) => t.stop());
        streamRef.current = nextStream;
        if (videoRef.current) videoRef.current.srcObject = nextStream;
        setCachedCameraStream(nextStream);
      } else { setCachedCameraStream(current); }
      keepStreamOnUnmountRef.current = true;
      navigate('/live/broadcast');
    } catch { setCameraError('Camera access denied'); }
  };

  // ═══ CAMERA / POST-CAPTURE COMPOSE ═══
  return (
    <div className="min-h-[100dvh] bg-[#111111] text-white flex justify-center">
      <div className="relative w-full min-h-[100dvh] overflow-hidden">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,image/*"
          className="hidden"
          aria-label="Select media file"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const nextUrl = URL.createObjectURL(file);
            setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return nextUrl; });
            setPreviewKind(file.type.startsWith('image/') ? 'image' : 'video');
            setIsPreviewPlaying(true);
            setMode('create');
            e.target.value = '';
          }}
        />

        <div className="absolute inset-0 z-[5]">
          {previewUrl ? (
            previewKind === 'image' ? (
              <img src={previewUrl} alt="" className="w-full h-full object-cover" draggable={false} />
            ) : (
              <video ref={previewVideoRef} src={previewUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline onPlay={() => setIsPreviewPlaying(true)} onPause={() => setIsPreviewPlaying(false)} />
            )
          ) : (
            <div className="w-full h-full bg-[#111111] relative flex items-center justify-center" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
              <video
                ref={videoRef}
                className={`w-full h-full object-cover ${cameraError ? 'hidden' : ''}`}
                autoPlay muted playsInline
                style={{
                  transform: isFrontCamera
                    ? (zoomLevel > 1 && !hwZoomRange ? `scaleX(-1) scale(${zoomLevel})` : 'scaleX(-1)')
                    : (zoomLevel > 1 && !hwZoomRange ? `scale(${zoomLevel})` : undefined),
                  transformOrigin: 'center center',
                  transition: 'transform 0.2s ease-out',
                }}
              />
              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#111111] z-[100]">
                  <div className="text-center p-5 max-w-[280px]">
                    <CameraOff className="w-12 h-12 text-white/70 mx-auto mb-4" strokeWidth={1.5} />
                    <p className="text-white text-sm font-semibold mb-2">Camera Access Needed</p>
                    <p className="text-white/60 text-xs mb-5 leading-relaxed">{cameraError}</p>
                    <button onClick={() => { setCameraError(null); setRetryCamera((c) => c + 1); }} className="px-6 py-2.5 rounded-full bg-[#D4AF37] text-black text-sm font-semibold active:scale-95 transition-transform">
                      Try Again
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {countdownSeconds !== null && (
          <div className="absolute inset-0 z-[80] flex items-center justify-center bg-[#111111]">
            <div className="w-24 h-24 rounded-full bg-[#111111] border border-[#C9A227]/35 flex items-center justify-center">
              <div className="text-4xl font-black text-white">{countdownSeconds}</div>
            </div>
          </div>
        )}

        {toast && (
          <div className="absolute left-0 right-0 top-20 z-[90] flex justify-center px-4">
            <div className="px-4 py-2 rounded-full bg-[#111111] border border-transparent text-sm text-white/80">{toast}</div>
          </div>
        )}

        {/* After capture: Instant story / Next video UI (matches compose reference) */}
        {previewUrl ? (
          <>
            <div
              className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 pointer-events-auto"
              style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
            >
              <button
                type="button"
                onClick={discardPreview}
                className="w-9 h-9 flex items-center justify-center"
                title="Back"
              >
                <ChevronLeft size={28} className="text-white drop-shadow-md" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={() => setIsSoundOpen(true)}
                className="flex items-center gap-1.5 max-w-[58%] px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md"
                title={selectedSound?.title || 'Add sound'}
              >
                <Music size={14} className="text-white shrink-0" />
                <span className="text-white text-xs font-semibold truncate">
                  {selectedSound?.title || 'Add sound'}
                </span>
                {selectedSound ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSound(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        setSelectedSound(null);
                      }
                    }}
                    className="ml-0.5"
                  >
                    <X size={14} className="text-white/80" />
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setIsSoundOpen(true)}
                className="w-9 h-9 flex items-center justify-center"
                title="Settings"
              >
                <Settings size={22} className="text-white drop-shadow-md" strokeWidth={2} />
              </button>
            </div>

            <div
              className="absolute right-2 z-30 flex flex-col items-center gap-3.5 pointer-events-auto"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}
            >
              {[
                { Icon: Share2, title: 'Share', onClick: () => showToastMsg('Share tools coming soon') },
                { Icon: LayoutGrid, title: 'Layout', onClick: openUploadPicker },
                { Icon: ImageIcon, title: 'Media', onClick: openUploadPicker },
                { Icon: Video, title: 'Video', onClick: openUploadPicker },
                { Icon: Type, title: 'Text', onClick: () => showToastMsg('Text tools coming soon') },
                { Icon: Smile, title: 'Stickers', onClick: () => showToastMsg('Stickers coming soon') },
                { Icon: Sparkles, title: 'Effects', onClick: () => showToastMsg('Effects coming soon') },
                { Icon: Blend, title: 'Filters', onClick: () => showToastMsg('Filters coming soon') },
              ].map(({ Icon, title, onClick }) => (
                <button
                  key={title}
                  type="button"
                  onClick={onClick}
                  className="w-10 h-10 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center"
                  title={title}
                >
                  <Icon size={20} className="text-white drop-shadow-md" strokeWidth={2} />
                </button>
              ))}
              <button
                type="button"
                onClick={openUploadPicker}
                className="w-10 h-10 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center"
                title="More"
              >
                <ChevronDown size={20} className="text-white drop-shadow-md" strokeWidth={2} />
              </button>
            </div>

            <div
              className="absolute left-0 right-0 z-30 flex flex-col items-center gap-3 px-4 pointer-events-auto"
              style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
            >
              <ChevronDown size={16} className="text-white/70" />
              <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-black/45 backdrop-blur-md">
                <button type="button" onClick={openUploadPicker} className="w-9 h-9 flex items-center justify-center" title="Gallery">
                  <LayoutGrid size={20} className="text-white" strokeWidth={2} />
                </button>
                <div className="w-12 h-12 rounded-xl overflow-hidden border-[3px] border-white flex-shrink-0 bg-black">
                  {previewKind === 'image' ? (
                    <img src={previewUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                  ) : (
                    <video src={previewUrl} className="w-full h-full object-cover" muted playsInline />
                  )}
                </div>
                <button type="button" onClick={openUploadPicker} className="w-9 h-9 flex items-center justify-center" title="Add">
                  <Plus size={22} className="text-white" strokeWidth={2.5} />
                </button>
              </div>

              <div className="w-full max-w-md flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={goYourStory}
                  className="flex-1 h-12 rounded-full bg-white flex items-center justify-center gap-2 px-3 active:scale-[0.98] transition-transform"
                >
                  <span className="w-8 h-8 rounded-full overflow-hidden border-2 border-[#00c2be] flex-shrink-0 bg-[#7B5CFF] flex items-center justify-center">
                    {authUser?.avatar ? (
                      <img
                        src={authUser.avatar}
                        alt=""
                        className="w-full h-full object-cover"
                        draggable={false}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <span className="text-white text-[10px] font-bold">{storyInitials}</span>
                    )}
                  </span>
                  <span className="text-black font-bold text-[14px]">Your Story</span>
                </button>
                <button
                  type="button"
                  onClick={goNextVideoPost}
                  className="flex-1 h-12 rounded-full bg-[#F12C56] flex items-center justify-center active:scale-[0.98] transition-transform"
                >
                  <span className="text-white font-bold text-[15px]">Next</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <ElixCameraLayout
            videoRef={videoRef}
            isRecording={isRecording}
            isPaused={false}
            onRecord={mode === 'live' ? startLive : (isRecording ? stopRecording : startRecording)}
            onClose={() => navigate('/feed')}
            onFlipCamera={flipCamera}
            onSelectMusic={() => setIsSoundOpen(true)}
            onAIMusicGenerator={() => setIsSoundOpen(true)}
            zoomLevel={zoomLevel}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomReset={handleZoomReset}
            onGalleryOpen={openUploadPicker}
            onPostTab={() => setMode('post')}
            onCreateTab={() => setMode('create')}
            onLiveTab={() => setMode('live')}
            selectedTab={mode === 'live' ? 'live' : mode === 'post' ? 'post' : 'create'}
            onFlashToggle={handleFlashToggle}
            flashActive={flashEnabled}
            timerDelay={recordingDelaySeconds}
            onTimerCycle={cycleTimer}
            onSpeedChange={handleSpeedChange}
            currentSpeed={playbackSpeed}
            hasRecordedVideo={false}
            onRetake={discardPreview}
            onPost={goNextVideoPost}
          />
        )}

        {isSoundOpen ? (
          <SoundPickerPanel
            onClose={() => setIsSoundOpen(false)}
            onPick={(sound) => {
              setSelectedSound(sound);
              setIsSoundOpen(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
