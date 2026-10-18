// Le visiteur non connecté (ticket G de l'audit des hypothèses, 2026-10-18). Le catalogue d'un drive est probablement public : un visiteur
// peut chercher et ajouter au panier, et l'agent remplirait alors un panier ANONYME en annonçant « Panier rempli ». Aucun relevé du vrai site
// ne dit à quoi ressemble la page d'un visiteur (DRV-002 et DRV-011 ont été faits compte connecté) : on ne devine donc pas un marqueur
// unique, on cumule des signes lus dans les liens, boutons et champs de la page, et on ne conclut « visiteur » que s'ils s'accordent.
//   - visiteur : au moins DEUX signes de visiteur (lien « Se connecter », lien « Créer un compte », champ de mot de passe, indicateur d'état
//     à faux) et AUCUN signe de client ;
//   - client connecté : au moins un signe de client (lien « Se déconnecter », « Mes commandes », indicateur d'état à vrai) et aucun signe de
//     visiteur ;
//   - sinon : inconnu. L'agent ne bloque jamais sur un état inconnu (les détections de redirection de connexion et de 401 restent).
// Les libellés ci-dessous sont des hypothèses plausibles, pas des mesures : les signes lus figurent dans le diagnostic (noms seulement),
// pour que la recette réelle les confirme ou les corrige.
import { pageReadings } from './embedded'
import { fold, INVISIBLE } from './page-text'

export type SessionState = 'MEMBER' | 'VISITOR' | 'UNKNOWN'

/** Les signes de visiteur, puis de client, dans l'ordre où ils sont listés. */
export const VISITOR_SIGNS = [
  'LOGIN_LINK',
  'REGISTER_LINK',
  'PASSWORD_FIELD',
  'STATE_FLAG_OFF',
] as const
export const MEMBER_SIGNS = ['LOGOUT_LINK', 'ORDERS_LINK', 'STATE_FLAG_ON'] as const

export type SessionSign = (typeof VISITOR_SIGNS)[number] | (typeof MEMBER_SIGNS)[number]

export interface SessionReading {
  state: SessionState
  /** Les signes lus, sans doublon, dans un ordre fixe : des noms, jamais un libellé de la page. */
  signs: readonly SessionSign[]
}

/** Au-delà, un lien est une phrase, pas un libellé de bouton. */
const MAX_LABEL = 40

