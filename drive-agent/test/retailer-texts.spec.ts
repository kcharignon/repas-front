// Les textes de l'agent prennent le nom de l'enseigne en paramètre (DRV-705). Pour Leclerc ils sont, caractère pour caractère, ceux d'avant ; pour une
// enseigne fictive (« Exemple », dont le « de » s'élide), le nom vient du paramètre et rien ne parle de Leclerc.
import { describe, expect, it } from 'vitest'

import { ERROR_CODES } from '../protocol'
import { causeTexts, errorParts, errorTexts, S, summarySentence } from '../src/ui/strings'
import { EXEMPLE, LECLERC } from './retailer-fixtures'

/** Tous les textes qui nomment l'enseigne, rendus pour une enseigne. */
function rendered(retailer: typeof LECLERC): Record<string, string> {
  const why = S.end.unreached.why(retailer)
  const errors = errorTexts(retailer)
  const counts = { known: 2, new: 4, haveAtHome: 0, skipped: 0 }
  return {
    synthèse: summarySentence(counts, retailer),
    'synthèse, un seul': summarySentence({ known: 0, new: 1, haveAtHome: 0, skipped: 0 }, retailer),
    'synthèse, tous': summarySentence({ known: 0, new: 3, haveAtHome: 0, skipped: 0 }, retailer),
    'choix, lenteur': S.picker.slow(retailer),
    'choix, panier refusé': S.picker.cartRefused(retailer, 'Poivre'),
    'fin, remplie': S.end.completed(retailer),
    'fin, choisis': S.end.chosen(retailer, 2),
    'fin, lenteur': S.end.slow(retailer),
    'fin, quantité illisible': S.end.unreadable.text(retailer),
    'fin, rupture': why.OUT_OF_STOCK,
    'fin, bientôt': why.COMING_SOON,
    'fin, refus': why.CART_REFUSED,
    'journal, accepté': S.log.acceptedAnyway(retailer, 'Poivre'),
    'journal, lenteur': S.log.slow(retailer, 'Poivre'),
    'progression, repère': S.progress.brand(retailer),
    'progression, accepté': S.progress.state.acceptedAnyway(retailer),
    'progression, lenteur': S.progress.state.slow(retailer),
    vérification: S.challenge.title(retailer),
    'site mobile, titre': causeTexts(retailer).PAGE_MOBILE?.title ?? '',
    'site mobile, texte': causeTexts(retailer).PAGE_MOBILE?.text ?? '',
    ...Object.fromEntries(
      ERROR_CODES.flatMap((code) => [
        [`erreur ${code}, titre`, errors[code].title],
        [`erreur ${code}, texte`, errors[code].text],
        [`erreur ${code}, passé`, errorParts(code, retailer).happened],
        [`erreur ${code}, action`, errorParts(code, retailer).action],
      ]),
    ),
  }
}

