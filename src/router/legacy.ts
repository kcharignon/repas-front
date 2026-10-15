import type { RouteRecordRaw, RouteRecordRedirectOption } from 'vue-router'

/**
 * Les adresses de l'ancienne interface Twig (signets, liens reçus) mènent à leur équivalent dans le front (plan du front,
 * section 10 : table de redirections de la bascule). Les formulaires de création et de modification d'un référentiel
 * d'administration (`/admin/unit/create`, `/admin/unit/{slug}/update`…) retombent sur la liste : le front les ouvre en fenêtre.
 */
const to =
  (
    name: string,
    params: (route: {
      params: Record<string, string | string[]>
    }) => Record<string, string | string[]> = () => ({}),
  ): RouteRecordRedirectOption =>
  (route) => ({ name, params: params(route) })

const slug = (route: { params: Record<string, string | string[]> }) => ({
  slug: route.params.slug ?? '',
})
const id = (route: { params: Record<string, string | string[]> }) => ({ id: route.params.id ?? '' })

const admin = (twig: string, name: string): RouteRecordRaw[] => [
  { path: `/admin/${twig}`, redirect: to(name) },
  { path: `/admin/${twig}/create`, redirect: to(name) },
  { path: `/admin/${twig}/:key/update`, redirect: to(name) },
]

export const legacyRoutes: RouteRecordRaw[] = [
  { path: '/login', redirect: to('login') },
  { path: '/registration', redirect: to('register') },
  { path: '/shopping-list/active', redirect: to('shopping-list') },
  { path: '/shopping-list', redirect: to('shopping-lists') },
  { path: '/shopping-list/:id', redirect: to('shopping-list-detail', id) },
  { path: '/recipes', redirect: to('recipes') },
  { path: '/recipes/other-people', redirect: to('recipes-others') },
  {
    path: '/recipe/type/:slug',
    redirect: (route) => ({
      name: 'recipes',
      params: {},
      query: { type: String(route.params.slug) },
    }),
  },
  { path: '/recipe', redirect: to('recipe-new') },
  { path: '/recipe/:id', redirect: to('recipe', id) },
  { path: '/recipe/:id/update', redirect: to('recipe-edit', id) },
  { path: '/department', redirect: to('departments') },
  { path: '/department/:slug', redirect: to('department', slug) },
  { path: '/ingredient', redirect: to('ingredient-new') },
  { path: '/ingredient/:slug', redirect: to('ingredient-edit', slug) },
  { path: '/user/:id', redirect: to('account') },
  ...admin('unit', 'admin-units'),
  ...admin('department', 'admin-departments'),
  ...admin('recipe-type', 'admin-recipe-types'),
  ...admin('conversion', 'admin-conversions'),
  { path: '/admin/user', redirect: to('admin-users') },
]
