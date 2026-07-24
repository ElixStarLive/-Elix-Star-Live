/** 1×1 transparent GIF — avoids Android WebView default poster / white play icon. */
export const LIVE_VIDEO_TRANSPARENT_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** CSS class: hide WebView media chrome on LiveKit/WebRTC videos. */
export const LIVE_WEBRTC_VIDEO_CLASS = 'live-webrtc-video';

type HideUntilPlayingEl = HTMLVideoElement & {
  __elixRevealOnPlaying?: () => void;
};

/**
 * Android Capacitor WebView draws a native white play icon on <video> before
 * the first frame. CSS opacity does NOT hide that overlay — visibility:hidden does.
 * Keep the element hidden until real `playing` (or already decoding frames).
 */
export function hideVideoUntilPlaying(el: HTMLVideoElement | null | undefined): void {
  if (!el) return;
  const flagged = el as HideUntilPlayingEl;
  if (flagged.__elixRevealOnPlaying) {
    el.removeEventListener('playing', flagged.__elixRevealOnPlaying);
    flagged.__elixRevealOnPlaying = undefined;
  }
  const hasFrames =
    !el.paused &&
    el.readyState >= 2 &&
    Boolean(el.srcObject || el.currentSrc || el.src);
  if (hasFrames) {
    el.style.visibility = 'visible';
    return;
  }
  el.style.visibility = 'hidden';
  const reveal = () => {
    el.style.visibility = 'visible';
    flagged.__elixRevealOnPlaying = undefined;
  };
  flagged.__elixRevealOnPlaying = reveal;
  el.addEventListener('playing', reveal, { once: true });
}

/** Strip Android WebView white play / media chrome without changing mute policy. */
export function stripVideoMediaChrome(el: HTMLVideoElement): void {
  el.classList.add('elix-no-media-chrome');
  el.setAttribute('playsinline', 'true');
  el.setAttribute('webkit-playsinline', 'true');
  el.setAttribute('x5-playsinline', 'true');
  el.setAttribute('x5-video-player-type', 'h5');
  el.setAttribute('x5-video-player-fullscreen', 'false');
  el.controls = false;
  el.removeAttribute('controls');
  el.playsInline = true;
  try {
    el.disablePictureInPicture = true;
  } catch {
    /* older WebViews */
  }
  try {
    el.setAttribute('controlslist', 'nodownload nofullscreen noremoteplayback');
  } catch {
    /* ignore */
  }
  try {
    el.disableRemotePlayback = true;
  } catch {
    /* older WebViews */
  }
}

/**
 * Feed / For You videos — hide chrome and kick play at the intended mute state.
 * Do NOT mute→unmute after play on Android (that paints the stuck white play icon).
 * Do NOT call el.load() — Android WebView often hangs forever after load().
 */
export function prepareFeedVideoEl(
  el: HTMLVideoElement | null | undefined,
  opts?: { muted?: boolean },
): void {
  if (!el) return;
  stripVideoMediaChrome(el);
  const muted = opts?.muted !== false;
  el.muted = muted;
  el.defaultMuted = muted;
  if (muted) el.setAttribute('muted', '');
  else el.removeAttribute('muted');
  const kick = () => {
    void el.play().catch(() => {});
  };
  kick();
  // Bind ready listeners once — runPlay/retries call this repeatedly.
  const flagged = el as HTMLVideoElement & { __elixFeedKickBound?: boolean };
  if (el.readyState < 2 && !flagged.__elixFeedKickBound) {
    flagged.__elixFeedKickBound = true;
    el.addEventListener('loadeddata', kick, { once: true });
    el.addEventListener('canplay', kick, { once: true });
  }
}

/**
 * Android Capacitor WebView shows a stuck white play icon on <video> when
 * autoplay is blocked (often because the element is unmuted). Live audio is
 * carried on separate <audio> attachments — keep video muted and kick play().
 */
export function prepareLiveVideoEl(el: HTMLVideoElement | null | undefined): void {
  if (!el) return;
  el.classList.add(LIVE_WEBRTC_VIDEO_CLASS);
  stripVideoMediaChrome(el);
  el.muted = true;
  el.defaultMuted = true;
  el.setAttribute('muted', '');
  if (!el.getAttribute('poster')) {
    el.setAttribute('poster', LIVE_VIDEO_TRANSPARENT_POSTER);
  }
  hideVideoUntilPlaying(el);
  const kick = () => {
    void el.play().catch(() => {});
  };
  kick();
  const flagged = el as HTMLVideoElement & { __elixLiveKickBound?: boolean };
  if (el.readyState < 2 && !flagged.__elixLiveKickBound) {
    flagged.__elixLiveKickBound = true;
    el.addEventListener('loadeddata', kick, { once: true });
    el.addEventListener('canplay', kick, { once: true });
  }
}
