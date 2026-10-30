// Le mode configuration (DRV-307) : l'utilisateur ouvre son drive (magasin choisi) et Repas demande à l'agent de lire ce magasin. Rien
// n'est envoyé au site : le magasin se lit dans l'adresse de la page ; seul le magasin part vers Repas, après un seul geste, « Utiliser
// ce magasin » (DRV-623). Repas l'enregistre alors tout seul : l'agent ne demande pas deux fois la même chose.
// Chez une enseigne dont le magasin se choisit SUR LA PAGE (DRV-740), la première configuration commence avant ce choix : l'agent n'affiche pas d'erreur, il laisse la
// page utilisable sous un bandeau et attend (lecture de la page seule) que la barre du magasin dise qu'il est choisi, puis lit le magasin une seule fois.
import { LIMITS, PROTOCOL_VERSION, type SetupMessage } from '../../protocol'
import {
  RetailerError,
  type RetailerAdapter,
  type RetailerCause,
  type RetailerErrorCode,
} from '../retailers'
import { cleanText } from '../text'
import type { Ui } from '../ui'
import { buildResult } from './result'
import type { FlowDeps } from './types'

export interface SetupDeps {
  adapter: RetailerAdapter
  ui: Ui
  send: FlowDeps['send']
  agentVersion: string
  /** L'enseigne de la page (voir `FlowDeps.retailer`) : un `setup` d'une autre enseigne est refusé (`STORE_MISMATCH`). */
  retailer?: string
  /** Une pause (ms) : le rythme de l'attente du choix du magasin (DRV-740). Par défaut le temps réel. */
  sleep?: (ms: number) => Promise<void>
  /** L'horloge (ms) : la durée de l'attente du choix du magasin (DRV-740). */
  now?: () => number
}

/** Le rythme auquel l'agent regarde si la barre du magasin a changé pendant que la personne choisit (DRV-740) : une lecture de la page, aucune requête. */
export const STORE_WATCH_POLL_MS = 2_000

/** La durée au bout de laquelle l'attente du choix du magasin propose « Réessayer » et « Retourner dans Repas » (DRV-740) : 15 minutes. */
export const STORE_WATCH_MAX_MS = 15 * 60_000

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
  const { adapter, ui, send, agentVersion, retailer } = deps
  const now = deps.now ?? (() => Date.now())
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  return async (message) => {
    /** Renvoie à Repas un résultat en erreur, puis ferme l'interface. */
    const report = (code: RetailerErrorCode | 'STORE_MISMATCH', cause: RetailerCause | null) => {
      send(
        buildResult(
          message,
          [],
          { outcome: 'error', code, ...(cause && { cause }) },
          agentVersion,
          ui.retailer,
        ),
      )
    }
    /** Un écran d'erreur ; « Retourner dans Repas » renvoie un résultat en erreur. */
    const stop = async (
      code: RetailerErrorCode | 'STORE_MISMATCH',
      cause: RetailerCause | null = null,
    ) => {
      const answer = await ui.show('error', { code, canReturn: true, ...(cause && { cause }) })
      if (answer === 'return') report(code, cause)
      ui.close()
    }
    /**
     * Le bandeau « Choisis ton magasin » (DRV-740) : la page reste utilisable ; l'agent regarde la barre du magasin (une lecture de la page, aucune requête, toutes
     * les 2 s) jusqu'à ce qu'elle dise qu'un magasin est choisi (`chosen`), ou que la personne rentre (`return`). Au bout de 15 minutes, le bandeau propose
     * « Réessayer » (`retry`) ou rentrer.
     */
    const waitForChoice = async (
      chosenOnPage: () => boolean,
    ): Promise<'chosen' | 'return' | 'retry'> => {
      const started = now()
      let watching = true
      const asked = ui.show('storeWaiting', { stage: 'waiting' })
      const seen = (async (): Promise<'chosen' | 'late' | 'stopped'> => {
        while (watching) {
          if (chosenOnPage()) return 'chosen'
          if (now() - started >= STORE_WATCH_MAX_MS) return 'late'
          await sleep(STORE_WATCH_POLL_MS)
        }
        return 'stopped'
      })()
      const first = await Promise.race([asked, seen])
      watching = false
      if (first !== 'late') return first === 'stopped' ? 'return' : first
      return ui.show('storeWaiting', { stage: 'late' })
    }
    if (retailer !== undefined && message.retailer !== retailer) return stop('STORE_MISMATCH')
    let store
    for (;;) {
      try {
        store = await adapter.readStore()
        break
      } catch (error) {
        // Chez une enseigne dont le magasin se demande au site (DRV-717), la lecture peut aussi échouer par le réseau, un blocage ou un site changé.
        if (!(error instanceof RetailerError)) throw error
        // Le magasin se choisit SUR LA PAGE (DRV-740) et la page ne dit pas encore qu'il l'est : pas d'écran d'erreur, la personne est justement en train de le
        // choisir. Si la page dit déjà qu'il l'est et que le site n'en voit pas, c'est une vraie panne : l'écran d'erreur.
        const chosenOnPage = adapter.storeChosenOnPage?.bind(adapter)
        if (error.cause !== 'STORE_NOT_CHOSEN' || chosenOnPage === undefined || chosenOnPage()) {
          return stop(error.code, error.cause)
        }
        if ((await waitForChoice(chosenOnPage)) === 'return') {
          report(error.code, error.cause)
          ui.close()
          return
        }
        // `chosen` : une seule lecture du magasin ; `retry` : la même, à la demande de la personne.
      }
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
      send(buildResult(message, [], { outcome: 'aborted' }, agentVersion, ui.retailer))
    }
    ui.close()
  }
}
