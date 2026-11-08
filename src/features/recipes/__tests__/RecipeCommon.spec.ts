import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import type { Handler } from '@/__tests__/helpers'
import OtherRecipesView from '@/features/recipes/OtherRecipesView.vue'
import RecipeDetailView from '@/features/recipes/RecipeDetailView.vue'
import RecipeEditorView from '@/features/recipes/RecipeEditorView.vue'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'

// La version commune d'une recette Marmiton, corrigée ou supprimée par l'administrateur (MAR-005, ADR 0037 du back). Le back n'est jamais
// joint : un faux back par route. Un utilisateur ordinaire ne voit rien de plus qu'avant.

const LINK = 'https://www.marmiton.org/recettes/recette_the-tarte-au-citron-meringuee_22082.aspx'
const admin = { ...me, id: 'a1', roles: ['ROLE_USER', 'ROLE_ADMIN'], isAdmin: true }

const row = (slug: string, name: string, quantity: number, department = 'cremerie') => ({
  ingredientSlug: slug,
  ingredientName: name,
  ingredientImage: '',
  quantity,
  unitSlug: 'unite',
  unitSymbol: '',
  unitName: 'Unité',
  purchaseUnitSlug: 'unite',
  purchaseUnitName: 'Unité',
  convertible: true,
  departmentSlug: department,
  departmentName: department === 'cremerie' ? 'Crémerie' : 'Épicerie',
})

/** La version commune : sans propriétaire, ses ingrédients sont ceux du propriétaire réservé (aucun n'est dans la liste de l'administrateur). */
const common = {
  id: 'c1',
  name: 'Tarte au citron meringuée',
  serving: 6,
  typeSlug: 'dessert',
  typeName: 'Dessert',
  version: 3,
  secret: false,
  favorite: false,
  sourceUrl: LINK,
  originalId: null,
  ownerless: true,
  copyId: null,
  canEdit: true,
  rows: [row('jaune-reserve', 'Jaune d’œuf', 4), row('farine-reservee', 'Farine', 250, 'epicerie')],
}
/** La copie que l'administrateur en a faite. */
const copy = {
  ...common,
  id: 'm1',
  version: 1,
  originalId: 'c1',
  ownerless: false,
  copyId: null,
  rows: [row('jaune-admin', 'Jaune d’œuf', 4)],
}

