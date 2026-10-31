import {
  at,
  content,
  distinct,
  each,
  eachIfPresent,
  exactly,
  fail,
  ANY_PRODUCT_ID,
  int,
  object,
  oneOf,
  optional,
  orNull,
  packSize,
  ANY_STORE_ID,
  anyOfferId,
  offerId,
  retailerOfHost,
  root,
  STORES,
  text,
  type Check,
  type Scope,
} from './check'
import { SLUG, UUID } from './plan'
import {
  ERROR_CODES,
  LIMITS,
  LINE_OUTCOMES,
  MEASURE_UNITS,
  OUTCOMES,
  PLACEMENTS,
  PROTOCOL_VERSION,
  type ResultMessage,
  type SetupResultMessage,
} from './types'

const SEMVER = /^\d+\.\d+\.\d+$/
const EAN = /^[0-9]{8,14}$/

const cents: Check = (scope, key) => int(scope, key, 0, LIMITS.cents)

const price: Check = (scope, key) => {
  const own = object(scope, key, ['cents', 'perMeasure'])
  cents(own, 'cents')
  optional(own, 'perMeasure', (parent, name) => {
    const measure = object(parent, name, ['cents', 'unit'])
    cents(measure, 'cents')
    oneOf(measure, 'unit', MEASURE_UNITS)
  })
}

/** Un produit vu par l'agent ; le produit choisi (`withPrice`) porte aussi son prix. */
function product(scope: Scope, key: string | number, withPrice: boolean): void {
  const own = object(scope, key, [
    'id',
    'label',
    'ean',
    'content',
    ...(withPrice ? ['price', 'rayonId', 'familyId', 'offerId'] : []),
  ])
  text(own, 'id', ANY_PRODUCT_ID)
  text(own, 'label')
  optional(
    own,
    'ean',
    orNull((parent, name) => text(parent, name, EAN)),
  )
  optional(own, 'content', content)
  optional(own, 'price', price)
  if (withPrice) {
    optional(own, 'rayonId', (parent, name) => int(parent, name, 1, LIMITS.catalogId))
    optional(own, 'familyId', (parent, name) => int(parent, name, 1, LIMITS.catalogId))
    // DRV-722 : le résultat ne dit pas l'enseigne ; l'offre doit avoir la forme de l'une de celles qui en ont (aucune : la clé est interdite)
    optional(own, 'offerId', offerId(anyOfferId()))
  }
}

const quantity: Check = (scope, key) => int(scope, key, 1, LIMITS.packsMax)

/** Une recherche mémorisée (DRV-650) : de 2 à 80 caractères, au sens d'Unicode (le texte propre est l'affaire de `cleanSearchQuery`, côté agent et côté site). */
const searchQuery: Check = (scope, key) => {
  if ([...text(scope, key, undefined, LIMITS.searchQueryMax)].length < LIMITS.searchQueryMin)
    fail(at(scope.p, key))
}

/** Ce que chaque issue de ligne exige, en plus de `ingredientSlug` et `outcome`. */
const REQUIRED: Record<string, Record<string, Check>> = {
  ADDED: {
    productId: (scope, key) => text(scope, key, ANY_PRODUCT_ID),
    quantity,
    usedRank: (scope, key) => int(scope, key, 1, LIMITS.products),
  },
  CHOSEN: {
    product: (scope, key) => product(scope, key, true),
    quantity,
    placement: (scope, key) => oneOf(scope, key, PLACEMENTS),
  },
  FAILED: { error: (scope, key) => oneOf(scope, key, ERROR_CODES) },
}

const resultLine: Check = (list, index) => {
  const outcome = oneOf(object(list, index), 'outcome', LINE_OUTCOMES)
  const required = REQUIRED[outcome] ?? {}
  const withUnavailable = ['ADDED', 'CHOSEN', 'UNAVAILABLE'].includes(outcome)
  const line = object(list, index, [
    'ingredientSlug',
    'outcome',
    'rejected',
    ...Object.keys(required),
    ...(withUnavailable ? ['unavailableIds'] : []),
    ...(outcome === 'ADDED' ? ['price'] : []),
    ...(outcome === 'CHOSEN' ? ['searchQuery', 'notInCart'] : []),
    ...(outcome === 'ADDED' || outcome === 'CHOSEN' ? ['packSize'] : []),
  ])
  text(line, 'ingredientSlug', SLUG)
  for (const [key, check] of Object.entries(required)) check(line, key)
  optional(line, 'price', price)
  optional(line, 'searchQuery', searchQuery)
  optional(line, 'packSize', packSize)
  // DRV-742 : la clé n'a qu'une valeur, `true` (absente = au panier) ; `false` ou tout autre type est refusé
  optional(line, 'notInCart', (parent, name) => {
    if (parent.v[name] !== true) fail(at(parent.p, name))
  })
  const max = outcome === 'ADDED' ? LIMITS.unavailableAdded : LIMITS.products
  optional(line, 'unavailableIds', (parent, name) => {
    distinct(each(parent, name, max, (ids, rank) => text(ids, rank as never, ANY_PRODUCT_ID)))
  })
  distinct(
    eachIfPresent(line, 'rejected', LIMITS.rejected, (rejected, rank) =>
      product(rejected, rank, false),
    ),
    'id',
  )
}

function setupStore(message: Scope): void {
  const store = object(message, 'store', ['id', 'host', 'baseUrl', 'label'])
  text(store, 'id', ANY_STORE_ID)
  const retailer = retailerOfHost(text(store, 'host'))
  if (retailer === undefined) fail(at(store.p, 'host'))
  text(store, 'id', STORES[retailer].id)
  if (
    !STORES[retailer].base(text(store, 'baseUrl'), store.v.host as string, store.v.id as string)
  ) {
    fail(at(store.p, 'baseUrl'))
  }
  if (store.v.label !== null) text(store, 'label')
}

/**
 * Valide un message de l'agent vers Repas (`result` ou `setup-result`). Rend le message lui-même, typé ; lève une
 * `ProtocolError` (`INVALID_MESSAGE`) sur le premier champ fautif.
 */
export function validateResult(input: unknown): ResultMessage | SetupResultMessage {
  const type = oneOf(object(root(input), ''), 'type', ['result', 'setup-result'])
  const keys = ['v', 'type', 'runId', 'agentVersion', 'store']
  const message = object(
    root(input),
    '',
    type === 'result' ? [...keys, 'outcome', 'error', 'stats', 'lines'] : keys,
  )
  exactly(message, 'v', PROTOCOL_VERSION)
  text(message, 'runId', UUID)
  text(message, 'agentVersion', SEMVER)
  if (type === 'setup-result') {
    setupStore(message)
    return input as SetupResultMessage
  }
  const outcome = oneOf(message, 'outcome', OUTCOMES)
  optional(message, 'store', (parent, name) =>
    text(object(parent, name, ['id']), 'id', ANY_STORE_ID),
  )
  if (outcome === 'error' && message.v.error === undefined) fail('error')
  optional(message, 'error', (parent, name) => {
    const error = object(parent, name, ['code', 'message'])
    oneOf(error, 'code', ERROR_CODES)
    text(error, 'message', undefined, LIMITS.errorMessage)
  })
  optional(message, 'stats', (parent, name) => {
    const stats = object(parent, name, ['requests', 'errors', 'blocks'])
    for (const key of ['requests', 'errors', 'blocks']) int(stats, key, 0, LIMITS.requests)
  })
  each(message, 'lines', LIMITS.lines, resultLine)
  return input as ResultMessage
}
