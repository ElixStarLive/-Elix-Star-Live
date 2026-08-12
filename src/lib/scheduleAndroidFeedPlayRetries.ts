/**
 * Android WebView feed play retries — same delays/behavior as EnhancedVideoPlayer.
 */

import { platform } from './platform';

export function scheduleAndroidFeedPlayRetries(args: {
  delaysMs: number[];
  stillMine: () => boolean;
  getEl: () => HTMLVideoElement | null;
  onAlreadyPlaying: () => void;
  runPlay: (el: HTMLVideoElement) => void;
}): Array<ReturnType<typeof setTimeout>> {
  if (!platform.isAndroid) return [];
  return args.delaysMs.map((ms) =>
    setTimeout(() => {
      if (!args.stillMine()) return;
      const el = args.getEl();
      if (!el) return;
      if (!el.paused && !el.ended) {
        args.onAlreadyPlaying();
        return;
      }
      args.runPlay(el);
    }, ms),
  );
}
