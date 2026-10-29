// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import { useAppUpdateStore } from '../appUpdateStore'
import { fakeUpdateApp, installFakeApp, removeFakeApp } from '../bridge/__tests__/fakeUpdateApp'
import type { FakeUpdateAppOptions } from '../bridge/__tests__/fakeUpdateApp'

// Le store de la mise à jour de l'application par elle-même (DRV-639) : ce que la page demande et dans quel ordre, jamais plus que l'application
// n'en sait faire. L'application est un faux pont ; aucun réseau, aucune installation.

function setup(options: FakeUpdateAppOptions = {}) {
  setActivePinia(createPinia())
  const app = fakeUpdateApp(options)
  installFakeApp(app)

  return { app, store: useAppUpdateStore() }
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => {
  vi.useRealTimers()
  removeFakeApp()
})

describe('le store de la mise à jour', () => {
  it('demande son état à l’application puis cherche, dans cet ordre', async () => {
    const { app, store } = setup({ remote: 'newer' })

    await store.check()

    expect(app.updateMessages()).toEqual(['update.status', 'update.check'])
    expect(store.state).toEqual({ status: 'miseAJourDisponible', version: '0.1.30' })
    expect(store.offered).toBe(true)
  })

  it('« Mettre à jour » cherche d’abord, puis lance : un seul geste', async () => {
    const { app, store } = setup({ remote: 'newer' })

    expect(await store.start()).toBe(true)

    expect(app.updateMessages()).toEqual(['update.status', 'update.check', 'update.start'])
    expect(store.engaged).toBe(true)
  })

  it('ne lance rien quand l’application est à jour', async () => {
    const { app, store } = setup({ remote: 'same' })

    await store.start()

    expect(app.updateMessages()).toEqual(['update.status', 'update.check'])
    expect(store.state).toEqual({ status: 'aJour' })
    expect(store.offered).toBe(false)
  })

  it('ne lance rien hors connexion : l’erreur reste affichée', async () => {
    const { app, store } = setup({ remote: 'offline' })

    await store.start()

    expect(app.updateMessages()).not.toContain('update.start')
    expect(store.state).toEqual({ status: 'erreur', code: 'OFFLINE', version: null })
  })

  it('après une erreur de téléchargement, « Réessayer » relance sans chercher de nouveau', async () => {
    const { app, store } = setup({ remote: 'newer' })
    await store.start()
    app.say({ state: 'erreur', code: 'DIGEST_MISMATCH', version: '0.1.30' })

    await store.start()

    expect(app.updateMessages()).toEqual([
      'update.status',
      'update.check',
      'update.start',
      'update.start',
    ])
  })

  it('une recherche ne coupe ni un téléchargement ni l’écran d’installation', async () => {
    const { app, store } = setup({ remote: 'newer' })
    await store.start()
    app.say({ state: 'telechargement', version: '0.1.30', progress: 30 })

    await store.check()

    expect(app.updateMessages().filter((type) => type === 'update.check')).toHaveLength(1)
    expect(store.state.status).toBe('telechargement')
  })

  it('une application qui ne répond pas à la recherche : une erreur de vérification au bout de 30 secondes', async () => {
    const { store } = setup({ remote: 'silent' })

    const checking = store.check()
    await flushPromises()
    expect(store.state.status).toBe('verification')
    await vi.advanceTimersByTimeAsync(30_000)
    await checking

    expect(store.state).toEqual({ status: 'erreur', code: 'CHECK_FAILED', version: null })
  })

  it('une application qui ne sait pas se mettre à jour : rien n’est envoyé, « Mettre à jour » rend faux', async () => {
    const { app, store } = setup({ selfUpdate: false })

    await store.check()
    expect(await store.start()).toBe(false)

    expect(store.supported).toBe(false)
    expect(app.updateMessages()).toEqual([])
    expect(store.engaged).toBe(false)
  })

  it('dans un navigateur : rien n’est envoyé', async () => {
    setActivePinia(createPinia())
    const store = useAppUpdateStore()

    await store.check()
    expect(await store.start()).toBe(false)

    expect(store.supported).toBe(false)
  })
})
