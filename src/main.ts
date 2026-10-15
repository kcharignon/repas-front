import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'

import './design/theme.css'
import App from './App.vue'
import { createQueryClient } from './api/query'
import { i18n } from './i18n'
import { keepActiveListOffline } from './offline/persistence'
import { createAppRouter } from './router'

const app = createApp(App)
const queryClient = createQueryClient()

app.use(createPinia())
app.use(VueQueryPlugin, { queryClient })
app.use(i18n)
keepActiveListOffline(queryClient)
app.use(createAppRouter())

app.mount('#app')

if (import.meta.env.PROD)
  void import('./pwa').then(({ registerServiceWorker }) => registerServiceWorker())
