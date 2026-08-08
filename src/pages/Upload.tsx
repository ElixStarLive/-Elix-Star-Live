import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CaptureShutterButton } from '../components/CaptureShutterButton';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setCachedCameraStream } from '../lib/cameraStream';
import { RefreshCw, Zap, Clock, Music, Check, RotateCcw, ZoomIn, ZoomOut, Wand2, ChevronLeft, Image as ImageIcon, Type, Sparkles, X, LayoutGrid, Upload as UploadIcon, Share2, Smile, Blend, ChevronDown } from 'lucide-react';
import { useVideoStore } from '../store/useVideoStore';
import {
  resolvePlayableSoundUrl,
  registerSoundPreviewAudio,
  stopSoundPreview,
  type SoundTrack,
} from '../lib/soundLibrary';
import SoundPickerPanel from '../components/SoundPickerPanel';
import SoundMixPanel from '../components/SoundMixPanel';
import { trackEvent } from '../lib/analytics';
import { useSettingsStore } from '../store/useSettingsStore';
import { videoUploadService } from '../lib/videoUpload';
import { api } from '../lib/apiClient';
import { useAuthStore } from '../store/useAuthStore';
import AIToolsPanel from '../components/AIToolsPanel';
import MediaEditorPanel, {
  type EditorTab,
  type FilterPreset,
  FILTER_PRESETS,
  EFFECT_PRESETS,
  StoryFxOverlay,
} from '../components/MediaEditorPanel';
import { takeCachedRecordedMedia } from '../lib/recordedMediaCache';
import { DUET_STAGE_HEIGHT } from '../lib/profileFrame';
import { nativeShareMedia } from '../lib/platform';
import { bakeImage, bakeVideo, canBakeVideo, type EditOverlay } from '../lib/mediaBake';

