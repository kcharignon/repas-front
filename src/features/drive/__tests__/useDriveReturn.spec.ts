import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import App from '@/App.vue'
import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import { DRAFT_KEY } from '../bridge'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import { useDriveReturnStore } from '../returnStore'
import { buildPlanMessage } from '../buildPlanMessage'
import { sentLinesOf } from '../bridge/draft'
import { plan, storeBaseUrl } from './fixtures'
import { result, RUN } from './results'

const OTHER_RUN = '0b6d1a3e-7c1f-4a55-9a8e-2f4d9c3b7e10'

const noContent = () => new Response(null, { status: 204 })

const mounted: { unmount: () => void }[] = []

async function mountApp(extra: Parameters<typeof stubApi>[0] = {}, path = '/connexion') {
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/drive/plans/l1': () => json(plan()),
    'GET /api/v1/shopping-lists/l1': () => json({ id: 'l1', version: 7 }),
    'GET /api/v1/drive/settings': () =>
      json({
        enabled: true,
        retailer: 'leclerc',
        store: { id: '123456', label: null, baseUrl: storeBaseUrl },
      }),
    'PUT /api/v1/drive/choices': noContent,
    ...extra,
  })
  localStorage.setItem('repas.session', '1')
  const native = fakeNative()
  ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)
  const wrapper = mount(App, { attachTo: document.body, global: { plugins: context.plugins } })
  mounted.push(wrapper)
  await flushPromises()

  return { wrapper, context, native, fetchMock }
}

const driveResult = (runId = RUN, outcome: 'completed' | 'aborted' = 'completed') => ({
  v: 1,
  type: 'drive.result',
  result: result({ runId, outcome, lines: outcome === 'aborted' ? [] : result().lines }),
})

beforeEach(() =>
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ runId: RUN, listId: 'l1', startedAt: new Date().toISOString() }),
  ),
)

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.unstubAllGlobals()
  delete (globalThis as { repasNative?: unknown }).repasNative
  document.body.innerHTML = ''
  localStorage.clear()
  useDriveReturnStore().clear()
})

