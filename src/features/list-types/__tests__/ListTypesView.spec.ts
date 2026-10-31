import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { calls, json } from '@/__tests__/helpers'
import { useNotificationsStore } from '@/notifications/store'
import ListTypesView from '../ListTypesView.vue'
import { boucherie, collection, marche, cleanUp, open, sentBody } from './fixtures'

const list = 'GET /api/v1/shopping-list-types'
const create = 'POST /api/v1/shopping-list-types'

const opened = (types: unknown[], extra: Parameters<typeof open>[2] = {}) =>
  open(ListTypesView, '/moi/types-de-liste', { [list]: collection(...types), ...extra })

const body = () => document.body.textContent ?? ''
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === name,
  )

describe('écran « Types de liste »', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    cleanUp()
  })

  it('montre chaque type avec ses rayons et ses produits à part, puis la liste principale', async () => {
    const { wrapper } = await opened([boucherie, marche])

    expect(wrapper.get('h1').text()).toBe('Types de liste')
    expect(wrapper.text()).toContain(
      'Sépare tes courses par magasin. Chaque type a sa propre liste.',
    )
    const rows = wrapper.findAll('li')
    expect(rows.map((row) => row.text())).toEqual([
      'BoucherieViandes · 1 produit à part',
      'MarchéFruits et légumes',
      'Liste principaleTout le reste',
    ])
    expect(wrapper.findAll('li a').map((link) => link.attributes('href'))).toEqual([
      '/moi/types-de-liste/t1',
      '/moi/types-de-liste/t2',
    ])
    // La liste principale n'est pas un lien, et elle n'est pas un bouton non plus
    expect(rows[2]!.find('a, button').exists()).toBe(false)
  })

  it('dit « n produits à part » au pluriel et « Aucun rayon » pour un type vide', async () => {
    const { wrapper } = await opened([
      { id: 't3', name: 'Boulangerie', departmentSlugs: [], ingredientCount: 0 },
      { ...marche, ingredientCount: 3 },
    ])

    expect(wrapper.findAll('li').map((row) => row.text())).toEqual([
      'BoulangerieAucun rayon pour l’instant',
      'MarchéFruits et légumes · 3 produits à part',
      'Liste principaleTout le reste',
    ])
  })

  it('un compte sans type voit l’écran vide, la liste principale et « Ajouter un type »', async () => {
    const { wrapper } = await opened([])

    expect(wrapper.text()).toContain('Tu n’as pas encore de type.')
    expect(wrapper.findAll('li').map((row) => row.text())).toEqual([
      'Liste principaleTout le reste',
    ])
    expect(button('Ajouter un type')).toBeDefined()
  })

  it('revient à « Moi »', async () => {
    const { wrapper } = await opened([])

    const back = wrapper.get('a')
    expect(back.text()).toBe('Moi')
    expect(back.attributes('href')).toBe('/moi')
  })

  it('dit que le serveur est injoignable quand la lecture échoue', async () => {
    const { wrapper } = await opened([], {
      [list]: () => json({ error: { message: 'x' } }, { status: 500 }),
    })

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Le serveur est injoignable. Réessaie dans un instant.',
    )
    expect(button('Ajouter un type')).toBeUndefined()
  })

  it('crée un type avec son seul nom, ferme la fenêtre et relit les types', async () => {
    let types: unknown[] = [boucherie]
    const { fetchMock } = await opened([], {
      [list]: () => json({ member: types, totalItems: types.length }),
      [create]: () => {
        types = [boucherie, marche]

        return new Response(null, {
          status: 201,
          headers: { Location: '/api/v1/shopping-list-types/t2' },
        })
      },
    })

    button('Ajouter un type')!.click()
    await flushPromises()
    expect(body()).toContain('Nouveau type de liste')
    const input = document.body.querySelector<HTMLInputElement>('input')!
    expect(input.labels?.[0]?.textContent).toBe('Nom du type')
    expect(input.maxLength).toBe(40)
    input.value = '  Marché '
    input.dispatchEvent(new Event('input'))
    document.body.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(await sentBody(fetchMock, create)).toEqual({ name: 'Marché' })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
      'Le type « Marché » est créé.',
    ])
    expect(calls(fetchMock).filter((call) => call === list)).toHaveLength(2)
    expect(body()).toContain('Fruits et légumes')
  })

  it('refuse un nom vide sans rien envoyer', async () => {
    const { fetchMock } = await opened([])

    button('Ajouter un type')!.click()
    await flushPromises()
    document.body.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(body()).toContain('Écris un nom.')
    expect(calls(fetchMock)).not.toContain(create)
  })

  it.each([
    ['LIST_TYPE_NAME_ALREADY_USED', 409, 'Tu as déjà un type qui s’appelle comme ça.'],
    ['LIST_TYPE_LIMIT_REACHED', 422, 'Tu as déjà 10 types. Supprime-en un pour en ajouter.'],
    ['LIST_TYPE_NAME_INVALID', 422, 'Ce nom n’est pas valable.'],
  ])(
    'dit le refus %s en phrases courtes, sans le code, et garde la fenêtre ouverte',
    async (code, status, text) => {
      await opened([], { [create]: () => json({ error: { message: code } }, { status }) })

      button('Ajouter un type')!.click()
      await flushPromises()
      const input = document.body.querySelector<HTMLInputElement>('input')!
      input.value = 'Marché'
      input.dispatchEvent(new Event('input'))
      document.body.querySelector('form')!.dispatchEvent(new Event('submit'))
      await flushPromises()

      expect(body()).toContain(text)
      expect(body()).not.toContain(code)
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
      expect(useNotificationsStore().items).toEqual([])
    },
  )

  it('une fenêtre rouverte repart vide, sans l’ancien refus', async () => {
    await opened([], {
      [create]: () => json({ error: { message: 'LIST_TYPE_NAME_ALREADY_USED' } }, { status: 409 }),
    })

    button('Ajouter un type')!.click()
    await flushPromises()
    const input = () => document.body.querySelector<HTMLInputElement>('input')!
    input().value = 'Marché'
    input().dispatchEvent(new Event('input'))
    document.body.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(body()).toContain('Tu as déjà un type')
    button('Annuler')!.click()
    await flushPromises()
    button('Ajouter un type')!.click()
    await flushPromises()

    expect(input().value).toBe('')
    expect(body()).not.toContain('Tu as déjà un type')
  })
})
