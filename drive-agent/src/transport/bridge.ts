import { LIMITS, ProtocolError } from '../../protocol'
import { byteLength, parseJson, stringifyJson } from '../primitives'
import type { Transport } from './transport'

/**
 * Le pont de l'application Android (`WebViewCompat.addWebMessageListener`, DRV-313) tel que la page le voit : un objet qui reçoit les
 * messages de l'application et qui lui en envoie. L'application ne l'ouvre qu'aux pages `*.leclercdrive.fr`.
 */
export interface Bridge {
  /**
   * Vrai seulement dans la variante de débogage de l'application : son script d'injection le pose sur le pont (et l'annonce dans son
   * message d'accueil, `debug: true`). Sans lui, l'agent n'honore pas la commande `selftest` (DRV-318).
   */
  readonly isDebug?: boolean
  postMessage(text: string): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
}

/** Transport par le pont de l'application : les messages du protocole y passent en JSON (texte), 64 Ko au plus. */
export function bridgeTransport(bridge: Bridge): Transport {
  return {
    listen(onMessage, onInvalid) {
      bridge.addEventListener('message', (event) => {
        let message: unknown
        try {
          const { data } = event
          if (typeof data !== 'string') throw new ProtocolError('', 'texte attendu')
          if (byteLength(data) > LIMITS.messageBytes) {
            throw new ProtocolError('', 'message trop volumineux')
          }
          message = parseJson(data)
        } catch (error) {
          return onInvalid(
            error instanceof ProtocolError ? error : new ProtocolError('', 'JSON invalide'),
          )
        }
        onMessage(message)
      })
    },
    send(message) {
      const text = stringifyJson(message)
      if (byteLength(text) > LIMITS.messageBytes) {
        throw new ProtocolError('', 'message trop volumineux')
      }
      bridge.postMessage(text)
    },
  }
}
