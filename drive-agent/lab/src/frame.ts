// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Essai 6 : repérer le produit que l'utilisateur ajoute avec l'interface de Leclerc dans le cadre de l'essai 5.
// Deux méthodes armées ensemble, pour dire laquelle fonctionne :
//   - XHR / fetch : on enveloppe les fonctions d'envoi du cadre et on lit la requête vers `panier.aspx` ;
//   - DOM : on observe les changements de la page du cadre après un toucher, et on cherche à quel produit ils se rattachent.
// Rien n'est lu dans les réponses, les en-têtes ni les cookies ; rien ne sort du cadre.
import { parseCartBody } from './cart'
import { extractProducts, type Product } from './parse'

export type DetectionMethod = 'XHR' | 'fetch' | 'DOM'

export interface AddEvent {
  method: DetectionMethod
  productId: string | null
  label: string | null
  detail: string
}

export function catalogOf(products: readonly Product[]): Map<string, Product> {
  return new Map(products.map((product) => [product.id, product]))
}

export interface ArmOptions {
  now?: () => number
  /** Attente avant d'analyser une rafale de changements du DOM. */
  debounceMs?: number
  /** Un changement du DOM ne compte que s'il suit un toucher de moins de ce nombre de millisecondes. */
  interactionWindowMs?: number
}

const CART_URL = /panier\.aspx/i
const IGNORED_ATTRIBUTES = new Set([
  'src',
  'srcset',
  'style',
  'loading',
  'width',
  'height',
  'tabindex',
])
const MAX_DEPTH = 8

/** Produit auquel se rattache un élément : un attribut qui contient son identifiant, ou son libellé dans le texte voisin. */
export function matchProduct(
  start: Node,
  catalog: ReadonlyMap<string, Product>,
): { product: Product; via: string } | null {
  let node: Element | null = start.nodeType === 1 ? (start as Element) : start.parentElement
  // On s'arrête avant le corps de la page : un conteneur aussi large ne désigne aucun produit en particulier.
  for (
    let depth = 0;
    node &&
    node !== node.ownerDocument.body &&
    node !== node.ownerDocument.documentElement &&
    depth < MAX_DEPTH;
    depth++, node = node.parentElement
  ) {
    for (const attribute of Array.from(node.attributes)) {
      for (const token of attribute.value.match(/(?<!\d)\d{4,12}(?!\d)/g) ?? []) {
        const product = catalog.get(token)
        if (product) return { product, via: `attribut « ${attribute.name} »` }
      }
    }
    const text = node.textContent ?? ''
    if (text.length > 0 && text.length <= 600) {
      for (const product of catalog.values()) {
        if (product.label1 && product.label1.length >= 6 && text.includes(product.label1)) {
          return { product, via: 'libellé dans le texte voisin' }
        }
      }
    }
  }
  return null
}

type Sender = (this: unknown, ...args: unknown[]) => unknown

/**
 * Arme les deux méthodes sur la fenêtre du cadre. Renvoie la fonction qui retire les enveloppes.
 * `onEvent` reçoit un évènement par ajout repéré.
 */
export function armFrame(
  frame: Window & typeof globalThis,
  catalog: ReadonlyMap<string, Product>,
  onEvent: (event: AddEvent) => void,
  options: ArmOptions = {},
): () => void {
  const now = options.now ?? Date.now
  const debounceMs = options.debounceMs ?? 300
  const interactionWindowMs = options.interactionWindowMs ?? 5000

  const describe = (method: 'XHR' | 'fetch', body: unknown): AddEvent => {
    const request = parseCartBody(body)
    if (!request) {
      return {
        method,
        productId: null,
        label: null,
        detail: 'requête vers le panier, corps illisible',
      }
    }
    const product = request.productId ? catalog.get(request.productId) : undefined
    const action =
      request.action === 1 ? 'ajout' : request.action === 2 ? 'retrait' : 'action inconnue'
    return {
      method,
      productId: request.productId,
      label: product?.label1 ?? null,
      detail: `${action}, quantité visée ${request.quantity ?? '?'}`,
    }
  }

  // XMLHttpRequest
  const xhrProto = frame.XMLHttpRequest.prototype
  const originalOpen = xhrProto.open as unknown as Sender
  const originalSend = xhrProto.send as unknown as Sender
  const urls = new WeakMap<object, string>()
  const wrappedOpen = function (this: object, ...args: unknown[]) {
    urls.set(this, String(args[1]))
    return Reflect.apply(originalOpen, this, args)
  }
  const wrappedSend = function (this: object, ...args: unknown[]) {
    const url = urls.get(this)
    if (url !== undefined && CART_URL.test(url)) onEvent(describe('XHR', args[0]))
    return Reflect.apply(originalSend, this, args)
  }
  xhrProto.open = wrappedOpen as unknown as typeof xhrProto.open
  xhrProto.send = wrappedSend as unknown as typeof xhrProto.send

  // fetch
  const originalFetch = frame.fetch as unknown as Sender | undefined
  const wrappedFetch = function (this: unknown, ...args: unknown[]) {
    const input = args[0]
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (typeof url === 'string' && CART_URL.test(url)) {
      const init = args[1] as RequestInit | undefined
      onEvent(describe('fetch', init?.body))
    }
    return Reflect.apply(originalFetch as Sender, frame, args)
  }
  if (originalFetch) frame.fetch = wrappedFetch as unknown as typeof frame.fetch

  // DOM
  let lastTouch = Number.NEGATIVE_INFINITY
  const touch = () => {
    lastTouch = now()
  }
  const touches = ['pointerdown', 'click', 'touchend', 'keydown'] as const
  const doc = frame.document
  touches.forEach((name) => doc.addEventListener(name, touch, true))

  let pending = new Set<Node>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    timer = null
    const targets = pending
    pending = new Set()
    const seen = new Set<string>()
    let unmatched = false
    for (const target of targets) {
      const match = matchProduct(target, catalog)
      if (!match) {
        unmatched = true
        continue
      }
      if (seen.has(match.product.id)) continue
      seen.add(match.product.id)
      onEvent({
        method: 'DOM',
        productId: match.product.id,
        label: match.product.label1,
        detail: `changement de la page, rattaché au produit par ${match.via}`,
      })
    }
    if (unmatched && seen.size === 0) {
      onEvent({
        method: 'DOM',
        productId: null,
        label: null,
        detail: 'changement de la page, produit non reconnu',
      })
    }
  }
  const observer = new frame.MutationObserver((records) => {
    if (now() - lastTouch > interactionWindowMs) return
    for (const record of records) {
      if (record.type === 'attributes' && IGNORED_ATTRIBUTES.has(record.attributeName ?? ''))
        continue
      pending.add(record.target)
    }
    if (pending.size > 0 && timer === null) timer = setTimeout(flush, debounceMs)
  })
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })

  return () => {
    observer.disconnect()
    if (timer !== null) clearTimeout(timer)
    touches.forEach((name) => doc.removeEventListener(name, touch, true))
    if (xhrProto.open === (wrappedOpen as unknown))
      xhrProto.open = originalOpen as unknown as typeof xhrProto.open
    if (xhrProto.send === (wrappedSend as unknown))
      xhrProto.send = originalSend as unknown as typeof xhrProto.send
    if (originalFetch && frame.fetch === (wrappedFetch as unknown)) {
      frame.fetch = originalFetch as unknown as typeof frame.fetch
    }
  }
}

