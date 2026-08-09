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
  },
  // Deep link configuration
  ios: {
    scheme: 'elixstar',
    contentInset: 'automatic',
  },
  android: {
    scheme: 'elixstar',
    allowMixedContent: false,
  },
};

export default config;
