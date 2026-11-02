import { at, each, exactly, fail, object, root, text } from './check'
import { LIMITS, PROTOCOL_VERSION, type LogMessage } from './types'

/**
 * Valide le message `log` de l'agent vers l'application (DRV-759, DRV-760), jamais vers Repas : `{v, type, lines}` (1 à 4 textes de formes pour la boîte de diagnostic native) OU
 * `{v, type, card}` (un écran de l'agent est à l'écran ou non, pour le bandeau de repli) ; une seule des deux clés, aucune clé inconnue. Rend le message lui-même, typé ; lève une
 * `ProtocolError` (`INVALID_MESSAGE`) sur le premier champ fautif. L'agent ne l'appelle pas (il écrit ces deux formes lui-même) : c'est la définition du contrat, lue par les tests.
 */
export function validateLog(input: unknown): LogMessage {
  const message = object(root(input), '', ['v', 'type', 'lines', 'card'])
  exactly(message, 'v', PROTOCOL_VERSION)
  exactly(message, 'type', 'log')
  const hasLines = message.v.lines !== undefined
  const hasCard = message.v.card !== undefined
  if (hasLines === hasCard) fail(at(message.p, hasLines ? 'card' : 'lines'), 'une seule des deux')
  if (hasCard) {
    if (typeof message.v.card !== 'boolean') fail(at(message.p, 'card'))
  } else {
    each(message, 'lines', LIMITS.logLines, (lines, index) => {
      text(lines, index, undefined, LIMITS.logLine)
    })
    if ((message.v.lines as unknown[]).length === 0) fail(at(message.p, 'lines'))
  }
  return input as LogMessage
}
