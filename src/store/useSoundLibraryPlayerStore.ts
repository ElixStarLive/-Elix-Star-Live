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
 * Plays when the user taps play. Stops on leave — never continues on For You.
 */

let audioEl: HTMLAudioElement | null = null;
let playGen = 0;
let clipRange: { start: number; end: number } | null = null;
let listenersBound = false;

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
  clipRange = null;
  if (audioEl) stopSoundPreview(audioEl);
}

function onTimeUpdate() {
  if (!audioEl || !clipRange) return;
  if (audioEl.currentTime >= clipRange.end) {
    // One preview pass only — do not loop or queue other tracks.
    useSoundLibraryPlayerStore.getState().stop();
  }
}

function onEnded() {
  useSoundLibraryPlayerStore.getState().stop();
}

async function startTrack(track: SoundTrack): Promise<void> {
  if (useSettingsStore.getState().muteAllSounds) {
    showToast('Sounds are muted in settings');
    return;
  }

  const a = ensureAudio();
  const gen = ++playGen;
  clipRange = null;
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
    await playAudioClip(a, playable, start, () => gen !== playGen);
    if (gen !== playGen) {
      hardStopAudio();
      return;
    }
    clipRange = { start, end };
    useSoundLibraryPlayerStore.setState({ playingId: track.id, loadingId: null });
  } catch (err) {
    if (gen !== playGen || (err instanceof Error && err.message === 'cancelled')) {
      hardStopAudio();
      useSoundLibraryPlayerStore.setState({ playingId: null, loadingId: null });
      return;
    }
    clipRange = null;
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
