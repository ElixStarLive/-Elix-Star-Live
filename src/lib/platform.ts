/**
 * Platform Detection Utility
 * Detects whether the app is running as a native iOS/Android app (Capacitor)
 * or as a web app, and routes payment flows accordingly.
 */

import { Capacitor } from '@capacitor/core';

export const platform = {
  /** True if running inside a native iOS/Android app */
  isNative: Capacitor.isNativePlatform(),

  /** True if running on iOS (native) */
  isIOS: Capacitor.getPlatform() === 'ios',

  /** True if running on Android (native) */
  isAndroid: Capacitor.getPlatform() === 'android',

  /** True if running in a web browser */
  isWeb: Capacitor.getPlatform() === 'web',

  /** Get the current platform name */
  name: Capacitor.getPlatform() as 'ios' | 'android' | 'web',
};

/**
 * Determines the correct payment method for the current platform.
 * - iOS: MUST use Apple In-App Purchase (App Store Guideline 3.1.1)
 * - Android: Should use Google Play Billing
 * - Web: Digital payments are not processed here (mobile stores only)
 */
export function getPaymentMethod(): 'apple-iap' | 'google-play' | 'web' {
  if (platform.isIOS) return 'apple-iap';
  if (platform.isAndroid) return 'google-play';
  return 'web';
}

/**
 * Open a URL using the system browser on native or window.open on web.
 * On native Capacitor, `_system` opens the URL externally.
 */
export function openExternalLink(url: string): void {
  if (platform.isNative) {
    window.open(url, '_system');
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

/**
 * Trigger the native share sheet on iOS/Android, or the Web Share API,
 * or fall back to copying to clipboard.
 * Returns false only when nothing could be shared/copied (user cancel ≠ failure).
 */
export async function nativeShareUrl(opts: { title?: string; text?: string; url: string }): Promise<boolean> {
  const result = await nativeShareMedia({
    title: opts.title,
    text: opts.text,
    url: opts.url,
  });
  return result === 'shared' || result === 'copied';
}

export type NativeShareResult = 'shared' | 'copied' | 'cancelled' | 'unavailable';

function isShareAbort(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  if (!e) return false;
  if (e.name === 'AbortError') return true;
  const msg = (e.message || '').toLowerCase();
  return msg.includes('share canceled') || msg.includes('share cancelled') || msg.includes('abort');
}

/**
 * Share media file when the platform supports it, else URL/text, else clipboard.
 * Use from a click handler. Blob fetch may happen before this call.
 */
export async function nativeShareMedia(opts: {
  title?: string;
  text?: string;
  url?: string;
  blob?: Blob | null;
  filename?: string;
}): Promise<NativeShareResult> {
  const title = opts.title || 'Elix Star Live';
  const text = opts.text || 'Made with Elix Star Live';
  const url = opts.url || 'https://www.elixstarlive.co.uk';

  // 1) File share (Web Share Level 2 / WebViews that support files)
  if (opts.blob && opts.blob.size > 0 && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const type = opts.blob.type || 'application/octet-stream';
      const filename = opts.filename || (type.startsWith('image/') ? 'elixstar.jpg' : 'elixstar.webm');
      const file = new File([opts.blob], filename, { type });
      const data: ShareData = { files: [file], title, text };
      const can = typeof navigator.canShare !== 'function' || navigator.canShare(data);
      if (can) {
        await navigator.share(data);
        return 'shared';
      }
    } catch (err) {
      if (isShareAbort(err)) return 'cancelled';
      /* fall through to URL share */
    }
  }

  // 2) Native Capacitor share sheet (title / text / url)
  if (platform.isNative) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url, dialogTitle: title });
      return 'shared';
    } catch (err) {
      if (isShareAbort(err)) return 'cancelled';
      /* fall through */
    }
  }

  // 3) Web Share API with URL/text
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (isShareAbort(err)) return 'cancelled';
      /* fall through */
    }
  }

  // 4) Clipboard fallback
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return 'copied';
    }
  } catch {
    /* fall through */
  }

  return 'unavailable';
}
