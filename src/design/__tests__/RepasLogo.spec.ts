import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import { i18n } from '@/i18n'
import RepasLogo from '@/design/RepasLogo.vue'
import { LOGO_LAYOUTS, LOGO_SHAPES, LOGO_WORD_PATH } from '@/design/logoGeometry'

const logo = (variant: 'stack' | 'horizontal') =>
  mount(RepasLogo, { props: { variant }, global: { plugins: [i18n] } })

describe('RepasLogo', () => {
  it.each(['stack', 'horizontal'] as const)(
    'dessine le logo %s avec le nom de l’application pour un lecteur d’écran',
    (variant) => {
      const wrapper = logo(variant)

      expect(wrapper.attributes('role')).toBe('img')
      expect(wrapper.attributes('aria-label')).toBe('Repas')
      expect(wrapper.attributes('viewBox')).toBe(LOGO_LAYOUTS[variant].viewBox)
      expect(wrapper.attributes('data-variant')).toBe(variant)
    },
  )

  it('trace le mot et le dessin : un tracé par forme, plus celui du mot, aucun texte à charger', () => {
    const wrapper = logo('stack')

    const paths = wrapper.findAll('path')

    expect(paths).toHaveLength(LOGO_SHAPES.length + 1)
    expect(wrapper.find('text').exists()).toBe(false)
    expect(paths[paths.length - 1]?.attributes('d')).toBe(LOGO_WORD_PATH)
  })

  it('prend la couleur du texte du parent, sauf la coche, toujours en safran', () => {
    const wrapper = logo('horizontal')
    const paths = wrapper.findAll('path')
    const accent = LOGO_SHAPES.findIndex((shape) => shape.role === 'accent')

    expect(accent).toBeGreaterThanOrEqual(0)
    expect(paths[accent]?.attributes('stroke')).toBe('#f4b73f')
    for (const [i, path] of paths.entries()) {
      if (i === accent) continue
      expect(
        path.attributes('fill') === 'currentColor' || path.attributes('stroke') === 'currentColor',
      ).toBe(true)
    }
  })

  it('ne garde qu’une coche, la seule forme en safran', () => {
    expect(LOGO_SHAPES.filter((shape) => shape.role === 'accent')).toHaveLength(1)
  })
})
