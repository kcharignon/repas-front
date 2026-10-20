// Le libellé des groupes de la rangée de filtres de l'écran de choix (DRV-647). Mesure RÉELLE du 2026-10-20 (agent 0.33.0, application 0.1.17) :
// `sLibelleUrlNaviguerRayon` vaut toujours « Voir le rayon » (un texte de lien : inutilisable) ; `sUrlVoirRayon` est `/magasin-…/rayon-<N>-<Nom>.aspx` où N
// est l'identifiant d'une FAMILLE (`iIdFamille`), pas du rayon ; `sCategorie` est un code (« 40 ») ; `objFiltreBloc` (`iIdBloc`, `neTypeBloc`, `sLibelle`…) a une
// valeur jamais vue ; `objNavigationRayonFamille` est absent de la page ; le menu « Rayons » n'a que des liens « Voir le rayon ».
// La résolution est donc DÉFENSIVE : jamais un texte de lien (`isGenericLabel`), jamais un libellé identique pour tous les groupes, jamais un libellé dont
// l'identifiant ne correspond pas au groupe ; et le NIVEAU du filtre (rayon ou famille) est choisi d'après là où les libellés existent (`aisleChoices`).
// Un texte qui porte un nombre long, une adresse e-mail, une adresse web ou la ville du magasin est écarté. Aucune requête : tout est déjà reçu.
import { cleanText } from '../text'
import { catalogId } from './aisle'
import { safeAisleLabel } from './aisle-menu'
import type { Candidate } from './candidate'

/** Le niveau du catalogue où la rangée filtre : le rayon (`iIdRayon`) ou la famille (`iIdFamille`), d'après là où les libellés existent. */
export type AisleLevel = 'RAYON' | 'FAMILLE'

/**
 * D'où vient le libellé d'un groupe : l'`objFiltreBloc` des produits (`FILTER`), le nom de `sUrlVoirRayon` quand son numéro est celui du groupe (`URL`), un
 * objet de filtre ou de rayon de la réponse ou de la page, hors des produits (`FACET`), ou rien (repli « Rayon N »).
 */
export type AisleLabelSource = 'FILTER' | 'URL' | 'FACET' | null

/** Un groupe (rayon ou famille) présent dans des résultats : son identifiant, son libellé (`null` : aucun texte plausible), son nombre de produits. */
export interface AisleChoice {
  id: number
  label: string | null
  count: number
  source: AisleLabelSource
}

/** La rangée que l'adaptateur propose : à quel niveau elle filtre, quel champ du produit le dit, ses groupes, et combien de produits ont un libellé à chaque niveau. */
export interface AisleGrouping {
  level: AisleLevel
  /** Le champ de `Candidate` qui porte l'identifiant du groupe. */
  key: 'aisle' | 'family'
  choices: AisleChoice[]
  coverage: Record<AisleLevel, number>
}

/** La longueur au plus d'un libellé de rayon dans la rangée. */
export const MAX_AISLE_LABEL = 40

/** Un rayon dans l'adresse : `rayon-288378-Bouillons-Fonds-et-Sauces.aspx` (ou `rayons_12_epicerie`), le numéro puis le nom. */
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

/** Un texte replié pour comparer : sans accents ni casse, signes en espaces. */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Un texte de lien ou de bouton, pas un nom (mesure du 2026-10-20 : `sLibelleUrlNaviguerRayon` vaut toujours « Voir le rayon ») : « Voir … », « Tout voir »,
 * « Afficher … », « Découvrir … », « En savoir plus », et les mots seuls « rayon », « famille », « catégorie », « tous », « filtres »…
 */
const GENERIC_START =
  /^(voir|tout voir|tous voir|afficher|decouvrir|en savoir plus|plus de|acceder|aller)\b/
const GENERIC_WORDS = new Set([
  'rayon',
  'rayons',
  'famille',
  'familles',
  'categorie',
  'categories',
  'tous',
  'tout',
  'toutes',
  'filtre',
  'filtres',
  'produits',
  'tous les produits',
  'autres',
  'divers',
])

