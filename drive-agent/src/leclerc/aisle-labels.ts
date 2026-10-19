// Le libellé des rayons du site (DRV-647, étape 1) : la rangée de filtres de l'écran de choix montre les rayons présents dans les résultats, avec leur
// nom. Mesure du 2026-10-20 (agent 0.32.0, vrai site) : le menu « Rayons » de la page ne nomme rien (« Voir le rayon ») ; chaque produit porte
// `sLibelleUrlNaviguerRayon`, `sUrlVoirRayon` et `sCategorie`, dont les VALEURS n'ont pas été vues ; la réponse porte des `objFiltreBloc` et la page un
// `objNavigationRayonFamille`, à la structure inconnue. La résolution est donc ADAPTATIVE : pour un rayon, la première source qui donne un texte
// plausible l'emporte, dans cet ordre, et le plus fréquent parmi ses produits :
//   1. `sLibelleUrlNaviguerRayon` lisible (humanisé : tirets et soulignés en espaces, première lettre en majuscule, accents gardés) ;
//   2. `sUrlVoirRayon` : le nom du rayon dans l'adresse (`rayon-N-<nom>.aspx`), humanisé ;
//   3. `sCategorie` lisible ;
//   4. un libellé lu sans risque dans un objet de rayon de la réponse ou de la page, hors des produits (`facetLabels`) ;
//   5. aucun : `null`, et l'écran dit « Rayon » suivi d'un numéro d'ordre (jamais un identifiant nu).
// Un texte qui porte un nombre long, une adresse e-mail, une adresse web ou la ville du magasin est écarté. Aucune requête : tout est déjà reçu.
import { cleanText } from '../text'
import { countAisles } from './aisle'
import { safeAisleLabel } from './aisle-menu'
import type { Candidate } from './candidate'

/** D'où vient le libellé d'un rayon : un champ des produits, un objet de rayon de la réponse ou de la page, ou rien (repli). */
export type AisleLabelSource = 'NAVIGATE' | 'URL' | 'CATEGORY' | 'REPLY' | 'PAGE' | null

/** Un rayon présent dans des résultats : son identifiant, son libellé (`null` : aucun texte plausible) et son nombre de produits. */
export interface AisleChoice {
  id: number
  label: string | null
  count: number
  source: AisleLabelSource
}

/** La longueur au plus d'un libellé de rayon dans la rangée. */
export const MAX_AISLE_LABEL = 40

