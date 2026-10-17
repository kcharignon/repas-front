// Analyse tolérante du JSON de produits embarqué dans la page de recherche (recherche.md § 2 du dépôt back). Le format exact n'est pas
// garanti : on cherche des champs nommés dans le texte de la page, pas une structure précise. Pas de grosse expression régulière
// unique : on repère chaque `iIdProduit`, on délimite l'objet `{…}` qui l'entoure et on y lit les champs voulus, les inconnus étant ignorés.

/** Le contenu net structuré que le site joint à un produit (relevé DRV-007) ; chaque champ est `null` s'il manque. */
export interface StructuredContent {
  /** `sUniteMesure` (« KG »). */
  unitMeasure: string | null
  /** `nrContenanceUnitaire`. */
  unitContent: number | null
  /** `nrContenanceTotale`. */
  totalContent: number | null
  /** `sUniteMesureTotale` (« kg »). */
  totalUnit: string | null
}

/** Un produit tel que la page le donne, avant toute interprétation (prix en euros, libellés bruts). */
export interface RawProduct {
  id: string
  label1: string | null
  label2: string | null
  /** `nrPVUnitaireTTC`, à défaut `sPrixUnitaire` lu comme un nombre. */
  unitPrice: number | null
  /** `sPrixPromo` (« 1,35 € »). */
  promoText: string | null
  /** `nrPVParUniteDeMesureTTC`, à défaut `sPrixParUniteDeMesure` lu comme un nombre. */
  measurePrice: number | null
  /** `sPrixParUniteDeMesure` (« 1,29 € / kg »). */
  measureText: string | null
  /** `iQteDisponible` : 0 = indisponible. */
  stock: number | null
  /** `iQuantitePanier` : quantité déjà au panier. */
  inCart: number | null
  /** `sUrlVignetteProduit`. */
  thumbnail: string | null
  /** Présent seulement si au moins un champ du contenu net structuré est lu. */
  structured?: StructuredContent
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
      if (code.startsWith('u') || code.startsWith('x'))
        return String.fromCharCode(parseInt(code.slice(1), 16))
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
  const found = /-?\d+(?:\.\d+)?/.exec(value.replace(/[\s  ]/g, '').replace(',', '.'))
  if (!found) return null
  const parsed = Number(found[0])
  return Number.isFinite(parsed) ? parsed : null
}

const ID_PATTERN = /(?<![A-Za-z0-9_])["']?iIdProduit["']?\s*[:=]\s*["']?(\d{1,12})(?!\d)/g

function countIds(text: string): number {
  return text.match(ID_PATTERN)?.length ?? 0
}

const FIELD_PATTERNS = new Map<string, RegExp>()

/** Valeur brute d'un champ nommé dans un morceau de texte (chaîne ou nombre), ou `null` s'il manque ou s'il est vide. */
function readField(text: string, name: string): string | null {
  let pattern = FIELD_PATTERNS.get(name)
  if (!pattern) {
    pattern = new RegExp(
      `(?<![A-Za-z0-9_])["']?${name}["']?\\s*[:=]\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)'|(-?\\d+(?:[.,]\\d+)?))`,
    )
    FIELD_PATTERNS.set(name, pattern)
  }
  const found = pattern.exec(text)
  const raw = found?.[1] ?? found?.[2] ?? found?.[3]
  if (raw === undefined) return null
  const value = found?.[3] !== undefined ? raw : decodeJsString(raw)
  return value === '' ? null : value
}

const MAX_SPAN = 6000

/** Plus petit objet `{…}` qui contient la position donnée, ou `null` si on ne le délimite pas. */
function enclosingObject(text: string, index: number): { start: number; end: number } | null {
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

function buildProduct(id: string, slices: string[]): RawProduct {
  const first = <T>(read: (slice: string) => T | null): T | null => {
    for (const slice of slices) {
      const value = read(slice)
      if (value !== null) return value
    }
    return null
  }
  const text = (name: string) => first((slice) => readField(slice, name))
  const number = (name: string) => first((slice) => parseLooseNumber(readField(slice, name)))
  const measureText = text('sPrixParUniteDeMesure')
  const structured: StructuredContent = {
    unitMeasure: text('sUniteMesure'),
    unitContent: number('nrContenanceUnitaire'),
    totalContent: number('nrContenanceTotale'),
    totalUnit: text('sUniteMesureTotale'),
  }
  return {
    id,
    label1: text('sLibelleLigne1'),
    label2: text('sLibelleLigne2'),
    unitPrice: number('nrPVUnitaireTTC') ?? parseLooseNumber(text('sPrixUnitaire')),
    promoText: text('sPrixPromo'),
    measurePrice: number('nrPVParUniteDeMesureTTC') ?? parseLooseNumber(measureText),
    measureText,
    stock: number('iQteDisponible'),
    inCart: number('iQuantitePanier'),
    thumbnail: text('sUrlVignetteProduit'),
    ...(Object.values(structured).some((value) => value !== null) ? { structured } : {}),
  }
}

/** Le texte tel quel, puis décodé des entités HTML, puis débarrassé des guillemets échappés : on garde la lecture la plus riche. */
function readings(text: string): string[] {
  const out = [text]
  if (/&quot;|&#0*34;|&#x0*22;/i.test(text)) out.push(decodeEntities(text))
  if (/\\u0022|\\x22/i.test(text) || /\\"/.test(text)) {
    out.push(text.replace(/\\u0022|\\x22/gi, '"').replace(/\\"/g, '"'))
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

export interface EmbeddedProducts {
  /** Produits distincts qui ont un libellé (ce qui ressemble à un résultat de recherche), dans l'ordre de la page. */
  products: RawProduct[]
  /** Identifiants distincts repérés, avec ou sans libellé (les lignes du panier n'ont pas de libellé). */
  ids: number
}

/** Les produits du JSON d'initialisation de la page de recherche. */
export function extractProducts(page: string): EmbeddedProducts {
  let best = page
  let bestCount = -1
  for (const reading of readings(page)) {
    const count = distinctIds(reading).length
    if (count > bestCount) {
      best = reading
      bestCount = count
    }
  }

  const byId = new Map<string, RawProduct>()
  for (const found of best.matchAll(ID_PATTERN)) {
    const id = found[1]
    if (!id || found.index === undefined) continue
    const product = buildProduct(id, candidateSlices(best, found.index))
    const known = byId.get(id)
    if (!known || (known.label1 === null && product.label1 !== null)) byId.set(id, product)
  }
  return {
    products: [...byId.values()].filter((product) => product.label1 !== null),
    ids: byId.size,
  }
}
