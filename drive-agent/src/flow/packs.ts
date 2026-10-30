// Le nombre de produits à mettre au panier pour un produit que l'utilisateur vient de choisir (phase B). Même formule que le
// `PackCalculator` du dépôt back (`architecture.md` § 6) : le contenu du produit vient de la page de l'enseigne, la quantité demandée
// du plan. Dans le doute, `null` : l'agent demande alors la quantité à l'utilisateur.
import { LIMITS, type NeededQuantity, type PacksStatus } from '../../protocol'
import type { Content } from '../retailers'

export interface Packs {
  /** Un entier de 1 à 99, ou `null` quand le calcul est impossible. */
  packs: number | null
  status: PacksStatus
}

/** Tolérance de l'arrondi supérieur : 0,3 × 10 ne doit pas donner 4. */
const EPSILON = 1e-9

function computed(ratio: number): Packs {
  return {
    packs: Math.min(Math.max(Math.ceil(ratio - EPSILON), 1), LIMITS.packsMax),
    status: 'COMPUTED',
  }
}

const UNKNOWN: Packs = { packs: null, status: 'TO_CHECK' }

/**
 * - unité de la ligne `PACKAGE` : la liste compte déjà des produits, le contenu n'entre pas dans le calcul ;
 * - `COUNT` et contenu en pièces : quantité ÷ pièces par produit ; sans contenu en pièces, la quantité elle-même, à vérifier ;
 * - `WEIGHT` / `VOLUME` et contenu de même dimension (g, ml) : quantité × facteur de l'unité ÷ contenu ;
 * - tout le reste (dimension inconnue, contenu inconnu ou d'une autre dimension) : `null`, à vérifier.
 */
export function packsFor(needed: NeededQuantity | undefined, content: Content | null): Packs {
  if (!needed || !(needed.quantity > 0)) return UNKNOWN
  const { quantity, dimension, baseFactor } = needed
  const usable = content !== null && content.value > 0 ? content : null
  switch (dimension) {
    case 'PACKAGE':
      return computed(quantity)
    case 'COUNT':
      return usable?.unit === 'piece'
        ? computed(quantity / usable.value)
        : { packs: computed(quantity).packs, status: 'TO_CHECK' }
    case 'WEIGHT':
    case 'VOLUME': {
      const sameDimension = dimension === 'WEIGHT' ? usable?.unit === 'g' : usable?.unit === 'ml'
      if (usable && sameDimension && typeof baseFactor === 'number' && baseFactor > 0) {
        return computed((quantity * baseFactor) / usable.value)
      }
      return UNKNOWN
    }
    default:
      return UNKNOWN
  }
}
