// Petits contrôles partagés par les validateurs. Un contrôle lit le champ `key` d'un conteneur (`Scope`) et lève une `ProtocolError`
// dont le chemin désigne ce champ. Tous ont la même forme `(scope, key, …)`, ce qui garde les validateurs courts : l'agent est un
// seul fichier qui doit rester petit. La racine du message est la clé vide d'un conteneur, d'où un chemin vide.
import { ProtocolError } from './error'
import { isPackValue, UNIT_SLUG } from './pack-size'
import { CONTENT_UNITS, LIMITS, RETAILER_IDS, type RetailerId } from './types'

export type Box = Record<string | number, unknown>
/** Un conteneur (objet ou liste) et son chemin (`lines[2].products`). */
export interface Scope {
  v: Box
  p: string
}
export type Key = string | number
export type Check = (scope: Scope, key: Key) => void

export const ID = /^[0-9]{1,12}$/
/** Ce que le protocole demande d'un magasin d'une enseigne (voir `STORES`). */
export interface StoreRules {
  /** Les hôtes où les magasins de l'enseigne vivent. */
  host: RegExp
  /** La forme de l'identifiant du magasin : propre à l'enseigne (numérique, UUID…), jamais supposée déduite d'une adresse. */
  id: RegExp
  /** L'adresse de base d'un magasin (`setup-result`) est celle de cet hôte et de ce magasin : la règle de l'enseigne. */
  base(url: string, host: string, id: string): boolean
  /**
   * La forme de l'identifiant d'offre d'un produit (DRV-722, `offerIdPattern` du contrat des enseignes), ou `null` quand l'enseigne n'a pas d'offre : la clé
   * `offerId` est alors interdite dans ses messages.
   */
  offerId: RegExp | null
}

/**
 * Ce qui est propre à chaque enseigne : ses hôtes, l'identifiant de son magasin et l'adresse de base. Chaque règle ne vaut que pour les messages de
 * cette enseigne ; le validateur n'en suppose aucune (ni que l'identifiant vienne de l'adresse, ni qu'il soit numérique).
 */
export const STORES: Record<RetailerId, StoreRules> = {
  leclerc: {
    host: /^[a-z0-9-]+\.leclercdrive\.fr$/,
    id: ID,
    base: (url, host, id) => {
      const found = /^https:[/][/]([^/]+)[/]magasin-([0-9]{1,12})-[0-9]{1,12}$/.exec(url)
      return found?.[1] === host && found?.[2] === id
    },
    offerId: null,
  },
}

/** Une forme d'identifiant de magasin d'une enseigne quelconque (un `result` ne dit pas l'enseigne). */
export const ANY_STORE_ID = new RegExp(
  RETAILER_IDS.map((id) => `(?:${STORES[id].id.source})`).join('|'),
)

/**
 * La forme d'un identifiant d'offre d'une enseigne quelconque (un `result` ne dit pas l'enseigne), ou `null` quand aucune enseigne n'a d'offre : la clé est alors
 * interdite. Calculée à l'appel, pas au chargement : le registre est la seule source.
 */
export function anyOfferId(): RegExp | null {
  const rules = RETAILER_IDS.map((id) => STORES[id].offerId).filter((rule) => rule !== null)
  return rules.length === 0 ? null : new RegExp(rules.map((rule) => `(?:${rule.source})`).join('|'))
}

/** L'enseigne dont ce texte est un hôte de magasin, ou `undefined`. */
export function retailerOfHost(host: string): RetailerId | undefined {
  return RETAILER_IDS.find((id) => STORES[id].host.test(host))
}

export function fail(path: string, reason = 'invalide'): never {
  throw new ProtocolError(path, reason)
}

/** Le chemin d'une clé (`lines`, `.status`) ou d'un rang (`[2]`). */
export function at(path: string, key: Key): string {
  if (typeof key === 'number') return `${path}[${key}]`
  return path === '' ? key : `${path}.${key}`
}

/** Le message entier, comme conteneur de lui-même. */
export function root(message: unknown): Scope {
  return { v: { '': message }, p: '' }
}

/** Un objet dont aucune clé n'est hors de `keys` (sans `keys`, toutes sont permises) ; rend son conteneur. */
export function object(scope: Scope, key: Key, keys?: readonly string[]): Scope {
  const value = scope.v[key]
  const path = at(scope.p, key)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path)
  for (const name of Object.keys(value)) {
    if (keys && !keys.includes(name)) fail(at(path, name), 'clé inconnue')
  }
  return { v: value as Box, p: path }
}

