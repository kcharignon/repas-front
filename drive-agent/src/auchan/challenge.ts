// Le défi de l'anti-robot chez Auchan (DRV-725). **AUCUN DÉFI N'A ÉTÉ VU** sur le vrai site (DRV-713, D-2 : une centaine de requêtes, aucune page de
// vérification) : les marqueurs ci-dessous sont des SUPPOSITIONS (S), jamais des faits, et se corrigent à la recette réelle (DRV-726).
//
//  - DataDome (D-1, présent, mesuré) : sa page de vérification renvoie vers `captcha-delivery.com`, comme chez Leclerc. SUPPOSÉ identique ici. Reconnu dans
//    TOUTE réponse, comme chez Leclerc (`retailers/pacer.ts#isChallenge`).
//  - reCAPTCHA Enterprise (D-4, présent à la connexion et à la création de compte, invisible, mesuré) : on ne sait pas comment une vérification apparaîtrait
//    ailleurs. SUPPOSÉ : une page (pas du JSON) qui parle de `recaptcha`. Pour ne jamais prendre pour un défi une page ordinaire qui charge le script du
//    reCAPTCHA (le badge est présent à la connexion), ce marqueur ne compte QUE sur une réponse en erreur (4xx, 5xx) ou sur une réponse de l'API du panier
//    (`isRecaptchaPage`, appelée par le panier seulement).
//
// Le défi se passe dans la page, par la personne : l'agent ne le franchit jamais. Le passage s'arrête derrière le bandeau « Reprendre / Arrêter » (le même
// qu'ailleurs, `flow/orchestrator.ts`), et ne REJOUE JAMAIS l'écriture qui l'a déclenché : à la reprise, le panier est relu avant tout.
import { isChallenge as isDataDomeChallenge } from '../retailers/pacer'

const RECAPTCHA = /recaptcha/i

/** Le texte est du JSON (objet ou tableau) : une réponse d'API, pas une page. */
function looksLikeJson(text: string): boolean {
  const first = text.trimStart().charAt(0)
  return first === '{' || first === '['
}

/** Une PAGE (pas du JSON) qui parle de reCAPTCHA : SUPPOSÉ être une vérification (non mesuré). */
export function isRecaptchaPage(text: string): boolean {
  return !looksLikeJson(text) && RECAPTCHA.test(text)
}

/**
 * Le défi, pour le `Pacer` d'Auchan : DataDome partout, reCAPTCHA seulement sur une réponse en erreur (voir plus haut). NON MESURÉ : un 403 de DataDome
 * sans `captcha-delivery.com` dans le corps n'est pas reconnu (il reste un refus ordinaire, retenté une fois puis arrêté, comme chez Leclerc).
 */
export function isAuchanChallenge(text: string, status: number): boolean {
  if (isDataDomeChallenge(text)) return true
  return status >= 400 && isRecaptchaPage(text)
}
