// Analyse tolérante du JSON de produits embarqué dans la page de recherche (recherche.md § 2 du dépôt back). Le format exact n'est pas
// garanti : on cherche des champs nommés dans le texte de la page, pas une structure précise. Pas de grosse expression régulière
// unique : on repère chaque `iIdProduit`, on délimite l'objet `{…}` qui l'entoure et on y lit les champs voulus, les inconnus étant ignorés.
import { own } from '../own'
import { cleanText } from '../text'

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

/**
 * L'`objFiltreBloc` joint à un produit (mesure du 2026-10-20, agent 0.33.0 : six clés `iIdBloc`, `neTypeBloc`, `sLibelle`, `fMultiSelection`, `niNbAffichage`,
 * `iNbValeursMinimum`, valeurs jamais vues) : son libellé, son identifiant, son type, et OÙ il est : dans l'objet du produit (`PRODUCT`) ou dans un objet
 * qui l'englobe et ne porte que ce produit (`ELEMENT`, l'élément de `lstElements[]`).
 */
export interface FilterBlock {
  label: string | null
  block: number | null
  type: number | null
  path: 'PRODUCT' | 'ELEMENT'
}

/**
 * Les textes du rayon que le site joint à un produit (noms mesurés par le diagnostic 0.32.0, DRV-647) : `sLibelleUrlNaviguerRayon` (mesuré : toujours
 * « Voir le rayon », un texte de lien), `sUrlVoirRayon` (mesuré : `/magasin-…/rayon-<id>-<Nom>.aspx`, l'identifiant étant celui d'une FAMILLE), `sCategorie`
 * (mesuré : un code, « 40 ») et l'`objFiltreBloc`, bornés à [MAX_AISLE_TEXT] caractères, chacun `null` s'il manque.
 */
export interface AisleTexts {
  navigate: string | null
  url: string | null
  category: string | null
  filter?: FilterBlock | null
}

const MAX_AISLE_TEXT = 300

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
  /**
   * `eDisponibilite` (DRV-635) : l'étiquette de disponibilité du site, lue comme un nombre (`null` si elle manque ou n'est pas un nombre). Mesurée,
   * pas interprétée : le site ordinateur et le site mobile ne disent pas la même chose du stock d'un même produit.
   */
  availability: number | null
  /** La fiche du produit dit « Bientôt disponible » (DRV-635) : une étiquette de rupture, que le panier peut démentir. */
  comingSoon: boolean
  /** `sUrlVignetteProduit`. */
  thumbnail: string | null
  /** `iIdRayon` et `iIdFamille` (DRV-646) : des identifiants numériques, mesurés par le diagnostic. */
  aisle: number | null
  family: number | null
  /** Les textes du rayon du produit (DRV-647), présents seulement si l'un d'eux est lu : d'où l'agent tire le libellé du rayon. */
  aisleTexts?: AisleTexts
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
    return own(ENTITIES, body.toLowerCase()) ?? whole
  })
}

/**
 * Lit une chaîne de JSON ou de JavaScript : échappements `\uXXXX`, `\"`, `\/`, puis entités HTML, puis `cleanText` : le texte rendu est la source de
 * tous les libellés et textes de contenu de l'agent, sans caractère invisible ni de contrôle (que le back refuserait, voir `../text.ts`).
 */
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
  return cleanText(decodeEntities(unescaped))
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

/** « Bientôt disponible », avec ou sans accent (le texte est décodé avant : `ô` et `&ocirc;` y sont déjà « ô »). */
const COMING_SOON = /bient[oô]t\s+disponible/i

/**
 * Jusqu'où chercher l'objet d'un produit autour de son identifiant (DRV-647, 0.38.0 : 40 000 au lieu de 6 000 ; un produit du vrai site a 73 clés, dont des
 * objets imbriqués, et un objet plus grand que la borne était perdu sans bruit).
 */
const MAX_SPAN = 40_000

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
/**
 * Le texte d'un objet réduit à son premier niveau : les objets et listes imbriqués sont vidés (`{}`, `[]`), les chaînes gardées. Sert à lire les champs
 * DIRECTS d'un produit qui en contient d'autres (un groupe de variantes, des produits liés : DRV-647, 0.38.0), sans prendre ceux d'un produit imbriqué.
 */
export function directLevel(slice: string): string {
  let out = ''
  let depth = 0
  let quote: string | null = null
  for (let p = 0; p < slice.length; p++) {
    const c = slice[p] ?? ''
    if (quote !== null) {
      if (depth <= 1) out += c
      if (c === '\\') {
        p++
        if (depth <= 1) out += slice[p] ?? ''
      } else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      if (depth <= 1) out += c
    } else if (c === '{' || c === '[') {
      depth++
      if (depth <= 2) out += c
    } else if (c === '}' || c === ']') {
      if (depth <= 2) out += c
      depth--
    } else if (depth <= 1) out += c
  }
  return out
}

/** Pourquoi un identifiant de produit n'a pas donné de produit (DRV-647, 0.38.0, pour le diagnostic). */
export type UnreadReason = 'SPAN' | 'NO_LABEL'

function candidateSlices(text: string, index: number): string[] {
  const slices: string[] = []
  let position = index
  for (let level = 0; level < 3; level++) {
    const span = enclosingObject(text, position)
    if (!span) break
    const slice = text.slice(span.start, span.end)
    if (countIds(slice) !== 1) {
      // L'objet du produit en contient d'autres (variantes, produits liés) : ses champs directs seulement, et l'on s'arrête là.
      if (level === 0) {
        const direct = directLevel(slice)
        if (countIds(direct) === 1) slices.push(direct)
      }
      break
    }
    slices.push(slice)
    if (span.start === 0) break
    position = span.start - 1
  }
  return slices
}

