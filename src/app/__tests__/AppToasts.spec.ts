import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('propose un geste (« Voir ») qui s’exécute puis ferme le message', async () => {
    const { wrapper, store } = toasts()
    const run = vi.fn<() => void>()
    store.push('success', 'Ajouté à Boucherie.', 0, { label: 'Voir', run })
    await wrapper.vm.$nextTick()

    const action = wrapper.get('[role="status"]').findAll('button')[0]!
    expect(action.text()).toBe('Voir')
    await action.trigger('click')

    expect(run).toHaveBeenCalledOnce()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('ne montre pas de geste à un message qui n’en propose pas', async () => {
    const { wrapper, store } = toasts()
    store.push('success', 'Enregistré', 0)
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[role="status"]').findAll('button')).toHaveLength(1)
  })

  it('ne montre rien quand il n’y a aucun message', () => {
    const { wrapper } = toasts()

    expect(wrapper.find('[role]').exists()).toBe(false)
  })
})
