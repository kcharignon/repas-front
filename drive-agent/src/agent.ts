/**
 * Ce que l'agent fait quand l'application l'injecte dans une page de l'enseigne.
 *
 * Il écoute un plan de Repas (le pont de l'application, ou le fragment `#repas=` de l'adresse) et, dès qu'il en reçoit un, déroule le
 * passage : récapitulatif et confirmation, phase A, phase B (choix guidé), résultat (`flow/`, DRV-305 et DRV-306). Tant qu'aucun plan n'est reçu, l'agent reste
 * silencieux sur la page : aucune bannière, aucune variable globale, aucune requête.
 */
import { Flow, guidedChoice, setupHandler, type FlowDeps, type StorageLike } from './flow'
import { browserDeps, LeclercAdapter } from './leclerc'
import { bridgeTransport, type Bridge } from './transport/bridge'
import { fragmentTransport } from './transport/fragment'
import type { Transport } from './transport/transport'
import { createUi } from './ui'
import { AGENT_VERSION } from './version'

/**
 * L'origine de Repas, écrite en dur : le résultat ne part jamais ailleurs et ne la lit jamais dans un message. Le marqueur est
 * remplacé à la construction d'un agent qui rend son résultat par navigation (fragment) ; tel quel, l'agent refuse d'agir (le pont de
 * l'application, lui, n'en a pas besoin).
 */
const REPAS_ORIGIN = '__REPAS_ORIGIN__'
const ORIGIN_SHAPE = /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i

/** Le pont de l'application (`addWebMessageListener`, DRV-313) tel que la page le voit, s'il existe. */
function bridgeOf(win: Window): Bridge | undefined {
  return (win as unknown as { repasHost?: Bridge }).repasHost
}

/** `sessionStorage` peut être interdit (politique du navigateur) : l'agent s'en passe alors, sans reprise possible. */
function sessionStorageOf(win: Window): StorageLike | null {
  try {
    return win.sessionStorage
  } catch {
    return null
  }
}

/** Ce que les tests changent : l'origine, la navigation de retour, et n'importe laquelle des dépendances de l'orchestrateur. */
export interface AgentOptions {
  origin?: string
  navigate?: (url: string) => void
  flow?: Partial<FlowDeps>
}

export function run(win: Window & typeof globalThis = window, options: AgentOptions = {}): void {
  const origin = options.origin ?? REPAS_ORIGIN
  const bridge = bridgeOf(win)
  const transport: Transport = bridge
    ? bridgeTransport(bridge)
    : fragmentTransport(
        {
          location: win.location,
          navigate: options.navigate ?? ((url) => win.location.assign(url)),
        },
        origin,
      )
  const adapter = new LeclercAdapter(browserDeps(win))
  const ui = createUi({ win })
  const send = (message: Parameters<Transport['send']>[0]) => transport.send(message)
  const flow = new Flow({
    adapter,
    ui,
    send,
    storage: sessionStorageOf(win),
    wakeLock: win.navigator.wakeLock ?? null,
    now: () => Date.now(),
    agentVersion: AGENT_VERSION,
    canReturn: bridge !== undefined || ORIGIN_SHAPE.test(origin),
    phaseB: guidedChoice,
    // Un message `setup` : lire le magasin de la page, avec les mêmes dépendances que le passage (même celles que les tests changent).
    onSetup: (message) =>
      setupHandler({
        adapter: options.flow?.adapter ?? adapter,
        ui: options.flow?.ui ?? ui,
        send: options.flow?.send ?? send,
        agentVersion: options.flow?.agentVersion ?? AGENT_VERSION,
      })(message),
    ...options.flow,
  })
  transport.listen(
    (message) => void flow.start(message),
    () => void flow.invalid(),
  )
}
