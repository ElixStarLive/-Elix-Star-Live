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