describe('écoute du drive au démarrage de l’application', () => {
  it('garde le résultat du passage en cours et mène à l’écran du retour', async () => {
    const { context, native } = await mountApp()

    native.reply(driveResult())
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-return'), {
      timeout: 5000,
    })

    expect(useDriveReturnStore().event).toMatchObject({
      kind: 'result',
      draft: { listId: 'l1' },
      result: { runId: RUN },
    })
  })

  it('mène à l’écran du retour pour un résultat d’un autre passage, qui y est expliqué', async () => {
    const { context, native } = await mountApp()

    native.reply(driveResult(OTHER_RUN))
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-return'), {
      timeout: 5000,
    })

    expect(useDriveReturnStore().event?.kind).toBe('stale')
  })

  it('ignore l’arrêt d’un passage que l’utilisateur a lui-même abandonné', async () => {
    const { context, native } = await mountApp()
    localStorage.removeItem(DRAFT_KEY)

    native.reply(driveResult(RUN, 'aborted'))
    await flushPromises()

    expect(useDriveReturnStore().event).toBeNull()
    expect(context.router.currentRoute.value.name).toBe('login')
  })

  // DRV-769 : le VRAI chemin de l'annulation depuis Repas : « Abandonner cet envoi » (écran d'envoi) envoie drive.cancel ET efface le brouillon ; l'application rend ensuite
  // un résultat aborted qui porte les lignes déjà faites. Elles ne sont plus jetées : recoupées avec le plan envoyé, enregistrées et cochées, sans ouvrir d'écran.
  it('l’abandon depuis l’écran d’envoi : les lignes que rend le résultat aborted sont enregistrées et cochées, sans écran', async () => {
    const sent = sentLinesOf(buildPlanMessage(plan(), {}, RUN))
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        runId: RUN,
        listId: 'l2',
        retailer: 'leclerc',
        startedAt: new Date().toISOString(),
        lines: sent,
      }),
    )
    const { context, native, fetchMock, wrapper } = await mountApp(
      { 'POST /api/v1/drive/plans/l2/basket-lines': noContent },
      '/drive/envoi/l1',
    )
    const abandon = await vi.waitFor(() => {
      const found = [...document.body.querySelectorAll('button')].find(
        (item) => item.textContent.trim() === 'Abandonner cet envoi',
      )
      if (found === undefined) throw new Error('bouton absent')
      return found
    })

    abandon.click()
    await flushPromises()
    expect(native.sent.map((message) => message.type)).toContain('drive.cancel')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()

    native.reply({
      v: 1,
      type: 'drive.result',
      result: result({
        outcome: 'aborted',
        error: { code: 'CANCELLED', message: 'Envoi abandonné.' },
        lines: [
          {
            ingredientSlug: 'farine',
            outcome: 'ADDED',
            productId: '123456',
            quantity: 1,
            usedRank: 1,
          },
          {
            ingredientSlug: 'poivre',
            outcome: 'CHOSEN',
            quantity: 1,
            placement: 'PRIMARY',
            product: { id: '555999', label: 'Produit de test' },
          },
          {
            ingredientSlug: 'inconnu',
            outcome: 'ADDED',
            productId: '999',
            quantity: 1,
            usedRank: 1,
          },
        ],
      }),
    })

    await vi.waitFor(() => expect(calls(fetchMock)).toContain('PUT /api/v1/drive/choices'))
    await vi.waitFor(() =>
      expect(calls(fetchMock)).toContain('POST /api/v1/drive/plans/l2/basket-lines'),
    )
    const body = async (index: number) =>
      (await (fetchMock.mock.calls[index]![0] as Request).clone().json()) as Record<string, unknown>
    // Le résultat est recoupé avec le plan envoyé : une ligne que le plan n'explique pas (« inconnu ») n'est ni cochée ni apprise
    expect(
      await body(calls(fetchMock).indexOf('POST /api/v1/drive/plans/l2/basket-lines')),
    ).toEqual({
      ingredientSlugs: ['farine', 'poivre'],
    })
    expect(
      JSON.stringify(await body(calls(fetchMock).indexOf('PUT /api/v1/drive/choices'))),
    ).not.toContain('inconnu')
    // Aucun écran : on reste sur l'écran d'envoi, et rien n'est gardé pour l'écran du retour
    expect(context.router.currentRoute.value.name).not.toBe('drive-return')
    expect(useDriveReturnStore().event).toBeNull()
    wrapper.unmount()
  })

  it('l’abandon dont le résultat ne porte aucune ligne n’écrit rien et n’ouvre aucun écran', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        runId: RUN,
        listId: 'l2',
        retailer: 'leclerc',
        startedAt: new Date().toISOString(),
        lines: sentLinesOf(buildPlanMessage(plan(), {}, RUN)),
      }),
    )
    const { context, native, fetchMock } = await mountApp(
      { 'POST /api/v1/drive/plans/l2/basket-lines': noContent },
      '/drive/envoi/l1',
    )
    const abandon = await vi.waitFor(() => {
      const found = [...document.body.querySelectorAll('button')].find(
        (item) => item.textContent.trim() === 'Abandonner cet envoi',
      )
      if (found === undefined) throw new Error('bouton absent')
      return found
    })
    abandon.click()
    await flushPromises()

    native.reply(driveResult(RUN, 'aborted'))
    await flushPromises()

    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/choices')
    expect(calls(fetchMock).some((call) => call.includes('basket-lines'))).toBe(false)
    expect(context.router.currentRoute.value.name).not.toBe('drive-return')
  })

  it.each([
    ['un refus', { v: 1, type: 'drive.error', code: 'UNAVAILABLE', runId: RUN }, 'refused'],
    ['une réponse mal formée', { v: 1, type: 'drive.result', result: { v: 1 } }, 'invalid'],
  ])('mène aussi à l’écran du retour pour %s', async (_label, message, kind) => {
    const { context, native } = await mountApp()

    native.reply(message)
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-return'), {
      timeout: 5000,
    })

    expect(useDriveReturnStore().event?.kind).toBe(kind)
  })

  it('n’écoute plus quand l’application est démontée', async () => {
    const { wrapper, native } = await mountApp()
    wrapper.unmount()

    native.reply(driveResult())
    await flushPromises()

    expect(useDriveReturnStore().event).toBeNull()
  })
})
