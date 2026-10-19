import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext } from '@/__tests__/helpers'
import DriveTermsView from '../DriveTermsView.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

async function open() {
  const context = appContext()
  await context.router.push('/drive/conditions')
  const wrapper = mount(DriveTermsView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await flushPromises()

  return { wrapper, context }
}

// La seule page qui parle des risques et des engagements (DRV-628) : tout ce qui a quitté l'écran du parcours doit s'y retrouver.
describe('conditions d’utilisation du drive', () => {
  it('s’appelle « Conditions d’utilisation du drive » et range le fond en six rubriques', async () => {
    const { wrapper } = await open()

    expect(wrapper.find('h1').text()).toBe('Conditions d’utilisation du drive')
    expect(wrapper.findAll('h2').map((title) => title.text())).toEqual([
      'Comment ça se passe',
      'Ce que Repas enregistre',
      'Ce que Repas ne voit et n’enregistre jamais',
      'Où, et combien de temps',
      'Comment tout effacer',
      'Avant d’utiliser l’envoi : ce que tu dois savoir',
    ])
  })

  it('dit les risques pour le compte Leclerc et ce que Repas ne fait pas', async () => {
    const { wrapper } = await open()

    const text = wrapper.text()
    expect(text).toContain('suspendre un compte E.Leclerc')
    expect(text).toContain('cagnotte de Tickets E.Leclerc')
    expect(text).toContain('Repas ne valide jamais de commande')
    expect(text).toContain('ne vide jamais ton panier')
    expect(text).toContain('Il ne réduit jamais une quantité déjà au panier')
    expect(text).toContain('Rien n’est mis au panier tant que tu n’as pas touché « Commencer »')
    expect(text).toContain('Attends plusieurs heures')
    expect(text).toContain('Rien de cela ne passe par les serveurs de Repas')
  })

  it('dit ce que valent les prix et que Repas ne devine jamais un prix', async () => {
    const { wrapper } = await open()

    const text = wrapper.text()
    expect(text).toContain('L’estimation est indicative')
    expect(text).toContain('peu fiable')
    expect(text).toContain('Repas ne devine jamais un prix')
  })

  it('dit que les pages de Leclerc font appel à leurs propres services (cookies tiers acceptés par l’application)', async () => {
    const { wrapper } = await open()

    const text = wrapper.text()
    expect(text).toContain('leurs propres services')
    expect(text).toContain('mesure d’audience')
    expect(text).not.toContain('ni avec personne.')
  })

  it('ne demande rien : ni case à cocher, ni bouton, ni fenêtre — un lien pour revenir à « Moi »', async () => {
    const { wrapper } = await open()

    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.find('a').attributes('href')).toBe('/moi')
    expect(wrapper.find('a').text()).toBe('Moi')
  })
})
