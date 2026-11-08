import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import type { Handler } from '@/__tests__/helpers'
import fr from '@/i18n/fr'
import OtherRecipesView from '@/features/recipes/OtherRecipesView.vue'
import MarmitonImportView from '@/features/recipes/MarmitonImportView.vue'
import RecipeDetailView from '@/features/recipes/RecipeDetailView.vue'
import RecipeEditorView from '@/features/recipes/RecipeEditorView.vue'
import RecipeNewChoiceView from '@/features/recipes/RecipeNewChoiceView.vue'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'

// Copier une recette de Marmiton (MAR-004, ADR 0037 du back) : le choix de « Nouvelle recette », l'écran du lien, ses refus, et le
// bouton « Voir sur Marmiton » de la fiche. Le back n'est jamais joint : un faux back par route.

const LINK = 'https://www.marmiton.org/recettes/recette_the-tarte-au-citron-meringuee_22082.aspx'
const recipe = {
  id: 'r9',
  name: 'Tarte au citron meringuée',
  serving: 6,
  typeSlug: 'dessert',
  typeName: 'Dessert',
  version: 1,
  secret: false,
  favorite: false,
  sourceUrl: LINK,
  rows: [],
}

const backend = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/recipe-types': () =>
    json({ member: [{ slug: 'dessert', name: 'Dessert', image: '', order: 1 }], totalItems: 1 }),
  'GET /api/v1/recipes/r9': () => json(recipe),
  'GET /api/v1/recipe-types/dessert/recipes': () => json({ member: [], totalItems: 0 }),
  'GET /api/v1/shopping-lists/active/summary': () =>
    json({ shoppingListId: null, quantityByIngredientSlug: {}, plannedRecipeIds: [] }),
}

const created =
  (status: number): Handler =>
  () =>
    new Response(null, { status, headers: { Location: '/api/v1/recipes/r9' } })
const refused =
  (status: number, message: string, headers: Record<string, string> = {}): Handler =>
  () =>
    json({ error: { message } }, { status, headers })

