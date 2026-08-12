/**
 * Silence + pause a feed video when the play promise resolves after ownership changed.
 */

export function silenceStaleFeedVideoEl(videoEl: HTMLVideoElement): void {
  try {
    videoEl.pause();
    videoEl.muted = true;
    videoEl.volume = 0;
  } catch {
    void 0;
  }
}
