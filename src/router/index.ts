import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

import { sessionGuard } from '@/session/guard'
import { legacyRoutes } from './legacy'

// Catalogue du design système : un outil de développement (ADR 0003). Il n'existe pas dans le build de production, sauf demande
// explicite (`VITE_DESIGN_CATALOG=true` : la CI le garde pour son test d'accessibilité).
const catalog: RouteRecordRaw[] =
  import.meta.env.DEV || import.meta.env.VITE_DESIGN_CATALOG === 'true'
    ? [
        {
          path: '/design',
          name: 'design',
          component: () => import('@/views/DesignView.vue'),
          meta: { public: true },
        },
      ]
    : []

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
  {
    path: '/verification-email',
    name: 'check-email',
    component: () => import('@/views/CheckEmailView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/confirmation-email',
    name: 'confirm-email',
    component: () => import('@/views/ConfirmEmailView.vue'),
    meta: { public: true },
  },
  ...catalog,
  ...legacyRoutes,
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
        path: 'drive/envoi/:listId',
        name: 'drive-send',
        component: () => import('@/features/drive/DriveSendView.vue'),
      },
      {
        path: 'drive/retour',
        name: 'drive-return',
        component: () => import('@/features/drive/DriveReturnView.vue'),
      },
      {
        path: 'drive/reglages',
        name: 'drive-settings',
        component: () => import('@/features/drive/DrivePlaceholderView.vue'),
        props: { topic: 'settings' },
      },
      {
        path: 'drive/aide',
        name: 'drive-help',
        component: () => import('@/features/drive/DrivePlaceholderView.vue'),
        props: { topic: 'help' },
      },
      {
        path: 'drive/produits',
        name: 'drive-products',
        component: () => import('@/features/drive/ProductsView.vue'),
      },
      {
        path: 'drive/produits/:slug',
        name: 'drive-product',
        component: () => import('@/features/drive/ProductDetailView.vue'),
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
      {
        path: 'admin',
        name: 'admin',
        component: () => import('@/features/admin/AdminHubView.vue'),
        meta: { admin: true },
      },
      {
        path: 'admin/unites',
        name: 'admin-units',
        component: () => import('@/features/admin/UnitsAdminView.vue'),
        meta: { admin: true },
      },
      {
        path: 'admin/rayons',
        name: 'admin-departments',
        component: () => import('@/features/admin/DepartmentsAdminView.vue'),
        meta: { admin: true },
      },
      {
        path: 'admin/types-de-recette',
        name: 'admin-recipe-types',
        component: () => import('@/features/admin/RecipeTypesAdminView.vue'),
        meta: { admin: true },
      },
      {
        path: 'admin/conversions',
        name: 'admin-conversions',
        component: () => import('@/features/admin/ConversionsAdminView.vue'),
        meta: { admin: true },
      },
      {
        path: 'admin/utilisateurs',
        name: 'admin-users',
        component: () => import('@/features/admin/UsersAdminView.vue'),
        meta: { admin: true },
      },
      { path: 'moi', name: 'account', component: () => import('@/views/AccountView.vue') },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { public: true },
  },
]

/** Le routeur de l'application (avec la garde de session) ; les tests construisent le leur avec `routes`. */
export function createAppRouter() {
  const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes })
  router.beforeEach(sessionGuard)

  return router
}
