import { exactly, object, oneOf, root } from './check'
import { COMMANDS, PROTOCOL_VERSION, type CommandMessage } from './types'

/**
 * Valide un message de l'application vers l'agent qui n'est pas un plan : `{v, type: 'command', command}`. Aucune clé inconnue tolérée.
 * Rend le message lui-même, typé ; lève une `ProtocolError` (`INVALID_MESSAGE`) sur le premier champ fautif.
 */
export function validateCommand(input: unknown): CommandMessage {
  const message = object(root(input), '', ['v', 'type', 'command'])
  exactly(message, 'v', PROTOCOL_VERSION)
  exactly(message, 'type', 'command')
  oneOf(message, 'command', COMMANDS)
  return input as CommandMessage
}
