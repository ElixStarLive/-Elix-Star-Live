import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Music,
  Square,
  Play,
  Pause,
  CameraOff,
  X,
  Search,
  Image,
  Scissors,
  Type,
  Layers,
  Plus,
  FileText,
  Wand2,
  Sparkles,
  Film,
  Video,
  Radio,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { setCachedCameraStream } from '../lib/cameraStream';
import { type SoundTrack, fetchSoundTracksFromDatabase } from '../lib/soundLibrary';
import { nativePrompt } from '../components/NativeDialog';
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

function SoundPickerModal({
  isOpen,
  onClose,
  onPick,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPick: (sound: Sound) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipRef = useRef<{ start: number; end: number } | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [customSounds, setCustomSounds] = useState<Sound[]>([]);
  const [builtInSounds, setBuiltInSounds] = useState<Sound[]>([]);
  const sounds = useMemo<Sound[]>(() => {
    const builtIn = builtInSounds.filter((t) => !!t.url);
    return [...customSounds, ...builtIn];
  }, [customSounds, builtInSounds]);

  useEffect(() => {
    fetchSoundTracksFromDatabase().then(setBuiltInSounds);
  }, []);

  const formatClip = (start: number, end: number) => {
    const total = Math.max(0, Math.floor(end - start));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTimeUpdate = () => {
      const clip = clipRef.current;
      if (!clip) return;
      if (clip.end > clip.start && a.currentTime >= clip.end) {
        a.currentTime = clip.start;
        a.play().catch(() => {});
      }
    };
    a.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      a.removeEventListener('timeupdate', onTimeUpdate);
      a.pause();
    };
  }, []);

  const togglePreview = async (s: Sound) => {
    const a = audioRef.current;
    if (!a) return;
    if (playingId === String(s.id)) {
      a.pause();
      clipRef.current = null;
      setPlayingId(null);
      return;
    }
    a.src = s.url;
    const start = Math.max(0, s.clipStartSeconds);
    const end = Math.max(start, s.clipEndSeconds);
    clipRef.current = { start, end };
    a.currentTime = start;
    try {
      await a.play();
      setPlayingId(String(s.id));
    } catch {
      clipRef.current = null;
      setPlayingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] bg-black/40 flex items-end justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-[#1C1E24]/95 backdrop-blur-md w-full max-w-[480px] rounded-t-2xl overflow-hidden flex flex-col border-t border-[#FFD700]/30 h-[50vh] max-h-[50dvh] shadow-2xl animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <audio ref={audioRef} preload="auto" onEnded={() => setPlayingId(null)} className="hidden" />
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#C9A96E]/20 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-white" strokeWidth={2} />
            <p className="text-white font-semibold">Add sound</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const url = await nativePrompt('Paste audio URL (mp3/ogg):', '', 'Add Sound');
                if (!url) return;
                const title = (await nativePrompt('Sound name:', 'Custom sound', 'Sound Name')) ?? 'Custom sound';
                const next: Sound = {
                  id: Date.now(),
                  title: title.trim() || 'Custom sound',
                  artist: 'You',
                  duration: 'custom',
                  url: url.trim(),
                  license: 'Custom (you must own rights)',
                  source: 'Custom URL',
                  clipStartSeconds: 0,
                  clipEndSeconds: 120,
                };
                setCustomSounds((prev) => [next, ...prev]);
              }}
              className="px-3 py-1.5 rounded-full border border-[#C9A96E]/35 text-white text-xs font-semibold"
            >
              Add URL
            </button>
            <button onClick={onClose} className="p-2">
              <img src="/Icons/Gold power buton.png" alt="Close" className="w-5 h-5 object-contain" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {sounds.map((s) => (
            <div key={s.id} className="w-full px-3 py-2 flex items-center justify-between hover:brightness-125 transition-colors">
              <div className="text-left flex-1 min-w-0 mr-2">
                <p className="text-white text-sm font-medium leading-4 truncate">{s.title}</p>
                <p className="text-white/50 text-xs leading-4 truncate">{s.artist} • {formatClip(s.clipStartSeconds, s.clipEndSeconds)}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button type="button" onClick={() => togglePreview(s)} className="w-8 h-8 rounded-full border border-[#C9A96E]/25 bg-[#13151A] flex items-center justify-center">
                  {playingId === String(s.id) ? <Pause className="w-3.5 h-3.5 text-white" strokeWidth={2} /> : <Play className="w-3.5 h-3.5 text-white" strokeWidth={2} />}
                </button>
                <button type="button" onClick={() => { onPick(s); onClose(); }} className="px-2.5 py-1 rounded-full border border-[#C9A96E]/35 text-white text-[10px] font-semibold">
                  Use
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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
  const [showCreateHub, setShowCreateHub] = useState(false);
  const [mode, setMode] = useState<CreateMode>('create');
  const [isSoundOpen, setIsSoundOpen] = useState(false);
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
      if (left <= 0) { setCountdownSeconds(null); startRecordingNow(); return; }
      setCountdownSeconds(left);
      window.setTimeout(tick, 200);
    };
    window.setTimeout(tick, 200);
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

  const gradientColors = ['#C9A96E', '#D4B87A', '#E8D5A3', '#C9A96E'];

  // ═══ CREATE HUB OVERLAY (templates, New video, Drafts) — opened from camera "Create" tab ═══
  const createHubOverlay = showCreateHub && (
    <div className="fixed inset-0 z-[100] flex justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreateHub(false)} aria-hidden />
      <div className="relative w-full max-w-[480px] flex flex-col bg-[#13151A] text-white min-h-[100dvh] max-h-[100dvh] overflow-hidden animate-in slide-in-from-bottom duration-300">
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
        <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-2">
          <div className="w-7 h-7" aria-hidden />
          <h1 className="text-sm font-black tracking-wider text-[#C9A96E] uppercase">Create</h1>
          <button
            onClick={() => setShowCreateHub(false)}
            className="w-7 h-7 flex items-center justify-center mr-[3mm]"
            aria-label="Close"
          >
            <img src="/Icons/Gold power buton.png" alt="Close" className="w-5 h-5 object-contain" />
          </button>
        </div>
        <div className="flex items-center justify-around px-6 py-2">
          {FEATURE_TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => openCameraFromHub('create')}
              className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
            >
              <div className="w-9 h-9 rounded-full bg-[#13151A] border border-[#C9A96E]/30 flex items-center justify-center relative">
                <tool.icon className="w-4 h-4 text-[#C9A96E] relative z-[2]" strokeWidth={1.5} />
                <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
              </div>
              <span className="text-white/50 text-[9px] font-medium">{tool.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4 py-2">
          <button
            onClick={() => openCameraFromHub('create')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[#C9A96E]/10 border border-[#C9A96E]/25 active:scale-[0.98] transition-transform"
          >
            <div className="w-5 h-5 rounded-full bg-[#C9A96E] flex items-center justify-center">
              <Plus className="w-3 h-3 text-black" strokeWidth={2.5} />
            </div>
            <span className="text-white/80 font-semibold text-xs">New video</span>
          </button>
          <button
            onClick={() => { setShowCreateHub(false); navigate('/upload'); }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-white/5 border border-white/8 active:scale-[0.98] transition-transform"
          >
            <FileText className="w-4 h-4 text-white/40" strokeWidth={1.5} />
            <span className="text-white/60 font-semibold text-xs">Drafts</span>
          </button>
        </div>
        <div className="flex-1 flex flex-col min-h-0 px-4 overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="text-white/80 font-bold text-xs uppercase tracking-wider">Templates</h2>
            <button title="Search templates" onClick={() => setShowSearch(!showSearch)} className="w-6 h-6 rounded-full flex items-center justify-center">
              <Search className="w-3.5 h-3.5 text-white/40" />
            </button>
          </div>
          {showSearch && (
            <div className="mb-1.5 flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5 border border-white/10">
              <Search className="w-3 h-3 text-white/30" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="bg-transparent text-white text-xs outline-none flex-1 placeholder:text-white/30"
                autoFocus
              />
            </div>
          )}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar mb-2">
            {TEMPLATE_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setTemplateTab(tab.id); setSearchQuery(''); }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors ${
                  templateTab === tab.id ? 'bg-[#C9A96E] text-black' : 'bg-white/5 text-white/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar pb-2">
            <div className="grid grid-cols-2 gap-1.5">
              {filteredTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => openCameraFromHub('create')}
                  className="relative rounded-lg overflow-hidden aspect-[3/4] bg-gradient-to-br from-[#1C1E24] to-[#13151A] border border-white/5 active:scale-[0.97] transition-transform"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent z-10" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-[#C9A96E]/8 border border-[#C9A96E]/15 flex items-center justify-center">
                      <Film className="w-4 h-4 text-[#C9A96E]/30" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-2 z-20">
                    <p className="text-white font-medium text-[11px] leading-tight truncate">{tpl.title}</p>
                    <p className="text-white/40 text-[9px] mt-0.5">{tpl.video_count} • {tpl.clips}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-8 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] border-t border-white/5">
          <button onClick={() => { setShowCreateHub(false); navigate('/upload'); }} className="text-[11px] font-semibold text-white/40 uppercase tracking-wide">Post</button>
          <span className="text-[11px] font-black text-[#C9A96E] uppercase tracking-wide border-b border-[#C9A96E] pb-px">Create</span>
          <button onClick={() => openCameraFromHub('live')} className="text-[11px] font-semibold text-white/40 uppercase tracking-wide">Live</button>
        </div>
      </div>
    </div>
  );

  // ═══ CAMERA VIEW ═══
  return (
    <div className="min-h-[100dvh] bg-[#13151A] text-white flex justify-center">
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
            <div className="w-full h-full bg-[#13151A] relative flex items-center justify-center" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
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
                <div className="absolute inset-0 flex items-center justify-center bg-[#13151A] z-[100]">
                  <div className="text-center p-5 max-w-[280px]">
                    <CameraOff className="w-12 h-12 text-white/70 mx-auto mb-4" strokeWidth={1.5} />
                    <p className="text-white text-sm font-semibold mb-2">Camera Access Needed</p>
                    <p className="text-white/60 text-xs mb-5 leading-relaxed">{cameraError}</p>
                    <button onClick={() => { setCameraError(null); setRetryCamera((c) => c + 1); }} className="px-6 py-2.5 rounded-full bg-[#C9A96E] text-black text-sm font-semibold active:scale-95 transition-transform">
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
            <button onClick={togglePreviewPlayback} className="w-11 h-11 rounded-full border border-[#C9A96E]/35 bg-[#13151A] flex items-center justify-center">
              {isPreviewPlaying ? <Square className="w-5 h-5 text-white" strokeWidth={2} /> : <Play className="w-5 h-5 text-white" strokeWidth={2} />}
            </button>
          </div>
        )}

        {countdownSeconds !== null && (
          <div className="absolute inset-0 z-[80] flex items-center justify-center bg-[#13151A]">
            <div className="w-24 h-24 rounded-full bg-[#13151A] border border-[#C9A96E]/35 flex items-center justify-center">
              <div className="text-4xl font-black text-white">{countdownSeconds}</div>
            </div>
          </div>
        )}

        {toast && (
          <div className="absolute left-0 right-0 top-20 z-[90] flex justify-center px-4">
            <div className="px-4 py-2 rounded-full bg-[#13151A] border border-transparent text-sm text-white/80">{toast}</div>
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

        <SoundPickerModal isOpen={isSoundOpen} onClose={() => setIsSoundOpen(false)} onPick={(sound) => { setIsSoundOpen(false); }} />
      </div>
    </div>
  );
}
