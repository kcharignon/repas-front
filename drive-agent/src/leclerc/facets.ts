// La facette « Rayons » de la réponse de recherche et la forme du filtre du site (DRV-647, mesure de l'agent 0.35.0, diagnostic seulement). Relevé réel
// du 2026-10-20 (agent 0.34.0) : la réponse porte des objets de filtre à 7-8 clés (`objFiltreBloc{}`, `iIdBloc`, `iIdValeur`, `sIdValeurUrl`, `sLibelle`,
// `niNbReferences`, `lstEnfants[]`, `fEstEnPromotion`), dont le bloc « Rayons » (`iIdBloc` 4) : les VRAIS rayons du site, avec leur libellé et leur nombre de
// références, dans un espace d'identifiants à part. Ce fichier les lit (des valeurs du catalogue public), cherche dans les liens déjà reçus la FORME du
// paramètre `Filtres`, et n'en déduit l'adresse d'une recherche filtrée que si un lien de recherche filtrée la montre (jamais deviné). Aucune requête ici.
import { cleanText } from '../text'
import { pageReadings } from './embedded'
import { addressShape } from './probe'
import {
  entriesOf,
  integerAt,
  objectAround,
  PRODUCT_ID,
  SITE_STYLE,
  stringAt,
  type Entry,
} from './reply-shape'

/** Une valeur d'un bloc de filtre : son identifiant, le fragment d'adresse du site, son libellé, son nombre de références, ses enfants. */
export interface FacetValue {
  id: number
  urlId: string | null
  label: string | null
  references: number | null
  /** L'identifiant et le libellé du bloc (`iIdBloc` direct ou celui de son `objFiltreBloc`, à défaut celui du parent). */
  bloc: number | null
  blocLabel: string | null
  children: FacetValue[]
}

/** Un bloc de filtre de la réponse : son identifiant, son libellé, le nombre de ses valeurs de premier niveau. */
export interface FacetBloc {
  id: number | null
  label: string | null
  values: number
}

export interface FacetTree {
  blocs: FacetBloc[]
  /** Les valeurs de premier niveau, dans l'ordre de la page (tous blocs). */
  values: FacetValue[]
}

/** Au plus autant de valeurs lues. */
const MAX_VALUES = 3000

/** Un texte replié pour comparer : sans accents ni casse. */
const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const valueOf = (entries: readonly Entry[], name: string): Entry | undefined =>
  entries.find((one) => one.name === name)

/**
 * Les blocs de filtre et leurs valeurs, en arbre (les enfants viennent de `lstEnfants`), lus dans l'état de [page] : tout objet qui porte lui-même une clé
 * `iIdValeur` entière et ne contient aucun produit. Des valeurs du catalogue (libellés, nombres), jamais une donnée de l'utilisateur.
 */
