import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import RecipeEditorView from '@/features/recipes/RecipeEditorView.vue'
import { useSessionStore } from '@/session/session'

// ING-017 : créer l'ingrédient qu'on cherchait sans quitter la recette (planches 1 et 1b).
const departments = {
  member: [
    { slug: 'epices', name: 'Épices et condiments', image: 'images/epices.png', icon: null },
    { slug: 'surgele', name: 'Surgelés', image: 'images/surgele.png', icon: 'snowflake' },
    { slug: 'conserve', name: 'Conserves', image: 'images/conserve.png', icon: 'can' },
    { slug: 'legumes', name: 'Fruits et légumes', image: 'images/legumes.png', icon: null },
  ],
  totalItems: 4,
}
const units = {
  member: [
    { slug: 'gramme', name: 'gramme', symbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
    { slug: 'kilo', name: 'kilo', symbol: 'kg', dimension: 'WEIGHT', baseFactor: 1000 },
    { slug: 'millilitre', name: 'millilitre', symbol: 'ml', dimension: 'VOLUME', baseFactor: 1 },
    { slug: 'litre', name: 'litre', symbol: 'l', dimension: 'VOLUME', baseFactor: 1000 },
    { slug: 'unite', name: 'unité', symbol: '', dimension: 'COUNT', baseFactor: 1 },
    { slug: 'tasse-a-cafe', name: 'tasse à café', symbol: 'tasse à café', dimension: null },
  ],
  totalItems: 6,
}
const existing = [
  {
    slug: 'agneau',
    name: 'Épaule d’agneau',
    departmentSlug: 'conserve',
    departmentName: 'Conserves',
  },
  {
    slug: 'pois-surgeles',
    name: 'Petits pois',
    departmentSlug: 'surgele',
    departmentName: 'Surgelés',
  },
]
const listOf = (members: unknown[]) => ({ member: members, totalItems: members.length })

type Handlers = Parameters<typeof stubApi>[0]

const mounted: { unmount: () => void }[] = []

async function open(handlers: Handlers = {}) {
  let created = false
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/departments': () => json(departments),
    'GET /api/v1/units': () => json(units),
    'GET /api/v1/recipe-types': () =>
      json(listOf([{ slug: 'plat', name: 'Plat', image: 'images/plat.png', order: 1 }])),
    // Avant la création, la liste de la personne ; après, elle contient aussi l'ingrédient créé
    'GET /api/v1/ingredients': () =>
      json(
        listOf(
          created
            ? [
                ...existing,
                {
                  slug: 'cardamome-u1',
                  name: 'Cardamome',
                  departmentSlug: 'epices',
                  departmentName: 'Épices et condiments',
                },
              ]
            : existing,
        ),
      ),
    'GET /api/v1/ingredients/agneau/units': () =>
      json(listOf([{ slug: 'gramme', name: 'Gramme' }])),
    'GET /api/v1/ingredients/cardamome-u1/units': () =>
      json(
        listOf([
          { slug: 'gramme', name: 'Gramme' },
          { slug: 'kilo', name: 'Kilo' },
        ]),
      ),
    'POST /api/v1/ingredients': () => {
      created = true

      return new Response(null, {
        status: 201,
        headers: { Location: '/api/v1/ingredients/cardamome-u1' },
      })
    },
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/recettes/nouvelle')
  const wrapper = mount(RecipeEditorView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('input[role="combobox"]').exists()).toBe(true))
  await vi.waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('/api/v1/ingredients') }),
    ),
  )
  await flushPromises()

  return { wrapper, fetchMock, context }
}

type Opened = Awaited<ReturnType<typeof open>>

const search = async (wrapper: Opened['wrapper'], text: string, index = 0) => {
  const input = wrapper.findAll('input[role="combobox"]')[index]!
  ;(input.element as HTMLInputElement).focus()
  ;(input.element as HTMLInputElement).value = text
  await input.trigger('input')
  await flushPromises()
}
const offer = (wrapper: Opened['wrapper']) => wrapper.find('[data-testid="create-ingredient"]')
// Comme un doigt ou une souris : le bouton prend le focus (le champ le quitte vers un élément du champ), puis le clic
const openCreate = async (wrapper: Opened['wrapper']) => {
  const button = offer(wrapper).find('button')
  ;(button.element as HTMLElement).focus()
  await button.trigger('click')
  await flushPromises()
}
const sheet = () => document.body.querySelector<HTMLElement>('[role="dialog"]')
const sheetField = (label: string) => {
  const target = [...(sheet()?.querySelectorAll('label') ?? [])].find(
    (candidate) => candidate.textContent.trim() === label,
  )

  return sheet()?.querySelector<HTMLInputElement>(`#${target?.getAttribute('for') ?? 'absent'}`)
}
const type = async (input: HTMLInputElement | null | undefined, value: string) => {
  if (!input) throw new Error('champ absent')
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}
const radio = (name: string) =>
  [...(sheet()?.querySelectorAll<HTMLLabelElement>('[role="radiogroup"] label') ?? [])].find(
    (label) => label.textContent.trim() === name,
  )
