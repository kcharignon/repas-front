import {
  at,
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
  root,
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
  const own = object(scope, key, ['id', 'label', 'ean', 'content', ...(withPrice ? ['price'] : [])])
  text(own, 'id', ID)
  text(own, 'label')
  optional(
    own,
    'ean',
    orNull((parent, name) => text(parent, name, EAN)),
  )
  optional(own, 'content', content)
  optional(own, 'price', price)
}

const quantity: Check = (scope, key) => int(scope, key, 1, LIMITS.packsMax)

/** Ce que chaque issue de ligne exige, en plus de `ingredientSlug` et `outcome`. */
const REQUIRED: Record<string, Record<string, Check>> = {
  ADDED: {
    productId: (scope, key) => text(scope, key, ID),
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
  ])
  text(line, 'ingredientSlug', SLUG)
  for (const [key, check] of Object.entries(required)) check(line, key)
  optional(line, 'price', price)
  const max = outcome === 'ADDED' ? LIMITS.unavailableAdded : LIMITS.products
  optional(line, 'unavailableIds', (parent, name) => {
    distinct(each(parent, name, max, (ids, rank) => text(ids, rank as never, ID)))
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
  text(store, 'id', ID)
  text(store, 'host', HOST)
  const base = /^https:\/\/([^/]+)\/magasin-([0-9]{1,12})-[0-9]{1,12}$/.exec(text(store, 'baseUrl'))
  if (base?.[1] !== store.v.host || base?.[2] !== store.v.id) fail(at(store.p, 'baseUrl'))
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
    type === 'result' ? [...keys, 'outcome', 'error', 'lines'] : keys,
  )
  exactly(message, 'v', PROTOCOL_VERSION)
  text(message, 'runId', UUID)
  text(message, 'agentVersion', SEMVER)
  if (type === 'setup-result') {
    setupStore(message)
    return input as SetupResultMessage
  }
  const outcome = oneOf(message, 'outcome', OUTCOMES)
  optional(message, 'store', (parent, name) => text(object(parent, name, ['id']), 'id', ID))
  if (outcome === 'error' && message.v.error === undefined) fail('error')
  optional(message, 'error', (parent, name) => {
    const error = object(parent, name, ['code', 'message'])
    oneOf(error, 'code', ERROR_CODES)
    text(error, 'message', undefined, LIMITS.errorMessage)
  })
  each(message, 'lines', LIMITS.lines, resultLine)
  return input as ResultMessage
}
