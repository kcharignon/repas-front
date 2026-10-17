// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Ce que plusieurs essais font de la même façon : exiger un magasin, chercher, décrire une réponse, montrer un produit.
import { PRODUCTS_SHOWN } from '../config'
import { getPage, type Reply } from '../http'
import { extractProducts, findEanKeys, keywordExcerpt, type ParseResult } from '../parse'
import { searchUrl, type StoreInfo } from '../store'
import type { ResultsPanel } from '../ui/widgets'
import type { ScreenContext } from '../ui/types'

export const NO_STORE =
  "Cette page n'est pas une page de magasin (adresse sans /magasin-.../). Ouvre une page de ton magasin, puis relance le banc."

/** Le magasin de la page, ou un message clair dans le résultat. */
export function needStore(ctx: ScreenContext, panel: ResultsPanel): StoreInfo | null {
  const store = ctx.store()
  if (!store) panel.set([NO_STORE])
  return store
}

export function describeReply(reply: Reply): string {
  if (reply.error !== null) return `Requête sans réponse : ${reply.error} (${reply.ms} ms)`
  const type = reply.contentType?.split(';')[0] ?? 'type inconnu'
  return `HTTP ${reply.status} · ${type} · ${reply.text.length} caractères · ${reply.ms} ms`
}

export const BLOCK_MESSAGE =
  'Blocage probable (403/429) : on arrête. Recharge le site dans Chrome, attends, puis recommence plus tard.'

export interface SearchOutcome {
  reply: Reply
  parsed: ParseResult
}

/** Une recherche sur l'hôte courant ; mémorise (sauf demande contraire) les produits trouvés pour les autres essais. */
export async function search(
  ctx: ScreenContext,
  store: StoreInfo,
  query: string,
  remember = true,
): Promise<SearchOutcome> {
  const reply = await getPage(ctx.env.fetch, searchUrl(store, query), ctx.env.now)
  const parsed =
    reply.status === 200 ? extractProducts(reply.text) : { products: [], ids: 0, view: '—' }
  if (remember && parsed.products.length > 0) {
    ctx.state.lastQuery = query
    ctx.state.lastProducts = parsed.products
  }
  return { reply, parsed }
}

export function formatPrice(price: number | null, text: string | null): string {
  if (price === null && text === null) return '—'
  return `${text ?? '?'} (${price ?? '?'})`
}

export function productLines(index: number, product: ParseResult['products'][number]): string[] {
  return [
    `${index}. id ${product.id} — ${product.label1 ?? '(sans libellé)'}`,
    `   libellé 2 : ${product.label2 ?? '—'}`,
    `   prix : ${formatPrice(product.unitPrice, product.unitPriceText)} · promo : ${product.promoText ?? '—'}` +
      ` · par unité de mesure : ${formatPrice(product.measurePrice, product.measurePriceText)}`,
    `   stock (iQteDisponible) : ${product.stock ?? '—'} · déjà au panier (iQuantitePanier) : ${product.inCart ?? '—'}`,
  ]
}

/** Résumé d'une recherche : code, produits reconnus, EAN, détail des premiers ; extrait de page si l'analyse échoue. */
export function searchReport(
  query: string,
  outcome: SearchOutcome,
  shown = PRODUCTS_SHOWN,
): string[] {
  const { reply, parsed } = outcome
  const lines = [`Recherche « ${query} » sur l'hôte courant`, describeReply(reply)]
  if (reply.error !== null) return lines
  if (reply.blocked) return [...lines, BLOCK_MESSAGE]
  if (reply.status !== 200) return [...lines, 'Réponse inattendue : pas de produits à analyser.']

  const eans = findEanKeys(reply.text)
  if (parsed.products.length === 0) {
    const { keyword, excerpt } = keywordExcerpt(reply.text)
    lines.push(`Produits reconnus : 0 (identifiants repérés : ${parsed.ids}).`)
    lines.push(
      keyword
        ? `Extrait autour de « ${keyword} » (300 caractères) : ${excerpt}`
        : 'Aucun mot-clé de produit dans la page : mauvais écran ? recherche vide ?',
    )
    return lines
  }

  const noStock = parsed.products.filter((product) => product.stock === null).length
  lines.push(
    `Produits reconnus : ${parsed.products.length} (identifiants repérés : ${parsed.ids} ; lecture : ${parsed.view}).`,
  )
  if (noStock > 0) lines.push(`Dont sans stock lu : ${noStock} (lignes du panier ?).`)
  lines.push(
    eans.length > 0
      ? `EAN dans les données : oui (champs : ${eans.join(', ')})`
      : 'EAN dans les données : non',
  )
  parsed.products
    .slice(0, shown)
    .forEach((product, i) => lines.push(...productLines(i + 1, product)))
  return lines
}
