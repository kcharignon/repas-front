// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Écriture au panier des essais 3 et 12 : un seul produit, quantité 1, confirmation avant chaque écriture, aucune boucle.
import { cartBody, summarizeCartResponse } from '../cart'
import { cartUrl, findDeliveryPoint, type StoreInfo } from '../store'
import { postForm } from '../http'
import type { Product } from '../parse'
import { append, clear, h } from '../ui/dom'
import type { ScreenContext } from '../ui/types'
import { button, confirmBox, labelled, type ResultsPanel } from '../ui/widgets'
import { BLOCK_MESSAGE, describeReply, needStore } from './common'

/** Une seule écriture à la fois par banc : les requêtes d'écriture ne se chevauchent jamais. */
const writing = new WeakSet<object>()

const BUSY = ['Une requête au panier est déjà en cours : attends sa fin.']

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

export interface AddOffer {
  productId: string
  label: string | null
  /** Appelé après la réponse de l'ajout (essai 12 : relire la quantité au panier). */
  afterAdd?: (store: StoreInfo) => Promise<void>
}

function labelOf(label: string | null): string {
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

/** Propose l'ajout d'un produit : contrôle, puis confirmation explicite, puis écriture, puis proposition de retrait. */
export function offerAdd(
  ctx: ScreenContext,
  panel: ResultsPanel,
  zone: HTMLElement,
  offer: AddOffer,
): void {
  const store = needStore(ctx, panel)
  if (!store) return
  if (writing.has(ctx.state)) {
    panel.set(BUSY)
    return
  }
  const id = offer.productId.trim()
  if (!/^\d{1,12}$/.test(id)) {
    panel.set([
      "Identifiant invalide : des chiffres seulement (12 au plus), comme celui vu à l'essai 2.",
    ])
    return
  }
  const check = checkBeforeAdd(ctx.state.lastProducts, id)
  if (!check.allowed) {
    panel.set(check.warnings)
    return
  }

  clear(zone)
  const withContext = h('input', { attrs: { type: 'checkbox' } })
  append(
    zone,
    h(
      'label',
      { class: 'inline' },
      withContext,
      "Joindre un objet d'analytique vide (si l'ajout simple a échoué)",
    ),
  )
  confirmBox(
    zone,
    {
      message: [
        `Tu vas ajouter 1 exemplaire du produit ${id}${labelOf(offer.label)} à ton VRAI panier Leclerc.`,
        ...check.warnings,
        "Rien n'est envoyé tant que tu ne touches pas le bouton ci-dessous.",
      ],
      confirmLabel: 'Oui, ajouter 1 au panier',
    },
    () => {
      void write(ctx, panel, zone, store, offer, id, withContext.checked)
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
  withContext: boolean,
): Promise<void> {
  clear(zone)
  writing.add(ctx.state)
  try {
    await writeOnce(ctx, panel, zone, store, offer, id, withContext)
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
  withContext: boolean,
): Promise<void> {
  panel.set([`Ajout du produit ${id}${labelOf(offer.label)}, quantité visée 1…`])
  const point = findDeliveryPoint(ctx.env.win.document.documentElement.outerHTML, store)
  const reply = await postForm(
    ctx.env.fetch,
    cartUrl(store),
    cartBody({ action: 1, productId: id, quantity: 1, deliveryPoint: point.value, withContext }),
    ctx.env.now,
  )
  const lines = [
    `Ajout du produit ${id}${labelOf(offer.label)} : action 1, quantité visée 1${withContext ? ", avec objet d'analytique vide" : ''}`,
    describeReply(reply),
  ]
  if (reply.error !== null) {
    panel.set(lines)
    return
  }
  const summary = summarizeCartResponse(reply.text, reply.status, id)
  lines.push(...summary.lines)
  if (reply.blocked || summary.blocked) lines.push(BLOCK_MESSAGE)
  ctx.state.lastAdded = { productId: id, label: offer.label }
  panel.set(lines)
  if (reply.blocked) return

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
        "Rien n'est envoyé tant que tu ne touches pas le bouton ci-dessous.",
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
  const point = findDeliveryPoint(ctx.env.win.document.documentElement.outerHTML, store)
  const reply = await postForm(
    ctx.env.fetch,
    cartUrl(store),
    cartBody({ action: 2, productId: id, quantity: 0, deliveryPoint: point.value }),
    ctx.env.now,
  )
  const lines = [describeReply(reply)]
  if (reply.error === null) {
    const summary = summarizeCartResponse(reply.text, reply.status, id)
    lines.push(...summary.lines)
    if (reply.blocked || summary.blocked) lines.push(BLOCK_MESSAGE)
    else lines.push('Retrait demandé. Vérifie sur le site que le panier est revenu comme avant.')
  }
  panel.add(...lines)
}
