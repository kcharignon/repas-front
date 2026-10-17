/**
 * Ce que l'agent fait quand l'application l'injecte dans une page de l'enseigne.
 *
 * Il écoute un plan de Repas (le pont de l'application, ou le fragment `#repas=` de l'adresse) et, dès qu'il en reçoit un, déroule le
 * passage : récapitulatif et confirmation, phase A, phase B (choix guidé), résultat (`flow/`, DRV-305 et DRV-306) ; un message `setup`
 * lit le magasin de la page (DRV-307). Tant qu'aucun plan n'est reçu, l'agent reste silencieux sur la page : aucune bannière, aucune
 * variable globale, aucune requête. Deux exceptions, toutes deux pour le diagnostic (DRV-308) : une commande `diagnostic` de l'application
 * (le menu de « Repas Drive » ; le diagnostic s'ouvre aussitôt) ou, pour le favori de bureau, une adresse de page qui se termine par
 * `#repas-diagnostic` (l'écran d'accueil s'affiche, d'où l'on lance le diagnostic).
 */
import { validateCommand } from '../protocol'
import { showDiagnostic, type DiagnosticDeps } from './diagnostic'
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

/** Le fragment d'adresse qui ouvre l'écran d'accueil de l'agent (et, de là, le diagnostic). */
export const DIAGNOSTIC_HASH = '#repas-diagnostic'

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
  /** Copie le rapport du diagnostic (par défaut le presse-papiers de la page). */
  copy?: (text: string) => Promise<boolean>
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
  const deps: FlowDeps = {
    adapter,
    ui,
    send,
    storage: sessionStorageOf(win),
    wakeLock: win.navigator.wakeLock ?? null,
    now: () => Date.now(),
    agentVersion: AGENT_VERSION,
    canReturn: bridge !== undefined || ORIGIN_SHAPE.test(origin),
    phaseB: guidedChoice,
    ...options.flow,
  }
  // Le mode configuration (DRV-307) et le diagnostic (DRV-308) partagent les dépendances du passage (celles que les tests changent aussi).
  deps.onSetup ??= setupHandler(deps)
  const flow = new Flow(deps)
  const diagnosticDeps = (): DiagnosticDeps => ({
    ...deps,
    originReplaced: bridge ? null : ORIGIN_SHAPE.test(origin),
    copy: options.copy ?? ((text) => copyText(win, text)),
  })
  transport.listen(
    (message) => {
      if (isCommand(message)) return void command(flow, message, diagnosticDeps)
      void flow.start(message)
    },
    () => void flow.invalid(),
  )
  if (win.location.hash === DIAGNOSTIC_HASH) void welcome(diagnosticDeps())
}

/** Un message dont le type est `command` : il ne passe pas par la validation d'un plan. */
function isCommand(message: unknown): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'command'
  )
}

/**
 * Une commande de l'application (DRV-308) : `diagnostic` ouvre l'écran du diagnostic. Elle n'ouvre rien pendant un passage (un seul écran
 * à la fois) et ne renvoie rien à l'application ; une commande invalide montre « liste illisible ».
 */
async function command(flow: Flow, raw: unknown, depsOf: () => DiagnosticDeps): Promise<void> {
  try {
    validateCommand(raw)
  } catch {
    return flow.invalid()
  }
  await flow.exclusive(async () => {
    const deps = depsOf()
    await showDiagnostic(deps)
    deps.ui.close()
  })
}

/** L'écran d'accueil : « Ouvre d'abord Repas », et le diagnostic pour qui le demande. */
async function welcome(deps: DiagnosticDeps): Promise<void> {
  const answer = await deps.ui.show('welcome', {})
  if (answer === 'diagnostic') await showDiagnostic(deps)
  deps.ui.close()
}

/** Copie dans le presse-papiers ; le navigateur peut refuser (WebView, page sans focus) : `false`, et l'écran propose de copier à la main. */
async function copyText(win: Window, text: string): Promise<boolean> {
  try {
    await win.navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
