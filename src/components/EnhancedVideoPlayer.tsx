import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Heart,
  MessageCircle,
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
  MoreHorizontal,
  Music,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import { RoyceIcon } from './royce';
import { api, request } from '../lib/apiClient';
import { nativeConfirm } from './NativeDialog';
import { downloadVideoWithoutMusic } from '../lib/videoDownloadClient';
import { getVideoPosterUrl } from '../lib/bunnyStorage';
import { resolveSoundTrackPlaybackUrl } from '../lib/soundLibrary';
import { StoryGoldRingAvatar } from './StoryGoldRingAvatar';
import {
  SHARE_PANEL_ACTION_DISC_PX,
  SHARE_PANEL_ACTION_ICON_PX,
} from '../lib/sharePanelContacts';

const VIDEO_SIDEBAR_AVATAR = 38;
const GOLD_ICON = 'royce-icon-gold';
const GOLD_COUNT = 'text-[10px] font-semibold leading-none text-gold-light';

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
      className="relative w-14 h-14 flex items-center justify-center transition-all duration-200 active:scale-90"
    >
      {iconSrc ? (
        <img 
          src={iconSrc} 
          alt="" 
          className={`w-7 h-7 object-contain transition-all duration-200 ${isActive ? 'brightness-125' : 'opacity-80'}`}
        />
      ) : Icon && (
        <Icon 
          className={`w-7 h-7 stroke-[2px] transition-all duration-200 ${
            isActive ? GOLD_ICON : 'text-gold-bright/60'
          }`}
          style={isActive && !iconSrc ? { fill: '#D4AF37' } : { fill: 'transparent' }}
        />
      )}
    </button>
    {label && (
      <span 
        className={`text-xs font-semibold mt-1 cursor-pointer hover:underline transition-colors ${
          isActive ? 'text-gold-bright' : 'text-gold-light/70'
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
  const musicClipRef = useRef<{ start: number; end: number } | null>(null);
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
  const [_videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
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
  const [creatorIsLive, setCreatorIsLive] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const feedSourceLabel = location.pathname === '/friends' ? 'Friends' : undefined;
  const { muteAllSounds } = useSettingsStore();
  const { 
    videos: _videos, 
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

  // Uploader-set audio mix — only applies when a music track is attached.
  // Defaults to 1 (unchanged behavior) so existing videos are unaffected.
  const _hasMusicTrack = !!video?.music?.previewUrl;
  const _origMix = _hasMusicTrack && typeof video?.music?.originalVolume === 'number'
    ? Math.max(0, Math.min(1, video.music.originalVolume)) : 1;
  const _musicMix = _hasMusicTrack && typeof video?.music?.musicVolume === 'number'
    ? Math.max(0, Math.min(1, video.music.musicVolume)) : 1;
  const videoVolume = volume * _origMix;
  const musicVolume = volume * _musicMix;

  // When duet original is not in store, fetch its URL for side-by-side playback
  useEffect(() => {
    if (!video?.duetWithVideoId || originalVideo) {
      setDuetOriginalUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.videos.get(video.duetWithVideoId as NonNullable<typeof video.duetWithVideoId>);
        if (!cancelled && data?.url) setDuetOriginalUrl(data.url);
      } catch { /* duet video unavailable */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.duetWithVideoId, originalVideo]);

  useEffect(() => {
    const uid = video?.user?.id;
    if (!isActive || !uid) {
      setCreatorIsLive(false);
      return;
    }
    let cancelled = false;
    request('/api/live/streams')
      .then(({ data }) => {
        if (cancelled) return;
        const liveIds = new Set(
          (data?.streams || []).map((s: { user_id?: string; userId?: string }) =>
            String(s.user_id || s.userId || ''),
          ).filter(Boolean),
        );
        setCreatorIsLive(liveIds.has(String(uid)));
      })
      .catch(() => {
        if (!cancelled) setCreatorIsLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isActive, video?.user?.id]);

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
      videoRef.current?.play()?.catch(() => {});
      if (isDuetLayout && duetOriginalSrc) duetOriginalRef.current?.play()?.catch(() => {});
      if (!effectiveMuted && audioRef.current) {
        audioRef.current.play()?.catch(() => {});
      }
    }
    setIsPlaying(prev => !prev);
  }, [effectiveMuted, isDuetLayout, isPlaying, duetOriginalSrc]);

  const _toggleMute = () => {
    if (muteAllSounds) {
      trackEvent('video_toggle_mute_blocked_global', { videoId });
      return;
    }
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
      if (!newMuted) {
        videoRef.current.volume = videoVolume;
      }
    }

    if (audioRef.current) {
      const newMuted = !isMuted;
      audioRef.current.muted = newMuted;
      audioRef.current.volume = musicVolume;
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
      const dur = videoElement.duration;
      if (Number.isFinite(dur) && dur > 0) {
        onProgress?.(videoElement.currentTime / dur);
      }
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

  // Loop licensed music within Epidemic highlight clip (TikTok-style segment only).
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTimeUpdate = () => {
      const clip = musicClipRef.current;
      if (!clip || clip.end <= clip.start) return;
      if (a.currentTime >= clip.end) {
        a.currentTime = clip.start;
        if (!a.paused && !a.muted) {
          a.play().catch(() => {});
        }
      }
    };
    a.addEventListener('timeupdate', onTimeUpdate);
    return () => a.removeEventListener('timeupdate', onTimeUpdate);
  }, []);

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
        videoEl.volume = videoVolume;
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
              videoEl.volume = videoVolume;
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
        const previewSrc = resolveSoundTrackPlaybackUrl(video.music.previewUrl);
        const clipStart = Math.max(0, video.music.clipStartSeconds ?? 0);
        const clipEnd = Math.max(
          clipStart + 5,
          video.music.clipEndSeconds ?? clipStart + 60,
        );
        musicClipRef.current = { start: clipStart, end: clipEnd };
        if (audio.src !== previewSrc) {
          audio.src = previewSrc;
        }
        audio.currentTime = clipStart;
        audio.muted = muteAllSounds;
        audio.volume = musicVolume;
        if (!muteAllSounds) {
          void audio.play().then(() => {
            if (!shouldPlayRef.current) {
              try {
                audio.pause();
                audio.muted = true;
                audio.currentTime = clipStart;
              } catch {
                void 0;
              }
            }
          });
        }
      } else {
        musicClipRef.current = null;
      }

      return () => {
        clearTimeout(timer);
        if (singleTapTimerRef.current) { clearTimeout(singleTapTimerRef.current); singleTapTimerRef.current = null; }
        stopAll();
      };
    } else {
      stopAll();
      setIsPlaying(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incrementViews, isActive, isDuetLayout, muteAllSounds, originalVideo, video?.url, video?.music?.previewUrl, video?.music?.clipStartSeconds, video?.music?.clipEndSeconds, videoId, volume]);

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

  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVideoClick = (_e: React.MouseEvent) => {
    if (isMuted && !muteAllSounds && videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.volume = videoVolume;
      setIsMuted(false);
    }

    if (isDoubleClick) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      handleLike();
      setShowHeartAnimation(true);
      setTimeout(() => setShowHeartAnimation(false), 1000);
      setIsDoubleClick(false);
      return;
    }

    setIsDoubleClick(true);
    setTimeout(() => setIsDoubleClick(false), 300);

    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      togglePlay();
    }, 300);
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

  const videoPageUrl = `https://www.elixstarlive.co.uk/video/${videoId}`;
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(videoPageUrl);
      showToast('Link copied!');
    } catch { /* intentionally empty */ }
  };

  const handleDownload = async () => {
    try {
      await downloadVideoWithoutMusic(videoId);
      showToast('Download started (voice only — app music not included)');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const _handleQRCode = async () => {
    const url = `${window.location.origin}/video/${videoId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied!');
    } catch { /* intentionally empty */ }
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
  /* Exact: play bar 5mm above home bar (was 2mm; lifted +3mm); like + description 2mm above play line */
  const playBarBottom = edgeToBottomNav
    ? `calc(${navStackExpr} + 5mm)`
    : '5mm';
  const playLineH = scrubbing ? '14px' : '3px';
  const abovePlayBar = edgeToBottomNav
    ? `calc(${navStackExpr} + 5mm + ${playLineH} + 2mm)`
    : `calc(5mm + ${playLineH} + 2mm)`;
  const chromeBottom = abovePlayBar;
  // Icon stack lifted above the play bar so it clears the bottom nav (flat calc — nested calc breaks on some WebViews).
  const likeBarBottom = edgeToBottomNav
    ? `calc(${navStackExpr} + 5mm + ${playLineH} - 1mm + 12mm)`
    : `calc(5mm + ${playLineH} - 1mm + 12mm)`;

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full overflow-hidden flex justify-center"
      style={{ margin: 0, padding: 0, gap: 0 }}
    >
      {/* Video Element - iPhone 14 Pro Max: 6.7" Super Retina XDR, 2796×1290, 19.5:9, ~460ppi */}
      <div
        className="absolute inset-0 flex items-center justify-center bg-[#111111]"
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
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#111111] z-10 gap-3">
            <span className="text-white/50 text-sm">Video processing...</span>
            <button onClick={() => { setVideoError(false); retryCountRef.current = 0; retryingRef.current = false; const el = videoRef.current; if (el && video.url) { el.src = video.url; el.load(); el.play().catch(() => {}); } }} className="px-4 py-1.5 bg-[#C9A227]/20 border border-[#C9A227]/40 rounded-lg text-[#D4AF37] text-xs font-medium">Tap to retry</button>
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
            bottom: playBarBottom,
            paddingBottom: 0,
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
              className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] via-[#00c2be] to-[#E8D5A3] relative overflow-hidden"
              style={{
                width: `${duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0}%`,
                boxShadow: scrubbing ? '0 0 10px rgba(255,255,255,0.25)' : 'none',
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
          right: 'calc(12px - 3mm)',
          bottom: likeBarBottom,
        }}
      >
        
        {/* Profile — red live ring + red LIVE pill when creator is live */}
        <button
          type="button"
          onClick={handleProfileClick}
          className="relative mb-1 overflow-visible rounded-full active:scale-95 transition-transform"
          style={{ width: VIDEO_SIDEBAR_AVATAR, height: VIDEO_SIDEBAR_AVATAR }}
          title={video.user.username}
        >
          <StoryGoldRingAvatar
            size={VIDEO_SIDEBAR_AVATAR}
            src={video.user.avatar || ''}
            alt={video.user.username || ''}
            live={creatorIsLive}
          />
        </button>

        <button
          type="button"
          onClick={handleLike}
          className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
          title="Like"
        >
          {video.isLiked ? (
            <Heart size={24} strokeWidth={2.25} className="fill-red-500 text-red-500" />
          ) : (
            <RoyceIcon icon={Heart} size={24} tile active />
          )}
          <span className={GOLD_COUNT}>{formatNumber(Math.max(0, video.stats.likes))}</span>
        </button>

        <button
          type="button"
          onClick={handleComment}
          className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
          title="Comments"
        >
          <RoyceIcon icon={MessageCircle} size={24} tile active />
          <span className={GOLD_COUNT}>{formatNumber(video.stats.comments)}</span>
        </button>

        <button
          type="button"
          onClick={handleSave}
          className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
          title="Save"
        >
          <span className="royce-tile" style={{ width: 34, height: 34 }}>
            <Bookmark
              size={24}
              strokeWidth={2.25}
              className={video.isSaved ? 'royce-icon-gold fill-gold-bright' : 'royce-icon-gold'}
            />
          </span>
          <span className={GOLD_COUNT}>{formatNumber(Math.max(0, video.stats.saves || 0))}</span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
          title="Share"
        >
          <RoyceIcon icon={Share2} size={22} tile active />
        </button>

        <button
          type="button"
          onClick={handleMusicClick}
          className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform max-w-[52px]"
          title={video.music?.title || 'Original Sound'}
        >
          <span
            className="overflow-hidden bg-black flex items-center justify-center relative"
            style={{ width: 34, height: 34, borderRadius: '50%' }}
          >
            <Music size={16} className="text-gold-light/80" />
            {video.music?.coverUrl && (
              <img
                src={video.music.coverUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
          </span>
          <span className="text-[8px] font-medium leading-tight text-gold-light/80 max-w-full truncate text-center">
            {video.music?.title?.split(' ').slice(0, 2).join(' ') || 'Original'}
          </span>
        </button>

        <button
          type="button"
          onClick={handleReport}
          className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
          title="More"
          aria-label="More options"
        >
          <span
            className="royce-glow-disc"
            style={{ width: 34, height: 34 }}
            aria-hidden
          >
            <MoreHorizontal
              size={22}
              strokeWidth={2.35}
              className="royce-icon-gold fill-gold-bright"
            />
          </span>
        </button>
      </div>

      {/* Bottom Info — name / music / views / description — above home bar */}
      <div
        className="absolute z-[10] pointer-events-none flex flex-col items-stretch gap-0.5"
        style={{
          left: '3mm',
          right: '72px',
          bottom: chromeBottom,
        }}
      >
        <div className="flex items-center gap-2 w-full min-w-0 justify-start">
          <LevelBadge level={video.user.level ?? 1} size={22} circleSize={28} layout="fixed" avatar={video.user.avatar} />
          <h3 className="text-white font-bold text-shadow-md truncate">
            {video.user.name || video.user.username}
          </h3>
          {video.user.isVerified && (
            <div className="w-4 h-4 bg-[#FFFFFF] rounded-full flex items-center justify-center flex-shrink-0">
              <div className="w-2 h-2 bg-white rounded-full" />
            </div>
          )}
        </div>

        <div className="w-full min-w-0 text-left">
          <span className="text-xs font-medium text-white/90 animate-marquee whitespace-nowrap overflow-hidden block max-w-full">
            {video.music?.title || 'Original Sound'}
            {(video.music?.artist || video.user.name || video.user.username) ? ` - ${video.music?.artist || video.user.name || video.user.username}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2 text-white/60 text-xs w-full justify-start">
          <span>{formatNumber(video.stats.views)} views</span>
          <span>{new Date(video.createdAt).toLocaleDateString()}</span>
        </div>

        <p className="text-white/90 text-sm mb-0 text-shadow-md line-clamp-2 w-full text-left">
          {video.description}
        </p>

        <div className="flex flex-wrap gap-1 mb-0 w-full justify-start">
          {video.hashtags.map((hashtag) => (
            <button
              key={hashtag}
              onClick={() => navigate(`/hashtag/${hashtag}`)}
              className="text-white text-xs font-medium hover:underline pointer-events-auto"
            >
              #{hashtag}
            </button>
          ))}
        </div>

        {video.location && (
          <div className="flex items-center gap-1 text-white/60 text-xs mb-0 w-full justify-start">
            <div className="w-3 h-3 rounded-full" />
            <span>{video.location}</span>
          </div>
        )}

        {feedSourceLabel ? (
          <p className="text-white/50 text-[11px] font-medium mt-0 mb-0 w-full text-left">{feedSourceLabel}</p>
        ) : null}
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
            className="bg-[#111111]/95 rounded-t-2xl max-h-[40dvh] flex flex-col shadow-2xl pointer-events-auto w-full max-w-[480px] relative z-10 bottom-sheet-above-nav"
            style={{ boxShadow: '0 -4px 30px rgba(255,255,255,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-white" />
                <span className="text-[#D4AF37] font-bold text-sm">More Options</span>
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
                  <button type="button" onClick={() => setShowQrCodeInMore(false)} className="text-[#D4AF37] text-xs font-semibold">Close</button>
                </div>
              )}
              <div className="grid grid-cols-4 gap-y-4 gap-x-2">
                <button
                  type="button"
                  onClick={() => { handleCopyLink(); setIsMoreMenuOpen(false); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <span className="royce-glow-disc flex items-center justify-center" style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }} aria-hidden>
                    <Copy size={SHARE_PANEL_ACTION_ICON_PX} className="royce-icon-gold" strokeWidth={2} />
                  </span>
                  <span className="text-[10px] font-semibold text-[#D4AF37]">Copy Link</span>
                </button>
                <button
                  type="button"
                  onClick={() => { handleDownload(); setIsMoreMenuOpen(false); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <span className="royce-glow-disc flex items-center justify-center" style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }} aria-hidden>
                    <Download size={SHARE_PANEL_ACTION_ICON_PX} className="royce-icon-gold" strokeWidth={2} />
                  </span>
                  <span className="text-[10px] font-semibold text-[#D4AF37]">Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setIsMoreMenuOpen(false); navigate(`/upload?duet=${videoId}`); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <span className="royce-glow-disc flex items-center justify-center" style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }} aria-hidden>
                    <Users2 size={SHARE_PANEL_ACTION_ICON_PX} className="royce-icon-gold" strokeWidth={2} />
                  </span>
                  <span className="text-[10px] font-semibold text-[#D4AF37]">Duet</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowQrCodeInMore((v) => !v)}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <span className="royce-glow-disc flex items-center justify-center" style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }} aria-hidden>
                    <QrCode size={SHARE_PANEL_ACTION_ICON_PX} className="royce-icon-gold" strokeWidth={2} />
                  </span>
                  <span className="text-[10px] font-semibold text-[#D4AF37]">QR Code</span>
                </button>
                {isOwnVideo && (
                  <button
                    type="button"
                    onClick={() => { handleDeleteVideo(); setIsMoreMenuOpen(false); }}
                    className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <span className="royce-glow-disc flex items-center justify-center" style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }} aria-hidden>
                      <Trash2 size={SHARE_PANEL_ACTION_ICON_PX} className="royce-icon-gold" strokeWidth={2} />
                    </span>
                    <span className="text-[10px] font-semibold text-[#D4AF37]">Delete video</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setIsMoreMenuOpen(false); handleShare(); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <span className="royce-glow-disc flex items-center justify-center" style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }} aria-hidden>
                    <Share2 size={SHARE_PANEL_ACTION_ICON_PX} className="royce-icon-gold" strokeWidth={2} />
                  </span>
                  <span className="text-[10px] font-semibold text-[#D4AF37]">Share</span>
                </button>
                <button
                  type="button"
                  onClick={() => { handleSave(); setIsMoreMenuOpen(false); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <span className="royce-glow-disc flex items-center justify-center" style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }} aria-hidden>
                    <Bookmark size={SHARE_PANEL_ACTION_ICON_PX} className="royce-icon-gold" strokeWidth={2} />
                  </span>
                  <span className="text-[10px] font-semibold text-[#D4AF37]">{video.isSaved ? 'Unsave' : 'Save'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { handleFollow(); setIsMoreMenuOpen(false); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <span className="royce-glow-disc flex items-center justify-center" style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }} aria-hidden>
                    {video.isFollowing
                      ? <UserMinus size={SHARE_PANEL_ACTION_ICON_PX} className="royce-icon-gold" strokeWidth={2} />
                      : <UserPlus size={SHARE_PANEL_ACTION_ICON_PX} className="royce-icon-gold" strokeWidth={2} />}
                  </span>
                  <span className="text-[10px] font-semibold text-[#D4AF37]">{video.isFollowing ? 'Unfollow' : 'Follow'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setIsMoreMenuOpen(false); setShowPromotePanel(true); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <span className="royce-glow-disc flex items-center justify-center" style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }} aria-hidden>
                    <TrendingUp size={SHARE_PANEL_ACTION_ICON_PX} className="royce-icon-gold" strokeWidth={2} />
                  </span>
                  <span className="text-[10px] font-semibold text-[#D4AF37]">Promote</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setIsMoreMenuOpen(false); setShowReportModal(true); trackEvent('video_report_open', { videoId }); }}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <span className="royce-glow-disc flex items-center justify-center" style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }} aria-hidden>
                    <Flag size={SHARE_PANEL_ACTION_ICON_PX} className="royce-icon-gold" strokeWidth={2} />
                  </span>
                  <span className="text-[10px] font-semibold text-[#D4AF37]">Report</span>
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
