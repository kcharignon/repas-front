// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Écriture au panier des essais 3, 3b et 12 : un seul produit, confirmation avant chaque écriture, aucune boucle.
import { cartBody, summarizeCartResponse, type CartSummary } from '../cart'
import { cartAddressNote, cartUrl, findDeliveryPoint, type StoreInfo } from '../store'
import { FORM_HEADERS, postForm, type Reply } from '../http'
import type { Product } from '../parse'
import { append, clear, h } from '../ui/dom'
import type { ScreenContext } from '../ui/types'
import { button, confirmBox, labelled, type ResultsPanel } from '../ui/widgets'
import { CONFIRM_NOTE, cartVerdict, describeReply, needStore } from './common'

/** Une seule écriture à la fois par banc : les requêtes d'écriture ne se chevauchent jamais. */
const writing = new WeakSet<object>()

export const BUSY = ['Une requête au panier est déjà en cours : attends sa fin.']

/** Prend le verrou d'écriture du banc ; `null` s'il est déjà pris. Appeler la fonction rendue le libère. */
export function lockWriting(ctx: ScreenContext): (() => void) | null {
  if (writing.has(ctx.state)) return null
  writing.add(ctx.state)
  return () => {
    writing.delete(ctx.state)
  }
}

export interface AddCheck {
  allowed: boolean
  warnings: string[]
}

/** Contrôle avant l'écriture : jamais sur un produit déjà au panier (le retrait y mettrait sa quantité à 0). */
export function checkBeforeAdd(products: readonly Product[], productId: string): AddCheck {
  const known = products.find((product) => product.id === productId)
  if (known && (known.inCart ?? 0) > 0) {
    return {
      allowed: false,
      warnings: [
        `Ce produit est déjà dans ton panier (quantité ${known.inCart}). Le banc n'y touche pas : choisis un autre produit.`,
      ],
    }
  }
  if (!known) {
    return {
      allowed: true,
      warnings: [
        "Produit absent de la dernière recherche : le banc ne peut pas vérifier ton panier. Continue seulement s'il n'y est pas (le retrait mettrait sa quantité à 0).",
      ],
    }
  }
  if (known.stock === 0) {
    return {
      allowed: true,
      warnings: ['Le stock lu est 0 : c’est justement ce que cet essai veut observer.'],
    }
  }
  return { allowed: true, warnings: [] }
}

export interface CartCall {
  reply: Reply
  /** `null` si la requête n'a pas abouti (réseau coupé). */
  summary: CartSummary | null
  /** 403/429 ou page de contrôle : on s'arrête. */
  blocked: boolean
  /** Message sous la réponse : blocage, ou requête non comprise (404, page d'erreur…). Vide si tout va bien. */
  verdict: string[]
  /** D'où vient le point de livraison envoyé (sa valeur n'est jamais affichée). */
  pointFrom: 'page' | 'adresse'
  /** Diagnostic : adresse du panier, noms des en-têtes envoyés (sans valeurs) et longueur du corps. */
  request: string[]
}

/** Adresse du panier, noms des en-têtes posés par le banc (le navigateur en ajoute d'autres) et Content-Length : le corps est en ASCII. */
export function requestLines(body: string, store: StoreInfo): string[] {
  return [
    cartAddressNote(store),
    `En-têtes posés par le banc : ${Object.keys(FORM_HEADERS).join(', ')} (+ ceux du navigateur) ; Content-Length du corps : ${body.length}`,
  ]
}

export interface CartWrite {
  productId: string
  action: 1 | 2
  quantity: number
  /** Variante de diagnostic : sans l'objet de contexte à l'ajout. */
  withoutContext?: boolean
}

