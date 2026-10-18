import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import App from '@/App.vue'
import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import { DRAFT_KEY } from '../bridge'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import { useDriveReturnStore } from '../returnStore'
import { plan, storeBaseUrl } from './fixtures'
import { result, RUN } from './results'

const OTHER_RUN = '0b6d1a3e-7c1f-4a55-9a8e-2f4d9c3b7e10'

const noContent = () => new Response(null, { status: 204 })

const mounted: { unmount: () => void }[] = []

async function mountApp() {
  stubApi({
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
  })
  localStorage.setItem('repas.session', '1')
  const native = fakeNative()
  ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/connexion')
  const wrapper = mount(App, { attachTo: document.body, global: { plugins: context.plugins } })
  mounted.push(wrapper)
  await flushPromises()

  return { wrapper, context, native }
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
