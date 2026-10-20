import {
  cleanSearchQuery,
  cleanText,
  LIMITS,
  toPackSize,
  type AddedLine,
  type ChosenLine,
  type ChosenProduct,
  type ProductPrice,
  type RejectedProduct,
  type ResultLine,
  type ResultMessage,
} from '@drive-protocol'

import type { ChoiceIntent, DriveChoiceProduct, DrivePlan } from '@/api'

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
type Product = Omit<WireProduct, 'rayonId' | 'familyId' | 'packSize'> &
  Partial<Pick<WireProduct, 'rayonId' | 'familyId'>> & {
    /**
     * La contenance du produit dans l'unité de la liste (DRV-652). Le contrat la marque requise (défaut `null`), un autre artefact du générateur : une clé absente
     * GARDE la contenance mémorisée pour ce produit, `null` l'EFFACE, un objet la remplace. Le site ne l'écrit donc que pour une contenance donnée pendant le
     * passage, jamais `null`.
     */
    packSize?: NonNullable<WireProduct['packSize']>
  }
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
function productOf(product: RejectedProduct | ChosenProduct, packSize?: PackSizeValue): Product {
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
    ...(packSize !== undefined && { packSize }),
  }
}

type PackSizeValue = NonNullable<WireProduct['packSize']>

/**
 * La contenance que l'agent rend avec un produit (DRV-652), prête pour le back, ou `undefined` : rien n'est alors envoyé (une clé absente garde la
 * contenance mémorisée, `null` l'effacerait). Le back refuse une contenance mal formée EN BLOC avec tout le lot (`422 DRIVE_PACK_SIZE_INVALID`, les produits
 * choisis du passage seraient perdus avec elle) : elle est revérifiée (de 0,001 à 9 999, trois décimales au plus, un slug d'unité) pour un agent qui se
 * tromperait. Elle n'est retenue que pour un produit mémorisé : jamais pour « Pas mon habituel » (`ONCE`).
 */
function packSizeOf(line: AddedLine | ChosenLine): PackSizeValue | undefined {
  if (line.outcome === 'CHOSEN' && line.placement === 'ONCE') return undefined

  return toPackSize(line.packSize) ?? undefined
}

/**
 * La correction à la main de la contenance d'un produit accepté (« Mes produits », DRV-652) : un `ADD_PRODUCT` « de secours » du même produit, qui ne change ni
 * son rang ni les autres produits mais REMPLACE sa contenance (`PRIMARY` le ferait passer en tête). `null` quand la contenance n'est pas valide : rien n'est
 * alors envoyé (le back refuse une contenance hors bornes, ou d'une unité qui n'existe pas, et la correction est perdue avec). Jamais de clé `null` : oublier
 * une contenance n'est pas ce geste-là.
 */
export function packSizeCorrection(
  ingredientSlug: string,
  product: DriveChoiceProduct,
  packSize: unknown,
): ChoiceIntent | null {
  const size = toPackSize(packSize)
  if (size === null) return null
  const intent: Intent = {
    ingredientSlug,
    action: 'ADD_PRODUCT',
    placement: 'FALLBACK',
    product: {
      retailerProductId: product.retailerProductId,
      label: cleanText(product.label) || product.retailerProductId,
      ean: product.ean ?? null,
      content: product.content ?? null,
      price: null,
      packSize: size,
    },
  }

  return intent as ChoiceIntent
}

/** Ce que le plan envoyé sait d'un produit déjà connu : de quoi le redécrire à Repas quand la personne en donne la contenance (DRV-652). */
export interface KnownProduct {
  label: string
  content: NonNullable<WireProduct['content']> | null
}

