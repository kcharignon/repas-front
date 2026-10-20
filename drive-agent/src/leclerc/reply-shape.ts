// La FORME de l'état embarqué d'une réponse de recherche (DRV-647, étape 0) : d'où pourraient venir les libellés de rayons ? Le JSON des produits ne
// porte que des identifiants (`iIdRayon`, `iIdFamille`, `niIdSousFamille`) ; ce fichier dit, par des NOMS de clés seulement, ce qui entoure la liste des
// produits (une liste de filtres, de facettes ?). Règle du diagnostic (`probe.ts`) : jamais une valeur du site, sauf le rayon et la famille d'un produit
// (des nombres). Un nom de clé qui n'a pas le style des noms du site (`sLibelle`, `lstProduits`) n'est pas écrit : il peut être une donnée (une ville, une
// recherche récente) ; il est remplacé par `?`.
import { decodeJsString, pageReadings } from './embedded'

/** Le style des noms du site : une à trois lettres minuscules, puis une majuscule (`bClientConnecte`, `iIdRayon`, `sLibelleLigne1`, `lstProduits`). */
export const SITE_STYLE = /^[a-z]{1,3}[A-Z][A-Za-z0-9]{1,40}$/

/** Au plus autant de clés par objet décrit. */
export const MAX_SHAPE_KEYS = 40
/** Au plus autant de noms de clés « de rayon ou de filtre ». */
export const MAX_VOCABULARY = 20

/** Une clé d'un objet : son nom (`null` s'il n'a pas le style du site) et la sorte de sa valeur ; une liste dit son nombre d'éléments. */
export interface KeyShape {
  name: string | null
  kind: 'LIST' | 'OBJECT' | 'VALUE'
  /** Le nombre d'éléments d'une liste. */
  size?: number
}

/** Une étape du chemin de clés qui mène, depuis le premier niveau, à l'objet d'un produit. */
export interface PathStep {
  name: string | null
  /** L'objet suivant est un élément d'une liste. */
  list: boolean
}

export interface ReplyShape {
  /** Les clés du premier niveau de l'état qui contient les produits, dans l'ordre de la page ([MAX_SHAPE_KEYS] au plus). */
  top: KeyShape[]
  /** Le nombre de clés de ce premier niveau. */
  topTotal: number
  /** Le chemin du premier niveau jusqu'au produit (`widgets[] > lstProduits[]`). */
  path: PathStep[]
  /** Les clés du premier produit, dans l'ordre de la page ([MAX_SHAPE_KEYS] au plus). */
  product: KeyShape[]
  productTotal: number
  /** `iIdRayon` et `iIdFamille` du premier produit : les seules valeurs rapportées (des nombres). */
  aisle: number | null
  family: number | null
}

/** Une clé dont le nom parle de rayon, de famille, de filtre, de facette, de catégorie, de menu ou de navigation, et le nombre de fois qu'elle paraît. */
export interface VocabularyKey {
  name: string
  count: number
}

const KEY_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,59}$/
const AISLE_VOCABULARY = /rayon|famil|filtr|facet|categ|univers|rubriq|menu|navig|arbo/i
/** Une clé JSON entre guillemets, juste après `{` ou `,` (voir `stateKeys` de `probe.ts`). */
const QUOTED_KEY = /(?<=[{,]\s{0,16})"([A-Za-z_][A-Za-z0-9_]{0,59})"\s*:/g
export const PRODUCT_ID = /(?<![A-Za-z0-9_])["']?iIdProduit["']?\s*[:=]\s*["']?\d{1,12}(?!\d)/

/** Jusqu'où remonter, puis descendre, pour délimiter un objet : une page de recherche peut faire plusieurs centaines de milliers de caractères. */
const BACK_SPAN = 400_000
const AHEAD_SPAN = 4_000_000
/** Au plus autant d'objets englobants. */
const MAX_LEVELS = 12

const shown = (name: string): string | null => (SITE_STYLE.test(name) ? name : null)

/** La fin d'une chaîne qui commence à [start] (sa guillemet fermante), ou -1 : une chaîne JSON ne passe pas à la ligne. */
function stringEnd(text: string, start: number, limit: number): number {
  const quote = text[start]
  for (let p = start + 1; p < limit; p++) {
    const c = text[p]
    if (c === '\\') p++
    else if (c === quote) return p
    else if (c === '\n') return -1
  }
  return -1
}

/** La position du `}` ou du `]` qui ferme l'ouvrant en [open], en sautant les chaînes ; -1 si on ne le trouve pas. */
export function closing(text: string, open: number): number {
  const limit = Math.min(text.length, open + AHEAD_SPAN)
  let depth = 0
  for (let p = open; p < limit; p++) {
    const c = text[p]
    if (c === '"' || c === "'") {
      const end = stringEnd(text, p, limit)
      if (end < 0) return -1
      p = end
    } else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return p
    }
  }
  return -1
}