export function exactly(scope: Scope, key: Key, expected: string | number): void {
  if (scope.v[key] !== expected) fail(at(scope.p, key))
}

/** Une valeur de la liste ; la rend, pour choisir la suite. */
export function oneOf<T extends string>(scope: Scope, key: Key, list: readonly T[]): T {
  const value = scope.v[key]
  return list.includes(value as T) ? (value as T) : fail(at(scope.p, key))
}

/** Une chaîne de 1 à `max` caractères (au sens d'Unicode, pas des unités UTF-16), qui suit `pattern` s'il y en a un. */
export function text(scope: Scope, key: Key, pattern?: RegExp, max: number = LIMITS.label): string {
  const value = scope.v[key]
  const length = typeof value === 'string' ? [...value].length : 0
  if (length < 1 || length > max || (pattern && !pattern.test(value as string)))
    fail(at(scope.p, key))
  return value as string
}

/** Un entier de `min` à `max`. */
export function int(scope: Scope, key: Key, min: number, max: number): void {
  const value = scope.v[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail(at(scope.p, key))
  }
}

/** Une liste de `max` éléments au plus, chacun lu par `check` ; rend la liste comme conteneur. */
export function each(scope: Scope, key: Key, max: number, check: Check): Scope {
  const value = scope.v[key]
  if (!Array.isArray(value) || value.length > max) return fail(at(scope.p, key))
  const list = { v: value as unknown as Box, p: at(scope.p, key) }
  value.forEach((_item, index) => check(list, index))
  return list
}

/** Comme `each`, mais une clé absente donne une liste vide. */
export function eachIfPresent(scope: Scope, key: Key, max: number, check: Check): Scope {
  return scope.v[key] === undefined
    ? { v: [] as unknown as Box, p: at(scope.p, key) }
    : each(scope, key, max, check)
}

/** Une clé facultative : absente, ou valide selon `check`. */
export function optional(scope: Scope, key: Key, check: Check): void {
  if (scope.v[key] !== undefined) check(scope, key)
}

/** Un contrôle qui accepte aussi `null`. */
export function orNull(check: Check): Check {
  return (scope, key) => {
    if (scope.v[key] !== null) check(scope, key)
  }
}

/** Les valeurs de `key` dans les objets d'une liste (ou les éléments eux-mêmes sans `key`). */
export function values(list: Scope, key?: string): string[] {
  return (list.v as unknown as unknown[]).map(
    (item) => (key === undefined ? item : (item as Box)[key]) as string,
  )
}

/** Aucune valeur en double ; la faute est signalée au rang du doublon, suivi de `.key` pour une liste d'objets. */
export function distinct(list: Scope, key?: string): void {
  const seen = new Set<string>()
  values(list, key).forEach((value, index) => {
    const path = at(list.p, index)
    if (seen.has(value)) fail(key === undefined ? path : at(path, key), 'doublon')
    seen.add(value)
  })
}

export const content: Check = (scope, key) => {
  const own = object(scope, key, ['value', 'unit'])
  const amount = own.v.value
  if (typeof amount !== 'number' || !(amount > 0) || !Number.isFinite(amount)) {
    fail(at(own.p, 'value'))
  }
  oneOf(own, 'unit', CONTENT_UNITS)
}

/** Une contenance dans l'unité de la liste (DRV-652) : `{value, unitSlug}`, la valeur de 0,001 à 9 999 avec trois décimales au plus, l'unité un slug. */
export const packSize: Check = (scope, key) => {
  const own = object(scope, key, ['value', 'unitSlug'])
  if (!isPackValue(own.v.value)) fail(at(own.p, 'value'))
  text(own, 'unitSlug', UNIT_SLUG, LIMITS.unitSlug)
}

/**
 * Un identifiant d'offre (DRV-722) : 1 à `LIMITS.offerId` caractères et la forme `rule` de l'enseigne ; `null` (enseigne sans offre) l'interdit, la clé est
 * alors inconnue comme n'importe quelle autre.
 */
export const offerId =
  (rule: RegExp | null): Check =>
  (scope, key) => {
    if (rule === null) fail(at(scope.p, key), 'enseigne sans offre')
    text(scope, key, rule, LIMITS.offerId)
  }

export const productRef: Check = (scope, key) => {
  const own = object(scope, key, ['id', 'label'])
  text(own, 'id', ID)
  text(own, 'label')
}
