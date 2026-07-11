import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Music, Pause, Play, Search } from 'lucide-react';
import { RoyceCloseIcon } from './royce';
import {
  fetchMusicPlaylists,
  searchLicensedTracks,
  ORIGINAL_SOUND_TRACK,
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
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SoundTrack[]>([]);
  const [searching, setSearching] = useState(false);

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
    };
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
        a.play().catch(() => {});
      }
    };
    a.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      a.removeEventListener('timeupdate', onTimeUpdate);
      a.pause();
    };
  }, []);

  const visibleTracks = useMemo(() => {
    if (search.trim()) return searchResults;
    const pl = playlists.find((p) => p.id === activePlaylistId);
    return pl?.tracks ?? [];
  }, [search, searchResults, playlists, activePlaylistId]);

  const togglePreview = async (track: SoundTrack) => {
    if (!track.url) return;
    const a = audioRef.current;
    if (!a) return;
    if (playingId === track.id) {
      a.pause();
      clipRef.current = null;
      setPlayingId(null);
      return;
    }
    a.src = track.url;
    const start = Math.max(0, track.clipStartSeconds);
    const end = Math.max(start, track.clipEndSeconds);
    clipRef.current = { start, end };
    a.currentTime = start;
    try {
      await a.play();
      setPlayingId(track.id);
    } catch {
      clipRef.current = null;
      setPlayingId(null);
    }
  };

  const inner = (
    <>
      <audio ref={audioRef} preload="auto" onEnded={() => setPlayingId(null)} className="hidden" />
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-white" strokeWidth={2} />
          <p className="text-white font-semibold">Add sound</p>
        </div>
        <button type="button" onClick={onClose} className="p-2" aria-label="Close">
          <RoyceCloseIcon />
        </button>
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
      </div>

      {!search.trim() && playlists.length > 0 ? (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto flex-shrink-0 scrollbar-hide">
          {playlists.map((pl) => {
            const active = pl.id === activePlaylistId;
            return (
              <button
                key={pl.id}
                type="button"
                onClick={() => setActivePlaylistId(pl.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
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

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
        {!search.trim() ? (
          <button
            type="button"
            onClick={() => {
              onPick(ORIGINAL_SOUND_TRACK);
              onClose();
            }}
            className="w-full px-2 py-2 flex items-center gap-2 hover:brightness-125 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-md flex-shrink-0 bg-[#222] border border-[#C9A227]/20 flex items-center justify-center">
              <Music className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium">Original Sound</p>
              <p className="text-white/50 text-xs">Use mic audio from your clip</p>
            </div>
            <span className="px-2.5 py-1 rounded-full border border-[#C9A227]/35 text-white text-[10px] font-semibold">
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
            className="w-full px-2 py-2 flex items-center gap-2 hover:brightness-125 transition-colors"
          >
            <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-[#222] border border-[#C9A227]/20">
              {track.coverUrl ? (
                <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
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
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => togglePreview(track)}
                className="w-8 h-8 rounded-full border border-[#C9A227]/25 bg-[#111111] flex items-center justify-center"
              >
                {playingId === track.id ? (
                  <Pause className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                ) : (
                  <Play className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  onPick(track);
                  onClose();
                }}
                className="px-2.5 py-1 rounded-full border border-[#C9A227]/35 text-white text-[10px] font-semibold"
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
    return <div className="flex flex-col flex-1 min-h-0">{inner}</div>;
  }

  return (
    <div
      className="fixed inset-0 z-[500] bg-black/40 flex items-end justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-[#111111]/95 backdrop-blur-md w-full max-w-[480px] rounded-t-2xl overflow-hidden flex flex-col h-[70vh] max-h-[70dvh] shadow-2xl animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </div>
    </div>
  );
}