export default function Upload() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { muteAllSounds } = useSettingsStore();
  const authUser = useAuthStore((s) => s.user);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraFacingRef = useRef<'user' | 'environment'>('user');
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [chunks, setChunks] = useState<Blob[]>([]);
  const [mediaKind, setMediaKind] = useState<'video' | 'image'>('video');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 1500); };
  const [cameraRetry, setCameraRetry] = useState(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [showMusicModal, setShowMusicModal] = useState(false);
  const [showSoundMix, setShowSoundMix] = useState(false);
  const [selectedAudioId, setSelectedAudioId] = useState<string>('original');
  const [postWithoutAudio, setPostWithoutAudio] = useState(false);
  const [caption, setCaption] = useState('');
  const [hashtagsText, setHashtagsText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [postProgress, setPostProgress] = useState(0);
  const [postError, setPostError] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<SoundTrack | null>(null);
  // Audio mix (0..1) applied when a song is added: original = the video's own sound, music = the added song.
  const [originalVolume, setOriginalVolume] = useState(1);
  const [musicVolume, setMusicVolume] = useState(0.7);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showAITools, setShowAITools] = useState(false);
  const [activeFilter, setActiveFilter] = useState('none');
  const [activeEnhance, setActiveEnhance] = useState('none');
  /** Story compose editor — same panel as Create (filters / effects / text / stickers). */
  const [editorTab, setEditorTab] = useState<EditorTab | null>(null);
  const [filterPreset, setFilterPreset] = useState<FilterPreset>(FILTER_PRESETS[0]);
  const [effectPreset, setEffectPreset] = useState<FilterPreset>(EFFECT_PRESETS[0]);
  const [overlays, setOverlays] = useState<EditOverlay[]>([]);
  const [previewFit, setPreviewFit] = useState<'cover' | 'contain'>('cover');
  const mediaWrapRef = useRef<HTMLDivElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const [mediaWidth, setMediaWidth] = useState(360);
  const previewObjectClass = previewFit === 'contain' ? 'object-contain' : 'object-cover';
  /** Selected AI thumbnail data URL — uploaded as real thumb (not preview-only). */
  const [selectedThumbnailDataUrl, setSelectedThumbnailDataUrl] = useState<string | null>(null);
  /** Voice FX is baked into video via mediaBake + VoiceProcessor when the runtime can re-encode. */
  const [selectedVoiceEffect, setSelectedVoiceEffect] = useState('none');
  const [cameraSpeed, setCameraSpeed] = useState<1 | 0.5 | 2>(1);
  const [beautyOn, setBeautyOn] = useState(false);
  const [timerDelay, setTimerDelay] = useState<0 | 3 | 10>(0);
  const [flashOn, setFlashOn] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [duetSourceVideoId, setDuetSourceVideoId] = useState<string | null>(null);
  const [duetSourceVideoUrl, setDuetSourceVideoUrl] = useState<string | null>(null);
  /** split = half/half; overlay = full original with your face on top (PiP). */
  const [duetLayout, setDuetLayout] = useState<'split' | 'overlay'>('split');
  const duetSourceVideoRef = useRef<HTMLVideoElement>(null);

  const duetParam = searchParams.get('duet');
  const isStoryUpload = searchParams.get('type') === 'story';
  const composeFilterCss = [
    filterPreset.css,
    effectPreset.css,
    activeFilter !== 'none' ? activeFilter : '',
    activeEnhance !== 'none' ? activeEnhance : '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  const goLoginFromUpload = useCallback(() => {
    navigate('/login', { state: { from: '/upload' } });
  }, [navigate]);

  const goCreate = useCallback(() => {
    navigate('/create');
  }, [navigate]);

  const goFeed = useCallback(() => {
    navigate('/feed');
  }, [navigate]);

  const goFriends = useCallback(() => {
    navigate('/friends');
  }, [navigate]);

  const goAiStudio = useCallback(() => {
    navigate('/ai-studio');
  }, [navigate]);

  const openMusicModal = useCallback(() => {
    setShowSoundMix(false);
    setShowMusicModal(true);
  }, []);

  const openSoundMixPanel = useCallback(() => {
    setShowSoundMix(true);
  }, []);

  const openAITools = useCallback(() => {
    setShowAITools(true);
  }, []);

  const openTextEditor = useCallback(() => {
    setEditorTab('text');
  }, []);
  const openStickersEditor = useCallback(() => {
    setEditorTab('stickers');
  }, []);
  const openEffectsEditor = useCallback(() => {
    setEditorTab('effects');
  }, []);
  const openFiltersEditor = useCallback(() => {
    setEditorTab('filters');
  }, []);
  const closeEditorPanel = useCallback(() => {
    setEditorTab(null);
  }, []);

  const togglePreviewLayout = useCallback(() => {
    setPreviewFit((prev) => {
      const next = prev === 'cover' ? 'contain' : 'cover';
      showToast(next === 'cover' ? 'Layout: Fill' : 'Layout: Fit');
      return next;
    });
  }, []);

  const goNextFromStory = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('type');
    setSearchParams(next, { replace: true });
    showToast('Add a caption, then Post');
  }, [searchParams, setSearchParams]);

  const clearPostError = useCallback(() => {
    setPostError(null);
  }, []);

  const setDuetSplit = useCallback(() => {
    setDuetLayout('split');
  }, []);

  const setDuetOverlay = useCallback(() => {
    setDuetLayout('overlay');
  }, []);

  const toggleOriginalMute = useCallback(() => {
    setOriginalVolume((v) => (v === 0 ? 1 : 0));
  }, []);

  useEffect(() => {
    if (!duetParam) {
      setDuetSourceVideoId(null);
      setDuetSourceVideoUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await api.videos.get(duetParam);
        if (cancelled || error || !data?.url) {
          if (!cancelled) { setDuetSourceVideoId(null); setDuetSourceVideoUrl(null); }
          return;
        }
        setDuetSourceVideoId(data.id);
        setDuetSourceVideoUrl(data.url);
      } catch {
        if (!cancelled) { setDuetSourceVideoId(null); setDuetSourceVideoUrl(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [duetParam]);

  const { addVideo: _addVideo, fetchVideos } = useVideoStore();

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.25;
  /** Zoom in only from full frame. Never scale below 1 — that shrinks the container look. */
  const handleZoomIn = () => setZoomLevel((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100));
  const zoomWrapperStyle: React.CSSProperties = {
    transform: zoomLevel <= 1 ? undefined : `scale(${Math.min(ZOOM_MAX, zoomLevel)})`,
    transformOrigin: 'center center',
    transition: 'transform 0.2s ease-out',
  };

  const attachCameraStream = useCallback(async (facing: 'user' | 'environment') => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: true,
      });
    } catch {
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
    }
  }, []);

  useEffect(() => {
    const el = mediaWrapRef.current;
    if (!el || !recordedVideoUrl) return;
    const update = () => setMediaWidth(el.clientWidth || 360);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [recordedVideoUrl]);

  const genOverlayId = () => `ov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const handleAddText = (text: string, color: string) =>
    setOverlays((p) => [...p, { id: genOverlayId(), kind: 'text', value: text, xPct: 0.5, yPct: 0.5, color, sizePct: 0.07 }]);
  const handleAddSticker = (emoji: string) =>
    setOverlays((p) => [...p, { id: genOverlayId(), kind: 'sticker', value: emoji, xPct: 0.5, yPct: 0.5, color: '#FFFFFF', sizePct: 0.14 }]);
  const removeOverlay = (id: string) => setOverlays((p) => p.filter((o) => o.id !== id));
  const onOverlayPointerDown = (e: React.PointerEvent, id: string) => {
    dragIdRef.current = id;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onOverlayPointerMove = (e: React.PointerEvent) => {
    const id = dragIdRef.current;
    if (!id) return;
    const rect = mediaWrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const xPct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const yPct = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setOverlays((p) => p.map((o) => (o.id === id ? { ...o, xPct, yPct } : o)));
  };
  const onOverlayPointerUp = (e: React.PointerEvent) => {
    dragIdRef.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  type _UploadMusic = {
    id: string;
    title: string;
    artist: string;
    duration: string;
    previewUrl?: string;
  };

  const formatClip = (start: number, end: number) => {
    const total = Math.max(0, Math.floor(end - start));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const getSelectedLabel = () => {
    if (postWithoutAudio || selectedAudioId === 'none') return 'No audio';
    if (selectedAudioId === 'original') return 'Original Sound';
    if (selectedTrack) return selectedTrack.title;
    return 'Add Sound';
  };

  const handleSelectMusic = (track: SoundTrack) => {
    if (previewAudioRef.current) {
      stopSoundPreview(previewAudioRef.current);
      previewAudioRef.current = null;
    }
    if (backgroundAudioRef.current) {
      stopSoundPreview(backgroundAudioRef.current);
      backgroundAudioRef.current = null;
    }
    if (!track?.id || track.id === 'original' || track.id === '0') {
      setSelectedTrack(null);
      setSelectedAudioId('original');
      setPostWithoutAudio(false);
      trackEvent('upload_select_audio', { type: 'original' });
    } else {
      setSelectedTrack(track);
      setSelectedAudioId(`track_${track.id}`);
      setPostWithoutAudio(false);
      trackEvent('upload_select_audio', { type: 'library', trackId: track.id, title: track.title });
    }
    setShowMusicModal(false);
    setShowSoundMix(true);
    showToast(track?.id === 'original' || !track?.id ? 'Original sound' : `Sound: ${track.title}`);
  };

  useEffect(() => {
    if (!showMusicModal) return;
    if (backgroundAudioRef.current) {
      stopSoundPreview(backgroundAudioRef.current);
      backgroundAudioRef.current = null;
    }
  }, [showMusicModal]);

  useEffect(() => {
    const cached = takeCachedRecordedMedia();
    if (!cached?.url) return;
    setRecordedVideoUrl(cached.url);
    setMediaKind(cached.kind === 'image' ? 'image' : 'video');
    if (cached.caption) setCaption(cached.caption);
    if (cached.hashtags) setHashtagsText(cached.hashtags);
    if (cached.sound?.id && cached.sound.id !== 'original' && cached.sound.url) {
      setSelectedTrack(cached.sound);
      setSelectedAudioId(`track_${cached.sound.id}`);
      setPostWithoutAudio(false);
    }
    if (typeof cached.originalVolume === 'number') {
      setOriginalVolume(Math.max(0, Math.min(1, cached.originalVolume)));
    }
    if (typeof cached.musicVolume === 'number') {
      setMusicVolume(Math.max(0, Math.min(1, cached.musicVolume)));
    }
    void fetch(cached.url)
      .then((r) => r.blob())
      .then((blob) => {
        if (blob.size > 0) setChunks([blob]);
      })
      .catch(() => { /* keep preview URL even if blob fetch fails */ });
  }, []);

  const prevRecordedUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevRecordedUrlRef.current;
    prevRecordedUrlRef.current = recordedVideoUrl;
    if (prev && !recordedVideoUrl) {
      setCaption('');
      setHashtagsText('');
      setPostWithoutAudio(false);
      setSelectedAudioId('original');
      setIsPosting(false);
      setPostProgress(0);
    }
  }, [recordedVideoUrl]);

   // Start Camera
  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      try {
        const hostname = window.location.hostname;
        const isSecureContext = window.isSecureContext
          || window.location.protocol === 'https:'
          || hostname === 'localhost'
          || hostname === '127.0.0.1'
          || hostname === '[::1]';
        if (!isSecureContext) {
          setCameraError('Camera requires HTTPS. Access via https:// or localhost.');
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError('Camera not supported on this browser.');
          return;
        }

        try {
          const permStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (permStatus.state === 'denied') {
            setCameraError('Camera is blocked. Go to your browser settings → Site Settings → Camera → Allow for this site, then tap Try Again.');
            return;
          }
        } catch {
          // permissions.query not supported — proceed directly
        }

        let stream: MediaStream;
        try {
          stream = await attachCameraStream('user');
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        if (stream.getVideoTracks().length === 0) {
          // Stop the (audio-only) stream we won't use, or its mic stays live.
          stream.getTracks().forEach(t => t.stop());
          setCameraError('Camera returned no video. Try a different browser.');
          return;
        }

        if (!cancelled && videoRef.current) {
          videoRef.current.srcObject = stream;
          setCachedCameraStream(stream);
          setZoomLevel(1);
          cameraFacingRef.current = 'user';
          setCameraFacing('user');
        } else {
          // Unmounted (or no video element) before we could attach/cache the
          // stream — stop tracks so the camera/mic indicator does not stay on.
          stream.getTracks().forEach(t => t.stop());
        }
        setCameraError(null);
      } catch (err: unknown) {
        const error = err as { name?: string };
        if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
          setCameraError('Camera permission denied. Allow camera access in your browser and tap Try Again.');
        } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
          setCameraError('No camera found on this device.');
        } else if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
          setCameraError('Camera is in use by another app. Close other apps and tap Try Again.');
        } else {
          setCameraError(`Camera error: ${(err as Error)?.message || 'Unknown error'}. Tap Try Again.`);
        }
      }
    }
    
    if (!recordedVideoUrl) {
        startCamera();
    }

    const videoEl = videoRef.current;
    return () => {
      cancelled = true;
      if (videoEl && videoEl.srcObject) {
        const stream = videoEl.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [recordedVideoUrl, cameraRetry, attachCameraStream]);

  const startRecordingNow = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm'
        : MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4'
        : '';
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      
      setChunks([]); // Clear previous chunks
      setIsPaused(false);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          setChunks((prev) => [...prev, e.data]);
        }
      };

      mediaRecorder.onstop = () => {
        // All chunks collected, now safe to set recording as stopped
        setIsRecording(false);
        setIsPaused(false);
      };

      // Request data every 100ms to avoid large chunks at the end
      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    }
  };

  const startRecording = () => {
    if (countdown !== null) return;
    if (timerDelay > 0) {
      setCountdown(timerDelay);
      let left = timerDelay;
      const tick = window.setInterval(() => {
        left -= 1;
        if (left <= 0) {
          window.clearInterval(tick);
          setCountdown(null);
          startRecordingNow();
        } else {
          setCountdown(left);
        }
      }, 1000);
      return;
    }
    startRecordingNow();
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsRecording(false);
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsRecording(true);
      setIsPaused(false);
    }
  };

  const stopRecordingFinal = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Request any buffered data first
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.requestData();
      }
      mediaRecorderRef.current.stop();
      // State update now happens in onstop callback
    }
  };

  // Watch for recording stop to create URL
  useEffect(() => {
    // Only create URL if we fully stopped (not just paused) and have chunks
    if (!isRecording && !isPaused && chunks.length > 0) {
        const recMime = mediaRecorderRef.current?.mimeType || 'video/webm';
        const blob = new Blob(chunks, { type: recMime });
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
    }
  }, [isRecording, isPaused, chunks]);

  const toggleRecording = () => {
    if (!isRecording && !isPaused) {
      startRecording();
    } else if (isRecording) {
      pauseRecording();
    } else if (isPaused) {
      resumeRecording();
    }
  };

  // Audio Preview Logic for Recorded Video — resolve signed Epidemic URL (no 302).
  // Only while editing a clip on Upload (create flow). Must stop when leaving Upload.
  useEffect(() => {
      let cancelled = false;
      const killBg = () => {
        const a = backgroundAudioRef.current;
        if (!a) return;
        stopSoundPreview(a);
        backgroundAudioRef.current = null;
      };

      const shouldPlayTrack =
        !!recordedVideoUrl &&
        !muteAllSounds &&
        !postWithoutAudio &&
        selectedAudioId.startsWith('track_');

      if (!shouldPlayTrack) {
        killBg();
        return;
      }

      const track = selectedTrack;
      if (!track?.url) {
        killBg();
        return;
      }

      killBg();

      const start = Math.max(0, track.clipStartSeconds || 0);
      const end = Math.max(start, track.clipEndSeconds || start + 30);

      void (async () => {
        const playable = await resolvePlayableSoundUrl(track.url);
        if (cancelled || !playable) {
          if (!cancelled && !playable) showToast('Could not load selected sound');
          return;
        }
        const audio = new Audio();
        registerSoundPreviewAudio(audio);
        audio.preload = 'auto';
        audio.loop = false;
        audio.dataset.elixSoundPreview = '1';
        audio.volume = Math.max(0, Math.min(1, musicVolume));
        audio.src = playable;
        // Play once through the clip — never restart (was looping forever and leaking).
        audio.ontimeupdate = () => {
          if (cancelled) return;
          if (end > start && audio.currentTime >= end) {
            stopSoundPreview(audio);
            if (backgroundAudioRef.current === audio) backgroundAudioRef.current = null;
          }
        };
        backgroundAudioRef.current = audio;
        const onReady = () => {
          if (cancelled) {
            stopSoundPreview(audio);
            return;
          }
          try { audio.currentTime = start; } catch { /* ignore */ }
          void audio.play().catch(() => {
            if (!cancelled) showToast('Tap video to hear sound');
          });
        };
        audio.addEventListener('canplay', onReady, { once: true });
        audio.load();
      })();

      return () => {
        cancelled = true;
        killBg();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muteAllSounds, postWithoutAudio, recordedVideoUrl, selectedAudioId, selectedTrack]);

  // Live-update the preview song volume while dragging the mix slider (no restart).
  useEffect(() => {
    if (backgroundAudioRef.current) {
      backgroundAudioRef.current.volume = Math.max(0, Math.min(1, musicVolume));
    }
  }, [musicVolume]);

  // Preview: original video volume.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !recordedVideoUrl || mediaKind !== 'video') return;
    const vol = Math.max(0, Math.min(1, originalVolume));
    el.muted = vol <= 0.001;
    el.volume = vol <= 0.001 ? 0 : vol;
  }, [originalVolume, recordedVideoUrl, mediaKind]);

  const handlePost = async () => {
      if (isPosting) return;
      if (!recordedVideoUrl) {
        showToast('No video selected');
        return;
      }

      const authUser = useAuthStore.getState().user;
      if (!authUser?.id) {
        goLoginFromUpload();
        return;
      }

      // Hydrate chunks from preview URL if cache→Upload race left them empty
      let uploadChunks = chunks;
      if (!uploadChunks.length && recordedVideoUrl) {
        try {
          const blob = await fetch(recordedVideoUrl).then((r) => r.blob());
          if (blob.size > 0) {
            uploadChunks = [blob];
            setChunks(uploadChunks);
          }
        } catch {
          /* fall through */
        }
      }

      // Must have video/image data to upload
      if (!uploadChunks.length) {
        showToast(isStoryUpload ? 'No story media to upload. Record or choose a clip first.' : 'No video to upload. Record or choose a video first.');
        return;
      }

      // Use the MIME type from the first chunk (which we set correctly in handleFileUpload or recording)
      let mimeType = uploadChunks[0].type || (mediaKind === 'image' ? 'image/jpeg' : 'video/webm');
      let blob = new Blob(uploadChunks, { type: mimeType });

      if (blob.size === 0) {
        showToast(isStoryUpload ? 'Story is empty. Record or choose a valid clip.' : 'Video is empty. Record or choose a valid video.');
        return;
      }

      videoUploadService.onProgress(({ progress }) => setPostProgress(progress));
      setPostProgress(0);
      setPostError(null);
      setIsPosting(true);

      try {
        const filterCss = [
          composeFilterCss,
        ]
          .filter(Boolean)
          .join(' ');
        const sourceUrl = recordedVideoUrl || URL.createObjectURL(blob);
        const ownsTempUrl = !recordedVideoUrl;
        const wantsVoice = Boolean(selectedVoiceEffect && selectedVoiceEffect !== 'none');
        const wantsOverlays = overlays.length > 0;
        try {
          if (mediaKind === 'image' || mimeType.startsWith('image/')) {
            if (filterCss || wantsOverlays || effectPreset.fx) {
              const bakedUrl = await bakeImage(sourceUrl, filterCss, overlays, effectPreset.fx);
              if (bakedUrl && bakedUrl !== sourceUrl) {
                blob = await fetch(bakedUrl).then((r) => r.blob());
                mimeType = blob.type || 'image/jpeg';
                URL.revokeObjectURL(bakedUrl);
              }
            }
            if (wantsVoice) {
              showToast('Voice effect applies to video only — not in uploaded image');
            }
          } else if (filterCss || wantsVoice || wantsOverlays || effectPreset.fx) {
            if (canBakeVideo()) {
              const bakedUrl = await bakeVideo(sourceUrl, filterCss, overlays, wantsVoice ? selectedVoiceEffect : undefined, effectPreset.fx);
              if (bakedUrl && bakedUrl !== sourceUrl) {
                blob = await fetch(bakedUrl).then((r) => r.blob());
                mimeType = blob.type || 'video/webm';
                URL.revokeObjectURL(bakedUrl);
              } else {
                showToast(wantsVoice
                  ? 'Could not bake voice/filters — uploading original'
                  : 'Could not bake filters — uploading original');
              }
            } else {
              showToast(wantsVoice
                ? 'Device cannot bake voice/filters — uploading original'
                : 'Device cannot bake video filters — uploading original');
            }
          }
        } finally {
          if (ownsTempUrl) URL.revokeObjectURL(sourceUrl);
        }

        // Use correct extension based on MIME type
        let ext = 'webm';
        if (mimeType.includes('mp4')) ext = 'mp4';
        if (mimeType.includes('quicktime')) ext = 'mov';
        if (mimeType.includes('png')) ext = 'png';
        else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
        else if (mimeType.includes('webp')) ext = 'webp';
        else if (mimeType.startsWith('image/')) ext = 'jpg';

        const file = new File([blob], `upload-${Date.now()}.${ext}`, { type: mimeType });

        const normalizedCaption = caption.trim();
        const captionHashtags = Array.from(normalizedCaption.matchAll(/#([\p{L}0-9_]+)/gu)).map((m) => m[1]);
        const manualHashtags = hashtagsText
          .split(/[\s,]+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => (t.startsWith('#') ? t.slice(1) : t));

        const hashtags = Array.from(new Set([...captionHashtags, ...manualHashtags].map((h) => h.toLowerCase()))).slice(0, 20);

        let musicMeta: Record<string, unknown> | undefined;
        if (selectedTrack && selectedAudioId.startsWith('track_')) {
            const track = selectedTrack;
            // Persist stable proxy path (not a short-lived signed CDN URL).
            const previewPath =
              track.provider === 'epidemic_sound' || /\/api\/music\/tracks\//.test(track.url || '')
                ? `/api/music/tracks/${encodeURIComponent(track.id)}/preview`
                : track.url;
            musicMeta = {
                id: track.id,
                title: track.title,
                artist: track.artist,
                duration: formatClip(track.clipStartSeconds, track.clipEndSeconds),
                url: previewPath,
                previewUrl: previewPath,
                provider: track.provider,
                clipStartSeconds: track.clipStartSeconds,
                clipEndSeconds: track.clipEndSeconds,
                originalVolume: Math.max(0, Math.min(1, originalVolume)),
                musicVolume: Math.max(0, Math.min(1, musicVolume)),
            };
        }
        // Persist duet partner + layout inside music JSON (no DB column yet).
        if (duetSourceVideoId) {
          musicMeta = {
            ...(musicMeta || {
              id: 'original',
              title: 'Original Sound',
              artist: authUser.username || authUser.name || 'Creator',
              duration: '0:15',
            }),
            duetWithVideoId: duetSourceVideoId,
            duetLayout,
          };
        }

        const thumbDataUrl = selectedThumbnailDataUrl || undefined;
        let videoId: string;
        if (isStoryUpload) {
          videoId = await videoUploadService.uploadStory(file, authUser.id, {
            mediaType: mediaKind === 'image' || mimeType.startsWith('image/') ? 'image' : 'video',
            thumbnailDataUrl: thumbDataUrl,
          });
        } else {
          videoId = await videoUploadService.uploadVideo(file, authUser.id, {
            description: normalizedCaption,
            hashtags: hashtags,
            isPrivate: false,
            music: musicMeta,
            duetWithVideoId: duetSourceVideoId || undefined,
            duetLayout: duetSourceVideoId ? duetLayout : undefined,
            thumbnailDataUrl: thumbDataUrl,
          });
          await fetchVideos();
        }

        trackEvent('upload_post_success', { videoId, story: isStoryUpload });
        setRecordedVideoUrl(null);
        setChunks([]);
        setMediaKind('video');
        setSelectedThumbnailDataUrl(null);
        setSelectedVoiceEffect('none');
        setIsPosting(false);
        setPostProgress(0);
        showToast(isStoryUpload ? 'Story posted!' : 'Video posted!');
        setTimeout(() => (isStoryUpload ? goFriends() : goFeed()), 500);
        
      } catch (error) {
        const msg = error?.message || error?.error_description || String(error) || 'Unknown error';

        if (msg.includes('Invalid or expired session') || msg.includes('Not authenticated')) {
          const { signOut } = await import('../store/useAuthStore').then(m => ({ signOut: m.useAuthStore.getState().signOut }));
          await signOut();
          setPostError('Session expired. Please log in again.');
          setTimeout(() => goLoginFromUpload(), 1500);
        } else {
          setPostError(msg);
        }
        setIsPosting(false);
        setPostProgress(0);
      }
  };

  const handleDiscard = () => {
      setRecordedVideoUrl(null);
      setChunks([]);
      setMediaKind('video');
      setSelectedThumbnailDataUrl(null);
      setSelectedVoiceEffect('none');
      setFilterPreset(FILTER_PRESETS[0]);
      setEffectPreset(EFFECT_PRESETS[0]);
      setOverlays([]);
      setEditorTab(null);
      setPreviewFit('cover');
  };

  const handleFileUpload = (accept?: string) => {
    const acceptValue =
      typeof accept === 'string' && (accept.includes('/') || accept.includes('*'))
        ? accept
        : isStoryUpload
          ? 'image/*'
          : 'video/*';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = acceptValue;
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        setRecordedVideoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setMediaKind(file.type.startsWith('image/') ? 'image' : 'video');
        const blob = file.slice(0, file.size, file.type);
        setChunks([blob]);
      }
    };
    input.click();
  };

  const openImagePicker = () => handleFileUpload('image/*');
  const openVideoPicker = () => handleFileUpload('video/*');
  /** Story Upload = photos from phone; video post Upload = videos. */
  const openGalleryPicker = () => handleFileUpload(isStoryUpload ? 'image/*' : 'video/*');


  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-transparent overflow-hidden flex justify-center">
      <div className={`w-full max-w-[480px] flex flex-col items-center h-full relative ${recordedVideoUrl ? 'justify-end' : 'justify-start'}`}>
      {toast && <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md text-white text-sm px-4 py-2 rounded-xl z-[9999]">{toast}</div>}
      {/* PREVIEW MODE */}
       {recordedVideoUrl ? (
         <>
           <div className="relative z-10 w-full mx-auto h-[100dvh] bg-black flex flex-col items-center justify-center" ref={mediaWrapRef}>
              {duetSourceVideoUrl ? (
                <div
                  className="absolute top-0 left-0 right-0 w-full overflow-hidden bg-black"
                  style={{ height: DUET_STAGE_HEIGHT }}
                  data-duet-container="preview"
                  data-duet-layout={duetLayout}
                >
                  <div
                    className={
                      duetLayout === 'overlay'
                        ? 'absolute inset-0 bg-black'
                        : 'absolute left-0 top-0 w-1/2 h-full bg-black'
                    }
                    data-duet-pane="original"
                  >
                    <video
                      src={duetSourceVideoUrl}
                      className="w-full h-full object-cover"
                      playsInline
                      muted
                      loop
                      autoPlay
                    />
                  </div>
                  <div
                    className={
                      duetLayout === 'overlay'
                        ? 'absolute bottom-3 right-3 z-[2] w-[34%] aspect-[9/16] rounded-xl overflow-hidden border-2 border-[#D8D9DD] shadow-lg bg-black'
                        : 'absolute right-0 top-0 w-1/2 h-full bg-black'
                    }
                    data-duet-pane="you"
                  >
                    <video
                      ref={videoRef}
                      src={recordedVideoUrl}
                      className="absolute inset-0 w-full h-full object-cover z-0"
                      controls={false}
                      autoPlay
                      loop
                      muted
                      playsInline
                      style={{ filter: composeFilterCss || undefined }}
                    />
                  </div>
                  <div
                    className="absolute left-3 z-30 flex gap-2 pointer-events-auto"
                    style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
                  >
                    <button
                      type="button"
                      onClick={setDuetSplit}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                        duetLayout === 'split'
                          ? 'bg-[#E6E9EE] text-white elix-accent border-[#D8D9DD]'
                          : 'bg-black/55 text-[#F5F5F7] border-[#D8D9DD]/70'
                      }`}
                    >
                      Split
                    </button>
                    <button
                      type="button"
                      onClick={setDuetOverlay}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                        duetLayout === 'overlay'
                          ? 'bg-[#E6E9EE] text-white elix-accent border-[#D8D9DD]'
                          : 'bg-black/55 text-[#F5F5F7] border-[#D8D9DD]/70'
                      }`}
                    >
                      On top
                    </button>
                  </div>
                </div>
              ) : mediaKind === 'image' ? (
              <img
                  src={recordedVideoUrl}
                  alt=""
                  className={`w-full h-full ${previewObjectClass} z-0 bg-black`}
                  style={{ filter: composeFilterCss || undefined }}
                  draggable={false}
              />
              ) : (
              <video
                  ref={videoRef}
                  src={recordedVideoUrl}
                  className={`w-full h-full ${previewObjectClass} z-0 bg-black`}
                  controls={false}
                  autoPlay
                  loop
                  playsInline
                  muted={originalVolume <= 0.001}
                  style={{ filter: composeFilterCss || undefined }}
              />
              )}

               {recordedVideoUrl ? <StoryFxOverlay fx={effectPreset.fx} /> : null}

               {recordedVideoUrl && overlays.length > 0 ? (
                 <div className="absolute inset-0 z-[10] pointer-events-none">
                   {overlays.map((o) => {
                     const fontPx = Math.max(12, Math.round(o.sizePct * (mediaWidth || 360)));
                     return (
                       <div
                         key={o.id}
                         role="button"
                         tabIndex={0}
                         onPointerDown={(e) => onOverlayPointerDown(e, o.id)}
                         onPointerMove={onOverlayPointerMove}
                         onPointerUp={onOverlayPointerUp}
                         onDoubleClick={() => removeOverlay(o.id)}
                         title="Drag to move · double-tap to remove"
                         className="absolute -translate-x-1/2 -translate-y-1/2 select-none pointer-events-auto touch-none cursor-move whitespace-nowrap"
                         style={{
                           left: `${o.xPct * 100}%`,
                           top: `${o.yPct * 100}%`,
                           fontSize: `${fontPx}px`,
                           color: o.kind === 'text' ? o.color : undefined,
                           fontWeight: 700,
                           textShadow: o.kind === 'text' ? '0 1px 3px rgba(0,0,0,0.55)' : undefined,
                           lineHeight: 1,
                         }}
                       >
                         {o.value}
                       </div>
                     );
                   })}
                 </div>
               ) : null}
               
               {/* Story compose = Instagram/TikTok style (Your Story / Next). Video post keeps caption form. */}
               {isStoryUpload ? (
                 <>
                   <div
                     className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 pointer-events-auto"
                     style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
                   >
                     <button
                       type="button"
                       onClick={goCreate}
                       className="camera-rail-disc flex items-center justify-center"
                       title="Back"
                     >
                       <ChevronLeft size={14} className="text-white drop-shadow-md" strokeWidth={2.5} />
                     </button>
                     <button
                       type="button"
                       onClick={openSoundMixPanel}
                       className="elix-sound-pill flex items-center gap-1 max-w-[58%] h-[26px] px-2.5 rounded-full border border-[#D8D9DD]/40"
                       style={{ background: 'rgba(0, 0, 0, 0.55)' }}
                       title={getSelectedLabel() || 'Add sound'}
                     >
                       <Music size={10} className="text-[#F5F5F7] shrink-0" strokeWidth={2} />
                       <span className="text-[#F5F5F7] text-[10px] font-semibold truncate">
                         {selectedTrack?.title || 'Add sound'}
                       </span>
                       {(selectedTrack || selectedAudioId.startsWith('track_')) ? (
                         <span
                           role="button"
                           tabIndex={0}
                           onClick={(e) => {
                             e.stopPropagation();
                             setSelectedTrack(null);
                             setSelectedAudioId('original');
                           }}
                           onKeyDown={(e) => {
                             if (e.key === 'Enter') {
                               e.stopPropagation();
                               setSelectedTrack(null);
                               setSelectedAudioId('original');
                             }
                           }}
                           className="ml-0.5"
                         >
                           <X size={12} className="text-[#C8CDD5]" />
                         </span>
                       ) : null}
                     </button>
                     <div className="w-[26px] h-[26px]" aria-hidden />
                   </div>

                   <div
                     className="absolute right-2 z-30 flex flex-col items-center gap-2 pointer-events-auto"
                     style={{ top: 'calc(env(safe-area-inset-top, 0px) + 52px)' }}
                   >
                     {[
                       { Icon: Share2, title: 'Share', onClick: async () => {
                         if (!recordedVideoUrl) {
                           showToast('Nothing to share yet');
                           return;
                         }
                         let blob: Blob | null = null;
                         try {
                           blob = await fetch(recordedVideoUrl).then((r) => r.blob());
                         } catch {
                           blob = null;
                         }
                         const result = await nativeShareMedia({
                           title: 'Elix Star Live',
                           text: caption || 'Made with Elix Star Live',
                           url: 'https://www.elixstarlive.co.uk',
                           blob,
                           filename: mediaKind === 'image' ? 'elixstar.jpg' : 'elixstar.webm',
                         });
                         if (result === 'shared') showToast('Shared');
                         else if (result === 'copied') showToast('Link copied');
                         else if (result === 'unavailable') showToast('Could not share');
                       } },
                       { Icon: LayoutGrid, title: 'Layout', onClick: togglePreviewLayout },
                       { Icon: ImageIcon, title: 'Media', onClick: openImagePicker },
                       { Icon: Type, title: 'Text', onClick: openTextEditor },
                       { Icon: Smile, title: 'Stickers', onClick: openStickersEditor },
                       { Icon: Sparkles, title: 'Effects', onClick: openEffectsEditor },
                       { Icon: Blend, title: 'Filters', onClick: openFiltersEditor },
                     ].map(({ Icon, title, onClick }) => (
                       <button
                         key={title}
                         type="button"
                         onClick={onClick}
                         className="camera-rail-disc flex items-center justify-center"
                         title={title}
                       >
                         <Icon size={14} className="text-white drop-shadow-md" strokeWidth={2} />
                       </button>
                     ))}
                     <button type="button" onClick={openAITools} className="camera-rail-disc flex items-center justify-center" title="More">
                       <ChevronDown size={14} className="text-white drop-shadow-md" strokeWidth={2} />
                     </button>
                   </div>

                   <div
                     className="absolute left-0 right-0 z-30 flex flex-col items-center gap-2.5 px-4 pointer-events-auto"
                     style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
                   >
                     <span className="camera-rail-disc flex items-center justify-center" aria-hidden>
                       <ChevronDown size={12} className="text-white/80" />
                     </span>
                     <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-full bg-black/45 backdrop-blur-md">
                       <button type="button" onClick={openGalleryPicker} className="camera-rail-disc flex items-center justify-center" title="Gallery">
                         <LayoutGrid size={14} className="text-white" strokeWidth={2} />
                       </button>
                       <button
                         type="button"
                         onClick={openGalleryPicker}
                         className="w-10 h-10 rounded-full overflow-hidden border-2 border-white flex-shrink-0 bg-black"
                         title="Replace media"
                       >
                         {mediaKind === 'image' ? (
                           <img src={recordedVideoUrl || undefined} alt="" className="w-full h-full object-cover" draggable={false} />
                         ) : (
                           <video src={recordedVideoUrl || undefined} className="w-full h-full object-cover" muted playsInline />
                         )}
                       </button>
                       <button type="button" onClick={openGalleryPicker} className="camera-rail-disc flex items-center justify-center" title="Upload">
                         <UploadIcon size={14} className="text-white" strokeWidth={2.5} />
                       </button>
                     </div>

                     {postError ? (
                       <div className="w-full max-w-md px-3 py-2 rounded-lg bg-red-600/80 text-white text-xs text-center">
                         {postError}
                         <button type="button" onClick={clearPostError} className="ml-2 underline">×</button>
                       </div>
                     ) : null}
                     {isPosting ? (
                       <div className="w-full max-w-md px-1">
                         <div className="flex items-center justify-between text-xs text-white mb-1">
                           <span>{postProgress < 100 ? 'Uploading…' : 'Finalizing…'}</span>
                           <span>{postProgress}%</span>
                         </div>
                         <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                           <div className="h-full bg-[#E6E9EE] elix-progress-fill" style={{ width: `${postProgress}%` }} />
                         </div>
                       </div>
                     ) : null}

                     <div className="w-full max-w-md flex items-center gap-2.5">
                       <button
                         type="button"
                         onClick={handlePost}
                         disabled={isPosting}
                         className="flex-1 h-12 rounded-full bg-white flex items-center justify-center gap-2 px-3 active:scale-[0.98] transition-transform disabled:opacity-60"
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
                             <span className="text-white text-[10px] font-bold">
                               {(authUser?.name || authUser?.username || 'EL').slice(0, 2).toUpperCase()}
                             </span>
                           )}
                         </span>
                         <span className="text-black font-bold text-[14px]">
                           {isPosting ? 'Posting…' : 'Your Story'}
                         </span>
                       </button>
                       <button
                         type="button"
                         onClick={goNextFromStory}
                         disabled={isPosting}
                         className="flex-1 h-12 rounded-full bg-[#F12C56] flex items-center justify-center active:scale-[0.98] transition-transform disabled:opacity-60"
                       >
                         <span className="text-white font-bold text-[15px]">
                           {isPosting ? '…' : 'Next'}
                         </span>
                       </button>
                     </div>
                   </div>
                 </>
               ) : (
                 <>
               {/* Tiny caption / hashtags strip — drops from top after capture */}
               <div
                 className="absolute top-0 left-0 right-0 z-20 pointer-events-auto animate-in slide-in-from-top duration-300 elix-panel border-b border-black"
                 style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
               >
                 <div className="w-full rounded-none px-3 py-1.5 space-y-1">
                   <div className="flex items-center gap-1">
                     <input
                       value={caption}
                       onChange={(e) => setCaption(e.target.value)}
                       placeholder="Caption…"
                       className="flex-1 min-w-0 bg-white/10 text-[#F5F5F7] placeholder:text-[#F5F5F7] border border-[#D8D9DD]/30 rounded-md px-2 py-1 text-xs font-medium outline-none h-7 focus:border-[#D8D9DD]/55"
                       aria-label="Caption"
                     />
                     <button
                       onClick={openMusicModal}
                       className="flex items-center justify-center w-7 h-7 rounded-full bg-white/10 border border-[#D8D9DD]/25 shrink-0"
                       title={getSelectedLabel()}
                       type="button"
                     >
                       <Music size={12} className="text-[#F5F5F7]" />
                     </button>
                   </div>
                   <input
                     value={hashtagsText}
                     onChange={(e) => setHashtagsText(e.target.value)}
                     placeholder="#hashtags"
                     className="w-full bg-white/10 text-[#F5F5F7] placeholder:text-[#F5F5F7] border border-[#D8D9DD]/30 rounded-md px-2 py-1 text-xs font-medium outline-none h-7 focus:border-[#D8D9DD]/55"
                     aria-label="Hashtags"
                   />
                   <div className="flex items-center justify-between gap-2 pl-0.5">
                     <span className="text-[9px] text-white/80 font-semibold">Mute</span>
                     <button
                       type="button"
                       className={`w-8 h-4 rounded-full transition-colors shrink-0 ${
                         postWithoutAudio ? 'bg-[#E6E9EE]' : 'bg-white/20'
                       }`}
                       onClick={() => {
                         const next = !postWithoutAudio;
                         setPostWithoutAudio(next);
                         if (next) setSelectedAudioId('none');
                         trackEvent('upload_toggle_no_audio', { value: next });
                       }}
                       aria-label="Toggle post without audio"
                     >
                       <div
                         className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
                           postWithoutAudio ? 'translate-x-[14px]' : 'translate-x-[1px]'
                         }`}
                       />
                     </button>
                   </div>
                   {selectedTrack && selectedAudioId.startsWith('track_') && !postWithoutAudio && (
                     <div className="space-y-1 pt-0.5 border-t border-white/10">
                       <div className="flex items-center gap-1">
                         <label className="text-[8px] text-white/70 font-semibold shrink-0 w-10">Orig</label>
                         <input
                           type="range" min={0} max={100} value={Math.round(originalVolume * 100)}
                           onChange={(e) => setOriginalVolume(Number(e.target.value) / 100)}
                           className="flex-1 h-1 accent-[#D8D9DD]"
                           aria-label="Original sound volume"
                         />
                         <button
                           type="button"
                           onClick={toggleOriginalMute}
                           className="text-[8px] font-bold text-white/60 px-1 py-0.5 rounded bg-white/10 shrink-0"
                         >
                           {originalVolume === 0 ? 'Muted' : 'Mute'}
                         </button>
                       </div>
                       <div className="flex items-center gap-1">
                         <label className="text-[8px] text-white/70 font-semibold shrink-0 w-10">Song</label>
                         <input
                           type="range" min={0} max={100} value={Math.round(musicVolume * 100)}
                           onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
                           className="flex-1 h-1 accent-[#D8D9DD]"
                           aria-label="Song volume"
                         />
                       </div>
                     </div>
                   )}
                   {postError ? (
                     <div className="w-full px-1.5 py-1 rounded bg-white/20 text-white text-[9px]">
                       {postError}
                       <button type="button" onClick={clearPostError} className="ml-1 underline">×</button>
                     </div>
                   ) : null}
                   {isPosting ? (
                     <div className="w-full">
                       <div className="flex items-center justify-between text-[9px] text-white mb-0.5">
                         <span>{postProgress < 100 ? 'Uploading…' : 'Finalizing…'}</span>
                         <span>{postProgress}%</span>
                       </div>
                       <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                         <div className="h-full bg-[#E6E9EE] elix-progress-fill" style={{ width: `${postProgress}%` }} />
                       </div>
                     </div>
                   ) : null}
                 </div>
               </div>

                  {/* Upload — round glow like other icons (not black square) */}
                  <button
                    onClick={handleFileUpload}
                    className="absolute bottom-[7%] left-[5%] flex flex-col items-center gap-1 z-30 pointer-events-auto group"
                    title="Upload"
                  >
                    <span className="royce-glow-disc w-9 h-9 group-active:scale-90 transition-transform" aria-hidden>
                      <ImageIcon size={18} className="royce-icon-gold" strokeWidth={2} />
                    </span>
                    <span className="text-[#F5F5F7] text-[10px] font-bold drop-shadow-[0_0_8px_rgba(139, 144, 152,0.9)]">Upload</span>
                  </button>

                  {/* AI Studio (moved up) */}
                  <button
                    onClick={openAITools}
                    className="absolute right-[5%] bottom-[26%] flex flex-col items-center gap-1 z-30 pointer-events-auto group"
                    title="AI Studio"
                  >
                    <span className="w-9 h-9 flex items-center justify-center group-hover:scale-110 transition-transform" aria-hidden>
                      <Wand2 size={18} className="royce-icon-gold" strokeWidth={2} />
                    </span>
                    <span className="text-[#F5F5F7] font-bold text-[10px] drop-shadow-[0_0_8px_rgba(139, 144, 152,0.9)]">AI Studio</span>
                  </button>

                  {/* Retake + Post (moved down) */}
                  <div className="absolute bottom-[7%] right-[5%] flex flex-col items-center gap-4 z-30 pointer-events-auto">
                    <button
                      onClick={handleDiscard}
                      className="flex flex-col items-center gap-1 group"
                      title="Retake"
                    >
                      <span className="w-9 h-9 flex items-center justify-center group-hover:scale-110 transition-transform" aria-hidden>
                        <RotateCcw size={18} className="royce-icon-gold" strokeWidth={2} />
                      </span>
                      <span className="text-[#F5F5F7] font-bold text-[10px] drop-shadow-[0_0_8px_rgba(139, 144, 152,0.9)]">Retake</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePost}
                      className="flex flex-col items-center gap-1 group disabled:opacity-60"
                      title={isStoryUpload ? 'Your Story' : 'Post'}
                      disabled={isPosting}
                    >
                      <span className="w-11 h-11 flex items-center justify-center group-hover:scale-110 active:scale-95 transition-transform" aria-hidden>
                        <Check size={18} className={`royce-icon-gold ${isPosting ? 'opacity-60' : ''}`} strokeWidth={2.5} />
                      </span>
                      <span className="text-[#F5F5F7] font-bold text-[10px] drop-shadow-[0_0_8px_rgba(139, 144, 152,0.9)]">
                        {isPosting ? 'Posting…' : isStoryUpload ? 'Your Story' : 'Post'}
                      </span>
                    </button>
                  </div>
                 </>
               )}
               </div>

              {/* Story compose editor (filters / effects / text / stickers) */}
              {editorTab ? (
                <MediaEditorPanel
                  tab={editorTab}
                  activeFilterId={filterPreset.id}
                  activeEffectId={effectPreset.id}
                  onSelectFilter={setFilterPreset}
                  onSelectEffect={setEffectPreset}
                  onAddText={handleAddText}
                  onAddSticker={handleAddSticker}
                  onClose={closeEditorPanel}
                />
              ) : null}

              {/* AI Tools Panel */}
              <AIToolsPanel
                isOpen={showAITools}
                onClose={() => setShowAITools(false)}
                videoUrl={recordedVideoUrl}
                videoRef={videoRef}
                onFilterChange={(css) => setActiveFilter(css)}
                onEnhanceChange={(css) => setActiveEnhance(css)}
                onCaptionSelect={(cap, tags) => {
                  if (cap) setCaption(prev => prev ? prev + '\n' + cap : cap);
                  if (tags.length) setHashtagsText(prev => {
                    const existing = prev.split(/[\s,]+/).filter(Boolean);
                    const merged = [...new Set([...existing, ...tags])];
                    return merged.map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
                  });
                  setShowAITools(false);
                }}
                onThumbnailSelect={(dataUrl) => {
                  if (dataUrl && dataUrl.startsWith('data:')) {
                    setSelectedThumbnailDataUrl(dataUrl);
                    showToast('Thumbnail selected for upload');
                  } else {
                    showToast('Could not use that thumbnail');
                  }
                }}
                onVoiceEffectChange={(effectId) => {
                  setSelectedVoiceEffect(effectId || 'none');
                  if (effectId && effectId !== 'none') {
                    showToast('Voice effect preview — baked into video on post');
                  }
                }}
              />
         </>
       ) : (
        /* CAMERA MODE */
        <>
          {/* Container Principal */}
          <div className="relative z-10 w-full h-[100dvh] mb-0 pointer-events-none bg-transparent shadow-2xl overflow-hidden">
              {/* Duet: split (half/half) or overlay (full original + your face on top) */}
              {duetSourceVideoUrl ? (
                <div
                  className="absolute top-0 left-0 right-0 w-full overflow-hidden bg-black"
                  style={{ height: DUET_STAGE_HEIGHT }}
                  data-duet-container="record"
                  data-duet-layout={duetLayout}
                >
                  <div
                    className={
                      duetLayout === 'overlay'
                        ? 'absolute inset-0 bg-black'
                        : 'absolute left-0 top-0 w-1/2 h-full bg-black'
                    }
                    data-duet-pane="original"
                  >
                    <video
                      ref={duetSourceVideoRef}
                      src={duetSourceVideoUrl}
                      className="w-full h-full object-cover"
                      playsInline
                      muted
                      loop
                      autoPlay
                    />
                  </div>
                  <div
                    className={
                      duetLayout === 'overlay'
                        ? 'absolute bottom-3 right-3 z-[2] w-[34%] aspect-[9/16] rounded-xl overflow-hidden border-2 border-[#D8D9DD] shadow-lg bg-black'
                        : 'absolute right-0 top-0 w-1/2 h-full bg-black'
                    }
                    data-duet-pane="you"
                  >
                    <div className="absolute inset-0 overflow-hidden bg-black">
                      <div className="absolute inset-0" style={zoomWrapperStyle}>
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className={`absolute inset-0 w-full h-full object-cover bg-black ${cameraError ? 'hidden' : ''}`}
                          style={{
                            filter: beautyOn ? 'brightness(1.08) contrast(1.05) saturate(1.12)' : undefined,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
              {/* Full-frame: zoom only — no front mirror */}
              <div className="absolute inset-0 z-0 overflow-hidden bg-black">
                <div className="absolute inset-0" style={zoomWrapperStyle}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`absolute inset-0 w-full h-full object-cover bg-black ${cameraError ? 'hidden' : ''}`}
                    style={{
                      filter: beautyOn ? 'brightness(1.08) contrast(1.05) saturate(1.12)' : undefined,
                    }}
                  />
                </div>
              </div>
                </>
              )}
              {countdown !== null ? (
                <div className="absolute inset-0 z-[25] flex items-center justify-center pointer-events-none">
                  <span className="text-6xl font-black text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">{countdown}</span>
                </div>
              ) : null}

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-[5] bg-transparent text-white p-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mb-3">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9.34"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/></svg>
                  </div>
                  <p className="text-white text-sm font-medium mb-1">Camera Access Needed</p>
                  <p className="text-white/50 text-xs mb-4 max-w-[260px] leading-relaxed">
                    {cameraError}
                  </p>
                  <button
                    onClick={() => {
                      setCameraError(null);
                      // Stop any existing stream
                      if (videoRef.current && videoRef.current.srcObject) {
                        const stream = videoRef.current.srcObject as MediaStream;
                        stream.getTracks().forEach(track => track.stop());
                        videoRef.current.srcObject = null;
                      }
                      setRecordedVideoUrl(null);
                      // Increment retry counter to force useEffect re-run
                      setCameraRetry(prev => prev + 1);
                    }}
                    className="px-5 py-2.5 rounded-full bg-[#E6E9EE] text-white elix-accent text-sm font-semibold active:scale-95 transition-transform pointer-events-auto"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* Interactive Hitboxes Layer */}
              <div className="absolute inset-0 z-20 w-full h-full pointer-events-auto">
                  {duetSourceVideoUrl ? (
                    <div
                      className="absolute left-3 z-30 flex gap-2"
                      style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
                    >
                      <button
                        type="button"
                        onClick={setDuetSplit}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                          duetLayout === 'split'
                            ? 'bg-[#E6E9EE] text-white elix-accent border-[#D8D9DD]'
                            : 'bg-black/55 text-[#F5F5F7] border-[#D8D9DD]/70'
                        }`}
                        title="Side by side"
                      >
                        Split
                      </button>
                      <button
                        type="button"
                        onClick={setDuetOverlay}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                          duetLayout === 'overlay'
                            ? 'bg-[#E6E9EE] text-white elix-accent border-[#D8D9DD]'
                            : 'bg-black/55 text-[#F5F5F7] border-[#D8D9DD]/70'
                        }`}
                        title="Your face on top of full video"
                      >
                        On top
                      </button>
                    </div>
                  ) : null}
                  {/* Add sound — center top pill (not on right rail) */}
                  <div
                    className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center pointer-events-none"
                    style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
                  >
                    <button
                      type="button"
                      onClick={openMusicModal}
                      className="elix-sound-pill pointer-events-auto flex items-center gap-1 h-6 px-2.5 rounded-full border border-[#D8D9DD]/40"
                      style={{ background: 'rgba(0, 0, 0, 0.55)' }}
                      title="Add sound"
                    >
                      <Music size={10} className="text-[#F5F5F7] shrink-0" strokeWidth={2} />
                      <span className="elix-silver-red-text text-[10px] font-semibold whitespace-nowrap">Add sound</span>
                    </button>
                  </div>
                  {/* Right side — same dark round fill as Add sound on every icon */}
                  <div className="absolute top-0 right-[5%] bottom-0 flex flex-col items-center gap-3 py-2 camera-right-rail" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
                    <button type="button" onClick={goFeed} className="camera-rail-disc flex items-center justify-center" title="Close">
                      <ChevronLeft size={14} className="camera-rail-icon" strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      className="camera-rail-disc flex items-center justify-center"
                      onClick={handleZoomOut}
                      title="Zoom out"
                      aria-label="Zoom out"
                    >
                      <ZoomOut size={14} className="camera-rail-icon" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="camera-rail-disc flex items-center justify-center"
                      onClick={handleZoomIn}
                      title="Zoom in"
                      aria-label="Zoom in"
                    >
                      <ZoomIn size={14} className="camera-rail-icon" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="camera-rail-disc flex items-center justify-center"
                      onClick={async () => {
                      try {
                        const currentStream = videoRef.current?.srcObject as MediaStream | null;
                        if (currentStream) {
                          currentStream.getTracks().forEach(t => t.stop());
                        }
                        const newFacing = cameraFacingRef.current === 'user' ? 'environment' : 'user';
                        const stream = await attachCameraStream(newFacing);
                        if (videoRef.current) {
                          videoRef.current.srcObject = stream;
                          await videoRef.current.play();
                        }
                        cameraFacingRef.current = newFacing;
                        setCameraFacing(newFacing);
                        setZoomLevel(1);
                      } catch { showToast('Cannot flip camera'); }
                    }}
                      title="Flip Camera"
                    >
                      <RefreshCw size={14} className="camera-rail-icon" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="camera-rail-disc flex items-center justify-center"
                      onClick={() => {
                        const next = cameraSpeed === 1 ? 0.5 : cameraSpeed === 0.5 ? 2 : 1;
                        setCameraSpeed(next);
                        if (videoRef.current) {
                          try { videoRef.current.playbackRate = next; } catch { /* ignore */ }
                        }
                        showToast(`Speed ${next}x`);
                      }}
                      title={`Speed ${cameraSpeed}x`}
                    >
                      <span className="text-[#F5F5F7] text-[9px] font-bold">{cameraSpeed}x</span>
                    </button>
                    <button
                      type="button"
                      className="camera-rail-disc flex items-center justify-center"
                      onClick={() => {
                        setBeautyOn((v) => {
                          const next = !v;
                          showToast(next ? 'Beauty on' : 'Beauty off');
                          return next;
                        });
                      }}
                      title={beautyOn ? 'Beauty on' : 'Beauty off'}
                    >
                      <Sparkles size={14} className={`camera-rail-icon ${beautyOn ? '' : 'opacity-50'}`} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="relative camera-rail-disc flex items-center justify-center"
                      onClick={() => {
                        const next = timerDelay === 0 ? 3 : timerDelay === 3 ? 10 : 0;
                        setTimerDelay(next);
                        showToast(next === 0 ? 'Timer off' : `Timer ${next}s`);
                      }}
                      title={timerDelay === 0 ? 'Timer off' : `Timer ${timerDelay}s`}
                    >
                      <Clock size={14} className="camera-rail-icon" strokeWidth={2} />
                      {timerDelay > 0 ? (
                        <span className="absolute -bottom-0.5 text-[8px] font-bold text-white">{timerDelay}</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="camera-rail-disc flex items-center justify-center"
                      onClick={async () => {
                        const stream = videoRef.current?.srcObject as MediaStream | null;
                        const track = stream?.getVideoTracks()?.[0];
                        if (!track) {
                          showToast('Flash unavailable');
                          return;
                        }
                        const next = !flashOn;
                        try {
                          await track.applyConstraints({
                            advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
                          });
                          setFlashOn(next);
                          showToast(next ? 'Flash on' : 'Flash off');
                        } catch {
                          showToast('Flash unavailable');
                        }
                      }}
                      title={flashOn ? 'Flash on' : 'Flash off'}
                    >
                      <Zap size={14} className="camera-rail-icon" strokeWidth={2} fill={flashOn ? '#FFFFFF' : 'none'} />
                    </button>
                    <button
                      type="button"
                      className="camera-rail-disc flex items-center justify-center"
                      onClick={goAiStudio}
                      title="AI Effects"
                    >
                      <Wand2 size={14} className="camera-rail-icon" strokeWidth={2} />
                    </button>
                  </div>

                  {/* Record Button (Play / Stop Logic) */}
                  <div className="absolute bottom-[10.5%] left-1/2 -translate-x-[calc(50%+20px)] flex items-center gap-4">
                      {/* Done Button (Visible only if we have chunks and are paused or recording) */}
                      {(chunks.length > 0 || isPaused) && (
                          <button
                            type="button"
                            className="w-9 h-9 royce-glow-disc flex items-center justify-center text-white animate-in fade-in zoom-in duration-300"
                            onClick={stopRecordingFinal}
                            title="Done"
                          >
                              <Check size={20} className="royce-icon-gold" strokeWidth={2.5} />
                          </button>
                      )}

                      <button 
                        className="flex items-center justify-center transition-all relative z-[2] active:scale-90"
                        onClick={toggleRecording}
                        title={isRecording ? 'Stop recording' : 'Start recording'}
                      >
                        <CaptureShutterButton size={67} recording={isRecording} />
                      </button>
                  </div>

                  {/* Upload — gallery, no circle disc */}
                  <button 
                    type="button"
                    className="absolute bottom-8 left-6 flex flex-col items-center gap-1 z-[1000] pointer-events-auto group"
                    onClick={handleFileUpload}
                    title="Upload from Gallery"
                  >
                    <span className="w-9 h-9 flex items-center justify-center group-active:scale-90 transition-transform" aria-hidden>
                      <ImageIcon size={18} className="camera-rail-icon" strokeWidth={2} />
                    </span>
                    <span className="text-[#F5F5F7] text-[10px] font-bold drop-shadow-[0_0_8px_rgba(139, 144, 152,0.9)]">Upload</span>
                  </button>

              </div>
          </div>
        </>
      )}

      {/* Above camera hit-layer + preview chrome — works in record and after capture */}
      {showSoundMix ? (
        <SoundMixPanel
          isOpen={showSoundMix}
          onClose={() => setShowSoundMix(false)}
          originalVolume={originalVolume}
          musicVolume={musicVolume}
          onOriginalVolumeChange={setOriginalVolume}
          onMusicVolumeChange={setMusicVolume}
          hasOriginalAudio={mediaKind === 'video'}
          hasAddedSound={Boolean(selectedTrack && selectedAudioId.startsWith('track_'))}
          addedSoundTitle={selectedTrack?.title}
          onChooseSound={openMusicModal}
          onClearSound={() => {
            setSelectedTrack(null);
            setSelectedAudioId('original');
            setMusicVolume(0.7);
          }}
        />
      ) : null}
      {showMusicModal ? (
        <SoundPickerPanel
          onClose={() => setShowMusicModal(false)}
          onPick={handleSelectMusic}
        />
      ) : null}
      </div>
    </div>
  );
}