export function readFacets(page: string): FacetTree {
  let text = page
  let most = -1
  for (const reading of pageReadings(page)) {
    const count = reading.match(/"iIdValeur"\s*:/g)?.length ?? 0
    if (count > most) {
      text = reading
      most = count
    }
  }
  const found: (FacetValue & { start: number; end: number })[] = []
  const seen = new Set<number>()
  for (const match of text.matchAll(/"iIdValeur"\s*:/g)) {
    if (found.length >= MAX_VALUES || match.index === undefined) break
    const span = objectAround(text, match.index)
    if (span === null || seen.has(span.start)) continue
    seen.add(span.start)
    if (PRODUCT_ID.test(text.slice(span.start, span.end + 1))) continue
    const entries = entriesOf(text, span.start, span.end)
    const idEntry = valueOf(entries, 'iIdValeur')
    const id = idEntry === undefined ? null : integerAt(text, idEntry)
    if (id === null) continue
    const urlEntry = valueOf(entries, 'sIdValeurUrl')
    const labelEntry = valueOf(entries, 'sLibelle')
    const refEntry = valueOf(entries, 'niNbReferences')
    const blocEntry = valueOf(entries, 'iIdBloc')
    const blocObject = entries.find(
      (entry) => entry.name === 'objFiltreBloc' && entry.kind === 'OBJECT',
    )
    const inner = blocObject === undefined ? [] : entriesOf(text, blocObject.from, blocObject.to)
    const innerId = valueOf(inner, 'iIdBloc')
    const innerLabel = valueOf(inner, 'sLibelle')
    found.push({
      id,
      urlId:
        urlEntry === undefined
          ? null
          : (stringAt(text, urlEntry) ?? integerAt(text, urlEntry)?.toString() ?? null),
      label: labelEntry === undefined ? null : stringAt(text, labelEntry),
      references: refEntry === undefined ? null : integerAt(text, refEntry),
      bloc:
        (blocEntry === undefined ? null : integerAt(text, blocEntry)) ??
        (innerId === undefined ? null : integerAt(text, innerId)),
      blocLabel: innerLabel === undefined ? null : stringAt(text, innerLabel),
      children: [],
      start: span.start,
      end: span.end,
    })
  }
  // L'arbre : le parent d'une valeur est la plus petite autre valeur qui la contient.
  const bySize = [...found].sort((a, b) => a.end - a.start - (b.end - b.start))
  const top: typeof found = []
  for (const value of [...found].sort((a, b) => a.start - b.start)) {
    const parent = bySize.find(
      (other) => other !== value && other.start < value.start && value.end < other.end,
    )
    if (parent === undefined) top.push(value)
    else parent.children.push(value)
  }
  const inherit = (value: FacetValue, bloc: number | null, label: string | null): void => {
    value.bloc ??= bloc
    value.blocLabel ??= label
    for (const child of value.children) inherit(child, value.bloc, value.blocLabel)
  }
  for (const value of top) inherit(value, null, null)
  const blocs = new Map<string, FacetBloc>()
  for (const value of top) {
    const key = String(value.bloc)
    const bloc = blocs.get(key) ?? { id: value.bloc, label: value.blocLabel, values: 0 }
    bloc.label ??= value.blocLabel
    bloc.values += 1
    blocs.set(key, bloc)
  }
  const strip = (value: FacetValue): FacetValue => ({
    id: value.id,
    urlId: value.urlId,
    label: value.label,
    references: value.references,
    bloc: value.bloc,
    blocLabel: value.blocLabel,
    children: value.children.map(strip),
  })
  return { blocs: [...blocs.values()], values: top.map(strip) }
}

/** Le bloc « Rayons » (son libellé replié est « rayon » ou « rayons ») et ses valeurs de premier niveau, ou `null`. */
export function aisleBloc(tree: FacetTree): { bloc: FacetBloc; values: FacetValue[] } | null {
  const bloc = tree.blocs.find((one) => /^rayons?$/.test(fold(one.label ?? '').trim()))
  if (bloc === undefined) return null
  return { bloc, values: tree.values.filter((value) => value.bloc === bloc.id) }
}

/** Toutes les valeurs de l'arbre (premier niveau et enfants), avec leur profondeur (0 : premier niveau). */
export function allValues(
  values: readonly FacetValue[],
  depth = 0,
): { value: FacetValue; depth: number }[] {
  return values.flatMap((value) => [{ value, depth }, ...allValues(value.children, depth + 1)])
}

/** Ce qui ressemble aux produits frais dans un libellé de facette : fruits, légumes, marché frais, primeurs. */
const FRESH_LABEL = /fruit|legume|marche frais|primeur/

/** Les valeurs de la facette dont le libellé parle de fruits, de légumes ou de marché frais, premier niveau d'abord. */
export function freshValues(values: readonly FacetValue[]): { value: FacetValue; depth: number }[] {
  return allValues(values)
    .filter(({ value }) => FRESH_LABEL.test(fold(value.label ?? '')))
    .sort((a, b) => a.depth - b.depth)
}

// —— La forme du paramètre `Filtres` ———————————————————————————————————————————————————————————————————————————————————————————

/** Un lien qui porte le paramètre `Filtres`, lu dans la page ou dans la réponse. */
export interface FilterLink {
  /** Le chemin et la requête tels quels (relatifs à l'hôte de la page) : servent à déduire l'adresse, jamais rapportés tels quels. */
  path: string
  params: URLSearchParams
  filtres: string
}

