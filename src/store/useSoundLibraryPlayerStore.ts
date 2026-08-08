import { create } from 'zustand';
import {
  playAudioClip,
  registerSoundPreviewAudio,
  unregisterSoundPreviewAudio,
  resolvePlayableSoundUrl,
  stopAllSoundPreviews,
  stopSoundPreview,
  type SoundTrack,
} from '../lib/soundLibrary';
import { showToast } from '../lib/toast';
import { useSettingsStore } from './useSettingsStore';

/**
 * Sound Library (/music) preview only.
 * Plays once on tap — no continuous loop. Silent when you leave.
 * Must never touch For You feed soundtrack audio.
 */

let audioEl: HTMLAudioElement | null = null;
let playGen = 0;
/** When true, any in-flight startTrack/playAudioClip must abort and stay silent. */
let forceSilent = true;
let playbackAllowed = false;
let clipRange: { start: number; end: number } | null = null;

function onTimeUpdate(this: HTMLAudioElement) {
  if (forceSilent || !playbackAllowed || this !== audioEl || !clipRange) return;
  if (this.currentTime >= clipRange.end) {
    useSoundLibraryPlayerStore.getState().stop();
  }
}

function onEnded(this: HTMLAudioElement) {
  useSoundLibraryPlayerStore.getState().stop();
}

function ensureAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
    audioEl.setAttribute('playsinline', 'true');
    audioEl.dataset.elixSoundPreview = '1';
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
  unregisterSoundPreviewAudio(el);
}

/** Cancel in-flight play() races, kill library singleton + registered previews only. */
function hardStopAudio() {
  forceSilent = true;
  playbackAllowed = false;
  clipRange = null;
  const el = audioEl;
  if (el) stopSoundPreview(el);
  stopAllSoundPreviews();
  discardAudioEl();
}

function isStartCancelled(gen: number): boolean {
  return forceSilent || gen !== playGen;
}

async function startTrack(track: SoundTrack): Promise<void> {
  if (useSettingsStore.getState().muteAllSounds) {
    showToast('Sounds are muted in settings');
    return;
  }

  const gen = ++playGen;
  hardStopAudio();
  // Allow this generation only — stop() sets forceSilent again.
  forceSilent = false;
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
  if (isStartCancelled(gen)) {
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
    await playAudioClip(a, playable, start, () => isStartCancelled(gen));
    if (isStartCancelled(gen) || a !== audioEl) {
      stopSoundPreview(a);
      useSoundLibraryPlayerStore.setState({ playingId: null, loadingId: null });
      return;
    }
    playbackAllowed = true;
    clipRange = { start, end };
    useSoundLibraryPlayerStore.setState({ playingId: track.id, loadingId: null });
  } catch (err) {
    stopSoundPreview(a);
    if (isStartCancelled(gen) || (err instanceof Error && err.message === 'cancelled')) {
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
    forceSilent = true;
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
