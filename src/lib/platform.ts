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

/** Copy text using Capacitor Clipboard on native, otherwise navigator.clipboard. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (platform.isNative) {
      const { Clipboard } = await import('@capacitor/clipboard');
      await Clipboard.write({ string: text });
      // #region agent log
      fetch('http://127.0.0.1:7293/ingest/e7fb8ad3-ac4d-422a-955a-8c318a5cd9e2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fa77db'},body:JSON.stringify({sessionId:'fa77db',runId:'conn-audit',hypothesisId:'H5',location:'platform.ts:copyTextToClipboard',message:'native clipboard write',data:{ok:true,len:text.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
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
  return copyTextToClipboard(opts.url);
}
