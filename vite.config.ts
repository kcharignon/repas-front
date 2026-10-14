import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// Le back de développement (docker compose du dépôt `repas`) : `/api` et `/images` passent par le serveur Vite, donc
// même origine, pas de CORS et le cookie de rafraîchissement (`Path=/api/auth`) est posé sur l'origine du front.
const target = loadEnv('development', process.cwd(), '').REPAS_API_URL || 'https://localhost:8443'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': { target, secure: false, changeOrigin: true },
      '/images': { target, secure: false, changeOrigin: true },
    },
  },
})
