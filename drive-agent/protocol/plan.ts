import {
  content,
  distinct,
  each,
  eachIfPresent,
  exactly,
  fail,
  HOST,
  ID,
  int,
  object,
  oneOf,
  optional,
  orNull,
  productRef,
  root,
  text,
  values,
  at,
  type Check,
} from './check'
import {
  LIMITS,
  LINE_STATUSES,
  PACKS_STATUSES,
  PROTOCOL_VERSION,
  RETURN_PATH,
  type PlanMessage,
  type SetupMessage,
} from './types'

export const SLUG = /^[a-z0-9-]{1,100}$/
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const planProduct: Check = (list, index) => {
  const product = object(list, index, ['id', 'label', 'content', 'packs', 'packsStatus'])
  text(product, 'id', ID)
  text(product, 'label')
  optional(product, 'content', content)
  optional(
    product,
    'packs',
    orNull((scope, key) => int(scope, key, 1, LIMITS.packsMax)),
  )
  optional(
    product,
    'packsStatus',
    orNull((scope, key) => oneOf(scope, key, PACKS_STATUSES)),
  )
}

const planLine: Check = (list, index) => {
  const line = object(list, index, [
    'ingredientSlug',
    'name',
    'status',
    'products',
    'rejected',
    'searchQuery',
    'replaces',
  ])
  text(line, 'ingredientSlug', SLUG)
  text(line, 'name')
  const status = oneOf(line, 'status', LINE_STATUSES)
  const products = eachIfPresent(line, 'products', LIMITS.products, planProduct)
  distinct(products, 'id')
  const accepted = values(products, 'id')
  if (status === 'KNOWN' && accepted.length === 0) fail(products.p)
  if (status === 'NEW' && accepted.length > 0) fail(products.p)
  const rejected = eachIfPresent(line, 'rejected', LIMITS.rejected, productRef)
  distinct(rejected, 'id')
  values(rejected, 'id').forEach((id, rank) => {
    if (accepted.includes(id)) fail(at(at(rejected.p, rank), 'id'), 'accepté et refusé')
  })
  optional(line, 'searchQuery', text)
  optional(line, 'replaces', productRef)
}

/**
 * Valide un message de Repas vers l'agent (`plan` ou `setup`) : toutes les règles du protocole, aucune clé inconnue tolérée.
 * Rend le message lui-même, typé ; lève une `ProtocolError` (`INVALID_MESSAGE`) sur le premier champ fautif.
 */
export function validatePlan(input: unknown): PlanMessage | SetupMessage {
  const type = oneOf(object(root(input), ''), 'type', ['plan', 'setup'])
  const keys = ['v', 'type', 'runId', 'retailer', 'store', 'returnPath']
  const message = object(root(input), '', type === 'plan' ? [...keys, 'lines'] : keys)
  exactly(message, 'v', PROTOCOL_VERSION)
  text(message, 'runId', UUID)
  exactly(message, 'retailer', 'leclerc')
  const store = object(message, 'store', ['id', 'host'])
  text(store, 'id', ID)
  text(store, 'host', HOST)
  exactly(message, 'returnPath', RETURN_PATH)
  if (type === 'plan') distinct(each(message, 'lines', LIMITS.lines, planLine), 'ingredientSlug')
  return input as PlanMessage | SetupMessage
}
