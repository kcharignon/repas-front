import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'

import './design/theme.css'
import App from './App.vue'
import { applyStoredTheme, useThemeStore } from './design/theme'
import { createQueryClient } from './api/query'
import { i18n } from './i18n'
import { keepActiveListOffline } from './offline/persistence'
import { createAppRouter } from './router'
import { followSessionAcrossTabs } from './session/crossTab'

applyStoredTheme()

const app = createApp(App)
const queryClient = createQueryClient()

app.use(createPinia())
// Le thème choisi suit aussi ses changements en cours de session, pas seulement une fois « Moi » ouvert.
useThemeStore()
app.use(VueQueryPlugin, { queryClient })
app.use(i18n)
keepActiveListOffline(queryClient)
const router = createAppRouter()
app.use(router)
followSessionAcrossTabs(router)

app.mount('#app')

if (import.meta.env.PROD)
  void import('./pwa').then(({ registerServiceWorker }) => registerServiceWorker())
