// Phase A : une ligne dont l'utilisateur connaît déjà les produits. Les produits se prennent dans l'ordre de priorité : le premier qui
// est disponible est mis au panier, sans rien demander, avec ses propres `packs`. Jamais un produit refusé, jamais un produit absent de
// la liste (l'agent ne choisit pas seul un équivalent).
import {
  LIMITS,
  type NeededQuantity,
  type PlanLine,
  type PlanProduct,
  type ProductPrice,
  type ResultLine,
} from '../../protocol'
import { type Candidate, type Content, type RetailerAdapter, saysOutOfStock } from '../leclerc'
import type { UnavailableReason } from '../ui'
import { type CartNote, putInCart } from './keep-cart'
import { packsFor } from './packs'
import { givenSize, type PackAnswer } from './pack-size'
import { lookUpKnownProduct } from './search-by-name'

export type { UnavailableReason } from '../ui'

/** Un produit habituel mis de côté pour la phase B, avec sa raison et le nombre de recherches faites pour le retrouver. */
export interface UnavailableNote {
  id: string
  reason: UnavailableReason
  /** Les recherches faites pour retrouver ce produit (1 à 5). */
  tried: number
}

/**
 * Le contenu lu en direct n'a pas donné le même nombre de produits que le plan (DRV-613) : le nombre calculé en direct a été mis au
 * panier à la place de `planned`.
 */
export interface ContentChange {
  /** Le nombre de produits du plan (calculé par Repas sur le contenu mémorisé). */
  planned: number
  /** Le nombre de produits calculé sur le contenu lu sur le site, mis au panier. */
  live: number
}

/**
 * Ce que la phase A décide d'une ligne : une issue finale, ou une attente de la phase B (les produits connus indisponibles).
 * `change` n'accompagne qu'une issue `ADDED` dont la quantité a été recalculée ; `cart` qu'une issue dont la quantité déjà au panier est à
 * dire à la fin (conservée parce que plus grande que celle du plan, ou illisible : ticket M).
 */
export type Verdict =
  | {
      kind: 'done'
      line: ResultLine
      change?: ContentChange
      cart?: CartNote
      /** Le site disait ce produit en rupture et le panier l'a pourtant pris (DRV-635) : le journal le note. */
      accepted?: true
    }
  | { kind: 'waiting'; unavailable: string[]; notes: UnavailableNote[] }

/** Le prix lu pour Repas (décision D22) : unitaire TTC en centimes, et à l'unité de mesure quand le site la donne. */
export function priceOf(candidate: Candidate): ProductPrice | undefined {
  const inRange = (cents: number) => Number.isInteger(cents) && cents >= 0 && cents <= LIMITS.cents
  if (candidate.price === null || !inRange(candidate.price)) return undefined
  const measure = candidate.pricePerMeasure
  return measure !== null && inRange(measure.cents)
    ? { cents: candidate.price, perMeasure: { cents: measure.cents, unit: measure.unit } }
    : { cents: candidate.price }
}

/**
 * Le nombre de produits que donne le contenu lu en direct, ou `null` quand il ne se calcule pas : ni quantité demandée ni contenu lu,
 * contenu sans valeur, ou calcul que `packsFor` ne juge pas sûr (autre dimension que la quantité demandée, nombre de pièces inconnu).
 */
function livePacks(needed: NeededQuantity | undefined, content: Content | null): number | null {
  if (!needed || content === null || !(content.value > 0) || !Number.isFinite(content.value)) {
    return null
  }
  const { packs, status } = packsFor(needed, content)
  return status === 'COMPUTED' ? packs : null
}

export interface KnownLineDeps {
  adapter: RetailerAdapter
  /**
   * L'écran « Vérifier la quantité » : le nombre de produits choisi et, quand le plan dit l'unité de la ligne, la contenance du produit dans cette unité
   * (DRV-652) ; `null` pour passer la ligne.
   */
  askQuantity: (line: PlanLine, product: PlanProduct) => Promise<PackAnswer | null>
  /**
   * Les produits à étiquette de rupture que le panier a déjà refusés dans cet envoi (DRV-635) : une seule tentative d'écriture par produit et par
   * envoi, même s'il figure sur deux lignes. Le passage la remplit ; absente, chaque ligne tente pour son compte.
   */
  declined?: Set<string>
}

