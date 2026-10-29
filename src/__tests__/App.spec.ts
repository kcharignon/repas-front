import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import App from '@/App.vue'
import { appContext } from '@/__tests__/helpers'
import { useNotificationsStore } from '@/notifications/store'

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

  it('affiche à l’écran les retours de l’application : une erreur s’annonce, un succès poliment', async () => {
    const { router, plugins } = appContext()
    await router.push('/connexion')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins } })
    await flushPromises()

    const notifications = useNotificationsStore()
    notifications.push('error', 'Tu n’as pas le droit de faire cela.', 0)
    notifications.push('success', 'Réglages enregistrés.', 0)
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe('Tu n’as pas le droit de faire cela.')
    expect(wrapper.find('[role="status"]').text()).toBe('Réglages enregistrés.')

    await wrapper.find('[role="alert"] button').trigger('click')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })
})
