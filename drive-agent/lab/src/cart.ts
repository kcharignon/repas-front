// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Panier du magasin : construction de la requête, lecture d'une requête interceptée, résumé de la réponse
// (recherche.md § 2 : `POST panier.aspx?op=1`, champ de formulaire `d` contenant du JSON).
import { EXCERPT_CHARS } from './config'
import { isSensitiveKey, maskEmails, shorten } from './redact'

export interface CartRequest {
  /** 1 : ajouter ou augmenter ; 2 : diminuer ou retirer. */
  action: 1 | 2
  productId: string
  /** Quantité visée ; 0 avec l'action 2 retire le produit (le sens des autres valeurs est l'objet de l'essai 3b). */
  quantity: number
  deliveryPoint: string
  /** Dernier mot cherché (essai 2) : le site le joint au contexte de l'ajout ; vide s'il n'y en a pas. */
  searchText?: string | null
  /** Variante de diagnostic : n'envoie pas l'objet de contexte à l'ajout (le site, lui, l'envoie toujours). */
  withoutContext?: boolean
}

/**
 * Le champ `d` tel que le site l'envoie (relevé DRV-007) : identifiant de produit en TEXTE ; à l'ajout seulement,
 * l'objet `objContexteProvenanceArticle` (origine 4, type de page 3, texte cherché, vue 0, « uni-2 »).
 * L'ordre des clés est celui du site.
 */
export function cartPayload(request: CartRequest): string {
  const payload: Record<string, unknown> = {
    eTypeAction: request.action,
    iIdProduit: request.productId,
    iQuantite: request.quantity,
    sNoPointLivraison: request.deliveryPoint,
  }
  if (request.action === 1 && !request.withoutContext) {
    payload.objContexteProvenanceArticle = {
      eOrigine: 4,
      eTypePage: 3,
      sTexteRecherche: request.searchText ?? '',
      eVue: 0,
      sInformationsComplementaires: 'uni-2',
    }
  }
  return JSON.stringify(payload)
}

/** Corps de la requête : un champ de formulaire `d` contenant le JSON encodé. */
export function cartBody(request: CartRequest): string {
  return `d=${encodeURIComponent(cartPayload(request))}`
}

export interface CartRequestView {
  productId: string | null
  action: number | null
  quantity: number | null
}

function formField(body: unknown): string | null {
  if (typeof body === 'string') {
    if (body.trimStart().startsWith('{')) return body
    return new URLSearchParams(body).get('d')
  }
  if (body instanceof URLSearchParams) return body.get('d')
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const value = body.get('d')
    return typeof value === 'string' ? value : null
  }
  return null
}

