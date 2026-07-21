import React, { useRef, useEffect, useState } from 'react';
import { CaptureShutterButton } from '../components/CaptureShutterButton';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setCachedCameraStream } from '../lib/cameraStream';
import { RefreshCw, Zap, Clock, Music, Check, RotateCcw, ZoomIn, ZoomOut, Wand2, ChevronLeft, Image as ImageIcon, Type, Sparkles, X, LayoutGrid, Plus, Share2, Smile, Blend, ChevronDown } from 'lucide-react';
import { useVideoStore } from '../store/useVideoStore';
import { type SoundTrack } from '../lib/soundLibrary';
import SoundPickerPanel from '../components/SoundPickerPanel';
import { trackEvent } from '../lib/analytics';
import { useSettingsStore } from '../store/useSettingsStore';
import { videoUploadService } from '../lib/videoUpload';
import { api } from '../lib/apiClient';
import { useAuthStore } from '../store/useAuthStore';
import AIToolsPanel from '../components/AIToolsPanel';
import { takeCachedRecordedMedia } from '../lib/recordedMediaCache';
import { LIVE_BATTLE_VIDEO_HEIGHT } from '../lib/profileFrame';

export default function Upload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { muteAllSounds } = useSettingsStore();
  const authUser = useAuthStore((s) => s.user);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraFacingRef = useRef<'user' | 'environment'>('user');
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
  const [duetSourceVideoId, setDuetSourceVideoId] = useState<string | null>(null);
  const [duetSourceVideoUrl, setDuetSourceVideoUrl] = useState<string | null>(null);
  const duetSourceVideoRef = useRef<HTMLVideoElement>(null);

  const duetParam = searchParams.get('duet');
  const isStoryUpload = searchParams.get('type') === 'story';

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

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.25;
  const handleZoomIn = () => setZoomLevel((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));

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
       setSelectedTrack(track);
       setSelectedAudioId(`track_${track.id}`);
       setPostWithoutAudio(false);
       setShowMusicModal(false);
       trackEvent('upload_select_audio', { type: 'library', trackId: track.id, title: track.title });
       if (previewAudioRef.current) {
           previewAudioRef.current.pause();
       }
   };

  useEffect(() => {
    const cached = takeCachedRecordedMedia();
    if (!cached?.url) return;
    setRecordedVideoUrl(cached.url);
    setMediaKind(cached.kind === 'image' ? 'image' : 'video');
    if (cached.caption) setCaption(cached.caption);
    if (cached.hashtags) setHashtagsText(cached.hashtags);
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
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
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
  }, [recordedVideoUrl, cameraRetry]);

  const startRecording = () => {
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

  // Audio Preview Logic for Recorded Video
  useEffect(() => {
      const shouldPlayTrack =
        !!recordedVideoUrl &&
        !muteAllSounds &&
        !postWithoutAudio &&
        selectedAudioId.startsWith('track_');

      if (!shouldPlayTrack) {
        if (backgroundAudioRef.current) backgroundAudioRef.current.pause();
        return;
      }

      const track = selectedTrack;
      if (!track?.url) {
        if (backgroundAudioRef.current) backgroundAudioRef.current.pause();
        return;
      }

      if (backgroundAudioRef.current) {
        backgroundAudioRef.current.pause();
      }

      backgroundAudioRef.current = new Audio(track.url);
      const start = Math.max(0, track.clipStartSeconds);
      const end = Math.max(start, track.clipEndSeconds);
      backgroundAudioRef.current.loop = false;
      backgroundAudioRef.current.volume = Math.max(0, Math.min(1, musicVolume));
      backgroundAudioRef.current.currentTime = start;
      backgroundAudioRef.current.ontimeupdate = () => {
        const a = backgroundAudioRef.current;
        if (!a) return;
        if (end > start && a.currentTime >= end) {
          a.currentTime = start;
          a.play().catch(() => {});
        }
      };
      backgroundAudioRef.current.play().catch(() => {});

      return () => {
        if (backgroundAudioRef.current) backgroundAudioRef.current.pause();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muteAllSounds, postWithoutAudio, recordedVideoUrl, selectedAudioId, selectedTrack]);

  // Live-update the preview song volume while dragging the mix slider (no restart).
  useEffect(() => {
    if (backgroundAudioRef.current) {
      backgroundAudioRef.current.volume = Math.max(0, Math.min(1, musicVolume));
    }
  }, [musicVolume]);

  const handlePost = async () => {
      if (isPosting) return;
      if (!recordedVideoUrl) {
        showToast('No video selected');
        return;
      }

      const authUser = useAuthStore.getState().user;
      if (!authUser?.id) {
        navigate('/login', { state: { from: '/upload' } });
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
      const mimeType = uploadChunks[0].type || (mediaKind === 'image' ? 'image/jpeg' : 'video/webm');
      const blob = new Blob(uploadChunks, { type: mimeType });

      if (blob.size === 0) {
        showToast(isStoryUpload ? 'Story is empty. Record or choose a valid clip.' : 'Video is empty. Record or choose a valid video.');
        return;
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

      videoUploadService.onProgress(({ progress }) => setPostProgress(progress));
      setPostProgress(0);
      setPostError(null);
      setIsPosting(true);

      try {
        const normalizedCaption = caption.trim();
        const captionHashtags = Array.from(normalizedCaption.matchAll(/#([\p{L}0-9_]+)/gu)).map((m) => m[1]);
        const manualHashtags = hashtagsText
          .split(/[\s,]+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => (t.startsWith('#') ? t.slice(1) : t));

        const hashtags = Array.from(new Set([...captionHashtags, ...manualHashtags].map((h) => h.toLowerCase()))).slice(0, 20);

        let musicMeta;
        if (selectedTrack && selectedAudioId.startsWith('track_')) {
            const track = selectedTrack;
            musicMeta = {
                id: track.id,
                title: track.title,
                artist: track.artist,
                duration: formatClip(track.clipStartSeconds, track.clipEndSeconds),
                url: track.url,
                previewUrl: track.url,
                provider: track.provider,
                clipStartSeconds: track.clipStartSeconds,
                clipEndSeconds: track.clipEndSeconds,
                originalVolume: Math.max(0, Math.min(1, originalVolume)),
                musicVolume: Math.max(0, Math.min(1, musicVolume)),
            };
        }

        let videoId: string;
        if (isStoryUpload) {
          videoId = await videoUploadService.uploadStory(file, authUser.id, {
            mediaType: mediaKind === 'image' || mimeType.startsWith('image/') ? 'image' : 'video',
          });
        } else {
          videoId = await videoUploadService.uploadVideo(file, authUser.id, {
            description: normalizedCaption,
            hashtags: hashtags,
            isPrivate: false,
            music: musicMeta,
            duetWithVideoId: duetSourceVideoId || undefined,
          });
          await fetchVideos();
        }

        trackEvent('upload_post_success', { videoId, story: isStoryUpload });
        setRecordedVideoUrl(null);
        setChunks([]);
        setMediaKind('video');
        setIsPosting(false);
        setPostProgress(0);
        showToast(isStoryUpload ? 'Story posted!' : 'Video posted!');
        setTimeout(() => navigate(isStoryUpload ? '/feed' : '/feed'), 500);
        
      } catch (error) {
        const msg = error?.message || error?.error_description || String(error) || 'Unknown error';

        if (msg.includes('Invalid or expired session') || msg.includes('Not authenticated')) {
          const { signOut } = await import('../store/useAuthStore').then(m => ({ signOut: m.useAuthStore.getState().signOut }));
          await signOut();
          setPostError('Session expired. Please log in again.');
          setTimeout(() => navigate('/login'), 1500);
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
  };

  const handleFileUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = isStoryUpload ? 'video/*,image/*' : 'video/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        setRecordedVideoUrl(url);
        setMediaKind(file.type.startsWith('image/') ? 'image' : 'video');
        const blob = file.slice(0, file.size, file.type);
        setChunks([blob]);
      }
    };
    input.click();
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-[#111111] overflow-hidden flex justify-center">
      <div className={`w-full max-w-[480px] flex flex-col items-center h-full relative ${recordedVideoUrl ? 'justify-end' : 'justify-start'}`}>
      {toast && <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md text-white text-sm px-4 py-2 rounded-xl z-[9999]">{toast}</div>}
      {/* PREVIEW MODE */}
       {recordedVideoUrl ? (
         <>
           <div className="relative z-10 w-full mx-auto h-[100dvh] bg-[#111111] flex flex-col items-center justify-center">
              {duetSourceVideoUrl ? (
                <div
                  className="absolute top-0 left-0 right-0 w-full flex flex-row overflow-hidden"
                  style={{ height: LIVE_BATTLE_VIDEO_HEIGHT }}
                >
                  <div className="w-1/2 h-full flex-shrink-0 bg-black">
                    <video
                      src={duetSourceVideoUrl}
                      className="w-full h-full object-cover"
                      playsInline
                      muted
                      loop
                      autoPlay
                    />
                  </div>
                  <div className="w-1/2 h-full flex-shrink-0">
                    <video
                      ref={videoRef}
                      src={recordedVideoUrl}
                      className="w-full h-full object-cover z-0"
                      controls={false}
                      autoPlay
                      loop
                      muted
                      playsInline
                      style={{ filter: activeFilter !== 'none' || activeEnhance !== 'none' ? [activeFilter !== 'none' ? activeFilter : '', activeEnhance !== 'none' ? activeEnhance : ''].filter(Boolean).join(' ') : undefined }}
                    />
                  </div>
                </div>
              ) : mediaKind === 'image' ? (
              <img
                  src={recordedVideoUrl}
                  alt=""
                  className="w-full h-full object-cover z-0"
                  style={{ filter: activeFilter !== 'none' || activeEnhance !== 'none' ? [activeFilter !== 'none' ? activeFilter : '', activeEnhance !== 'none' ? activeEnhance : ''].filter(Boolean).join(' ') : undefined }}
                  draggable={false}
              />
              ) : (
              <video
                  ref={videoRef}
                  src={recordedVideoUrl}
                  className="w-full h-full object-cover z-0"
                  controls={false}
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{ filter: activeFilter !== 'none' || activeEnhance !== 'none' ? [activeFilter !== 'none' ? activeFilter : '', activeEnhance !== 'none' ? activeEnhance : ''].filter(Boolean).join(' ') : undefined }}
              />
              )}
               
               {/* Story compose = Instagram/TikTok style (Your Story / Next). Video post keeps caption form. */}
               {isStoryUpload ? (
                 <>
                   <div
                     className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 pointer-events-auto"
                     style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
                   >
                     <button
                       type="button"
                       onClick={() => navigate('/create')}
                       className="w-9 h-9 flex items-center justify-center"
                       title="Back"
                     >
                       <ChevronLeft size={28} className="text-white drop-shadow-md" strokeWidth={2.5} />
                     </button>
                     <button
                       type="button"
                       onClick={() => setShowMusicModal(true)}
                       className="flex items-center gap-1.5 max-w-[58%] px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md"
                       title={getSelectedLabel()}
                     >
                       <Music size={14} className="text-white shrink-0" />
                       <span className="text-white text-xs font-semibold truncate">
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
                           <X size={14} className="text-white/80" />
                         </span>
                       ) : null}
                     </button>
                     <div className="w-9 h-9" aria-hidden />
                   </div>

                   <div
                     className="absolute right-2 z-30 flex flex-col items-center gap-3.5 pointer-events-auto"
                     style={{ top: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}
                   >
                     {[
                       { Icon: Share2, title: 'Share', onClick: () => setShowAITools(true) },
                       { Icon: LayoutGrid, title: 'Layout', onClick: handleFileUpload },
                       { Icon: ImageIcon, title: 'Media', onClick: handleFileUpload },
                       { Icon: Music, title: 'Audio', onClick: () => setShowMusicModal(true) },
                       { Icon: Type, title: 'Text', onClick: () => setShowAITools(true) },
                       { Icon: Smile, title: 'Stickers', onClick: () => setShowAITools(true) },
                       { Icon: Sparkles, title: 'Effects', onClick: () => setShowAITools(true) },
                       { Icon: Blend, title: 'Filters', onClick: () => setShowAITools(true) },
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
                     <button type="button" onClick={handleDiscard} className="w-10 h-10 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center" title="More">
                       <ChevronDown size={20} className="text-white drop-shadow-md" strokeWidth={2} />
                     </button>
                   </div>

                   <div
                     className="absolute left-0 right-0 z-30 flex flex-col items-center gap-3 px-4 pointer-events-auto"
                     style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
                   >
                     <ChevronDown size={16} className="text-white/70" />
                     <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-black/45 backdrop-blur-md">
                       <button type="button" onClick={handleFileUpload} className="w-9 h-9 flex items-center justify-center" title="Gallery">
                         <LayoutGrid size={20} className="text-white" strokeWidth={2} />
                       </button>
                       <div className="w-12 h-12 rounded-xl overflow-hidden border-[3px] border-white flex-shrink-0 bg-black">
                         {mediaKind === 'image' ? (
                           <img src={recordedVideoUrl || undefined} alt="" className="w-full h-full object-cover" draggable={false} />
                         ) : (
                           <video src={recordedVideoUrl || undefined} className="w-full h-full object-cover" muted playsInline />
                         )}
                       </div>
                       <button type="button" onClick={handleFileUpload} className="w-9 h-9 flex items-center justify-center" title="Add">
                         <Plus size={22} className="text-white" strokeWidth={2.5} />
                       </button>
                     </div>

                     {postError ? (
                       <div className="w-full max-w-md px-3 py-2 rounded-lg bg-red-600/80 text-white text-xs text-center">
                         {postError}
                         <button type="button" onClick={() => setPostError(null)} className="ml-2 underline">×</button>
                       </div>
                     ) : null}
                     {isPosting ? (
                       <div className="w-full max-w-md px-1">
                         <div className="flex items-center justify-between text-xs text-white mb-1">
                           <span>{postProgress < 100 ? 'Uploading…' : 'Finalizing…'}</span>
                           <span>{postProgress}%</span>
                         </div>
                         <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                           <div className="h-full bg-white" style={{ width: `${postProgress}%` }} />
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
                         onClick={handlePost}
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
               {/* Preview Top Controls - centered sound icon; power lives in right vertical column */}
               <div className="absolute top-[2%] left-0 right-0 z-20 flex items-center justify-center pointer-events-auto px-4">
                 <button
                   onClick={() => setShowMusicModal(true)}
                   className="flex items-center justify-center p-1"
                   title={getSelectedLabel()}
                 >
                   <Music size={18} className="text-[#D4AF37] drop-shadow-[0_0_8px_rgba(255,215,0,1)]" />
                 </button>
               </div>

               <div className="absolute bottom-[22%] left-0 right-0 z-20 px-4 pointer-events-auto flex justify-center">
                 <div className="bg-black/60 backdrop-blur-md border border-[#C9A227]/30 rounded-xl p-2.5 space-y-2 w-[75%] max-w-[280px]">
                   <div>
                     <label className="text-[10px] text-[#D4AF37] font-semibold mb-1 block">Caption</label>
                     <textarea
                       value={caption}
                       onChange={(e) => setCaption(e.target.value)}
                       placeholder="Write something…"
                       className="w-full bg-white/10 text-white placeholder-white/40 border border-[#C9A227]/40 rounded-lg px-3 py-2 text-sm outline-none resize-none h-10 focus:h-24 focus:border-[#C9A227] transition-all duration-300"
                       aria-label="Caption"
                     />
                   </div>
                   <div>
                     <label className="text-[10px] text-[#D4AF37] font-semibold mb-1 block">Add Hashtags</label>
                     <input
                       value={hashtagsText}
                       onChange={(e) => setHashtagsText(e.target.value)}
                       placeholder="#fun #dance #viral"
                       className="w-full bg-white/10 text-white placeholder-white/40 border border-[#C9A227]/40 rounded-lg px-3 py-2 text-sm outline-none h-10 focus:border-[#C9A227] transition-all duration-300"
                       aria-label="Hashtags"
                     />
                   </div>
                   <div className="flex items-center justify-between py-1">
                     <div className="text-xs text-white font-semibold">Mute audio</div>
                     <button
                       type="button"
                       className={`w-11 h-6 rounded-full transition-colors ${
                         postWithoutAudio ? 'bg-[#D4AF37]' : 'bg-white/20'
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
                        className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                          postWithoutAudio ? 'translate-x-[22px]' : 'translate-x-[2px]'
                        }`}
                      />
                    </button>
                  </div>
                  {/* Audio mix — only when a song is added: balance the video's own sound vs the song */}
                  {selectedTrack && selectedAudioId.startsWith('track_') && !postWithoutAudio && (
                    <div className="space-y-1.5 pt-1 border-t border-white/10">
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <label className="text-[10px] text-[#D4AF37] font-semibold">Original sound</label>
                          <button
                            type="button"
                            onClick={() => setOriginalVolume((v) => (v === 0 ? 1 : 0))}
                            className="text-[9px] font-bold text-white/60 px-1.5 py-0.5 rounded bg-white/10"
                          >
                            {originalVolume === 0 ? 'Muted' : 'Mute'}
                          </button>
                        </div>
                        <input
                          type="range" min={0} max={100} value={Math.round(originalVolume * 100)}
                          onChange={(e) => setOriginalVolume(Number(e.target.value) / 100)}
                          className="w-full accent-[#D4AF37]"
                          aria-label="Original sound volume"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#D4AF37] font-semibold mb-0.5 block">Song volume</label>
                        <input
                          type="range" min={0} max={100} value={Math.round(musicVolume * 100)}
                          onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
                          className="w-full accent-[#D4AF37]"
                          aria-label="Song volume"
                        />
                      </div>
                    </div>
                  )}
                  {/* Removed the 'Post' button from inside here to avoid confusion. It is at the bottom. */}
                   {postError ? (
                     <div className="w-full px-3 py-2 rounded-lg bg-white/20/80 text-white text-xs">
                       {postError}
                       <button type="button" onClick={() => setPostError(null)} className="ml-2 underline">×</button>
                     </div>
                   ) : null}
                   {isPosting ? (
                     <div className="w-full">
                       <div className="flex items-center justify-between text-xs text-white mb-1">
                         <span>{postProgress < 100 ? 'Uploading…' : 'Finalizing…'}</span>
                         <span>{postProgress}%</span>
                       </div>
                       <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                         <div className="h-full bg-[#FFFFFF]" style={{ width: `${postProgress}%` }} />
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
                    <span className="text-[#D4AF37] text-[10px] font-bold drop-shadow-[0_0_8px_rgba(255,215,0,0.9)]">Upload</span>
                  </button>

                  {/* AI Studio (moved up) */}
                  <button
                    onClick={() => setShowAITools(true)}
                    className="absolute right-[5%] bottom-[26%] flex flex-col items-center gap-1 z-30 pointer-events-auto group"
                    title="AI Studio"
                  >
                    <span className="w-9 h-9 royce-glow-disc flex items-center justify-center group-hover:scale-110 transition-transform" aria-hidden>
                      <Wand2 size={18} className="royce-icon-gold" strokeWidth={2} />
                    </span>
                    <span className="text-[#D4AF37] font-bold text-[10px] drop-shadow-[0_0_8px_rgba(255,215,0,0.9)]">AI Studio</span>
                  </button>

                  {/* Retake + Post (moved down) */}
                  <div className="absolute bottom-[7%] right-[5%] flex flex-col items-center gap-4 z-30 pointer-events-auto">
                    <button
                      onClick={handleDiscard}
                      className="flex flex-col items-center gap-1 group"
                      title="Retake"
                    >
                      <span className="w-9 h-9 royce-glow-disc flex items-center justify-center group-hover:scale-110 transition-transform" aria-hidden>
                        <RotateCcw size={18} className="royce-icon-gold" strokeWidth={2} />
                      </span>
                      <span className="text-[#D4AF37] font-bold text-[10px] drop-shadow-[0_0_8px_rgba(255,215,0,0.9)]">Retake</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePost}
                      className="flex flex-col items-center gap-1 group disabled:opacity-60"
                      title={isStoryUpload ? 'Your Story' : 'Post'}
                      disabled={isPosting}
                    >
                      <span className="w-11 h-11 royce-glow-disc flex items-center justify-center group-hover:scale-110 active:scale-95 transition-transform" aria-hidden>
                        <Check size={18} className={`royce-icon-gold ${isPosting ? 'opacity-60' : ''}`} strokeWidth={2.5} />
                      </span>
                      <span className="text-[#D4AF37] font-bold text-[10px] drop-shadow-[0_0_8px_rgba(255,215,0,0.9)]">
                        {isPosting ? 'Posting…' : isStoryUpload ? 'Your Story' : 'Post'}
                      </span>
                    </button>
                  </div>
                 </>
               )}
               </div>

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
                onThumbnailSelect={() => { showToast('Thumbnail selected'); }}
                onVoiceEffectChange={() => { showToast('Voice effect applied'); }}
              />
         </>
       ) : (
        /* CAMERA MODE */
        <>
          {/* Container Principal */}
          <div className="relative z-10 w-full h-[100dvh] mb-0 pointer-events-none bg-[#111111] shadow-2xl overflow-hidden">
              {/* Duet layout: left = source video, right = camera */}
              {duetSourceVideoUrl ? (
                <div
                  className="absolute top-0 left-0 right-0 w-full flex flex-row overflow-hidden"
                  style={{ height: LIVE_BATTLE_VIDEO_HEIGHT }}
                >
                  <div className="w-1/2 h-full flex-shrink-0 bg-black">
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
                  <div className="w-1/2 h-full flex-shrink-0 relative">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`absolute inset-0 w-full h-full object-cover z-0 ${cameraError ? 'hidden' : ''}`}
                      style={{ transform: `scale(${zoomLevel}) scaleX(-1)`, transformOrigin: 'center center' }}
                    />
                  </div>
                </div>
              ) : (
                <>
              {/* Camera Preview Layer (non-duet) */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover z-0 ${cameraError ? 'hidden' : ''}`}
                style={{ transform: `scale(${zoomLevel}) scaleX(-1)`, transformOrigin: 'center center' }}
              />
                </>
              )}

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-[5] bg-[#111111] text-white p-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-[#C9A227]/20 flex items-center justify-center mb-3">
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
                    className="px-5 py-2.5 rounded-full bg-[#D4AF37] text-black text-sm font-semibold active:scale-95 transition-transform pointer-events-auto"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* Interactive Hitboxes Layer */}
              <div className="absolute inset-0 z-20 w-full h-full pointer-events-auto">
                  {/* Right side — every control uses the same round gold glow */}
                  <div className="absolute top-0 right-[5%] bottom-0 flex flex-col items-center gap-3 py-2" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
                    <button type="button" onClick={() => navigate('/feed')} className="w-9 h-9 royce-glow-disc flex items-center justify-center" title="Close">
                      <ChevronLeft size={18} className="royce-icon-gold" strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      className="w-9 h-9 royce-glow-disc flex items-center justify-center"
                      onClick={() => setShowMusicModal(true)}
                      title="Add sound"
                    >
                      <Music size={18} className="royce-icon-gold" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="w-9 h-9 royce-glow-disc flex items-center justify-center"
                      onClick={handleZoomOut}
                      title="Zoom out"
                      aria-label="Zoom out"
                    >
                      <ZoomOut size={18} className="royce-icon-gold" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="w-9 h-9 royce-glow-disc flex items-center justify-center"
                      onClick={handleZoomIn}
                      title="Zoom in"
                      aria-label="Zoom in"
                    >
                      <ZoomIn size={18} className="royce-icon-gold" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="w-9 h-9 royce-glow-disc flex items-center justify-center"
                      onClick={async () => {
                      try {
                        const currentStream = videoRef.current?.srcObject as MediaStream | null;
                        if (currentStream) {
                          currentStream.getTracks().forEach(t => t.stop());
                        }
                        const newFacing = cameraFacingRef.current === 'user' ? 'environment' : 'user';
                        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newFacing }, audio: true }).catch(() =>
                          navigator.mediaDevices.getUserMedia({ video: { facingMode: newFacing } })
                        );
                        if (videoRef.current) {
                          videoRef.current.srcObject = stream;
                          await videoRef.current.play();
                        }
                        cameraFacingRef.current = newFacing;
                      } catch { showToast('Cannot flip camera'); }
                    }}
                      title="Flip Camera"
                    >
                      <RefreshCw size={18} className="royce-icon-gold" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="w-9 h-9 royce-glow-disc flex items-center justify-center"
                      onClick={() => showToast('Speed: 1x')}
                      title="Speed"
                    >
                      <span className="text-[#D4AF37] font-bold text-xs">1x</span>
                    </button>
                    <button
                      type="button"
                      className="w-9 h-9 royce-glow-disc flex items-center justify-center"
                      onClick={() => showToast('Beauty: On')}
                      title="Beauty"
                    >
                      <Sparkles size={18} className="royce-icon-gold" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="w-9 h-9 royce-glow-disc flex items-center justify-center"
                      onClick={() => showToast('Timer: Off')}
                      title="Timer"
                    >
                      <Clock size={18} className="royce-icon-gold" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="w-9 h-9 royce-glow-disc flex items-center justify-center"
                      onClick={() => showToast('Flash: Off')}
                      title="Flash"
                    >
                      <Zap size={18} className="royce-icon-gold" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="w-9 h-9 royce-glow-disc flex items-center justify-center"
                      onClick={() => { if (!recordedVideoUrl) showToast('Record a video first'); }}
                      title="AI Effects"
                    >
                      <Wand2 size={18} className="royce-icon-gold" strokeWidth={2} />
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

                  {/* Upload — same round glow as right-side icons */}
                  <button 
                    type="button"
                    className="absolute bottom-8 left-6 flex flex-col items-center gap-1 z-[1000] pointer-events-auto group"
                    onClick={handleFileUpload}
                    title="Upload from Gallery"
                  >
                    <span className="royce-glow-disc w-9 h-9 group-active:scale-90 transition-transform" aria-hidden>
                      <ImageIcon size={18} className="royce-icon-gold" strokeWidth={2} />
                    </span>
                    <span className="text-[#D4AF37] text-[10px] font-bold drop-shadow-[0_0_8px_rgba(255,215,0,0.9)]">Upload</span>
                  </button>

              </div>
          </div>

          {/* Music Selection Modal */}
          {showMusicModal && (
              <div className="absolute inset-0 z-[200] bg-[#111111] flex flex-col pt-6 animate-in slide-in-from-bottom duration-300">
                  <div className="px-4 pb-2 grid grid-cols-2 gap-2 flex-shrink-0">
                        <button
                          type="button"
                          className={`px-3 py-3 rounded-xl border text-left ${
                            selectedAudioId === 'original' && !postWithoutAudio
                              ? 'bg-[#D4AF37] border-[#C9A227] text-black'
                              : 'bg-white border-transparent text-white'
                          }`}
                          onClick={() => {
                            setSelectedAudioId('original');
                            setSelectedTrack(null);
                            setPostWithoutAudio(false);
                            trackEvent('upload_select_audio', { type: 'original' });
                            setShowMusicModal(false);
                          }}
                        >
                          <div className="text-sm font-bold">Original Sound</div>
                          <div className={`text-[11px] ${selectedAudioId === 'original' && !postWithoutAudio ? 'text-black/70' : 'text-white/60'}`}>
                            Use the captured audio
                          </div>
                        </button>
                        <button
                          type="button"
                          className={`px-3 py-3 rounded-xl border text-left ${
                            postWithoutAudio || selectedAudioId === 'none'
                              ? 'bg-[#D4AF37] border-[#C9A227] text-black'
                              : 'bg-white border-transparent text-white'
                          }`}
                          onClick={() => {
                            setSelectedAudioId('none');
                            setSelectedTrack(null);
                            setPostWithoutAudio(true);
                            trackEvent('upload_select_audio', { type: 'none' });
                            setShowMusicModal(false);
                          }}
                        >
                          <div className="text-sm font-bold">No audio</div>
                          <div className={`text-[11px] ${postWithoutAudio || selectedAudioId === 'none' ? 'text-black/70' : 'text-white/60'}`}>
                            Publish muted audio
                          </div>
                        </button>
                      </div>
                  <SoundPickerPanel
                    layout="embedded"
                    onClose={() => setShowMusicModal(false)}
                    onPick={handleSelectMusic}
                  />
              </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
