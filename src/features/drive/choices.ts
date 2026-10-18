import type {
  ChosenProduct,
  ProductPrice,
  RejectedProduct,
  ResultLine,
  ResultMessage,
} from '@drive-protocol'

import type { ChoiceIntent } from '@/api'

/** Intentions par appel `PUT /api/v1/drive/choices` (borne du back). */
export const MAX_INTENTS = 200

/** Le back refuse un prix de plus de 1 000 000 centimes (le protocole va jusqu'à 100 000 000) : un prix plus haut n'est pas gardé. */
const MAX_CENTS = 1_000_000

type Product = NonNullable<ChoiceIntent['product']>
type Price = NonNullable<Product['price']>

function priceOf(price: ProductPrice | undefined): Price | null {
  if (price === undefined || price.cents > MAX_CENTS) return null
  const measure = price.perMeasure

  return {
    cents: price.cents,
    perMeasure: measure !== undefined && measure.cents <= MAX_CENTS ? measure : null,
  }
}

/** Un produit à mémoriser : identifiant en chaîne (`id` du protocole), libellé et contenu tels que l'agent les a lus. */
function productOf(product: RejectedProduct | ChosenProduct): Product {
  return {
    retailerProductId: product.id,
    label: product.label,
    ean: product.ean ?? null,
    content: product.content ?? null,
    price: 'price' in product ? priceOf(product.price) : null,
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
