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
  type MusicPlaylist,
  type SoundTrack,
} from '../lib/soundLibrary';
import { useSoundLibraryPlayerStore } from '../store/useSoundLibraryPlayerStore';
import { silenceAllHtmlMedia } from '../lib/soundLibrary';

function formatClip(start: number, end: number) {
  const total = Math.max(0, Math.floor(end - start));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Sound page — licensed tracks / playlists only.
 * Preview stops when you leave this page (never continues on For You).
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

  // Always stop library + any HTML media when leaving Sound (For You / anywhere else).
  useEffect(() => {
    return () => {
      useSoundLibraryPlayerStore.getState().stop();
      silenceAllHtmlMedia();
    };
  }, []);

  const headerTrack = selectedTrack;
  const headerTitle = headerTrack?.title || 'Sound';
  const headerArtist = headerTrack?.artist || 'Licensed playlists';
  const trackIsSaved = Boolean(headerTrack && savedIds.has(headerTrack.id));

  useEffect(() => {
    if (!headerTrack?.id) return;
    if (!isSoundSaved(headerTrack.id)) return;
    setSavedIds((prev) => {
      if (prev.has(headerTrack.id)) return prev;
      const next = new Set(prev);
      next.add(headerTrack.id);
      return next;
    });
  }, [headerTrack?.id]);

  const goSearch = useCallback(() => {
    navigate('/search');
  }, [navigate]);

  const goBack = useCallback(() => {
    stopLibraryPlayer();
    silenceAllHtmlMedia();
    navigate(-1);
  }, [navigate, stopLibraryPlayer]);

  const toggleSaveTrack = useCallback(() => {
    if (!headerTrack) {
      showToast('Open a track first');
      return;
    }
    const nowSaved = toggleSavedSound(headerTrack);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (nowSaved) next.add(headerTrack.id);
      else next.delete(headerTrack.id);
      return next;
    });
    showToast(nowSaved ? 'Sound saved' : 'Removed from saved');
  }, [headerTrack]);

  const selectPlaylist = useCallback((playlistId: string) => {
    stopLibraryPlayer();
    setActivePlaylistId(playlistId);
  }, [stopLibraryPlayer]);

  const openTrack = useCallback(
    (trackId: string) => {
      navigate(`/music/${encodeURIComponent(trackId)}`);
    },
    [navigate],
  );

  const onTogglePreview = useCallback(
    (track: SoundTrack) => {
      void toggleTrack(track);
    },
    [toggleTrack],
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

        <header className="w-full shrink-0 bg-transparent z-10 border-b border-white/[0.06]">
          <div className="px-3 pt-page-header pb-3 flex items-center justify-between relative">
            <button type="button" onClick={goSearch} className="p-1 z-10" aria-label="Search">
              <Search className="w-4 h-4 text-[#F5F5F7]" />
            </button>
            <h1 className="text-sm font-bold text-gold-metallic absolute left-1/2 -translate-x-1/2">
              Sound
            </h1>
            <button type="button" onClick={goBack} className="p-1 z-10" title="Back">
              <RoyceBackIcon />
            </button>
          </div>

          <div className="px-3 pb-3">
            <div className="p-4 rounded-2xl bg-transparent flex gap-4 w-full">
              <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center shrink-0 royce-tile bg-[rgba(255,255,255,0.06)]">
                {headerTrack?.coverUrl ? (
                  <img src={headerTrack.coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music size={22} className="royce-icon-gold" strokeWidth={2.25} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold mb-0.5 truncate">{headerTitle}</h2>
                <p className="text-white/60 text-xs mb-2 truncate">{headerArtist}</p>
                <button
                  type="button"
                  disabled={!headerTrack}
                  onClick={toggleSaveTrack}
                  title={trackIsSaved ? 'Saved' : 'Save'}
                  aria-label={trackIsSaved ? 'Saved' : 'Save'}
                  className="h-7 px-5 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/15 active:scale-95 transition-transform disabled:opacity-50 border-0 shadow-none w-fit"
                >
                  <Bookmark
                    size={14}
                    strokeWidth={2.25}
                    className={
                      trackIsSaved
                        ? 'text-red-500 fill-red-500'
                        : 'text-[#F5F5F7]'
                    }
                    style={
                      trackIsSaved
                        ? { color: '#D91F2D', fill: '#D91F2D', WebkitTextFillColor: '#D91F2D' }
                        : undefined
                    }
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="px-4 pb-1.5">
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
          </div>

          {!search.trim() && playlists.length > 0 ? (
            <div className="px-3 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => selectPlaylist(pl.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    pl.id === activePlaylistId
                      ? 'bg-white/10 border-[#D8D9DD]/50 text-white'
                      : 'border-[#D8D9DD]/35 text-white'
                  }`}
                >
                  {pl.name}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto w-full bg-transparent">
          <div className="px-2 pb-6">
            {loading || searching ? (
              <p className="px-3 py-8 text-center text-white/40 text-xs">Loading tracks…</p>
            ) : null}
            {!loading && !searching && visibleTracks.length === 0 ? (
              <p className="px-3 py-8 text-center text-white/40 text-xs">No tracks found</p>
            ) : null}
            {visibleTracks.map((track) => {
              const isPlaying = playingId === track.id;
              const isLoading = previewLoadingId === track.id;
              const isSelected = songId === track.id;
              return (
                <div
                  key={track.id}
                  className={`w-full px-2 py-2 flex items-center gap-2 ${
                    isSelected ? 'bg-white/5 rounded-lg' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openTrack(track.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-[rgba(255,255,255,0.06)] border border-[#D8D9DD]/20">
                      {track.coverUrl ? (
                        <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
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
                    onClick={() => onTogglePreview(track)}
                    disabled={isLoading}
                    className="w-9 h-9 royce-glow-disc flex items-center justify-center flex-shrink-0 disabled:opacity-50"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-white" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
