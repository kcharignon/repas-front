import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { routes } from '@/router'

const resolve = async (path: string) => {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)

  return router.currentRoute.value
}

describe('anciennes adresses Twig', () => {
  it.each([
    ['/login', '/connexion'],
    ['/registration', '/inscription'],
    ['/shopping-list/active', '/liste'],
    ['/shopping-list', '/listes'],
    ['/shopping-list/abc-123', '/listes/abc-123'],
    ['/recipes', '/recettes'],
    ['/recipes/other-people', '/recettes/autres'],
    ['/recipe/type/plat', '/recettes?type=plat'],
    ['/recipe', '/recettes/nouvelle'],
    ['/recipe/abc-123', '/recettes/abc-123'],
    ['/recipe/abc-123/update', '/recettes/abc-123/modifier'],
    ['/department', '/rayons'],
    ['/department/legumes', '/rayons/legumes'],
    ['/ingredient', '/ingredients/nouveau'],
    ['/ingredient/sel', '/ingredients/sel/modifier'],
    ['/user/abc-123', '/moi'],
    ['/admin/unit', '/admin/unites'],
    ['/admin/unit/create', '/admin/unites'],
    ['/admin/unit/gramme/update', '/admin/unites'],
    ['/admin/department', '/admin/rayons'],
    ['/admin/department/legumes/update', '/admin/rayons'],
    ['/admin/recipe-type', '/admin/types-de-recette'],
    ['/admin/recipe-type/create', '/admin/types-de-recette'],
    ['/admin/conversion/abc/update', '/admin/conversions'],
    ['/admin/user', '/admin/utilisateurs'],
  ])('%s mène à %s', async (twig, expected) => {
    expect((await resolve(twig)).fullPath).toBe(expected)
  })

  it('ne confond pas une recette nommée « type » avec le filtre par type', async () => {
    expect((await resolve('/recipe/type')).fullPath).toBe('/recettes/type')
  })
})

describe('page introuvable', () => {
  it("s'affiche pour une adresse inconnue, sans connexion requise", async () => {
    const route = await resolve('/nimporte/quoi')

    expect(route.name).toBe('not-found')
    expect(route.meta.public).toBe(true)
  })
})
