import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import DriveTermsView from '../DriveTermsView.vue'

afterEach(() => {
  vi.unstubAllGlobals()
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

  it('dit que seule la version de l’application est retenue, sans rien sur le téléphone (DRV-637)', async () => {
    const { wrapper } = await open()

    const item = wrapper
      .findAll('li')
      .find((candidate) => candidate.text().includes('version de l’application'))
    expect(item?.text()).toContain('Seule la version est retenue')
    expect(item?.text()).toContain('aucun identifiant de ton téléphone, aucun modèle de téléphone')
  })

  it('dit ce qu’est la recherche mémorisée, pour quel magasin, et qu’elle reste privée (DRV-650, phrase de la note de vie privée du back)', async () => {
    const { wrapper } = await open()

    const item = wrapper
      .findAll('li')
      .find((candidate) =>
        candidate.text().startsWith('La recherche qui t’a fait trouver un produit'),
      )
    expect(item?.text()).toBe(
      'La recherche qui t’a fait trouver un produit : le texte que tu as tapé pour le trouver sur le site (par exemple « céréales coussins »), pour chercher un remplaçant avec ce texte quand le produit n’est plus disponible. Elle est gardée avec l’article, pour ton magasin Leclerc seulement. Elle n’est jamais envoyée ailleurs et personne d’autre ne la voit. Elle est gardée aussi quand tu prends un produit « Pas mon habituel » : le produit n’est pas retenu, mais le texte qui l’a fait trouver l’est.',
    )
  })

  it('dit combien il y en a dans un produit quand la liste compte autrement qu’en poids ou en volume, gardé pour ce produit et ce magasin (DRV-652, phrase de la note de vie privée du back)', async () => {
    const { wrapper } = await open()

    const item = wrapper
      .findAll('li')
      .find((candidate) => candidate.text().startsWith('Combien il y en a dans un produit'))
    expect(item?.text()).toBe(
      'Combien il y en a dans un produit, quand ta liste compte autrement qu’en poids ou en volume : si ta liste dit « 15 tranches », Repas ne sait pas combien de tranches tient dans un produit. Il te le demande une fois, et retient ta réponse (par exemple « 20 tranches ») pour calculer le nombre de produits la fois suivante, sans te le redemander. Elle est gardée avec ce produit-là, dans ton article, pour ton magasin Leclerc seulement. Elle n’est jamais envoyée ailleurs et personne d’autre ne la voit.',
    )
  })

  it('renvoie à la confidentialité de tout Repas (STORE-010), une page publique', async () => {
    const { wrapper } = await open()

    const link = wrapper
      .findAll('a')
      .find((candidate) => candidate.text() === 'Confidentialité de tout Repas')
    expect(link?.attributes('href')).toBe('/confidentialite')
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

// Auchan (DRV-727) : la phrase de l'enseigne dans « Avant d'utiliser l'envoi » ne dit que ce que Repas fait. Le texte est une proposition à valider.
describe('conditions d’utilisation du drive pour Auchan', () => {
  async function openFor(retailer: string) {
    stubApi({
      'POST /api/auth/refresh': () => json({ token: 'jeton' }),
      'GET /api/v1/me': () => json(me),
      'GET /api/v1/drive/settings': () =>
        json({
          enabled: true,
          retailer,
          store:
            retailer === 'auchan'
              ? {
                  id: '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc',
                  label: null,
                  baseUrl: 'https://www.auchan.fr/',
                }
              : null,
        }),
    })
    localStorage.setItem('repas.session', '1')
    const context = appContext()
    await useSessionStore().restore()
    await context.router.push('/drive/conditions')
    const wrapper = mount(DriveTermsView, {
      attachTo: document.body,
      global: { plugins: context.plugins },
    })
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain(retailer === 'auchan' ? 'Auchan' : 'Leclerc'),
    )
    await flushPromises()

    return wrapper
  }

  it('dit ce que Repas fait sur Auchan : le panier dans la page, ni validation ni paiement', async () => {
    const text = (await openFor('auchan')).text()

    expect(text).toContain('Repas remplit ton panier dans la page Auchan de ton téléphone.')
    expect(text).toContain('Il ne valide jamais ta commande et ne paie jamais')
    expect(text).toContain('une demande à la fois, avec des pauses')
  })

  it('ne reprend rien du texte de Leclerc : ni son nom, ni sa suspension, ni sa cagnotte', async () => {
    const text = (await openFor('auchan')).text()

    expect(text).not.toMatch(/leclerc/i)
    expect(text).not.toContain('suspendre un compte')
    expect(text).not.toContain('cagnotte')
    expect(text).toContain('Si Auchan ralentit les requêtes')
    expect(text).toContain('le service client d’Auchan')
  })

  it('garde les six mêmes rubriques, et le texte de Leclerc reste celui d’avant pour Leclerc', async () => {
    const auchan = await openFor('auchan')
    expect(auchan.findAll('h2')).toHaveLength(6)
    document.body.innerHTML = ''
    const leclerc = await openFor('leclerc')

    expect(leclerc.findAll('h2')).toHaveLength(6)
    expect(leclerc.text()).toContain('suspendre un compte E.Leclerc')
    expect(leclerc.text()).not.toMatch(/auchan/i)
  })
})
