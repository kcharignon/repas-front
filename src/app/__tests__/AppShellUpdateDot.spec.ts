import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, me } from '@/__tests__/helpers'
import type { CurrentUser } from '@/api'
import AppShell from '@/app/AppShell.vue'
import { fakeNative } from '@/features/drive/bridge/__tests__/fakeNative'
import {
  fakeUpdateApp,
  installFakeApp,
  removeFakeApp,
} from '@/features/drive/bridge/__tests__/fakeUpdateApp'
import { useSessionStore } from '@/session/session'

// La pastille de l'onglet « Moi » : une nouvelle version de l'application est prête (même règle que l'invitation de « Moi »)

const mounted: { unmount: () => void }[] = []

const server = (latest: string) => ({ latest, minimum: null, outdated: false })

async function mountShell(appUpdate?: CurrentUser['appUpdate'], loggedIn = true) {
  const { plugins, router } = appContext()
  await router.push('/connexion')
  await router.isReady()
  if (loggedIn) useSessionStore().user = { ...me, appUpdate } as CurrentUser
  const wrapper = mount(AppShell, { global: { plugins } })
  mounted.push(wrapper)
  await flushPromises()

  return wrapper
}

const accountTab = (wrapper: Awaited<ReturnType<typeof mountShell>>) =>
  wrapper.get('nav.fixed a[href="/moi"]')

beforeEach(() => localStorage.clear())
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  removeFakeApp()
  vi.useRealTimers()
})

describe('pastille de l’onglet « Moi »', () => {
  it('le serveur dit plus récent, dans une application qui ne se met pas à jour seule : pastille et nom de l’onglet', async () => {
    installFakeApp(fakeUpdateApp({ selfUpdate: false, version: '0.1.8' }))
    const wrapper = await mountShell(server('0.1.10'))

    const dot = accountTab(wrapper).get('[data-testid="account-update-dot"]')
    expect(dot.attributes('aria-hidden')).toBe('true')
    // Le texte VISIBLE reste « Moi » (la barre du bas ne change pas de mise en page) ; la phrase longue n'est que le nom accessible
    expect(accountTab(wrapper).text()).toBe('Moi')
    expect(accountTab(wrapper).attributes('aria-label')).toBe('Moi, une nouvelle version est prête')
  })

  it('l’application dit « plus récent » : pastille', async () => {
    const app = fakeUpdateApp({ remote: 'newer' })
    installFakeApp(app)
    const wrapper = await mountShell()

    expect(accountTab(wrapper).find('[data-testid="account-update-dot"]').exists()).toBe(true)
    expect(app.updateMessages()).toContain('update.check')
  })

  it('l’application dit « à jour » : pas de pastille, même si le serveur croit l’ancienne version', async () => {
    installFakeApp(fakeUpdateApp({ remote: 'same' }))
    const wrapper = await mountShell(server('0.1.30'))

    expect(wrapper.find('[data-testid="account-update-dot"]').exists()).toBe(false)
    expect(accountTab(wrapper).text()).toBe('Moi')
  })

  it('dans un navigateur : ni pastille, ni recherche', async () => {
    const wrapper = await mountShell(server('0.1.10'))

    expect(wrapper.find('[data-testid="account-update-dot"]').exists()).toBe(false)
    expect(accountTab(wrapper).text()).toBe('Moi')
  })

  it('personne de connecté : aucune recherche', async () => {
    const app = fakeUpdateApp({ remote: 'newer' })
    installFakeApp(app)
    await mountShell(undefined, false)

    expect(app.updateMessages()).toEqual([])
  })

  it('la recherche se lance une seule fois à l’ouverture, et pas plus d’une fois toutes les cinq minutes au retour au premier plan', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const app = fakeUpdateApp({ remote: 'same' })
    installFakeApp(app)
    await mountShell()
    const checks = () => app.updateMessages().filter((type) => type === 'update.check').length
    expect(checks()).toBe(1)

    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(checks()).toBe(1)

    vi.setSystemTime(Date.now() + 5 * 60_000 + 1)
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(checks()).toBe(2)
  })

  it('une application sans pont complet (fakeNative muet) ne casse pas la barre', async () => {
    ;(globalThis as { repasNative?: unknown }).repasNative = fakeNative(() => {}).bridge
    const wrapper = await mountShell(server('0.1.10'))

    expect(accountTab(wrapper).text()).toBe('Moi')
  })
})