/** Les adresses qui portent `Filtres=` dans le texte d'une réponse : attributs `href` et chaînes JSON, entités et échappements décodés. */
export function filterHrefsIn(text: string): string[] {
  const out: string[] = []
  const decoded = text
    .replace(/&amp;/g, '&')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
  for (const match of decoded.matchAll(
    /(?:href\s*=\s*|")(["']?)([^"'\s<>]*[?&]Filtres=[^"'\s<>]*)\1/gi,
  )) {
    if (match[2] !== undefined) out.push(match[2])
    if (out.length >= 500) break
  }
  return out
}

/** Les liens d'une liste d'adresses qui portent `Filtres`, sur l'hôte de la page (une adresse d'un autre site est ignorée). */
export function filterLinks(
  hrefs: readonly string[],
  host: string,
  pathname: string,
): FilterLink[] {
  const base = `https://${host}${pathname.startsWith('/') ? pathname : '/'}`
  const links: FilterLink[] = []
  for (const href of hrefs) {
    let url: URL
    try {
      url = new URL(href, base)
    } catch {
      continue
    }
    if (url.hostname.toLowerCase() !== host.toLowerCase()) continue
    const key = [...url.searchParams.keys()].find((name) => name.toLowerCase() === 'filtres')
    if (key === undefined) continue
    links.push({
      path: url.pathname,
      params: url.searchParams,
      filtres: url.searchParams.get(key) ?? '',
    })
  }
  return links
}

const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_]{0,30}$/

/** La ville masquée en `V` (comparée sans casse). */
function maskCity(text: string, city: string | null): string {
  if (city === null || city.length < 3) return text
  return text.replace(new RegExp(city.replace(/[^A-Za-z0-9]/g, '.'), 'gi'), 'V')
}

/**
 * La FORME d'une valeur de `Filtres` ou de `sIdValeurUrl` : nombres en `N`, ville en `V`, signes gardés (le séparateur est ce qu'on veut voir), lettres
 * gardées (un fragment de catalogue), 60 caractères au plus ; `(vide)` pour une valeur vide ; écartée si elle porte un `@`.
 */
export function valueShape(value: string, city: string | null): string {
  if (value === '') return '(vide)'
  if (value.includes('@')) return '(écartée)'
  const shape = maskCity(cleanText(value), city).replace(/\d+/g, 'N')
  return shape.length > 60 ? `${shape.slice(0, 59)}…` : shape
}

/** La forme d'un lien à `Filtres` : le motif du chemin (magasin en `N-N-V`), les noms des paramètres dans l'ordre, la forme de la valeur de `Filtres`. */
export function filterLinkShape(link: FilterLink, city: string | null): string {
  const path = maskCity(
    addressShape(link.path)
      .split('/')
      .map((part) => (part.startsWith('magasin-N') ? part : part.replace(/N-[^/.]+/g, 'N-…')))
      .join('/'),
    city,
  )
  const names = [...new Set([...link.params.keys()].filter((name) => PARAM_NAME.test(name)))]
  return `${path} ?${names.slice(0, 6).join('&')} ; Filtres=${valueShape(link.filtres, city)}`
}

