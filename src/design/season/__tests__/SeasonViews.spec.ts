import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, json, me, stubApi, eventually } from '@/__tests__/helpers'
import OfflineBanner from '@/app/OfflineBanner.vue'
import LoadError from '@/design/LoadError.vue'
import SeasonCorner from '@/design/season/SeasonCorner.vue'
import RecipesView from '@/features/recipes/RecipesView.vue'
import ShoppingListView from '@/features/shopping-lists/ShoppingListView.vue'
import { useSessionStore } from '@/session/session'
import NotFoundView from '@/views/NotFoundView.vue'
import AccountView from '@/views/AccountView.vue'

// ADR 0012 : les illustrations posées dans les écrans. Hors saison l'écran est celui du thème de base (aucune pièce) ; en saison la pièce est là.
// Les pièces se chargent à la demande : on attend qu'elles arrivent.

const HALLOWEEN = new Date(2026, 9, 20, 12)
const NOEL = new Date(2026, 11, 20, 12)
const pieces = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('svg[focusable="false"]')

const session = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/recipe-types': () =>
    json({ member: [{ slug: 'plat', name: 'Plat', image: '', order: 1 }], totalItems: 1 }),
  'GET /api/v1/recipe-types/plat/recipes': () => json({ member: [], totalItems: 0 }),
  'GET /api/v1/shopping-lists/active/summary': () =>
    json({ shoppingListId: null, quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
}

async function mountView(
  component: typeof RecipesView | typeof ShoppingListView | typeof AccountView,
) {
  stubApi(session)
  localStorage.setItem('repas.session', '1')
  const { plugins, router } = appContext()
  await useSessionStore().restore()
  await router.push('/')
  const wrapper = mount(component, { global: { plugins } })
  await flushPromises()

  return wrapper
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-season')
})
afterEach(() => vi.unstubAllGlobals())

describe('écrans illustrés en saison', () => {
  it('hors saison : aucune pièce, ni dans les recettes vides ni dans le titre', async () => {
    const wrapper = await mountView(RecipesView)

    await eventually(() => expect(wrapper.text()).toContain('pas encore de recette'))
    expect(pieces(wrapper)).toHaveLength(0)
  })

  for (const [label, date] of [
    ['Halloween', HALLOWEEN],
    ['Noël', NOEL],
  ] as const) {
    it(`${label} : les recettes vides montrent leur illustration et le titre sa pièce, deux pièces différentes`, async () => {
      vi.setSystemTime(date)

      const wrapper = await mountView(RecipesView)

      await eventually(() => expect(wrapper.text()).toContain('pas encore de recette'))
      await eventually(() => expect(pieces(wrapper)).toHaveLength(2))
      const [title, empty] = pieces(wrapper)
      expect(wrapper.get('h1').element.contains(title!.element)).toBe(true)
      expect(title!.html()).not.toBe(empty!.html())
      // Le titre reste lisible : la pièce est décorative, le texte seul porte le sens.
      expect(wrapper.get('h1').text()).toBe('Recettes')
    })

    it(`${label} : l'écran « aucune liste » montre son illustration au-dessus du titre`, async () => {
      vi.setSystemTime(date)

      const wrapper = await mountView(ShoppingListView)

      await eventually(() => expect(pieces(wrapper)).toHaveLength(1))
      const section = wrapper.get('section')
      expect(section.element.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
      expect(section.find('h1').exists()).toBe(true)
    })

    it(`${label} : « Moi » porte la pièce de son titre`, async () => {
      vi.setSystemTime(date)

      const wrapper = await mountView(AccountView)

      await eventually(() => expect(wrapper.find('h1 svg').exists()).toBe(true))
    })

    it(`${label} : la page introuvable montre son illustration, avec le même texte`, async () => {
      vi.setSystemTime(date)
      const { plugins } = appContext()

      const wrapper = mount(NotFoundView, { global: { plugins } })

      await eventually(() => expect(pieces(wrapper)).toHaveLength(1))
      expect(wrapper.text()).toContain('Page introuvable')
    })

    it(`${label} : l'erreur de chargement montre sa pièce et garde son alerte`, async () => {
      vi.setSystemTime(date)
      const { plugins } = appContext()

      const wrapper = mount(LoadError, { global: { plugins } })

      await eventually(() => expect(pieces(wrapper)).toHaveLength(1))
      expect(wrapper.get('[role="alert"]').text()).toContain('injoignable')
    })
  }

  it('hors saison : la page introuvable et l’erreur ne gardent que leur texte', () => {
    const { plugins } = appContext()

    expect(pieces(mount(NotFoundView, { global: { plugins } }))).toHaveLength(0)
    expect(pieces(mount(LoadError, { global: { plugins } }))).toHaveLength(0)
  })

  it('hors connexion : la pièce, chargée d’avance par le coin, remplace l’icône ; sans elle l’icône reste', async () => {
    vi.setSystemTime(HALLOWEEN)
    const { plugins } = appContext()
    const corner = mount(SeasonCorner, { global: { plugins } })
    await eventually(() => expect(corner.find('svg').exists()).toBe(true))

    // Le réseau tombe : le bandeau apparaît, la pièce est déjà en mémoire
    window.dispatchEvent(new Event('offline'))
    const banner = mount(OfflineBanner, { global: { plugins } })
    await eventually(() => expect(banner.find('svg[focusable="false"]').exists()).toBe(true))
    expect(banner.findAll('svg')).toHaveLength(1)
    window.dispatchEvent(new Event('online'))
  })

  it('hors connexion et hors saison : l’icône du bandeau, aucune pièce', async () => {
    const { plugins } = appContext()
    window.dispatchEvent(new Event('offline'))

    const banner = mount(OfflineBanner, { global: { plugins } })
    await flushPromises()

    expect(banner.findAll('svg')).toHaveLength(1)
    expect(banner.find('svg[focusable="false"]').exists()).toBe(false)
    window.dispatchEvent(new Event('online'))
  })

  it('décor coupé : aucune pièce, même en octobre', async () => {
    vi.setSystemTime(HALLOWEEN)
    localStorage.setItem('repas.season', 'halloween')

    const wrapper = await mountView(RecipesView)

    await eventually(() => expect(wrapper.text()).toContain('pas encore de recette'))
    expect(pieces(wrapper)).toHaveLength(0)
  })
})