/** Le plus petit objet `{…}` qui commence avant [index] et le contient, ou `null`. La remontée compte les accolades ; la descente saute les chaînes. */
export function objectAround(text: string, index: number): { start: number; end: number } | null {
  let depth = 0
  for (let p = index; p >= 0 && index - p < BACK_SPAN; p--) {
    const c = text[p]
    if (c === '}') depth++
    else if (c === '{') {
      if (depth === 0) {
        const end = closing(text, p)
        return end > index ? { start: p, end } : null
      }
      depth--
    }
  }
  return null
}

/** Un objet de données (JSON) commence par une clé entre guillemets ou se ferme aussitôt ; un corps de fonction, non. */
const looksLikeData = (text: string, start: number): boolean =>
  /^\{\s*(["'}])/.test(text.slice(start, start + 200))

export interface Entry {
  name: string
  kind: KeyShape['kind']
  size?: number
  /** Où commence et finit la valeur (pour savoir quelle clé contient un objet intérieur). */
  from: number
  to: number
}

/** Le nombre d'éléments de la liste qui s'ouvre en [open] et se ferme en [close]. */
function itemsOf(text: string, open: number, close: number): number {
  let depth = 0
  let items = 0
  let pending = false
  for (let p = open + 1; p < close; p++) {
    const c = text[p] ?? ''
    if (c === '"' || c === "'") {
      const end = stringEnd(text, p, close)
      if (end < 0) break
      if (depth === 0) pending = true
      p = end
    } else if (c === '{' || c === '[') {
      if (depth === 0) pending = true
      depth++
    } else if (c === '}' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      if (pending) items++
      pending = false
    } else if (depth === 0 && !/\s/.test(c)) pending = true
  }
  return items + (pending ? 1 : 0)
}

/** Les clés directes de l'objet qui va de [start] (`{`) à [end] (`}`), dans l'ordre, avec la sorte de leur valeur. */
export function entriesOf(text: string, start: number, end: number): Entry[] {
  const entries: Entry[] = []
  for (let p = start + 1; p < end; p++) {
    const c = text[p]
    if (c === '{' || c === '[') {
      // La valeur d'une clé déjà lue (un objet ou une liste) : sautée d'un bloc.
      const close = closing(text, p)
      if (close < 0) break
      p = close
      continue
    }
    if (c !== '"' && c !== "'") continue
    const close = stringEnd(text, p, end)
    if (close < 0) break
    const after = /^\s*:\s*/.exec(text.slice(close + 1, close + 40))
    const name = text.slice(p + 1, close)
    p = close
    if (after === null || !KEY_NAME.test(name)) continue
    const from = close + 1 + after[0].length
    const first = text[from]
    if (first === '[' || first === '{') {
      const to = closing(text, from)
      if (to < 0) break
      entries.push(
        first === '['
          ? { name, kind: 'LIST', size: itemsOf(text, from, to), from, to }
          : { name, kind: 'OBJECT', from, to },
      )
      p = to
    } else {
      entries.push({ name, kind: 'VALUE', from, to: from })
    }
  }
  return entries
}

const shapeOf = (entry: Entry): KeyShape => ({
  name: shown(entry.name),
  kind: entry.kind,
  ...(entry.size !== undefined && { size: entry.size }),
})

/** Un identifiant de rayon ou de famille lu dans l'objet du produit, entier positif borné, ou `null`. */
function idIn(text: string, start: number, end: number, name: string): number | null {
  const found = new RegExp(
    `(?<![A-Za-z0-9_])["']?${name}["']?\\s*:\\s*["']?(\\d{1,9})(?!\\d)`,
  ).exec(text.slice(start, end + 1))
  const value = found?.[1] === undefined ? null : Number(found[1])
  return value !== null && Number.isSafeInteger(value) ? value : null
}

/** La lecture de la page qui porte le plus de produits (le texte tel quel, décodé des entités, sans guillemets échappés). */
function bestReading(page: string): string {
  let best = page
  let count = -1
  for (const reading of pageReadings(page)) {
    const found = reading.match(new RegExp(PRODUCT_ID.source, 'g'))?.length ?? 0
    if (found > count) {
      best = reading
      count = found
    }
  }
  return best
}

/**
 * La forme de l'état qui contient le premier produit de [page] : ses clés de premier niveau, le chemin jusqu'aux produits, les clés d'un produit.
 * `null` sans produit ou si l'état ne se délimite pas. Des noms et des nombres seulement (voir l'en-tête du fichier).
 */
export function replyShape(page: string): ReplyShape | null {
  const text = bestReading(page)
  const found = PRODUCT_ID.exec(text)
  if (found === null) return null
  const chain: { start: number; end: number }[] = []
  let position = found.index
  while (chain.length < MAX_LEVELS && position >= 0) {
    const span = objectAround(text, position)
    if (span === null || !looksLikeData(text, span.start)) break
    chain.push(span)
    position = span.start - 1
  }
  const product = chain[0]
  const top = chain.at(-1)
  if (product === undefined || top === undefined) return null
  const topEntries = entriesOf(text, top.start, top.end)
  const productEntries = entriesOf(text, product.start, product.end)
  const path: PathStep[] = []
  for (let level = chain.length - 1; level > 0; level--) {
    const outer = chain[level]
    const inner = chain[level - 1]
    if (outer === undefined || inner === undefined) break
    const holder = entriesOf(text, outer.start, outer.end).find(
      (entry) => entry.from <= inner.start && inner.start <= entry.to,
    )
    if (holder === undefined) break
    path.push({ name: shown(holder.name), list: holder.kind === 'LIST' })
  }
  return {
    top: topEntries.slice(0, MAX_SHAPE_KEYS).map(shapeOf),
    topTotal: topEntries.length,
    path,
    product: productEntries.slice(0, MAX_SHAPE_KEYS).map(shapeOf),
    productTotal: productEntries.length,
    aisle: idIn(text, product.start, product.end, 'iIdRayon'),
    family: idIn(text, product.start, product.end, 'iIdFamille'),
  }
}

/**
 * Les clés de [page] dont le nom parle de rayon, de famille, de filtre, de facette, de catégorie, de menu ou de navigation (au style des noms du site),
 * avec le nombre de fois qu'elles paraissent : les plus fréquentes d'abord, [MAX_VOCABULARY] au plus. Une liste de filtres ou un menu embarqué s'y voit.
 */
export function aisleVocabulary(page: string): VocabularyKey[] {
  const counts = new Map<string, number>()
  const texts = /&quot;|&#0*34;|&#x0*22;/i.test(page) ? pageReadings(page).slice(0, 2) : [page]
  for (const text of texts) {
    const seen = new Map<string, number>()
    for (const match of text.matchAll(QUOTED_KEY)) {
      const name = match[1]
      if (name === undefined || !SITE_STYLE.test(name) || !AISLE_VOCABULARY.test(name)) continue
      seen.set(name, (seen.get(name) ?? 0) + 1)
    }
    for (const [name, count] of seen) counts.set(name, Math.max(counts.get(name) ?? 0, count))
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_VOCABULARY)
}

/** Les clés d'un objet nommé de l'état (DRV-647) : sa sorte, le nombre d'éléments d'une liste, et les NOMS des clés (de l'objet, ou de son premier élément). */
export interface NamedObjectKeys {
  kind: 'LIST' | 'OBJECT'
  size?: number
  keys: KeyShape[]
  total: number
}

/**
 * Les NOMS des clés du premier objet `[name]` de [page] (`objFiltreBloc`, `objNavigationRayonFamille`) : ses clés directes, ou, pour une liste, celles de
 * son premier élément. `null` s'il n'y est pas. Jamais une valeur.
 */
export function namedObjectKeys(page: string, name: string): NamedObjectKeys | null {
  if (!KEY_NAME.test(name)) return null
  const pattern = new RegExp(`"${name}"\\s*:\\s*([[{])`)
  for (const text of pageReadings(page)) {
    const found = pattern.exec(text)
    if (found === null) continue
    const open = found.index + found[0].length - 1
    const close = closing(text, open)
    if (close < 0) return null
    let object: { start: number; end: number } | null = { start: open, end: close }
    let size: number | undefined
    if (found[1] === '[') {
      size = itemsOf(text, open, close)
      const first = /^\[\s*\{/.exec(text.slice(open, open + 200))
      const start = first === null ? -1 : open + first[0].length - 1
      const end = start < 0 ? -1 : closing(text, start)
      object = end < 0 ? null : { start, end }
    }
    const entries = object === null ? [] : entriesOf(text, object.start, object.end)
    return {
      kind: found[1] === '[' ? 'LIST' : 'OBJECT',
      ...(size !== undefined && { size }),
      keys: entries.slice(0, MAX_SHAPE_KEYS).map(shapeOf),
      total: entries.length,
    }
  }
  return null
}

/** Les clés d'un libellé de rayon dans un objet de filtre ou de navigation (DRV-647) : une liste fermée, aucune n'est mesurée. */
const FACET_LABEL_KEYS = [
  'sLibelleRayon',
  'sLibelle',
  'sNomRayon',
  'sLibelleFiltre',
  'sNom',
] as const
/** Au plus autant d'objets de rayon lus. */
const MAX_FACETS = 2000

/**
 * Les libellés que l'état de [page] porte HORS des produits (DRV-647, source « objet de filtre ») : chaque objet de `facetObjects` (une valeur de filtre qui
 * porte un `objFiltreBloc`, un nœud de rayon) donne son libellé direct à chacun de ses identifiants (`iIdRayon`, `iIdFamille`, `iId…`), qui ne vaut que si
 * l'identifiant est celui d'un groupe des produits. Le libellé d'un produit n'est jamais pris. Par identifiant, les textes lus, dans l'ordre de la page.
 */
export function facetLabels(page: string): Map<number, string[]> {
  const labels = new Map<number, string[]>()
  for (const text of pageReadings(page)) {
    for (const facet of facetObjects(text, MAX_FACETS)) {
      if (facet.label === null) continue
      for (const { value } of facet.ids)
        labels.set(value, [...(labels.get(value) ?? []), facet.label])
    }
    if (labels.size > 0) break
  }
  return labels
}

/** Un objet de filtre ou de rayon hors des produits (DRV-647) : ses clés, ses identifiants (nom et valeur), son libellé et celui de son `objFiltreBloc`. */
export interface FacetObject {
  keys: KeyShape[]
  total: number
  ids: { name: string; value: number }[]
  /** Le libellé direct (`sLibelle`, `sLibelleRayon`…), brut et décodé, `null` sans lui. */
  label: string | null
  /** Le `sLibelle` de l'`objFiltreBloc` de l'objet, s'il en a un. */
  block: string | null
}

/** Le texte d'une valeur de chaîne directe, décodé ; `null` si la valeur n'est pas une chaîne. */
export function stringAt(text: string, entry: Entry): string | null {
  const quote = text[entry.from]
  if (entry.kind !== 'VALUE' || (quote !== '"' && quote !== "'")) return null
  const end = stringEnd(text, entry.from, Math.min(text.length, entry.from + 400))
  if (end < 0) return null
  const value = decodeJsString(text.slice(entry.from + 1, end))
  return value === '' ? null : value
}

/** Un nombre entier direct (écrit tel quel ou entre guillemets), `null` sinon. */
export function integerAt(text: string, entry: Entry): number | null {
  if (entry.kind !== 'VALUE') return null
  const found = /^["']?(\d{1,9})["']?(?=\s*[,}\]])/.exec(text.slice(entry.from, entry.from + 16))
  return found?.[1] === undefined ? null : Number(found[1])
}

/**
 * Les objets de [text] qui portent eux-mêmes une clé `iIdRayon` ou `objFiltreBloc` et pas d'`iIdProduit` (une facette, une valeur de filtre, un nœud de rayon),
 * dans l'ordre de la page, [max] au plus. Leurs identifiants sont les clés directes au style du site dont le nom contient `Id` et dont la valeur est un entier.
 */
export function facetObjects(text: string, max: number): FacetObject[] {
  const out: FacetObject[] = []
  const seen = new Set<number>()
  let read = 0
  for (const match of text.matchAll(/"(?:iIdRayon|objFiltreBloc)"\s*:/g)) {
    if (out.length >= max || ++read > MAX_FACETS * 4 || match.index === undefined) break
    const span = objectAround(text, match.index)
    if (span === null || seen.has(span.start)) continue
    seen.add(span.start)
    const entries = entriesOf(text, span.start, span.end)
    // Un objet qui porte un produit, même plus bas (l'élément de `lstElements[]` autour de `objElement`), n'est pas une facette.
    if (PRODUCT_ID.test(text.slice(span.start, span.end + 1))) continue
    if (!entries.some((entry) => entry.name === 'iIdRayon' || entry.name === 'objFiltreBloc'))
      continue
    let label: string | null = null
    for (const key of FACET_LABEL_KEYS) {
      const entry = entries.find((one) => one.name === key)
      label = entry === undefined ? null : stringAt(text, entry)
      if (label !== null) break
    }
    const blockEntry = entries.find(
      (entry) => entry.name === 'objFiltreBloc' && entry.kind === 'OBJECT',
    )
    let block: string | null = null
    if (blockEntry !== undefined) {
      const inner = entriesOf(text, blockEntry.from, blockEntry.to).find(
        (entry) => entry.name === 'sLibelle',
      )
      block = inner === undefined ? null : stringAt(text, inner)
    }
    const ids = entries.flatMap((entry) => {
      if (!SITE_STYLE.test(entry.name) || !/Id/.test(entry.name)) return []
      const value = integerAt(text, entry)
      return value === null || value < 1 ? [] : [{ name: entry.name, value }]
    })
    out.push({
      keys: entries.slice(0, MAX_SHAPE_KEYS).map(shapeOf),
      total: entries.length,
      ids,
      label,
      block,
    })
  }
  return out
}

/**
 * L'objet de premier niveau de l'état qui contient la position [index] (DRV-647, 0.38.0) : on remonte les objets englobants tant qu'ils ressemblent à des
 * données (un corps de fonction arrête la remontée). `null` si rien ne se délimite.
 */
export function topObjectOf(text: string, index: number): { start: number; end: number } | null {
  let top: { start: number; end: number } | null = null
  let position = index
  for (let level = 0; level < MAX_LEVELS && position >= 0; level++) {
    const span = objectAround(text, position)
    if (span === null || !looksLikeData(text, span.start)) break
    top = span
    position = span.start - 1
  }
  return top
}
