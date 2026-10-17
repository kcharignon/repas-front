import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

const env = loadEnv('development', process.cwd(), '')

// Le back : `/api` et `/images` passent par le serveur Vite, donc même origine, pas de CORS et le cookie de rafraîchissement
// (`Path=/api/auth`) est posé sur l'origine du front. Dans Docker (`make up`) c'est `http://php`, le service du back de
// développement ; hors Docker, son HTTPS local (certificat auto-signé accepté par le proxy).
const target = env.REPAS_API_URL || 'https://localhost:8443'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    vueDevTools(),
    // Installable, et la coque de l'application (scripts, styles, polices) disponible hors-ligne. Aucune donnée de l'API n'est
    // mise en cache par le service worker : la copie hors-ligne de la liste vit dans l'application, au nom de l'utilisateur.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Repas',
        short_name: 'Repas',
        description: 'Recettes, ingrédients et listes de courses.',
        lang: 'fr',
        start_url: '/liste',
        scope: '/',
        display: 'standalone',
        background_color: '#F4F6F3',
        theme_color: '#1E6B4C',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,ico,svg}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/images\//],
        cleanupOutdatedCaches: true,
        // Une nouvelle version s'active tout de suite et prend la main sur les pages ouvertes, puis l'application se recharge
        // (`registerType: 'autoUpdate'`). Sans cela elle attendait que l'application soit fermée : le téléphone la garde ouverte
        // en arrière-plan et montrait l'ancienne version. Le plugin ne les règle seul qu'avec `injectRegister` à `auto` ou `null`.
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/images/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'images', expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Le protocole de l'agent du drive (DRV-302), partagé avec l'agent qui, lui, l'importe par chemin relatif.
      '@drive-protocol': fileURLToPath(new URL('./drive-agent/protocol/index.ts', import.meta.url)),
    },
  },
  server: {
    allowedHosts: ['localhost'],
    // Poste dont le système de fichiers ne notifie pas les changements (dossier Windows monté dans Docker).
    watch: { usePolling: env.VITE_USE_POLLING === 'true' },
    proxy: {
      '/api': { target, secure: false, changeOrigin: true },
      '/images': { target, secure: false, changeOrigin: true },
    },
  },
})
