import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { appContext } from '@/__tests__/helpers'
import ChristmasDecor from '@/design/ChristmasDecor.vue'
import HalloweenDecor from '@/design/HalloweenDecor.vue'
import AuthLayout from '@/views/AuthLayout.vue'

// Les thèmes saisonniers (ADR 0010, 0011) sur l'écran de connexion : la phrase et le décor n'existent que du 15 octobre au 1er novembre
// et du 15 novembre au 5 janvier.
// Hors de ces tests, la suite tourne le 15 juin (src/__tests__/setup.ts).

const PITCH = 'Tes recettes, tes courses, sans oublier le basilic.'
const PITCH_HALLOWEEN = 'Tes recettes, tes courses, sans oublier la citrouille.'
const PITCH_NOEL = 'Tes recettes, tes courses, sans oublier la bûche.'

function mountLayout() {
  const { plugins } = appContext()

  return mount(AuthLayout, { props: { title: 'Se connecter' }, global: { plugins } })
}

function mountDecor(variant: 'banner' | 'web', component: typeof HalloweenDecor = HalloweenDecor) {
  const { plugins } = appContext()

  return mount(component, { props: { variant }, global: { plugins } })
}

describe('écran de connexion, thème saisonnier', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-season')
  })
  afterEach(() => localStorage.clear())

  it('hors saison : la phrase du basilic, aucun décor', () => {
    const wrapper = mountLayout()

    expect(wrapper.text()).toContain(PITCH)
    expect(wrapper.text()).not.toContain('citrouille')
    expect(wrapper.findAll('svg')).toHaveLength(0)
    expect(wrapper.get('header').classes()).toContain('bg-brand')
  })

  it('en saison : la phrase de la citrouille et le décor, sans rien dire de plus', () => {
    vi.setSystemTime(new Date(2026, 9, 27, 12))

    const wrapper = mountLayout()

    expect(wrapper.text()).toContain(PITCH_HALLOWEEN)
    expect(wrapper.text()).not.toContain(PITCH)
    expect(wrapper.text()).not.toContain('bûche')
    // La toile, la lune et deux chauves-souris : décoratives, cachées des lecteurs d'écran, sans événement de souris.
    const decor = wrapper.get('header [aria-hidden="true"].pointer-events-none')
    expect(decor.findAll('svg')).toHaveLength(4)
  })

  it('en saison mais décor coupé par l’utilisateur : comme hors saison', () => {
    vi.setSystemTime(new Date(2026, 9, 27, 12))
    localStorage.setItem('repas.season', 'off')

    const wrapper = mountLayout()

    expect(wrapper.text()).toContain(PITCH)
    expect(wrapper.findAll('svg')).toHaveLength(0)
  })

  it('le lendemain de la saison (2 novembre) : la phrase du basilic', () => {
    vi.setSystemTime(new Date(2026, 10, 2, 0, 0, 0))

    expect(mountLayout().text()).toContain(PITCH)
  })

  it('en saison de Noël : la phrase de la bûche et le décor de Noël, rien d’Halloween', () => {
    vi.setSystemTime(new Date(2026, 11, 20, 12))

    const wrapper = mountLayout()

    expect(wrapper.text()).toContain(PITCH_NOEL)
    expect(wrapper.text()).not.toContain(PITCH)
    expect(wrapper.text()).not.toContain('citrouille')
    // Trois flocons, l'étoile et neuf sapins : décoratifs, cachés des lecteurs d'écran, sans événement de souris.
    const decor = wrapper.get('header [aria-hidden="true"].pointer-events-none')
    expect(decor.findAll('svg')).toHaveLength(13)
    expect(decor.html()).toContain('fill-star')
    expect(document.documentElement.dataset.season).toBe('noel')
  })

  it('le 1er janvier et le 5 janvier : Noël ; le 6 janvier et le 14 novembre : le basilic', () => {
    for (const [date, pitch] of [
      [new Date(2027, 0, 1, 12), PITCH_NOEL],
      [new Date(2027, 0, 5, 23, 59, 59), PITCH_NOEL],
      [new Date(2027, 0, 6, 0, 0, 0), PITCH],
      [new Date(2026, 10, 14, 23, 59, 59), PITCH],
    ] as const) {
      vi.setSystemTime(date)

      const wrapper = mountLayout()

      expect(wrapper.text()).toContain(pitch)
    }
  })

  it('Halloween coupé ne coupe pas Noël, et Noël coupé donne la phrase de base', () => {
    vi.setSystemTime(new Date(2026, 11, 20, 12))
    localStorage.setItem('repas.season', 'halloween')
    expect(mountLayout().text()).toContain(PITCH_NOEL)

    localStorage.setItem('repas.season', 'noel')
    const wrapper = mountLayout()
    expect(wrapper.text()).toContain(PITCH)
    expect(wrapper.findAll('svg')).toHaveLength(0)
  })

  it('le décor ne porte ni texte ni élément interactif', () => {
    vi.setSystemTime(new Date(2026, 9, 27, 12))

    const wrapper = mountDecor('banner')

    expect(wrapper.text()).toBe('')
    expect(wrapper.findAll('a, button, input')).toHaveLength(0)
  })

  it('le décor de Noël ne porte ni texte, ni animation, ni élément interactif', () => {
    vi.setSystemTime(new Date(2026, 11, 20, 12))

    const wrapper = mountDecor('banner', ChristmasDecor)

    expect(wrapper.text()).toBe('')
    expect(wrapper.findAll('a, button, input, animate, animateTransform, style')).toHaveLength(0)
    expect(wrapper.html()).not.toMatch(/animate|transition/)
  })

  it('chaque décor reste muet en dehors de sa saison', () => {
    vi.setSystemTime(new Date(2026, 11, 20, 12))
    expect(mountDecor('banner', HalloweenDecor).findAll('svg')).toHaveLength(0)

    vi.setSystemTime(new Date(2026, 9, 27, 12))
    expect(mountDecor('banner', ChristmasDecor).findAll('svg')).toHaveLength(0)
  })
})

describe('menu latéral, thème saisonnier', () => {
  it('un flocon discret en saison de Noël seulement', () => {
    expect(mountDecor('web', ChristmasDecor).find('svg').exists()).toBe(false)

    vi.setSystemTime(new Date(2026, 11, 20, 12))
    const web = mountDecor('web', ChristmasDecor).get('svg')
    expect(web.attributes('aria-hidden')).toBe('true')
    expect(web.classes()).toContain('pointer-events-none')
    expect(mountDecor('web', HalloweenDecor).find('svg').exists()).toBe(false)
  })

  it('une toile discrète en saison seulement', () => {
    expect(mountDecor('web').find('svg').exists()).toBe(false)

    vi.setSystemTime(new Date(2026, 9, 27, 12))
    const web = mountDecor('web').get('svg')
    expect(web.attributes('aria-hidden')).toBe('true')
    expect(web.classes()).toContain('pointer-events-none')
  })
})
