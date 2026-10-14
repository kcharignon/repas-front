import { createRouter, createWebHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    // Catalogue du design système : à retirer du build de production à la bascule (ADR 0003).
    { path: '/design', name: 'design', component: () => import('@/views/DesignView.vue') },
  ],
})

export default router
