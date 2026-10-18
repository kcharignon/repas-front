import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
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
  afterEach(() => vi.unstubAllGlobals())

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
})