/** Les formes distinctes de [links] avec leur nombre, les plus fréquentes d'abord, [max] au plus. */
export function filterLinkShapes(
  links: readonly FilterLink[],
  city: string | null,
  max = 6,
): { shape: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const link of links) {
    const shape = filterLinkShape(link, city)
    counts.set(shape, (counts.get(shape) ?? 0) + 1)
  }
  return [...counts]
    .map(([shape, count]) => ({ shape, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
}

/** Comment bâtir une recherche filtrée : le lien de recherche filtrée qui le montre, et quel jeton de sa valeur `Filtres` désigne la valeur de facette. */
export interface FilterTemplate {
  link: FilterLink
  /** Le jeton de la valeur de `Filtres` qui est une valeur connue de la facette : son `sIdValeurUrl` ou son `iIdValeur`. */
  token: string
  kind: 'URL_ID' | 'ID'
}

/** Pourquoi l'adresse d'une recherche filtrée n'est pas déduite. */
export type TemplateMiss =
  'NO_FILTER_LINK' | 'NO_SEARCH_LINK' | 'EMPTY_FILTER' | 'NO_KNOWN_VALUE' | 'OTHER_STORE'

/**
 * L'adresse d'une recherche filtrée, déduite SANS deviner : il faut un lien de RECHERCHE (`…/recherche.aspx` avec `TexteRecherche`) de ce magasin
 * ([cartPath] : `/magasin-N-N`) dont la valeur de `Filtres` contient, comme jeton entier, le `sIdValeurUrl` ou l'`iIdValeur` d'une valeur connue de la facette.
 * Sinon, la raison.
 */
export function filterTemplate(
  links: readonly FilterLink[],
  values: readonly FacetValue[],
  cartPath: string,
): FilterTemplate | { miss: TemplateMiss } {
  if (links.length === 0) return { miss: 'NO_FILTER_LINK' }
  const searches = links.filter(
    (link) =>
      /\/recherche\.aspx$/i.test(link.path) &&
      [...link.params.keys()].some((name) => name.toLowerCase() === 'texterecherche'),
  )
  if (searches.length === 0) return { miss: 'NO_SEARCH_LINK' }
  const mine = searches.filter(
    (link) =>
      link.path.toLowerCase().startsWith(`${cartPath.toLowerCase()}/`) ||
      link.path.toLowerCase().startsWith(`${cartPath.toLowerCase()}-`),
  )
  if (mine.length === 0) return { miss: 'OTHER_STORE' }
  const filled = mine.filter((link) => link.filtres !== '')
  if (filled.length === 0) return { miss: 'EMPTY_FILTER' }
  const known = allValues(values).map(({ value }) => value)
  const isToken = (haystack: string, token: string) =>
    new RegExp(
      `(^|[^A-Za-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9])`,
    ).test(haystack)
  for (const link of filled) {
    for (const value of known) {
      if (value.urlId !== null && value.urlId !== '' && isToken(link.filtres, value.urlId)) {
        return { link, token: value.urlId, kind: 'URL_ID' }
      }
    }
    for (const value of known) {
      if (isToken(link.filtres, String(value.id)))
        return { link, token: String(value.id), kind: 'ID' }
    }
  }
  return { miss: 'NO_KNOWN_VALUE' }
}

/**
 * La requête d'une recherche de [term] filtrée sur [target] : l'adresse du lien modèle (même chemin, mêmes paramètres), `TexteRecherche` remplacé par
 * [term] et, dans la valeur de `Filtres`, le jeton remplacé par celui de [target]. Un chemin relatif qui commence par `/` et un seul (règle de l'agent).
 */
export function filteredSearchPath(
  template: FilterTemplate,
  target: FacetValue,
  term: string,
): string | null {
  const replacement = template.kind === 'URL_ID' ? target.urlId : String(target.id)
  if (replacement === null || replacement === '') return null
  const params = new URLSearchParams(template.link.params)
  for (const name of new Set(params.keys())) {
    if (name.toLowerCase() === 'texterecherche') params.set(name, term)
    if (name.toLowerCase() === 'filtres')
      params.set(name, template.link.filtres.split(template.token).join(replacement))
  }
  const path = template.link.path
  if (!/^\/[^/\\]/.test(path)) return null
  return `${path}?${params.toString()}`
}

// —— La pagination et les univers ———————————————————————————————————————————————————————————————————————————————————————————

/** Une clé numérique ou booléenne qui parle de page, de total, de nombre, de suite : son nom, ses valeurs distinctes (4 au plus), son nombre d'apparitions. */
export interface CountKey {
  name: string
  values: (number | boolean)[]
  count: number
}

const COUNT_VOCABULARY = /page|total|nb|suivant|more|count/i
/** Ce qui parle du panier, du compte ou des prix : jamais rapporté (une somme, un solde sont des données de l'utilisateur). */
const PRIVATE_VOCABULARY =
  /panier|payer|prix|pv|montant|solde|fidel|cagnotte|client|compte|qte|quantite|stock|dispo|remise|reduc/i

/** Les clés de [text] qui disent un nombre de pages, de résultats, une page suivante (nombres et booléens seulement, jamais un texte), 30 au plus. */
export function countKeys(text: string): CountKey[] {
  const keys = new Map<string, CountKey>()
  for (const match of text.matchAll(
    /"([A-Za-z_][A-Za-z0-9_]{0,59})"\s*:\s*(true|false|-?\d{1,12}(?:\.\d+)?)(?=\s*[,}\]])/g,
  )) {
    const [, name, raw] = match
    if (name === undefined || raw === undefined) continue
    if (!SITE_STYLE.test(name) || !COUNT_VOCABULARY.test(name) || PRIVATE_VOCABULARY.test(name))
      continue
    if (!keys.has(name) && keys.size >= 30) continue
    const value = raw === 'true' ? true : raw === 'false' ? false : Number(raw)
    const key = keys.get(name) ?? { name, values: [], count: 0 }
    key.count += 1
    if (key.values.length < 4 && !key.values.includes(value)) key.values.push(value)
    keys.set(name, key)
  }
  return [...keys.values()]
}

/** Les valeurs distinctes de `eUnivers` dans [text] et leur nombre d'apparitions, les plus fréquentes d'abord. */
export function universes(text: string): { value: number; count: number }[] {
  const counts = new Map<number, number>()
  for (const match of text.matchAll(/"eUnivers"\s*:\s*"?(-?\d{1,6})"?(?=\s*[,}\]])/g)) {
    const value = Number(match[1])
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
}

