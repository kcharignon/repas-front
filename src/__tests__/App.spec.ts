import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import App from '@/App.vue'
import { appContext } from '@/__tests__/helpers'

describe('App', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('affiche la page de la route courante', async () => {
    const { router, plugins } = appContext()
    await router.push('/connexion')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins } })
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Se connecter')
  })
})
