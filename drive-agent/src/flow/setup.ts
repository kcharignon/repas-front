// Le mode configuration (DRV-307) : l'utilisateur ouvre son drive (magasin choisi) et Repas demande à l'agent de lire ce magasin. Rien
// n'est envoyé au site : le magasin se lit dans l'adresse de la page ; seul le magasin part vers Repas, après un seul geste, « Utiliser
// ce magasin » (DRV-623). Repas l'enregistre alors tout seul : l'agent ne demande pas deux fois la même chose.
import { LIMITS, PROTOCOL_VERSION, type SetupMessage } from '../../protocol'
import { LeclercError, type LeclercCause, type RetailerAdapter } from '../leclerc'
import { cleanText } from '../text'
import type { Ui } from '../ui'
import { buildResult } from './result'
import type { FlowDeps } from './types'

export interface SetupDeps {
  adapter: RetailerAdapter
  ui: Ui
  send: FlowDeps['send']
  agentVersion: string
}

/** Un libellé de magasin pour le protocole : de 1 à 255 caractères, ou rien. */
function labelOf(label: string | null): string | null {
  const text = cleanText(label ?? '')
  return text === '' ? null : Array.from(text).slice(0, LIMITS.label).join('')
}

/**
 * Le gestionnaire du message `setup` (à brancher sur `FlowDeps.onSetup`) : lit le magasin de la page, demande « Utiliser ce magasin ? »
 * (un seul écran, DRV-623) puis renvoie `setup-result`. Une page qui n'est pas celle d'un magasin donne `UNSUPPORTED_PAGE` ; refuser
 * donne un résultat `aborted`. Sans `store` dans le message (Repas ne connaît pas encore le magasin, DRV-320), on lit celui de la page ; avec un
 * `store`, la page doit être celle de ce magasin, sinon `STORE_MISMATCH`.
 */
export function setupHandler(deps: SetupDeps): (message: SetupMessage) => Promise<void> {
  const { adapter, ui, send, agentVersion } = deps
  return async (message) => {
    /** Un écran d'erreur ; « Retourner dans Repas » renvoie un résultat en erreur. */
    const stop = async (
      code: 'UNSUPPORTED_PAGE' | 'STORE_MISMATCH',
      cause: LeclercCause | null = null,
    ) => {
      const answer = await ui.show('error', { code, canReturn: true, ...(cause && { cause }) })
      if (answer === 'return') {
        send(
          buildResult(
            message,
            [],
            { outcome: 'error', code, ...(cause && { cause }) },
            agentVersion,
          ),
        )
      }
      ui.close()
    }
    let store
    try {
      store = adapter.readStore()
    } catch (error) {
      if (!(error instanceof LeclercError) || error.code !== 'UNSUPPORTED_PAGE') throw error
      return stop(error.code, error.cause)
    }
    if (message.store && (message.store.id !== store.id || message.store.host !== store.host)) {
      return stop('STORE_MISMATCH')
    }
    const label = labelOf(store.label)
    const answer = await ui.show('store', { id: store.id, label })
    if (answer === 'save') {
      send({
        v: PROTOCOL_VERSION,
        type: 'setup-result',
        runId: message.runId,
        agentVersion,
        store: { id: store.id, host: store.host, baseUrl: store.baseUrl, label },
      })
    } else {
      send(buildResult(message, [], { outcome: 'aborted' }, agentVersion))
    }
    ui.close()
  }
}
