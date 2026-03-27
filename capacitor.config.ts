import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elixstarlive.app',
  appName: 'Elix Star Live',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    hostname: 'www.elixstarlive.co.uk',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#000000',
      showSpinner: false,
      androidSpinnerStyle: 'small',
      iosSpinnerStyle: 'small',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
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