/**
 * Met au panier le premier produit disponible d'une ligne `KNOWN`. Le produit se retrouve par la recherche de son libellé tel quel, puis de ses
 * formes (`lookUpKnownProduct`, au plus 5 requêtes, DRV-635) ; le stock lu et « Bientôt disponible » ne sont que des ÉTIQUETTES, que le site
 * ordinateur et le site mobile ne disent pas pareil pour un même produit : **le panier tranche**. Un produit à étiquette de rupture est donc
 * tenté UNE fois (une seule écriture, au rythme du `Pacer`) ; accepté, il est au panier comme les autres ; refusé, c'est `OUT_OF_STOCK`. Un produit
 * que la recherche ne retrouve pas est `NOT_FOUND` (jamais « indisponible » : « pas de résultat » ne prouve rien), un produit qui se disait
 * disponible et que le panier refuse (quantité obtenue nulle) est `CART_REFUSED`. Chaque écriture est vérifiée par la réponse du panier :
 * `quantity` est ce que le site a mis au panier. Les trois raisons sont rendues dans `notes`, pour la phase B, le journal et l'écran de fin.
 *
 * **Le panier n'est jamais réduit** (ticket M) : un produit déjà au panier en plus grande quantité que celle du plan reste tel quel (rien
 * n'est écrit, `quantity` est celle du panier, `cart` le dit) ; voir `putInCart`.
 *
 * **Le contenu en direct fait foi** (DRV-613) : la fiche d'un produit est partagée entre les utilisateurs du magasin, son contenu
 * mémorisé peut être faux ou périmé. Quand le plan donne un nombre de produits sûr et que la recherche vient de montrer le contenu
 * du produit, le nombre est recalculé avec `packsFor` (comme en phase B) sur ce contenu et la quantité demandée (`needed`) ; s'il
 * diffère de celui du plan, c'est lui qui part au panier, et `change` le signale. Sans `needed`, sans contenu lisible ou sans calcul
 * sûr, rien ne change : le nombre du plan, ou la question à l'utilisateur quand il est à vérifier.
 *
 * @throws {LeclercError} l'erreur de l'adaptateur, à traiter par l'appelant (`BLOCKED`, `NOT_LOGGED_IN`, `NETWORK`…).
 */
export async function settleKnownLine(line: PlanLine, deps: KnownLineDeps): Promise<Verdict> {
  const products = line.products ?? []
  const refused = new Set((line.rejected ?? []).map((product) => product.id))
  const unavailable: string[] = []
  const notes: UnavailableNote[] = []
  const giveUp = (id: string, reason: UnavailableReason, tried: number) => {
    unavailable.push(id)
    notes.push({ id, reason, tried })
  }
  for (const [index, product] of products.entries()) {
    if (refused.has(product.id)) continue
    const { product: seen, tried } = await lookUpKnownProduct(
      deps.adapter,
      product.label,
      product.id,
    )
    if (seen === null) {
      giveUp(product.id, 'NOT_FOUND', tried)
      continue
    }
    const saidOut = saysOutOfStock(seen)
    if (saidOut && deps.declined?.has(product.id)) {
      giveUp(product.id, 'OUT_OF_STOCK', tried)
      continue
    }
    const planned = product.packsStatus === 'TO_CHECK' ? null : (product.packs ?? null)
    // Une contenance donnée par la personne pour CE produit (DRV-652) fait le calcul du plan : le contenu lu en direct ne le défait pas
    const live =
      planned === null || givenSize(product, line.needed) !== null
        ? null
        : livePacks(line.needed, seen.content)
    const change = planned !== null && live !== null && live !== planned ? { planned, live } : null
    let packs = change ? change.live : planned
    let answered: PackAnswer | null = null
    if (packs === null) {
      answered = await deps.askQuantity(line, product)
      if (answered === null)
        return { kind: 'done', line: { ingredientSlug: line.ingredientSlug, outcome: 'SKIPPED' } }
      packs = answered.packs
    }
    const settled = await putInCart(deps.adapter, seen, packs)
    if (settled.obtained < 1) {
      if (saidOut) deps.declined?.add(product.id)
      giveUp(product.id, saidOut ? 'OUT_OF_STOCK' : 'CART_REFUSED', tried)
      continue
    }
    const price = priceOf(seen)
    return {
      kind: 'done',
      line: {
        ingredientSlug: line.ingredientSlug,
        outcome: 'ADDED',
        productId: product.id,
        quantity: Math.min(settled.obtained, LIMITS.packsMax),
        usedRank: index + 1,
        ...(unavailable.length > 0 && { unavailableIds: unavailable }),
        ...(price && { price }),
        // La contenance que la personne vient de donner pour ce produit (DRV-652) : Repas la retient, la question ne sera plus posée
        ...(answered?.packSize && { packSize: answered.packSize }),
      },
      ...(change && { change }),
      ...(settled.note && { cart: settled.note }),
      ...(saidOut && { accepted: true as const }),
    }
  }
  return { kind: 'waiting', unavailable, notes }
}
