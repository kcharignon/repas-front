// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Analyse tolérante du JSON de produits embarqué dans la page de recherche (recherche.md § 2).
// Le format exact n'est pas garanti : on cherche des champs nommés, pas une structure précise.
import { EXCERPT_CHARS } from './config'
import { maskEmails } from './redact'

export interface Product {
  id: string
  label1: string | null
  label2: string | null
  unitPrice: number | null
  unitPriceText: string | null
  promoText: string | null
  measurePrice: number | null
  measurePriceText: string | null
  /** `iQteDisponible` : 0 = indisponible. */
  stock: number | null
  /** `iQuantitePanier` : quantité déjà au panier. */
  inCart: number | null
}

export interface ParseResult {
  /** Produits distincts qui ont un libellé (ce qui ressemble à un résultat de recherche), dans l'ordre de la page. */
  products: Product[]
  /** Identifiants distincts trouvés, avec ou sans libellé. */
  ids: number
  /** Façon dont le texte a dû être lu pour y trouver les produits. */
  view: string
}

const ENTITIES: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: ' ',
}

function fromCode(code: number, whole: string): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X'))
      return fromCode(parseInt(body.slice(2), 16), whole)
    if (body.startsWith('#')) return fromCode(parseInt(body.slice(1), 10), whole)
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

/** Lit une chaîne de JSON ou de JavaScript : échappements `\uXXXX`, `\"`, `\/`, puis entités HTML. */
export function decodeJsString(text: string): string {
  const unescaped = text.replace(
    /\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\\/"'bfnrt])/g,
    (_whole, code: string) => {
      if (code.startsWith('u') || code.startsWith('x')) {
        return String.fromCharCode(parseInt(code.slice(1), 16))
      }
      const simple: Record<string, string> = { b: '\b', f: '\f', n: ' ', r: ' ', t: ' ' }
      return simple[code] ?? code
    },
  )
  return decodeEntities(unescaped).replace(/\s+/g, ' ').trim()
}

/** « 1 234,56 € » donne 1234.56 ; « abc » donne `null`. */
export function parseLooseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[\s  ]/g, '').replace(',', '.')
  const found = /-?\d+(?:\.\d+)?/.exec(cleaned)
  if (!found) return null
  const parsed = Number(found[0])
  return Number.isFinite(parsed) ? parsed : null
}

const ID_PATTERN = /(?<![A-Za-z0-9_])["']?iIdProduit["']?\s*[:=]\s*["']?(\d{1,12})(?!\d)/g

function countIds(text: string): number {
  return text.match(ID_PATTERN)?.length ?? 0
}

const FIELD_PATTERNS = new Map<string, RegExp>()

/** Valeur brute d'un champ nommé dans un morceau de texte (chaîne ou nombre), ou `null` s'il manque. */
function readField(text: string, name: string): string | null {
  let pattern = FIELD_PATTERNS.get(name)
  if (!pattern) {
    pattern = new RegExp(
      `(?<![A-Za-z0-9_])["']?${name}["']?\\s*[:=]\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)'|(-?\\d+(?:[.,]\\d+)?))`,
    )
    FIELD_PATTERNS.set(name, pattern)
  }
  const found = pattern.exec(text)
  if (!found) return null
  const raw = found[1] ?? found[2] ?? found[3]
  if (raw === undefined) return null
  const value = found[3] !== undefined ? raw : decodeJsString(raw)
  return value === '' ? null : value
}

interface Span {
  start: number
  end: number
}

const MAX_SPAN = 6000

/** Plus petit objet `{…}` qui contient la position donnée, ou `null` si on ne le délimite pas. */
function enclosingObject(text: string, index: number): Span | null {
  let start = -1
  let depth = 0
  for (let p = index; p >= 0 && index - p < MAX_SPAN; p--) {
    const c = text[p]
    if (c === '}') depth++
    else if (c === '{') {
      if (depth === 0) {
        start = p
        break
      }
      depth--
    }
  }
  if (start < 0) return null
  let level = 0
  let inString: string | null = null
  for (let p = start; p < text.length && p - start < MAX_SPAN * 2; p++) {
    const c = text[p]
    if (inString !== null) {
      if (c === '\\') p++
      else if (c === inString) inString = null
    } else if (c === '"' || c === "'") {
      inString = c
    } else if (c === '{') {
      level++
    } else if (c === '}') {
      level--
      if (level === 0) return { start, end: p + 1 }
    }
  }
  return null
}

