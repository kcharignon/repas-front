import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'

import { useSessionStore } from './session'

declare module 'vue-router' {
  interface RouteMeta {
    /** Accessible sans connexion (connexion, inscription, catalogue du design). */
    public?: boolean
    /** Réservée aux visiteurs : un utilisateur connecté est renvoyé à l'accueil. */
    guestOnly?: boolean
    /** Réservée aux administrateurs : les autres sont renvoyés à la liste de courses (le back refuse aussi, 403). */
    admin?: boolean
  }
}

/** Une redirection de connexion ne doit mener qu'à une page du site (pas de `//autre-site`, pas de `https://…`). */
export function safeRedirect(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export async function sessionGuard(to: RouteLocationNormalized): Promise<true | RouteLocationRaw> {
  const session = useSessionStore()
  await session.restore()

  if (to.meta.guestOnly && session.isAuthenticated) return safeRedirect(to.query.redirect)
  if (!to.meta.public && !to.meta.guestOnly && !session.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.admin && !session.isAdmin) return { name: 'shopping-list' }

  return true
}
