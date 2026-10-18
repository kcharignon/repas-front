import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import DriveAccountLinks from '../DriveAccountLinks.vue'

async function open(enabled: boolean) {
  stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/drive/settings': () => json({ enabled, retailer: 'leclerc' }),
  })
  localStorage.setItem('repas.session', '1')
  const { plugins, router } = appContext()
  await router.push('/moi')
  await useSessionStore().restore()
  const wrapper = mount(DriveAccountLinks, { global: { plugins } })
  await flushPromises()

  return wrapper
}

describe('entrées du drive dans le compte', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(window, 'repasNative')
  })

  const inApp = (native = fakeNative()) => {
    Object.defineProperty(window, 'repasNative', { value: native.bridge, configurable: true })

    return native
  }
  const menuButton = (wrapper: Awaited<ReturnType<typeof open>>) =>
    wrapper.findAll('button').find((button) => button.text().includes('Menu de l’application'))

  it('propose les réglages et « Mes produits » quand le drive est allumé', async () => {
    const wrapper = await open(true)

    expect(wrapper.findAll('a').map((link) => link.attributes('href'))).toEqual([
      '/drive/reglages',
      '/drive/produits',
    ])
    expect(wrapper.text()).toContain('Réglages du drive')
    expect(wrapper.text()).toContain('Mes produits du drive')
  })

  it('ne montre rien quand le drive est coupé', async () => {
    const wrapper = await open(false)

    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('hors de l’application, ne propose pas son menu', async () => {
    const wrapper = await open(true)

    expect(menuButton(wrapper)).toBeUndefined()
  })

  it('dans l’application, « Menu de l’application » ouvre le menu natif (app.menu)', async () => {
    const native = inApp()
    const wrapper = await open(true)

    await menuButton(wrapper)?.trigger('click')

    expect(native.sent).toEqual([{ v: 1, type: 'app.menu' }])
    expect(wrapper.text()).toContain('Version, mode d’emploi et déconnexion de Leclerc.')
  })

  it('dit quand le menu n’a pas pu s’ouvrir', async () => {
    const native = fakeNative()
    native.bridge.postMessage = () => {
      throw new Error('boom')
    }
    inApp(native)
    const wrapper = await open(true)

    await menuButton(wrapper)?.trigger('click')

    expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
      'Le menu de l’application n’a pas pu s’ouvrir. Réessayez.',
    ])
  })

  it('le drive coupé, même dans l’application : rien', async () => {
    inApp()
    const wrapper = await open(false)

    expect(menuButton(wrapper)).toBeUndefined()
  })
})