// —— Le relevé du diagnostic ——————————————————————————————————————————————————————————————————————————————————————————————————

/** Une valeur de facette telle que le diagnostic la montre : libellé rendu sûr (`null` : écarté ou absent). */
export interface ShownFacetValue {
  id: number
  label: string | null
  references: number | null
  children: number
  /** Pour les 5 premières : la forme du fragment d'adresse et les libellés des enfants (6 au plus). */
  urlId?: string | null
  /** Le fragment d'adresse contient-il l'identifiant de la valeur ? */
  urlHasId?: boolean
  childLabels?: (string | null)[]
}

/** La valeur de facette dont l'identifiant est le rayon ou la famille d'un produit. */
export interface FacetMatch {
  id: number
  label: string | null
  depth: number
}

/** La recherche filtrée sondée (une requête) : sur quelle valeur, ce que le site a répondu, les familles, le premier produit. */
/**
 * Les formes de la valeur de `Filtres` qu'on peut essayer pour une valeur de facette (DRV-647, 0.37.0), dans l'ordre : (i) son `sIdValeurUrl` tel quel,
 * (ii) `<iIdBloc>-<iIdValeur>`, (iii) `<iIdValeur>-<iIdBloc>`. Seulement des formes `N-N` bâties À PARTIR DES VALEURS LUES, sans doublon ; jamais une valeur
 * inventée.
 */
export type FilterForm = 'URL_ID' | 'BLOC_ID' | 'ID_BLOC'
export const FILTER_FORMS: readonly FilterForm[] = ['URL_ID', 'BLOC_ID', 'ID_BLOC']

/** La valeur de `Filtres` d'une valeur de facette sous une forme, ou `null` si elle ne se bâtit pas (ou n'a pas la forme `N-N`). */
export function keyFor(value: FacetValue, form: FilterForm): string | null {
  const key =
    form === 'URL_ID'
      ? value.urlId
      : value.bloc === null
        ? null
        : form === 'BLOC_ID'
          ? `${value.bloc}-${value.id}`
          : `${value.id}-${value.bloc}`
  return key !== null && FILTER_KEY.test(key) ? key : null
}

/** Les formes distinctes d'une valeur, dans l'ordre (i), (ii), (iii) : trois au plus. */
export function filterKeys(value: FacetValue): { form: FilterForm; key: string }[] {
  const out: { form: FilterForm; key: string }[] = []
  for (const form of FILTER_FORMS) {
    const key = keyFor(value, form)
    if (key !== null && !out.some((one) => one.key === key)) out.push({ form, key })
  }
  return out
}

/** La valeur de facette sur laquelle valider le filtre : la plus fournie qui a des enfants lisibles, à défaut la plus fournie. */
export function validationTarget(values: readonly FacetValue[]): FacetValue | null {
  const usable = values.filter((value) => filterKeys(value).length > 0)
  const byRefs = [...usable].sort((a, b) => (b.references ?? 0) - (a.references ?? 0))
  return (
    byRefs.find((value) => value.children.some((child) => (child.label ?? '').trim() !== '')) ??
    byRefs[0] ??
    null
  )
}

/** Pourquoi une recherche filtrée est valide ou non (DRV-647, 0.37.0). */
export type CoherenceReason =
  'TOTAL_MATCHES' | 'CHILDREN_MATCH' | 'HTTP' | 'EMPTY' | 'INCOHERENT' | 'ERROR'

export interface Coherence {
  valid: boolean
  reason: CoherenceReason
  /** Le total annoncé change-t-il, et s'approche-t-il du nombre de références de la valeur (±25 % ou ±3) ? `null` : un total manque. */
  totalChanged: boolean | null
  totalNear: boolean | null
  /** La part des produits dont le groupe (famille nommée par `sUrlVoirRayon`) est un enfant de la valeur ; `null` sans enfant lisible. */
  share: number | null
}

const folded = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * La COHÉRENCE d'une recherche filtrée avec la valeur demandée (DRV-647, 0.37.0 ; mesure réelle : `Filtres=<sIdValeurUrl>` rendait moins de produits, mais pas
 * ceux du rayon, et le même `iNbTotalProduits`) : valide si (a) le total annoncé CHANGE et s'approche de `niNbReferences` de la valeur (±25 % ou ±3), OU (b) au
 * moins 80 % des produits ont un groupe qui est un enfant lisible de la valeur (sans accents ni casse). Sans enfant lisible, seul (a) compte.
 */
