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

  it('fusionne la classe de l’appelant : elle remplace celle de la variante en cas de conflit', () => {
    const wrapper = mount(UiButton, { props: { class: 'flex-1 px-4' }, slots: { default: 'x' } })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['flex-1', 'px-4', 'min-h-11']))
    expect(wrapper.classes()).not.toContain('px-5')
  })

  it("n'émet pas de clic quand il est désactivé", async () => {
    const wrapper = mount(UiButton, { attrs: { disabled: true }, slots: { default: 'x' } })

    await wrapper.trigger('click')

    expect(wrapper.attributes('disabled')).toBeDefined()
  })
})
