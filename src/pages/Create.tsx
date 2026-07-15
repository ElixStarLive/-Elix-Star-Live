import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Music,
  Square,
  Play,
  CameraOff,
  Search,
  Image,
  Scissors,
  Type,
  Layers,
  FileText,
  Film,
  ChevronLeft,
  Plus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { setCachedCameraStream } from '../lib/cameraStream';
import { type SoundTrack } from '../lib/soundLibrary';
import SoundPickerPanel from '../components/SoundPickerPanel';
import ElixCameraLayout from '../components/ElixCameraLayout';

type CreateMode = 'upload' | 'post' | 'create' | 'live';
type TemplateTab = 'for_you' | 'viral_song' | 'trendy' | 'ai' | 'aesthetic' | 'one_clip';

type Sound = SoundTrack;

interface Template {
  id: string;
  title: string;
  thumbnail: string;
  video_count: string;
  clips: string;
  category: TemplateTab;
}

const PRESET_TEMPLATES: Template[] = [
  { id: '1', title: 'Na batida da música', thumbnail: '', video_count: '73.7K videos', clips: '1 clip', category: 'for_you' },
  { id: '2', title: 'Everyone Has A Story', thumbnail: '', video_count: '16.9K videos', clips: '1 clip', category: 'for_you' },
  { id: '3', title: 'Golden Hour Vibes', thumbnail: '', video_count: '45.2K videos', clips: '3 clips', category: 'trendy' },
  { id: '4', title: 'Sunset Aesthetic', thumbnail: '', video_count: '28.1K videos', clips: '2 clips', category: 'aesthetic' },
  { id: '5', title: 'AI Magic Edit', thumbnail: '', video_count: '12.4K videos', clips: '1 clip', category: 'ai' },
  { id: '6', title: 'Viral Dance Mix', thumbnail: '', video_count: '91.3K videos', clips: '1 clip', category: 'viral_song' },
  { id: '7', title: 'Quick One Shot', thumbnail: '', video_count: '55.8K videos', clips: '1 clip', category: 'one_clip' },
  { id: '8', title: 'Cinematic Intro', thumbnail: '', video_count: '33.6K videos', clips: '4 clips', category: 'trendy' },
];

const TEMPLATE_TABS: { id: TemplateTab; label: string }[] = [
  { id: 'for_you', label: 'For You' },
  { id: 'viral_song', label: 'Viral Song' },
  { id: 'trendy', label: 'Trendy' },
  { id: 'ai', label: 'AI' },
  { id: 'aesthetic', label: 'Aesthetic' },
  { id: 'one_clip', label: 'One Clip' },
];

const FEATURE_TOOLS = [
  { id: 'photo_editor', label: 'Photo editor', icon: Image },
  { id: 'autocut', label: 'AutoCut', icon: Scissors },
  { id: 'captions', label: 'Captions', icon: Type },
  { id: 'cutout', label: 'Cutout', icon: Layers },
  { id: 'music', label: 'Music', icon: Music },
];

