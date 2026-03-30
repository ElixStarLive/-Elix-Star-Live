import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Heart,
  Music,
  Settings2,
  Share2,
  Bookmark,
  Flag,
  UserPlus,
  UserMinus,
  Download,
  QrCode,
  Trash2,
  TrendingUp,
  Copy,
  Users2,
  Play,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useVideoStore } from '../store/useVideoStore';
import { useAuthStore } from '../store/useAuthStore';
import { showToast } from '../lib/toast';
import { useSettingsStore } from '../store/useSettingsStore';
import { trackEvent } from '../lib/analytics';
import EnhancedCommentsModal from './EnhancedCommentsModal';
import EnhancedLikesModal from './EnhancedLikesModal';
import ShareModal from './ShareModal';
import UserProfileModal from './UserProfileModal';
import ReportModal from './ReportModal';
import PromotePanel from './PromotePanel';
import { LevelBadge } from './LevelBadge';
import { api } from '../lib/apiClient';
import { nativeConfirm } from './NativeDialog';
import { getVideoPosterUrl } from '../lib/bunnyStorage';
import { storyRingInnerPx, PROFILE_RING_IMAGE_LIFT_MM } from '../lib/profileFrame';

const VIDEO_SIDEBAR_AVATAR = 48;
const VIDEO_SIDEBAR_AVATAR_INNER = storyRingInnerPx(VIDEO_SIDEBAR_AVATAR);

interface EnhancedVideoPlayerProps {
  videoId: string;
  isActive: boolean;
  onVideoEnd?: () => void;
  onProgress?: (progress: number) => void;
  /** Full viewport column: video bleeds behind BottomNav; chrome sits above the bar (e.g. /video/:id). */
  edgeToBottomNav?: boolean;
}

