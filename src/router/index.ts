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
      {
        path: 'listes',
        name: 'shopping-lists',
        component: () => import('@/features/shopping-lists/ShoppingListsView.vue'),
      },
      {
        path: 'listes/:id',
        name: 'shopping-list-detail',
        component: () => import('@/features/shopping-lists/ShoppingListDetailView.vue'),
      },
      {
        path: 'recettes',
        name: 'recipes',
        component: () => import('@/features/recipes/RecipesView.vue'),
      },
      {
        path: 'recettes/nouvelle',
        name: 'recipe-new',
        component: () => import('@/features/recipes/RecipeEditorView.vue'),
      },
      {
        path: 'recettes/autres',
        name: 'recipes-others',
        component: () => import('@/features/recipes/OtherRecipesView.vue'),
      },
      {
        path: 'recettes/:id',
        name: 'recipe',
        component: () => import('@/features/recipes/RecipeDetailView.vue'),
      },
      {
        path: 'recettes/:id/modifier',
        name: 'recipe-edit',
        component: () => import('@/features/recipes/RecipeEditorView.vue'),
      },
      {
        path: 'rayons',
        name: 'departments',
        component: () => import('@/features/ingredients/DepartmentsView.vue'),
      },
      {
        path: 'rayons/:slug',
        name: 'department',
        component: () => import('@/features/ingredients/DepartmentView.vue'),
      },
      {
        path: 'ingredients/nouveau',
        name: 'ingredient-new',
        component: () => import('@/features/ingredients/IngredientEditorView.vue'),
      },
      {
        path: 'ingredients/:slug/modifier',
        name: 'ingredient-edit',
        component: () => import('@/features/ingredients/IngredientEditorView.vue'),
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