/** Vrai pour un texte générique (lien, bouton, mot seul) qui ne nomme pas un rayon. */
export function isGenericLabel(text: string): boolean {
  const folded = fold(text)
  return folded === '' || GENERIC_START.test(folded) || GENERIC_WORDS.has(folded)
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

/**
 * Un libellé lisible tiré de [text], ou `null` : écarté s'il ressemble à une adresse web, à une donnée (`safeAisleLabel`), à un texte de lien (« Voir le
 * rayon », `isGenericLabel`) ou n'a pas deux lettres (« 40 »).
 */
export function plausibleLabel(
  text: string | null | undefined,
  city: string | null,
): string | null {
  if (text === null || text === undefined) return null
  const raw = text.trim()
  if (raw === '' || LOOKS_LIKE_URL.test(raw)) return null
  const label = humanize(raw)
  if ((label.match(/\p{L}/gu)?.length ?? 0) < 2 || isGenericLabel(label)) return null
  return safeAisleLabel(label, city)
}

/** Le numéro et le nom lus dans une adresse `…/rayon-<N>-<nom>.aspx` (le nom humanisé, `null` s'il n'est pas plausible) ; `null` sans ce motif. */
export function urlAisle(
  url: string | null | undefined,
  city: string | null,
): { id: number; label: string | null } | null {
  if (url === null || url === undefined) return null
  const found = URL_NAME.exec(decoded(url))
  if (found?.[1] === undefined || found[2] === undefined) return null
  return { id: Number(found[1]), label: plausibleLabel(found[2], city) }
}

/** Le nom lu dans une adresse `…/rayon-N-<nom>.aspx`, humanisé ; `null` sans ce motif. */
export function labelFromUrl(url: string | null | undefined, city: string | null): string | null {
  return urlAisle(url, city)?.label ?? null
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
  /** Les libellés lus hors des produits dans la réponse, puis dans la page, par identifiant (`facetLabels`). */
  reply?: ReadonlyMap<number, readonly string[]>
  page?: ReadonlyMap<number, readonly string[]>
}

const LEVELS: readonly AisleLevel[] = ['RAYON', 'FAMILLE']
const idAt = (candidate: Candidate, level: AisleLevel): number | null =>
  catalogId(level === 'RAYON' ? candidate.aisle : candidate.family)

/** Le niveau où un identifiant lu correspond au produit : son rayon, sa famille, ou aucun. */
function levelOf(id: number | null, candidate: Candidate): AisleLevel | null {
  if (id === null) return null
  if (id === candidate.aisle) return 'RAYON'
  if (id === candidate.family) return 'FAMILLE'
  return null
}

/**
 * Un libellé d'`objFiltreBloc` dont l'identifiant ne dit pas le niveau (`iIdBloc` qui n'est ni le rayon ni la famille du produit) : il vaut au niveau où il est
 * COHÉRENT, c'est-à-dire où les produits d'un même groupe portent le même libellé (9 groupes sur 10 au moins, deux produits au moins dans l'un d'eux), le rayon
 * d'abord ; sinon nulle part.
 */
function looseFilterLevel(
  candidates: readonly Candidate[],
  city: string | null,
): AisleLevel | null {
  const loose = candidates.flatMap((candidate) => {
    const filter = candidate.aisleTexts?.filter
    const label = plausibleLabel(filter?.label, city)
    return label !== null && levelOf(filter?.block ?? null, candidate) === null
      ? [{ candidate, label }]
      : []
  })
  for (const level of LEVELS) {
    const groups = new Map<number, Set<string>>()
    const sizes = new Map<number, number>()
    for (const { candidate, label } of loose) {
      const id = idAt(candidate, level)
      if (id === null) continue
      groups.set(id, (groups.get(id) ?? new Set()).add(label))
      sizes.set(id, (sizes.get(id) ?? 0) + 1)
    }
    const judged = [...groups].filter(([id]) => (sizes.get(id) ?? 0) >= 2)
    if (judged.length === 0) continue
    const coherent = judged.filter(([, labels]) => labels.size === 1).length
    if (coherent / judged.length >= 0.9) return level
  }
  return null
}

/** Les groupes d'un niveau, du plus fourni au moins fourni, chacun avec le libellé le plus fréquent de la première source qui en donne un. */
function choicesAt(
  level: AisleLevel,
  candidates: readonly Candidate[],
  context: AisleLabelContext,
  loose: AisleLevel | null,
): AisleChoice[] {
  const { city } = context
  const counts = new Map<number, number>()
  for (const candidate of candidates) {
    const id = idAt(candidate, level)
    if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const fromFilter = (candidate: Candidate): string | null => {
    const filter = candidate.aisleTexts?.filter
    const at = levelOf(filter?.block ?? null, candidate) ?? loose
    return at === level ? plausibleLabel(filter?.label, city) : null
  }
  const fromUrl = (candidate: Candidate): string | null => {
    const found = urlAisle(candidate.aisleTexts?.url, city)
    return found !== null && levelOf(found.id, candidate) === level ? found.label : null
  }
  const choices = [...counts]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .map(({ id, count }): AisleChoice => {
      const mine = candidates.filter((candidate) => idAt(candidate, level) === id)
      for (const [source, read] of [
        ['FILTER', fromFilter],
        ['URL', fromUrl],
      ] as const) {
        const label = mostFrequent(mine.map(read))
        if (label !== null) return { id, label, count, source }
      }
      const facets = [...(context.reply?.get(id) ?? []), ...(context.page?.get(id) ?? [])]
      const label = mostFrequent(facets.map((text) => plausibleLabel(text, city)))
      return label === null
        ? { id, label: null, count, source: null }
        : { id, label, count, source: 'FACET' }
    })
  // Un même libellé pour TOUS les groupes ne nomme rien (un texte de lien, le titre d'un bloc de filtres) : repli partout.
  const named = choices.filter((choice) => choice.label !== null)
  if (named.length >= 2 && new Set(named.map((choice) => fold(choice.label ?? ''))).size === 1) {
    return choices.map((choice) => ({ ...choice, label: null, source: null }))
  }
  return choices
}

/**
 * Les groupes présents dans [candidates] et leur libellé, au niveau où les libellés existent vraiment (DRV-647, mesure du 2026-10-20) : pour chaque groupe,
 * dans cet ordre, (a) le libellé de l'`objFiltreBloc` de ses produits, (b) le nom de `sUrlVoirRayon` quand le numéro de l'adresse est l'identifiant du groupe,
 * (c) un objet de filtre ou de rayon hors des produits, sinon rien (repli « Rayon N » à l'écran) ; jamais un texte de lien ni un libellé identique partout.
 * Le niveau retenu est celui dont les groupes nommés couvrent le plus de produits ; à égalité (ou sans aucun libellé), le rayon. Une fonction pure.
 */
export function aisleChoices(
  candidates: readonly Candidate[],
  context: AisleLabelContext,
): AisleGrouping {
  const loose = looseFilterLevel(candidates, context.city)
  const at = Object.fromEntries(
    LEVELS.map((level) => [level, choicesAt(level, candidates, context, loose)]),
  ) as Record<AisleLevel, AisleChoice[]>
  const coverage = Object.fromEntries(
    LEVELS.map((level) => [
      level,
      at[level].reduce((sum, choice) => sum + (choice.label === null ? 0 : choice.count), 0),
    ]),
  ) as Record<AisleLevel, number>
  const level: AisleLevel = coverage.FAMILLE > coverage.RAYON ? 'FAMILLE' : 'RAYON'
  return { level, key: level === 'RAYON' ? 'aisle' : 'family', choices: at[level], coverage }
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

/** Un produit échantillon du diagnostic (DRV-647) : son rayon, sa famille, et ce que le site lui joint pour les nommer, rendu sûr. */
export interface AisleSample {
  aisle: number | null
  family: number | null
  filter: {
    path: 'PRODUCT' | 'ELEMENT'
    label: ShownText
    block: number | null
    type: number | null
  } | null
  url: { id: number | null; name: ShownText; level: AisleLevel | null } | null
  category: ShownText
}

/** Les produits de [candidates] aux paires (rayon, famille) distinctes, dans l'ordre de la page, [max] au plus, leurs textes rendus sûrs. */
export function aisleSamples(
  candidates: readonly Candidate[],
  max: number,
  city: string | null,
): AisleSample[] {
  const seen = new Set<string>()
  const out: AisleSample[] = []
  for (const candidate of candidates) {
    if (out.length >= max) break
    const pair = `${candidate.aisle}|${candidate.family}`
    if (seen.has(pair)) continue
    seen.add(pair)
    const texts = candidate.aisleTexts
    const filter = texts?.filter ?? null
    const raw = texts?.url ?? null
    const found = raw === null ? null : URL_NAME.exec(decoded(raw))
    const id = found?.[1] === undefined ? null : Number(found[1])
    out.push({
      aisle: candidate.aisle,
      family: candidate.family,
      filter:
        filter === null
          ? null
          : {
              path: filter.path,
              label: shownAisleText(filter.label, city),
              block: filter.block,
              type: filter.type,
            },
      url:
        raw === null
          ? null
          : { id, name: shownAisleText(found?.[2] ?? null, city), level: levelOf(id, candidate) },
      category: shownAisleText(texts?.category, city),
    })
  }
  return out
}

/** Un objet de filtre ou de rayon de la réponse, rendu sûr pour le diagnostic. */
export interface ShownFacet {
  keys: readonly { name: string | null; kind: 'LIST' | 'OBJECT' | 'VALUE'; size?: number }[]
  total: number
  ids: readonly { name: string; value: number }[]
  label: ShownText
  block: ShownText
}
