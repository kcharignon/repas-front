// La FORME de l'état embarqué d'une réponse de recherche (DRV-647, étape 0) : d'où pourraient venir les libellés de rayons ? Le JSON des produits ne
// porte que des identifiants (`iIdRayon`, `iIdFamille`, `niIdSousFamille`) ; ce fichier dit, par des NOMS de clés seulement, ce qui entoure la liste des
// produits (une liste de filtres, de facettes ?). Règle du diagnostic (`probe.ts`) : jamais une valeur du site, sauf le rayon et la famille d'un produit
// (des nombres). Un nom de clé qui n'a pas le style des noms du site (`sLibelle`, `lstProduits`) n'est pas écrit : il peut être une donnée (une ville, une
// recherche récente) ; il est remplacé par `?`.
import { pageReadings } from './embedded'

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
const PRODUCT_ID = /(?<![A-Za-z0-9_])["']?iIdProduit["']?\s*[:=]\s*["']?\d{1,12}(?!\d)/

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
function closing(text: string, open: number): number {
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
function objectAround(text: string, index: number): { start: number; end: number } | null {
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

interface Entry {
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
function entriesOf(text: string, start: number, end: number): Entry[] {
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
