import {
  cleanSearchQuery,
  cleanText,
  LIMITS,
  type ChosenLine,
  type ChosenProduct,
  type ProductPrice,
  type RejectedProduct,
  type ResultLine,
  type ResultMessage,
} from '@drive-protocol'

import type { ChoiceIntent } from '@/api'

/** Intentions par appel `PUT /api/v1/drive/choices` (borne du back). */
export const MAX_INTENTS = 200

/** Le back refuse un prix de plus de 1 000 000 centimes (le protocole va jusqu'à 100 000 000) : un prix plus haut n'est pas gardé. */
const MAX_CENTS = 1_000_000

/** Un identifiant de rayon ou de famille que le protocole accepte : un entier de 1 à 2 147 483 647. Sinon `null`. */
export function catalogIdOf(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= LIMITS.catalogId
    ? value
    : null
}

/** Le produit d'une intention, avec son rayon et sa famille (DRV-642), présents seulement quand l'agent les a donnés. */
type WireProduct = NonNullable<ChoiceIntent['product']>
/** Le contrat marque `rayonId` et `familyId` requis (défaut `null`) ; le back accepte aussi leur absence, qu'on garde quand l'agent n'en dit rien. */
type Product = Omit<WireProduct, 'rayonId' | 'familyId'> &
  Partial<Pick<WireProduct, 'rayonId' | 'familyId'>>
/**
 * Le contrat marque aussi `searchQuery` (DRV-650) requis, avec `null` pour défaut : un artefact du générateur. Une clé absente garde la recherche déjà
 * mémorisée, `null` l'EFFACE : l'intention ne la porte donc que lorsque l'agent en a rendu une, jamais `null`.
 */
type Intent = Omit<ChoiceIntent, 'product' | 'searchQuery'> & {
  product?: Product | null
  searchQuery?: string
}
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
 * La recherche qui a fait trouver le produit choisi (DRV-650), prête pour le back, ou `null` : rien n'est alors envoyé (le back garde la recherche
 * déjà mémorisée ; `null` l'effacerait). Le back refuse un texte mal formé EN BLOC avec tout le lot (`422 DRIVE_SEARCH_QUERY_INVALID`, les produits
 * choisis du passage seraient perdus avec elle) : elle est nettoyée une seconde fois (`cleanSearchQuery`, la fonction de l'agent : caractères de
 * contrôle et invisibles retirés, espaces réduites, 80 points de code, au moins 2) pour un agent plus ancien. Seule celle du produit placé en
 * `PRIMARY` part, jamais celle d'un produit de secours. Une donnée de la personne : jamais dans une adresse, un journal ni un message d'erreur.
 */
function searchQueryOf(line: ChosenLine): string | null {
  if (line.placement !== 'PRIMARY' || line.searchQuery === undefined) return null

  return cleanSearchQuery(line.searchQuery)
}

/**
 * Les intentions d'une ligne, dans l'ordre qu'exige le back : les produits refusés d'abord, puis `HAVE_AT_HOME` (un `REJECT_PRODUCT`
 * ou un `ADD_PRODUCT` sur un ingrédient « j'en ai toujours » le fait redevenir une préférence de produits).
 */
function intentsOf(line: ResultLine): ChoiceIntent[] {
  const slug = line.ingredientSlug
  const intents: Intent[] = []
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
      if (line.placement !== 'ONCE') {
        const searchQuery = searchQueryOf(line)
        intents.push({
          ingredientSlug: slug,
          action: 'ADD_PRODUCT',
          placement: line.placement,
          product: productOf(line.product),
          ...(searchQuery !== null && { searchQuery }),
        })
      }
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

  return intents as ChoiceIntent[]
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
