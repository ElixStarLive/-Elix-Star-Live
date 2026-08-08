import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { Music, Pause, Play, Search, Bookmark } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { showToast } from '../lib/toast';
import {
  fetchMusicPlaylists,
  searchLicensedTracks,
  isSoundSaved,
  toggleSavedSound,
  silenceAllHtmlMedia,
  type MusicPlaylist,
  type SoundTrack,
} from '../lib/soundLibrary';
import { useSoundLibraryPlayerStore } from '../store/useSoundLibraryPlayerStore';

function formatClip(start: number, end: number) {
  const total = Math.max(0, Math.floor(end - start));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Sound page — same layout as Create “Add sound” (no extra hero panel).
 * Preview stops when you leave this page.
 */
export default function MusicFeed() {
  const navigate = useNavigate();
  const { songId } = useParams();

  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SoundTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());

  const playingId = useSoundLibraryPlayerStore((s) => s.playingId);
  const previewLoadingId = useSoundLibraryPlayerStore((s) => s.loadingId);
  const toggleTrack = useSoundLibraryPlayerStore((s) => s.toggleTrack);
  const stopLibraryPlayer = useSoundLibraryPlayerStore((s) => s.stop);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMusicPlaylists()
      .then((res) => {
        if (cancelled) return;
        setPlaylists(res.playlists);
        setActivePlaylistId((prev) => prev || res.playlists[0]?.id || null);
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

  const allTracks = useMemo(
    () => playlists.flatMap((p) => p.tracks),
    [playlists],
  );

  const selectedTrack = useMemo(() => {
    if (!songId) return null;
    return (
      allTracks.find((t) => t.id === songId) ||
      searchResults.find((t) => t.id === songId) ||
      null
    );
  }, [songId, allTracks, searchResults]);

  const visibleTracks = useMemo(() => {
    if (search.trim()) return searchResults;
    const pl = playlists.find((p) => p.id === activePlaylistId);
    return pl?.tracks ?? [];
  }, [search, searchResults, playlists, activePlaylistId]);

  useEffect(() => {
    return () => {
      useSoundLibraryPlayerStore.getState().stop();
      silenceAllHtmlMedia();
    };
  }, []);

  useEffect(() => {
    if (!selectedTrack?.id) return;
    if (!isSoundSaved(selectedTrack.id)) return;
    setSavedIds((prev) => {
      if (prev.has(selectedTrack.id)) return prev;
      const next = new Set(prev);
      next.add(selectedTrack.id);
      return next;
    });
  }, [selectedTrack?.id]);

  const goBack = useCallback(() => {
    stopLibraryPlayer();
    silenceAllHtmlMedia();
    navigate(-1);
  }, [navigate, stopLibraryPlayer]);

  const toggleSaveTrack = useCallback(
    (track: SoundTrack) => {
      const nowSaved = toggleSavedSound(track);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (nowSaved) next.add(track.id);
        else next.delete(track.id);
        return next;
      });
      showToast(nowSaved ? 'Sound saved' : 'Removed from saved');
    },
    [],
  );

  const selectPlaylist = useCallback(
    (playlistId: string) => {
      stopLibraryPlayer();
      setActivePlaylistId(playlistId);
    },
    [stopLibraryPlayer],
  );

  const openTrack = useCallback(
    (trackId: string) => {
      navigate(`/music/${encodeURIComponent(trackId)}`, { replace: true });
    },
    [navigate],
  );

  const onTogglePreview = useCallback(
    (track: SoundTrack) => {
      openTrack(track.id);
      void toggleTrack(track);
    },
    [openTrack, toggleTrack],
  );

  return (
    <div
      className="page-above-bottom-nav bg-transparent text-white"
      style={{ bottom: 'var(--bottom-nav-top)' }}
    >
      <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0">
        <div
          className="flex justify-center pt-0.5 pb-1 flex-shrink-0"
          aria-hidden
          style={{ transform: 'translateY(0.6mm)' }}
        >
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>

        {/* Same chrome as Create “Add sound” sheet */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-[#F5F5F7]" strokeWidth={2} />
            <p className="text-[#F5F5F7] font-semibold">Sound</p>
          </div>
          <button type="button" onClick={goBack} className="p-1" title="Back" aria-label="Back">
            <RoyceBackIcon />
          </button>
        </div>

        <div className="px-4 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-full border border-[#D8D9DD]/25 bg-[rgba(0,0,0,0.35)]">
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
                  onClick={() => selectPlaylist(pl.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    active
                      ? 'bg-[#E6E9EE] border-[#D8D9DD] text-white elix-accent'
                      : 'border-[#D8D9DD]/35 text-white'
                  }`}
                >
                  {pl.name}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-6 overscroll-contain">
          {loading || searching ? (
            <p className="px-3 py-6 text-center text-white/40 text-xs">Loading playlists…</p>
          ) : null}
          {!loading && !searching && visibleTracks.length === 0 ? (
            <p className="px-3 py-6 text-center text-white/40 text-xs">No tracks found</p>
          ) : null}
          {visibleTracks.map((track) => {
            const isPlaying = playingId === track.id;
            const isLoading = previewLoadingId === track.id;
            const isSelected = songId === track.id;
            const isSaved = savedIds.has(track.id) || isSoundSaved(track.id);
            return (
              <div
                key={track.id}
                className={`w-full px-2 py-2.5 flex items-center gap-2 active:brightness-125 transition-colors ${
                  isSelected ? 'bg-white/5 rounded-lg' : ''
                }`}
              >
                <button
                  type="button"
                  className="flex flex-1 min-w-0 items-center gap-2 text-left"
                  onClick={() => openTrack(track.id)}
                >
                  <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-[rgba(255,255,255,0.06)] border border-[#D8D9DD]/20">
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
                    onClick={() => onTogglePreview(track)}
                    disabled={isLoading}
                    className="w-10 h-10 royce-glow-disc flex items-center justify-center disabled:opacity-60"
                    title={isPlaying ? 'Pause preview' : 'Play preview'}
                    aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                  >
                    {isLoading ? (
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    ) : isPlaying ? (
                      <Pause className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSaveTrack(track)}
                    title={isSaved ? 'Saved' : 'Save'}
                    aria-label={isSaved ? 'Saved' : 'Save'}
                    className="min-h-[32px] min-w-[48px] px-3 py-1.5 rounded-full bg-[#E6E9EE] text-white elix-accent text-[10px] font-bold flex items-center justify-center"
                  >
                    <Bookmark
                      size={14}
                      strokeWidth={2.25}
                      className={isSaved ? 'text-red-500 fill-red-500' : 'text-white'}
                      style={
                        isSaved
                          ? { color: '#D91F2D', fill: '#D91F2D', WebkitTextFillColor: '#D91F2D' }
                          : undefined
                      }
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
