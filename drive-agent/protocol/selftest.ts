import { at, exactly, fail, object, root, text } from './check'
import { LIMITS, PROTOCOL_VERSION, type SelftestResultMessage } from './types'

const SEMVER = /^\d+\.\d+\.\d+$/

/**
 * Valide le message de l'agent vers l'application qui porte le rapport du test automatique (DRV-318) : `{v, type, ok, agentVersion,
 * report}`. Aucune clé inconnue tolérée. Rend le message lui-même, typé ; lève une `ProtocolError` (`INVALID_MESSAGE`) sur le premier
 * champ fautif.
 */
export function validateSelftestResult(input: unknown): SelftestResultMessage {
  const message = object(root(input), '', ['v', 'type', 'ok', 'agentVersion', 'report'])
  exactly(message, 'v', PROTOCOL_VERSION)
  exactly(message, 'type', 'selftest-result')
  if (typeof message.v.ok !== 'boolean') fail(at(message.p, 'ok'))
  text(message, 'agentVersion', SEMVER)
  text(message, 'report', undefined, LIMITS.selftestReport)
  return input as SelftestResultMessage
}
