import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import type { MergePreview } from '@/api'
import MergeConfirmSheet from '@/features/ingredients/MergeConfirmSheet.vue'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'
import { preview } from './mergeFixtures'

const base = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
}

const absorbed = { slug: 'tomates', name: 'Tomates' }
const kept = { slug: 'tomate', name: 'Tomate' }

async function open(handlers: Parameters<typeof stubApi>[0] = {}) {
  const fetchMock = stubApi({ ...base, ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/ingredients/doublons')
  const invalidate = vi.spyOn(context.queryClient, 'invalidateQueries')
  const wrapper = mount(MergeConfirmSheet, {
    attachTo: document.body,
    props: {
      absorbed,
      kept,
      open: true,
      'onUpdate:open': (value: boolean) => void wrapper.setProps({ open: value }),
    },
    global: { plugins: context.plugins },
  })

  return { wrapper, context, fetchMock, invalidate }
}

const sheet = () => document.body.querySelector('[role="dialog"]')
const text = () => sheet()?.textContent ?? ''
const buttons = () => [...(sheet()?.querySelectorAll('button, a') ?? [])]
const labelled = (label: string) =>
  buttons().find((candidate) => candidate.textContent?.trim() === label)
const previewOf = (overrides: Partial<MergePreview> = {}) => ({
  'GET /api/v1/ingredients/tomates/merge-preview': () => json(preview(overrides)),
})
const ready = () => vi.waitFor(() => expect(text()).not.toContain('Chargement'))

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('MergeConfirmSheet', () => {
  it('annonce le chargement et ne propose pas encore « Fusionner »', async () => {
    await open({
      'GET /api/v1/ingredients/tomates/merge-preview': () =>
        new Promise<Response>(() => {}) as never,
    })

    await vi.waitFor(() => expect(text()).toContain('Fusionner « Tomates » dans « Tomate » ?'))
    expect(sheet()?.querySelector('[role="status"]')?.textContent).toContain('Chargement')
    expect(labelled('Fusionner')).toBeUndefined()
  })

  it('demande l’aperçu avec l’absorbé dans l’adresse et le gardé en paramètre', async () => {
    const { fetchMock } = await open(previewOf())
    await ready()

    const [input] = fetchMock.mock.lastCall ?? []
    const url = new URL((input as Request).url)
    expect(url.pathname).toBe('/api/v1/ingredients/tomates/merge-preview')
    expect(url.searchParams.get('into')).toBe('tomate')
  })

  it('dit les trois effets du cas normal', async () => {
    await open(previewOf())
    await ready()

    expect(
      [...(sheet()?.querySelectorAll('[data-testid="merge-effects"] li') ?? [])].map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual([
      '7 recettes et 2 listes de courses utiliseront « Tomate ».',
      'Tes quantités ne changent pas.',
      '« Tomates » est supprimé. Tu ne pourras pas le retrouver.',
    ])
    expect(labelled('Fusionner')?.hasAttribute('disabled')).toBe(false)
    expect(labelled('Annuler')).toBeDefined()
  })

  it('dit « nulle part » quand l’absorbé ne sert à rien', async () => {
    await open(previewOf({ recipeCount: 0, listCount: 0 }))
    await ready()

    expect(text()).toContain('« Tomates » n’est utilisé nulle part.')
  })

  it('dit le changement de rayon à la place de « rien ne change »', async () => {
    await open(
      previewOf({
        departmentChanges: true,
        absorbed: { ...preview().absorbed, departmentName: 'Surgelé' },
      }),
    )
    await ready()

    expect(text()).toContain('« Tomates » passe du rayon Surgelé au rayon Fruit & légume.')
    expect(text()).not.toContain('Tes quantités ne changent pas.')
  })

  it('dit la conversion des listes', async () => {
    await open(previewOf({ listQuantitiesConverted: true }))
    await ready()

    expect(text()).toContain('Tes quantités en liste sont converties en « kilo ».')
    expect(text()).not.toContain('Tes quantités ne changent pas.')
  })

  describe('quand une unité manque', () => {
    const missing = (units: string[]) =>
      previewOf({
        blockedBy: 'UNIT_MISSING',
        canMerge: false,
        missingUnits: units.map((name) => ({ slug: name, name })),
      })

    it('explique, propose de modifier l’ingrédient gardé et ne propose pas « Fusionner »', async () => {
      await open(missing(['tranche']))
      await ready()

      expect(text()).toContain('« Tomate » ne connaît pas toutes les unités.')
      expect(text()).toContain(
        'La quantité en « tranche » ne peut pas être convertie en « kilo ». Rien n’a changé.',
      )
      expect(text()).not.toContain('utiliseront')
      expect(labelled('Fusionner')).toBeUndefined()
      expect(labelled('Modifier « Tomate »')?.getAttribute('href')).toBe(
        '/ingredients/tomate/modifier',
      )
    })

    it('accorde la phrase avec plusieurs unités', async () => {
      await open(missing(['tranche', 'pincée']))
      await ready()

      expect(text()).toContain(
        'Les quantités en « tranche » et « pincée » ne peuvent pas être converties en « kilo ». Rien n’a changé.',
      )
    })

    it('ferme la feuille quand on va modifier l’ingrédient gardé', async () => {
      const { wrapper } = await open(missing(['tranche']))
      await ready()

      ;(labelled('Modifier « Tomate »') as HTMLElement).click()
      await flushPromises()

      expect(wrapper.props('open')).toBe(false)
    })
  })

  describe('quand la fusion est refusée', () => {
    it('dit pour une liste envoyée : rouvre ou termine, puis fusionne', async () => {
      await open(previewOf({ blockedBy: 'IN_SENT_LIST', canMerge: false }))
      await ready()

      expect(sheet()?.querySelector('[data-testid="merge-blocked"]')?.textContent).toBe(
        'Une liste envoyée au drive utilise l’un des deux. Rouvre-la ou termine-la, puis fusionne.',
      )
      expect(labelled('Fusionner')).toBeUndefined()
      expect(labelled('Compris')).toBeDefined()
    })

    it.each([
      ['SAME_INGREDIENT', 'Choisis deux ingrédients différents.'],
      ['COMMON_INGREDIENT', 'Un ingrédient commun ne se fusionne pas. Rien n’a changé.'],
      ['USED_BY_ANOTHER_USER', 'Quelqu’un d’autre utilise « Tomates ». Rien n’a changé.'],
      [
        'UN_REFUS_DE_DEMAIN',
        'Ces deux ingrédients ne peuvent pas être fusionnés. Rien n’a changé.',
      ],
    ])('dit une phrase pour %s', async (blockedBy, sentence) => {
      await open(previewOf({ blockedBy: blockedBy as MergePreview['blockedBy'], canMerge: false }))
      await ready()

      expect(text()).toContain(sentence)
      expect(labelled('Fusionner')).toBeUndefined()
    })

    it('refuse aussi sans raison donnée quand le back dit que la fusion est impossible', async () => {
      await open(previewOf({ canMerge: false }))
      await ready()

      expect(text()).toContain('Ces deux ingrédients ne peuvent pas être fusionnés.')
      expect(labelled('Fusionner')).toBeUndefined()
    })

    it('ferme avec « Compris »', async () => {
      const { wrapper } = await open(previewOf({ blockedBy: 'IN_SENT_LIST', canMerge: false }))
      await ready()

      ;(labelled('Compris') as HTMLElement).click()
      await flushPromises()

      expect(wrapper.props('open')).toBe(false)
    })
  })

  describe("quand l'aperçu ne se lit pas", () => {
    it('dit une phrase courte et relit au bouton « Réessayer »', async () => {
      let attempts = 0
      const { fetchMock } = await open({
        'GET /api/v1/ingredients/tomates/merge-preview': () =>
          ++attempts === 1 ? json({ error: { message: 'x' } }, { status: 500 }) : json(preview()),
      })
      await vi.waitFor(() => expect(sheet()?.querySelector('[role="alert"]')).not.toBeNull())

      expect(text()).toContain('Ce qui change ne s’est pas affiché. Rien n’a changé.')
      ;(labelled('Réessayer') as HTMLElement).click()
      await vi.waitFor(() => expect(text()).toContain('Tes quantités'))
      expect(calls(fetchMock).filter((call) => call.endsWith('/merge-preview'))).toHaveLength(2)
    })

    it('ferme la feuille et prévient quand un des deux n’existe plus (404)', async () => {
      const { wrapper } = await open({
        'GET /api/v1/ingredients/tomates/merge-preview': () =>
          json({ error: { message: 'x' } }, { status: 404 }),
      })

      await vi.waitFor(() => expect(wrapper.emitted('gone')).toHaveLength(1))
      expect(wrapper.props('open')).toBe(false)
      expect(useNotificationsStore().items.map((item) => item.text)).toContain(
        'Cet ingrédient n’existe plus. La liste est à jour.',
      )
    })
  })

  describe('« Fusionner »', () => {
    const merging = (answer: () => Response | Promise<Response>, again?: () => Response) =>
      open({
        ...previewOf(),
        ...(again ? { 'GET /api/v1/ingredients/tomates/merge-preview': again } : {}),
        'POST /api/v1/ingredients/tomates/merge': answer,
      })

    it('envoie le gardé, ferme, annonce et rend le rayon de l’ingrédient gardé', async () => {
      const { wrapper, fetchMock } = await merging(() => new Response(null, { status: 204 }))
      await ready()

      ;(labelled('Fusionner') as HTMLElement).click()
      await vi.waitFor(() => expect(wrapper.emitted('merged')).toHaveLength(1))

      const index = calls(fetchMock).indexOf('POST /api/v1/ingredients/tomates/merge')
      expect(await bodyOf(fetchMock, index)).toEqual({ into: 'tomate' })
      expect(wrapper.emitted('merged')?.[0]).toEqual(['fruit-et-legume'])
      expect(wrapper.props('open')).toBe(false)
      expect(useNotificationsStore().items.map((item) => item.text)).toContain(
        'Fusionné dans « Tomate ».',
      )
    })

    it('invalide ce que la fusion a changé : ingrédients, rayons, recettes, listes, drive et choix', async () => {
      const { wrapper, invalidate } = await merging(() => new Response(null, { status: 204 }))
      await ready()

      ;(labelled('Fusionner') as HTMLElement).click()
      await vi.waitFor(() => expect(wrapper.emitted('merged')).toHaveLength(1))

      const keys = invalidate.mock.calls.map(
        ([filters]) => (filters as { queryKey: string[] }).queryKey,
      )
      expect(keys).toEqual(
        expect.arrayContaining([
          ['ingredients'],
          ['departments'],
          ['recipes'],
          ['shopping-lists'],
          ['drive'],
          ['drive', 'choices'],
        ]),
      )
    })

    it('ne relit pas l’aperçu de l’absorbé qui n’existe plus', async () => {
      const { wrapper, fetchMock } = await merging(() => new Response(null, { status: 204 }))
      await ready()

      ;(labelled('Fusionner') as HTMLElement).click()
      await vi.waitFor(() => expect(wrapper.emitted('merged')).toHaveLength(1))
      await flushPromises()

      expect(calls(fetchMock).filter((call) => call.endsWith('/merge-preview'))).toHaveLength(1)
    })

    it('dit le conflit, relit l’aperçu et laisse réessayer', async () => {
      let writes = 0
      const { fetchMock } = await merging(() =>
        ++writes === 1
          ? json({ error: { message: 'INGREDIENT_MERGE_CONFLICT' } }, { status: 409 })
          : new Response(null, { status: 204 }),
      )
      await ready()

      ;(labelled('Fusionner') as HTMLElement).click()
      await vi.waitFor(() =>
        expect(sheet()?.querySelector('[role="alert"]')?.textContent).toContain(
          'Quelque chose a changé pendant la fusion. Réessaie.',
        ),
      )
      await vi.waitFor(() =>
        expect(calls(fetchMock).filter((call) => call.endsWith('/merge-preview'))).toHaveLength(2),
      )
      await vi.waitFor(() => expect(labelled('Fusionner')?.hasAttribute('disabled')).toBe(false))
    })

    it('ferme et prévient quand un des deux a disparu (404)', async () => {
      const { wrapper } = await merging(() => json({ error: { message: 'x' } }, { status: 404 }))
      await ready()

      ;(labelled('Fusionner') as HTMLElement).click()

      await vi.waitFor(() => expect(wrapper.emitted('gone')).toHaveLength(1))
      expect(wrapper.props('open')).toBe(false)
    })

    it('montre le refus que l’aperçu relu explique, sans phrase de plus', async () => {
      let reads = 0
      await merging(
        () => json({ error: { message: 'INGREDIENT_IN_SENT_LIST' } }, { status: 409 }),
        () =>
          json(++reads === 1 ? preview() : preview({ blockedBy: 'IN_SENT_LIST', canMerge: false })),
      )
      await ready()

      ;(labelled('Fusionner') as HTMLElement).click()

      await vi.waitFor(() =>
        expect(sheet()?.querySelector('[data-testid="merge-blocked"]')).not.toBeNull(),
      )
      expect(text()).toContain('Une liste envoyée au drive utilise l’un des deux.')
      expect(sheet()?.querySelector('[role="alert"]')).toBeNull()
    })

    it('dit un échec inattendu en trois phrases et laisse réessayer', async () => {
      await merging(() => json({ error: { message: 'x' } }, { status: 500 }))
      await ready()

      ;(labelled('Fusionner') as HTMLElement).click()

      await vi.waitFor(() =>
        expect(sheet()?.querySelector('[role="alert"]')?.textContent).toBe(
          'La fusion n’a pas eu lieu. Rien n’a changé. Réessaie.',
        ),
      )
      await vi.waitFor(() => expect(labelled('Fusionner')?.hasAttribute('disabled')).toBe(false))
    })

    it('désactive « Fusionner » pendant l’écriture, une seule fusion part', async () => {
      let answer: (response: Response) => void = () => {}
      const { fetchMock } = await merging(
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve
          }),
      )
      await ready()

      ;(labelled('Fusionner') as HTMLElement).click()
      await vi.waitFor(() => expect(labelled('Fusionner')?.hasAttribute('disabled')).toBe(true))
      ;(labelled('Fusionner') as HTMLElement).click()
      answer(new Response(null, { status: 204 }))
      await flushPromises()

      expect(
        calls(fetchMock).filter((call) => call.startsWith('POST /api/v1/ingredients')),
      ).toHaveLength(1)
    })
  })
})
