import { LIMITS, PROTOCOL_VERSION, ProtocolError, validatePlan } from '@drive-protocol'
import type { PlanMessage, SetupResultMessage } from '@drive-protocol'

import { browserDraftStorage, createDraftStore, sentLinesOf } from './draft'
import type { DraftStorage, DriveResult, RunDraft } from './draft'
import { DriveBridgeError } from './errors'
import { byteLength, findNativeBridge, parseInbound } from './native'
import type { AppInfo, Inbound, NativeBridge } from './native'
import type { AppUpdateState } from './update'

/** Ce que le pont annonce aux écrans (`onEvent`). */
export type DriveEvent =
  /** Le résultat du passage en cours (`draft` : à quelle liste il appartient). L'écran efface ensuite le brouillon (`clearDraft`). */
  | { kind: 'result'; result: DriveResult; draft: RunDraft }
  /** Un résultat qui n'est pas celui du passage en cours (autre `runId`, brouillon expiré ou absent) : à ignorer. */
  | { kind: 'stale'; result: DriveResult }
  /** L'application a refusé un message `drive.*` (`code` : `UNAVAILABLE`…, `runId` du passage concerné s'il est connu). */
  | { kind: 'refused'; code: string; runId: string | null }
  /** L'application a envoyé une réponse du drive mal formée (`detail` : le champ fautif). */
  | { kind: 'invalid'; detail: string | null }

/** Le magasin lu par l'agent sur la page du drive (`setup-result`). */
export type SetupStore = SetupResultMessage['store']

export interface DriveBridgeOptions {
  /** La fenêtre qui porte `repasNative` ; par défaut celle de la page (cherchée à chaque appel). */
  window?: object
  /** Où garder le brouillon ; par défaut `localStorage` (la mémoire de la page s'il est refusé). */
  storage?: DraftStorage
  now?: () => Date
  /** Attente de la réponse à `app.info`, en millisecondes. */
  infoTimeoutMs?: number
}

/** Combien de temps `app.info` attend la réponse de l'application avant de dire `TIMEOUT` (une application trop ancienne ne répond pas). */
export const INFO_TIMEOUT_MS = 3000

/** Au plus autant d'événements gardés pour un écran qui n'est pas encore là (le résultat peut arriver pendant un changement de page). */
const BUFFER = 20

/**
 * Le seul endroit qui connaît le pont natif de l'application Repas (`repasNative`, DRV-317) : les écrans du drive (DRV-403 à 405) n'en
 * voient ni le format ni le stockage du brouillon. Aucun appel réseau ; rien n'est journalisé (un plan est la liste de courses).
 */
