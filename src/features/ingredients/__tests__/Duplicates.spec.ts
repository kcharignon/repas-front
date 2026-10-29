import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import DuplicatesView from '@/features/ingredients/DuplicatesView.vue'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'
import { duplicates, pair, preview, side } from './mergeFixtures'

const base = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
}

async function open(handlers: Parameters<typeof stubApi>[0] = {}) {
  const fetchMock = stubApi({
    ...base,
    'GET /api/v1/ingredients/duplicates': () => json(duplicates),
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/ingredients/doublons')
  const wrapper = mount(DuplicatesView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })

  return { wrapper, context, fetchMock }
}

const cards = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
  wrapper.findAll('[data-testid="duplicate-card"]')

/** Un bouton de la feuille ouverte (rendue hors de la vue, dans un dialogue). */
const button = (label: string | RegExp) =>
  [...(document.body.querySelector('[role="dialog"]')?.querySelectorAll('button') ?? [])].find(
    (candidate) =>
      typeof label === 'string'
        ? candidate.textContent?.trim() === label
        : label.test(candidate.textContent ?? ''),
  )

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('DuplicatesView', () => {
  it('annonce le chargement, puis groupe les cartes par rayon avec la première ouverte', async () => {
    const { wrapper, fetchMock } = await open()
    expect(wrapper.text()).toContain('Chargement')

    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))

    expect(wrapper.find('h1').text()).toBe('Doublons possibles')
    expect(wrapper.text()).toContain('Ces ingrédients se ressemblent dans le même rayon.')
    expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual([
      'Fruit & légume',
      'Épicerie',
    ])
    expect(wrapper.find('a[href="/rayons"]').text()).toBe('Rayons')
    // La première carte est ouverte (deux lignes, deux boutons), les autres repliées
    const [first, second, third] = cards(wrapper)
    expect(first?.findAll('input[type="radio"]')).toHaveLength(2)
    expect(first?.text()).toContain('Fusionner')
    expect(first?.text()).toContain('Pas le même')
    expect(second?.text()).toContain('Épice guacamole = Épice pour guacamole')
    expect(second?.text()).toContain('Voir et fusionner')
    expect(third?.find('input[type="radio"]').exists()).toBe(false)
    // Une seule lecture, aucun aperçu tant qu'on ne fusionne pas
    expect(calls(fetchMock).filter((call) => call.includes('ingredients'))).toEqual([
      'GET /api/v1/ingredients/duplicates',
    ])
  })

  it('dit les compteurs sans zéro et préselectionne la suggestion du back', async () => {
    const { wrapper } = await open()
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))

    const first = cards(wrapper)[0]
    expect(first?.text()).toContain('1 recette')
    expect(first?.text()).toContain('Utilisé nulle part')
    const checked = first
      ?.findAll('input[type="radio"]')
      .map((radio) => (radio.element as HTMLInputElement).checked)
    expect(checked).toEqual([true, false])
    expect(first?.text().match(/À garder/g)).toHaveLength(1)
    expect(first?.find('[data-testid="duplicate-effect"]').text()).toBe(
      '« Melon » n’est utilisé nulle part.',
    )
  })

  it('bascule « À garder » et la phrase d’effet sans aucun appel réseau', async () => {
    const { wrapper, fetchMock } = await open()
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))
    const before = fetchMock.mock.calls.length

    await cards(wrapper)[0]?.findAll('input[type="radio"]')[1]?.setValue(true)

    const first = cards(wrapper)[0]
    expect(
      first
        ?.findAll('input[type="radio"]')
        .map((radio) => (radio.element as HTMLInputElement).checked),
    ).toEqual([false, true])
    expect(first?.find('[data-testid="duplicate-effect"]').text()).toBe(
      '1 recette passe sur « Melon ».',
    )
    expect(fetchMock.mock.calls.length).toBe(before)
  })

  it('ouvre une autre carte en repliant la précédente', async () => {
    const { wrapper } = await open()
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))

    await cards(wrapper)[2]?.find('button').trigger('click')

    expect(cards(wrapper)[0]?.find('input[type="radio"]').exists()).toBe(false)
    expect(cards(wrapper)[2]?.findAll('input[type="radio"]')).toHaveLength(2)
    expect(cards(wrapper)[2]?.find('[data-testid="duplicate-effect"]').text()).toBe(
      '1 recette passe sur « Pâte ».',
    )
  })

  it('traite un niveau inconnu comme une suggestion', async () => {
    const { wrapper } = await open({
      'GET /api/v1/ingredients/duplicates': () =>
        json({
          member: [pair(side('a', 'Tomate', 1, 0), side('b', 'Tomates', 1, 0), 'a', 'ALIAS')],
          totalItems: 1,
        }),
    })
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(1))

    expect(cards(wrapper)[0]?.attributes('data-level')).toBe('SUGGESTION')
  })

  it('dit une phrase courte quand il n’y a aucun doublon', async () => {
    const { wrapper } = await open({
      'GET /api/v1/ingredients/duplicates': () => json({ member: [], totalItems: 0 }),
    })

    await vi.waitFor(() => expect(wrapper.text()).toContain('Aucun doublon pour le moment.'))
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('dit l’échec en trois phrases et relit au bouton « Réessayer »', async () => {
    let attempts = 0
    const { wrapper } = await open({
      'GET /api/v1/ingredients/duplicates': () =>
        ++attempts === 1 ? json({ error: { message: 'x' } }, { status: 500 }) : json(duplicates),
    })

    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Les doublons ne se sont pas affichés. Rien n’a changé.',
    )

    await wrapper.find('button').trigger('click')
    await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))
  })

  describe('« Fusionner »', () => {
    const merging = (handlers: Parameters<typeof stubApi>[0] = {}) => {
      let merged = false
      return open({
        'GET /api/v1/ingredients/duplicates': () =>
          json(merged ? { member: duplicates.member.slice(1), totalItems: 2 } : duplicates),
        'GET /api/v1/ingredients/melon-2/merge-preview': () => json(preview()),
        'POST /api/v1/ingredients/melon-2/merge': () => {
          merged = true

          return new Response(null, { status: 204 })
        },
        ...handlers,
      })
    }

    it('demande l’aperçu à l’ouverture de la confirmation, puis fusionne l’absorbé dans le gardé', async () => {
      const { wrapper, fetchMock, context } = await merging()
      await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))

      await cards(wrapper)[0]?.findAll('button')[0]?.trigger('click')
      await vi.waitFor(() => expect(document.body.textContent).toContain('Tes quantités'))

      const preview = fetchMock.mock.calls
        .map(([input]) => new URL((input as Request).url))
        .find((url) => url.pathname.endsWith('/merge-preview'))
      expect(preview?.searchParams.get('into')).toBe('melon')
      expect(document.body.textContent).toContain('Fusionner « Melon » dans « Melon » ?')

      button('Fusionner')?.click()
      await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(2))

      const index = calls(fetchMock).indexOf('POST /api/v1/ingredients/melon-2/merge')
      expect(await bodyOf(fetchMock, index)).toEqual({ into: 'melon' })
      await vi.waitFor(() =>
        expect(useNotificationsStore().items.map((item) => item.text)).toContain(
          'Fusionné dans « Melon ».',
        ),
      )
      // La liste est relue après la fusion, et une seule fois la lecture de l'aperçu
      expect(calls(fetchMock).filter((call) => call.endsWith('/duplicates'))).toHaveLength(2)
      expect(calls(fetchMock).filter((call) => call.endsWith('/merge-preview'))).toHaveLength(1)
      expect(context.router.currentRoute.value.path).toBe('/ingredients/doublons')
      // Le focus revient au titre, la carte qui l'avait n'existe plus
      await vi.waitFor(() => expect(document.activeElement?.tagName).toBe('H1'))
    })

    it('ferme la feuille, prévient et relit la liste quand un des deux a disparu pendant la fusion (404)', async () => {
      let gone = false
      const { wrapper, fetchMock } = await merging({
        'GET /api/v1/ingredients/duplicates': () =>
          json(gone ? { member: duplicates.member.slice(1), totalItems: 2 } : duplicates),
        'POST /api/v1/ingredients/melon-2/merge': () => {
          gone = true

          return json({ error: { message: 'Ingrédient introuvable' } }, { status: 404 })
        },
      })
      await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))
      await cards(wrapper)[0]?.findAll('button')[0]?.trigger('click')
      await vi.waitFor(() => expect(document.body.textContent).toContain('Tes quantités'))

      button('Fusionner')?.click()

      await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(2))
      expect(document.body.querySelector('[role="dialog"]')).toBeNull()
      expect(useNotificationsStore().items.map((item) => item.text)).toContain(
        'Cet ingrédient n’existe plus. La liste est à jour.',
      )
      expect(calls(fetchMock).filter((call) => call.endsWith('/duplicates'))).toHaveLength(2)
    })

    it('fusionne dans l’ingrédient choisi quand on a basculé « À garder »', async () => {
      const { wrapper, fetchMock } = await merging({
        'GET /api/v1/ingredients/melon/merge-preview': () => json(preview()),
        'POST /api/v1/ingredients/melon/merge': () => new Response(null, { status: 204 }),
      })
      await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))
      await cards(wrapper)[0]?.findAll('input[type="radio"]')[1]?.setValue(true)

      await cards(wrapper)[0]?.findAll('button')[0]?.trigger('click')
      await vi.waitFor(() => expect(document.body.textContent).toContain('Tes quantités'))
      button('Fusionner')?.click()
      await vi.waitFor(() =>
        expect(calls(fetchMock)).toContain('POST /api/v1/ingredients/melon/merge'),
      )

      const index = calls(fetchMock).indexOf('POST /api/v1/ingredients/melon/merge')
      expect(await bodyOf(fetchMock, index)).toEqual({ into: 'melon-2' })
    })
  })

  describe('l’autre ligne d’une carte', () => {
    it('se choisit en touchant son nom : la phrase d’effet, puis l’aperçu et la confirmation suivent ce choix', async () => {
      const { wrapper, fetchMock } = await open({
        'GET /api/v1/ingredients/epice-pour-guacamole/merge-preview': () => json(preview()),
      })
      await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))
      await cards(wrapper)[1]?.find('button')?.trigger('click')
      const card = () => cards(wrapper)[1]!
      const effect = () => card().find('[data-testid="duplicate-effect"]').text()
      // Le back suggère « Épice pour guacamole » (5 recettes) : l'autre passe dessus
      expect(effect()).toBe('2 recettes et 1 liste passent sur « Épice pour guacamole ».')
      const before = fetchMock.mock.calls.length

      const name = card()
        .findAll('span')
        .find((candidate) => candidate.text() === 'Épice guacamole')
      await name?.trigger('click')

      expect(effect()).toBe('5 recettes et 2 listes passent sur « Épice guacamole ».')
      expect(
        (card().find('input[value="epice-guacamole"]').element as HTMLInputElement).checked,
      ).toBe(true)
      expect(
        (card().find('input[value="epice-pour-guacamole"]').element as HTMLInputElement).checked,
      ).toBe(false)
      expect(
        card()
          .text()
          .match(/À garder/g),
      ).toHaveLength(1)
      expect(fetchMock.mock.calls.length).toBe(before)

      await card().findAll('button')[0]?.trigger('click')
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain(
          'Fusionner « Épice pour guacamole » dans « Épice guacamole » ?',
        ),
      )
      const url = fetchMock.mock.calls
        .map(([input]) => new URL((input as Request).url))
        .find((candidate) => candidate.pathname.endsWith('/merge-preview'))
      expect(url?.pathname).toBe('/api/v1/ingredients/epice-pour-guacamole/merge-preview')
      expect(url?.searchParams.get('into')).toBe('epice-guacamole')
    })
  })

  describe('« Pas le même »', () => {
    const distinctButton = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
      cards(wrapper)[0]?.findAll('button')[1]

    it('retire la carte tout de suite, avant la réponse du back, puis relit la liste', async () => {
      let answer: (response: Response) => void = () => {}
      let remaining = false
      const { wrapper, fetchMock } = await open({
        'GET /api/v1/ingredients/duplicates': () =>
          json(remaining ? { member: duplicates.member.slice(1), totalItems: 2 } : duplicates),
        'POST /api/v1/ingredients/melon/distinct-from': () =>
          new Promise<Response>((resolve) => {
            answer = resolve
          }) as unknown as Response,
      })
      await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))

      await distinctButton(wrapper)?.trigger('click')
      await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(2))
      remaining = true
      answer(new Response(null, { status: 204 }))
      await flushPromises()

      const index = calls(fetchMock).indexOf('POST /api/v1/ingredients/melon/distinct-from')
      expect(await bodyOf(fetchMock, index)).toEqual({ other: 'melon-2' })
      await vi.waitFor(() =>
        expect(calls(fetchMock).filter((call) => call.endsWith('/duplicates'))).toHaveLength(2),
      )
      expect(cards(wrapper)).toHaveLength(2)
      expect(useNotificationsStore().items.map((item) => item.text)).toContain(
        'Ces deux ingrédients restent séparés.',
      )
      // La carte suivante s'ouvre : c'est la première de la liste
      expect(cards(wrapper)[0]?.findAll('input[type="radio"]')).toHaveLength(2)
    })

    it('remet la carte et le dit quand l’écriture échoue', async () => {
      const { wrapper } = await open({
        'POST /api/v1/ingredients/melon/distinct-from': () =>
          json({ error: { message: 'x' } }, { status: 500 }),
      })
      await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))

      await distinctButton(wrapper)?.trigger('click')

      await vi.waitFor(() =>
        expect(useNotificationsStore().items.map((item) => item.text)).toContain(
          'Ce choix n’a pas été enregistré. Rien n’a changé. Réessaie.',
        ),
      )
      await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))
    })

    it('retire aussi la carte quand l’un des deux n’existe plus (404)', async () => {
      let gone = false
      const { wrapper } = await open({
        'GET /api/v1/ingredients/duplicates': () =>
          json(gone ? { member: duplicates.member.slice(1), totalItems: 2 } : duplicates),
        'POST /api/v1/ingredients/melon/distinct-from': () => {
          gone = true

          return json({ error: { message: 'Ingrédient introuvable' } }, { status: 404 })
        },
      })
      await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(3))

      await distinctButton(wrapper)?.trigger('click')

      await vi.waitFor(() => expect(cards(wrapper)).toHaveLength(2))
      await flushPromises()
      expect(cards(wrapper)).toHaveLength(2)
    })
  })
})
