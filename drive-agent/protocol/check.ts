// Petits contrôles partagés par les validateurs. Un contrôle lit le champ `key` d'un conteneur (`Scope`) et lève une `ProtocolError`
// dont le chemin désigne ce champ. Tous ont la même forme `(scope, key, …)`, ce qui garde les validateurs courts : l'agent est un
// seul fichier qui doit rester petit. La racine du message est la clé vide d'un conteneur, d'où un chemin vide.
import { ProtocolError } from './error'
import { CONTENT_UNITS, LIMITS } from './types'

export type Box = Record<string | number, unknown>
/** Un conteneur (objet ou liste) et son chemin (`lines[2].products`). */
export interface Scope {
  v: Box
  p: string
}
export type Key = string | number
export type Check = (scope: Scope, key: Key) => void

export const ID = /^[0-9]{1,12}$/
export const HOST = /^[a-z0-9-]+\.leclercdrive\.fr$/

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

export const productRef: Check = (scope, key) => {
  const own = object(scope, key, ['id', 'label'])
  text(own, 'id', ID)
  text(own, 'label')
}
