import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import UiField from '@/design/UiField.vue'
import UiTextInput from '@/design/UiTextInput.vue'

const field = (props: Record<string, unknown>) =>
  mount(UiField, {
    props: { label: 'Quantité', ...props },
    slots: {
      default: `<template #default="{ id, describedby, invalid }"><input :id="id" :aria-describedby="describedby" :aria-invalid="invalid" /></template>`,
    },
  })

describe('UiField', () => {
  it('relie le libellé à son champ (le clic sur le libellé active le champ)', () => {
    const wrapper = field({})

    expect(wrapper.find('label').attributes('for')).toBe(wrapper.find('input').attributes('id'))
  })

  it("lit l'aide et l'erreur avec le champ et le déclare invalide", () => {
    const wrapper = field({ hint: 'En grammes', error: 'Quantité invalide' })

    const describedby = wrapper.find('input').attributes('aria-describedby') ?? ''
    expect(describedby.split(' ')).toHaveLength(2)
    expect(wrapper.text()).toContain('En grammes')
    expect(wrapper.text()).toContain('Quantité invalide')
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
  })

  it("sans erreur ni aide, le champ n'a ni description ni invalidité", () => {
    const wrapper = field({})

    expect(wrapper.find('input').attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('false')
  })
})

describe('UiTextInput', () => {
  it('suit son v-model dans les deux sens', async () => {
    const wrapper = mount(UiTextInput, { props: { modelValue: 'sel' } })
    const input = wrapper.find('input')

    expect(input.element.value).toBe('sel')
    await input.setValue('poivre')

    expect(wrapper.emitted('update:modelValue')).toEqual([['poivre']])
  })

  it('porte aria-invalid et un liseré rouge quand il est en erreur', () => {
    const wrapper = mount(UiTextInput, { props: { modelValue: '', invalid: true } })

    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('input').classes()).toContain('border-danger')
  })
})
