import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Music, Pause, Play, Search } from 'lucide-react';
import { RoyceCloseIcon } from './royce';
import {
  fetchMusicPlaylists,
  searchLicensedTracks,
  ORIGINAL_SOUND_TRACK,
  resolvePlayableSoundUrl,
  playAudioClip,
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
    const a = audioRef.current;
    if (a) {
      try {
        a.pause();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        a.currentTime = clip.start;
        void a.play().catch(() => {});
      }
    };
    a.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      a.removeEventListener('timeupdate', onTimeUpdate);
      stopPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    try {
      a.pause();
    } catch {
      /* ignore */
    }

    const playable = await resolvePlayableSoundUrl(track.url || '');
    if (gen !== previewGenRef.current) return;
    if (!playable) {
      setPreviewLoadingId(null);
      setPreviewError('Preview unavailable for this track');
      return;
    }

    const start = Math.max(0, track.clipStartSeconds || 0);
    const end = Math.max(start, track.clipEndSeconds || start + 30);
    clipRef.current = { start, end };
    try {
      await playAudioClip(a, playable, start);
      if (gen !== previewGenRef.current) return;
      setPlayingId(track.id);
      setPreviewLoadingId(null);
    } catch {
      if (gen !== previewGenRef.current) return;
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
        onEnded={() => setPlayingId(null)}
        className="hidden"
      />
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-[#D4AF37]" strokeWidth={2} />
          <p className="text-[#D4AF37] font-semibold">Add sound</p>
        </div>
        {layout === 'embedded' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              stopPreview();
              onClose();
            }}
            className="p-2 pointer-events-auto"
            aria-label="Close"
          >
            <RoyceCloseIcon />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      <div className="px-4 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 rounded-full border border-[#C9A227]/25 bg-[#111111]">
          <Search className="w-4 h-4 text-white/50 flex-shrink-0" strokeWidth={2} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search songs, artists, moods"
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/40"
          />
        </div>
        {previewError ? (
          <p className="mt-1.5 text-[11px] text-[#D4AF37]/80 px-1">{previewError}</p>
        ) : null}
      </div>

      {!search.trim() && playlists.length > 0 ? (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto flex-shrink-0 scrollbar-hide">
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
                    ? 'bg-[#D4AF37] border-[#C9A227] text-black'
                    : 'border-[#C9A227]/35 text-white'
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
          <button
            type="button"
            onClick={(e) => pickTrack(ORIGINAL_SOUND_TRACK, e)}
            className="w-full px-2 py-2.5 flex items-center gap-2 active:brightness-125 transition-colors text-left pointer-events-auto"
          >
            <div className="w-10 h-10 rounded-md flex-shrink-0 bg-[#222] border border-[#C9A227]/20 flex items-center justify-center">
              <Music className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium">Original Sound</p>
              <p className="text-white/50 text-xs">Use mic audio from your clip</p>
            </div>
            <span className="min-h-[32px] min-w-[48px] px-3 py-1.5 rounded-full bg-[#D4AF37] text-black text-[10px] font-bold flex items-center justify-center">
              Use
            </span>
          </button>
        ) : null}
        {loading || searching ? (
          <p className="px-3 py-6 text-center text-white/40 text-xs">Loading playlists…</p>
        ) : null}
        {!loading && !searching && visibleTracks.length === 0 ? (
          <p className="px-3 py-6 text-center text-white/40 text-xs">
            {configured
              ? 'No tracks in this playlist. Try another playlist or search.'
              : 'Licensed playlists unavailable. Check EPIDEMIC_SOUND_API_KEY on the server.'}
          </p>
        ) : null}
        {visibleTracks.map((track) => (
          <div
            key={track.id}
            className="w-full px-2 py-2.5 flex items-center gap-2 active:brightness-125 transition-colors pointer-events-auto"
          >
            <button
              type="button"
              className="flex flex-1 min-w-0 items-center gap-2 text-left"
              onClick={(e) => pickTrack(track, e)}
              title={`Use ${track.title}`}
            >
              <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-[#222] border border-[#C9A227]/20">
                {track.coverUrl ? (
                  <img src={track.coverUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music className="w-4 h-4 text-white/40" />
                  </div>
                )}
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-white text-sm font-medium leading-4 truncate">{track.title}</p>
                <p className="text-white/50 text-xs leading-4 truncate">
                  {track.artist} • {formatClip(track.clipStartSeconds, track.clipEndSeconds)}
                </p>
              </div>
            </button>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={(e) => void togglePreview(track, e)}
                disabled={previewLoadingId === track.id}
                className="w-10 h-10 royce-glow-disc flex items-center justify-center pointer-events-auto disabled:opacity-60"
                title={playingId === track.id ? 'Pause preview' : 'Play preview'}
                aria-label={playingId === track.id ? 'Pause preview' : 'Play preview'}
              >
                {previewLoadingId === track.id ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : playingId === track.id ? (
                  <Pause className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                ) : (
                  <Play className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => pickTrack(track, e)}
                className="min-h-[32px] min-w-[48px] px-3 py-1.5 rounded-full bg-[#D4AF37] text-black text-[10px] font-bold pointer-events-auto"
              >
                Use
              </button>
            </div>
          </div>
        ))}
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
        className="bg-[#111111]/95 backdrop-blur-md w-full max-w-[480px] rounded-t-2xl overflow-hidden flex flex-col h-[70vh] max-h-[70dvh] shadow-2xl animate-in slide-in-from-bottom duration-300 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {inner}
      </div>
    </div>
  );
}