/** Une écriture au panier : point de livraison lu dans la page, requête du site, réponse résumée. */
export async function sendCart(
  ctx: ScreenContext,
  store: StoreInfo,
  write: CartWrite,
): Promise<CartCall> {
  const point = findDeliveryPoint(ctx.env.win.document.documentElement.outerHTML, store)
  const body = cartBody({
    action: write.action,
    productId: write.productId,
    quantity: write.quantity,
    deliveryPoint: point.value,
    searchText: ctx.state.lastQuery,
    withoutContext: write.withoutContext,
  })
  const request = requestLines(body, store)
  const reply = await postForm(ctx.env.fetch, cartUrl(store), body, ctx.env.now)
  if (reply.error !== null) {
    return { reply, summary: null, blocked: false, verdict: [], pointFrom: point.from, request }
  }
  const summary = summarizeCartResponse(reply.text, reply.status, write.productId)
  return {
    reply,
    summary,
    blocked: reply.blocked || summary.blocked,
    verdict: cartVerdict(reply, summary),
    pointFrom: point.from,
    request,
  }
}

export function pointLine(from: 'page' | 'adresse'): string {
  return from === 'page'
    ? 'Point de livraison : lu dans la page.'
    : "Point de livraison : absent de la page, repris de l'adresse (peut être faux)."
}

/** Le contexte de recherche joint à l'ajout, en clair (le texte cherché n'a rien de personnel). */
export function contextText(searchText: string | null, withoutContext: boolean): string {
  if (withoutContext) return 'sans contexte (diagnostic)'
  return `contexte de recherche « ${searchText ?? ''} »`
}

export interface AddOffer {
  productId: string
  label: string | null
  /** Appelé après la réponse de l'ajout (essai 12 : relire la quantité au panier). */
  afterAdd?: (store: StoreInfo) => Promise<void>
}

export function labelOf(label: string | null): string {
  return label ? ` « ${label} »` : ''
}

/** Sélecteur « produit de la dernière recherche » qui remplit les champs voulus. */
export function productPicker(
  ctx: ScreenContext,
  onPick: (product: Product) => void,
): HTMLElement | null {
  const products = ctx.state.lastProducts.slice(0, 12)
  if (products.length === 0) return null
  const select = h(
    'select',
    {},
    h('option', { text: '— choisir un produit de la dernière recherche —', attrs: { value: '' } }),
  )
  products.forEach((product, i) =>
    select.appendChild(
      h('option', {
        text: `${i + 1}. ${product.label1 ?? product.id} (${product.unitPriceText ?? '?'})`,
        attrs: { value: product.id },
      }),
    ),
  )
  select.addEventListener('change', () => {
    const picked = products.find((product) => product.id === select.value)
    if (picked) onPick(picked)
  })
  return labelled('Produit de la dernière recherche (facultatif)', select)
}

export interface Preflight {
  id: string
  store: StoreInfo
  warnings: string[]
}

/** Contrôles communs avant toute demande d'écriture : magasin, verrou, identifiant, produit déjà au panier. */
export function preflight(
  ctx: ScreenContext,
  panel: ResultsPanel,
  productId: string,
): Preflight | null {
  const store = needStore(ctx, panel)
  if (!store) return null
  if (writing.has(ctx.state)) {
    panel.set(BUSY)
    return null
  }
  const id = productId.trim()
  if (!/^\d{1,12}$/.test(id)) {
    panel.set([
      "Identifiant invalide : des chiffres seulement (12 au plus), comme celui vu à l'essai 2.",
    ])
    return null
  }
  const check = checkBeforeAdd(ctx.state.lastProducts, id)
  if (!check.allowed) {
    panel.set(check.warnings)
    return null
  }
  return { id, store, warnings: check.warnings }
}

/** Propose l'ajout d'un produit : contrôle, puis confirmation explicite, puis écriture, puis proposition de retrait. */
export function offerAdd(
  ctx: ScreenContext,
  panel: ResultsPanel,
  zone: HTMLElement,
  offer: AddOffer,
): void {
  const checked = preflight(ctx, panel, offer.productId)
  if (!checked) return
  const { id, store, warnings } = checked

  clear(zone)
  const withoutContext = h('input', { attrs: { type: 'checkbox' } })
  append(
    zone,
    h(
      'label',
      { class: 'inline' },
      withoutContext,
      "Diagnostic : sans l'objet de contexte (le site, lui, le joint)",
    ),
  )
  confirmBox(
    zone,
    {
      message: [
        `Tu vas ajouter 1 exemplaire du produit ${id}${labelOf(offer.label)} à ton VRAI panier Leclerc.`,
        ...warnings,
        CONFIRM_NOTE,
      ],
      confirmLabel: 'Oui, ajouter 1 au panier',
    },
    () => {
      void write(ctx, panel, zone, store, offer, id, withoutContext.checked)
    },
  )
}

