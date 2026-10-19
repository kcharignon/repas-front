import {
  cleanText,
  type ChosenProduct,
  type ProductPrice,
  type RejectedProduct,
  type ResultLine,
  type ResultMessage,
} from '@drive-protocol'

import type { ChoiceIntent } from '@/api'
import { catalogIdOf, type WithRayon } from './rayon'

/** Intentions par appel `PUT /api/v1/drive/choices` (borne du back). */
export const MAX_INTENTS = 200

/** Le back refuse un prix de plus de 1 000 000 centimes (le protocole va jusqu'à 100 000 000) : un prix plus haut n'est pas gardé. */
const MAX_CENTS = 1_000_000

/** Le produit d'une intention, avec son rayon et sa famille (DRV-642 ; types écrits à la main en attendant le contrat du back, voir `rayon.ts`). */
type Product = NonNullable<ChoiceIntent['product']> & WithRayon
type Price = NonNullable<Product['price']>

function priceOf(price: ProductPrice | undefined): Price | null {
  if (price === undefined || price.cents > MAX_CENTS) return null
  const measure = price.perMeasure

  return {
    cents: price.cents,
    perMeasure: measure !== undefined && measure.cents <= MAX_CENTS ? measure : null,
  }
}

/**
 * Un produit à mémoriser : identifiant en chaîne (`id` du protocole), libellé et contenu tels que l'agent les a lus. Le libellé est nettoyé une
 * seconde fois (`cleanText`, la fonction de l'agent) : un agent plus ancien, embarqué dans une application pas encore mise à jour, peut laisser
 * passer un caractère invisible que le back refuse, et le back rejette alors tout le lot (`422 DRIVE_CHOICE_INVALID`). Un libellé qui n'était
 * fait que d'invisibles redevient l'identifiant du produit : le back exige un libellé. Le rayon et la famille d'un produit choisi (DRV-642) ne
 * partent que s'ils sont valides, et seulement quand l'agent les a donnés : un agent ancien n'en dit rien, la clé est alors absente.
 */
function productOf(product: RejectedProduct | ChosenProduct): Product {
  const rayonId = 'rayonId' in product ? catalogIdOf(product.rayonId) : null
  const familyId = 'familyId' in product ? catalogIdOf(product.familyId) : null

  return {
    retailerProductId: product.id,
    label: cleanText(product.label) || product.id,
    ean: product.ean ?? null,
    content: product.content ?? null,
    price: 'price' in product ? priceOf(product.price) : null,
    ...(rayonId !== null && { rayonId }),
    ...(familyId !== null && { familyId }),
  }
}

/**
 * Les intentions d'une ligne, dans l'ordre qu'exige le back : les produits refusés d'abord, puis `HAVE_AT_HOME` (un `REJECT_PRODUCT`
 * ou un `ADD_PRODUCT` sur un ingrédient « j'en ai toujours » le fait redevenir une préférence de produits).
 */
function intentsOf(line: ResultLine): ChoiceIntent[] {
  const slug = line.ingredientSlug
  const intents: ChoiceIntent[] = []
  // Un produit à la fois ajouté et refusé donnerait 422 sur tout le lot : l'ajout, explicite, l'emporte
  const added = line.outcome === 'CHOSEN' && line.placement !== 'ONCE' ? line.product.id : null
  for (const product of line.rejected ?? []) {
    if (product.id !== added)
      intents.push({
        ingredientSlug: slug,
        action: 'REJECT_PRODUCT',
        placement: null,
        product: productOf(product),
      })
  }

  switch (line.outcome) {
    case 'CHOSEN':
      // `ONCE` : cette fois seulement, rien à mémoriser
      if (line.placement !== 'ONCE')
        intents.push({
          ingredientSlug: slug,
          action: 'ADD_PRODUCT',
          placement: line.placement,
          product: productOf(line.product),
        })
      break
    case 'ADDED': {
      // Le prix lu pendant le passage rafraîchit celui du produit connu
      const price = priceOf(line.price)
      if (price !== null)
        intents.push({
          ingredientSlug: slug,
          action: 'REFRESH_PRICE',
          placement: null,
          product: {
            retailerProductId: line.productId,
            label: null,
            ean: null,
            content: null,
            price,
          },
        })
      break
    }
    case 'HAVE_AT_HOME':
      intents.push({
        ingredientSlug: slug,
        action: 'HAVE_AT_HOME',
        placement: null,
        product: null,
      })
      break
    default:
      // `SKIPPED`, `UNAVAILABLE`, `FAILED` : rien à enregistrer
      break
  }

  return intents
}

/**
 * Les choix que ces intentions enregistrent vraiment : un produit retenu ou refusé, un « j'en ai toujours ». Rafraîchir un prix n'en est pas un :
 * l'utilisateur n'a rien choisi.
 */
export const countChoices = (batches: ChoiceIntent[][]): number =>
  batches.flat().filter((intent) => intent.action !== 'REFRESH_PRICE').length

/**
 * Ce que le résultat d'un passage apprend à Repas, en lots de 200 intentions au plus (un seul, presque toujours). Les intentions d'une
 * ligne ne sont jamais séparées entre deux lots.
 */
export function buildChoiceBatches(result: ResultMessage): ChoiceIntent[][] {
  const batches: ChoiceIntent[][] = []
  let current: ChoiceIntent[] = []
  for (const line of result.lines) {
    const group = intentsOf(line)
    if (current.length + group.length > MAX_INTENTS) {
      batches.push(current)
      current = []
    }
    current.push(...group)
  }
  if (current.length > 0) batches.push(current)

  return batches
}
