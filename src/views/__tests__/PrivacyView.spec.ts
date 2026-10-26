import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

import { appContext } from '@/__tests__/helpers'
import fr from '@/i18n/fr'
import { routes } from '@/router'
import { sessionGuard } from '@/session/guard'
import PrivacyView from '@/views/PrivacyView.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

async function open() {
  const context = appContext()
  await context.router.push('/confidentialite')
  const wrapper = mount(PrivacyView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await flushPromises()

  return { wrapper, context }
}

/** Toutes les phrases de la politique : chaque texte de `privacy`, coupé à ses points. */
function sentences(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = []
  const visit = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      for (const text of value.split(/(?<=[.!?])\s+/)) out.push({ where: path, text })
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`)
    }
  }
  visit(fr.privacy, 'privacy')

  return out
}

// La politique de confidentialité publique de tout Repas (STORE-010) : l'adresse est donnée à Google Play et à Amazon (skill Alexa).
describe('la route /confidentialite', () => {
  it('est publique : sans session, la garde ne redirige pas', async () => {
    // Pinia actif pour la garde ; le routeur est celui de l'application (routes + garde), sans connexion ni indice de session
    appContext()
    const router = createRouter({ history: createMemoryHistory(), routes })
    router.beforeEach(sessionGuard)

    await router.push('/confidentialite')

    expect(router.currentRoute.value.name).toBe('privacy')
    expect(router.currentRoute.value.fullPath).toBe('/confidentialite')
    expect(routes.find((route) => route.path === '/confidentialite')?.meta?.public).toBe(true)
  })
})

describe('la page de confidentialité', () => {
  it('s’appelle « Confidentialité », porte sa date de mise à jour et se range en dix rubriques', async () => {
    const { wrapper } = await open()

    expect(wrapper.find('h1').text()).toBe('Confidentialité')
    expect(wrapper.text()).toContain('Dernière mise à jour : 26 octobre 2026.')
    expect(wrapper.findAll('h2').map((title) => title.text())).toEqual([
      'Qui édite Repas',
      'Ce que Repas retient de toi',
      'Si tu utilises l’envoi au drive',
      'La commande vocale avec Alexa',
      'Ce que Repas ne fait pas',
      'Qui reçoit des données',
      'Combien de temps',
      'Tes droits',
      'Les enfants',
      'Quand ce texte change',
    ])
  })

  it('dit qui édite Repas et donne l’adresse de contact, cliquable', async () => {
    const { wrapper } = await open()

    expect(wrapper.text()).toContain('Repas est édité par Kantin.')
    const mail = wrapper.find('a[href^="mailto:"]')
    expect(mail.attributes('href')).toBe('mailto:kantin.charignon@gmail.com')
    expect(mail.text()).toBe('kantin.charignon@gmail.com')
  })

  it('dit ce que la commande vocale garde et ce qu’elle ne garde pas, avec la politique d’Amazon', async () => {
    const { wrapper } = await open()

    const text = wrapper.text()
    expect(text).toContain('la liaison avec ton compte Alexa et son identifiant')
    expect(text).toContain('Repas ne le garde que sous une forme illisible')
    expect(text).toContain(
      'Repas retient ta phrase, simplifiée. Elle sert pour ce produit ou cette recette',
    )
    expect(text).toContain('Elle planifie et retire aussi tes repas')
    expect(text).toContain('Les repas que tu dictes y sont planifiés ou retirés')
    expect(text).toContain('Repas ne garde aucun enregistrement de ta voix')
    expect(text).toContain('Il ne garde pas non plus le texte complet de ce que tu dis')
    expect(text).toContain('Ni l’identifiant de ton appareil Alexa')
    const amazon = wrapper.find('a[href="https://www.amazon.fr/privacy"]')
    expect(amazon.text()).toBe('Lire la politique d’Amazon')
    expect(amazon.attributes('rel')).toBe('noopener noreferrer')
  })

  it('ne promet que ce que le code fait : la suppression du compte passe par un message à Kantin', async () => {
    const { wrapper } = await open()

    const text = wrapper.text()
    expect(text).toContain('Pour supprimer ton compte et tout ce qu’il contient, écris à Kantin.')
    // Aucun bouton de suppression n'existe encore (STORE-008) : la page ne renvoie pas vers « Moi » pour cela
    expect(text).not.toMatch(/supprime ton compte (dans|depuis) /i)
    expect(text).toContain(
      'Tu peux déjà retirer toi-même une liaison Alexa, une recette ou une liste.',
    )
  })

  it('nomme ceux qui reçoivent des données et dit que rien n’est vendu', async () => {
    const { wrapper } = await open()

    const text = wrapper.text()
    expect(text).toContain('hébergé chez DigitalOcean')
    expect(text).toContain('passent par Brevo')
    expect(text).toContain('Amazon reçoit ce que tu dis à Alexa')
    expect(text).toContain('Repas ne vend pas tes données.')
    expect(text).toContain('Repas ne montre aucune publicité')
    expect(text).toContain('Repas ne s’adresse pas aux enfants de moins de 13 ans.')
    // Les copies de sauvegarde : une par nuit, 14 gardées (deploy/backup.sh du back)
    expect(text).toContain('les 14 dernières sont gardées')
  })

  it('a un lien de retour vers l’application', async () => {
    const { wrapper } = await open()

    const back = wrapper.findAll('a').find((link) => link.text() === 'Retour à Repas')
    expect(back?.attributes('href')).toBe('/')
  })
})

describe('les textes de la politique (STORE-010)', () => {
  it('tiennent en phrases de 15 mots au plus, comme tout le produit', () => {
    const tooLong = sentences()
      .map(({ where, text }) => ({
        where,
        text,
        words: text.split(/\s+/).filter((word) => /[\p{L}\d]/u.test(word)).length,
      }))
      .filter(({ words }) => words > 15)

    expect(tooLong).toEqual([])
  })

  it('n’emploient aucun mot technique que la personne n’a pas à connaître', () => {
    const jargon =
      /jeton|token|oauth|identité|hach|sha-?\d|empreinte|api\b|webhook|base de données/iu
    const found = sentences().filter(({ text }) => jargon.test(text))

    expect(found).toEqual([])
  })

  it('ne parlent jamais de ce qui n’existe pas : ni connexion avec Google, ni suppression en un geste', () => {
    const all = sentences()
      .map(({ text }) => text)
      .join(' ')

    expect(all).not.toMatch(/google/iu)
    expect(all).not.toMatch(/supprimer ton compte (depuis|dans)/iu)
  })

  it('gardent l’adresse de contact à un seul endroit', () => {
    // vue-i18n lit « @ » comme un renvoi à une autre clé : l'adresse l'écrit « {'@'} »
    const withAddress = sentences().filter(({ text }) => text.includes('gmail.com'))

    expect(withAddress.map(({ where }) => where)).toEqual(['privacy.address'])
  })

  it('donnent une date de mise à jour qui est celle du texte', () => {
    expect(fr.privacy.updated).toBe('Dernière mise à jour : 26 octobre 2026.')
  })
})
