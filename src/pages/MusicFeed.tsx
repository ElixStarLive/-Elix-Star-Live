import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { Music, Pause, Play, Search, Bookmark } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { showToast } from '../lib/toast';
import {
  fetchMusicPlaylists,
  searchLicensedTracks,
  isSoundSaved,
  toggleSavedSound,
  type MusicPlaylist,
  type SoundTrack,
} from '../lib/soundLibrary';

interface MusicVideo {
  id: string;
  url: string;
  video_url?: string;
  thumbnail_url?: string;
}

function formatClip(start: number, end: number) {
  const total = Math.max(0, Math.floor(end - start));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MusicFeed() {
  const navigate = useNavigate();
  const { songId } = useParams();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipRef = useRef<{ start: number; end: number } | null>(null);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SoundTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [videos, setVideos] = useState<MusicVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [savedTick, setSavedTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMusicPlaylists()
      .then((res) => {
        if (cancelled) return;
        setPlaylists(res.playlists);
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
      if (!clip || clip.end <= clip.start) return;
      if (a.currentTime >= clip.end) {
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

  const allTracks = useMemo(
    () => playlists.flatMap((p) => p.tracks),
    [playlists],
  );

  const selectedTrack = useMemo(() => {
    if (!songId) return null;
    return allTracks.find((t) => t.id === songId) ?? null;
  }, [songId, allTracks]);

  const visibleTracks = useMemo(() => {
    if (search.trim()) return searchResults;
    const pl = playlists.find((p) => p.id === activePlaylistId);
    return pl?.tracks ?? [];
  }, [search, searchResults, playlists, activePlaylistId]);

  useEffect(() => {
    if (!songId) {
      setVideos([]);
      return;
    }
    let cancelled = false;
    setVideosLoading(true);
    (async () => {
      try {
        const { data, error } = await api.videos.list();
        if (cancelled || error || !data) return;
        const list = Array.isArray(data) ? data : [];
        const filtered = list.filter((v: { music?: { id?: string }; description?: string }) => {
          const music = v.music;
          if (music?.id === songId) return true;
          const desc = (v.description || '').toLowerCase();
          return desc.includes(songId.toLowerCase());
        });
        setVideos(filtered);
      } finally {
        if (!cancelled) setVideosLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [songId]);

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
      setPlayingId(null);
    }
  };

  const headerTitle = selectedTrack?.title || 'Sound';
  const headerArtist = selectedTrack?.artist || 'Licensed playlists';
  const trackForSave =
    selectedTrack ||
    (playingId ? allTracks.find((t) => t.id === playingId) || searchResults.find((t) => t.id === playingId) || null : null);
  const trackIsSaved = trackForSave ? isSoundSaved(trackForSave.id) : false;
  void savedTick;

  return (
    <div className="page-above-bottom-nav bg-[#111111] text-white">
      <audio ref={audioRef} preload="auto" onEnded={() => setPlayingId(null)} className="hidden" />
      <div className="page-above-bottom-nav__inner bg-[#111111] flex flex-col min-h-0">
        <div className="w-full shrink-0 bg-[#111111] z-10 border-b border-white/[0.06]">
          <div className="px-3 pt-page-header pb-3 flex items-center justify-between relative">
            <button type="button" onClick={() => navigate('/search')} className="p-1 z-10" aria-label="Search">
              <Search className="w-4 h-4 text-[#D4AF37]" />
            </button>
            <h1 className="text-sm font-bold text-gold-metallic absolute left-1/2 transform -translate-x-1/2">
              Sound
            </h1>
            <button type="button" onClick={() => navigate(-1)} className="p-1 z-10" title="Back">
              <RoyceBackIcon />
            </button>
          </div>

          <div className="px-3 pb-3">
            <div className="p-4 rounded-2xl bg-[#111111] flex gap-4 w-full">
              <div className="w-14 h-14 rounded-lg overflow-hidden flex items-center justify-center shrink-0 royce-tile bg-[#222]">
                {selectedTrack?.coverUrl ? (
                  <img src={selectedTrack.coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music size={22} className="royce-icon-gold" strokeWidth={2.25} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold mb-0.5 truncate">{headerTitle}</h2>
                <p className="text-white/60 text-sm mb-3 truncate">{headerArtist}</p>
                <button
                  type="button"
                  disabled={!trackForSave}
                  onClick={() => {
                    if (!trackForSave) {
                      showToast('Play or open a sound first');
                      return;
                    }
                    const nowSaved = toggleSavedSound(trackForSave);
                    setSavedTick((n) => n + 1);
                    showToast(nowSaved ? 'Sound saved' : 'Removed from saved');
                  }}
                  className="bg-[#D4AF37] text-black px-6 py-1.5 rounded-full font-semibold flex items-center gap-1.5 text-sm w-fit active:scale-95 transition-transform disabled:opacity-50"
                >
                  <Bookmark
                    size={12}
                    className={trackIsSaved ? 'fill-black' : ''}
                    strokeWidth={2.5}
                  />
                  {trackIsSaved ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>
          </div>

          {!songId ? (
            <>
              <div className="px-3 pb-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-full border border-[#C9A227]/25 bg-[#111111]">
                  <Search className="w-4 h-4 text-white/50 flex-shrink-0" />
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
                <div className="px-3 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => setActivePlaylistId(pl.id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                        pl.id === activePlaylistId
                          ? 'bg-[#D4AF37] border-[#C9A227] text-black'
                          : 'border-[#C9A227]/35 text-white'
                      }`}
                    >
                      {pl.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto w-full bg-[#111111]">
          {songId ? (
            <div className="grid grid-cols-3 gap-0.5 w-full">
              {videosLoading ? (
                <div className="col-span-3 flex items-center justify-center min-h-[40vh]">
                  <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : videos.length === 0 ? (
                <div className="col-span-3 flex flex-col items-center justify-center min-h-[40vh] text-center opacity-60 px-6">
                  <Music size={48} className="mb-4" />
                  <p className="text-sm">No videos using this sound yet</p>
                </div>
              ) : (
                videos.map((video) => (
                  <div
                    key={video.id}
                    className="aspect-[3/4] bg-[#111111] relative cursor-pointer"
                    onClick={() => navigate(`/feed?video=${video.id}`)}
                  >
                    <video
                      src={video.url || video.video_url}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="px-2 pb-6">
              {loading || searching ? (
                <p className="px-3 py-8 text-center text-white/40 text-xs">Loading playlists…</p>
              ) : null}
              {visibleTracks.map((track) => (
                <div
                  key={track.id}
                  className="w-full px-2 py-2 flex items-center gap-2 hover:brightness-125 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/music/${encodeURIComponent(track.id)}`)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 bg-[#222] border border-[#C9A227]/20">
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
                    onClick={() => togglePreview(track)}
                    className="w-9 h-9 royce-glow-disc flex items-center justify-center flex-shrink-0"
                  >
                    {playingId === track.id ? (
                      <Pause className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-white" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
