// Le mode configuration (DRV-307) : l'utilisateur ouvre son drive (magasin choisi) et Repas demande à l'agent de lire ce magasin. Rien
// n'est envoyé au site : le magasin se lit dans l'adresse de la page ; seul le magasin part vers Repas, après un « Enregistrer ».
import { LIMITS, PROTOCOL_VERSION, type SetupMessage } from '../../protocol'
import { LeclercError, type RetailerAdapter } from '../leclerc'
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
  const text = label?.replace(/\s+/g, ' ').trim() ?? ''
  return text === '' ? null : Array.from(text).slice(0, LIMITS.label).join('')
}

/**
 * Le gestionnaire du message `setup` (à brancher sur `FlowDeps.onSetup`) : lit le magasin de la page, demande « Enregistrer ce magasin
 * dans Repas ? » puis renvoie `setup-result`. Une page qui n'est pas celle d'un magasin donne `UNSUPPORTED_PAGE` ; refuser donne un
 * résultat `aborted`. Le magasin du message (celui que Repas connaît, s'il en connaît un) n'est pas comparé : on lit celui de la page.
 */
export function setupHandler(deps: SetupDeps): (message: SetupMessage) => Promise<void> {
  const { adapter, ui, send, agentVersion } = deps
  return async (message) => {
    let store
    try {
      store = adapter.readStore()
    } catch (error) {
      if (!(error instanceof LeclercError) || error.code !== 'UNSUPPORTED_PAGE') throw error
      const answer = await ui.show('error', { code: error.code, canReturn: true })
      if (answer === 'return') {
        send(buildResult(message, [], { outcome: 'error', code: error.code }, agentVersion))
      }
      ui.close()
      return
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
