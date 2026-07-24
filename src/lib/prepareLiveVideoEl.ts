/** 1×1 transparent GIF — avoids Android WebView default poster / white play icon. */
export const LIVE_VIDEO_TRANSPARENT_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** CSS class: hide WebView media chrome on LiveKit/WebRTC videos. */
export const LIVE_WEBRTC_VIDEO_CLASS = 'live-webrtc-video';

type HideUntilPlayingEl = HTMLVideoElement & {
  __elixRevealOnPlaying?: () => void;
  __elixRevealPoll?: ReturnType<typeof setInterval>;
  __elixRevealTimer?: ReturnType<typeof setTimeout>;
};

/**
 * Android Capacitor WebView draws a native white play icon on empty <video>
 * before the first frame. CSS opacity does NOT hide that overlay —
 * visibility:hidden does.
 *
 * Important: LiveKit/WebRTC (srcObject) often never fires `playing` on Android.
 * Poll videoWidth and, for stream media only, reveal after a short timeout so
 * For You live cards are not stuck permanently blank.
 * File/URL gifts keep waiting for a real frame (GiftOverlay owns that path).
 */
export function hideVideoUntilPlaying(el: HTMLVideoElement | null | undefined): void {
  if (!el) return;
  const flagged = el as HideUntilPlayingEl;
  if (flagged.__elixRevealOnPlaying) {
    el.removeEventListener('playing', flagged.__elixRevealOnPlaying);
    el.removeEventListener('loadeddata', flagged.__elixRevealOnPlaying);
    flagged.__elixRevealOnPlaying = undefined;
  }
  if (flagged.__elixRevealPoll != null) {
    clearInterval(flagged.__elixRevealPoll);
    flagged.__elixRevealPoll = undefined;
  }
  if (flagged.__elixRevealTimer != null) {
    clearTimeout(flagged.__elixRevealTimer);
    flagged.__elixRevealTimer = undefined;
  }

  const reveal = () => {
    el.style.visibility = 'visible';
    if (flagged.__elixRevealPoll != null) {
      clearInterval(flagged.__elixRevealPoll);
      flagged.__elixRevealPoll = undefined;
    }
    if (flagged.__elixRevealTimer != null) {
      clearTimeout(flagged.__elixRevealTimer);
      flagged.__elixRevealTimer = undefined;
    }
    flagged.__elixRevealOnPlaying = undefined;
  };

  if (el.videoWidth > 0 && el.readyState >= 2) {
    reveal();
    return;
  }

  el.style.visibility = 'hidden';
  const onFrame = () => {
    if (el.videoWidth > 0 || (!el.paused && el.readyState >= 2)) reveal();
  };
  flagged.__elixRevealOnPlaying = onFrame;
  el.addEventListener('playing', onFrame, { once: true });
  el.addEventListener('loadeddata', onFrame, { once: true });

  flagged.__elixRevealPoll = setInterval(() => {
    if (el.videoWidth > 0) reveal();
  }, 50);

  // LiveKit remote tracks on Android often skip `playing` — don't leave For You blank.
  // Only auto-reveal for MediaStream (camera / LiveKit). URL gifts stay hidden until a frame.
  const isStreamMedia = Boolean(el.srcObject);
  flagged.__elixRevealTimer = setTimeout(() => {
    flagged.__elixRevealTimer = undefined;
    if (isStreamMedia) {
      reveal();
      return;
    }
    if (flagged.__elixRevealPoll != null) {
      clearInterval(flagged.__elixRevealPoll);
      flagged.__elixRevealPoll = undefined;
    }
  }, 900);
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
