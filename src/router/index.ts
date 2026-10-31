import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

import { driveBridge } from '@/features/drive/bridge'
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
  {
    path: '/mot-de-passe-oublie',
    name: 'forgot-password',
    component: () => import('@/views/ForgotPasswordView.vue'),
    meta: { guestOnly: true },
  },
  {
    // Le lien reçu par e-mail (`?token=…`, ADR 0026 du back) : ouvert à tous, même depuis un navigateur déjà connecté.
    path: '/mot-de-passe-oublie/confirmation',
    name: 'reset-password',
    component: () => import('@/views/ResetPasswordView.vue'),
    meta: { public: true },
  },
  {
    // Installer l'application Android (DRV-639) : publique, pour qu'on puisse envoyer son adresse à un proche. Dans l'application, il n'y a rien
    // à installer : la page de mise à jour.
    path: '/installer',
    name: 'install',
    component: () => import('@/features/drive/InstallView.vue'),
    meta: { public: true },
    beforeEnter: () =>
      driveBridge.isAvailable() ? { name: 'drive-help', hash: '#mise-a-jour' } : true,
  },
  ...catalog,
  {
    // La politique de confidentialité de tout Repas (STORE-010) : publique, SANS redirection, car son adresse est donnée à Google Play et à Amazon
    // (skill Alexa). Une page rendue par le navigateur : le Caddy du front renvoie `index.html` (200) pour cette adresse.
    path: '/confidentialite',
    name: 'privacy',
    component: () => import('@/views/PrivacyView.vue'),
    meta: { public: true },
  },
  {
    // La liaison du compte pour Alexa (VOX-401) : l'application Alexa ouvre cette page ; sans session, la garde renvoie à la connexion
    // avec l'adresse complète (requête comprise) et la connexion ramène ici.
    path: '/alexa/lier',
    name: 'alexa-link',
    component: () => import('@/features/voice/AlexaLinkView.vue'),
  },
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
        component: () => import('@/features/drive/DriveSettingsView.vue'),
      },
      {
        path: 'drive/aide',
        name: 'drive-help',
        component: () => import('@/features/drive/DriveHelpView.vue'),
        // Dans un navigateur il n'y a rien à mettre à jour : la page publique d'installation (DRV-639)
        beforeEnter: () => (driveBridge.isAvailable() ? true : { name: 'install' }),
      },
      {
        path: 'drive/conditions',
        name: 'drive-terms',
        component: () => import('@/features/drive/DriveTermsView.vue'),
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
        path: 'ingredients/doublons',
        name: 'ingredient-duplicates',
        component: () => import('@/features/ingredients/DuplicatesView.vue'),
      },
      {
        path: 'ingredients/a-regler',
        name: 'ingredients-to-fix',
        component: () => import('@/features/ingredients/IngredientsToFixView.vue'),
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
      {
        // Les types de liste de courses (LST-006) : l'écran des types, puis la fiche d'un type
        path: 'moi/types-de-liste',
        name: 'list-types',
        component: () => import('@/features/list-types/ListTypesView.vue'),
      },
      {
        path: 'moi/types-de-liste/:id',
        name: 'list-type',
        component: () => import('@/features/list-types/ListTypeView.vue'),
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
