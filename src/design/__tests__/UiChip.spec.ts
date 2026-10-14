import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import UiChip from '@/design/UiChip.vue'

describe('UiChip', () => {
  it('bascule au clic et le dit par aria-pressed', async () => {
    const wrapper = mount(UiChip, { props: { pressed: false }, slots: { default: 'Plat' } })

    expect(wrapper.attributes('aria-pressed')).toBe('false')
    await wrapper.trigger('click')

    expect(wrapper.emitted('update:pressed')).toEqual([[true]])
  })

  it('un chip activé se distingue par sa couleur', () => {
    const wrapper = mount(UiChip, { props: { pressed: true }, slots: { default: 'Plat' } })

    expect(wrapper.classes()).toContain('bg-primary')
  })
})
