import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'

import { i18n } from '@/i18n'
import DesignView from '@/views/DesignView.vue'

describe('DesignView (catalogue)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  const catalogue = () => mount(DesignView, { global: { plugins: [i18n] } })

  it('présente tous les composants du design système', () => {
    const wrapper = catalogue()

    expect(wrapper.find('h1').text()).toBe('Catalogue de composants')
    expect(wrapper.findAll('h2').map((title) => title.text())).toEqual([
      'Boutons',
      'Champs',
      'Choix',
      'Progression',
    ])
    expect(wrapper.findAll('button').length).toBeGreaterThanOrEqual(10)
    expect(wrapper.find('[role="progressbar"]').attributes('aria-label')).toBe(
      '4 sur 11 articles dans le panier',
    )
  })

  it('change de thème depuis les puces', async () => {
    const wrapper = catalogue()

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Sombre')
      ?.trigger('click')

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it("montre l'erreur du champ quantité avec le champ", () => {
    const wrapper = catalogue()

    const input = wrapper.findAll('input').find((field) => field.element.value === '-2')

    expect(input?.attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Entre une quantité supérieure à zéro.')
  })
})
