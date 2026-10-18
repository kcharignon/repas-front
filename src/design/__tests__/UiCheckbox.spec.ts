import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import UiCheckbox from '@/design/UiCheckbox.vue'

describe('UiCheckbox', () => {
  it('se coche au clic et émet la nouvelle valeur', async () => {
    const wrapper = mount(UiCheckbox, {
      props: { modelValue: false },
      slots: { default: 'Courgettes' },
    })

    await wrapper.find('[role="checkbox"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('désactivée, elle garde son état et ne se coche plus', async () => {
    const wrapper = mount(UiCheckbox, {
      props: { modelValue: true, disabled: true },
      slots: { default: 'Courgettes' },
    })

    await wrapper.find('[role="checkbox"]').trigger('click')

    expect(wrapper.find('[role="checkbox"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[role="checkbox"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('expose son état aux lecteurs d’écran et barre le texte une fois cochée', () => {
    const wrapper = mount(UiCheckbox, {
      props: { modelValue: true },
      slots: { default: 'Courgettes' },
    })

    expect(wrapper.find('[role="checkbox"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.find('span.line-through').text()).toBe('Courgettes')
  })

  it('la ligne entière est une cible de 56 px au moins', () => {
    const wrapper = mount(UiCheckbox, { props: { modelValue: false }, slots: { default: 'x' } })

    expect(wrapper.find('label').classes()).toContain('min-h-14')
  })
})