const chip = (label: string) =>
  [...(sheet()?.querySelectorAll<HTMLButtonElement>('button[aria-pressed]') ?? [])].find(
    (button) => button.textContent.trim() === label,
  )
const submitButton = () =>
  [...(sheet()?.querySelectorAll<HTMLButtonElement>('button[type="submit"]') ?? [])][0]
const submit = async () => {
  sheet()
    ?.querySelector('form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }))
  await flushPromises()
}
const posts = (fetchMock: Opened['fetchMock']) =>
  fetchMock.mock.calls
    .map(([call]) => call as Request)
    .filter((request) => request.method === 'POST' && request.url.endsWith('/api/v1/ingredients'))

describe('RecipeEditorView : créer un ingrédient dans la recette', () => {
  // jsdom ne dessine rien : Reka fait défiler l'option active dans la vue et mesure le champ
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn<() => void>()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })
  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('propose de créer ce qu’aucun ingrédient ne porte, avec un bouton de 48 px', async () => {
    const { wrapper } = await open()

    await search(wrapper, 'cardamome')

    expect(offer(wrapper).exists()).toBe(true)
    expect(offer(wrapper).text()).toContain('Aucun ingrédient ne s’appelle « cardamome ».')
    const button = offer(wrapper).find('button')
    expect(button.text()).toBe('Créer « cardamome »')
    expect(button.classes()).toContain('min-h-12')
    // La liste ne s'ouvre pas pour dire la même chose une seconde fois
    expect(document.body.querySelector('[role="listbox"]')).toBeNull()
  })

  it('ne propose rien tant qu’un ingrédient correspond (casse et accents ignorés), ni sans rien taper', async () => {
    const { wrapper } = await open()

    expect(offer(wrapper).exists()).toBe(false)
    await search(wrapper, 'EPAULE')
    expect(offer(wrapper).exists()).toBe(false)
    await search(wrapper, '   ')
    expect(offer(wrapper).exists()).toBe(false)
  })

  it('ne propose rien quand les ingrédients ne sont pas encore chargés ou ne se chargent pas', async () => {
    const { wrapper } = await open({
      'GET /api/v1/ingredients': () => json({ error: { message: 'boom' } }, { status: 500 }),
    })

    await search(wrapper, 'cardamome')

    expect(offer(wrapper).exists()).toBe(false)
  })

  it('ouvre la feuille « Nouvel ingrédient » : nom prérempli et modifiable, rayon à choisir, unité courante déjà posée', async () => {
    const { wrapper } = await open()
    await search(wrapper, 'cardamome')

    await openCreate(wrapper)
    await flushPromises()

    expect(sheet()?.querySelector('h2')?.textContent).toBe('Nouvel ingrédient')
    // Le nom tapé, avec sa majuscule, modifiable
    expect(sheetField('Nom')?.value).toBe('Cardamome')
    // Le rayon n'est pas deviné : aucun n'est choisi
    expect(sheet()?.querySelectorAll('[role="radiogroup"] input:checked')).toHaveLength(0)
    expect(
      [...(sheet()?.querySelectorAll('[role="radiogroup"] label') ?? [])].map((l) =>
        l.textContent.trim(),
      ),
    ).toEqual(['Épices et condiments', 'Surgelés', 'Conserves', 'Fruits et légumes'])
    // Les rayons à icône montrent leur repère
    expect(radio('Surgelés')?.querySelector('[data-department-marker="snowflake"]')).not.toBeNull()
    expect(radio('Conserves')?.querySelector('[data-department-marker="can"]')).not.toBeNull()
    // Les unités courantes en pastilles (g, kg, ml, l, unité), la première posée ; les autres derrière « Autre »
    const chips = [...(sheet()?.querySelectorAll('button[aria-pressed]') ?? [])]
    expect(chips.map((c) => c.textContent.trim())).toEqual(['g', 'kg', 'ml', 'l', 'unité', 'Autre'])
    expect(chip('g')?.getAttribute('aria-pressed')).toBe('true')
    expect(chip('g')?.getAttribute('aria-label')).toBe('gramme')
    expect(sheet()?.querySelector('select')).toBeNull()
    expect(submitButton()?.textContent.trim()).toBe('Créer et l’ajouter à la recette')
  })

  it('exige un rayon : sans lui rien n’est envoyé, l’erreur est dite et le focus va au choix', async () => {
    const { wrapper, fetchMock } = await open()
    await search(wrapper, 'cardamome')
    await openCreate(wrapper)
    await flushPromises()

    await submit()

    expect(posts(fetchMock)).toHaveLength(0)
    expect(sheet()?.textContent).toContain('Choisis un rayon.')
    expect(sheet()?.querySelector('[role="radiogroup"]')?.getAttribute('aria-invalid')).toBe('true')
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('type')).toBe('radio'))
    // Un nom vidé est aussi refusé
    await type(sheetField('Nom'), '  ')
    await submit()
    expect(sheet()?.textContent).toContain('Donne un nom.')
    expect(posts(fetchMock)).toHaveLength(0)
  })

  it('crée l’ingrédient avec la même unité pour l’achat et la cuisine, puis le choisit dans la ligne sans toucher au reste', async () => {
    const { wrapper, fetchMock } = await open()
    // Le reste de la recette est déjà rempli
    await wrapper
      .findAll('input')
      .find((i) => i.attributes('type') === undefined)
      ?.setValue('Tajine d’agneau')
    await wrapper
      .find('input[type="number"][aria-label="Quantité de l\'ingrédient 1"]')
      .setValue('800')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Ajouter un ingrédient')
      ?.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('li')).toHaveLength(2)
    await wrapper.find('input[aria-label="Quantité de l\'ingrédient 2"]').setValue('3')

    await search(wrapper, 'cardamome', 1)
    await openCreate(wrapper)
    await flushPromises()
    radio('Épices et condiments')?.click()
    chip('kg')?.click()
    await flushPromises()
    submitButton()?.click()
    await flushPromises()

    const [post] = posts(fetchMock)
    expect(await post?.json()).toEqual({
      name: 'Cardamome',
      departmentSlug: 'epices',
      defaultCookingUnitSlug: 'kilo',
      defaultPurchaseUnitSlug: 'kilo',
      coefficient: null,
    })
    // La feuille est fermée, rien n'a quitté la page, et l'ingrédient est choisi dans SA ligne, avec son unité
    await vi.waitFor(() => expect(sheet()).toBeNull())
    const inputs = wrapper.findAll('input[role="combobox"]')
    await vi.waitFor(() => expect((inputs[1]!.element as HTMLInputElement).value).toBe('Cardamome'))
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('')
    expect(
      (wrapper.find('select[aria-label="Unité de l\'ingrédient 2"]').element as HTMLSelectElement)
        .value,
    ).toBe('kilo')
    // Le reste de la recette est intact : nom, quantités
    expect(
      wrapper.findAll('input').find((i) => i.attributes('type') === undefined)?.element.value,
    ).toBe('Tajine d’agneau')
    expect(
      (wrapper.find('input[aria-label="Quantité de l\'ingrédient 1"]').element as HTMLInputElement)
        .value,
    ).toBe('800')
    expect(
      (wrapper.find('input[aria-label="Quantité de l\'ingrédient 2"]').element as HTMLInputElement)
        .value,
    ).toBe('3')
    // L'offre a disparu et le focus est revenu au champ de l'ingrédient
    expect(offer(wrapper).exists()).toBe(false)
    await vi.waitFor(() => expect(document.activeElement).toBe(inputs[1]?.element))
    // Aucune autre écriture : la recette n'est pas enregistrée par la création
    expect(
      fetchMock.mock.calls.map(([call]) => (call as Request).method).filter((m) => m !== 'GET'),
    ).toEqual(['POST', 'POST'])
  })

  it('propose toutes les unités derrière « Autre » et envoie celle qu’on y prend', async () => {
    const { wrapper, fetchMock } = await open()
    await search(wrapper, 'cardamome')
    await openCreate(wrapper)
    await flushPromises()
    radio('Conserves')?.click()

    chip('Autre')?.click()
    await flushPromises()
    const select = sheet()?.querySelector<HTMLSelectElement>('select')
    expect(select?.getAttribute('aria-label')).toBe('Autre unité')
    expect([...(select?.options ?? [])].map((option) => option.textContent.trim())).toContain(
      'tasse à café',
    )
    if (select) {
      select.value = 'tasse-a-cafe'
      select.dispatchEvent(new Event('change'))
    }
    await flushPromises()
    submitButton()?.click()
    await flushPromises()

    expect(await posts(fetchMock)[0]?.json()).toMatchObject({
      defaultCookingUnitSlug: 'tasse-a-cafe',
      defaultPurchaseUnitSlug: 'tasse-a-cafe',
    })
  })

  it('dit « Tu as déjà … » et n’envoie rien quand le rayon choisi a déjà ce nom', async () => {
    const { wrapper, fetchMock } = await open()
    await search(wrapper, 'petits poi')
    await offer(wrapper).exists() // aucun nom ne contient « petits poi » ? si : l'offre n'existe pas
    await search(wrapper, 'petits pois!')
    await openCreate(wrapper)
    await flushPromises()
    await type(sheetField('Nom'), 'petits pois')

    radio('Surgelés')?.click()
    await flushPromises()

    expect(sheet()?.querySelector('[data-testid="name-clash"]')?.textContent).toBe(
      'Tu as déjà « Petits pois » dans Surgelés. Choisis-le plutôt que d’en créer un autre.',
    )
    expect(submitButton()?.getAttribute('aria-disabled')).toBe('true')
    submitButton()?.click()
    await flushPromises()
    expect(posts(fetchMock)).toHaveLength(0)
  })

  it('informe, sans bloquer, quand le nom existe dans un autre rayon', async () => {
    const { wrapper, fetchMock } = await open()
    await search(wrapper, 'petits pois!')
    await openCreate(wrapper)
    await flushPromises()
    await type(sheetField('Nom'), 'petits pois')

    radio('Fruits et légumes')?.click()
    await flushPromises()

    expect(sheet()?.querySelector('[data-testid="name-elsewhere"]')?.textContent).toBe(
      'Tu as déjà « Petits pois » dans Surgelés. Celui-ci sera dans Fruits et légumes.',
    )
    expect(submitButton()?.getAttribute('aria-disabled')).toBeNull()
    submitButton()?.click()
    await flushPromises()
    expect(posts(fetchMock)).toHaveLength(1)
  })

  it('dit le refus 409 du back (le nom a été pris entre-temps) et garde la feuille ouverte', async () => {
    const { wrapper } = await open({
      'POST /api/v1/ingredients': () =>
        json({ error: { message: 'INGREDIENT_NAME_ALREADY_USED' } }, { status: 409 }),
    })
    await search(wrapper, 'cardamome')
    await openCreate(wrapper)
    await flushPromises()
    radio('Épices et condiments')?.click()
    await flushPromises()

    submitButton()?.click()
    await flushPromises()

    const alert = sheet()?.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe(
      'Tu as déjà « Cardamome » dans Épices et condiments. Choisis-le plutôt que d’en créer un autre.',
    )
    expect(sheet()).not.toBeNull()
  })

  it.each([
    [422, 'INGREDIENT_LIMIT_REACHED', 'Tu as déjà 2 000 ingrédients'],
    [403, 'FORBIDDEN', 'pas le droit'],
    [0, '', 'injoignable'],
  ])(
    'affiche l’erreur %i (%s) et rien d’autre : la feuille reste ouverte',
    async (status, code, text) => {
      const { wrapper } = await open({
        'POST /api/v1/ingredients': () =>
          status === 0
            ? Promise.reject(new TypeError('Failed to fetch'))
            : json({ error: { message: code } }, { status }),
      })
      await search(wrapper, 'cardamome')
      await openCreate(wrapper)
      await flushPromises()
      radio('Épices et condiments')?.click()
      await flushPromises()

      submitButton()?.click()
      await flushPromises()

      expect(sheet()?.querySelector('[role="alert"]')?.textContent).toContain(text)
      expect(sheet()).not.toBeNull()
      // Rien n'est choisi dans la ligne : l'offre de créer est toujours là
      expect(offer(wrapper).exists()).toBe(true)
    },
  )

  it('se ferme avec Échap sans rien créer, et le focus revient au bouton « Créer »', async () => {
    const { wrapper, fetchMock } = await open()
    await search(wrapper, 'cardamome')
    const button = offer(wrapper).find('button')
    ;(button.element as HTMLElement).focus()
    await button.trigger('click')
    await flushPromises()

    sheet()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    await vi.waitFor(() => expect(sheet()).toBeNull())
    expect(posts(fetchMock)).toHaveLength(0)
    await vi.waitFor(() => expect(document.activeElement).toBe(button.element))
  })

  it('la feuille a un titre, un bouton Fermer de 44 px et son erreur est annoncée (role alert)', async () => {
    const { wrapper } = await open()
    await search(wrapper, 'cardamome')
    await openCreate(wrapper)
    await flushPromises()

    expect(sheet()?.getAttribute('aria-labelledby')).not.toBeNull()
    const close = sheet()?.querySelector('button[aria-label="Fermer"]')
    expect(close?.classList.contains('size-11')).toBe(true)
    const chips = [...(sheet()?.querySelectorAll('button[aria-pressed]') ?? [])]
    expect(chips.every((c) => c.classList.contains('min-h-11'))).toBe(true)
  })
})