/** Un rayon dans l'adresse : `rayon-284319-fruits-et-legumes.aspx` (ou `rayons_12_epicerie`), le nom après le numéro. */
const URL_NAME = /rayons?[-_](\d{1,9})[-_]([^/?#.]{2,120})/i
/** Ce qui ressemble à une adresse web : un texte lisible n'en porte pas. */
const LOOKS_LIKE_URL = /[/\\?=#]|\.aspx|https?:|www\./i

function decoded(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/**
 * Un texte du site rendu lisible : `%xx` décodés, tirets, soulignés et `+` en espaces, espaces resserrées, un texte tout en capitales mis en minuscules,
 * première lettre en majuscule (accents gardés), [MAX_AISLE_LABEL] caractères au plus.
 */
export function humanize(text: string): string {
  let out = decoded(text)
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (/\p{L}/u.test(out) && out === out.toLocaleUpperCase('fr')) out = out.toLocaleLowerCase('fr')
  out = out.charAt(0).toLocaleUpperCase('fr') + out.slice(1)
  return out.length > MAX_AISLE_LABEL ? `${out.slice(0, MAX_AISLE_LABEL - 1)}…` : out
}

/** Un libellé lisible tiré de [text], ou `null` : écarté s'il ressemble à une adresse web, à une donnée (`safeAisleLabel`) ou n'a pas deux lettres. */
export function plausibleLabel(
  text: string | null | undefined,
  city: string | null,
): string | null {
  if (text === null || text === undefined) return null
  const raw = text.trim()
  if (raw === '' || LOOKS_LIKE_URL.test(raw)) return null
  const label = humanize(raw)
  if ((label.match(/\p{L}/gu)?.length ?? 0) < 2) return null
  return safeAisleLabel(label, city)
}

/** Le nom du rayon lu dans une adresse (`…/rayon-N-<nom>.aspx`), humanisé ; `null` sans ce motif. */
export function labelFromUrl(url: string | null | undefined, city: string | null): string | null {
  if (url === null || url === undefined) return null
  const name = URL_NAME.exec(decoded(url))?.[2]
  return name === undefined ? null : plausibleLabel(name, city)
}

/** Le texte le plus fréquent d'une liste (le premier vu à égalité), ou `null`. */
function mostFrequent(values: readonly (string | null)[]): string | null {
  const counts = new Map<string, number>()
  let best: string | null = null
  for (const value of values) {
    if (value === null) continue
    const count = (counts.get(value) ?? 0) + 1
    counts.set(value, count)
    if (best === null || count > (counts.get(best) ?? 0)) best = value
  }
  return best
}

export interface AisleLabelContext {
  /** La ville du chemin du magasin : un libellé qui la porte est écarté. */
  city: string | null
  /** Les libellés de rayon lus hors des produits dans la réponse, puis dans la page (`facetLabels`). */
  reply?: ReadonlyMap<number, readonly string[]>
  page?: ReadonlyMap<number, readonly string[]>
}

/**
 * Les rayons présents dans [candidates], du plus fourni au moins fourni (à égalité, dans l'ordre de la page), chacun avec son libellé et sa source,
 * selon l'ordre de l'en-tête du fichier. Une fonction pure.
 */
export function aisleChoices(
  candidates: readonly Candidate[],
  context: AisleLabelContext,
): AisleChoice[] {
  const { city } = context
  return countAisles(candidates).map(({ id, count }) => {
    const mine = candidates.filter((candidate) => candidate.aisle === id)
    const fromProducts = [
      [
        'NAVIGATE',
        (c: Candidate) => {
          const value = c.aisleTexts?.navigate
          return plausibleLabel(value, city) ?? labelFromUrl(value, city)
        },
      ],
      ['URL', (c: Candidate) => labelFromUrl(c.aisleTexts?.url, city)],
      ['CATEGORY', (c: Candidate) => plausibleLabel(c.aisleTexts?.category, city)],
    ] as const
    for (const [source, read] of fromProducts) {
      const label = mostFrequent(mine.map(read))
      if (label !== null) return { id, label, count, source }
    }
    for (const [source, labels] of [
      ['REPLY', context.reply],
      ['PAGE', context.page],
    ] as const) {
      const label = mostFrequent((labels?.get(id) ?? []).map((text) => plausibleLabel(text, city)))
      if (label !== null) return { id, label, count, source }
    }
    return { id, label: null, count, source: null }
  })
}

/** Un texte du rayon montré par le diagnostic (DRV-647) : absent, écarté (il ressemblait à une donnée), ou rendu sûr. */
export type ShownText = { kind: 'ABSENT' } | { kind: 'HIDDEN' } | { kind: 'TEXT'; text: string }

/** Les textes du rayon du premier produit, tels que le diagnostic les montre. */
export interface ShownAisleTexts {
  navigate: ShownText
  url: ShownText
  category: ShownText
}

const ABSENT: ShownText = { kind: 'ABSENT' }
const HIDDEN: ShownText = { kind: 'HIDDEN' }
const STORE_SEGMENT = /^magasin-\d{1,12}-\d{1,12}(-.*)?$/i
const SAFE_SEGMENT = /^[\p{L}\p{N}._~%-]{1,100}$/u
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_]{0,30}$/

/** La ville masquée en `V` (comparée sans casse, tout signe de [city] valant n'importe quel caractère). */
function maskCity(text: string, city: string | null): string {
  if (city === null || city.length < 3) return text
  return text.replace(new RegExp(city.replace(/[^A-Za-z0-9]/g, '.'), 'gi'), 'V')
}

/**
 * Une adresse du site montrée sans rien de personnel : le chemin seulement (ni site, ni valeur de paramètre : leurs noms), le segment du magasin en
 * `magasin-N-N[-V]`, la ville en `V`, un segment de forme inattendue en `…` ; 160 caractères au plus. Le numéro et le nom du rayon restent lisibles.
 */
export function shownAisleUrl(value: string | null | undefined, city: string | null): ShownText {
  if (value === null || value === undefined || value.trim() === '') return ABSENT
  if (value.includes('@')) return HIDDEN
  const bare = value.trim().replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '')
  const [path = '', query = ''] = bare.split('#', 1)[0]?.split('?', 2) ?? []
  const segments = path.split('/').map((segment) => {
    if (segment === '') return ''
    const store = STORE_SEGMENT.exec(segment)
    if (store) return store[1] === undefined ? 'magasin-N-N' : 'magasin-N-N-V'
    const masked = maskCity(segment, city)
    return SAFE_SEGMENT.test(masked) ? masked : '…'
  })
  const names = [
    ...new Set(
      query
        .split('&')
        .map((pair) => pair.split('=', 1)[0] ?? '')
        .filter((name) => PARAM_NAME.test(name)),
    ),
  ]
  const text = `${segments.join('/')}${names.length === 0 ? '' : ` ?${names.slice(0, 5).join('&')}`}`
  return { kind: 'TEXT', text: text.length > 160 ? `${text.slice(0, 159)}…` : text }
}

/**
 * Un texte du rayon (libellé, catégorie) montré par le diagnostic : nettoyé, les nombres de cinq chiffres ou plus en `N`, la ville en `V`, 80 caractères
 * au plus ; écarté s'il porte une adresse e-mail. Un texte qui est une adresse est montré comme une adresse (`shownAisleUrl`).
 */
export function shownAisleText(value: string | null | undefined, city: string | null): ShownText {
  if (value === null || value === undefined) return ABSENT
  const clean = cleanText(value).replace(/\s+/g, ' ').trim()
  if (clean === '') return ABSENT
  if (clean.includes('@')) return HIDDEN
  if (clean.startsWith('/') || /^[a-z][a-z0-9+.-]*:\/\//i.test(clean))
    return shownAisleUrl(clean, city)
  const text = maskCity(clean.replace(/\d{5,}/g, 'N'), city)
  return { kind: 'TEXT', text: text.length > 80 ? `${text.slice(0, 79)}…` : text }
}

/** Les textes du rayon d'un produit, rendus sûrs pour le diagnostic. */
export function shownAisleTexts(
  texts:
    { navigate: string | null; url: string | null; category: string | null } | null | undefined,
  city: string | null,
): ShownAisleTexts {
  return {
    navigate: shownAisleText(texts?.navigate, city),
    url: shownAisleUrl(texts?.url, city),
    category: shownAisleText(texts?.category, city),
  }
}
