import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import DepartmentMarker from '@/design/DepartmentMarker.vue'

describe('DepartmentMarker', () => {
  it.each([
    ['snowflake', 'bg-cold-soft'],
    ['can', 'bg-can-soft'],
  ])('dessine le repère « %s », décoratif', (icon, background) => {
    const wrapper = mount(DepartmentMarker, { props: { icon } })

    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.attributes('data-department-marker')).toBe(icon)
    expect(wrapper.classes()).toContain(background)
    expect(wrapper.find('svg').exists()).toBe(true)
    // Décoratif : aucun texte, rien à lire
    expect(wrapper.text()).toBe('')
  })

  it.each([[undefined], [null], ['future'], ['']])(
    'n’affiche rien, ni place vide, pour l’icône %j',
    (icon) => {
      const wrapper = mount(DepartmentMarker, { props: { icon } })

      expect(wrapper.find('[data-department-marker]').exists()).toBe(false)
      expect(wrapper.find('svg').exists()).toBe(false)
      expect(wrapper.html()).toBe('<!--v-if-->')
    },
  )

  it('garde la place du repère, vide et cachée, quand on le demande', () => {
    const wrapper = mount(DepartmentMarker, { props: { icon: null, reserve: true } })

    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.classes()).toContain('size-6')
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('a deux tailles : 24 px dans une ligne, 28 px dans un choix', () => {
    expect(mount(DepartmentMarker, { props: { icon: 'can' } }).classes()).toContain('size-6')
    expect(mount(DepartmentMarker, { props: { icon: 'can', size: 'md' } }).classes()).toContain(
      'size-7',
    )
  })
})
