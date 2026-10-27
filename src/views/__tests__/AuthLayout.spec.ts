import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { appContext } from '@/__tests__/helpers'
import HalloweenDecor from '@/design/HalloweenDecor.vue'
import AuthLayout from '@/views/AuthLayout.vue'

// Le thème saisonnier (ADR 0010) sur l'écran de connexion : la phrase et le décor n'existent que du 15 octobre au 1er novembre.
// Hors de ces tests, la suite tourne le 15 juin (src/__tests__/setup.ts).

const PITCH = 'Tes recettes, tes courses, sans oublier le basilic.'
const PITCH_HALLOWEEN = 'Tes recettes, tes courses, sans oublier la citrouille.'

function mountLayout() {
  const { plugins } = appContext()

  return mount(AuthLayout, { props: { title: 'Se connecter' }, global: { plugins } })
}

function mountDecor(variant: 'banner' | 'web') {
  const { plugins } = appContext()

  return mount(HalloweenDecor, { props: { variant }, global: { plugins } })
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

  it('le décor ne porte ni texte ni élément interactif', () => {
    vi.setSystemTime(new Date(2026, 9, 27, 12))

    const wrapper = mountDecor('banner')

    expect(wrapper.text()).toBe('')
    expect(wrapper.findAll('a, button, input')).toHaveLength(0)
  })
})

describe('menu latéral, thème saisonnier', () => {
  it('une toile discrète en saison seulement', () => {
    expect(mountDecor('web').find('svg').exists()).toBe(false)

    vi.setSystemTime(new Date(2026, 9, 27, 12))
    const web = mountDecor('web').get('svg')
    expect(web.attributes('aria-hidden')).toBe('true')
    expect(web.classes()).toContain('pointer-events-none')
  })
})
