import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elixstarlive.app',
  appName: 'Elix Star Live',
  webDir: 'dist',
  server: {
    // Do NOT set hostname to www.elixstarlive.co.uk — Capacitor would intercept
    // that host and login /api calls never reach the real Neon backend.
    androidScheme: 'http',
  },
  plugins: {
    // Native HTTP so phone login works against the real API (bypasses WebView CORS/CORP).
    CapacitorHttp: {
      enabled: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    App: {
      deepLinkingEnabled: true,
      deepLinkingCustomScheme: 'elixstar',
    },
    // iOS: do not resize/scale the WebView when the keyboard opens.
    // Accessory prev/next/Done bar is hidden from JS on boot (see main.tsx).
    Keyboard: {
      resize: 'none',
    },
  },
  // Deep link configuration
  ios: {
    scheme: 'elixstar',
    // CSS env(safe-area-inset-*) owns top/bottom — auto-adjusts every iPhone size.
    // "automatic" double-insets with CSS and broke smaller notches (e.g. 13 Pro).
    contentInset: 'never',
  },
  android: {
    scheme: 'elixstar',
    allowMixedContent: false,
  },
};

export default config;
