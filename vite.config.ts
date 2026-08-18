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
  // Dev prebundle must match modern deps (framer-motion, lucide, capacitor).
  // Without this, esbuild falls back to legacy browser targets and crashes optimizeDeps.
  esbuild: {
    target: 'esnext',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
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
    // Capacitor sync and Gradle rewrite android/** and ios/** on every build, so
    // watching them makes the dev server fire bursts of full page reloads.
    watch: {
      ignored: [
        '**/android/**',
        '**/ios/**',
        '**/dist/**',
        '**/docs/**',
      ],
    },
    proxy: {
      // Default: local backend. Set VITE_DEV_PROXY_TARGET to hit a remote API explicitly.
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: true,
      },
      '/live': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: true,
        ws: true,
      },
    },
  },
  plugins: [
    react(),
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
      // These assert exact pence movements on the single shared platform wallet
      // row, so they are only meaningful when no other file is spending at the
      // same time. vitest.money.config.ts runs them serially.
      '**/monetisation/paidGift.db.test.ts',
      '**/monetisation/appleIapPaidLot.db.test.ts',
      '**/monetisation/googleIapPaidLot.db.test.ts',
    ],
  },
}))
