import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

import { appContext, bodyOf, calls, json, me, stubApi, type Handler } from '@/__tests__/helpers'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import { useAppVersionReport } from '../useAppVersionReport'

const PUT = 'PUT /api/v1/users/me/app-version'

/** L'application Repas : le faux pont répond à `app.info` (ou par une erreur quand `version` est `null`). */
function installApp(version: string | null) {
  const native = fakeNative((message, reply) => {
    if (message.type !== 'app.info') return
    reply(
      version === null
        ? { v: 1, type: 'error', code: 'UNKNOWN_TYPE' }
        : { v: 1, type: 'app.info', version, versionCode: 108, drive: true },
    )
  })
  ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge

  return native
}

const Host = defineComponent({
  setup() {
    useAppVersionReport()

    return () => null
  },
})

/** Démarre l'application avec une session retrouvée, comme au lancement de l'application. */
async function start(handlers: Record<string, Handler> = {}) {
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    'POST /api/login_check': () => json({ token: 'jeton' }),
    [PUT]: () => new Response(null, { status: 204 }),
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  mount(Host, { global: { plugins: context.plugins } })
  const session = useSessionStore()
  await session.restore()
  await flushPromises()

  return { fetchMock, session }
}

const puts = (fetchMock: ReturnType<typeof stubApi>) =>
  calls(fetchMock).filter((call) => call === PUT)

afterEach(() => {
  delete (globalThis as { repasNative?: unknown }).repasNative
  vi.unstubAllGlobals()
})

describe('la version de l’application envoyée au serveur (DRV-637)', () => {
  it('dans l’application, une fois la session ouverte : une seule fois, la plateforme et la version', async () => {
    installApp('0.1.8')
    const { fetchMock, session } = await start()

    expect(puts(fetchMock)).toHaveLength(1)
    const index = calls(fetchMock).indexOf(PUT)
    expect(await bodyOf(fetchMock, index)).toEqual({ platform: 'android', version: '0.1.8' })

    // L'utilisateur relu (réglages enregistrés) : même session, rien de plus
    await session.reloadUser()
    await flushPromises()
    expect(puts(fetchMock)).toHaveLength(1)
  })

  it('une nouvelle connexion après une déconnexion envoie de nouveau la version', async () => {
    installApp('0.1.8')
    const { fetchMock, session } = await start()

    await session.logout()
    await flushPromises()
    await session.login('alexiane@example.com', 'secret-123')
    await flushPromises()

    expect(puts(fetchMock)).toHaveLength(2)
  })

  it('dans un navigateur : rien n’est envoyé', async () => {
    const { fetchMock } = await start()

    expect(puts(fetchMock)).toEqual([])
  })

  it('sans session : rien n’est envoyé, pas même la question à l’application', async () => {
    const native = installApp('0.1.8')
    localStorage.clear()
    stubApi({})
    const context = appContext()
    mount(Host, { global: { plugins: context.plugins } })
    await useSessionStore().restore()
    await flushPromises()

    expect(native.sent).toEqual([])
  })

  it.each(['0.0.0-dev', '0.1.8-debug', '0.1'])(
    'une version que le serveur refuserait (%s) n’est pas envoyée',
    async (version) => {
      installApp(version)
      const { fetchMock } = await start()

      expect(puts(fetchMock)).toEqual([])
    },
  )

  it('l’application ne dit pas sa version : rien n’est envoyé', async () => {
    installApp(null)
    const { fetchMock } = await start()

    expect(puts(fetchMock)).toEqual([])
  })

  it.each([
    ['un refus (422)', () => json({ error: { message: 'INVALID_APP_VERSION' } }, { status: 422 })],
    ['une panne du serveur (500)', () => json({ error: { message: 'Erreur' } }, { status: 500 })],
    [
      'l’absence de réseau',
      () => {
        throw new TypeError('Failed to fetch')
      },
    ],
  ])('%s : silence, sans nouvel essai', async (_label, handler) => {
    installApp('0.1.8')
    const { fetchMock, session } = await start({ [PUT]: handler })

    expect(puts(fetchMock)).toHaveLength(1)
    expect(useNotificationsStore().items).toEqual([])
    expect(session.isAuthenticated).toBe(true)

    await session.reloadUser()
    await flushPromises()
    expect(puts(fetchMock)).toHaveLength(1)
  })
})