async function write(
  ctx: ScreenContext,
  panel: ResultsPanel,
  zone: HTMLElement,
  store: StoreInfo,
  offer: AddOffer,
  id: string,
  withoutContext: boolean,
): Promise<void> {
  clear(zone)
  writing.add(ctx.state)
  try {
    await writeOnce(ctx, panel, zone, store, offer, id, withoutContext)
  } finally {
    writing.delete(ctx.state)
  }
}

async function writeOnce(
  ctx: ScreenContext,
  panel: ResultsPanel,
  zone: HTMLElement,
  store: StoreInfo,
  offer: AddOffer,
  id: string,
  withoutContext: boolean,
): Promise<void> {
  panel.set([`Ajout du produit ${id}${labelOf(offer.label)}, quantité visée 1…`])
  const call = await sendCart(ctx, store, { productId: id, action: 1, quantity: 1, withoutContext })
  const lines = [
    `Ajout du produit ${id}${labelOf(offer.label)} : action 1, quantité visée 1, ${contextText(ctx.state.lastQuery, withoutContext)}`,
    describeReply(call.reply),
    pointLine(call.pointFrom),
    ...call.request,
  ]
  if (call.summary === null) {
    panel.set(lines)
    return
  }
  lines.push(...call.summary.lines, ...call.verdict)
  ctx.state.lastAdded = { productId: id, label: offer.label }
  panel.set(lines)
  if (call.blocked) return

  if (offer.afterAdd) await offer.afterAdd(store)
  append(
    zone,
    h('p', {
      text: "Regarde ton panier sur le site (et dans l'appli Leclerc Drive). Puis retire le produit.",
    }),
    button(
      'Retirer ce produit du panier…',
      () => askRemove(ctx, panel, zone, store, id, offer.label),
      'danger',
    ),
  )
}

function askRemove(
  ctx: ScreenContext,
  panel: ResultsPanel,
  zone: HTMLElement,
  store: StoreInfo,
  id: string,
  label: string | null,
): void {
  confirmBox(
    zone,
    {
      message: [
        `Tu vas retirer le produit ${id}${labelOf(label)} de ton panier Leclerc (quantité mise à 0).`,
        CONFIRM_NOTE,
      ],
      confirmLabel: 'Oui, retirer du panier',
      danger: true,
    },
    () => {
      void remove(ctx, panel, zone, store, id, label)
    },
  )
}

async function remove(
  ctx: ScreenContext,
  panel: ResultsPanel,
  zone: HTMLElement,
  store: StoreInfo,
  id: string,
  label: string | null,
): Promise<void> {
  clear(zone)
  if (writing.has(ctx.state)) {
    panel.add('', ...BUSY)
    return
  }
  writing.add(ctx.state)
  try {
    await removeOnce(ctx, panel, store, id, label)
  } finally {
    writing.delete(ctx.state)
  }
}

async function removeOnce(
  ctx: ScreenContext,
  panel: ResultsPanel,
  store: StoreInfo,
  id: string,
  label: string | null,
): Promise<void> {
  panel.add('', `Retrait du produit ${id}${labelOf(label)} : action 2, quantité 0…`)
  const call = await sendCart(ctx, store, { productId: id, action: 2, quantity: 0 })
  const lines = [describeReply(call.reply), ...call.request]
  if (call.summary !== null) {
    lines.push(...call.summary.lines, ...call.verdict)
    if (call.verdict.length === 0) {
      lines.push('Retrait demandé. Vérifie sur le site que le panier est revenu comme avant.')
    }
  }
  panel.add(...lines)
}
