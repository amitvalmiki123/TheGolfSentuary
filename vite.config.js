import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Sur Sangam — Music Player',
        short_name: 'Sur Sangam',
        description: 'Dark Mode Aesthetic Music Player • Like Gaana, JioSaavn, Spotify — Punjabi, Hindi, Love, 90s, Bollywood, Indie, Trending • Offline downloads • Local files • Real-time search',
        theme_color: '#060306',
        background_color: '#060306',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'unsplash-images', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 } }
          },
          {
            urlPattern: /^https:\/\/www\.soundhelix\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'audio-cache', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 } }
          },
          {
            urlPattern: /^https:\/\/itunes\.apple\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'itunes-api', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 } }
          },
          {
            urlPattern: /^https:\/\/saavn\.dev\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'saavn-api', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 } }
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3001' },
    hmr: { clientPort: 443 },
    allowedHosts: true,
    headers: { 'X-Frame-Options': 'ALLOWALL' }
  },
  preview: { host: '0.0.0.0', port: 5173 }
})