const types = {
  member: [{ slug: 'dessert', name: 'Dessert', image: '', order: 1 }],
  totalItems: 1,
}
const backend = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(admin),
  'GET /api/v1/recipe-types': () => json(types),
  'GET /api/v1/shopping-lists/active/summary': () =>
    json({ shoppingListId: null, quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
}

async function mountView(
  component: typeof RecipeDetailView | typeof RecipeEditorView | typeof OtherRecipesView,
  path: string,
  handlers: Record<string, Handler>,
) {
  const fetchMock = stubApi({ ...backend, ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)
  const wrapper = mount(component, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })

  return { wrapper, context, fetchMock }
}

const buttons = (wrapper: { findAll: (selector: string) => { text: () => string }[] }) =>
  wrapper.findAll('main button, main a').map((element) => element.text().replace(/\s+/g, ' '))

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('« Recettes des autres » vu par l’administrateur', () => {
  const others = (member: Record<string, unknown>[]) => ({
    'GET /api/v1/recipes/other-people': () => json({ member, totalItems: member.length }),
  })
  const marmiton = (id: string, name: string, alreadyCopied: boolean) => ({
    id,
    name,
    typeName: 'Dessert',
    typeSlug: 'dessert',
    fromMarmiton: true,
    alreadyCopied,
    copyId: alreadyCopied ? 'm1' : null,
  })
  const ordinary = {
    id: 'o1',
    name: 'Gratin dauphinois',
    typeName: 'Plat',
    typeSlug: 'plat',
    fromMarmiton: false,
    alreadyCopied: false,
    copyId: null,
  }
  const open = (member: Record<string, unknown>[], user: unknown = admin, more = {}) =>
    mountView(OtherRecipesView, '/recettes/autres', {
      'GET /api/v1/me': () => json(user),
      ...others(member),
      ...more,
    })

  it('une version commune déjà copiée : pastille, « Tu as déjà ta copie » et « Ma copie » à la place de « Copier »', async () => {
    const { wrapper } = await open([marmiton('c1', 'Tarte au citron meringuée', true), ordinary])
    await vi.waitFor(() => expect(wrapper.find('li').exists()).toBe(true))

    const item = wrapper.findAll('li')[0]!
    expect(item.find('[data-marmiton-badge]').text()).toBe('Marmiton')
    expect(item.find('[data-have-copy]').text()).toBe('Tu as déjà ta copie')
    const link = item.find('[data-open-copy]')
    expect(link.text()).toBe('Ma copie')
    expect(link.element.tagName).toBe('BUTTON')
    expect(link.attributes('aria-label')).toBe('Ouvrir ma copie de Tarte au citron meringuée')
    expect(item.text()).not.toContain('Copier')
    // Un lien discret, pas un bouton contour
    expect(link.classes()).toContain('underline')
    expect(link.classes().join(' ')).not.toMatch(/border-/)
    // La fiche de la version commune reste ouvrable par le nom
    expect(item.find('a').attributes('href')).toBe('/recettes/c1')
  })

  it('une version commune pas encore copiée garde la pastille et « Copier »', async () => {
    const { wrapper } = await open([marmiton('c2', 'Gratin de courgettes', false)])
    await vi.waitFor(() => expect(wrapper.find('li').exists()).toBe(true))

    const item = wrapper.find('li')
    expect(item.find('[data-marmiton-badge]').exists()).toBe(true)
    expect(item.find('[data-have-copy]').exists()).toBe(false)
    expect(item.find('[data-open-copy]').exists()).toBe(false)
    expect(item.find('button').text()).toBe('Copier')
  })

  it('aucune phrase d’aide sur les versions communes, même pour l’administrateur', async () => {
    const { wrapper } = await open([marmiton('c1', 'Tarte', true), ordinary])
    await vi.waitFor(() => expect(wrapper.find('li').exists()).toBe(true))

    expect(wrapper.find('[data-common-help]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Touche-en une pour la corriger')
  })

  it('« Ma copie » ouvre SA copie par copyId, même renommée ou d’un autre type : aucune recherche', async () => {
    const { wrapper, context, fetchMock } = await open([
      { ...marmiton('c1', 'Tarte au citron meringuée', true), copyId: 'm9' },
    ])
    await vi.waitFor(() => expect(wrapper.find('[data-open-copy]').exists()).toBe(true))

    await wrapper.find('[data-open-copy]').trigger('click')
    await flushPromises()

    expect(context.router.currentRoute.value.name).toBe('recipe')
    expect(context.router.currentRoute.value.params.id).toBe('m9')
    expect(calls(fetchMock).filter((call) => call.includes('/recipe-types/'))).toEqual([])
  })

  it('sans copyId (back plus ancien) : pas de « Ma copie », « Copier » comme avant', async () => {
    const { wrapper } = await open([
      { ...marmiton('c1', 'Tarte', true), copyId: undefined, alreadyCopied: false },
    ])
    await vi.waitFor(() => expect(wrapper.find('li').exists()).toBe(true))

    expect(wrapper.find('[data-open-copy]').exists()).toBe(false)
    expect(wrapper.find('li button').text()).toBe('Copier')
  })

  describe('un utilisateur ordinaire : rien ne change', () => {
    it('ni phrase d’aide, ni « Ma copie » : la pastille et « Copier » seulement', async () => {
      const { wrapper } = await open([marmiton('c2', 'Gratin de courgettes', false), ordinary], me)
      await vi.waitFor(() => expect(wrapper.find('li').exists()).toBe(true))

      expect(wrapper.find('[data-common-help]').exists()).toBe(false)
      expect(wrapper.findAll('li').map((item) => item.find('button').text())).toEqual([
        'Copier',
        'Copier',
      ])
      expect(wrapper.find('[data-open-copy]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Tu as déjà ta copie')
    })

    it('même si le back disait « déjà copiée » : seul l’administrateur le montre', async () => {
      const { wrapper } = await open([marmiton('c1', 'Tarte', true)], me)
      await vi.waitFor(() => expect(wrapper.find('li').exists()).toBe(true))

      expect(wrapper.find('li button').text()).toBe('Copier')
      expect(wrapper.find('[data-have-copy]').exists()).toBe(false)
    })
  })
})

describe('la fiche de la version commune, lue par l’administrateur', () => {
  const handlers = (more: Record<string, Handler> = {}) => ({
    'GET /api/v1/recipes/c1': () => json(common),
    'GET /api/v1/recipe-types/dessert/recipes': () => json({ member: [], totalItems: 0 }),
    ...more,
  })
  async function open(more: Record<string, Handler> = {}) {
    const opened = await mountView(RecipeDetailView, '/recettes/c1', handlers(more))
    await vi.waitFor(() => expect(opened.wrapper.find('[data-common-banner]').exists()).toBe(true))
    await vi.waitFor(() => expect(buttons(opened.wrapper)).toContain('Copier'))

    return opened
  }

  it('dit « Version commune » et ce que ça change, avec Modifier pour seul bouton principal', async () => {
    const { wrapper } = await open()

    const banner = wrapper.find('[data-common-banner]')
    expect(banner.find('h2').text()).toBe('Version commune')
    expect(banner.text()).toContain(
      'Les prochains qui la copient auront ta version. Les copies déjà faites ne changent pas.',
    )
    const edit = wrapper.find('a[href="/recettes/c1/modifier"]')
    expect(edit.text()).toBe('Modifier')
    expect(edit.classes()).toContain('bg-primary')
    // Un seul bouton principal : tout le reste est secondaire
    expect(wrapper.findAll('main .bg-primary')).toHaveLength(1)
    // Le lien d'origine reste
    expect(wrapper.find('a[target="_blank"]').attributes('href')).toBe(LINK)
  })

  it('propose Copier, sans Ajouter à la liste ni favori ni pastille « Secrète »', async () => {
    const { wrapper } = await open()

    expect(buttons(wrapper)).toContain('Copier')
    expect(wrapper.text()).not.toContain('Ajouter')
    expect(wrapper.find('[aria-label^="Mettre"]').exists()).toBe(false)
    expect(wrapper.find('[data-secret-badge]').exists()).toBe(false)
  })

  it('« Supprimer cette recette » est tout en bas, en rouge de danger, à part de Modifier', async () => {
    const { wrapper } = await open()

    const order = buttons(wrapper)
    expect(order[order.length - 1]).toBe('Supprimer cette recette')
    const remove = wrapper.findAll('button').find((b) => b.text() === 'Supprimer cette recette')!
    expect(remove.classes()).toContain('text-danger')
    expect(remove.classes()).toContain('border-danger')
    // Après la liste des ingrédients
    const html = wrapper.html()
    expect(html.indexOf('Farine')).toBeLessThan(html.indexOf('Supprimer cette recette'))
    expect(buttons(wrapper)).not.toContain('Supprimer')
  })

  it('« Copier » copie la version commune (comme pour une recette d’un autre)', async () => {
    const { wrapper, fetchMock } = await open({
      'POST /api/v1/recipes/c1/copy': () =>
        new Response(null, { status: 201, headers: { Location: '/api/v1/recipes/m1' } }),
    })

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Copier')!
      .trigger('click')
    await flushPromises()

    expect(calls(fetchMock)).toContain('POST /api/v1/recipes/c1/copy')
    expect(buttons(wrapper)).toContain('Copiée')
  })

  describe('quand l’administrateur a déjà sa copie', () => {
    it('« Ta copie » remplace « Copier » et mène à copyId, même renommée ou d’un autre type', async () => {
      const { wrapper, fetchMock } = await mountView(RecipeDetailView, '/recettes/c1', {
        ...handlers({ 'GET /api/v1/recipes/c1': () => json({ ...common, copyId: 'm9' }) }),
      })
      await vi.waitFor(() => expect(buttons(wrapper)).toContain('Ta copie'))

      expect(buttons(wrapper)).not.toContain('Copier')
      expect(wrapper.find('a[href="/recettes/m9"]').text()).toBe('Ta copie')
      expect(calls(fetchMock)).not.toContain('GET /api/v1/recipes/m9')
    })
  })

  describe('supprimer', () => {
    const confirm = async (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) => {
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Supprimer cette recette')!
        .trigger('click')
      await flushPromises()
    }
    const dialog = () => document.body.querySelector('[role="dialog"]')

    it('demande confirmation avec les mots du produit', async () => {
      const { wrapper } = await open()

      await confirm(wrapper)

      expect(dialog()?.querySelector('h2')?.textContent).toBe('Supprimer la recette Marmiton ?')
      expect(dialog()?.textContent).toContain(
        'Elle disparaît de « Recettes des autres ». Les copies déjà faites restent à leurs auteurs.',
      )
      expect(
        Array.from(dialog()?.querySelectorAll('button') ?? []).map((b) => b.textContent),
      ).toEqual(expect.arrayContaining(['Supprimer', 'Annuler']))
    })

    it('Annuler ne supprime rien', async () => {
      const { wrapper, fetchMock } = await open()
      await confirm(wrapper)

      const cancel = Array.from(dialog()?.querySelectorAll('button') ?? []).find(
        (b) => b.textContent === 'Annuler',
      )!
      cancel.click()
      await flushPromises()

      expect(calls(fetchMock)).not.toContain('DELETE /api/v1/recipes/c1')
    })

    it('supprime puis revient à « Recettes des autres »', async () => {
      const { wrapper, context, fetchMock } = await open({
        'DELETE /api/v1/recipes/c1': () => new Response(null, { status: 204 }),
      })
      await confirm(wrapper)

      Array.from(dialog()?.querySelectorAll('button') ?? [])
        .find((b) => b.textContent === 'Supprimer')!
        .click()
      await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('recipes-others'))

      expect(calls(fetchMock)).toContain('DELETE /api/v1/recipes/c1')
    })

    it('409 (encore dans une liste de courses) : « Suppression impossible », en trois phrases, avec « Fermer »', async () => {
      const { wrapper, context } = await open({
        'DELETE /api/v1/recipes/c1': () =>
          json({ error: { message: 'RECIPE_USED_IN_SHOPPING_LIST' } }, { status: 409 }),
      })
      await confirm(wrapper)

      Array.from(dialog()?.querySelectorAll('button') ?? [])
        .find((b) => b.textContent === 'Supprimer')!
        .click()
      await vi.waitFor(() =>
        expect(dialog()?.querySelector('h2')?.textContent).toBe('Suppression impossible'),
      )

      expect(dialog()?.textContent).toContain(
        'Des listes de courses utilisent encore cette recette. Rien n’a été supprimé. Réessaie quand ces listes seront terminées.',
      )
      expect(dialog()?.textContent).not.toMatch(/RECIPE_USED|409/)
      // Pas de message en plus, et on reste sur la fiche
      expect(useNotificationsStore().items).toEqual([])
      expect(context.router.currentRoute.value.name).toBe('recipe')
      const close = Array.from(dialog()?.querySelectorAll('button') ?? []).filter(
        (b) => b.textContent === 'Fermer',
      )
      expect(close.length).toBeGreaterThan(0)
      close[close.length - 1]!.click()
      await flushPromises()
      expect(dialog()).toBeNull()
    })
  })
})

describe('la fiche de SA copie d’une recette Marmiton, lue par l’administrateur', () => {
  const handlers = (recipe: Record<string, unknown> = copy) => ({
    'GET /api/v1/recipes/m1': () => json(recipe),
    'GET /api/v1/recipe-types/dessert/recipes': () =>
      json({ member: [{ id: 'm1', name: 'x', secret: false }], totalItems: 1 }),
  })
  const open = async (
    recipe: Record<string, unknown> = copy,
    user: Record<string, unknown> = admin,
  ) => {
    const opened = await mountView(RecipeDetailView, '/recettes/m1', {
      'GET /api/v1/me': () => json(user),
      ...handlers(recipe),
    })
    await vi.waitFor(() => expect(buttons(opened.wrapper)).toContain('Modifier'))

    return opened
  }

  it('garde « Voir sur Marmiton » et ajoute « Ouvrir la version commune » vers la fiche de la commune', async () => {
    const { wrapper } = await open()

    expect(wrapper.find('a[target="_blank"]').text()).toBe('Voir sur Marmiton')
    const card = wrapper.find('[data-common-link]')
    expect(card.findAll('span > span').map((line) => line.text())).toEqual([
      'Ouvrir la version commune',
      'Celle que copient les autres.',
    ])
    expect(card.attributes('href')).toBe('/recettes/c1')
    expect(card.find('svg[aria-hidden="true"]').exists()).toBe(true)
    // Sa copie reste une recette ordinaire : ses actions habituelles, pas de bandeau « Version commune »
    expect(wrapper.find('[data-common-banner]').exists()).toBe(false)
    expect(buttons(wrapper)).toEqual(
      expect.arrayContaining(['Voir sur Marmiton', 'Modifier', 'Supprimer']),
    )
  })

  it('pas de carte quand la copie n’a plus d’original', async () => {
    const { wrapper } = await open({ ...copy, originalId: null })

    expect(wrapper.find('[data-common-link]').exists()).toBe(false)
  })

  it('pas de carte pour une copie qui ne vient pas de Marmiton', async () => {
    const { wrapper } = await open({ ...copy, sourceUrl: null })

    expect(wrapper.find('[data-common-link]').exists()).toBe(false)
  })

  it('un utilisateur ordinaire ne la voit jamais, même avec un original', async () => {
    const { wrapper } = await open({ ...copy }, me)

    expect(wrapper.find('[data-common-link]').exists()).toBe(false)
    expect(wrapper.find('a[target="_blank"]').exists()).toBe(true)
  })
})

describe('les autres fiches ne changent pas', () => {
  const plain = {
    ...common,
    id: 'r1',
    name: 'Gratin de courgettes',
    typeSlug: 'plat',
    typeName: 'Plat',
    sourceUrl: null,
    ownerless: false,
    rows: [row('courgette', 'Courgette', 600)],
  }
  const open = async (recipe: Record<string, unknown>, user: unknown, mineIds: string[]) => {
    const opened = await mountView(RecipeDetailView, '/recettes/r1', {
      'GET /api/v1/me': () => json(user),
      'GET /api/v1/recipes/r1': () => json(recipe),
      'GET /api/v1/recipe-types/plat/recipes': () =>
        json({ member: mineIds.map((id) => ({ id, name: 'x' })), totalItems: mineIds.length }),
    })
    await vi.waitFor(() => expect(opened.wrapper.find('h1').exists()).toBe(true))
    await vi.waitFor(() => expect(buttons(opened.wrapper).length).toBeGreaterThan(1))

    return opened
  }

  it('l’auteur voit toujours Ajouter, Modifier, Supprimer sur la sienne (canEdit vrai)', async () => {
    const { wrapper } = await open({ ...plain, canEdit: true }, me, ['r1'])

    expect(wrapper.find('[data-common-banner]').exists()).toBe(false)
    expect(wrapper.find('[data-common-link]').exists()).toBe(false)
    expect(buttons(wrapper)).toEqual(expect.arrayContaining(['Modifier', 'Supprimer']))
    expect(wrapper.text()).toContain('Ajouter')
  })

  it('un utilisateur ordinaire ne voit que Copier sur celle d’un autre (canEdit faux), même version Marmiton', async () => {
    for (const recipe of [
      { ...plain, canEdit: false },
      { ...plain, canEdit: false, sourceUrl: LINK, originalId: null, ownerless: true },
    ]) {
      const { wrapper } = await open(recipe, me, [])

      expect(buttons(wrapper)).toContain('Copier')
      expect(buttons(wrapper)).not.toContain('Modifier')
      expect(buttons(wrapper)).not.toContain('Supprimer')
      expect(wrapper.find('[data-common-banner]').exists()).toBe(false)
      expect(wrapper.find('a[href="/recettes/autres"]').exists()).toBe(true)
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('sans canEdit (back plus ancien) : la liste de ses recettes décide, comme avant', async () => {
    const legacy: Record<string, unknown> = { ...plain }
    delete legacy.canEdit
    delete legacy.originalId
    delete legacy.ownerless
    const { wrapper } = await open(legacy, me, ['r1'])

    expect(buttons(wrapper)).toEqual(expect.arrayContaining(['Modifier', 'Supprimer']))
  })

  it('l’administrateur sur la recette ordinaire d’un autre : Copier seulement, ni bandeau ni suppression', async () => {
    const { wrapper } = await open({ ...plain, canEdit: true }, admin, [])

    expect(buttons(wrapper)).toContain('Copier')
    expect(buttons(wrapper)).not.toContain('Modifier')
    expect(wrapper.find('[data-common-banner]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Supprimer cette recette')
  })

  it('un utilisateur ordinaire qui a copié la version commune : « Ta copie » mène à copyId', async () => {
    const { wrapper } = await open(
      { ...plain, canEdit: false, sourceUrl: LINK, ownerless: true, copyId: 'm9' },
      me,
      [],
    )

    expect(buttons(wrapper)).toContain('Ta copie')
    expect(buttons(wrapper)).not.toContain('Copier')
    expect(wrapper.find('a[href="/recettes/m9"]').exists()).toBe(true)
  })

  it('la copie d’une copie Marmiton (original non commun) : jamais la version commune, Copier', async () => {
    const { wrapper } = await open(
      { ...plain, canEdit: true, sourceUrl: LINK, originalId: 'm1', ownerless: false },
      admin,
      [],
    )

    expect(wrapper.find('[data-common-banner]').exists()).toBe(false)
    expect(buttons(wrapper)).toContain('Copier')
  })

  it('l’administrateur sur la copie Marmiton ordinaire d’un autre : pas non plus la version commune', async () => {
    const { wrapper } = await open(
      { ...plain, canEdit: true, sourceUrl: LINK, originalId: 'c1' },
      admin,
      [],
    )

    expect(wrapper.find('[data-common-banner]').exists()).toBe(false)
    expect(buttons(wrapper)).toContain('Copier')
  })
})

describe('l’éditeur de la version commune', () => {
  const units = {
    member: [
      { slug: 'unite', name: 'Unité' },
      { slug: 'gramme', name: 'Gramme' },
    ],
    totalItems: 2,
  }
  const handlers = (more: Record<string, Handler> = {}) => ({
    'GET /api/v1/recipes/c1': () => json(common),
    'GET /api/v1/recipe-types/dessert/recipes': () => json({ member: [], totalItems: 0 }),
    // Les ingrédients de la version commune ne sont dans la liste de personne : la liste de l'administrateur n'en a aucun
    'GET /api/v1/ingredients': () =>
      json({
        member: [
          {
            slug: 'beurre',
            name: 'Beurre',
            departmentSlug: 'cremerie',
            departmentName: 'Crémerie',
          },
        ],
        totalItems: 1,
      }),
    'GET /api/v1/ingredients/jaune-reserve/units': () => json(units),
    'GET /api/v1/ingredients/farine-reservee/units': () => json(units),
    ...more,
  })
  async function open(more: Record<string, Handler> = {}) {
    const opened = await mountView(RecipeEditorView, '/recettes/c1/modifier', handlers(more))
    await vi.waitFor(() => expect(opened.wrapper.find('[data-common-note]').exists()).toBe(true))
    await vi.waitFor(() =>
      expect(opened.wrapper.findAll('li input[type="number"]').length).toBeGreaterThan(1),
    )

    return opened
  }

  it('est l’éditeur ordinaire, avec une ligne discrète “Tu modifies la version commune.”', async () => {
    const { wrapper } = await open()

    expect(wrapper.find('h1').text()).toBe('Modifier la recette')
    expect(wrapper.find('[data-common-note]').text()).toBe('Tu modifies la version commune.')
    expect(wrapper.find('button[type="submit"]').text()).toBe('Enregistrer')
  })

  it('sans interrupteur « Recette secrète » : elle n’a pas d’auteur', async () => {
    const { wrapper } = await open()

    expect(wrapper.text()).not.toContain('Recette secrète')
  })

  it('montre le nom de chaque ligne existante même quand son ingrédient n’est dans la liste de personne', async () => {
    const { wrapper } = await open()

    const names = wrapper
      .findAll('li input[role="combobox"], li input[type="text"]')
      .map((input) => (input.element as HTMLInputElement).value)
    expect(names).toEqual(expect.arrayContaining(['Jaune d’œuf', 'Farine']))
    // Leurs unités viennent de la liste de l'ingrédient réservé (le back y répond)
    expect(
      wrapper.findAll('li select').map((select) => (select.element as HTMLSelectElement).value),
    ).toEqual(['unite', 'unite'])
  })

  it('enregistre avec les slugs réservés tels quels, sans le champ secret, puis dit que la recette est à jour', async () => {
    const { wrapper, context, fetchMock } = await open({
      'PUT /api/v1/recipes/c1': () => new Response(null, { status: 204 }),
    })

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('recipe'))

    const put = fetchMock.mock.calls
      .map(([call]) => call as Request)
      .find((request) => request.method === 'PUT')
    expect(put?.headers.get('If-Match')).toBe('"3"')
    const body = (await put?.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      name: 'Tarte au citron meringuée',
      serving: 6,
      typeSlug: 'dessert',
      rows: [
        { ingredientSlug: 'jaune-reserve', unitSlug: 'unite', quantity: 4 },
        { ingredientSlug: 'farine-reservee', unitSlug: 'unite', quantity: 250 },
      ],
    })
    expect(body).not.toHaveProperty('secret')
    expect(context.router.currentRoute.value.params.id).toBe('c1')
    expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
      'La recette Marmiton est à jour.',
    ])
  })

  it('une recette ordinaire garde son éditeur : interrupteur “secrète”, pas de ligne ni de message en plus', async () => {
    const own = {
      ...common,
      id: 'r1',
      originalId: null,
      sourceUrl: null,
      ownerless: false,
      canEdit: true,
    }
    const { wrapper, context } = await mountView(RecipeEditorView, '/recettes/r1/modifier', {
      ...handlers({
        'GET /api/v1/recipes/r1': () => json(own),
        'GET /api/v1/recipe-types/dessert/recipes': () =>
          json({ member: [{ id: 'r1', name: 'x', secret: false }], totalItems: 1 }),
        'PUT /api/v1/recipes/r1': () => new Response(null, { status: 204 }),
      }),
      'GET /api/v1/me': () => json(me),
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Recette secrète'))

    expect(wrapper.find('[data-common-note]').exists()).toBe(false)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('recipe'))
    expect(useNotificationsStore().items).toEqual([])
  })
})
