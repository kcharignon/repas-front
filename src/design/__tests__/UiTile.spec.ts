import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import UiTile from '@/design/UiTile.vue'

describe('UiTile', () => {
  it('bascule au clic et le dit par aria-pressed', async () => {
    const wrapper = mount(UiTile, { props: { pressed: false }, slots: { default: 'Plat' } })

    expect(wrapper.attributes('aria-pressed')).toBe('false')
    await wrapper.trigger('click')

    expect(wrapper.emitted('update:pressed')).toEqual([[true]])
  })

  it('montre son icône au-dessus du nom', () => {
    const wrapper = mount(UiTile, {
      slots: { default: 'Plat', icon: '<img alt="" src="/images/plat.png">' },
    })

    expect(wrapper.find('img').attributes('src')).toBe('/images/plat.png')
    expect(wrapper.text()).toBe('Plat')
  })

  it('une tuile activée se distingue autrement que par sa couleur : coche, bordure et graisse', () => {
    const off = mount(UiTile, { props: { pressed: false }, slots: { default: 'Plat' } })
    const on = mount(UiTile, { props: { pressed: true }, slots: { default: 'Plat' } })

    expect(off.find('svg').exists()).toBe(false)
    expect(on.find('svg').exists()).toBe(true)
    expect(on.classes()).toContain('border-primary')
    expect(on.classes()).toContain('font-bold')
  })
})
