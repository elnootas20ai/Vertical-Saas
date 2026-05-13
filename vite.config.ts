import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function devApiProxyTarget(env: Record<string, string>) {
  const raw = (env.VITE_API_URL || '').trim();
  // Rutas relativas (/api, etc.): el proxy debe hablar con el backend real en LAN.
  if (!raw || raw === '/api' || (raw.startsWith('/') && !raw.startsWith('//'))) {
    const protocol = env.VITE_API_PROTOCOL || 'http';
    let host = env.VITE_API_HOST || 'localhost';
    const port = env.VITE_API_PORT || '3001';
    if (host === 'localhost') host = '127.0.0.1';
    return `${protocol}://${host}:${port}`;
  }
  try {
    const u = new URL(raw.replace(/\/+$/, ''));
    if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
    return u.origin;
  } catch {
    const protocol = env.VITE_API_PROTOCOL || 'http';
    let host = env.VITE_API_HOST || '127.0.0.1';
    const port = env.VITE_API_PORT || '3001';
    if (host === 'localhost') host = '127.0.0.1';
    return `${protocol}://${host}:${port}`;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = devApiProxyTarget(env);

  let appVersion = '0.0.0'
  try {
    const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
      version?: string
    }
    if (typeof pkg?.version === 'string') appVersion = pkg.version
  } catch {
    /* ignore */
  }

  return {
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },
    server: {
      hmr: true,
      host: '0.0.0.0',
      port: 3015,
      watch: {
        ignored: [
          '**/.plugin-data/**',
        ],
      },
      allowedHosts: [
        'localhost',
        'api.vertialapp.com',
        'vertialapp.com',
        'www.vertialapp.com',
      ],
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
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
        name: 'Vertial',
        short_name: 'Vertial',
        description: 'Plataforma SaaS multi-vertical',
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
  };
})