/** La fin de l'objet qui s'ouvre en [open] (`{`), en sautant les chaînes ; -1 si on ne la trouve pas. */
function objectEnd(text: string, open: number): number {
  let depth = 0
  let quote: string | null = null
  for (let p = open; p < text.length && p - open < MAX_SPAN; p++) {
    const c = text[p]
    if (quote !== null) {
      if (c === '\\') p++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return p
    }
  }
  return -1
}

const FILTER_BLOCK = /(?<![A-Za-z0-9_])["']?objFiltreBloc["']?\s*:\s*\{/

/** L'`objFiltreBloc` du produit (DRV-647) : cherché dans l'objet du produit, puis dans les objets qui l'englobent sans porter un autre produit. */
function filterBlockOf(slices: readonly string[]): FilterBlock | null {
  for (const [level, slice] of slices.entries()) {
    const found = FILTER_BLOCK.exec(slice)
    if (found === null) continue
    const open = found.index + found[0].length - 1
    const end = objectEnd(slice, open)
    if (end < 0) return null
    const block = slice.slice(open, end + 1)
    const id = parseLooseNumber(readField(block, 'iIdBloc'))
    const type = parseLooseNumber(readField(block, 'neTypeBloc'))
    return {
      label: readField(block, 'sLibelle')?.slice(0, MAX_AISLE_TEXT) ?? null,
      block: id !== null && Number.isSafeInteger(id) ? id : null,
      type: type !== null && Number.isSafeInteger(type) ? type : null,
      path: level === 0 ? 'PRODUCT' : 'ELEMENT',
    }
  }
  return null
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
  const bounded = (name: string) => text(name)?.slice(0, MAX_AISLE_TEXT) ?? null
  const filter = filterBlockOf(slices)
  const aisleTexts: AisleTexts = {
    navigate: bounded('sLibelleUrlNaviguerRayon'),
    url: bounded('sUrlVoirRayon'),
    category: bounded('sCategorie'),
    ...(filter && { filter }),
  }
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
    availability: number('eDisponibilite'),
    comingSoon: slices.some((slice) => COMING_SOON.test(decodeJsString(slice))),
    thumbnail: text('sUrlVignetteProduit'),
    aisle: number('iIdRayon'),
    family: number('iIdFamille'),
    ...(Object.values(aisleTexts).some((value) => value !== null && value !== undefined) && {
      aisleTexts,
    }),
    ...(Object.values(structured).some((value) => value !== null) ? { structured } : {}),
  }
}

/** Les lectures d'une page : le texte tel quel, puis décodé des entités HTML, puis débarrassé des guillemets échappés. */
export function pageReadings(text: string): string[] {
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
  for (const reading of pageReadings(page)) {
    const count = distinctIds(reading).length
    if (count > bestCount) {
      best = reading
      bestCount = count
    }
  }

  const { products, ids } = located(best)
  // La liste principale (`objContenu`) d'abord, puis les autres listes de la réponse (`objContenuMDD`, variantes…), chacune dans l'ordre de la page.
  const main = mainSpan(best)
  const inMain = (at: number) => main !== null && at >= main.start && at <= main.end
  const read = products.filter(({ raw }) => raw.label1 !== null)
  return {
    products: [...read.filter(({ at }) => inMain(at)), ...read.filter(({ at }) => !inMain(at))].map(
      ({ raw }) => raw,
    ),
    ids,
  }
}

/** Chaque identifiant distinct de [text], à sa première place utile, et le produit qu'il donne (un produit sans libellé n'est pas un résultat). */
function located(text: string): { products: { raw: RawProduct; at: number }[]; ids: number } {
  const byId = new Map<string, { raw: RawProduct; at: number }>()
  for (const found of text.matchAll(ID_PATTERN)) {
    const id = found[1]
    if (!id || found.index === undefined) continue
    const raw = buildProduct(id, candidateSlices(text, found.index))
    const known = byId.get(id)
    if (!known || (known.raw.label1 === null && raw.label1 !== null))
      byId.set(id, { raw, at: found.index })
  }
  return { products: [...byId.values()], ids: byId.size }
}

/** L'objet `objContenu` de la réponse (la liste principale des résultats, relevé du 2026-10-20), `null` s'il n'y est pas. */
function mainSpan(text: string): { start: number; end: number } | null {
  const found = /"objContenu"\s*:\s*\{/.exec(text)
  if (found === null) return null
  const start = found.index + found[0].length - 1
  const end = objectEnd(text, start)
  return end < 0 ? null : { start, end }
}

/**
 * Pour le diagnostic (DRV-647, 0.38.0) : la lecture retenue de la page, et chaque identifiant de produit distinct avec sa place, le produit lu (`null` : pas
 * de libellé) et, s'il n'est pas lu, pourquoi (`SPAN` : l'objet autour n'a pas pu être délimité ; `NO_LABEL` : pas de `sLibelleLigne1`).
 */
export function locateProducts(page: string): {
  text: string
  ids: { id: string; at: number; raw: RawProduct | null; why?: UnreadReason }[]
} {
  let best = page
  let bestCount = -1
  for (const reading of pageReadings(page)) {
    const count = distinctIds(reading).length
    if (count > bestCount) {
      best = reading
      bestCount = count
    }
  }
  const ids = located(best).products.map(({ raw, at }) => {
    if (raw.label1 !== null) return { id: raw.id, at, raw }
    const why: UnreadReason = enclosingObject(best, at) === null ? 'SPAN' : 'NO_LABEL'
    return { id: raw.id, at, raw: null, why }
  })
  return { text: best, ids }
}
