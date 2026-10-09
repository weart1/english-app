/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Unit tests rely on a time zone with DST so that study-day boundary tests are meaningful.
// Forked test workers inherit this value.
process.env.TZ = 'Europe/Berlin';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Hosts allowed when testing on a phone through an HTTPS tunnel (see README).
const TUNNEL_HOSTS = ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.loca.lt'];

// Optional local HTTPS for phone testing: HTTPS_CERT=./ip.pem HTTPS_KEY=./ip-key.pem (made with mkcert).
const certFile = process.env.HTTPS_CERT;
const keyFile = process.env.HTTPS_KEY;
const https =
  certFile && keyFile && existsSync(certFile) && existsSync(keyFile)
    ? { cert: readFileSync(certFile), key: readFileSync(keyFile) }
    : undefined;

export default defineConfig(({ mode }) => ({
  server: { allowedHosts: TUNNEL_HOSTS, https },
  preview: { allowedHosts: TUNNEL_HOSTS, https },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  esbuild: {
    // Strip any stray debug logging from production bundles.
    pure: mode === 'production' ? ['console.log', 'console.debug', 'console.info'] : [],
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180.png', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'WordFlow',
        short_name: 'WordFlow',
        description: 'Тренажёр английских слов: интервальные повторения, карточки и упражнения.',
        lang: 'ru',
        dir: 'ltr',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        background_color: '#F7FAFF',
        theme_color: '#2F6BFF',
        categories: ['education'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cacheId: 'wordflow',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/sw\.js$/, /^\/workbox-/],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: ['es2022', 'safari16'],
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
  },
}));