describe('Leclerc : les textes sont ceux d’avant, mot pour mot', () => {
  it('rend les mêmes phrases', () => {
    const texts = rendered(LECLERC)

    expect(texts).toMatchObject({
      synthèse: '6 articles : 2 sont déjà choisis, 4 sont à choisir sur Leclerc.',
      'synthèse, un seul': '1 article : il est à choisir sur Leclerc.',
      'synthèse, tous': '3 articles : tous sont à choisir sur Leclerc.',
      'choix, lenteur': 'Leclerc met trop de temps à répondre. Réessaie dans un instant.',
      'choix, panier refusé':
        'Leclerc n’a pas pu mettre « Poivre » au panier. Choisis-en un autre.',
      'fin, remplie':
        'Tes produits sont dans ton panier Leclerc. Retourne dans Repas pour le finaliser.',
      'fin, choisis': 'Choisis sur Leclerc : 2',
      'fin, lenteur': 'Leclerc a mis trop de temps à répondre.',
      'fin, quantité illisible':
        'Leclerc n’a pas donné la quantité déjà au panier. Vérifie ces articles dans ton panier.',
      'fin, rupture': ' : Leclerc le dit en rupture dans ton magasin.',
      'fin, bientôt':
        '. Leclerc indique « Bientôt disponible » : tu ne peux pas le commander pour l’instant.',
      'fin, refus': ' : Leclerc n’a pas voulu le mettre au panier, sans en donner la raison.',
      'journal, accepté': 'Poivre : ajouté, Leclerc l’a accepté',
      'journal, lenteur': 'Poivre : Leclerc met trop de temps à répondre',
      'progression, repère': 'Panier Leclerc',
      'progression, accepté': 'ajouté, Leclerc l’a accepté',
      'progression, lenteur': 'Leclerc met trop de temps à répondre',
      vérification: 'Leclerc demande une vérification',
      'site mobile, titre': 'Ce n’est pas la version ordinateur du site',
      'site mobile, texte':
        'Leclerc affiche son site mobile. Repas ne travaille que sur la version ordinateur. Ce qui est déjà au panier y reste. Ouvre « Ouvrir le drive Leclerc » dans le menu de l’application, puis reprends l’envoi.',
    })
  })

  it('rend les mêmes erreurs du protocole', () => {
    const texts = rendered(LECLERC)
    const safe = 'Ce qui est déjà au panier y reste.'

    expect(texts).toMatchObject({
      'erreur NOT_LOGGED_IN, titre': 'Tu n’es pas connecté',
      'erreur NOT_LOGGED_IN, texte': `Tu n’es pas connecté à Leclerc. ${safe} Connecte-toi à Leclerc, puis reprends l’envoi depuis Repas.`,
      'erreur STORE_MISMATCH, texte': `Repas a préparé ta liste pour un autre magasin. ${safe} Ouvre ton magasin sur Leclerc, puis reprends l’envoi depuis Repas.`,
      'erreur BLOCKED, titre': 'Leclerc a ralenti les demandes',
      'erreur BLOCKED, texte': `Leclerc a ralenti les demandes. ${safe} Attends quelques minutes, recharge la page, puis reprends l’envoi depuis Repas.`,
      'erreur CONTRACT_CHANGED, texte': `Leclerc a changé son site, l’envoi automatique est arrêté. ${safe} Cherche tes produits à la main sur Leclerc.`,
      'erreur NETWORK, texte': `Le site de Leclerc ne répond pas. ${safe} Vérifie ta connexion, puis reprends l’envoi depuis Repas.`,
      'erreur UNSUPPORTED_PAGE, texte': `Repas ne peut pas travailler sur cette page de Leclerc. ${safe} Ouvre la page de ton magasin, puis reprends l’envoi depuis Repas.`,
    })
  })

  it('le diagnostic dit le domaine de l’enseigne comme avant', () => {
    expect(S.diagnostic.detail.hostOther(LECLERC.siteDomain)).toBe('autre hôte leclercdrive.fr')
    expect(S.diagnostic.probe.where(LECLERC.siteDomain).RETAILER_HOST).toBe(
      'autre hôte leclercdrive.fr',
    )
  })
})

describe('une autre enseigne : le nom vient du paramètre', () => {
  it('élide « de » devant une voyelle', () => {
    const texts = rendered(EXEMPLE)

    expect(texts['erreur NETWORK, passé']).toBe('Le site d’Exemple ne répond pas.')
    expect(texts['erreur UNSUPPORTED_PAGE, passé']).toBe(
      'Repas ne peut pas travailler sur cette page d’Exemple.',
    )
    expect(texts['synthèse']).toBe(
      '6 articles : 2 sont déjà choisis, 4 sont à choisir sur Exemple.',
    )
  })

  it('ne dit jamais Leclerc, ni « enseigne » ni « retailer »', () => {
    const all = Object.entries(rendered(EXEMPLE))

    expect(all.filter(([, text]) => /leclerc/i.test(text))).toEqual([])
    expect(all.filter(([, text]) => /enseigne|retailer/i.test(text))).toEqual([])
    expect(S.diagnostic.detail.hostOther(EXEMPLE.siteDomain)).toBe('autre hôte exemple.invalid')
  })

  it('tous les textes qui nomment l’enseigne changent avec elle', () => {
    const leclerc = rendered(LECLERC)
    const exemple = rendered(EXEMPLE)

    const same = Object.keys(leclerc).filter(
      (key) => leclerc[key] === exemple[key] && /Leclerc/.test(leclerc[key] ?? ''),
    )
    expect(same).toEqual([])
  })
})
