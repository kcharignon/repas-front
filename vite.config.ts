import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const env = loadEnv('development', process.cwd(), '')

// Le back : `/api` et `/images` passent par le serveur Vite, donc même origine, pas de CORS et le cookie de rafraîchissement
// (`Path=/api/auth`) est posé sur l'origine du front. Dans Docker (`make up`) c'est `http://php`, le service du back de
// développement ; hors Docker, son HTTPS local (certificat auto-signé accepté par le proxy).
const target = env.REPAS_API_URL || 'https://localhost:8443'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
