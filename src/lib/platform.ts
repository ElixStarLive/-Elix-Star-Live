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
 */
export async function nativeShareUrl(opts: { title?: string; text?: string; url: string }): Promise<boolean> {
  if (platform.isNative) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: opts.title, text: opts.text, url: opts.url, dialogTitle: opts.title });
      return true;
    } catch { /* user cancelled or unsupported */ }
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
      return true;
    } catch { /* user cancelled */ }
  }
  try {
    await navigator.clipboard.writeText(opts.url);
    return true;
  } catch {
    return false;
  }
}
