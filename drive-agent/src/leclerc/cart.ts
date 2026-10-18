// Le panier du magasin : `POST panier.aspx?op=1`, un champ de formulaire `d` contenant du JSON (recherche.md § 2 et DRV-007 du dépôt
// back, forme relevée sur le site le 2026-10-17). La quantité est **absolue** dans les deux sens : rejouer une requête ne double rien.
import { LeclercError } from './errors'

/** Les en-têtes du site pour le panier : le navigateur ajoute les siens (`Origin`, `Referer`, cookies…). `zcwb` est obligatoire. */
export const CART_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  Accept: '*/*',
  'X-Requested-With': 'XMLHttpRequest',
  zcwb: 'ajax-manager',
}

/** La quantité maximale au panier. */
export const MAX_QUANTITY = 99

export interface CartRequest {
  productId: string
  /** Quantité visée au panier : `0` retire le produit. */
  quantity: number
  /** `sNoPointLivraison`, lu dans la page. */
  deliveryPoint: string
  /** Dernier mot cherché : le site le joint au contexte de l'ajout. */
  searchText: string
}

/**
 * Le champ `d` tel que le site l'envoie : identifiant de produit en TEXTE ; à l'ajout seulement, l'objet
 * `objContexteProvenanceArticle` (origine 4, type de page 3, texte cherché, vue 0, « uni-2 »). Le retrait (`eTypeAction` 2,
 * quantité 0) n'a pas de contexte. L'ordre des clés est celui du site.
 */
export function cartPayload(request: CartRequest): string {
  if (request.quantity === 0) {
    return JSON.stringify({
      eTypeAction: 2,
      iIdProduit: request.productId,
      iQuantite: 0,
      sNoPointLivraison: request.deliveryPoint,
    })
  }
  return JSON.stringify({
    eTypeAction: 1,
    iIdProduit: request.productId,
    iQuantite: request.quantity,
    sNoPointLivraison: request.deliveryPoint,
    objContexteProvenanceArticle: {
      eOrigine: 4,
      eTypePage: 3,
      sTexteRecherche: request.searchText,
      eVue: 0,
      sInformationsComplementaires: 'uni-2',
    },
  })
}

/** Le corps de la requête : un champ de formulaire `d` contenant le JSON encodé. */
export function cartBody(request: CartRequest): string {
  return `d=${encodeURIComponent(cartPayload(request))}`
}

/** Ce que le site dit du panier après une écriture. */
export interface CartReading {
  /** Quantité du produit au panier (`iQtePanier` de `lstProduitsLight`) ; 0 s'il n'y figure plus. */
  obtained: number
  /** Nombre d'articles du panier (`iQuantitePanier`), `null` si la réponse ne le dit pas. */
  items: number | null
  /** Total du panier en centimes (`sTotalAPayer`), `null` si la réponse ne le dit pas ou s'il n'est pas lisible. */
  totalCents: number | null
}

/** « 12,34 € » (ou « 1 234,56 € ») donne 1234 ; tout autre texte, `null` (le total ne sert qu'à comparer deux états du panier). */
export function parseTotal(value: unknown): number | null {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null
  if (typeof value !== 'string') return null
  const found = /^(\d{1,7})(?:[.,](\d{1,2}))?(?:€|eur|euros)?$/i.exec(value.replace(/\s/g, ''))
  return found?.[1] ? Number(found[1]) * 100 + Number((found[2] ?? '').padEnd(2, '0')) : null
}

/**
 * Le total du panier lu dans le texte d'une page du magasin (`sTotalAPayer`, entre guillemets, dans le JSON qu'elle embarque), en
 * centimes ; `null` s'il n'y figure pas ou si ce n'est pas un montant.
 */
export function readPageTotal(pageText: string): number | null {
  const found = /["']?sTotalAPayer["']?\s*[:=]\s*(?:"([^"\\]{1,24})"|'([^'\\]{1,24})')/.exec(
    pageText.replace(/&quot;/g, '"'),
  )
  return parseTotal(found?.[1] ?? found?.[2])
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(value))
    return Number(value.replace(',', '.'))
  return null
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** La liste d'évènements d'une réponse : tableau direct, enveloppe `{d: …}` de .NET (éventuellement en texte), ou premier tableau. */
function eventsOf(parsed: unknown, depth = 0): unknown[] | null {
  if (depth > 3) return null
  if (typeof parsed === 'string') {
    const inner = parseJson(parsed)
    return inner === undefined ? null : eventsOf(inner, depth + 1)
  }
  if (Array.isArray(parsed)) return parsed
  const record = asRecord(parsed)
  if (!record) return null
  if ('d' in record) return eventsOf(record.d, depth + 1)
  return Object.values(record).find(Array.isArray) ?? [parsed]
}

/** La première valeur d'une clé : dans l'objet lui-même d'abord, puis plus profond. */
function findKey(value: unknown, key: string, depth = 0): unknown {
  if (depth > 6 || typeof value !== 'object' || value === null) return undefined
  const record = asRecord(value)
  if (record && key in record) return record[key]
  const children = record ? Object.values(record) : (value as unknown[])
  for (const child of children) {
    const found = findKey(child, key, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

const startsWithPanier = (value: unknown) => typeof value === 'string' && value.startsWith('Panier')

/** L'évènement d'état du panier : `eTypeEvenement` 1 dont l'identifiant (`sIdUnique`) commence par « Panier ». */
function findCartEvent(events: readonly unknown[]): Record<string, unknown> | null {
  const typed = events.map(asRecord).filter((record) => record?.eTypeEvenement === 1)
  const named = typed.find(
    (record) => startsWithPanier(record?.sIdUnique) || startsWithPanier(record?.sNomEvenement),
  )
  return named ?? typed.find((record) => findKey(record, 'lstProduitsLight') !== undefined) ?? null
}

/**
 * Lit la réponse d'une écriture au panier : la quantité obtenue du produit et le nombre d'articles.
 *
 * @throws {LeclercError} `CONTRACT_CHANGED` si la réponse n'est pas du JSON, n'a pas d'évènement panier ou pas de `lstProduitsLight`.
 */
export function readCartResponse(text: string, productId: string): CartReading {
  const parsed = parseJson(text.trim())
  const events = parsed === undefined ? null : eventsOf(parsed)
  const event = events && findCartEvent(events)
  const list = event ? findKey(event, 'lstProduitsLight') : undefined
  if (!event || !Array.isArray(list)) throw new LeclercError('CONTRACT_CHANGED')
  const entry = list
    .map(asRecord)
    .find((item) => item !== null && String(item.iIdProduit) === productId)
  const obtained = entry ? asNumber(entry.iQtePanier) : 0
  if (obtained === null) throw new LeclercError('CONTRACT_CHANGED')
  return {
    obtained,
    items: asNumber(findKey(event, 'iQuantitePanier')),
    totalCents: parseTotal(findKey(event, 'sTotalAPayer')),
  }
}
