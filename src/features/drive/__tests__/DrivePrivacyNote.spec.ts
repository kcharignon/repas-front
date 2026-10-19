import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext } from '@/__tests__/helpers'
import DriveHelpView from '../DriveHelpView.vue'
import DrivePrivacyNote from '../DrivePrivacyNote.vue'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn<() => void>()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('note de vie privée courte', () => {
  it('dit l’essentiel en une phrase de 15 mots au plus : ce que Repas ne voit jamais (DRV-626)', async () => {
    const context = appContext()
    await context.router.push('/drive/reglages')
    const wrapper = mount(DrivePrivacyNote, { global: { plugins: context.plugins } })

    expect(wrapper.find('h2').text()).toBe('Votre vie privée')
    expect(wrapper.findAll('p')).toHaveLength(1)
    const text = wrapper.find('p').text()
    expect(text).toBe('Repas ne voit jamais votre mot de passe ni votre panier Leclerc.')
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(15)
  })

  it('tient sur le premier écran : titre, une phrase, un lien, rien d’autre', async () => {
    const context = appContext()
    await context.router.push('/drive/reglages')
    const wrapper = mount(DrivePrivacyNote, { global: { plugins: context.plugins } })

    expect(wrapper.findAll('h2, p, a').map((node) => node.element.tagName)).toEqual([
      'H2',
      'P',
      'A',
    ])
  })

  it('le lien mène à la note complète de l’aide, qui existe à cette ancre', async () => {
    const context = appContext()
    await context.router.push('/drive/reglages')
    const wrapper = mount(DrivePrivacyNote, { global: { plugins: context.plugins } })

    const link = wrapper.find('a')
    expect(link.text()).toBe('Lisez la note complète')
    expect(link.attributes('href')).toBe('/drive/aide#vie-privee')

    await link.trigger('click')
    await flushPromises()
    expect(context.router.currentRoute.value.name).toBe('drive-help')
    expect(context.router.currentRoute.value.hash).toBe('#vie-privee')

    const help = mount(DriveHelpView, {
      attachTo: document.body,
      global: { plugins: context.plugins },
    })
    await flushPromises()
    const target = help.find('#vie-privee')
    expect(target.exists()).toBe(true)
    expect(target.find('h2').text()).toBe('Votre vie privée avec le drive')
    expect(document.activeElement?.id).toBe('vie-privee')
  })

  it('les deux notes disent la même chose sur les points qui comptent', async () => {
    const context = appContext()
    await context.router.push('/drive/aide')
    const short = mount(DrivePrivacyNote, { global: { plugins: context.plugins } }).text()
    const full = mount(DriveHelpView, { global: { plugins: context.plugins } })
      .find('#vie-privee')
      .text()

    // Chaque fait de la note courte a son pendant dans la note complète, qui garde tout le reste (ce que Repas retient, le risque pour le compte)
    for (const [brief, detail] of [
      ['votre mot de passe', 'Votre identifiant et votre mot de passe Leclerc'],
      ['votre panier Leclerc', 'le contenu réel de votre panier Leclerc'],
    ] as const) {
      expect(short).toContain(brief)
      expect(full.toLowerCase()).toContain(detail.toLowerCase())
    }
    for (const kept of [
      'Votre magasin Leclerc',
      'la date où il a été vu',
      'la date de l’envoi',
      'suspendre un compte E.Leclerc',
    ])
      expect(full).toContain(kept)
  })
})