export function coherence(input: {
  status: number
  products: number
  before: number | null
  after: number | null
  references: number | null
  childLabels: readonly string[]
  groupLabels: readonly (string | null)[]
}): Coherence {
  const totalChanged =
    input.before === null || input.after === null ? null : input.before !== input.after
  const totalNear =
    input.after === null || input.references === null
      ? null
      : Math.abs(input.after - input.references) <= Math.max(3, input.references * 0.25)
  const children = new Set(input.childLabels.map(folded).filter((label) => label !== ''))
  const share =
    children.size === 0 || input.groupLabels.length === 0
      ? null
      : input.groupLabels.filter((label) => label !== null && children.has(folded(label))).length /
        input.groupLabels.length
  const base = { totalChanged, totalNear, share }
  if (input.status !== 200) return { ...base, valid: false, reason: 'HTTP' }
  if (input.products === 0) return { ...base, valid: false, reason: 'EMPTY' }
  if (totalChanged === true && totalNear === true)
    return { ...base, valid: true, reason: 'TOTAL_MATCHES' }
  if (share !== null && share >= 0.8) return { ...base, valid: true, reason: 'CHILDREN_MATCH' }
  return { ...base, valid: false, reason: 'INCOHERENT' }
}

/** Une forme essayée : laquelle, la forme de la valeur envoyée, ce que le site a répondu, et sa cohérence avec la valeur demandée. */
export interface ProbeAttempt {
  form: FilterForm
  /** La forme de la valeur envoyée (`N-N`). */
  value: string
  status: number | null
  /** `iNbTotalProduits` sans filtre et avec. */
  before: number | null
  total: number | null
  references: number | null
  products: number | null
  coherence: Coherence | null
  fault?: string
  /** Les 5 groupes (familles nommées) les plus fournis de la réponse filtrée. */
  families: { id: number; label: string | null; count: number }[]
  first: { label: string | null; fresh: boolean } | null
}

/** Les formes essayées sur une valeur (trois au plus), la forme retenue (`null` : aucune), la forme de l'adresse de la dernière. */
export interface FilteredProbe {
  target: { id: number; label: string | null }
  attempts: ProbeAttempt[]
  retained: FilterForm | null
  address: string | null
}

export type ProbeSkip = 'NO_TARGET' | 'NO_FACET' | 'NO_FILTER_KEY'

/** La forme d'une clé de filtre du site, lue dans `sIdValeurUrl` (relevé du 2026-10-20 : `N-N`, le bloc puis la valeur) : rien d'autre n'est envoyé. */
export const FILTER_KEY = /^\d{1,9}-\d{1,12}$/

/** `iNbTotalProduits` d'une réponse de recherche, `null` s'il n'y est pas. */
export function totalProducts(text: string): number | null {
  const found = /"iNbTotalProduits"\s*:\s*"?(\d{1,9})/.exec(text)
  return found?.[1] === undefined ? null : Number(found[1])
}

export interface FacetExploration {
  blocs: { id: number | null; label: string | null; values: number }[]
  aisleBloc: {
    id: number | null
    label: string | null
    values: ShownFacetValue[]
    total: number
  } | null
  fresh: { id: number; label: string | null; references: number | null; depth: number }[]
  samples: {
    aisle: number | null
    family: number | null
    aisleMatch: FacetMatch | null
    familyMatch: FacetMatch | null
  }[]
  links: {
    page: { count: number; shapes: { shape: string; count: number }[] }
    reply: { count: number; shapes: { shape: string; count: number }[] }
  }
  urlIdShapes: string[]
  template: { shape: string; kind: 'URL_ID' | 'ID' } | { miss: TemplateMiss }
  probe: FilteredProbe | { skipped: ProbeSkip }
  pagination: { reply: CountKey[]; page: CountKey[] }
  universes: { reply: { value: number; count: number }[]; page: { value: number; count: number }[] }
}

/** Ce qui ressemble à un produit frais dans un libellé de produit : frais, vrac, au kilo, à la pièce, en barquette, en grappe… */
export const FRESH_PRODUCT =
  /\bfra[iî]ch|\bvrac\b|\bbarquette\b|\bgrappe\b|\bcerise|\bau kg\b|\bla pi[eè]ce\b|\bcat[ée]gorie 1\b/i
