// Le magasin lu par l'application est enregistré tout seul (DRV-623) : ce fichier prouve, avec le VRAI pont (module `driveBridge`,
// `storeReader`) et un faux canal natif, qu'un résultat rejoué n'enregistre pas deux fois. Le message de l'application peut être livré
// deux fois (rechargement de la page, application qui renvoie). Les cas de l'écran avec une lecture simulée sont dans `DriveSettings.spec.ts`.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import type { SentMessage } from '../bridge/__tests__/fakeNative'
import DriveSettingsView from '../DriveSettingsView.vue'

// Magasin SYNTHÉTIQUE
const STORE = {
  id: '123456',
  host: 'ville-test.leclercdrive.fr',
  baseUrl: 'https://ville-test.leclercdrive.fr/magasin-123456-123456',
  label: null,
}
const settingsOf = (store: unknown = null) => ({ enabled: true, retailer: 'leclerc', store })
const found = (runId: string) => ({
  v: 1,
  type: 'drive.result',
  result: { v: 1, type: 'setup-result', runId, agentVersion: '1.0.0', store: STORE },
})
const noContent = () => new Response(null, { status: 204 })

/** Ouvre les réglages dans un faux pont qui répond à `drive.setup` comme l'application : `answers` fois le même résultat. */
async function openInApp(answers: number) {
  const native = fakeNative((message: SentMessage, reply) => {
    if (message.type === 'app.info')
      reply({ v: 1, type: 'app.info', version: '0.5.0', versionCode: 5, drive: true })
    if (message.type !== 'drive.setup') return
    // Le même message, livré `answers` fois, l'un derrière l'autre
    for (let n = 0; n < answers; n++)
      setTimeout(() => reply(found(message.runId ?? '')), 10 * (n + 1))
  })
  Object.assign(globalThis, { repasNative: native.bridge })
  // Le faux back se souvient du magasin qu'on lui écrit, comme le vrai
  let saved: unknown = null
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/drive/settings': () => json(settingsOf(saved)),
    'PUT /api/v1/drive/settings': async (request) => {
      saved = ((await request.clone().json()) as { store: unknown }).store

      return noContent()
    },
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/drive/reglages')
  const wrapper = mount(DriveSettingsView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))
  await flushPromises()

  return { wrapper, native, fetchMock }
}

const puts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.map(([input]) => input as Request).filter((r) => r.method === 'PUT')

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(globalThis, 'repasNative')
  document.body.innerHTML = ''
})

describe('le magasin lu est enregistré une seule fois', () => {
  it('le même résultat livré deux fois ne donne qu’un enregistrement', async () => {
    const { wrapper, native, fetchMock } = await openInApp(2)

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Lire mon magasin dans l’application')
      ?.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Magasin …456 enregistré.'))
    // Le second exemplaire arrive après le premier : il n'y a plus de lecture à laquelle le rattacher
    await new Promise((resolve) => setTimeout(resolve, 60))
    await flushPromises()

    expect(native.sent.filter((message) => message.type === 'drive.setup')).toHaveLength(1)
    expect(puts(fetchMock)).toHaveLength(1)
    expect(
      await bodyOf(
        fetchMock,
        fetchMock.mock.calls.findIndex(([input]) => (input as Request).method === 'PUT'),
      ),
    ).toEqual({
      retailer: 'leclerc',
      store: { id: '123456', baseUrl: STORE.baseUrl, label: null },
    })
  })

  it('un résultat que personne n’attend (page rechargée) n’enregistre rien', async () => {
    const { wrapper, native, fetchMock } = await openInApp(0)

    native.reply(found('5e7b0000-0000-4000-8000-000000000001'))
    await flushPromises()

    expect(puts(fetchMock)).toHaveLength(0)
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/settings')
    expect(wrapper.text()).toContain('Aucun magasin enregistré.')
  })
})
