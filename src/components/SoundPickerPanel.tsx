import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Music, Pause, Play, Search } from 'lucide-react';
import {
  fetchMusicPlaylists,
  searchLicensedTracks,
  ORIGINAL_SOUND_TRACK,
  resolvePlayableSoundUrl,
  playAudioClip,
  registerSoundPreviewAudio,
  stopSoundPreview,
  type MusicPlaylist,
  type SoundTrack,
} from '../lib/soundLibrary';

type Props = {
  onClose: () => void;
  onPick: (track: SoundTrack) => void;
  /** bottom sheet (Create) vs embedded (Upload) */
  layout?: 'sheet' | 'embedded';
};

function formatClip(start: number, end: number) {
  const total = Math.max(0, Math.floor(end - start));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SoundPickerPanel({ onClose, onPick, layout = 'sheet' }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipRef = useRef<{ start: number; end: number } | null>(null);
  const previewGenRef = useRef(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SoundTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  const stopPreview = () => {
    previewGenRef.current += 1;
    stopSoundPreview(audioRef.current);
    const a = audioRef.current;
    if (a) {
      try {
        a.removeAttribute('src');
        a.load();
      } catch {
        /* ignore */
      }
    }
    clipRef.current = null;
    setPlayingId(null);
    setPreviewLoadingId(null);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMusicPlaylists()
      .then((res) => {
        if (cancelled) return;
        setPlaylists(res.playlists);
        setConfigured(res.configured);
        if (res.playlists[0]) setActivePlaylistId(res.playlists[0].id);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      stopPreview();
    };
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (el) registerSoundPreviewAudio(el);
  }, []);

  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      searchLicensedTracks(term)
        .then((tracks) => {
          if (!cancelled) setSearchResults(tracks);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTimeUpdate = () => {
      const clip = clipRef.current;
      if (!clip) return;
      if (clip.end > clip.start && a.currentTime >= clip.end) {
        stopPreview();
      }
    };
    a.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      a.removeEventListener('timeupdate', onTimeUpdate);
      stopPreview();
    };
  }, []);

  const visibleTracks = useMemo(() => {
    if (search.trim()) return searchResults;
    const pl = playlists.find((p) => p.id === activePlaylistId);
    return pl?.tracks ?? [];
  }, [search, searchResults, playlists, activePlaylistId]);

  /** Preview only — does not select the track. One track at a time. */
  const togglePreview = async (track: SoundTrack, e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    setPreviewError(null);
    if (playingId === track.id) {
      stopPreview();
      return;
    }
    const a = audioRef.current;
    if (!a) return;

    const gen = ++previewGenRef.current;
    setPreviewLoadingId(track.id);
    stopSoundPreview(a);

    const playable = await resolvePlayableSoundUrl(track.url || '');
    if (gen !== previewGenRef.current) {
      stopSoundPreview(a);
      return;
    }
    if (!playable) {
      setPreviewLoadingId(null);
      setPreviewError('Preview unavailable for this track');
      return;
    }

    const start = Math.max(0, track.clipStartSeconds || 0);
    const end = Math.max(start, track.clipEndSeconds || start + 30);
    clipRef.current = { start, end };
    try {
      await playAudioClip(a, playable, start, () => gen !== previewGenRef.current);
      if (gen !== previewGenRef.current) {
        stopPreview();
        return;
      }
      setPlayingId(track.id);
      setPreviewLoadingId(null);
    } catch (err) {
      if (gen !== previewGenRef.current || (err instanceof Error && err.message === 'cancelled')) {
        stopPreview();
        return;
      }
      clipRef.current = null;
      setPlayingId(null);
      setPreviewLoadingId(null);
      setPreviewError('Could not play — tap play again');
    }
  };

  const pickTrack = (track: SoundTrack, e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    stopPreview();
    onPick(track);
    onClose();
  };

  const inner = (
    <>
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onEnded={() => {
          stopPreview();
        }}
        className="hidden"
      />
      <div className="flex items-center justify-between px-3 pt-page-header pb-3 flex-shrink-0 relative">
        <div className="w-8" />
        <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
          <Music className="w-4 h-4 text-[#F5F5F7]" strokeWidth={2} />
          <p className="text-sm font-bold text-gold-metallic">Add sound</p>
        </div>
        {layout === 'embedded' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              stopPreview();
              onClose();
            }}
            className="p-1 pointer-events-auto z-10"
            aria-label="Close"
          >
            <ChevronLeft size={28} className="text-white drop-shadow-md" strokeWidth={2.5} />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              stopPreview();
              onClose();
            }}
            className="p-1 pointer-events-auto z-10"
            aria-label="Close"
          >
            <ChevronLeft size={22} className="text-[#F5F5F7]" strokeWidth={2.5} />
          </button>
        )}
      </div>

      <div className="px-4 pb-1.5 flex-shrink-0">
        <div className="flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-white/12 bg-white/[0.05]">
          <Search className="w-3 h-3 text-white/40 flex-shrink-0" strokeWidth={2} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search songs"
            className="flex-1 min-w-0 bg-transparent text-white text-[11px] leading-none outline-none placeholder:text-white/35"
          />
        </div>
        {previewError ? (
          <p className="mt-1.5 text-[11px] text-[#F5F5F7]/80 px-1">{previewError}</p>
        ) : null}
      </div>

      {!search.trim() && playlists.length > 0 ? (
        <div className="px-3 pb-3 flex gap-2 overflow-x-auto flex-shrink-0 scrollbar-hide">
          {playlists.map((pl) => {
            const active = pl.id === activePlaylistId;
            return (
              <button
                key={pl.id}
                type="button"
                onClick={() => {
                  stopPreview();
                  setActivePlaylistId(pl.id);
                }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border pointer-events-auto ${
                  active
                    ? 'bg-white/10 border-[#D8D9DD]/50 text-white'
                    : 'border-[#D8D9DD]/35 text-white'
                }`}
              >
                {pl.name}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 overscroll-contain">
        {!search.trim() ? (
          <div className="w-full px-2 py-2 flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={(e) => pickTrack(ORIGINAL_SOUND_TRACK, e)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
            >
              <div className="w-12 h-12 rounded-full flex-shrink-0 bg-[rgba(255,255,255,0.06)] border border-[#D8D9DD]/20 flex items-center justify-center">
                <Music className="w-4 h-4 text-[#F5F5F7]" />
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">Original Sound</p>
                <p className="text-white/50 text-xs truncate">Use mic audio from your clip</p>
              </div>
            </button>
          </div>
        ) : null}
        {loading || searching ? (
          <p className="px-3 py-8 text-center text-white/40 text-xs">Loading tracks…</p>
        ) : null}
        {!loading && !searching && visibleTracks.length === 0 ? (
          <p className="px-3 py-8 text-center text-white/40 text-xs">
            {configured
              ? 'No tracks found'
              : 'Licensed playlists unavailable. Check EPIDEMIC_SOUND_API_KEY on the server.'}
          </p>
        ) : null}
        {visibleTracks.map((track) => {
          const isPlaying = playingId === track.id;
          const isLoading = previewLoadingId === track.id;
          return (
            <div
              key={track.id}
              className="w-full px-2 py-2 flex items-center gap-2 pointer-events-auto"
            >
              <button
                type="button"
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                onClick={(e) => pickTrack(track, e)}
                title={`Use ${track.title}`}
              >
                <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-[rgba(255,255,255,0.06)] border border-[#D8D9DD]/20">
                  {track.coverUrl ? (
                    <img
                      src={track.coverUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-4 h-4 text-white/40" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{track.title}</p>
                  <p className="text-white/50 text-xs truncate">
                    {track.artist} • {formatClip(track.clipStartSeconds, track.clipEndSeconds)}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => void togglePreview(track, e)}
                disabled={isLoading}
                className="w-9 h-9 royce-glow-disc flex items-center justify-center flex-shrink-0 pointer-events-auto disabled:opacity-50"
                title={isPlaying ? 'Pause' : 'Play'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isLoading ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-3.5 h-3.5 text-white" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-white" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );

  if (layout === 'embedded') {
    return (
      <div className="flex flex-col flex-1 min-h-0 pointer-events-auto relative z-10">
        {inner}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[10050] bg-black/40 flex items-end justify-center animate-in fade-in duration-200 pointer-events-auto"
      onClick={() => {
        stopPreview();
        onClose();
      }}
    >
      <div
        className="elix-panel backdrop-blur-md w-full max-w-[480px] rounded-t-2xl overflow-hidden flex flex-col h-[70vh] max-h-[70dvh] border border-black animate-in slide-in-from-bottom duration-300 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {inner}
      </div>
    </div>
  );
}
