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
  it('dit ce que Repas retient, ce qu’il ne voit jamais et le risque pour le compte Leclerc', async () => {
    const context = appContext()
    await context.router.push('/drive/reglages')
    const wrapper = mount(DrivePrivacyNote, { global: { plugins: context.plugins } })

    expect(wrapper.find('h2').text()).toBe('Votre vie privée')
    const text = wrapper.find('p').text()
    expect(text).toContain('Repas retient votre magasin')
    expect(text).toContain('les produits que vous choisissez (avec leur prix vu)')
    expect(text).toContain('la date d’envoi de vos listes')
    expect(text).toContain(
      'Il ne voit jamais votre identifiant, votre mot de passe, vos cookies, votre panier Leclerc ni vos commandes',
    )
    expect(text).toContain('avec votre propre connexion à Leclerc')
    expect(text).toContain('Leclerc peut suspendre un compte')
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

    // Chaque fait de la note courte a son pendant dans la note complète
    for (const [brief, detail] of [
      ['votre magasin', 'Votre magasin Leclerc'],
      ['leur prix vu', 'la date où il a été vu'],
      ['la date d’envoi', 'la date de l’envoi'],
      ['votre identifiant, votre mot de passe', 'Votre identifiant et votre mot de passe Leclerc'],
      ['vos cookies', 'Vos cookies'],
      ['votre panier Leclerc ni vos commandes', 'votre panier Leclerc, vos commandes'],
      ['avec votre propre connexion à Leclerc', 'votre propre connexion'],
      ['peut suspendre un compte', 'suspendre un compte E.Leclerc'],
    ] as const) {
      expect(short).toContain(brief)
      expect(full).toContain(detail)
    }
  })
})
