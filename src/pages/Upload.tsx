import React, { useRef, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setCachedCameraStream } from '../lib/cameraStream';
import { RefreshCw, Zap, Clock, Music, Check, Play, Square, RotateCcw, ZoomIn, ZoomOut, Wand2 } from 'lucide-react';
import { useVideoStore } from '../store/useVideoStore';
import { type SoundTrack, fetchSoundTracksFromDatabase } from '../lib/soundLibrary';
import { trackEvent } from '../lib/analytics';
import { useSettingsStore } from '../store/useSettingsStore';
import { videoUploadService } from '../lib/videoUpload';
import { api } from '../lib/apiClient';
import { nativePrompt } from '../components/NativeDialog';
import { useAuthStore } from '../store/useAuthStore';
import AIToolsPanel from '../components/AIToolsPanel';

export default function Upload() {
  const navigate = useNavigate();
  const { muteAllSounds } = useSettingsStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraFacingRef = useRef<'user' | 'environment'>('user');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [chunks, setChunks] = useState<Blob[]>([]);
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
  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null); // Track currently playing preview
  const previewAudioRef = useRef<HTMLAudioElement | null>(null); // For list preview
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null); // For video background
  const [customTracks, setCustomTracks] = useState<SoundTrack[]>([]);
  const [builtInTracks, setBuiltInTracks] = useState<SoundTrack[]>([]);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showAITools, setShowAITools] = useState(false);
  const [activeFilter, setActiveFilter] = useState('none');
  const [activeEnhance, setActiveEnhance] = useState('none');
  const [duetSourceVideoId, setDuetSourceVideoId] = useState<string | null>(null);
  const [duetSourceVideoUrl, setDuetSourceVideoUrl] = useState<string | null>(null);
  const duetSourceVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    fetchSoundTracksFromDatabase().then(setBuiltInTracks);
  }, []);

  const [searchParams] = useSearchParams();
  const duetParam = searchParams.get('duet');

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

  const { addVideo, fetchVideos } = useVideoStore();

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.25;
  const handleZoomIn = () => setZoomLevel((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));

  const mapRowToVideo = (row: any, profile: any) => {
    const displayName = profile?.display_name || profile?.username || 'Creator';
    const uname = profile?.username || profile?.display_name || 'creator';
    return {
    id: row.id,
    url: row.url,
    thumbnail: row.thumbnail_url || '',
    duration: '0:15',
    user: {
      id: profile?.user_id ?? profile?.id ?? row.user_id ?? 'unknown',
      username: uname,
      name: displayName,
      avatar: profile?.avatar_url ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}`,
      level: 1,
      isVerified: !!profile?.is_creator,
      followers: profile?.followers_count || 0,
      following: profile?.following_count || 0
    },
    description: row.description ?? '',
    hashtags: (() => {
      if (row.hashtags && Array.isArray(row.hashtags)) return row.hashtags;
      const text = row.description || '';
      const matches = text.match(/#[\w\u00C0-\u024F]+/g);
      return matches ? matches.map((t: string) => t.slice(1)) : [];
    })(),
    music: { id: 'original', title: 'Original Sound', artist: displayName, duration: '0:15' },
    stats: { views: row.views ?? 0, likes: row.likes ?? 0, comments: 0, shares: 0, saves: 0 },
    createdAt: row.created_at,
    location: row.location || undefined,
    isLiked: false,
    isSaved: false,
    isFollowing: false,
    comments: [],
    quality: 'auto' as const,
    privacy: 'public' as const,
    duetWithVideoId: row.duet_with_video_id || undefined
  };
  };

  type UploadMusic = {
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

  const musicTracks = React.useMemo(() => [...customTracks, ...builtInTracks], [customTracks, builtInTracks]);

  const getSelectedLabel = () => {
    if (postWithoutAudio || selectedAudioId === 'none') return 'No audio';
    if (selectedAudioId === 'original') return 'Original Sound';
    if (selectedAudioId.startsWith('track_')) {
      const raw = selectedAudioId.slice('track_'.length);
      const id = Number(raw);
      const t = musicTracks.find((x) => x.id === id);
      return t ? t.title : 'Add Sound';
    }
    return 'Add Sound';
  };

   const handleSelectMusic = (track: SoundTrack) => {
       setSelectedAudioId(`track_${track.id}`);
       setPostWithoutAudio(false);
       setShowMusicModal(false);
       trackEvent('upload_select_audio', { type: 'library', trackId: track.id, title: track.title });
       if (previewAudioRef.current) {
           previewAudioRef.current.pause();
           setPlayingTrackId(null);
       }
   };
 
   const togglePreview = (e: React.MouseEvent, track: SoundTrack) => {
       e.stopPropagation(); // Don't select, just play

       if (muteAllSounds) {
           trackEvent('upload_preview_audio_blocked_global_mute', { trackId: track.id });
           return;
       }
       
       if (playingTrackId === track.id) {
           // Stop
           if (previewAudioRef.current) {
               previewAudioRef.current.pause();
               setPlayingTrackId(null);
           }
       } else {
           // Play new
           if (previewAudioRef.current) {
               previewAudioRef.current.pause();
           }
           // Create new audio or reuse
           if (track.url) {
               previewAudioRef.current = new Audio(track.url);
               const start = Math.max(0, track.clipStartSeconds);
               const end = Math.max(start, track.clipEndSeconds);
               previewAudioRef.current.volume = 1.0;
               previewAudioRef.current.currentTime = start;
               previewAudioRef.current.play()
                   .then(() => {})
                   .catch(() => {
                       showToast("Could not play audio preview.");
                   });
               setPlayingTrackId(track.id);
               
               // Auto stop at end
               previewAudioRef.current.onended = () => setPlayingTrackId(null);
               previewAudioRef.current.ontimeupdate = () => {
                 const a = previewAudioRef.current;
                 if (!a) return;
                 if (end > start && a.currentTime >= end) {
                   a.pause();
                   a.currentTime = start;
                   setPlayingTrackId(null);
                 }
               };
           } else {
               // No URL (No Music)
               setPlayingTrackId(null);
           }
       }
   };

  useEffect(() => {
    if (!recordedVideoUrl) {
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
          setCameraError('Camera returned no video. Try a different browser.');
          return;
        }

        if (!cancelled && videoRef.current) {
          videoRef.current.srcObject = stream;
          setCachedCameraStream(stream);
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
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      
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
        const blob = new Blob(chunks, { type: 'video/webm' });
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

      const raw = selectedAudioId.slice('track_'.length);
      const id = Number(raw);
      const track = musicTracks.find((t) => t.id === id);
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
      backgroundAudioRef.current.volume = 0.5;
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
  }, [muteAllSounds, postWithoutAudio, recordedVideoUrl, selectedAudioId, musicTracks]);

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

      // Must have video data to upload
      if (!chunks.length) {
        showToast('No video to upload. Record or choose a video first.');
        return;
      }

      // Use the MIME type from the first chunk (which we set correctly in handleFileUpload or recording)
      const mimeType = chunks[0].type || 'video/webm';
      const blob = new Blob(chunks, { type: mimeType });

      if (blob.size === 0) {
        showToast('Video is empty. Record or choose a valid video.');
        return;
      }

      // Use correct extension based on MIME type
      let ext = 'webm';
      if (mimeType.includes('mp4')) ext = 'mp4';
      if (mimeType.includes('quicktime')) ext = 'mov';

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
        if (selectedAudioId.startsWith('track_')) {
            const id = Number(selectedAudioId.replace('track_', ''));
            const track = musicTracks.find(t => t.id === id);
            if (track) {
                musicMeta = {
                    id: String(track.id),
                    title: track.title,
                    artist: track.artist,
                    duration: formatClip(track.clipStartSeconds, track.clipEndSeconds),
                    url: track.url
                };
            }
        }

        const videoId = await videoUploadService.uploadVideo(file, authUser.id, {
          description: normalizedCaption,
          hashtags: hashtags,
          isPrivate: false,
          music: musicMeta,
          duetWithVideoId: duetSourceVideoId || undefined,
        });

        // Refresh feed so the new video shows up on For You
        await fetchVideos();

        trackEvent('upload_post_success', { videoId });
        setRecordedVideoUrl(null);
        setChunks([]);
        setIsPosting(false);
        setPostProgress(0);
        showToast('Video posted!');
        setTimeout(() => navigate('/feed'), 500);
        
      } catch (error: any) {
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
  };

  const handleFileUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        setRecordedVideoUrl(url);
        // Also set chunks so we can upload this file
        // NOTE: For file upload, we might need to handle it differently in handlePost
        // Currently handlePost assumes 'chunks' has the data. 
        // Let's populate chunks with the file blob to reuse logic
        const blob = file.slice(0, file.size, file.type);
        setChunks([blob]);
      }
    };
    input.click();
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-[#13151A] overflow-hidden flex justify-center">
      <div className={`w-full max-w-[480px] flex flex-col items-center h-full relative ${recordedVideoUrl ? 'justify-end' : 'justify-start'}`}>
      {toast && <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md text-white text-sm px-4 py-2 rounded-xl z-[9999]">{toast}</div>}
      {/* PREVIEW MODE */}
       {recordedVideoUrl ? (
         <>
           <div className="relative z-10 w-full mx-auto h-[100dvh] bg-[#13151A] flex flex-col items-center justify-center">
              {duetSourceVideoUrl ? (
                <div className="absolute inset-0 flex flex-row">
                  <div className="w-1/2 h-full flex-shrink-0 bg-black">
                    <video
                      src={duetSourceVideoUrl}
                      className="w-full h-full object-contain"
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
               
               {/* Preview Top Controls - centered sound icon; power lives in right vertical column */}
               <div className="absolute top-[2%] left-0 right-0 z-20 flex items-center justify-center pointer-events-auto px-4">
                 <button
                   onClick={() => setShowMusicModal(true)}
                   className="flex items-center justify-center p-1"
                   title={getSelectedLabel()}
                 >
                   <Music size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)]" />
                 </button>
               </div>

               <div className="absolute bottom-[22%] left-0 right-0 z-20 px-4 pointer-events-auto flex justify-center">
                 <div className="bg-black/60 backdrop-blur-md border border-[#FFD700]/30 rounded-xl p-2.5 space-y-2 w-[75%] max-w-[280px]">
                   <div>
                     <label className="text-[10px] text-[#FFD700] font-semibold mb-1 block">Caption</label>
                     <textarea
                       value={caption}
                       onChange={(e) => setCaption(e.target.value)}
                       placeholder="Write something…"
                       className="w-full bg-white/10 text-white placeholder-white/40 border border-[#FFD700]/40 rounded-lg px-3 py-2 text-sm outline-none resize-none h-10 focus:h-24 focus:border-[#FFD700] transition-all duration-300"
                       aria-label="Caption"
                     />
                   </div>
                   <div>
                     <label className="text-[10px] text-[#FFD700] font-semibold mb-1 block">Add Hashtags</label>
                     <input
                       value={hashtagsText}
                       onChange={(e) => setHashtagsText(e.target.value)}
                       placeholder="#fun #dance #viral"
                       className="w-full bg-white/10 text-white placeholder-white/40 border border-[#FFD700]/40 rounded-lg px-3 py-2 text-sm outline-none h-10 focus:border-[#FFD700] transition-all duration-300"
                       aria-label="Hashtags"
                     />
                   </div>
                   <div className="flex items-center justify-between py-1">
                     <div className="text-xs text-white font-semibold">Mute audio</div>
                     <button
                       type="button"
                       className={`w-11 h-6 rounded-full transition-colors ${
                         postWithoutAudio ? 'bg-[#FFD700]' : 'bg-white/20'
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
                   {/* Removed the 'Post' button from inside here to avoid confusion. It is at the bottom. */}
                   {postError ? (
                     <div className="w-full px-3 py-2 rounded-lg bg-red-500/80 text-white text-xs">
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
                         <div className="h-full bg-[#FFD700]" style={{ width: `${postProgress}%` }} />
                       </div>
                     </div>
                   ) : null}
                 </div>
               </div>

                  {/* Upload - small black button (match camera mode) */}
                  <button
                    onClick={handleFileUpload}
                    className="absolute bottom-[7%] left-[5%] flex flex-col items-center gap-1 z-30 pointer-events-auto group"
                    title="Upload"
                  >
                    <div className="w-9 h-9 bg-[#13151A] rounded-full flex items-center justify-center text-white border border-[#C9A96E]/30 relative group-active:scale-90 transition-transform">
                      <div className="w-4 h-4 border-2 border-white rounded-sm relative overflow-hidden z-[2]">
                        <div className="absolute top-0.5 right-0.5 w-1 h-1 bg-white rounded-full"></div>
                      </div>
                    </div>
                    <span className="text-white text-[10px] font-bold shadow-black drop-shadow-md">Upload</span>
                  </button>

                  {/* AI Studio (moved up) */}
                  <button
                    onClick={() => setShowAITools(true)}
                    className="absolute right-[5%] bottom-[26%] flex flex-col items-center gap-1 z-30 pointer-events-auto group"
                    title="AI Studio"
                  >
                    <div className="flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Wand2 size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                    </div>
                    <span className="text-white font-bold text-[10px] shadow-black drop-shadow-md">AI Studio</span>
                  </button>

                  {/* Retake + Post (moved down) */}
                  <div className="absolute bottom-[7%] right-[5%] flex flex-col items-center gap-4 z-30 pointer-events-auto">
                    <button
                      onClick={handleDiscard}
                      className="flex flex-col items-center gap-1 group"
                      title="Retake"
                    >
                      <div className="flex items-center justify-center group-hover:scale-110 transition-transform">
                        <RotateCcw size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                      </div>
                      <span className="text-white font-bold text-[10px] shadow-black drop-shadow-md">Retake</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePost}
                      className="flex flex-col items-center gap-1 group disabled:opacity-60"
                      title="Post"
                      disabled={isPosting}
                    >
                      {/* Red circle behind Post icon */}
                      <div className="w-11 h-11 rounded-full bg-red-600 border-[3px] border-white flex items-center justify-center shadow-xl group-hover:scale-110 active:scale-95 transition-transform">
                        <Check size={18} className={`${isPosting ? 'text-white/60' : 'text-white'} drop-shadow-[0_0_8px_rgba(0,0,0,0.6)]`} />
                      </div>
                      <span className="text-white font-bold text-[10px] shadow-black drop-shadow-md">{isPosting ? 'Posting…' : 'Post'}</span>
                    </button>
                  </div>
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
          <div className="relative z-10 w-full h-[100dvh] mb-0 pointer-events-none bg-[#13151A] shadow-2xl overflow-hidden">
              {/* Duet layout: left = source video, right = camera */}
              {duetSourceVideoUrl ? (
                <div className="absolute inset-0 flex flex-row">
                  <div className="w-1/2 h-full flex-shrink-0 bg-black">
                    <video
                      ref={duetSourceVideoRef}
                      src={duetSourceVideoUrl}
                      className="w-full h-full object-contain"
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
                <div className="absolute inset-0 flex flex-col items-center justify-center z-[5] bg-[#13151A] text-white p-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-[#C9A96E]/20 flex items-center justify-center mb-3">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9.34"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/></svg>
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
                    className="px-5 py-2.5 rounded-full bg-[#C9A96E] text-black text-sm font-semibold active:scale-95 transition-transform pointer-events-auto"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* Interactive Hitboxes Layer */}
              <div className="absolute inset-0 z-20 w-full h-full pointer-events-auto">
                  {/* Right side - all controls except Upload (no round containers) */}
                  <div className="absolute top-0 right-[5%] bottom-0 flex flex-col items-center gap-4 py-2" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
                    <button onClick={() => navigate('/feed')} className="flex items-center justify-center relative" title="Close">
                      <img src="/Icons/Gold power buton.png" alt="Close" className="w-5 h-5" />
                    </button>
                    <button 
                      className="flex items-center justify-center relative"
                      onClick={() => setShowMusicModal(true)}
                      title="Add sound"
                    >
                      <Music size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                    </button>
                    <button 
                      className="flex items-center justify-center relative"
                      onClick={handleZoomOut}
                      title="Zoom out"
                      aria-label="Zoom out"
                    >
                      <ZoomOut size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                    </button>
                    <button 
                      className="flex items-center justify-center relative"
                      onClick={handleZoomIn}
                      title="Zoom in"
                      aria-label="Zoom in"
                    >
                      <ZoomIn size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                    </button>
                    <button 
                      className="flex items-center justify-center relative"
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
                      <RefreshCw size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                    </button>
                    <button 
                      className="flex items-center justify-center relative"
                      onClick={() => showToast('Speed: 1x')}
                      title="Speed"
                    >
                      <span className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] font-bold text-xs">1x</span>
                    </button>
                    <button 
                      className="flex items-center justify-center relative"
                      onClick={() => showToast('Beauty: On')}
                      title="Beauty"
                    >
                      <span className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] text-xs">✨</span>
                    </button>
                    <button 
                      className="flex items-center justify-center relative"
                      onClick={() => showToast('Timer: Off')}
                      title="Timer"
                    >
                      <Clock size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                    </button>
                    <button 
                      className="flex items-center justify-center relative"
                      onClick={() => showToast('Flash: Off')}
                      title="Flash"
                    >
                      <Zap size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                    </button>
                    <button 
                      className="flex items-center justify-center relative"
                      onClick={() => { if (!recordedVideoUrl) showToast('Record a video first'); }}
                      title="AI Effects"
                    >
                      <Wand2 size={18} className="text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,1)] drop-shadow-[0_0_16px_rgba(255,215,0,0.6)]" />
                    </button>
                  </div>

                  {/* Record Button (Play / Stop Logic) */}
                  <div className="absolute bottom-[10.5%] left-1/2 -translate-x-[calc(50%+20px)] flex items-center gap-4">
                      {/* Done Button (Visible only if we have chunks and are paused or recording) */}
                      {(chunks.length > 0 || isPaused) && (
                          <button 
                            className="w-9 h-9 bg-red-600 rounded-full flex items-center justify-center text-white border-2 border-white animate-in fade-in zoom-in duration-300 absolute -right-44 relative"
                            onClick={stopRecordingFinal}
                            title="Done"
                          >
                              <Check size={24} className="relative z-[2]" />
                          </button>
                      )}

                      <button 
                        className={`w-[4.2rem] h-[4.2rem] rounded-full flex items-center justify-center transition-all relative z-[2] border-[2px] border-white ${
                          isRecording ? 'bg-red-600' : 'bg-white hover:bg-red-600/50'
                        }`}
                        onClick={toggleRecording}
                        title={isRecording ? 'Stop recording' : 'Start recording'}
                      >
                        {isRecording ? (
                          <Square className="text-white fill-white w-6 h-6 relative z-[2]" />
                        ) : (
                          <div className="w-[3.2rem] h-[3.2rem] bg-red-600 rounded-full flex items-center justify-center relative z-[2]">
                            {/* Inner circle */}
                          </div>
                        )}
                      </button>
                  </div>

                  {/* 10. Upload - left side (original small button) */}
                  <button 
                    className="absolute bottom-8 left-6 flex flex-col items-center gap-1 z-[1000] pointer-events-auto group"
                    onClick={handleFileUpload}
                    title="Upload from Gallery"
                  >
                    <div className="w-9 h-9 bg-[#13151A] rounded-full flex items-center justify-center text-white border border-[#C9A96E]/30 relative">
                      <div className="w-4 h-4 border-2 border-white rounded-sm relative overflow-hidden z-[2]">
                        <div className="absolute top-0.5 right-0.5 w-1 h-1 bg-white rounded-full"></div>
                      </div>
                    </div>
                    <span className="text-white text-[10px] font-bold shadow-black drop-shadow-md">Upload</span>
                  </button>

              </div>
          </div>

          {/* Music Selection Modal */}
          {showMusicModal && (
              <div className="absolute inset-0 z-[200] bg-[#13151A] flex flex-col pt-10 px-4 animate-in slide-in-from-bottom duration-300">
                  <div className="flex items-center justify-between mb-6">
                      <h2 className="text-white text-xl font-bold">Select Sound</h2>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            const url = await nativePrompt('Paste audio URL (mp3/ogg):', '', 'Add Sound');
                            if (!url) return;
                            const title = (await nativePrompt('Sound name:', 'Custom sound', 'Sound Name')) ?? 'Custom sound';
                            const next: SoundTrack = {
                              id: Date.now(),
                              title: title.trim() || 'Custom sound',
                              artist: 'You',
                              duration: 'custom',
                              url: url.trim(),
                              license: 'Custom (you must own rights)',
                              source: 'Custom URL',
                              clipStartSeconds: 0,
                              clipEndSeconds: 180,
                            };
                            setCustomTracks((prev) => [next, ...prev]);
                          }}
                          className="px-3 py-1.5 rounded-full border border-transparent text-white/80 text-xs font-semibold hover:brightness-125"
                        >
                          Add URL
                        </button>
                        <button 
                          onClick={() => setShowMusicModal(false)}
                          className="p-2"
                        >
                            <img src="/Icons/Gold power buton.png" alt="Close" className="w-5 h-5" />
                        </button>
                      </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pb-10">
                      <div className="grid grid-cols-2 gap-2 pb-2">
                        <button
                          type="button"
                          className={`px-3 py-3 rounded-xl border text-left ${
                            selectedAudioId === 'original' && !postWithoutAudio
                              ? 'bg-[#C9A96E] border-[#C9A96E] text-black'
                              : 'bg-white border-transparent text-white'
                          }`}
                          onClick={() => {
                            setSelectedAudioId('original');
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
                              ? 'bg-[#C9A96E] border-[#C9A96E] text-black'
                              : 'bg-white border-transparent text-white'
                          }`}
                          onClick={() => {
                            setSelectedAudioId('none');
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

                      {musicTracks.map((track) => (
                          <div 
                            key={track.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-white hover:brightness-125 cursor-pointer border border-transparent"
                            onClick={() => handleSelectMusic(track)}
                          >
                              <div className="flex items-center gap-3">
                                  <button 
                                    className="w-10 h-10 bg-gradient-to-br from-pink-500 to-purple-500 rounded flex items-center justify-center hover:scale-105 transition-transform"
                                    onClick={(e) => togglePreview(e, track)}
                                  >
                                      {playingTrackId === track.id ? (
                                          <Square size={16} className="text-white fill-white" />
                                      ) : (
                                          <Play size={16} className="text-white fill-[#C9A96E]" />
                                      )}
                                  </button>
                                  <div>
                                      <h3 className="text-white font-bold text-sm">{track.title}</h3>
                                      <p className="text-white/60 text-xs">{track.artist} • {formatClip(track.clipStartSeconds, track.clipEndSeconds)}</p>
                                      <p className="text-white/40 text-[11px]">{track.license}</p>
                                  </div>
                              </div>
                              {selectedAudioId === `track_${track.id}` && !postWithoutAudio && (
                                <Check className="text-white" size={20} />
                              )}
                          </div>
                      ))}
                  </div>
              </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