// Premium Sidebar Button Component
export const PremiumSidebarButton = ({ 
  onClick, 
  isActive = false, 
  iconSrc,
  icon: Icon,
  label, 
  className = ""
}: { 
  onClick: () => void; 
  isActive?: boolean; 
  iconSrc?: string;
  icon?: React.ElementType;
  label?: string;
  className?: string;
}) => (
  <div className={`flex flex-col items-center ${className}`}>
    <button 
      onClick={onClick}
      className="relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90"
      style={{
        background: 'linear-gradient(145deg, rgba(30,30,30,0.95) 0%, rgba(10,10,10,0.98) 100%)',
        boxShadow: isActive 
          ? '0 0 20px rgba(201, 169, 110, 0.5), inset 0 1px 1px rgba(255,255,255,0.1)' 
          : '0 4px 15px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.05)',
        border: '2px solid',
        borderColor: isActive ? '#C9A96E' : 'rgba(201, 169, 110, 0.4)',
      }}
    >
      {/* Inner glow */}
      <div 
        className="absolute inset-[2px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.08) 0%, transparent 60%)',
        }}
      />
      
      {/* Light reflection */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-6 h-1 bg-gradient-to-r from-transparent via-[#C9A96E]/30 to-transparent rounded-full" />
      
      {iconSrc ? (
        <img 
          src={iconSrc} 
          alt="" 
          className={`w-7 h-7 object-contain transition-all duration-200 ${isActive ? 'brightness-125' : 'opacity-80'}`}
          style={{ filter: isActive ? 'drop-shadow(0 0 8px rgba(201, 169, 110, 0.6))' : 'none' }}
        />
      ) : Icon && (
        <Icon 
          className={`w-7 h-7 stroke-[1.5px] transition-all duration-200 ${
            isActive 
              ? 'text-white drop-shadow-[0_0_8px_rgba(201, 169, 110, 0.6)]' 
              : 'text-white/70'
          }`}
          style={isActive ? { fill: '#C9A96E' } : { fill: 'transparent' }}
        />
      )}
    </button>
    {label && (
      <span 
        className={`text-xs font-semibold mt-1.5 cursor-pointer hover:underline transition-colors ${
          isActive ? 'text-white' : 'text-white/70'
        }`}
        style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
        onClick={onClick}
      >
        {label}
      </span>
    )}
  </div>
);

// Legacy wrapper for compatibility
// const SidebarButton = PremiumSidebarButton;

export default function EnhancedVideoPlayer({ 
  videoId, 
  isActive, 
  onVideoEnd,
  onProgress,
  edgeToBottomNav = false,
}: EnhancedVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const duetOriginalRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressTrackRef = useRef<HTMLDivElement>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const retryingRef = useRef(false);
  const shouldPlayRef = useRef(false);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const volume = 0.5;
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showLikes, setShowLikes] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showPromotePanel, setShowPromotePanel] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [showQrCodeInMore, setShowQrCodeInMore] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const retryCountRef = useRef(0);
  const [isDoubleClick, setIsDoubleClick] = useState(false);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [duetOriginalUrl, setDuetOriginalUrl] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const navigate = useNavigate();
  const { muteAllSounds } = useSettingsStore();
  const { 
    videos, 
    toggleLike, 
    toggleSave, 
    toggleFollow, 
    incrementViews,
    deleteVideo,
  } = useVideoStore();
  const getVideoById = useVideoStore((s) => s.getVideoById);
  const authUserId = useAuthStore((s) => s.user?.id ?? null);
  
  const video = getVideoById(videoId);
  const originalVideo = video?.duetWithVideoId ? getVideoById(video.duetWithVideoId) : undefined;
  const effectiveMuted = muteAllSounds || isMuted;
  const duetOriginalSrc = originalVideo?.url ?? duetOriginalUrl ?? '';
  const isDuetLayout = !!(video?.duetWithVideoId && (originalVideo || duetOriginalUrl));

  // When duet original is not in store, fetch its URL for side-by-side playback
  useEffect(() => {
    if (!video?.duetWithVideoId || originalVideo) {
      setDuetOriginalUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await api.videos.get(video.duetWithVideoId!);
      if (!cancelled && data?.url) setDuetOriginalUrl(data.url);
    })();
    return () => { cancelled = true; };
  }, [video?.duetWithVideoId, originalVideo]);

  const seekAllTo = useCallback(
    (seconds: number) => {
      const main = videoRef.current;
      const d =
        main && Number.isFinite(main.duration) && main.duration > 0
          ? main.duration
          : duration;
      if (!main || !Number.isFinite(d) || d <= 0) return;
      const t = Math.max(0, Math.min(d, seconds));
      main.currentTime = t;
      if (isDuetLayout && duetOriginalRef.current) {
        const d2 = duetOriginalRef.current.duration;
        duetOriginalRef.current.currentTime =
          Number.isFinite(d2) && d2 > 0 ? Math.min(t, d2) : t;
      }
    },
    [duration, isDuetLayout],
  );

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = progressTrackRef.current;
      const main = videoRef.current;
      const d =
        main && Number.isFinite(main.duration) && main.duration > 0
          ? main.duration
          : duration;
      if (!el || !Number.isFinite(d) || d <= 0) return;
      const rect = el.getBoundingClientRect();
      const pct =
        rect.width > 0
          ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
          : 0;
      seekAllTo(pct * d);
    },
    [duration, seekAllTo],
  );

  const skipBy = useCallback(
    (deltaSec: number) => {
      const main = videoRef.current;
      if (!main) return;
      seekAllTo(main.currentTime + deltaSec);
    },
    [seekAllTo],
  );

  useEffect(() => {
    if (!scrubbing) return;
    const move = (e: PointerEvent) => seekFromClientX(e.clientX);
    const end = () => setScrubbing(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [scrubbing, seekFromClientX]);
  
  // Video playback controls
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      videoRef.current?.pause();
      duetOriginalRef.current?.pause();
      audioRef.current?.pause();
    } else {
      videoRef.current?.play().catch(() => {});
      if (isDuetLayout && duetOriginalSrc) duetOriginalRef.current?.play().catch(() => {});
      if (!effectiveMuted && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
    }
    setIsPlaying(prev => !prev);
  }, [effectiveMuted, isDuetLayout, isPlaying, duetOriginalSrc]);

  const toggleMute = () => {
    if (muteAllSounds) {
      trackEvent('video_toggle_mute_blocked_global', { videoId });
      return;
    }
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
      if (!newMuted) {
        videoRef.current.volume = volume;
      }
    }

    if (audioRef.current) {
      const newMuted = !isMuted;
      audioRef.current.muted = newMuted;
      audioRef.current.volume = volume;
      if (newMuted) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(() => {});
      }
    }

    trackEvent('video_toggle_mute', { videoId, muted: !isMuted });
  };

  // Video event handlers
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const handleTimeUpdate = () => {
      setCurrentTime(videoElement.currentTime);
      onProgress?.(videoElement.currentTime / videoElement.duration);
    };

    const handleLoadedMetadata = () => {
      setDuration(videoElement.duration);
      setVideoSize({ w: videoElement.videoWidth, h: videoElement.videoHeight });
    };

    const handleEnded = () => {
      setIsPlaying(false);
      onVideoEnd?.();
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoElement.addEventListener('ended', handleEnded);
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);

    return () => {
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.removeEventListener('ended', handleEnded);
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
    };
  }, [onProgress, onVideoEnd]);

  // Auto-play based on visibility — try with sound first; if blocked (e.g. iOS), fall back to muted
  useEffect(() => {
    /** Hard-stop helper — mutes and pauses every media element this player owns */
    const stopAll = () => {
      shouldPlayRef.current = false;
      const v = videoRef.current;
      if (v) { try { v.pause(); v.muted = true; } catch { void 0; } }
      const a = audioRef.current;
      if (a) { try { a.pause(); a.muted = true; a.currentTime = 0; } catch { void 0; } }
      const d = duetOriginalRef.current;
      if (d) { try { d.pause(); d.muted = true; } catch { void 0; } }
    };

    if (isActive) {
      setVideoError(false);
      retryCountRef.current = 0;
      retryingRef.current = false;
      shouldPlayRef.current = true;

      const runPlay = (videoEl: HTMLVideoElement) => {
        if (!shouldPlayRef.current) return;
        videoEl.volume = volume;
        videoEl.muted = true;
        videoEl.play()
          .then(() => {
            if (!shouldPlayRef.current) {
              try { videoEl.pause(); videoEl.muted = true; } catch { void 0; }
              return;
            }
            setIsPlaying(true);
            if (!muteAllSounds) {
              videoEl.muted = false;
              videoEl.volume = volume;
              setIsMuted(false);
            } else {
              setIsMuted(true);
            }
          })
          .catch(() => {
            if (!shouldPlayRef.current) return;
            videoEl.muted = true;
            videoEl.play().then(() => {
              if (!shouldPlayRef.current) {
                try { videoEl.pause(); videoEl.muted = true; } catch { void 0; }
                return;
              }
              setIsPlaying(true);
              setIsMuted(true);
            }).catch(() => {});
          });
      };

      const tryPlay = () => {
        const el = videoRef.current;
        if (!el || !shouldPlayRef.current) return;
        if (el.readyState >= 2) {
          runPlay(el);
        } else {
          const onReady = () => {
            el.removeEventListener('canplay', onReady);
            el.removeEventListener('loadeddata', onReady);
            if (!shouldPlayRef.current) return;
            runPlay(el);
          };
          el.addEventListener('canplay', onReady);
          el.addEventListener('loadeddata', onReady);
          el.load();
        }
      };

      const timer = setTimeout(tryPlay, 50);

      incrementViews(videoId);
      trackEvent('video_view', { videoId });

      const duetEl = duetOriginalRef.current;
      if (duetEl && isDuetLayout && duetOriginalSrc) {
        duetEl.muted = true;
        void duetEl.play().then(() => {
          if (!shouldPlayRef.current) {
            try { duetEl.pause(); duetEl.muted = true; } catch { void 0; }
          }
        });
      }

      const audio = audioRef.current;
      if (audio && video?.music?.previewUrl) {
        if (audio.src !== video.music.previewUrl) {
          audio.src = video.music.previewUrl;
        }
        audio.currentTime = 0;
        audio.muted = muteAllSounds;
        audio.volume = volume;
        if (!muteAllSounds) {
          void audio.play().then(() => {
            if (!shouldPlayRef.current) {
              try { audio.pause(); audio.muted = true; audio.currentTime = 0; } catch { void 0; }
            }
          });
        }
      }

      return () => {
        clearTimeout(timer);
        stopAll();
      };
    } else {
      stopAll();
      setIsPlaying(false);
    }
  }, [incrementViews, isActive, isDuetLayout, muteAllSounds, originalVideo, video?.url, video?.music?.previewUrl, videoId, volume]);

  // Pause when tab/app is hidden; resume current slide when visible again (only if still active)
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        const v = videoRef.current;
        if (v) {
          try {
            v.pause();
            v.muted = true;
          } catch {
            void 0;
          }
        }
        if (duetOriginalRef.current) {
          try {
            duetOriginalRef.current.pause();
            duetOriginalRef.current.muted = true;
          } catch {
            void 0;
          }
        }
        const a = audioRef.current;
        if (a) {
          try {
            a.pause();
            a.muted = true;
            a.currentTime = 0;
          } catch {
            void 0;
          }
        }
        setIsPlaying(false);
      } else if (shouldPlayRef.current) {
        const v = videoRef.current;
        if (v) void v.play().catch(() => {});
        const d = duetOriginalRef.current;
        if (d) void d.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!muteAllSounds) return;
    setIsMuted(true);
    if (videoRef.current) videoRef.current.muted = true;
    if (audioRef.current) {
      audioRef.current.muted = true;
      if (audioRef.current.pause) {
        try {
          audioRef.current.pause();
        } catch {
          void 0;
        }
      }
    }
  }, [muteAllSounds]);

  // Mouse/touch interactions
  const handleVideoClick = (e: React.MouseEvent) => {
    // If video is muted (browser blocked sound), unmute on first tap
    if (isMuted && !muteAllSounds && videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.volume = volume;
      setIsMuted(false);
    }

    // Double click detection
    if (isDoubleClick) {
      handleLike();
      setShowHeartAnimation(true);
      setTimeout(() => setShowHeartAnimation(false), 1000);
      return;
    }

    setIsDoubleClick(true);
    setTimeout(() => setIsDoubleClick(false), 300);

    // Single click - play/pause
    togglePlay();
  };

  // Action handlers
  const handleLike = () => {
    if (!video) return;
    toggleLike(videoId);
    trackEvent('video_like_toggle', { videoId, next: !video.isLiked });
  };

  const handleSave = () => {
    if (!video) return;
    toggleSave(videoId);
    trackEvent('video_save_toggle', { videoId, next: !video.isSaved });
  };

  const handleFollow = () => {
    if (!video?.user?.id) return;
    toggleFollow(video.user.id);
    trackEvent('video_follow_toggle', { videoId, userId: video.user.id, next: !video.isFollowing });
  };

  const handleShare = () => {
    setShowShareModal(true);
    trackEvent('video_share_open', { videoId });
  };

  const handleComment = () => {
    setShowComments(true);
    trackEvent('video_comments_open', { videoId });
  };

  const handleProfileClick = () => {
    if (!video?.user?.id) return;
    setShowUserProfile(true);
    trackEvent('video_profile_open', { videoId, userId: video.user.id });
  };

  const handleMusicClick = () => {
    if (!video?.music?.id) return;
    navigate(`/music/${encodeURIComponent(video.music.id)}`);
    trackEvent('video_music_open', { videoId, musicId: video.music.id });
  };
  const handleReport = () => {
    setIsMoreMenuOpen(true);
  };

  const videoPageUrl = typeof window !== 'undefined' ? `${window.location.origin}/video/${videoId}` : '';
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(videoPageUrl);
      showToast('Link copied!');
    } catch {}
  };

  const handleDownload = () => {
    if (!video?.url) return;
    const a = document.createElement('a');
    a.href = video.url;
    a.download = `video_${videoId}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Download started');
  };

  const handleQRCode = async () => {
    const url = `${window.location.origin}/video/${videoId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied!');
    } catch {}
  };

  const isOwnVideo = !!authUserId && !!video?.user?.id && authUserId === video.user.id;
  const handleDeleteVideo = async () => {
    if (!isOwnVideo) return;
    const ok = await nativeConfirm('Delete this video? This cannot be undone.', 'Delete Video');
    if (!ok) return;
    try {
      await deleteVideo(videoId);
      setIsMoreMenuOpen(false);
      showToast('Video deleted');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  // Format functions
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (!video) return null;

  const posterUrl = video.thumbnail || getVideoPosterUrl(video.url);
  /** Sum used inside calc() — avoids nested calc() in inline styles */
  const navStackExpr = 'var(--nav-height) + var(--safe-bottom)';

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full overflow-hidden flex justify-center"
      style={{ margin: 0, padding: 0, gap: 0 }}
    >
      {/* Video Element - iPhone 14 Pro Max: 6.7" Super Retina XDR, 2796×1290, 19.5:9, ~460ppi */}
      <div
        className="absolute inset-0 flex items-center justify-center bg-[#13151A]"
        style={{ margin: 0, padding: 0, gap: 0 }}
      >
        <div className="w-full h-full" style={{ margin: 0, padding: 0 }}>
        <audio ref={audioRef} preload="auto" className="hidden" />
        {isDuetLayout && duetOriginalSrc ? (
          <div className="absolute inset-0 flex flex-row">
            <div className="w-1/2 h-full flex-shrink-0 bg-black">
              <video
                ref={duetOriginalRef}
                src={duetOriginalSrc}
                className="w-full h-full object-contain"
                loop
                playsInline
                muted
                preload={isActive ? 'auto' : 'none'}
                poster={posterUrl}
              />
            </div>
            <div className="w-1/2 h-full flex-shrink-0">
              <video
                ref={videoRef}
                src={video.url}
                className="w-full h-full object-cover"
                loop
                playsInline
                muted
                preload={isActive ? 'auto' : 'none'}
                onClick={handleVideoClick}
                poster={posterUrl}
                onError={() => {
                  if (retryingRef.current) return;
                  if (retryCountRef.current < 3 && video.url) {
                    retryCountRef.current += 1;
                    retryingRef.current = true;
                    const delay = 2000 * retryCountRef.current;
                    setTimeout(() => {
                      retryingRef.current = false;
                      const el = videoRef.current;
                      if (el && video.url) {
                        el.src = video.url;
                        el.load();
                      }
                    }, delay);
                    return;
                  }
                  setIsPlaying(false);
                  setVideoError(true);
                }}
              />
            </div>
          </div>
        ) : (
        <video
          ref={videoRef}
          src={video.url}
          className="w-full h-full object-cover"
          loop
          playsInline
          muted
          preload={isActive ? 'auto' : 'none'}
          onClick={handleVideoClick}
          poster={posterUrl}
          onError={() => {
            if (retryingRef.current) return;
            if (retryCountRef.current < 3 && video.url) {
              retryCountRef.current += 1;
              retryingRef.current = true;
              const delay = 2000 * retryCountRef.current;
              setTimeout(() => {
                retryingRef.current = false;
                const el = videoRef.current;
                if (el && video.url) {
                  el.src = video.url;
                  el.load();
                }
              }, delay);
              return;
            }
            setIsPlaying(false);
            setVideoError(true);
          }}
        />
        )}



        {videoError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#13151A] z-10 gap-3">
            <span className="text-white/50 text-sm">Video processing...</span>
            <button onClick={() => { setVideoError(false); retryCountRef.current = 0; retryingRef.current = false; const el = videoRef.current; if (el && video.url) { el.src = video.url; el.load(); el.play().catch(() => {}); } }} className="px-4 py-1.5 bg-[#C9A96E]/20 border border-[#C9A96E]/40 rounded-lg text-[#C9A96E] text-xs font-medium">Tap to retry</button>
          </div>
        )}

        {/* Center play/pause overlay — same on For You, Friends, Following; play icon when paused */}
        {!videoError && !isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
            <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm">
              <Play className="w-8 h-8 text-white" fill="white" strokeWidth={2} />
            </div>
          </div>
        )}

        {/* Thin line at rest; touch/drag expands track and scrubs (seek only while finger is down) */}
        <div
          ref={progressTrackRef}
          role="slider"
          tabIndex={0}
          aria-label="Video progress"
          aria-valuenow={Number.isFinite(currentTime) ? Math.round(currentTime) : 0}
          aria-valuemin={0}
          aria-valuemax={Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0}
          className="absolute left-3 right-[3.75rem] z-[16] pointer-events-auto flex flex-col justify-end cursor-pointer select-none"
          style={{
            bottom: edgeToBottomNav ? `calc(${navStackExpr} + 6px)` : '4mm',
            paddingBottom: edgeToBottomNav ? 0 : 'max(4px, env(safe-area-inset-bottom, 0px))',
            touchAction: 'none',
            minHeight: scrubbing ? 44 : 22,
            transition: 'min-height 0.12s ease-out',
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setScrubbing(true);
            seekFromClientX(e.clientX);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              skipBy(-5);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              skipBy(5);
            }
          }}
        >
          <div
            className={`w-full rounded-full bg-white/20 overflow-hidden pointer-events-none transition-[height,box-shadow] duration-150 ease-out ${
              scrubbing ? 'h-3.5 shadow-inner' : 'h-[3px]'
            }`}
            style={
              scrubbing
                ? { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)' }
                : undefined
            }
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#C9A96E] via-[#00c2be] to-[#C9A96E] relative overflow-hidden"
              style={{
                width: `${duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0}%`,
                boxShadow: scrubbing ? '0 0 10px rgba(201, 169, 110, 0.5)' : 'none',
              }}
            >
              {scrubbing ? (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-shimmer" />
              ) : null}
            </div>
          </div>
        </div>

        {/* Heart animation for double click */}
        {showHeartAnimation && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
            <div className="animate-ping">
              <Heart className="w-24 h-24 text-white fill-current" />
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Right Sidebar - Same Buttons with Subtle Luxury Effects */}
      <div
        className="absolute z-[10] flex flex-col items-center gap-2 pointer-events-auto"
        style={{
          right: '12px',
          /* Above thin progress line; extra space when user is scrubbing */
          bottom: edgeToBottomNav
            ? scrubbing
              ? `calc(${navStackExpr} + 5.5rem)`
              : `calc(${navStackExpr} + 3rem)`
            : scrubbing
              ? 'max(3.5rem, calc(44px + 10px))'
              : 'max(3.5rem, 1.5rem)',
          marginBottom: '-8mm',
        }}
      >
        
        {/* Profile Avatar — one gold circle (Profile icon), profile picture inside; no extra circle, no initials */}
        <div className="relative mb-1">
          <div
            className="relative flex cursor-pointer items-center justify-center transition-transform hover:scale-105"
            style={{ width: VIDEO_SIDEBAR_AVATAR, height: VIDEO_SIDEBAR_AVATAR, isolation: 'isolate' }}
            onClick={handleProfileClick}
          >
            {video.user.avatar ? (
              <div
                className="pointer-events-none absolute overflow-hidden rounded-full bg-[#13151A]"
                style={{
                  width: VIDEO_SIDEBAR_AVATAR_INNER,
                  height: VIDEO_SIDEBAR_AVATAR_INNER,
                  top: `calc(50% - ${PROFILE_RING_IMAGE_LIFT_MM}mm + 0.4mm)`,
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 1,
                }}
              >
                <img
                  src={video.user.avatar}
                  alt={video.user.username}
                  className="pointer-events-none h-full w-full object-cover object-center"
                />
              </div>
            ) : null}
            <img
              src="/Icons/Profile icon.png"
              alt=""
              className="pointer-events-none absolute inset-0 z-[2] h-full w-full object-contain"
            />
          </div>
        </div>

        {/* Like Button — Music Icon gold circle around Like icon; red when liked */}
        <button 
          onClick={handleLike}
          className="hover:scale-105 active:scale-95 transition-transform relative rounded-full overflow-hidden flex items-center justify-center"
          style={{width:'48px',height:'48px'}}
          title="Like"
        >
          <img 
            src="/Icons/Music Icon.png" 
            alt="" 
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
          <img 
            src="/Icons/Like Icon.png" 
            alt="Like" 
            className="absolute inset-0 w-full h-full object-contain transition-all duration-300 z-[1] scale-75"
            style={video.isLiked ? {filter:'brightness(0) saturate(100%) invert(27%) sepia(98%) saturate(5000%) hue-rotate(350deg) brightness(1.15) contrast(1.2)'} : {}}
          />
        </button>
        <span className="text-[10px] font-semibold -mt-1 text-white">{formatNumber(Math.max(0, video.stats.likes))}</span>

        {/* Comment Button */}
        <button 
          onClick={handleComment}
          className="hover:scale-105 active:scale-95 transition-transform relative"
          style={{width:'48px',height:'48px'}}
          title="Comments"
        >
          <img src="/Icons/Coment Icon.png" alt="Comments" className="absolute inset-0 w-full h-full object-contain z-[2]" />
        </button>
        <span className="text-white text-[10px] font-semibold -mt-1">{formatNumber(video.stats.comments)}</span>

        {/* Save Button */}
        <button 
          onClick={handleSave}
          className="hover:scale-105 active:scale-95 transition-transform relative"
          style={{width:'48px',height:'48px'}}
          title="Save"
        >
          <img 
            src="/Icons/Save Icon.png" 
            alt="Save" 
            className={`absolute inset-0 w-full h-full object-contain z-[2] ${video.isSaved ? 'brightness-125 drop-shadow-[0_0_8px_rgba(201,169,110,0.6)]' : ''}`}
          />
        </button>
        <span className="text-white text-[10px] font-semibold -mt-1">{formatNumber(Math.max(0, video.stats.saves || 0))}</span>

        {/* Share Button */}
        <button 
          onClick={handleShare}
          className="hover:scale-105 active:scale-95 transition-transform relative"
          style={{width:'48px',height:'48px'}}
          title="Share"
        >
          <img src="/Icons/Share Icon.png" alt="Share" className="absolute inset-0 w-full h-full object-contain z-[2]" />
        </button>

        {/* Delete button removed from right sidebar to avoid duplicate 3-dots / extra control here */}

        {/* Music Button - same gold circle + size as others */}
        <button 
          onClick={handleMusicClick}
          className="hover:scale-105 active:scale-95 transition-transform relative flex flex-col items-center"
          title={video.music?.title || 'Original Sound'}
        >
          <div
            className="relative flex items-center justify-center"
            style={{ width: '48px', height: '48px' }}
          >
            <img
              src="/Icons/Music Icon.png"
              alt="Music"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
            <Music size={16} className="relative z-[2] text-black" />
          </div>
          <span className="text-white text-[8px] font-medium mt-1 max-w-[50px] truncate text-center drop-shadow-md">
            {video.music?.title?.split(' ').slice(0, 2).join(' ') || 'Original'}
          </span>
        </button>

        {/* 3 Dots Button */}
        <button 
          onClick={handleReport}
          className="hover:scale-105 active:scale-95 transition-transform relative"
          style={{width:'48px',height:'48px'}}
          title="More"
        >
          <img src="/Icons/3 Dots Buton.png" alt="More" className="absolute inset-0 w-full h-full object-contain z-[2]" />
        </button>
      </div>

      {/* Bottom Info Area - For You hashtags / username moved down */}
      <div
        className={`absolute z-[10] left-3 w-[72%] pointer-events-none ${edgeToBottomNav ? 'pb-2' : 'bottom-[15px] md:bottom-[39px] pb-4'}`}
        style={
          edgeToBottomNav
            ? { bottom: `calc(${navStackExpr} + 14px)` }
            : undefined
        }
      >
        <div className="flex items-center gap-2 mb-2">
          <LevelBadge level={video.user.level ?? 1} size={10} layout="fixed" avatar={video.user.avatar} />
          <h3 className="text-white font-bold text-shadow-md">{video.user.name || video.user.username}</h3>
          {video.user.isVerified && (
            <div className="w-4 h-4 bg-[#C9A96E] rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full" />
            </div>
          )}
        </div>
        
        <p className="text-white/90 text-sm mb-2 text-shadow-md line-clamp-2">
          {video.description}
        </p>
        
        <div className="flex flex-wrap gap-1 mb-2">
          {video.hashtags.map((hashtag) => (
            <button
              key={hashtag}
              onClick={() => navigate(`/hashtag/${hashtag}`)}
              className="text-white text-xs font-medium hover:underline"
            >
              #{hashtag}
            </button>
          ))}
        </div>

        {video.location && (
          <div className="flex items-center gap-1 text-white/60 text-xs mb-2">
            <div className="w-3 h-3 rounded-full" />
            <span>{video.location}</span>
          </div>
        )}
        
        <div className="flex items-center gap-2 text-white/90">
          <Music size={14} className="text-white" />
          <span className="text-xs font-medium animate-marquee whitespace-nowrap overflow-hidden w-32">
            {video.music?.title || 'Original Sound'} - {video.music?.artist || ''}
          </span>
        </div>

        <div className="flex items-center gap-4 mt-2 text-white/60 text-xs">
          <span>{formatNumber(video.stats.views)} views</span>
          <span>•</span>
          <span>{new Date(video.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Modals */}
      <EnhancedCommentsModal 
        isOpen={showComments} 
        onClose={() => setShowComments(false)}
        videoId={videoId}
      />
      
      <EnhancedLikesModal 
        isOpen={showLikes} 
        onClose={() => setShowLikes(false)}
        videoId={videoId}
        likes={video.stats.likes}
      />
      
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        video={video}
        onReport={() => { setShowShareModal(false); setShowReportModal(true); trackEvent('video_report_open', { videoId }); }}
        onDeleteVideo={isOwnVideo ? handleDeleteVideo : undefined}
      />
      
      <UserProfileModal
        isOpen={showUserProfile}
        onClose={() => setShowUserProfile(false)}
        user={video.user}
        onFollow={handleFollow}
      />
      
            {isMoreMenuOpen && (
        <div className="fixed inset-0 z-modals flex items-end justify-center">
          <div className="absolute inset-0 pointer-events-auto" onClick={() => setIsMoreMenuOpen(false)} />
          <div
            className="bg-[#1C1E24]/95 rounded-t-2xl max-h-[40dvh] flex flex-col shadow-2xl border-2 border-b-0 border-[#C9A96E] pointer-events-auto w-full max-w-[480px] relative z-10"
            style={{ marginBottom: 'var(--feed-main-pb)', boxShadow: '0 -4px 30px rgba(201,169,110,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-white" />
                <span className="text-white font-bold text-sm">More Options</span>
              </div>
            </div>
            <div className="p-4 overflow-y-auto overflow-x-hidden min-h-0 flex-1">
              {showQrCodeInMore && (
                <div className="mb-3 p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center gap-2">
                  <span className="text-white/80 text-sm font-medium">Scan to open video</span>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=112x112&data=${encodeURIComponent(videoPageUrl)}`}
                    alt="QR code"
                    className="w-28 h-28 rounded-lg bg-white p-1.5"
                  />
                  <button type="button" onClick={() => setShowQrCodeInMore(false)} className="text-[#C9A96E] text-xs font-semibold">Close</button>
                </div>
              )}
              <div className="grid grid-cols-4 gap-y-4 gap-x-2">
                <button
                  type="button"
                  onClick={() => { handleCopyLink(); setIsMoreMenuOpen(false); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <div className="relative w-11 h-11 rounded-full bg-[#13151A] overflow-hidden flex items-center justify-center">
                    <Copy className="relative z-[2] w-[18px] h-[18px] text-white" strokeWidth={1.8} />
                    <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70">Copy Link</span>
                </button>
                <button
                  type="button"
                  onClick={() => { handleDownload(); setIsMoreMenuOpen(false); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <div className="relative w-11 h-11 rounded-full bg-[#13151A] overflow-hidden flex items-center justify-center">
                    <Download className="relative z-[2] w-[18px] h-[18px] text-white" strokeWidth={1.8} />
                    <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70">Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setIsMoreMenuOpen(false); navigate(`/upload?duet=${videoId}`); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <div className="relative w-11 h-11 rounded-full bg-[#13151A] overflow-hidden flex items-center justify-center">
                    <Users2 className="relative z-[2] w-[18px] h-[18px] text-white" strokeWidth={1.8} />
                    <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70">Duet</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowQrCodeInMore((v) => !v)}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <div className="relative w-11 h-11 rounded-full bg-[#13151A] overflow-hidden flex items-center justify-center">
                    <QrCode className="relative z-[2] w-[18px] h-[18px] text-white" strokeWidth={1.8} />
                    <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70">QR Code</span>
                </button>
                {isOwnVideo && (
                  <button
                    type="button"
                    onClick={() => { handleDeleteVideo(); setIsMoreMenuOpen(false); }}
                    className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <div className="relative w-11 h-11 rounded-full bg-[#13151A] overflow-hidden flex items-center justify-center">
                      <Trash2 className="relative z-[2] w-[18px] h-[18px] text-red-400" strokeWidth={1.8} />
                      <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                    </div>
                    <span className="text-[10px] font-semibold text-red-400/70">Delete video</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setIsMoreMenuOpen(false); handleShare(); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <div className="relative w-11 h-11 rounded-full bg-[#13151A] overflow-hidden flex items-center justify-center">
                    <Share2 className="relative z-[2] w-[18px] h-[18px] text-white" strokeWidth={1.8} />
                    <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70">Share</span>
                </button>
                <button
                  type="button"
                  onClick={() => { handleSave(); setIsMoreMenuOpen(false); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <div className="relative w-11 h-11 rounded-full bg-[#13151A] overflow-hidden flex items-center justify-center">
                    <Bookmark className="relative z-[2] w-[18px] h-[18px] text-white" strokeWidth={1.8} />
                    <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70">{video.isSaved ? 'Unsave' : 'Save'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { handleFollow(); setIsMoreMenuOpen(false); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <div className="relative w-11 h-11 rounded-full bg-[#13151A] overflow-hidden flex items-center justify-center">
                    {video.isFollowing ? <UserMinus className="relative z-[2] w-[18px] h-[18px] text-white" strokeWidth={1.8} /> : <UserPlus className="relative z-[2] w-[18px] h-[18px] text-white" strokeWidth={1.8} />}
                    <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70">{video.isFollowing ? 'Unfollow' : 'Follow'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setIsMoreMenuOpen(false); setShowPromotePanel(true); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <div className="relative w-11 h-11 rounded-full bg-[#13151A] overflow-hidden flex items-center justify-center">
                    <TrendingUp className="relative z-[2] w-[18px] h-[18px] text-white" strokeWidth={1.8} />
                    <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70">Promote</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setIsMoreMenuOpen(false); setShowReportModal(true); trackEvent('video_report_open', { videoId }); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <div className="relative w-11 h-11 rounded-full bg-[#13151A] overflow-hidden flex items-center justify-center">
                    <Flag className="relative z-[2] w-[18px] h-[18px] text-red-400" strokeWidth={1.8} />
                    <img src="/Icons/Music Icon.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3] scale-125 translate-y-0.5" />
                  </div>
                  <span className="text-[10px] font-semibold text-red-400/70">Report</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        videoId={videoId}
        contentType="video"
      />
      {video && (
        <PromotePanel
          isOpen={showPromotePanel}
          onClose={() => setShowPromotePanel(false)}
          contentType="video"
          content={{
            id: video.id,
            title: video.description,
            thumbnail: video.thumbnail,
            username: video.user?.username,
            postedAt: new Date().toISOString().split('T')[0],
          }}
        />
      )}
    </div>
  );
}