export default function Create() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [showCreateHub, setShowCreateHub] = useState(true);
  const [mode, setMode] = useState<CreateMode>('create');
  const [isSoundOpen, setIsSoundOpen] = useState(false);
  const [selectedSound, setSelectedSound] = useState<Sound | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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
  const [templateTab, setTemplateTab] = useState<TemplateTab>('for_you');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

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

  const filteredTemplates = useMemo(() => {
    let t = PRESET_TEMPLATES.filter((tpl) => tpl.category === templateTab);
    if (searchQuery) {
      t = PRESET_TEMPLATES.filter((tpl) => tpl.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return t;
  }, [templateTab, searchQuery]);

  // Camera setup (runs whenever not showing create hub so overlay doesn't stop stream)
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

  const togglePreviewPlayback = async () => {
    const v = previewVideoRef.current;
    if (!v) return;
    if (!v.paused) { v.pause(); v.currentTime = 0; setIsPreviewPlaying(false); return; }
    try { await v.play(); setIsPreviewPlaying(true); } catch { setIsPreviewPlaying(false); }
  };

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

  const openCameraFromHub = (m: CreateMode) => {
    setShowCreateHub(false);
    setMode(m);
  };

  const storyInitials = useMemo(() => {
    const name = (user?.name || user?.username || '').trim();
    if (!name) return 'EL';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [user?.name, user?.username]);

  // ═══ CREATE HUB OVERLAY (templates, New video, Drafts) — opened from camera "Create" tab ═══
  const createHubOverlay = showCreateHub && (
    <div className="fixed inset-0 z-[100] flex justify-center bg-black">
      <div className="relative w-full max-w-[480px] flex flex-col bg-black text-white min-h-[100dvh] max-h-[100dvh] overflow-hidden">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,image/*"
          className="hidden"
          aria-label="Select file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const nextUrl = URL.createObjectURL(file);
            setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return nextUrl; });
            setIsPreviewPlaying(true);
            setShowCreateHub(false);
            setMode('create');
          }}
        />
        <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-3">
          <div className="w-8 h-8" aria-hidden />
          <h1 className="text-[15px] font-black tracking-[0.12em] text-[#F5C518] uppercase">Create</h1>
          <button
            type="button"
            onClick={() => setShowCreateHub(false)}
            className="w-8 h-8 flex items-center justify-center"
            aria-label="Back"
          >
            <ChevronLeft className="w-6 h-6 text-[#F5C518]" strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex items-start justify-between px-5 pt-1 pb-3">
          {FEATURE_TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                if (tool.id === 'music') {
                  setIsSoundOpen(true);
                  return;
                }
                openCameraFromHub('create');
              }}
              className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform w-[18%]"
            >
              <div className="w-11 h-11 rounded-full border border-[#F5C518] flex items-center justify-center bg-black">
                <tool.icon className="w-[18px] h-[18px] text-[#F5C518]" strokeWidth={1.6} />
              </div>
              <span className="text-white/55 text-[9px] font-medium leading-tight text-center">{tool.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2.5 px-4 pb-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => openCameraFromHub('create')}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-full bg-[#1A1A1A] border border-[#F5C518]/45 active:scale-[0.98] transition-transform"
            >
              <span className="w-5 h-5 rounded-full bg-[#E53935] flex-shrink-0" aria-hidden />
              <span className="text-white font-semibold text-[13px]">New video</span>
            </button>
            <button
              type="button"
              onClick={() => { setShowCreateHub(false); navigate('/upload'); }}
              className="flex items-center justify-center gap-1.5 px-4 h-11 rounded-full bg-[#1A1A1A] border border-[#F5C518]/45 active:scale-[0.98] transition-transform"
            >
              <FileText className="w-4 h-4 text-[#F5C518]" strokeWidth={1.6} />
              <span className="text-white font-semibold text-[13px]">Drafts</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setShowCreateHub(false); navigate('/upload?type=story'); }}
            className="w-full flex items-center justify-center gap-2.5 h-12 rounded-full bg-white active:scale-[0.98] transition-transform"
          >
            <span className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-[#7B5CFF] flex items-center justify-center">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  className="w-full h-full object-cover"
                  draggable={false}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <span className="text-white text-[10px] font-bold tracking-wide">{storyInitials}</span>
              )}
            </span>
            <span className="w-7 h-7 rounded-full border border-dashed border-[#F5C518] flex items-center justify-center flex-shrink-0">
              <Plus className="w-3.5 h-3.5 text-[#F5C518]" strokeWidth={2.5} />
            </span>
            <span className="text-black font-bold text-[14px]">Add story</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0 px-4 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[#F5C518] font-bold text-[11px] uppercase tracking-[0.14em]">Templates</h2>
            <button
              type="button"
              title="Search templates"
              onClick={() => setShowSearch(!showSearch)}
              className="w-7 h-7 rounded-full flex items-center justify-center"
            >
              <Search className="w-4 h-4 text-[#F5C518]" strokeWidth={2} />
            </button>
          </div>
          {showSearch && (
            <div className="mb-2 flex items-center gap-2 bg-[#1A1A1A] rounded-full px-3 py-2 border border-[#F5C518]/25">
              <Search className="w-3.5 h-3.5 text-white/35" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="bg-transparent text-white text-xs outline-none flex-1 placeholder:text-white/30"
                autoFocus
              />
            </div>
          )}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-3">
            {TEMPLATE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setTemplateTab(tab.id); setSearchQuery(''); }}
                className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors border ${
                  templateTab === tab.id
                    ? 'bg-[#F5C518] text-black border-[#F5C518]'
                    : 'bg-transparent text-white border-[#F5C518]/45'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar pb-3">
            <div className="grid grid-cols-2 gap-2.5">
              {filteredTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => openCameraFromHub('create')}
                  className="relative rounded-2xl overflow-hidden aspect-[3/4] bg-[#141414] border border-[#F5C518]/20 active:scale-[0.97] transition-transform"
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Film className="w-10 h-10 text-[#F5C518]/70" strokeWidth={1.25} />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-2.5 text-left">
                    <p className="text-white font-semibold text-[12px] leading-tight truncate">{tpl.title}</p>
                    <p className="text-white/45 text-[10px] mt-0.5">{tpl.video_count} • {tpl.clips}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-10 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
          <button
            type="button"
            onClick={() => { setShowCreateHub(false); navigate('/upload'); }}
            className="text-[12px] font-semibold text-white uppercase tracking-[0.08em]"
          >
            Post
          </button>
          <span className="text-[12px] font-black text-[#F5C518] uppercase tracking-[0.08em]">Create</span>
          <button
            type="button"
            onClick={() => openCameraFromHub('live')}
            className="text-[12px] font-semibold text-white uppercase tracking-[0.08em]"
          >
            Live
          </button>
        </div>
      </div>
    </div>
  );

  // ═══ CAMERA VIEW ═══
  return (
    <div className="min-h-[100dvh] bg-[#111111] text-white flex justify-center">
      <div className="relative w-full min-h-[100dvh] overflow-hidden">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          aria-label="Select video file"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const nextUrl = URL.createObjectURL(file);
            setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return nextUrl; });
            setIsPreviewPlaying(true);
            setMode('create');
          }}
        />

        <div className="absolute inset-0 z-[5]">
          {previewUrl ? (
            <video ref={previewVideoRef} src={previewUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline onPlay={() => setIsPreviewPlaying(true)} onPause={() => setIsPreviewPlaying(false)} />
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

        {previewUrl && (
          <div className="absolute right-4 bottom-[132px] z-[25]">
            <button onClick={togglePreviewPlayback} className="w-11 h-11 rounded-full border border-[#C9A227]/35 bg-[#111111] flex items-center justify-center">
              {isPreviewPlaying ? <Square className="w-5 h-5 text-white" strokeWidth={2} /> : <Play className="w-5 h-5 text-white" strokeWidth={2} />}
            </button>
          </div>
        )}

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

        {createHubOverlay}

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
          onPostTab={() => navigate('/upload')}
          onCreateTab={() => setShowCreateHub(true)}
          onLiveTab={() => setMode('live')}
          selectedTab={showCreateHub ? 'create' : mode === 'live' ? 'live' : mode === 'post' ? 'post' : 'create'}
          onFlashToggle={handleFlashToggle}
          flashActive={flashEnabled}
          timerDelay={recordingDelaySeconds}
          onTimerCycle={cycleTimer}
          onSpeedChange={handleSpeedChange}
          currentSpeed={playbackSpeed}
          hasRecordedVideo={!!previewUrl}
          onRetake={() => { setPreviewUrl(null); setIsPreviewPlaying(false); }}
          onPost={() => navigate('/upload')}
        />

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
