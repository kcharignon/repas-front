import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'

import './design/theme.css'
import App from './App.vue'
import { createQueryClient } from './api/query'
import { i18n } from './i18n'
import { createAppRouter } from './router'

const app = createApp(App)

app.use(createPinia())
app.use(VueQueryPlugin, { queryClient: createQueryClient() })
app.use(i18n)
app.use(createAppRouter())

app.mount('#app')
