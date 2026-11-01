import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'

import { appContext, bodyOf, calls, json, me, stubApi, type Handler } from '@/__tests__/helpers'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import { useAppVersionReport } from '../useAppVersionReport'

const PUT = 'PUT /api/v1/users/me/app-version'

/**
 * L'application Repas : le faux pont répond à `app.info` (ou par une erreur quand `version` est `null`). `late` : il ne répond qu'à
 * `release()`, comme un pont qui répond trop tard ; `setVersion` change la version dite aux questions suivantes (application mise à jour).
 */
function installApp(initial: string | null, { late = false }: { late?: boolean } = {}) {
  let version = initial
  let held = false
  const answer = (reply: (message: unknown) => void) =>
    reply(
      version === null
        ? { v: 1, type: 'error', code: 'UNKNOWN_TYPE' }
        : { v: 1, type: 'app.info', version, versionCode: 108, drive: true },
    )
  let pending: ((message: unknown) => void) | null = null
  const native = fakeNative((message, reply) => {
    if (message.type !== 'app.info') return
    if (late && !held) {
      pending = reply

      return
    }
    answer(reply)
  })
  ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge

  return {
    ...native,
    setVersion: (next: string) => void (version = next),
    release: () => {
      held = true
      if (pending !== null) answer(pending)
      pending = null
    },
  }
}

const Host = defineComponent({
  setup() {
    useAppVersionReport()

    return () => null
  },
})

const mounted: VueWrapper[] = []

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
  mounted.push(mount(Host, { global: { plugins: context.plugins } }))
  const session = useSessionStore()
  await session.restore()
  await flushPromises()

  return { fetchMock, session }
}

const puts = (fetchMock: ReturnType<typeof stubApi>) =>
  calls(fetchMock).filter((call) => call === PUT)

/** La valeur de `X-App-Version` de chaque requête reçue par le faux back, dans l'ordre (`null` : pas d'en-tête). */
const versionHeaders = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.map(([input]) => (input as Request).headers.get('X-App-Version'))

/** L'application revient au premier plan. */
async function comeBack() {
  document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
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

    // L'utilisateur relu (réglages enregistrés), retour au premier plan : même session, même version, rien de plus
    await session.reloadUser()
    await comeBack()
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

  it('dans un navigateur : rien n’est envoyé, aucun en-tête', async () => {
    const { fetchMock } = await start()

    expect(puts(fetchMock)).toEqual([])
    expect(versionHeaders(fetchMock).every((value) => value === null)).toBe(true)
    await comeBack()
    expect(puts(fetchMock)).toEqual([])
  })

  it('sans session : la version est lue au démarrage, mais aucune requête n’est envoyée', async () => {
    const native = installApp('0.1.8')
    localStorage.clear()
    const fetchMock = stubApi({})
    const context = appContext()
    mounted.push(mount(Host, { global: { plugins: context.plugins } }))
    await useSessionStore().restore()
    await flushPromises()

    expect(native.sent.map((message) => message.type)).toEqual(['app.info'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['0.0.0-dev', '0.1.8-debug', '0.1'])(
    'une version que le serveur refuserait (%s) n’est ni envoyée ni jointe aux requêtes',
    async (version) => {
      installApp(version)
      const { fetchMock } = await start()

      expect(puts(fetchMock)).toEqual([])
      expect(versionHeaders(fetchMock).every((value) => value === null)).toBe(true)
    },
  )

  it('l’application ne dit pas sa version : rien n’est envoyé', async () => {
    installApp(null)
    const { fetchMock } = await start()

    expect(puts(fetchMock)).toEqual([])
  })
})

describe('l’en-tête de version sur chaque requête (DRV-637)', () => {
  it('toute requête de l’API la porte dès que le pont l’a dite, la plateforme avec', async () => {
    installApp('1.3.1')
    const { fetchMock } = await start()

    const me = calls(fetchMock).indexOf('GET /api/v1/me')
    const request = fetchMock.mock.calls[me]![0] as Request
    expect(request.headers.get('X-App-Version')).toBe('1.3.1')
    expect(request.headers.get('X-App-Platform')).toBe('android')
  })

  it('un pont en retard n’empêche plus rien : la version part avec la première requête qui suit, et l’envoi explicite aussi', async () => {
    const app = installApp('1.3.1', { late: true })
    const { fetchMock, session } = await start()

    // Le pont n'a pas répondu : pas de version, pas d'en-tête, pas d'envoi
    expect(versionHeaders(fetchMock).every((value) => value === null)).toBe(true)
    expect(puts(fetchMock)).toEqual([])

    app.release()
    await flushPromises()

    // L'envoi explicite part dès que la version est connue, avec l'en-tête
    expect(puts(fetchMock)).toHaveLength(1)
    expect(await bodyOf(fetchMock, calls(fetchMock).indexOf(PUT))).toEqual({
      platform: 'android',
      version: '1.3.1',
    })
    await session.reloadUser()
    expect(versionHeaders(fetchMock).slice(-1)[0]).toBe('1.3.1')
  })
})

describe('l’envoi est retenté tant qu’il n’a pas réussi', () => {
  it.each([
    ['une panne du serveur (500)', () => json({ error: { message: 'Erreur' } }, { status: 500 })],
    [
      'l’absence de réseau',
      () => {
        throw new TypeError('Failed to fetch')
      },
    ],
  ])('%s : silence, puis un nouvel essai au retour au premier plan', async (_label, failing) => {
    installApp('0.1.8')
    let failures = 1
    const { fetchMock, session } = await start({
      [PUT]: () => (failures-- > 0 ? failing() : new Response(null, { status: 204 })),
    })

    expect(puts(fetchMock)).toHaveLength(1)
    expect(useNotificationsStore().items).toEqual([])
    expect(session.isAuthenticated).toBe(true)

    await comeBack()
    expect(puts(fetchMock)).toHaveLength(2)

    // Réussi : plus d'envoi
    await comeBack()
    expect(puts(fetchMock)).toHaveLength(2)
  })

  it('un refus (422) est définitif : pas de nouvel essai', async () => {
    installApp('0.1.8')
    const { fetchMock } = await start({
      [PUT]: () => json({ error: { message: 'INVALID_APP_VERSION' } }, { status: 422 }),
    })

    await comeBack()
    await comeBack()

    expect(puts(fetchMock)).toHaveLength(1)
  })

  it('les essais sont bornés : cinq au plus pour la même version', async () => {
    installApp('0.1.8')
    const { fetchMock } = await start({
      [PUT]: () => json({ error: { message: 'Erreur' } }, { status: 503 }),
    })

    for (let i = 0; i < 10; i++) await comeBack()

    expect(puts(fetchMock)).toHaveLength(5)
  })

  it('une version qui change (application mise à jour, site resté ouvert) est renvoyée', async () => {
    const app = installApp('1.3.0')
    const { fetchMock } = await start()
    expect(puts(fetchMock)).toHaveLength(1)

    app.setVersion('1.3.1')
    await comeBack()

    expect(puts(fetchMock)).toHaveLength(2)
    const last = calls(fetchMock).lastIndexOf(PUT)
    expect(await bodyOf(fetchMock, last)).toEqual({ platform: 'android', version: '1.3.1' })
    expect(versionHeaders(fetchMock).slice(-1)[0]).toBe('1.3.1')
  })
})