/** Un lien ou un bouton : ses attributs (bornés) et son contenu (borné : un libellé n'est pas un paragraphe). */
const CLICKABLE = /<(a|button)\b([^>]{0,500})>([\s\S]{0,300}?)<\/\1\s*>/gi
const ATTRIBUTE_LABEL = /\b(?:aria-label|title)\s*=\s*(?:"([^"]{0,100})"|'([^']{0,100})')/i
/** Le texte de remplacement d'une image dans un lien (un pictogramme « Déconnexion »). */
const IMAGE_LABEL = /<img\b[^>]*\balt\s*=\s*(?:"([^"]{0,100})"|'([^']{0,100})')/i
const PASSWORD_FIELD = /<input\b[^>]*\btype\s*=\s*["']?password\b/i
/** Un indicateur d'état « connecté » dans le JSON de la page : nom supposé (convention des champs du site : `b` pour un booléen). */
const STATE_FLAG =
  /["']?b(?:Est|Is)?(?:Client|Utilisateur|User|Compte)?Connecte["']?\s*[:=]\s*(true|false)\b/gi

const LOGOUT = /\bdeconne(?:xion|ct)/
const ORDERS = /^mes commandes$/
/**
 * Les libellés EXACTS d'un lien de visiteur. Un libellé qui contient seulement le mot (« Connexion et sécurité », « Inscription à la
 * newsletter ») n'en est pas un : un client connecté en voit aussi. Un libellé double (« Connexion / Inscription ») est coupé en parties,
 * qui doivent toutes être connues.
 */
const LOGIN_LABELS = new Set([
  'se connecter',
  'me connecter',
  'connexion',
  'connectez-vous',
  'identifiez-vous',
  "s'identifier",
])
const REGISTER_LABELS = new Set([
  'creer un compte',
  'creer mon compte',
  'creer votre compte',
  'ouvrir un compte',
  "s'inscrire",
  'inscription',
  'inscrivez-vous',
  'nouveau client',
])
const SEPARATOR = /\s*(?:\/|\||·|,|;|\bou\b|\bet\b)\s*/

/** Les signes que porte le libellé (comparable, voir `fold`) d'un lien ou d'un bouton. */
function signsOfLabel(label: string): SessionSign[] {
  const text = label.replace(/[\s.:!»›>→]+$/, '')
  if (text === '' || text.length > MAX_LABEL) return []
  if (LOGOUT.test(text)) return ['LOGOUT_LINK']
  if (ORDERS.test(text)) return ['ORDERS_LINK']
  const signs: SessionSign[] = []
  for (const part of text.split(SEPARATOR)) {
    if (LOGIN_LABELS.has(part)) signs.push('LOGIN_LINK')
    else if (REGISTER_LABELS.has(part)) signs.push('REGISTER_LINK')
    else return []
  }
  return signs
}

/** Ce que le texte d'une page (le document, ou la réponse d'une recherche) laisse voir de la connexion de l'utilisateur. */
export function readSession(page: string): SessionReading {
  const found = new Set<SessionSign>()
  const visible = page.replace(INVISIBLE, ' ')
  for (const link of visible.matchAll(CLICKABLE)) {
    const attribute = ATTRIBUTE_LABEL.exec(link[2] ?? '')
    const image = IMAGE_LABEL.exec(link[3] ?? '')
    const labels = [
      link[3] ?? '',
      attribute?.[1] ?? attribute?.[2] ?? '',
      image?.[1] ?? image?.[2] ?? '',
    ]
    for (const label of labels) {
      for (const sign of signsOfLabel(fold(label))) found.add(sign)
    }
  }
  if (PASSWORD_FIELD.test(visible)) found.add('PASSWORD_FIELD')
  for (const reading of pageReadings(page)) {
    for (const flag of reading.matchAll(STATE_FLAG)) {
      found.add(flag[1]?.toLowerCase() === 'true' ? 'STATE_FLAG_ON' : 'STATE_FLAG_OFF')
    }
  }
  const signs = [...VISITOR_SIGNS, ...MEMBER_SIGNS].filter((sign) => found.has(sign))
  const visitor = signs.filter((sign) => (VISITOR_SIGNS as readonly string[]).includes(sign)).length
  const member = signs.length - visitor
  const state: SessionState =
    member === 0 && visitor >= 2 ? 'VISITOR' : visitor === 0 && member >= 1 ? 'MEMBER' : 'UNKNOWN'
  return { state, signs }
}

/** « visiteur (signes : LOGIN_LINK, REGISTER_LINK) » : la ligne du rapport, faite de mots fixes et de noms de signes. */
export function describeSession(reading: SessionReading): string {
  const state = { VISITOR: 'visiteur', MEMBER: 'connecté', UNKNOWN: 'indéterminé' }[reading.state]
  return `${state} (${reading.signs.length === 0 ? 'aucun signe' : `signes : ${reading.signs.join(', ')}`})`
}

/**
 * Une page de connexion à la place de la réponse attendue : un champ de mot de passe, et aucun des repères d'une page de magasin
 * (`squelette`, que l'appelant a déjà compté). Un visiteur voit un champ de mot de passe dans l'en-tête d'une page de magasin : la
 * présence du champ ne suffit pas.
 */
export function looksLikeLoginPage(page: string, hasStoreSkeleton: boolean): boolean {
  return !hasStoreSkeleton && PASSWORD_FIELD.test(page.replace(INVISIBLE, ' '))
}