/** Ce qu'une requête d'ajout au panier demande (identifiant, action, quantité), ou `null` si le corps n'est pas lisible. */
export function parseCartBody(body: unknown): CartRequestView | null {
  const field = formField(body)
  if (field === null) return null
  let data: unknown
  try {
    data = JSON.parse(field)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  const id = record.iIdProduit
  const action = record.eTypeAction
  const quantity = record.iQuantite
  return {
    productId: typeof id === 'number' || typeof id === 'string' ? String(id) : null,
    action: typeof action === 'number' ? action : null,
    quantity: typeof quantity === 'number' ? quantity : null,
  }
}

function flatten(value: unknown, path: string, out: string[], limit: number, depth = 0): void {
  if (out.length >= limit || value === null || value === undefined) return
  if (typeof value === 'object') {
    if (depth >= 4) {
      out.push(`${path}=…`)
      return
    }
    if (Array.isArray(value)) {
      value.slice(0, 10).forEach((item, i) => flatten(item, `${path}[${i}]`, out, limit, depth + 1))
      return
    }
    for (const [key, item] of Object.entries(value)) {
      const here = path ? `${path}.${key}` : key
      if (isSensitiveKey(key)) out.push(`${here}=[masqué]`)
      else flatten(item, here, out, limit, depth + 1)
    }
    return
  }
  out.push(`${path}=${shorten(value, 60)}`)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Liste d'évènements d'une réponse : tableau direct, enveloppe `{d: …}` de .NET, ou premier tableau de l'objet. */
function eventsOf(parsed: unknown, depth = 0): unknown[] | null {
  if (depth > 3) return null
  if (typeof parsed === 'string') {
    const inner = parseJson(parsed)
    return inner === undefined ? null : eventsOf(inner, depth + 1)
  }
  if (Array.isArray(parsed)) return parsed
  if (typeof parsed === 'object' && parsed !== null) {
    const record = parsed as Record<string, unknown>
    if ('d' in record) return eventsOf(record.d, depth + 1)
    const list = Object.values(record).find(Array.isArray)
    return list ?? [parsed]
  }
  return null
}

function findProductObjects(value: unknown, productId: string, found: unknown[], depth = 0): void {
  if (depth > 6 || found.length >= 3 || typeof value !== 'object' || value === null) return
  if (Array.isArray(value)) {
    value.forEach((item) => findProductObjects(item, productId, found, depth + 1))
    return
  }
  const record = value as Record<string, unknown>
  if (String(record.iIdProduit) === productId) found.push(record)
  Object.values(record).forEach((item) => findProductObjects(item, productId, found, depth + 1))
}

export interface CartSummary {
  lines: string[]
  /** Blocage de l'anti-bot reconnu (403, 429, page de contrôle). */
  blocked: boolean
  /** Réponse que Leclerc n'a pas comprise : code hors 2xx ou texte qui n'est pas du JSON, sans être un blocage (404, page d'erreur…). */
  rejected: boolean
  /** Quantité du produit testé au panier après l'écriture (`iQtePanier`) ; `null` si la réponse ne la dit pas. */
  obtained: number | null
  /** Vrai : la quantité est déduite de l'absence du produit dans `lstProduitsLight` (il n'est plus au panier). */
  obtainedByAbsence: boolean
}

function visibleText(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(value)) {
    return Number(value.replace(',', '.'))
  }
  return null
}

/** Première valeur d'une clé : dans l'objet lui-même d'abord, puis plus profond. */
function findKey(value: unknown, key: string, depth = 0): unknown {
  if (depth > 6 || typeof value !== 'object' || value === null) return undefined
  const record = asRecord(value)
  if (record) {
    if (key in record) return record[key]
    for (const item of Object.values(record)) {
      const found = findKey(item, key, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }
  for (const item of value as unknown[]) {
    const found = findKey(item, key, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

function startsWithPanier(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('Panier')
}

/** L'évènement d'état du panier : `eTypeEvenement` 1 dont l'identifiant (`sIdUnique`) commence par « Panier ». */
function findCartEvent(events: readonly unknown[]): Record<string, unknown> | null {
  const typed = events.map(asRecord).filter((record) => record?.eTypeEvenement === 1)
  const named = typed.find(
    (record) => startsWithPanier(record?.sIdUnique) || startsWithPanier(record?.sNomEvenement),
  )
  const withList = typed.find((record) => findKey(record, 'lstProduitsLight') !== undefined)
  return named ?? withList ?? null
}

interface CartReading {
  lines: string[]
  obtained: number | null
  byAbsence: boolean
}

/** Ce que l'évènement `Panier…` dit du produit testé et du panier : `lstProduitsLight`, `iQuantitePanier`, `sTotalAPayer`. */
function readCart(events: readonly unknown[], productId: string): CartReading {
  const event = findCartEvent(events)
  if (event === null) {
    return {
      lines: ["Panier : pas d'évènement « Panier… », quantité obtenue non lue."],
      obtained: null,
      byAbsence: false,
    }
  }
  const lines: string[] = []
  const list = findKey(event, 'lstProduitsLight')
  let obtained: number | null = null
  let byAbsence = false
  if (!Array.isArray(list)) {
    lines.push('Panier : lstProduitsLight introuvable, quantité obtenue non lue.')
  } else {
    const entry = list
      .map(asRecord)
      .find((item) => item !== null && String(item.iIdProduit) === productId)
    if (entry) {
      obtained = asNumber(entry.iQtePanier)
      const available = asNumber(entry.iQteDisponible) ?? '?'
      const max = asNumber(entry.fQuantiteMax) ?? '?'
      lines.push(
        `Quantité obtenue du produit ${productId} (iQtePanier) : ${obtained ?? 'non lue'} ; iQteDisponible ${available} ; fQuantiteMax ${max}`,
      )
    } else {
      obtained = 0
      byAbsence = true
      lines.push(
        `Produit ${productId} absent de lstProduitsLight (${list.length} au panier) : quantité obtenue 0`,
      )
    }
  }
  const articles = asNumber(findKey(event, 'iQuantitePanier')) ?? '?'
  const total = findKey(event, 'sTotalAPayer')
  const totalText =
    typeof total === 'string' || typeof total === 'number' ? shorten(total, 40) : '?'
  lines.push(`Panier : iQuantitePanier ${articles} ; sTotalAPayer ${totalText}`)
  return { lines, obtained, byAbsence }
}

/** Résume la réponse du panier sans jamais en recopier un cookie, un jeton ou une donnée de compte. */
export function summarizeCartResponse(
  text: string,
  status: number,
  productId: string,
): CartSummary {
  const blocked = status === 403 || status === 429 || /captcha-delivery|datadome/i.test(text)
  const lines: string[] = []
  const parsed = parseJson(text.trim())
  const events = parsed === undefined ? null : eventsOf(parsed)
  const rejected = !blocked && (status < 200 || status >= 300 || events === null)

  if (events === null) {
    lines.push(`Réponse non JSON (${text.length} caractères).`)
    const excerpt = maskEmails(visibleText(text)).slice(0, EXCERPT_CHARS)
    if (excerpt) lines.push(`Début du texte : ${excerpt}`)
    return { lines, blocked, rejected, obtained: null, obtainedByAbsence: false }
  }

  lines.push(`Réponse JSON : ${events.length} évènement(s).`)
  const cart = readCart(events, productId)
  lines.push(...cart.lines)
  events.slice(0, 8).forEach((event, index) => {
    const pairs: string[] = []
    flatten(event, '', pairs, 14)
    const type =
      typeof event === 'object' && event !== null && 'eTypeEvenement' in event
        ? `type ${String((event as Record<string, unknown>).eTypeEvenement)}`
        : 'type inconnu'
    const mentionsCart = /panier/i.test(JSON.stringify(event).slice(0, 400))
    lines.push(
      `- évènement ${index + 1} (${type}${mentionsCart ? ', panier' : ''}) : ${pairs.join(' ; ') || 'vide'}`,
    )
  })
  if (events.length > 8) lines.push(`- … ${events.length - 8} évènement(s) de plus non détaillés.`)

  const own: unknown[] = []
  findProductObjects(events, productId, own)
  own.forEach((item) => {
    const pairs: string[] = []
    flatten(item, '', pairs, 12)
    lines.push(`Produit ${productId} dans la réponse : ${pairs.join(' ; ')}`)
  })
  return {
    lines,
    blocked,
    rejected,
    obtained: cart.obtained,
    obtainedByAbsence: cart.byAbsence,
  }
}
