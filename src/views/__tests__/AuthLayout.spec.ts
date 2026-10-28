import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, eventually } from '@/__tests__/helpers'
import { cornerOnBanner } from '@/design/season/cornerTone'
import AuthLayout from '@/views/AuthLayout.vue'

// Les thèmes saisonniers (ADR 0010, 0011, 0012, 0014) sur l'écran de connexion : la phrase et le héros illustré n'existent que dans les dates de la saison
// (Pâques, du 15 octobre au 1er novembre, du 15 novembre au 5 janvier).
// Hors de ces tests, la suite tourne le 15 juin (src/__tests__/setup.ts).

const PITCH = 'Tes recettes, tes courses, sans oublier le basilic.'
const PITCH_HALLOWEEN = 'Tes recettes, tes courses, sans oublier la citrouille.'
const PITCH_GALETTE = 'Tes recettes, tes courses, sans oublier la galette.'
const PITCH_VALENTIN = 'Tes recettes, tes courses, sans oublier le dîner à deux.'
const PITCH_PAQUES = 'Tes recettes, tes courses, sans oublier le chocolat.'
const PITCH_NOEL = 'Tes recettes, tes courses, sans oublier la bûche.'

function mountLayout() {
  const { plugins } = appContext()

  return mount(AuthLayout, { props: { title: 'Se connecter' }, global: { plugins } })
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

  it('en saison : la phrase de la citrouille et le héros (la sorcière), sans rien dire de plus', async () => {
    vi.setSystemTime(new Date(2026, 9, 27, 12))

    const wrapper = mountLayout()

    expect(wrapper.text()).toContain(PITCH_HALLOWEEN)
    expect(wrapper.text()).not.toContain(PITCH)
    expect(wrapper.text()).not.toContain('bûche')
    // Le héros : décoratif, caché des lecteurs d'écran, sans événement de souris, dans le bandeau.
    await eventually(() => expect(wrapper.find('header svg').exists()).toBe(true))
    const hero = wrapper.get('header [aria-hidden="true"].pointer-events-none')
    expect(hero.html()).toContain('viewBox="0 0 280 220"')
    expect(hero.text()).toBe('')
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

  it('en saison de Noël : la phrase de la bûche et le héros de Noël, rien d’Halloween', async () => {
    vi.setSystemTime(new Date(2026, 11, 20, 12))

    const wrapper = mountLayout()

    expect(wrapper.text()).toContain(PITCH_NOEL)
    expect(wrapper.text()).not.toContain(PITCH)
    expect(wrapper.text()).not.toContain('citrouille')
    await eventually(() => expect(wrapper.find('header svg').exists()).toBe(true))
    expect(wrapper.get('header [aria-hidden="true"]').html()).not.toContain('#a5e072')
    expect(document.documentElement.dataset.season).toBe('noel')
  })

  it('en saison de la galette : la phrase de la galette et le héros de la galette, rien des autres saisons', async () => {
    vi.setSystemTime(new Date(2027, 0, 15, 12))

    const wrapper = mountLayout()

    expect(wrapper.text()).toContain(PITCH_GALETTE)
    expect(wrapper.text()).not.toContain(PITCH)
    await eventually(() => expect(wrapper.find('header svg').exists()).toBe(true))
    expect(wrapper.get('header [aria-hidden="true"]').html()).toContain('viewBox="0 0 280 220"')
    expect(document.documentElement.dataset.season).toBe('galette')
  })

  it('le 6 janvier et le 2 février : la galette ; le 5 janvier : Noël ; le 3 février : le basilic', () => {
    for (const [date, pitch] of [
      [new Date(2027, 0, 5, 23, 59, 59), PITCH_NOEL],
      [new Date(2027, 0, 6, 0, 0, 0), PITCH_GALETTE],
      [new Date(2027, 1, 2, 23, 59, 59), PITCH_GALETTE],
      [new Date(2027, 1, 3, 0, 0, 0), PITCH],
    ] as const) {
      vi.setSystemTime(date)

      expect(mountLayout().text()).toContain(pitch)
    }
  })

  it('en saison de la Saint-Valentin : la phrase du dîner à deux et le héros de la Saint-Valentin', async () => {
    vi.setSystemTime(new Date(2027, 1, 12, 12))

    const wrapper = mountLayout()

    expect(wrapper.text()).toContain(PITCH_VALENTIN)
    expect(wrapper.text()).not.toContain(PITCH)
    await eventually(() => expect(wrapper.find('header svg').exists()).toBe(true))
    expect(wrapper.get('header [aria-hidden="true"]').html()).toContain('viewBox="0 0 280 220"')
    expect(document.documentElement.dataset.season).toBe('valentin')
  })

  it('le 7 et le 14 février : la Saint-Valentin ; le 6 et le 15 février : le basilic', () => {
    for (const [date, pitch] of [
      [new Date(2027, 1, 6, 23, 59, 59), PITCH],
      [new Date(2027, 1, 7, 0, 0, 0), PITCH_VALENTIN],
      [new Date(2027, 1, 14, 23, 59, 59), PITCH_VALENTIN],
      [new Date(2027, 1, 15, 0, 0, 0), PITCH],
    ] as const) {
      vi.setSystemTime(date)

      expect(mountLayout().text()).toContain(pitch)
    }
  })

  it('en saison de Pâques : la phrase du chocolat et le héros de Pâques, rien d’Halloween ni de Noël', async () => {
    vi.setSystemTime(new Date(2027, 2, 20, 12))

    const wrapper = mountLayout()

    expect(wrapper.text()).toContain(PITCH_PAQUES)
    expect(wrapper.text()).not.toContain(PITCH)
    await eventually(() => expect(wrapper.find('header svg').exists()).toBe(true))
    expect(wrapper.get('header [aria-hidden="true"]').html()).toContain('viewBox="0 0 280 220"')
    expect(document.documentElement.dataset.season).toBe('paques')
  })

  it('le lundi de Pâques : Pâques ; le lendemain : le basilic ; la veille du début : le basilic', () => {
    for (const [date, pitch] of [
      [new Date(2027, 2, 29, 23, 59, 59), PITCH_PAQUES],
      [new Date(2027, 2, 30, 0, 0, 0), PITCH],
      [new Date(2027, 2, 7, 0, 0, 0), PITCH_PAQUES],
      [new Date(2027, 2, 6, 23, 59, 59), PITCH],
    ] as const) {
      vi.setSystemTime(date)

      expect(mountLayout().text()).toContain(pitch)
    }
  })

  it('le 1er janvier et le 5 janvier : Noël ; le 14 novembre : le basilic', () => {
    for (const [date, pitch] of [
      [new Date(2027, 0, 1, 12), PITCH_NOEL],
      [new Date(2027, 0, 5, 23, 59, 59), PITCH_NOEL],
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

  it('hors saison, le coin de saison reste clair-sur-bandeau seulement tant que l’écran de connexion est ouvert', () => {
    const wrapper = mountLayout()
    expect(cornerOnBanner.value).toBe(true)

    wrapper.unmount()

    expect(cornerOnBanner.value).toBe(false)
  })

  it('le héros ne porte ni texte ni élément interactif ni animation', async () => {
    vi.setSystemTime(new Date(2026, 9, 27, 12))

    const wrapper = mountLayout()
    await eventually(() => expect(wrapper.find('header svg').exists()).toBe(true))
    await flushPromises()

    const hero = wrapper.get('header [aria-hidden="true"].pointer-events-none')
    expect(hero.findAll('a, button, input, animate, animateTransform, style')).toHaveLength(0)
    expect(hero.html()).not.toMatch(/animate|transition/)
  })
})
