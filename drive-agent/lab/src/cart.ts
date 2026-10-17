// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Panier du magasin : construction de la requête, lecture d'une requête interceptée, résumé de la réponse
// (recherche.md § 2 : `POST panier.aspx?op=1`, champ de formulaire `d` contenant du JSON).
import { EXCERPT_CHARS } from './config'
import { isSensitiveKey, maskEmails, shorten } from './redact'

export interface CartRequest {
  /** 1 : ajouter ou augmenter ; 2 : diminuer ou retirer. */
  action: 1 | 2
  productId: string
  /** Quantité absolue visée (pas une variation) ; 0 avec l'action 2 retire le produit. */
  quantity: number
  deliveryPoint: string
  /** Joint un objet d'analytique vide (`objContexteProvenanceArticle`) : facultatif d'après la source. */
  withContext?: boolean
}

export function cartPayload(request: CartRequest): string {
  const payload: Record<string, unknown> = {
    eTypeAction: request.action,
    iIdProduit: Number(request.productId),
    iQuantite: request.quantity,
    sNoPointLivraison: request.deliveryPoint,
  }
  if (request.withContext) payload.objContexteProvenanceArticle = {}
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
}

function visibleText(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

  if (events === null) {
    lines.push(`Réponse non JSON (${text.length} caractères).`)
    const excerpt = maskEmails(visibleText(text)).slice(0, EXCERPT_CHARS)
    if (excerpt) lines.push(`Début du texte : ${excerpt}`)
    return { lines, blocked }
  }

  lines.push(`Réponse JSON : ${events.length} évènement(s).`)
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
  return { lines, blocked }
}
