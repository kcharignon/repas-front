import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { calls, json } from '@/__tests__/helpers'
import { useNotificationsStore } from '@/notifications/store'
import ListTypeView from '../ListTypeView.vue'
import { boucherie, boucherieDetail, collection, marche, cleanUp, open, sentBody } from './fixtures'

const list = 'GET /api/v1/shopping-list-types'
const detail = 'GET /api/v1/shopping-list-types/t1'
const update = 'PUT /api/v1/shopping-list-types/t1'
const remove = 'DELETE /api/v1/shopping-list-types/t1'
const destination = 'PUT /api/v1/ingredients/merguez/list-destination'
const noContent = () => new Response(null, { status: 204 })

const opened = (extra: Parameters<typeof open>[2] = {}) =>
  open(ListTypeView, '/moi/types-de-liste/t1', {
    [list]: collection(boucherie, marche),
    [detail]: () => json(boucherieDetail),
    ...extra,
  })

const body = () => document.body.textContent ?? ''
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent?.trim() === name || candidate.getAttribute('aria-label') === name,
  )
const switchOf = (name: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>('[role="switch"]')].find(
    (candidate) => candidate.labels?.[0]?.textContent === name,
  )!

describe('fiche d’un type de liste', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    cleanUp()
  })

  it('montre le nom, un interrupteur par rayon et les produits à part', async () => {
    const { wrapper } = await opened()

    expect(wrapper.get('h1').text()).toBe('Boucherie')
    expect(document.body.querySelector<HTMLInputElement>('input')!.value).toBe('Boucherie')
    expect(wrapper.findAll('h2').map((title) => title.text())).toEqual([
      'Rayons dans cette liste',
      'Produits à part',
    ])
    const switches = [...document.body.querySelectorAll('[role="switch"]')]
    expect(switches.map((one) => one.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ])
    expect(switches.map((one) => (one as HTMLButtonElement).labels?.[0]?.textContent)).toEqual([
      'Viandes',
      'Charcuterie',
      'Fruits et légumes',
      'Épicerie',
    ])
    expect(wrapper.text()).toContain('Merguez')
    expect(wrapper.text()).toContain('Charcuterie')
    expect(wrapper.text()).toContain('Pour ajouter un produit, ouvre sa fiche et choisis sa liste.')
  })

  it('dit « Dans Marché » pour un rayon déjà pris par un autre type, et rien pour les autres', async () => {
    const { wrapper } = await opened()

    const hints = wrapper.findAll('li p').map((hint) => hint.text())
    expect(hints).toEqual(['Dans Marché'])
  })

  it('« Enregistrer » est grisé tant que rien n’a changé', async () => {
    await opened()

    expect(button('Enregistrer')!.hasAttribute('disabled')).toBe(true)
    switchOf('Charcuterie').click()
    await flushPromises()
    expect(button('Enregistrer')!.hasAttribute('disabled')).toBe(false)
    switchOf('Charcuterie').click()
    await flushPromises()
    expect(button('Enregistrer')!.hasAttribute('disabled')).toBe(true)
  })

  it('envoie le nom et le jeu complet des rayons en une seule requête, rayon déplacé compris', async () => {
    const { fetchMock } = await opened({ [update]: noContent })

    switchOf('Viandes').click()
    switchOf('Charcuterie').click()
    // « Fruits et légumes » est pris par Marché : cocher le déplace ici
    switchOf('Fruits et légumes').click()
    const input = document.body.querySelector<HTMLInputElement>('input')!
    input.value = ' Boucher '
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    button('Enregistrer')!.click()
    await flushPromises()

    expect(await sentBody(fetchMock, update)).toEqual({
      name: 'Boucher',
      departmentSlugs: ['charcuterie', 'fruits-legumes'],
    })
    expect(calls(fetchMock).filter((call) => call === update)).toHaveLength(1)
    expect(useNotificationsStore().items.map((item) => item.text)).toEqual(['Type enregistré.'])
    // Les rayons (et le type qui les prend) sont relus
    expect(calls(fetchMock).filter((call) => call === 'GET /api/v1/departments')).toHaveLength(2)
  })

  it('refuse un nom vide sans rien envoyer', async () => {
    const { fetchMock } = await opened()

    const input = document.body.querySelector<HTMLInputElement>('input')!
    input.value = '   '
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    document.body.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(body()).toContain('Écris un nom.')
    expect(calls(fetchMock)).not.toContain(update)
  })

  it('dit un nom déjà pris sous le champ, et garde ce qui a été tapé', async () => {
    await opened({
      [update]: () => json({ error: { message: 'LIST_TYPE_NAME_ALREADY_USED' } }, { status: 409 }),
    })

    const input = document.body.querySelector<HTMLInputElement>('input')!
    input.value = 'Marché'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    button('Enregistrer')!.click()
    await flushPromises()

    expect(document.body.querySelector('p.text-danger')?.textContent).toBe(
      'Tu as déjà un type qui s’appelle comme ça. Choisis un autre nom.',
    )
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.value).toBe('Marché')
    expect(useNotificationsStore().items).toEqual([])
  })

  it('retire un produit à part tout de suite (« default ») et relit le type', async () => {
    let released = false
    const { fetchMock, wrapper } = await opened({
      [detail]: () => json(released ? { ...boucherieDetail, ingredients: [] } : boucherieDetail),
      [destination]: () => {
        released = true

        return noContent()
      },
    })

    button('Retirer Merguez de ce type')!.click()
    await flushPromises()

    expect(await sentBody(fetchMock, destination)).toEqual({ destination: 'default' })
    expect(wrapper.text()).not.toContain('Merguez')
    expect(wrapper.text()).toContain('Aucun produit à part pour l’instant.')
    expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
      'Merguez n’est plus à part.',
    ])
  })

  it('une relecture ne remplace pas ce qui est en train d’être tapé', async () => {
    const { context } = await opened({
      [destination]: noContent,
    })

    const input = document.body.querySelector<HTMLInputElement>('input')!
    input.value = 'Boucherie du coin'
    input.dispatchEvent(new Event('input'))
    switchOf('Charcuterie').click()
    await flushPromises()
    button('Retirer Merguez de ce type')!.click()
    await flushPromises()
    await context.queryClient.invalidateQueries()
    await flushPromises()

    expect(input.value).toBe('Boucherie du coin')
    expect(switchOf('Charcuterie').getAttribute('aria-checked')).toBe('true')
  })

  it('supprime le type après confirmation, en disant que rien n’est perdu, puis revient aux types', async () => {
    const { fetchMock, context } = await opened({ [remove]: noContent })

    button('Supprimer ce type')!.click()
    await flushPromises()
    expect(body()).toContain('Supprimer « Boucherie » ?')
    expect(body()).toContain('Sa liste en cours passe dans Mes listes. Rien n’est perdu.')
    expect(calls(fetchMock)).not.toContain(remove)
    const confirm = [...document.body.querySelectorAll('[role="dialog"] button')].find(
      (candidate) => candidate.textContent?.trim() === 'Supprimer',
    ) as HTMLButtonElement
    confirm.click()
    await flushPromises()

    expect(calls(fetchMock)).toContain(remove)
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('list-types'))
    expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
      'Le type « Boucherie » est supprimé.',
    ])
    // Le type supprimé n'est pas relu (il n'existe plus) ; « Mes listes » l'est
    expect(calls(fetchMock).filter((call) => call === detail)).toHaveLength(1)
  })

  it('annuler la confirmation ne supprime rien', async () => {
    const { fetchMock } = await opened()

    button('Supprimer ce type')!.click()
    await flushPromises()
    button('Annuler')!.click()
    await flushPromises()

    expect(calls(fetchMock)).not.toContain(remove)
  })

  it('dit que le type n’existe plus (404) et ne montre ni formulaire ni suppression', async () => {
    const { wrapper } = await opened({
      [detail]: () => json({ error: { message: 'Type inconnu' } }, { status: 404 }),
    })

    expect(wrapper.get('[role="alert"]').text()).toBe('Ce type n’existe plus.')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(button('Supprimer ce type')).toBeUndefined()
  })

  it('revient à l’écran des types', async () => {
    const { wrapper } = await opened()

    const back = wrapper.get('a')
    expect(back.text()).toBe('Types de liste')
    expect(back.attributes('href')).toBe('/moi/types-de-liste')
  })
})
