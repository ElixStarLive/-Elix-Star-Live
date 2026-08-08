import { create } from 'zustand';
import {
  playAudioClip,
  registerSoundPreviewAudio,
  resolvePlayableSoundUrl,
  stopAllSoundPreviews,
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

function onTimeUpdate(this: HTMLAudioElement) {
  if (!playbackAllowed || this !== audioEl || !clipRange) return;
  if (this.currentTime < clipRange.end) return;
  const gen = playGen;
  const start = clipRange.start;
  try {
    this.currentTime = start;
  } catch {
    useSoundLibraryPlayerStore.getState().stop();
    return;
  }
  if (!playbackAllowed || gen !== playGen || this !== audioEl || !clipRange) return;
  void this.play().catch(() => {
    if (gen === playGen) useSoundLibraryPlayerStore.getState().stop();
  });
}

function onEnded(this: HTMLAudioElement) {
  if (!playbackAllowed || this !== audioEl || !clipRange) return;
  const gen = playGen;
  const start = clipRange.start;
  try {
    this.currentTime = start;
  } catch {
    useSoundLibraryPlayerStore.getState().stop();
    return;
  }
  if (!playbackAllowed || gen !== playGen || this !== audioEl || !clipRange) return;
  void this.play().catch(() => {
    if (gen === playGen) useSoundLibraryPlayerStore.getState().stop();
  });
}

function ensureAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
    audioEl.setAttribute('playsinline', 'true');
    audioEl.addEventListener('timeupdate', onTimeUpdate);
    audioEl.addEventListener('ended', onEnded);
    registerSoundPreviewAudio(audioEl);
  }
  return audioEl;
}

function discardAudioEl() {
  const el = audioEl;
  audioEl = null;
  clipRange = null;
  playbackAllowed = false;
  if (!el) return;
  try {
    el.removeEventListener('timeupdate', onTimeUpdate);
    el.removeEventListener('ended', onEnded);
  } catch {
    /* ignore */
  }
  stopSoundPreview(el);
}

function hardStopAudio() {
  playbackAllowed = false;
  clipRange = null;
  discardAudioEl();
  // Also kill picker / Upload detached Audio if any still running.
  stopAllSoundPreviews();
}

async function startTrack(track: SoundTrack): Promise<void> {
  if (useSettingsStore.getState().muteAllSounds) {
    showToast('Sounds are muted in settings');
    return;
  }

  const gen = ++playGen;
  hardStopAudio();
  const a = ensureAudio();
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
    stopSoundPreview(a);
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
    a.muted = false;
    a.volume = 1;
    await playAudioClip(a, playable, start, () => gen !== playGen);
    if (gen !== playGen || a !== audioEl) {
      // Always silence THIS element — stop() may have nulled audioEl already.
      stopSoundPreview(a);
      return;
    }
    playbackAllowed = true;
    clipRange = { start, end };
    useSoundLibraryPlayerStore.setState({ playingId: track.id, loadingId: null });
  } catch (err) {
    stopSoundPreview(a);
    if (gen !== playGen || (err instanceof Error && err.message === 'cancelled')) {
      useSoundLibraryPlayerStore.setState({ playingId: null, loadingId: null });
      return;
    }
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
