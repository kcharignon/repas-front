// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

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
