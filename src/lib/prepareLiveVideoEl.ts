/** 1×1 transparent GIF — avoids Android WebView default poster / white play icon. */
export const LIVE_VIDEO_TRANSPARENT_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** CSS class: hide WebView media chrome on LiveKit/WebRTC videos. */
export const LIVE_WEBRTC_VIDEO_CLASS = 'live-webrtc-video';

type HideUntilPlayingEl = HTMLVideoElement & {
  __elixRevealOnPlaying?: () => void;
};

/**
 * Android Capacitor WebView draws a native white play icon on empty <video>
 * before the first frame. CSS opacity does NOT hide that overlay —
 * visibility:hidden does.
 *
 * Reveal owner: first decoded frame via requestVideoFrameCallback when available,
 * else media events (`loadeddata` / `playing` / `loadedmetadata`), else MediaStream
 * track `unmute` when the element has srcObject.
 */
function hideVideoUntilPlaying(el: HTMLVideoElement | null | undefined): void {
  if (!el) return;
  const flagged = el as HideUntilPlayingEl;
  if (flagged.__elixRevealOnPlaying) {
    el.removeEventListener('playing', flagged.__elixRevealOnPlaying);
    el.removeEventListener('loadeddata', flagged.__elixRevealOnPlaying);
    el.removeEventListener('loadedmetadata', flagged.__elixRevealOnPlaying);
    flagged.__elixRevealOnPlaying = undefined;
  }

  const reveal = () => {
    el.style.visibility = 'visible';
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
  el.addEventListener('loadedmetadata', onFrame, { once: true });

  const rvfc = (el as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
  }).requestVideoFrameCallback;
  if (typeof rvfc === 'function') {
    rvfc.call(el, () => reveal());
  }

  const stream = el.srcObject;
  if (stream && typeof MediaStream !== 'undefined' && stream instanceof MediaStream) {
    for (const track of stream.getVideoTracks()) {
      const onUnmute = () => {
        track.removeEventListener('unmute', onUnmute);
        onFrame();
      };
      track.addEventListener('unmute', onUnmute);
      if (!track.muted && track.readyState === 'live') onFrame();
    }
  }
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

/** CSS class: hide WebView media chrome on gift overlay URL videos. */
export const GIFT_OVERLAY_VIDEO_CLASS = 'gift-overlay-video';

/**
 * Gift overlay URL videos — strip chrome, transparent poster.
 * Always visible: hiding until `playing` swallowed gifts on the creator camera page.
 * Keep muted on Android; unmute-after-play paints the stuck white play icon.
 */
export function prepareGiftVideoEl(
  el: HTMLVideoElement | null | undefined,
  opts?: { muted?: boolean },
): void {
  if (!el) return;
  el.classList.add(GIFT_OVERLAY_VIDEO_CLASS);
  stripVideoMediaChrome(el);
  el.setAttribute('poster', LIVE_VIDEO_TRANSPARENT_POSTER);
  const muted = opts?.muted !== false;
  el.muted = muted;
  el.defaultMuted = muted;
  if (muted) el.setAttribute('muted', '');
  else el.removeAttribute('muted');
  el.style.visibility = 'visible';
  const kick = () => {
    void el.play().catch(() => {});
  };
  kick();
  const flagged = el as HTMLVideoElement & { __elixGiftKickBound?: boolean };
  if (el.readyState < 2 && !flagged.__elixGiftKickBound) {
    flagged.__elixGiftKickBound = true;
    el.addEventListener('loadeddata', kick, { once: true });
    el.addEventListener('canplay', kick, { once: true });
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

  const stream = el.srcObject instanceof MediaStream ? el.srcObject : null;
  const streamKey = stream?.id || '';
  const flagged = el as HTMLVideoElement & {
    __elixLiveKickBound?: boolean;
    __elixPreparedStreamId?: string;
  };

  // Refs often fire before srcObject is attached (Create / Live). Hiding then
  // never re-running reveal leaves a permanent black camera.
  if (!streamKey) {
    flagged.__elixPreparedStreamId = undefined;
    void el.play().catch(() => {});
    return;
  }

  const sameStream = flagged.__elixPreparedStreamId === streamKey;
  const stuckHidden = el.style.visibility === 'hidden';
  const hasFrame = el.videoWidth > 0 || el.readyState >= 2;

  // Same stream already showing — only kick play (do not re-hide).
  if (sameStream && !stuckHidden && hasFrame) {
    void el.play().catch(() => {});
    return;
  }

  // Same stream stuck hidden/paused after a prior hide cycle — force visible.
  if (sameStream && stuckHidden && hasFrame) {
    el.style.visibility = 'visible';
    void el.play().catch(() => {});
    return;
  }

  flagged.__elixPreparedStreamId = streamKey;

  hideVideoUntilPlaying(el);
  const kick = () => {
    void el.play().catch(() => {});
  };
  kick();
  if (el.readyState < 2 && !flagged.__elixLiveKickBound) {
    flagged.__elixLiveKickBound = true;
    el.addEventListener('loadeddata', kick, { once: true });
    el.addEventListener('canplay', kick, { once: true });
  }
}