export function createDriveBridge(options: DriveBridgeOptions = {}) {
  const win = (): object => options.window ?? globalThis
  const now = options.now ?? (() => new Date())
  const drafts = createDraftStore(
    options.storage ?? browserDraftStorage(win() as { localStorage?: Storage }),
    now,
  )

  const listeners = new Set<(event: DriveEvent) => void>()
  /** Ceux qui écoutent la mise à jour de l'application (DRV-639). */
  const updateListeners = new Set<(state: AppUpdateState) => void>()
  const buffered: DriveEvent[] = []
  let listening: NativeBridge | null = null
  let infoInFlight: Promise<AppInfo> | null = null
  /** La lecture du magasin en cours (DRV-320) : un seul à la fois, en mémoire de la page. */
  let pendingSetup: {
    runId: string
    /** Le drive dont on lit le magasin (`null` : celui d'avant les drives multiples, sans `retailer` dans le message). */
    retailer: string | null
    promise: Promise<SetupStore>
    resolve: (store: SetupStore) => void
    reject: (error: DriveBridgeError) => void
  } | null = null
  let pendingInfo: {
    resolve: (info: AppInfo) => void
    reject: (error: DriveBridgeError) => void
    timer: ReturnType<typeof setTimeout>
  } | null = null

  const publish = (event: DriveEvent) => {
    if (listeners.size === 0) {
      if (event.kind !== 'invalid') buffered.push(event)
      if (buffered.length > BUFFER) buffered.shift()

      return
    }
    for (const listener of listeners) listener(event)
  }

  const settleInfo = (settle: (pending: NonNullable<typeof pendingInfo>) => void) => {
    if (pendingInfo === null) return
    const pending = pendingInfo
    pendingInfo = null
    clearTimeout(pending.timer)
    settle(pending)
  }

  /** Termine la lecture du magasin en cours ; faux s'il n'y en a pas (ou si la réponse n'est pas la sienne). */
  const settleSetup = (
    runId: string | null,
    settle: (pending: NonNullable<typeof pendingSetup>) => void,
  ) => {
    if (pendingSetup === null || (runId !== null && runId !== pendingSetup.runId)) return false
    const pending = pendingSetup
    pendingSetup = null
    settle(pending)

    return true
  }

  /** Le résultat de l'agent pour la lecture du magasin : le magasin, ou pourquoi il n'y en a pas. */
  const receiveSetup = (result: DriveResult): boolean =>
    settleSetup(result.runId, (pending) => {
      if (result.type === 'setup-result') return pending.resolve(result.store)
      pending.reject(
        result.outcome === 'aborted'
          ? new DriveBridgeError('CANCELLED')
          : new DriveBridgeError('SETUP_FAILED', result.error?.code ?? null),
      )
    })

  const receive = (inbound: Inbound) => {
    switch (inbound.type) {
      case 'app.info':
        return settleInfo((pending) => pending.resolve(inbound.info))
      case 'error':
        return settleInfo((pending) =>
          pending.reject(new DriveBridgeError('REFUSED', inbound.code)),
        )
      case 'drive.error':
        // Pendant une lecture du magasin, un refus est le sien (le `runId` d'un BUSY est celui du passage qui occupe la place)
        if (
          settleSetup(null, (pending) =>
            pending.reject(new DriveBridgeError('REFUSED', inbound.code)),
          )
        )
          return

        return publish({ kind: 'refused', code: inbound.code, runId: inbound.runId })
      case 'update.state':
        for (const listener of updateListeners) listener(inbound.state)

        return
      case 'invalid':
        // Une réponse mal formée à `app.info` ne doit pas laisser l'appel en attente
        settleInfo((pending) =>
          pending.reject(new DriveBridgeError('INVALID_RESPONSE', inbound.detail)),
        )

        return publish({ kind: 'invalid', detail: inbound.detail })
      case 'drive.result': {
        if (receiveSetup(inbound.result)) return
        const draft = drafts.load()
        if (draft !== null && draft.runId === inbound.result.runId)
          return publish({ kind: 'result', result: inbound.result, draft })
        // Un magasin lu que personne n'attend (page rechargée) n'est pas un passage périmé : rien à montrer
        if (inbound.result.type === 'setup-result') return

        return publish({ kind: 'stale', result: inbound.result })
      }
    }
  }

  /** Écoute le pont (une seule fois par pont) ; `null` hors de l'application. */
  const connect = (): NativeBridge | null => {
    const native = findNativeBridge(win())
    if (native !== null && native !== listening) {
      native.addEventListener('message', (event) => {
        const inbound = parseInbound(event.data)
        if (inbound !== null) receive(inbound)
      })
      listening = native
    }

    return native
  }

  const requireNative = (): NativeBridge => {
    const native = connect()
    if (native === null) throw new DriveBridgeError('UNAVAILABLE')

    return native
  }

  const send = (native: NativeBridge, message: object): void => {
    const text = JSON.stringify(message)
    if (byteLength(text) > LIMITS.messageBytes) throw new DriveBridgeError('TOO_LARGE')
    try {
      native.postMessage(text)
    } catch {
      throw new DriveBridgeError('SEND_FAILED')
    }
  }

  return {
    /** L'application Repas est-elle là ? Faux dans un navigateur ordinaire : proposer l'installation (DRV-316) et le mode assisté. */
    isAvailable: (): boolean => findNativeBridge(win()) !== null,

    /** La version de l'application et l'état du drive (`app.info`). */
    info(): Promise<AppInfo> {
      const native = requireNative()
      // Une demande déjà en cours : sa réponse sert à tous ceux qui attendent
      infoInFlight ??= new Promise<AppInfo>((resolve, reject) => {
        const timer = setTimeout(
          () => settleInfo((pending) => pending.reject(new DriveBridgeError('TIMEOUT'))),
          options.infoTimeoutMs ?? INFO_TIMEOUT_MS,
        )
        pendingInfo = { resolve, reject, timer }
        try {
          send(native, { v: PROTOCOL_VERSION, type: 'app.info' })
        } catch (error) {
          settleInfo((pending) => pending.reject(error as DriveBridgeError))
        }
      }).finally(() => (infoInFlight = null))

      return infoInFlight
    },

    /**
     * Lance le passage : valide le plan (protocole v1), garde le brouillon puis envoie `drive.start`. La suite arrive par `onEvent`
     * (`result`, ou `refused` si l'application refuse). Un passage de moins de 24 h non terminé (un autre `runId`) bloque : l'écran
     * propose de le reprendre ou de l'abandonner (`cancel`, puis `clearDraft`). Rend le brouillon enregistré.
     */
    startRun(plan: PlanMessage, listId: string): RunDraft {
      const native = requireNative()
      let message: PlanMessage
      try {
        const valid = validatePlan(plan)
        if (valid.type !== 'plan') throw new DriveBridgeError('INVALID_PLAN', 'type')
        message = valid
      } catch (error) {
        if (error instanceof DriveBridgeError) throw error
        throw new DriveBridgeError(
          'INVALID_PLAN',
          error instanceof ProtocolError ? error.path : null,
        )
      }
      const current = drafts.load()
      if (current !== null && current.runId !== message.runId)
        throw new DriveBridgeError('RUN_IN_PROGRESS')

      const draft: RunDraft = {
        runId: message.runId,
        listId,
        startedAt: current?.runId === message.runId ? current.startedAt : now().toISOString(),
        // Les lignes envoyées : l'écran du retour n'enregistre que ce qui s'y rattache (DRV-614)
        lines: sentLinesOf(message),
      }
      // Le brouillon d'abord : le résultat ne peut pas arriver avant qu'il soit gardé
      drafts.save(draft)
      try {
        send(native, { v: PROTOCOL_VERSION, type: 'drive.start', plan: message })
      } catch (error) {
        if (current === null) drafts.clear()
        throw error
      }

      return draft
    },

    /**
     * Fait lire le magasin à l'application (DRV-320, `drive.setup`) : elle ouvre le drive, l'utilisateur s'y connecte et choisit son
     * magasin, l'agent le lit et l'application revient ici. Rend le magasin lu ; rejette avec une `DriveBridgeError` : `UNAVAILABLE`
     * (hors de l'application), `REFUSED` (`detail` : `BUSY`, `UNAVAILABLE`, `INVALID_SETUP`), `CANCELLED` (abandon) ou `SETUP_FAILED`
     * (`detail` : le code de l'agent). Une lecture déjà en cours est rouverte et attendue, pas doublée ; celle d'un autre drive est refusée (`BUSY`).
     * `retailer` (DRV-709) : le drive dont on lit le magasin, écrit dans le message ; à ne donner qu'à une application qui l'annonce dans
     * `app.info.retailers` (une ancienne ne lit que le drive d'avant et ne connaît pas la clé). Sans lui, le message est celui d'avant.
     */
    startSetup(retailer: string | null = null): Promise<SetupStore> {
      const native = requireNative()
      if (pendingSetup !== null && pendingSetup.retailer !== retailer)
        return Promise.reject(new DriveBridgeError('REFUSED', 'BUSY'))
      const created = pendingSetup === null
      const runId = pendingSetup?.runId ?? crypto.randomUUID()
      if (pendingSetup === null) {
        let resolve!: (store: SetupStore) => void
        let reject!: (error: DriveBridgeError) => void
        const promise = new Promise<SetupStore>((ok, ko) => {
          resolve = ok
          reject = ko
        })
        pendingSetup = { runId, retailer, promise, resolve, reject }
      }
      const pending = pendingSetup
      try {
        send(native, {
          v: PROTOCOL_VERSION,
          type: 'drive.setup',
          runId,
          ...(retailer === null ? {} : { retailer }),
        })
      } catch (error) {
        if (created) pendingSetup = null
        throw error
      }

      return pending.promise
    },

    /** Ouvre le menu de l'application (`app.menu` : version, mode d'emploi, déconnexion de Leclerc). Sans réponse. */
    openMenu(): void {
      send(requireNative(), { v: PROTOCOL_VERSION, type: 'app.menu' })
    },

    /**
     * La mise à jour de l'application par elle-même (DRV-639). À n'appeler que si `info()` a dit `selfUpdate` : une application qui ne connaît pas ces
     * messages répond `error UNKNOWN_TYPE`. La page ne donne ni adresse, ni version, ni empreinte : l'application ne lit que les siennes. Les états
     * arrivent par `onUpdate` ; `updateStatus` redemande l'état actuel (après un rechargement de la page).
     */
    updateStatus(): void {
      send(requireNative(), { v: PROTOCOL_VERSION, type: 'update.status' })
    },

    /** Demande à l'application de chercher une version plus récente (`update.check`). L'état revient par `onUpdate`. */
    checkForUpdate(): void {
      send(requireNative(), { v: PROTOCOL_VERSION, type: 'update.check' })
    },

    /** Demande à l'application de télécharger, vérifier puis installer la version proposée (`update.start`). L'état revient par `onUpdate`. */
    startUpdate(): void {
      send(requireNative(), { v: PROTOCOL_VERSION, type: 'update.start' })
    },

    /** Arrête le téléchargement en cours (`update.cancel`). */
    cancelUpdate(): void {
      send(requireNative(), { v: PROTOCOL_VERSION, type: 'update.cancel' })
    },

    /** Écoute les états de la mise à jour. Rend la fonction qui arrête l'écoute. */
    onUpdate(listener: (state: AppUpdateState) => void): () => void {
      connect()
      updateListeners.add(listener)

      return () => updateListeners.delete(listener)
    },

    /**
     * Commence à écouter le pont sans attendre un écran : à appeler au démarrage de l'application, pour que le résultat arrivé avant
     * l'écran du retour soit gardé (puis rejoué par `onEvent`). Sans effet hors de l'application ou si l'écoute a déjà commencé.
     */
    listen(): void {
      connect()
    },

    /** Demande l'arrêt du passage : l'application répond par un résultat `aborted` (`onEvent`). Le brouillon reste jusque-là. */
    cancel(): void {
      send(requireNative(), { v: PROTOCOL_VERSION, type: 'drive.cancel' })
    },

    /**
     * Écoute ce que l'application envoie du drive. Les événements arrivés alors qu'aucun écran n'écoutait sont rejoués au premier
     * abonné. Rend la fonction qui arrête l'écoute.
     */
    onEvent(listener: (event: DriveEvent) => void): () => void {
      connect()
      listeners.add(listener)
      for (const event of buffered.splice(0)) listener(event)

      return () => listeners.delete(listener)
    },

    /** Le passage en cours (`runId`, `listId`, `startedAt`), s'il a moins de 24 h. Survit à un rechargement de la page. */
    loadDraft: (): RunDraft | null => drafts.load(),
    clearDraft: (): void => drafts.clear(),
    /** Ce résultat est-il celui du passage en cours ? Sinon il est périmé. */
    matchesDraft: (result: { runId: string }): boolean => drafts.matches(result),
  }
}

export type DriveBridge = ReturnType<typeof createDriveBridge>

/** Le pont de la page : les écrans importent celui-ci, les tests fabriquent le leur avec `createDriveBridge`. */
export const driveBridge: DriveBridge = createDriveBridge()
