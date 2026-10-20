import { fakeNative } from './fakeNative'
import type { SentMessage } from './fakeNative'

/** Ce que l'application dit de la mise à jour (`update.state`), tel qu'elle l'écrit : les mots du protocole, sans rien d'autre. */
export type WireUpdateState = Record<string, unknown> & { state: string }

export interface FakeUpdateAppOptions {
  /** La version installée (`app.info`). */
  version?: string
  /** L'application annonce `selfUpdate: true` (la variante hors Google Play). Sinon elle répond comme une application qui ne connaît pas `update.*`. */
  selfUpdate?: boolean
  /** Ce que la recherche (`update.check`) trouve : `newer` (0.1.30), `same` (à jour), `offline` (erreur `OFFLINE`), `silent` (aucune réponse). */
  remote?: 'newer' | 'same' | 'offline' | 'silent'
  /** L'état que l'application dit à `update.status` (par défaut `inconnu`). */
  state?: WireUpdateState
}

/**
 * Une application Repas qui sait se mettre à jour elle-même, pour les tests des écrans (DRV-639) : le faux pont répond à `app.info`, à
 * `update.status` et à `update.check`. `update.start` est seulement noté : le test fait ensuite parler l'application (`say`) pour jouer le
 * téléchargement, l'erreur ou l'installateur, état par état. Aucun réseau, aucune installation.
 */
export function fakeUpdateApp(options: FakeUpdateAppOptions = {}) {
  const { version = '0.1.26', selfUpdate = true, remote = 'newer' } = options
  let current: WireUpdateState = options.state ?? { state: 'inconnu' }

  const native = fakeNative((message: SentMessage, reply) => {
    const say = (state: WireUpdateState) => {
      current = state
      reply({ v: 1, type: 'update.state', ...state })
    }
    switch (message.type) {
      case 'app.info':
        return reply({
          v: 1,
          type: 'app.info',
          version,
          versionCode: 1026,
          drive: true,
          ...(selfUpdate ? { selfUpdate: true } : {}),
        })
      case 'update.status':
      case 'update.check':
      case 'update.start':
      case 'update.cancel':
        if (!selfUpdate) return reply({ v: 1, type: 'error', code: 'UNKNOWN_TYPE' })
        if (message.type === 'update.status') return say(current)
        if (message.type !== 'update.check') return
        say({ state: 'verification' })
        if (remote === 'newer') say({ state: 'miseAJourDisponible', version: '0.1.30' })
        else if (remote === 'same') say({ state: 'aJour' })
        else if (remote === 'offline') say({ state: 'erreur', code: 'OFFLINE' })
    }
  })

  return {
    ...native,
    /** Les messages `update.*` reçus, dans l'ordre. */
    updateMessages: () =>
      native.sent
        .filter((message) => message.type.startsWith('update.'))
        .map((message) => message.type),
    /** L'application dit un état de la mise à jour, comme si elle venait de le changer. */
    say: (state: WireUpdateState) => {
      current = state
      native.reply({ v: 1, type: 'update.state', ...state })
    },
  }
}

/** Pose le faux pont comme `window.repasNative` (à défaire par `removeFakeApp`). */
export function installFakeApp(app: Pick<ReturnType<typeof fakeNative>, 'bridge'>): void {
  ;(globalThis as { repasNative?: unknown }).repasNative = app.bridge
}

export function removeFakeApp(): void {
  delete (globalThis as { repasNative?: unknown }).repasNative
}
