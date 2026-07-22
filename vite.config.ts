import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';
// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    sourcemap: mode !== 'production' && mode !== 'store',
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production' || mode === 'store',
        drop_debugger: true,
        passes: 2,
      },
    },
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // lucide-react is used app-wide (loads on first paint); keep it here.
          'vendor-ui': ['lucide-react', 'clsx', 'tailwind-merge'],
          // framer-motion is only used by live pages — isolate it so it is not
          // pulled into the first-paint vendor-ui chunk.
          'vendor-motion': ['framer-motion'],
          'vendor-state': ['zustand'],
        },
      },
    },
  },
  server: {
    https: true,
    host: true,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // WebSocket for live rooms — backend serves ws on port 8080
      '/live': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [
          // Only include Trae dev locator in development mode
          ...(mode === 'development' ? ['react-dev-locator'] : []),
        ],
      },
    }),
    /*
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.svg'],
      manifest: {
        name: 'Elix Star Live',
        short_name: 'ElixStar',
        description: 'The ultimate video social platform',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    }),
    */
    tsconfigPaths(),
    basicSsl(),
  ],
  test: {
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Money DB suite is isolated — run via `npm run test:money` only.
      '**/moneyIntegration.test.ts',
    ],
  },
}))
