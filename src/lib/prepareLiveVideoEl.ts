/** 1×1 transparent GIF — avoids Android WebView default poster / white play icon. */
export const LIVE_VIDEO_TRANSPARENT_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** CSS class: hide WebView media chrome on LiveKit/WebRTC videos. */
export const LIVE_WEBRTC_VIDEO_CLASS = 'live-webrtc-video';

/**
 * Android Capacitor WebView shows a stuck white play icon on <video> when
 * autoplay is blocked (often because the element is unmuted). Live audio is
 * carried on separate <audio> attachments — keep video muted and kick play().
 */
export function prepareLiveVideoEl(el: HTMLVideoElement | null | undefined): void {
  if (!el) return;
  el.setAttribute('playsinline', 'true');
  el.setAttribute('webkit-playsinline', 'true');
  el.setAttribute('x5-playsinline', 'true');
  el.setAttribute('x5-video-player-type', 'h5');
  el.setAttribute('x5-video-player-fullscreen', 'false');
  el.controls = false;
  el.muted = true;
  el.defaultMuted = true;
  el.playsInline = true;
  try {
    el.disablePictureInPicture = true;
  } catch {
    /* older WebViews */
  }
  if (!el.getAttribute('poster')) {
    el.setAttribute('poster', LIVE_VIDEO_TRANSPARENT_POSTER);
  }
  void el.play().catch(() => {});
}