async function openImport(handlers: Record<string, Handler> = {}) {
  const fetchMock = stubApi({ ...backend, ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/recettes/nouvelle/marmiton')
  const wrapper = mount(MarmitonImportView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })

  return { wrapper, context, fetchMock }
}

type Opened = Awaited<ReturnType<typeof openImport>>
const paste = (wrapper: Opened['wrapper'], value: string) => wrapper.find('input').setValue(value)
const copy = async (wrapper: Opened['wrapper']) => {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}
const posts = (fetchMock: Opened['fetchMock']) =>
  fetchMock.mock.calls
    .map(([call]) => call as Request)
    .filter((request) => request.method === 'POST' && request.url.endsWith('/import/marmiton'))

describe('copier une recette de Marmiton', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  describe('le choix de « Nouvelle recette »', () => {
    it('ne propose que deux parcours de même poids, qui mènent chacun à son écran', async () => {
      stubApi(backend)
      localStorage.setItem('repas.session', '1')
      const context = appContext()
      await useSessionStore().restore()
      await context.router.push('/recettes/nouvelle')
      const wrapper = mount(RecipeNewChoiceView, { global: { plugins: context.plugins } })

      expect(wrapper.find('h1').text()).toBe('Nouvelle recette')
      expect(wrapper.text()).toContain('Comment veux-tu ajouter ta recette ?')
      const cards = wrapper.findAll('li a')
      expect(cards.map((card) => card.text())).toEqual([
        'Écrire ma recette' + 'Tu choisis le nom et les ingrédients.',
        'Copier depuis Marmiton' + 'Tu colles un lien, je m’occupe du reste.',
      ])
      expect(cards.map((card) => card.attributes('href'))).toEqual([
        '/recettes/nouvelle/ecrire',
        '/recettes/nouvelle/marmiton',
      ])
      // Rien d'autre : ni champ, ni séparateur « ou écris la tienne »
      expect(wrapper.find('input').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('ou écris la tienne')
    })
  })

  describe("l'écran du lien", () => {
    it('a un champ de lien, un bouton et un retour au choix', async () => {
      const { wrapper } = await openImport()

      expect(wrapper.find('h1').text()).toBe('Copier depuis Marmiton')
      expect(wrapper.text()).toContain(
        'Colle le lien de la recette Marmiton, je la copie dans tes recettes.',
      )
      const input = wrapper.find('input')
      expect(input.attributes()).toMatchObject({
        type: 'url',
        inputmode: 'url',
        autocomplete: 'off',
      })
      expect(wrapper.find('label').text()).toBe('Lien de la recette')
      expect(wrapper.find('button[type="submit"]').text()).toBe('Copier la recette')
      expect(wrapper.find('a[href="/recettes/nouvelle"]').exists()).toBe(true)
    })

    it('201 : envoie le lien, dit que la recette est dans les siennes et ouvre sa fiche', async () => {
      const { wrapper, context, fetchMock } = await openImport({
        'POST /api/v1/recipes/import/marmiton': created(201),
      })

      await paste(wrapper, `  ${LINK}  `)
      await copy(wrapper)

      expect(await posts(fetchMock)[0]?.json()).toEqual({ url: LINK })
      expect(context.router.currentRoute.value.name).toBe('recipe')
      expect(context.router.currentRoute.value.params.id).toBe('r9')
      expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
        '« Tarte au citron meringuée » est dans tes recettes.',
      ])
      // La fiche est lue une seule fois : elle est déjà en mémoire à l'ouverture
      expect(calls(fetchMock).filter((call) => call === 'GET /api/v1/recipes/r9')).toHaveLength(1)
    })

    it('200 (la copie était déjà là) : même chemin, même phrase', async () => {
      const { wrapper, context } = await openImport({
        'POST /api/v1/recipes/import/marmiton': created(200),
      })

      await paste(wrapper, LINK)
      await copy(wrapper)

      expect(context.router.currentRoute.value.params.id).toBe('r9')
      expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
        '« Tarte au citron meringuée » est dans tes recettes.',
      ])
    })

    it('en cours : bouton « Je copie la recette… » occupé, champ bloqué, phrase d’attente, et une seule requête', async () => {
      let finish: (response: Response) => void = () => undefined
      const { wrapper, fetchMock } = await openImport({
        'POST /api/v1/recipes/import/marmiton': () =>
          new Promise<Response>((resolve) => (finish = resolve)),
      })
      await paste(wrapper, LINK)

      await wrapper.find('form').trigger('submit')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      const button = wrapper.find('button[type="submit"]')
      expect(button.text()).toBe('Je copie la recette…')
      expect(button.attributes('disabled')).toBeDefined()
      expect(button.attributes('aria-busy')).toBe('true')
      expect(wrapper.find('input').attributes('disabled')).toBeDefined()
      expect(wrapper.find('[role="status"]').text()).toBe('Ça prend quelques secondes.')
      expect(posts(fetchMock)).toHaveLength(1)

      finish(new Response(null, { status: 201, headers: { Location: '/api/v1/recipes/r9' } }))
      await flushPromises()
    })

    it('un lien vide ne part pas', async () => {
      const { wrapper, fetchMock } = await openImport()

      await copy(wrapper)

      expect(wrapper.find('[role="alert"]').text()).toBe('Colle le lien d’une recette Marmiton.')
      expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
      expect(posts(fetchMock)).toHaveLength(0)
    })

    it("un texte qui n'est pas de marmiton.org ne part pas non plus", async () => {
      const { wrapper, fetchMock } = await openImport()

      await paste(wrapper, 'https://www.google.com/recherche?q=tarte')
      await copy(wrapper)

      expect(wrapper.find('[role="alert"]').text()).toBe(
        'Ce lien n’est pas une recette Marmiton. Rien n’a été copié. Colle le lien d’une recette de marmiton.org.',
      )
      expect(posts(fetchMock)).toHaveLength(0)
    })

    const refusals: [string, Handler, string][] = [
      [
        'MARMITON_URL_INVALID',
        refused(422, 'MARMITON_URL_INVALID'),
        'Ce lien n’est pas une recette Marmiton. Rien n’a été copié. Colle le lien d’une recette de marmiton.org.',
      ],
      [
        'MARMITON_RECIPE_NOT_FOUND',
        refused(422, 'MARMITON_RECIPE_NOT_FOUND'),
        'Marmiton ne trouve pas cette recette. Rien n’a été copié. Vérifie le lien et réessaie.',
      ],
      [
        'MARMITON_RECIPE_UNREADABLE',
        refused(422, 'MARMITON_RECIPE_UNREADABLE'),
        'Je n’arrive pas à lire cette recette. Rien n’a été copié. Tu peux l’écrire toi-même.',
      ],
      [
        'MARMITON_UNAVAILABLE',
        refused(502, 'MARMITON_UNAVAILABLE'),
        'Marmiton ne répond pas pour le moment. Rien n’a été copié. Réessaie dans un instant.',
      ],
      [
        'un 502 sans corps',
        () => new Response('<html>Bad gateway</html>', { status: 502 }),
        'Marmiton ne répond pas pour le moment. Rien n’a été copié. Réessaie dans un instant.',
      ],
      [
        'le réseau coupé',
        () => {
          throw new TypeError('Failed to fetch')
        },
        'Marmiton ne répond pas pour le moment. Rien n’a été copié. Réessaie dans un instant.',
      ],
      [
        'MARMITON_IMPORT_RATE_LIMITED',
        refused(429, 'MARMITON_IMPORT_RATE_LIMITED', { 'Retry-After': '120' }),
        'Tu as copié beaucoup de recettes. Rien n’a été perdu. Réessaie dans quelques minutes.',
      ],
      [
        'un 429 sans code',
        refused(429, 'WRITE_RATE_LIMITED', { 'Retry-After': '5' }),
        'Tu as copié beaucoup de recettes. Rien n’a été perdu. Réessaie dans quelques minutes.',
      ],
      [
        'RECIPE_LIMIT_REACHED',
        refused(422, 'RECIPE_LIMIT_REACHED'),
        'Tu as atteint le nombre maximum de recettes. Supprime-en une, puis réessaie.',
      ],
      [
        'un message inconnu',
        refused(422, 'QUELQUE_CHOSE_DE_NEUF'),
        'Une erreur est survenue. Réessaie.',
      ],
    ]

    it.each(refusals)(
      '%s : la phrase est dite sous le champ, le lien reste, le bouton redevient actif',
      async (_label, handler, sentence) => {
        const { wrapper, context } = await openImport({
          'POST /api/v1/recipes/import/marmiton': handler,
        })

        await paste(wrapper, LINK)
        await copy(wrapper)

        const alert = wrapper.find('[role="alert"]')
        expect(alert.text()).toBe(sentence)
        expect(alert.find('svg').exists()).toBe(true)
        expect(alert.attributes('id')).toBe(wrapper.find('input').attributes('aria-describedby'))
        expect((wrapper.find('input').element as HTMLInputElement).value).toBe(LINK)
        expect(wrapper.find('input').attributes('disabled')).toBeUndefined()
        const button = wrapper.find('button[type="submit"]')
        expect(button.text()).toBe('Copier la recette')
        expect(button.attributes('disabled')).toBeUndefined()
        // Pas de message en plus, et on reste sur l'écran
        expect(useNotificationsStore().items).toEqual([])
        expect(context.router.currentRoute.value.name).toBe('recipe-new-marmiton')
        // Le code du back n'est jamais montré
        expect(alert.text()).not.toMatch(/[A-Z]{4,}_[A-Z_]+/)
      },
    )

    it('le délai du client est de 20 secondes, puis Marmiton « ne répond pas »', async () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort())
      const { wrapper } = await openImport({
        'POST /api/v1/recipes/import/marmiton': (request) => {
          if (request.signal.aborted) throw new DOMException('Délai dépassé', 'TimeoutError')

          return created(201)(request)
        },
      })

      await paste(wrapper, LINK)
      await copy(wrapper)

      expect(timeout).toHaveBeenCalledWith(20_000)
      expect(wrapper.find('[role="alert"]').text()).toContain('Marmiton ne répond pas')
    })

    it('après un refus, réessayer renvoie le même lien', async () => {
      let attempt = 0
      const { wrapper, context } = await openImport({
        'POST /api/v1/recipes/import/marmiton': (request) =>
          ++attempt === 1 ? refused(502, 'MARMITON_UNAVAILABLE')(request) : created(201)(request),
      })
      await paste(wrapper, LINK)
      await copy(wrapper)
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)

      await copy(wrapper)

      expect(attempt).toBe(2)
      expect(context.router.currentRoute.value.name).toBe('recipe')
    })
  })

  describe('le formulaire à la main', () => {
    it("n'a rien de Marmiton, son titre est « Écrire ma recette » et son retour mène au choix", async () => {
      stubApi({
        ...backend,
        'GET /api/v1/ingredients': () => json({ member: [], totalItems: 0 }),
      })
      localStorage.setItem('repas.session', '1')
      const context = appContext()
      await useSessionStore().restore()
      await context.router.push('/recettes/nouvelle/ecrire')
      const wrapper = mount(RecipeEditorView, { global: { plugins: context.plugins } })
      await flushPromises()

      expect(wrapper.find('h1').text()).toBe('Écrire ma recette')
      expect(wrapper.text()).not.toMatch(/marmiton/i)
      expect(wrapper.find('a[href="/recettes/nouvelle"]').exists()).toBe(true)
    })
  })

  describe('« Voir sur Marmiton » sur la fiche', () => {
    async function openRecipe(sourceUrl?: unknown) {
      const body: Record<string, unknown> = { ...recipe }
      if (sourceUrl === undefined) delete body.sourceUrl
      else body.sourceUrl = sourceUrl
      stubApi({ ...backend, 'GET /api/v1/recipes/r9': () => json(body) })
      localStorage.setItem('repas.session', '1')
      const context = appContext()
      await useSessionStore().restore()
      await context.router.push('/recettes/r9')
      const wrapper = mount(RecipeDetailView, { global: { plugins: context.plugins } })
      await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))

      return wrapper
    }

    it("est un lien vers l'adresse lue de la réponse, dans un nouvel onglet", async () => {
      const wrapper = await openRecipe(LINK)

      const link = wrapper.find('a[target="_blank"]')
      expect(link.text()).toBe('Voir sur Marmiton')
      expect(link.attributes('href')).toBe(LINK)
      expect(link.attributes('rel')).toBe('noopener noreferrer')
      expect(link.find('svg').attributes('aria-hidden')).toBe('true')
      expect(link.find('img').exists()).toBe(false)
    })

    it.each([
      ['null', null],
      ['absente', undefined],
      ['javascript:', 'javascript:alert(1)'],
      ['un autre site en http', 'http://autre-site.example/recettes/recette_x_1.aspx'],
      ['un domaine qui commence par celui de Marmiton', 'https://www.marmiton.org.evil.com/'],
    ])("n'affiche rien pour %s, sans erreur", async (_label, value) => {
      const wrapper = await openRecipe(value)

      expect(wrapper.find('a[target="_blank"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Voir sur Marmiton')
    })
  })

  describe('« Recettes des autres »', () => {
    it('la pastille « Marmiton » est sur la recette dont le back dit fromMarmiton, et sur elle seule', async () => {
      const dessert = { typeName: 'dessert', typeSlug: 'dessert' }
      stubApi({
        ...backend,
        'GET /api/v1/recipes/other-people/types': () =>
          json({ member: [{ typeSlug: 'dessert', typeName: 'dessert', count: 3 }], totalItems: 1 }),
        'GET /api/v1/recipes/other-people': () =>
          json({
            member: [
              { id: 'd1', name: 'Tarte au citron meringuée', ...dessert, fromMarmiton: true },
              { id: 'd2', name: 'Tarte aux pommes', ...dessert, fromMarmiton: false },
              { id: 'd3', name: 'Crème brûlée', ...dessert },
            ],
            totalItems: 3,
          }),
      })
      localStorage.setItem('repas.session', '1')
      const context = appContext()
      await useSessionStore().restore()
      await context.router.push('/recettes/autres?categorie=dessert')
      const wrapper = mount(OtherRecipesView, { global: { plugins: context.plugins } })

      await vi.waitFor(() => expect(wrapper.findAll('li').length).toBe(3))
      const badged = wrapper
        .findAll('li')
        .filter((item) => item.find('[data-marmiton-badge]').exists())
      expect(badged.map((item) => item.find('a span').text())).toEqual([
        'Tarte au citron meringuée',
      ])
      expect(wrapper.find('[data-marmiton-badge]').text()).toBe('Marmiton')
    })
  })

  describe('les phrases', () => {
    const sentences = (): string[] => {
      const group = [
        fr.marmiton,
        fr.recipeNew,
        { badge: fr.recipes.marmitonBadge },
        {
          view: fr.recipes.viewOnMarmiton,
          ...Object.fromEntries(
            Object.entries(fr.errors).filter(([key]) => key.startsWith('marmiton')),
          ),
        },
      ]

      return group.flatMap((texts) => Object.values(texts) as string[])
    }

    it('tutoient, sans impératif en « -ez », et font 15 mots au plus par phrase', () => {
      // Les phrases fautives, listées : un échec dit lesquelles
      const wrong: string[] = []
      for (const text of sentences()) {
        if (/(?<![\p{L}])(vous|votre|vos)(?![\p{L}])/iu.test(text)) wrong.push(text)
        if (/(?<![\p{L}])(?!chez|assez|nez)\p{L}+ez(?![\p{L}])/iu.test(text)) wrong.push(text)
        for (const sentence of text.split(/(?<=[.!?…])\s+/))
          if (sentence.split(/\s+/).length > 15) wrong.push(sentence)
      }

      expect(wrong).toEqual([])
    })

    it("les refus disent ce qui s'est passé, ce qui est sauf et une action : trois phrases", () => {
      const refusals = Object.entries(fr.errors).filter(([key]) => key.startsWith('marmiton'))

      expect(refusals).toHaveLength(5)
      for (const [, text] of refusals) expect(text.split(/(?<=[.!?])\s+/)).toHaveLength(3)
    })
  })
})
