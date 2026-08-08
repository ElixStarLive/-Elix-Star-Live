import { create } from 'zustand';
import {
  playAudioClip,
  resolvePlayableSoundUrl,
  stopSoundPreview,
  type SoundTrack,
} from '../lib/soundLibrary';
import { showToast } from '../lib/toast';
import { useSettingsStore } from './useSettingsStore';

/**
 * Sound Library (/music) preview only.
 * One tapped song may loop while on Sound. Must be silent the moment you leave.
 */

let audioEl: HTMLAudioElement | null = null;
let playGen = 0;
/** When false, loop handlers must never call play() (blocks leave races). */
let playbackAllowed = false;
let clipRange: { start: number; end: number } | null = null;
let listenersBound = false;

function onTimeUpdate() {
  if (!playbackAllowed || !audioEl || !clipRange) return;
  if (audioEl.currentTime < clipRange.end) return;
  const gen = playGen;
  const start = clipRange.start;
  try {
    audioEl.currentTime = start;
  } catch {
    useSoundLibraryPlayerStore.getState().stop();
    return;
  }
  // Re-check after seek — stop() may have run mid-handler.
  if (!playbackAllowed || gen !== playGen || !clipRange) return;
  void audioEl.play().catch(() => {
    if (gen === playGen) useSoundLibraryPlayerStore.getState().stop();
  });
}

function onEnded() {
  if (!playbackAllowed || !audioEl || !clipRange) return;
  const gen = playGen;
  const start = clipRange.start;
  try {
    audioEl.currentTime = start;
  } catch {
    useSoundLibraryPlayerStore.getState().stop();
    return;
  }
  if (!playbackAllowed || gen !== playGen || !clipRange) return;
  void audioEl.play().catch(() => {
    if (gen === playGen) useSoundLibraryPlayerStore.getState().stop();
  });
}

function ensureAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
    audioEl.setAttribute('playsinline', 'true');
  }
  if (!listenersBound && audioEl) {
    listenersBound = true;
    audioEl.addEventListener('timeupdate', onTimeUpdate);
    audioEl.addEventListener('ended', onEnded);
  }
  return audioEl;
}

function hardStopAudio() {
  playbackAllowed = false;
  clipRange = null;
  if (!audioEl) return;
  try {
    audioEl.muted = true;
    audioEl.volume = 0;
  } catch {
    /* ignore */
  }
  stopSoundPreview(audioEl);
}

async function startTrack(track: SoundTrack): Promise<void> {
  if (useSettingsStore.getState().muteAllSounds) {
    showToast('Sounds are muted in settings');
    return;
  }

  const a = ensureAudio();
  const gen = ++playGen;
  hardStopAudio();
  useSoundLibraryPlayerStore.setState({ loadingId: track.id, playingId: null });

  const sourceUrl =
    (track.url && track.url.trim()) ||
    (track.id ? `/api/music/tracks/${encodeURIComponent(track.id)}/preview` : '');
  if (!sourceUrl) {
    useSoundLibraryPlayerStore.setState({ loadingId: null, playingId: null });
    showToast('Preview unavailable for this track');
    return;
  }

  const playable = await resolvePlayableSoundUrl(sourceUrl);
  if (gen !== playGen) {
    hardStopAudio();
    return;
  }
  if (!playable) {
    useSoundLibraryPlayerStore.setState({ loadingId: null, playingId: null });
    showToast('Preview unavailable for this track');
    return;
  }

  const start = Math.max(0, track.clipStartSeconds || 0);
  const end = Math.max(start + 5, track.clipEndSeconds || start + 60);
  try {
    // Unmute only for this intentional start; stop() forces mute again.
    a.muted = false;
    a.volume = 1;
    await playAudioClip(a, playable, start, () => gen !== playGen);
    if (gen !== playGen) {
      hardStopAudio();
      return;
    }
    playbackAllowed = true;
    clipRange = { start, end };
    useSoundLibraryPlayerStore.setState({ playingId: track.id, loadingId: null });
  } catch (err) {
    if (gen !== playGen || (err instanceof Error && err.message === 'cancelled')) {
      hardStopAudio();
      useSoundLibraryPlayerStore.setState({ playingId: null, loadingId: null });
      return;
    }
    hardStopAudio();
    useSoundLibraryPlayerStore.setState({ playingId: null, loadingId: null });
    showToast('Could not play — tap play again');
  }
}

interface SoundLibraryPlayerState {
  playingId: string | null;
  loadingId: string | null;
  toggleTrack: (track: SoundTrack) => Promise<void>;
  stop: () => void;
}

export const useSoundLibraryPlayerStore = create<SoundLibraryPlayerState>((set, get) => ({
  playingId: null,
  loadingId: null,

  stop: () => {
    playGen += 1;
    hardStopAudio();
    set({ playingId: null, loadingId: null });
  },

  toggleTrack: async (track) => {
    if (get().playingId === track.id && !get().loadingId) {
      get().stop();
      return;
    }
    await startTrack(track);
  },
}));