export function formatEvent(event: AddEvent): string {
  const product = event.productId
    ? `produit ${event.productId}${event.label ? ` « ${event.label} »` : ' (libellé inconnu)'}`
    : 'produit non identifié'
  return `[${event.method}] ${product} — ${event.detail}`
}

/** Quelles méthodes ont repéré quelque chose, et combien de fois. */
export function summarizeEvents(events: readonly AddEvent[]): string {
  if (events.length === 0) return 'Aucun ajout repéré pour l’instant.'
  const methods: DetectionMethod[] = ['XHR', 'fetch', 'DOM']
  const counts = methods
    .map((method) => ({ method, count: events.filter((event) => event.method === method).length }))
    .filter(({ count }) => count > 0)
    .map(({ method, count }) => `${method} (${count})`)
  const identified = events.filter((event) => event.productId !== null).length
  return `Méthode(s) qui ont réagi : ${counts.join(', ')} ; produit identifié dans ${identified} cas sur ${events.length}.`
}

export interface FrameReport {
  lines: string[]
  /** Le contenu du cadre est lisible (même origine). */
  accessible: boolean
  /** Le cadre est refusé, vide ou redirigé : il ne servira pas à choisir un produit. */
  refused: boolean
  products: Product[]
}

const BLOCK_WORDS = /captcha|access denied|acc[eè]s refus[eé]|forbidden/i

/** Ce que l'on peut dire d'un cadre qui vient de se charger : lisible, vide, redirigé, bloqué, produits visibles. */
export function inspectFrame(
  frame: Pick<HTMLIFrameElement, 'contentDocument' | 'contentWindow'>,
  expectedPath: string,
  parentPath: string,
): FrameReport {
  const lines = ['Cadre : évènement « load » reçu.']
  let doc: Document | null = null
  try {
    doc = frame.contentDocument
  } catch {
    doc = null
  }
  if (!doc) {
    lines.push(
      'Contenu du cadre inaccessible (page d’erreur du navigateur ou autre origine) : refus probable (X-Frame-Options ou frame-ancestors).',
    )
    return { lines, accessible: false, refused: true, products: [] }
  }
  lines.push('Contenu du cadre accessible (même origine) : oui.')

  let path: string | null = null
  try {
    path = frame.contentWindow?.location.pathname ?? null
  } catch {
    path = null
  }
  lines.push(`Chemin dans le cadre : ${path ?? 'illisible'}`)

  let refused = false
  if (
    path !== null &&
    path === parentPath &&
    !path.toLowerCase().endsWith(expectedPath.toLowerCase())
  ) {
    lines.push('Le cadre a été redirigé vers la page parente : refus.')
    refused = true
  } else if (path !== null && !path.toLowerCase().endsWith(expectedPath.toLowerCase())) {
    lines.push(`Le cadre n’est pas sur la page attendue (${expectedPath}) : redirection ?`)
  }

  const text = doc.body?.textContent ?? ''
  if (!doc.body || doc.body.children.length === 0 || text.trim().length < 40) {
    lines.push('Page du cadre vide ou presque : refus ou chargement incomplet.')
    refused = true
  }
  if (BLOCK_WORDS.test(text.slice(0, 3000))) {
    lines.push('Texte de blocage reconnu dans le cadre (captcha, accès refusé…).')
  }

  const products = extractProducts(doc.documentElement.outerHTML).products
  lines.push(`Produits reconnus dans le cadre : ${products.length}`)
  return { lines, accessible: true, refused, products }
}
