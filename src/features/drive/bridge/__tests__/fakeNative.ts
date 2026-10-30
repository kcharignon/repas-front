import { vi } from 'vitest'
import type { PlanMessage } from '@drive-protocol'

import type { NativeBridge } from '../native'

type Listener = (event: { data: unknown }) => void

/** Un message envoyé par la page à l'application, lu comme JSON (`plan` pour `drive.start`, `runId` pour `drive.setup`). */
export interface SentMessage {
  v: number
  type: string
  plan?: PlanMessage
  runId?: string
  /** Le drive dont on lit le magasin (`drive.setup`, DRV-709). */
  retailer?: string
}

/**
 * Un faux pont natif `repasNative` pour les tests des écrans du drive : il enregistre ce que la page envoie (`sent`, JSON déjà lu ;
 * `texts`, le texte brut) et rejoue ce que l'application répondrait (`reply`, un texte ou un objet qu'on met en JSON ; `emit`, une donnée brute). `onMessage`
 * fait répondre le faux pont à chaque message reçu. `window` : de quoi le brancher (`createDriveBridge({ window })`).
 */
export function fakeNative(
  onMessage?: (message: SentMessage, reply: (message: unknown) => void) => void,
) {
  const listeners = new Set<Listener>()
  const sent: SentMessage[] = []
  const texts: string[] = []

  /** Le contenu brut d'un événement `message` : n'importe quoi, comme le pont réel pourrait le livrer. */
  const emit = (data: unknown) => {
    for (const listener of listeners) listener({ data })
  }
  const reply = (message: unknown) =>
    emit(typeof message === 'string' ? message : JSON.stringify(message))

  const bridge: NativeBridge = {
    postMessage: vi.fn<(text: string) => void>((text) => {
      texts.push(text)
      const message = JSON.parse(text) as SentMessage
      sent.push(message)
      onMessage?.(message, reply)
    }),
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
  }

  return {
    bridge,
    sent,
    texts,
    reply,
    emit,
    listenerCount: () => listeners.size,
    window: { repasNative: bridge, localStorage: globalThis.localStorage },
  }
}
