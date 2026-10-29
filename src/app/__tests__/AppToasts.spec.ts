import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import AppToasts from '@/app/AppToasts.vue'
import { i18n } from '@/i18n'
import { useNotificationsStore } from '@/notifications/store'

function toasts() {
  const pinia = createPinia()
  setActivePinia(pinia)

  return {
    wrapper: mount(AppToasts, { global: { plugins: [pinia, i18n] } }),
    store: useNotificationsStore(),
  }
}

describe('AppToasts', () => {
  beforeEach(() => document.body.replaceChildren())

  it('annonce poliment un succès (status) et tout de suite une erreur (alert)', async () => {
    const { wrapper, store } = toasts()

    store.push('success', 'Statut de nouveau@exemple.test modifié.', 0)
    store.push('error', 'Le serveur est injoignable.', 0)
    await wrapper.vm.$nextTick()

    const status = wrapper.get('[role="status"]')
    const alert = wrapper.get('[role="alert"]')
    expect(status.text()).toBe('Statut de nouveau@exemple.test modifié.')
    expect(alert.text()).toBe('Le serveur est injoignable.')
  })

  it('se ferme à la main par son bouton, sans toucher aux autres messages', async () => {
    const { wrapper, store } = toasts()
    store.push('success', 'Un', 0)
    store.push('success', 'Deux', 0)
    await wrapper.vm.$nextTick()

    await wrapper.findAll('[role="status"]')[0]!.get('button[aria-label="Fermer"]').trigger('click')

    expect(wrapper.findAll('[role="status"]').map((toast) => toast.text())).toEqual(['Deux'])
  })

  it('ne montre rien quand il n’y a aucun message', () => {
    const { wrapper } = toasts()

    expect(wrapper.find('[role]').exists()).toBe(false)
  })
})
