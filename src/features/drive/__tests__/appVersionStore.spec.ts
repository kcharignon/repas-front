// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import type { ApiClient } from '@/api'
import { useAppVersionStore } from '../appVersionStore'
import { INFO_TIMEOUT_MS } from '../bridge/driveBridge'
import { fakeNative } from '../bridge/__tests__/fakeNative'

// La lecture de la version par le pont (DRV-637) : un pont qui répond trop tard ne fige pas la version à « inconnue ».

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  setActivePinia(createPinia())
})
afterEach(() => {
  vi.useRealTimers()
  delete (globalThis as { repasNative?: unknown }).repasNative
})

function install(answerFrom: number) {
  let asked = 0
  const native = fakeNative((message, reply) => {
    if (message.type !== 'app.info') return
    asked++
    if (asked >= answerFrom)
      reply({ v: 1, type: 'app.info', version: '1.3.1', versionCode: 1, drive: true })
  })
  ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge

  return native
}

describe('read', () => {
  it('une question restée sans réponse est reposée à l’appel suivant', async () => {
    install(2)
    const store = useAppVersionStore()

    const first = store.read()
    await vi.advanceTimersByTimeAsync(INFO_TIMEOUT_MS)
    expect(await first).toBeNull()
    expect(store.status).toBe('unknown')

    expect(await store.read()).toBe('1.3.1')
    expect(store.running).toBe('1.3.1')
    expect(store.status).toBe('known')
  })

  it('trois silences de suite : la version reste inconnue, on cesse de demander', async () => {
    const native = install(99)
    const store = useAppVersionStore()

    for (let i = 0; i < 3; i++) {
      const pending = store.read()
      await vi.advanceTimersByTimeAsync(INFO_TIMEOUT_MS)
      await pending
    }
    await store.read()
    await store.read()

    expect(native.sent).toHaveLength(3)
    expect(store.running).toBeNull()
  })

  it('dans un navigateur : null, et rien n’est figé', async () => {
    const store = useAppVersionStore()

    expect(await store.read()).toBeNull()

    install(1)
    expect(await store.read()).toBe('1.3.1')
  })
})

describe('report', () => {
  /** Un faux client dont le `PUT` attend qu'on le libère. */
  function slowApi() {
    const puts: Array<(status: number) => void> = []
    const api = {
      PUT: vi.fn<() => Promise<unknown>>(
        () =>
          new Promise((resolve) =>
            puts.push((status) => resolve({ response: { ok: status < 300, status } })),
          ),
      ),
    } as unknown as ApiClient

    return { api, puts }
  }

  it('une déconnexion pendant un envoi en vol : sa réponse tardive ne dit pas « fait » pour la session suivante', async () => {
    install(1)
    const store = useAppVersionStore()
    const { api, puts } = slowApi()

    const first = store.report('u1', api)
    await vi.advanceTimersByTimeAsync(0)
    expect(api.PUT).toHaveBeenCalledTimes(1)

    store.forget()
    puts[0]!(204)
    await first

    // La session suivante (même compte, même version) doit renvoyer la version
    const second = store.report('u1', api)
    await vi.advanceTimersByTimeAsync(0)
    expect(api.PUT).toHaveBeenCalledTimes(2)
    puts[1]!(204)
    await second
  })

  it('un envoi qui lève ne bloque pas le suivant', async () => {
    install(1)
    const store = useAppVersionStore()
    const { api, puts } = slowApi()
    const unprintable = {
      toString() {
        throw new Error('panne')
      },
    } as unknown as string

    await store.report(unprintable, api)
    const next = store.report('u1', api)
    await vi.advanceTimersByTimeAsync(0)
    expect(api.PUT).toHaveBeenCalledTimes(1)
    puts[0]!(204)
    await next
  })
})
