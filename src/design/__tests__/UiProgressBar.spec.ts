import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import UiProgressBar from '@/design/UiProgressBar.vue'

describe('UiProgressBar', () => {
  it("se remplit à hauteur de la valeur et s'annonce avec son libellé", () => {
    const wrapper = mount(UiProgressBar, {
      props: { value: 4, max: 11, label: '4 sur 11 articles' },
    })

    expect(wrapper.find('[role="progressbar"]').attributes('aria-label')).toBe('4 sur 11 articles')
    expect(wrapper.find('[style*="width"]').attributes('style')).toContain('36.36')
  })

  it('reste vide sans maximum (pas de division par zéro)', () => {
    const wrapper = mount(UiProgressBar, { props: { value: 0, max: 0, label: 'Aucun article' } })

    expect(wrapper.find('[style*="width"]').attributes('style')).toContain('width: 0%')
  })
})
