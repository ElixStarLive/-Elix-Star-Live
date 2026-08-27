import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elixstarlive.app',
  appName: 'Elix Star Live',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
