/**
 * Brief play-then-pause to force a painted frame (search / trending thumbs).
 */

export function pauseVideoAfterBriefPlay(
  vid: HTMLVideoElement,
  delayMs: number,
): void {
  const played = vid.play?.();
  if (played && typeof played.then === 'function') {
    played
      .then(() => {
        window.setTimeout(() => {
          try {
            vid.pause();
          } catch {
            /* ignore */
          }
        }, delayMs);
      })
      .catch(() => {
        /* autoplay blocked — seek / #t= fragment is the fallback */
      });
  }
}
