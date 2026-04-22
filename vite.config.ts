import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    hmr: true,
    host: '0.0.0.0',
    port: 3015,
    watch: {
      ignored: [
        '**/.plugin-data/**',
        '**/src/app/components/saved/**',
      ],
    },
    allowedHosts: [
      'localhost',
      'api.udaredge.com',
      'udaredge.com',
      'www.udaredge.com',
    ],
    proxy: {
      '/api': {
        target: 'https://api.udaredge.com',
        changeOrigin: true,
      },
    },
  },

  plugins: [
    react(),
    tailwindcss(),

    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',

      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
      },

      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],

      manifest: {
        name: 'Udar — Gestión de Concesionarios',
        short_name: 'Udar',
        description: 'Plataforma SaaS para gestión de concesionarios de vehículos de segunda mano',
        theme_color: '#030213',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/saas/dashboard',
        scope: '/',

        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },

      devOptions: {
        enabled: false,
      },
    }),
  ],

  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },

  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
})