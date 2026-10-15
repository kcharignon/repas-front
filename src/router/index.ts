import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

import { sessionGuard } from '@/session/guard'

export const routes: RouteRecordRaw[] = [
  {
    path: '/connexion',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/inscription',
    name: 'register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { guestOnly: true },
  },
  // Catalogue du design système : à retirer du build de production à la bascule (ADR 0003).
  {
    path: '/design',
    name: 'design',
    component: () => import('@/views/DesignView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/app/AppShell.vue'),
    children: [
      { path: '', name: 'home', redirect: { name: 'shopping-list' } },
      {
        path: 'liste',
        name: 'shopping-list',
        component: () => import('@/features/shopping-lists/ShoppingListView.vue'),
      },
      { path: 'moi', name: 'account', component: () => import('@/views/AccountView.vue') },
    ],
  },
]

/** Le routeur de l'application (avec la garde de session) ; les tests construisent le leur avec `routes`. */
export function createAppRouter() {
  const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes })
  router.beforeEach(sessionGuard)

  return router
}