/** Les objets autour d'un identifiant, du plus petit au plus grand, tant qu'ils ne contiennent que ce produit. */
function candidateSlices(text: string, index: number): string[] {
  const slices: string[] = []
  let position = index
  for (let level = 0; level < 3; level++) {
    const span = enclosingObject(text, position)
    if (!span) break
    const slice = text.slice(span.start, span.end)
    if (countIds(slice) !== 1) break
    slices.push(slice)
    if (span.start === 0) break
    position = span.start - 1
  }
  return slices
}

function firstOf<T>(slices: string[], read: (slice: string) => T | null): T | null {
  for (const slice of slices) {
    const value = read(slice)
    if (value !== null) return value
  }
  return null
}

function buildProduct(id: string, slices: string[]): Product {
  const text = (name: string) => firstOf(slices, (slice) => readField(slice, name))
  const number = (name: string) =>
    firstOf(slices, (slice) => parseLooseNumber(readField(slice, name)))
  const unitPriceText = text('sPrixUnitaire')
  const measurePriceText = text('sPrixParUniteDeMesure')
  return {
    id,
    label1: text('sLibelleLigne1'),
    label2: text('sLibelleLigne2'),
    unitPrice: number('nrPVUnitaireTTC') ?? parseLooseNumber(unitPriceText),
    unitPriceText,
    promoText: text('sPrixPromo'),
    measurePrice: number('nrPVParUniteDeMesureTTC') ?? parseLooseNumber(measurePriceText),
    measurePriceText,
    stock: number('iQteDisponible'),
    inCart: number('iQuantitePanier'),
  }
}

/** Le texte tel quel, puis décodé des entités HTML, puis débarrassé des guillemets échappés : on garde la lecture la plus riche. */
function readings(text: string): { name: string; text: string }[] {
  const out = [{ name: 'texte brut', text }]
  if (/&quot;|&#0*34;|&#x0*22;/i.test(text)) {
    out.push({ name: 'entités HTML décodées', text: decodeEntities(text) })
  }
  if (/\\u0022|\\x22/i.test(text) || /\\"/.test(text)) {
    out.push({
      name: 'guillemets échappés',
      text: text.replace(/\\u0022|\\x22/gi, '"').replace(/\\"/g, '"'),
    })
  }
  return out
}

function distinctIds(text: string): string[] {
  const ids = new Set<string>()
  for (const found of text.matchAll(ID_PATTERN)) {
    if (found[1]) ids.add(found[1])
  }
  return [...ids]
}

export function extractProducts(page: string): ParseResult {
  let best = { name: 'texte brut', text: page, count: -1 }
  for (const reading of readings(page)) {
    const count = distinctIds(reading.text).length
    if (count > best.count) best = { ...reading, count }
  }

  const byId = new Map<string, Product>()
  for (const found of best.text.matchAll(ID_PATTERN)) {
    const id = found[1]
    if (!id || found.index === undefined) continue
    const product = buildProduct(id, candidateSlices(best.text, found.index))
    const known = byId.get(id)
    if (!known || (known.label1 === null && product.label1 !== null)) byId.set(id, product)
  }

  const products = [...byId.values()].filter((product) => product.label1 !== null)
  return { products, ids: byId.size, view: best.name }
}

const KEYWORDS = [
  'iIdProduit',
  'sLibelleLigne1',
  'iQteDisponible',
  'nrPVUnitaireTTC',
  'lstProduits',
  'produit',
]

/** En cas d'échec : 300 caractères autour du premier mot-clé trouvé (jamais la page entière). */
export function keywordExcerpt(page: string): { keyword: string | null; excerpt: string } {
  const lower = page.toLowerCase()
  for (const keyword of KEYWORDS) {
    const index = lower.indexOf(keyword.toLowerCase())
    if (index < 0) continue
    const start = Math.max(0, index - Math.floor(EXCERPT_CHARS / 2))
    const slice = page.slice(start, start + EXCERPT_CHARS).replace(/\s+/g, ' ')
    return { keyword, excerpt: maskEmails(slice) }
  }
  return { keyword: null, excerpt: '' }
}

const EAN_KEY =
  /["']((?:(?:s|i|ni|obj)?(?:Ean|Gtin|CodeBarres?)|ean|gtin|[A-Za-z]*(?:EAN|GTIN))[A-Za-z0-9_]*)["']\s*:|data-(ean|gtin)\b/g

/** Noms des champs qui ressemblent à un code EAN dans les données de la page (vide : aucun). */
export function findEanKeys(page: string): string[] {
  const keys = new Set<string>()
  for (const found of page.matchAll(EAN_KEY)) {
    keys.add(found[1] ?? `data-${found[2] ?? 'ean'}`)
    if (keys.size >= 5) break
  }
  return [...keys]
}
