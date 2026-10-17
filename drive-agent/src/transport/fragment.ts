import { decodeMessage, encodeMessage, ProtocolError, RETURN_PATH } from '../../protocol'
import type { Transport } from './transport'

const PREFIX = '#repas='

/** Ce que le transport utilise de la page : son fragment, et de quoi la quitter (injectés pour les tests). */
export interface FragmentPage {
  location: { hash: string }
  navigate(url: string): void
}

/**
 * Transport par fragment d'adresse. Aller : `#repas=<base64url>` dans l'adresse de la page. Retour : navigation vers l'origine de
 * Repas, `returnOrigin` (`https://…`, sans chemin), suivie du chemin de retour du protocole et de `#result=<base64url>`.
 * `returnOrigin` est écrite en dur dans l'agent : elle ne vient jamais d'un message.
 */
export function fragmentTransport(page: FragmentPage, returnOrigin: string): Transport {
  return {
    listen(onMessage, onInvalid) {
      const { hash } = page.location
      if (!hash.startsWith(PREFIX)) return
      let message: unknown
      try {
        message = decodeMessage(hash.slice(PREFIX.length))
      } catch (error) {
        if (error instanceof ProtocolError) return onInvalid(error)
        throw error
      }
      onMessage(message)
    },
    send(message) {
      page.navigate(`${returnOrigin}${RETURN_PATH}#result=${encodeMessage(message)}`)
    },
  }
}