/** Les produits connus du plan, par identifiant chez l'enseigne : le libellé et le contenu tels que Repas les a mémorisés. */
export function knownProductsOf(plan: DrivePlan): Map<string, KnownProduct> {
  return new Map(
    plan.lines.flatMap((line) =>
      line.products.map((product): [string, KnownProduct] => [
        product.retailerProductId,
        { label: product.label, content: product.content ?? null },
      ]),
    ),
  )
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
 * La recherche d'un produit pris « Pas mon habituel » (DRV-653), prête pour le back, ou `null` : aucune intention n'est alors envoyée. `NOTE_SEARCH` exige un
 * texte (clé absente ou `null` : `422 DRIVE_CHOICE_INVALID`, et le lot entier est perdu), donc jamais d'intention vide. Même nettoyage que pour un produit
 * retenu (`cleanSearchQuery`). Une donnée de la personne : jamais dans une adresse, un journal ni un message d'erreur.
 */
function noteSearchOf(line: ChosenLine): string | null {
  if (line.placement !== 'ONCE' || line.searchQuery === undefined) return null

  return cleanSearchQuery(line.searchQuery)
}

/**
 * Les intentions d'une ligne, dans l'ordre qu'exige le back : les produits refusés d'abord, puis `HAVE_AT_HOME` (un `REJECT_PRODUCT`
 * ou un `ADD_PRODUCT` sur un ingrédient « j'en ai toujours » le fait redevenir une préférence de produits).
 */
function intentsOf(
  line: ResultLine,
  known: ReadonlyMap<string, KnownProduct>,
  settled: ReadonlySet<string>,
): ChoiceIntent[] {
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
      if (line.placement !== 'ONCE') {
        const searchQuery = searchQueryOf(line)
        intents.push({
          ingredientSlug: slug,
          action: 'ADD_PRODUCT',
          placement: line.placement,
          product: productOf(line.product, packSizeOf(line)),
          ...(searchQuery !== null && { searchQuery }),
        })
      } else {
        // « Pas mon habituel » : aucun produit n'est retenu, mais la recherche qui l'a fait trouver l'est (DRV-653). Jamais en plus d'un produit retenu ni d'un
        // « j'en ai toujours » du même article dans le lot : la recherche part alors avec l'`ADD_PRODUCT`, et `NOTE_SEARCH` après « j'en ai toujours » est refusé.
        const searchQuery = settled.has(slug) ? null : noteSearchOf(line)
        if (searchQuery !== null)
          intents.push({
            ingredientSlug: slug,
            action: 'NOTE_SEARCH',
            placement: null,
            product: null,
            searchQuery,
          })
      }
      break
    case 'ADDED': {
      // La personne a répondu combien d'unités de sa liste tiennent dans ce produit connu (DRV-652) : sa contenance est mémorisée avec lui. `FALLBACK` ne
      // change pas le rang d'un produit déjà accepté (`PRIMARY` le ferait passer en tête). Le libellé et le contenu viennent du plan (Repas les connaît) ;
      // un produit que le plan ne décrit pas n'est pas redécrit à l'aveugle.
      const packSize = packSizeOf(line)
      const described = known.get(line.productId)
      if (packSize !== undefined && described !== undefined) {
        const intent: Intent = {
          ingredientSlug: slug,
          action: 'ADD_PRODUCT',
          placement: 'FALLBACK',
          product: {
            retailerProductId: line.productId,
            label: cleanText(described.label) || line.productId,
            ean: null,
            content: described.content,
            price: null,
            packSize,
          },
        }
        remembersOnly.add(intent)
        intents.push(intent)
      }
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
 * Les intentions qui ne font que retenir un détail d'un produit déjà choisi (la contenance d'un produit connu, DRV-652) : l'utilisateur n'a pas choisi de
 * produit, `countChoices` ne les compte pas. Un ensemble de références plutôt qu'une clé de plus dans l'intention : le contrat du back n'en connaît pas.
 */
const remembersOnly = new WeakSet<object>()

/**
 * Les choix que ces intentions enregistrent vraiment : un produit retenu ou refusé, un « j'en ai toujours ». Rafraîchir un prix, noter une recherche ou
 * retenir la contenance d'un produit connu n'en sont pas : l'utilisateur n'a rien choisi.
 */
export const countChoices = (batches: ChoiceIntent[][]): number =>
  batches
    .flat()
    .filter(
      (intent) =>
        intent.action !== 'REFRESH_PRICE' &&
        intent.action !== 'NOTE_SEARCH' &&
        !remembersOnly.has(intent),
    ).length

/**
 * Ce que le résultat d'un passage apprend à Repas, en lots de 200 intentions au plus (un seul, presque toujours). Les intentions d'une
 * ligne ne sont jamais séparées entre deux lots.
 */
export function buildChoiceBatches(
  result: ResultMessage,
  known: ReadonlyMap<string, KnownProduct> = new Map(),
): ChoiceIntent[][] {
  // Les articles dont un produit est retenu ou qui sont « j'en ai toujours » : leur recherche part avec l'`ADD_PRODUCT`, et `NOTE_SEARCH` serait refusé
  const settled = new Set(
    result.lines
      .filter(
        (line) =>
          line.outcome === 'HAVE_AT_HOME' ||
          (line.outcome === 'CHOSEN' && line.placement !== 'ONCE'),
      )
      .map((line) => line.ingredientSlug),
  )
  const batches: ChoiceIntent[][] = []
  let current: ChoiceIntent[] = []
  for (const line of result.lines) {
    const group = intentsOf(line, known, settled)
    if (current.length + group.length > MAX_INTENTS) {
      batches.push(current)
      current = []
    }
    current.push(...group)
  }
  if (current.length > 0) batches.push(current)

  return batches
}
