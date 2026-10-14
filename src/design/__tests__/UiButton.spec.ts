import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import UiButton from '@/design/UiButton.vue'

describe('UiButton', () => {
  it('affiche son contenu et vaut type="button" par défaut (jamais un envoi de formulaire involontaire)', () => {
    const wrapper = mount(UiButton, { slots: { default: 'Enregistrer' } })

    expect(wrapper.text()).toBe('Enregistrer')
    expect(wrapper.attributes('type')).toBe('button')
  })

  it.each([
    ['primary', 'bg-primary'],
    ['secondary', 'border-primary'],
    ['accent', 'bg-accent'],
    ['ghost', 'bg-transparent'],
    ['danger', 'bg-danger'],
  ] as const)('applique la variante %s', (variant, expected) => {
    const wrapper = mount(UiButton, { props: { variant }, slots: { default: 'x' } })

    expect(wrapper.classes()).toContain(expected)
  })

  it('garde une cible tactile de 44 px au moins', () => {
    const wrapper = mount(UiButton, { slots: { default: 'x' } })

    expect(wrapper.classes()).toContain('min-h-11')
  })

  it("n'émet pas de clic quand il est désactivé", async () => {
    const wrapper = mount(UiButton, { attrs: { disabled: true }, slots: { default: 'x' } })

    await wrapper.trigger('click')

    expect(wrapper.attributes('disabled')).toBeDefined()
  })
})
