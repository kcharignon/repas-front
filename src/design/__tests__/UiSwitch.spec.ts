import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import UiSwitch from '@/design/UiSwitch.vue'

describe('UiSwitch', () => {
  it("est un interrupteur dont l'état est lu par aria-checked", () => {
    const off = mount(UiSwitch, { props: { label: 'De base' } })
    const on = mount(UiSwitch, { props: { label: 'De base', modelValue: true } })

    expect(off.get('button').attributes('role')).toBe('switch')
    expect(off.get('button').attributes('aria-checked')).toBe('false')
    expect(on.get('button').attributes('aria-checked')).toBe('true')
  })

  it("bascule au clic sur le bouton comme sur le libellé, et l'aide est lue avec lui", async () => {
    const wrapper = mount(UiSwitch, {
      attachTo: document.body,
      props: { label: 'De base', hint: 'Une aide.', modelValue: false },
    })

    expect(wrapper.get('button').attributes('aria-describedby')).toBe(
      wrapper.get('p').attributes('id'),
    )
    expect(wrapper.get('label').attributes('for')).toBe(wrapper.get('button').attributes('id'))
    await wrapper.get('button').trigger('click')
    await wrapper.get('label').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    wrapper.unmount()
  })

  it('ne bascule pas quand il est désactivé', async () => {
    const wrapper = mount(UiSwitch, { props: { label: 'De base', disabled: true } })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
