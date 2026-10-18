// L'orchestrateur du passage (DRV-305) : une machine d'états sans réseau ni DOM propres, tout vient de `FlowDeps`.
//   START → VALIDATED → CONFIRMED → PHASE_A → PHASE_B → DONE      (+ ABORTED : l'utilisateur arrête ; ERROR : le passage s'interrompt)
// Rien n'est envoyé au site avant le « Commencer ». Un seul passage à la fois.
import {
  ProtocolError,
  validatePlan,
  type ErrorCode,
  type PlanLine,
  type PlanMessage,
  type ResultLine,
} from '../../protocol'
import { LeclercError, type LeclercCause } from '../leclerc'
import { own } from '../own'
import { S, type SummaryProps } from '../ui'
import type { CartNote } from './keep-cart'
import { settleKnownLine, type ContentChange } from './phase-a'
import { buildResult, cartsOf, changesOf, endProps, endingOf, resultLines } from './result'
import { emptyState, RunStore, type RunState } from './run-state'
import type { FlowDeps, PendingLine, Step } from './types'
import { keepAwake } from './wake-lock'

/** Un passage en cours. */
interface Run {
  plan: PlanMessage
  state: RunState
  names: Map<string, string>
  /** Les dernières actions affichées. */
  log: string[]
  /** L'ingrédient en cours. */
  current: string
  /** L'utilisateur a arrêté (ou annulé) : finir proprement. */
  stopped: boolean
  /** Le code qui a interrompu le passage (`BLOCKED`, `NOT_LOGGED_IN`…). */
  halted: ErrorCode | null
  /** Quelle vérification a échoué, quand l'adaptateur le dit (ticket A) : elle part dans le message du résultat. */
  cause: LeclercCause | null
  release: () => Promise<void>
}

const LOG_SIZE = 5

/** Ce qui interrompt un passage : le code d'erreur du protocole, et la vérification précise qui a échoué quand on la connaît. */
interface Fault {
  code: ErrorCode
  cause: LeclercCause | null
}

/**
 * Une erreur de l'adaptateur a son code et sa cause ; tout autre incident est un site qui ne répond plus comme prévu, de cause
 * `EXCEPTION` (jamais son message).
 */
function faultOf(error: unknown): Fault {
  return error instanceof LeclercError
    ? { code: error.code, cause: error.cause }
    : { code: 'CONTRACT_CHANGED', cause: 'EXCEPTION' }
}

/** Les lignes sans action sur le site : « j'en ai toujours » et « passer cette fois ». */
function staticOutcome(line: PlanLine): ResultLine | null {
  if (line.status === 'HAVE_AT_HOME')
    return { ingredientSlug: line.ingredientSlug, outcome: 'HAVE_AT_HOME' }
  if (line.status === 'SKIP') return { ingredientSlug: line.ingredientSlug, outcome: 'SKIPPED' }
  return null
}

const failed = (line: PlanLine, error: ErrorCode): ResultLine => ({
  ingredientSlug: line.ingredientSlug,
  outcome: 'FAILED',
  error,
})

function summaryOf(plan: PlanMessage): SummaryProps {
  const count = (status: PlanLine['status']) =>
    plan.lines.filter((line) => line.status === status).length
  return {
    known: count('KNOWN'),
    new: count('NEW'),
    haveAtHome: count('HAVE_AT_HOME'),
    skipped: count('SKIP'),
    lines: plan.lines.map((line) => {
      const preferred = line.status === 'KNOWN' ? line.products?.[0]?.label : undefined
      return { name: line.name, status: line.status, ...(preferred && { detail: preferred }) }
    }),
  }
}

export class Flow {
  /** Les états traversés par le dernier message reçu, dans l'ordre. */
  readonly history: Step[] = []
  private readonly deps: FlowDeps
  private readonly runs: RunStore
  private busy = false

  constructor(deps: FlowDeps) {
    this.deps = deps
    this.runs = new RunStore(deps.storage)
  }

  /** Un message de Repas, décodé et pas encore validé. Un seul passage à la fois : pendant l'un, les autres messages sont ignorés. */
  async start(raw: unknown): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.history.length = 0
    this.enter('START')
    try {
      await this.execute(raw)
    } catch {
      await this.showError('CONTRACT_CHANGED', null, 'EXCEPTION')
    } finally {
      this.busy = false
    }
  }

  /**
   * Une tâche qui prend l'écran de l'agent (le diagnostic, ouvert par une commande de l'application) : un seul passage ou écran à la
   * fois, donc ignorée pendant un passage, comme un passage l'est pendant elle.
   */
  async exclusive(task: () => Promise<void>): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      await task()
    } finally {
      this.busy = false
    }
  }

  /** Un message de Repas illisible (trop gros, ni base64url ni JSON). */
  async invalid(): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.history.length = 0
    this.enter('START')
    try {
      await this.showError('INVALID_MESSAGE', null)
    } finally {
      this.busy = false
    }
  }

  private enter(step: Step): void {
    this.history.push(step)
  }

  private async execute(raw: unknown): Promise<void> {
    const { deps } = this
    let message
    try {
      message = validatePlan(raw)
    } catch (error) {
      if (error instanceof ProtocolError) return this.showError('INVALID_MESSAGE', null)
      throw error
    }
    this.enter('VALIDATED')
    // Pas de retour possible vers Repas : on refuse avant de toucher au panier (ou de lire le magasin).
    if (!deps.canReturn) return this.showError('UNSUPPORTED_PAGE', null)
    if (message.type === 'setup') return void (await deps.onSetup?.(message))
    const problem = this.storeProblem(message) ?? this.sessionProblem()
    if (problem) return this.showError(problem.code, message, problem.cause)

    const { state, proceed } = await this.confirm(message)
    const run: Run = {
      plan: message,
      state,
      names: new Map(message.lines.map((line) => [line.ingredientSlug, line.name])),
      log: [],
      current: '',
      stopped: !proceed,
      halted: null,
      cause: null,
      release: () => Promise.resolve(),
    }
    if (proceed) {
      this.enter('CONFIRMED')
      this.runs.save(state)
      run.release = await keepAwake(deps.wakeLock)
      try {
        this.showProgress(run)
        this.enter('PHASE_A')
        await this.phaseA(run)
        if (!run.stopped && run.halted === null && this.pending(run).length > 0 && deps.phaseB) {
          this.enter('PHASE_B')
          await this.phaseB(run, deps.phaseB)
        }
      } finally {
        await run.release()
      }
    }
    await this.finish(run)
  }

  /** Le magasin de la page doit être celui du message. */
  private storeProblem(plan: PlanMessage): Fault | null {
    try {
      const store = this.deps.adapter.readStore()
      return store.id === plan.store.id && store.host === plan.store.host
        ? null
        : { code: 'STORE_MISMATCH', cause: null }
    } catch (error) {
      return faultOf(error)
    }
  }

  /**
   * Un visiteur non connecté ne remplit jamais un panier anonyme (ticket G) : si la page ouverte est celle d'un visiteur, l'agent s'arrête
   * AVANT le récapitulatif, sans une requête ni une écriture. Une page dont l'état de connexion est inconnu ne bloque rien (la lecture de
   * la page ne devine pas : voir `leclerc/session.ts`) ; les détections pendant le passage (redirection de connexion, 401, page d'un
   * visiteur dans une réponse de recherche) restent.
   */
  private sessionProblem(): Fault | null {
    try {
      return this.deps.adapter.readSession().state === 'VISITOR'
        ? { code: 'NOT_LOGGED_IN', cause: 'SESSION_VISITOR' }
        : null
    } catch {
      return null
    }
  }

  /** Reprise éventuelle, puis récapitulatif : rien ne part avant « Commencer » (ou « Reprendre », déjà confirmé). */
  private async confirm(plan: PlanMessage): Promise<{ state: RunState; proceed: boolean }> {
    const { ui, now } = this.deps
    const saved = this.runs.load(plan.runId)
    this.runs.removeOthers(plan.runId)
    if (saved) {
      const processed = Object.keys(saved.done).length + Object.keys(saved.waiting).length
      if (processed > 0) {
        const answer = await ui.show('resume', { done: processed, total: plan.lines.length })
        if (answer === 'resume') return { state: saved, proceed: true }
        if (answer === 'cancel') return { state: saved, proceed: false }
      }
      this.runs.remove(plan.runId)
    }
    const answer = await ui.show('summary', summaryOf(plan))
    return { state: emptyState(plan.runId, now()), proceed: answer === 'start' }
  }

  private async phaseA(run: Run): Promise<void> {
    for (const line of run.plan.lines) {
      if (run.stopped || run.halted !== null) return
      if (this.isProcessed(run, line)) continue
      run.current = line.name
      this.deps.ui.update({ current: line.name })
      try {
        await this.settle(run, line)
      } catch (error) {
        this.absorb(run, line, faultOf(error))
      }
    }
  }

  private async settle(run: Run, line: PlanLine): Promise<void> {
    const fixed = staticOutcome(line)
    if (fixed) return this.record(run, fixed)
    if (line.status === 'NEW') return this.wait(run, line, [])
    const verdict = await settleKnownLine(line, {
      adapter: this.deps.adapter,
      askQuantity: async (asked, product) => {
        const answer = await this.deps.ui.show('quantity', {
          ingredient: asked.name,
          productLabel: product.label,
          packs: product.packs ?? null,
        })
        this.showProgress(run)
        return answer
      },
    })
    if (verdict.kind === 'waiting') this.wait(run, line, verdict.unavailable)
    else this.record(run, verdict.line, verdict.change, verdict.cart)
  }

  /** Une erreur pendant une ligne : une erreur réseau n'abîme que la ligne (l'adaptateur a déjà retenté), les autres arrêtent le passage. */
  private absorb(run: Run, line: PlanLine, { code, cause }: Fault): void {
    if (code === 'NETWORK') return this.record(run, failed(line, code))
    run.halted = code
    run.cause = cause
    if (code === 'BLOCKED') this.failRemaining(run, code)
    else if (code !== 'NOT_LOGGED_IN') this.record(run, failed(line, code))
  }

  /** Leclerc bloque les requêtes : les lignes qui restent échouent (`BLOCKED`), sans en tenter une de plus. */
  private failRemaining(run: Run, code: ErrorCode): void {
    for (const line of run.plan.lines) {
      if (!this.isProcessed(run, line)) this.record(run, staticOutcome(line) ?? failed(line, code))
    }
  }

  private async phaseB(run: Run, phaseB: NonNullable<FlowDeps['phaseB']>): Promise<void> {
    run.state.phase = 'PHASE_B'
    this.runs.save(run.state)
    try {
      const outcome = await phaseB({
        pending: this.pending(run),
        adapter: this.deps.adapter,
        ui: this.deps.ui,
        record: (line, cart) => this.record(run, line, undefined, cart),
        stopRequested: () => run.stopped,
        showProgress: () => this.showProgress(run),
      })
      if (outcome === 'cancelled') run.stopped = true
    } catch (error) {
      const fault = faultOf(error)
      run.halted = fault.code
      run.cause = fault.cause
      // Leclerc bloque : les lignes qui attendaient encore un choix échouent (`BLOCKED`), comme en phase A. Pour les autres erreurs
      // elles restent « indisponibles » au résultat.
      if (run.halted === 'BLOCKED') {
        for (const { line } of this.pending(run)) this.record(run, failed(line, run.halted))
      }
    }
  }

  private async finish(run: Run): Promise<void> {
    const { ui, send, agentVersion } = this.deps
    const lines = resultLines(run.plan, run.state)
    const ending = endingOf(lines, run.stopped, run.halted, run.cause)
    this.enter(
      ending.outcome === 'aborted' ? 'ABORTED' : ending.outcome === 'error' ? 'ERROR' : 'DONE',
    )
    const result = buildResult(run.plan, lines, ending, agentVersion)
    await ui.show(
      'end',
      endProps(lines, ending, changesOf(run.plan, run.state), cartsOf(run.plan, run.state)),
    )
    this.runs.remove(run.plan.runId)
    send(result)
    ui.close()
  }

  private async showError(
    code: ErrorCode,
    plan: PlanMessage | null,
    cause: LeclercCause | null = null,
  ): Promise<void> {
    const { ui, send, agentVersion } = this.deps
    this.enter('ERROR')
    const answer = await ui.show('error', { code, canReturn: plan !== null })
    if (answer === 'return' && plan) {
      send(buildResult(plan, [], { outcome: 'error', code, ...(cause && { cause }) }, agentVersion))
    }
    ui.close()
  }

  private isProcessed(run: Run, line: PlanLine): boolean {
    const { done, waiting } = run.state
    return (
      own(done, line.ingredientSlug) !== undefined ||
      own(waiting, line.ingredientSlug) !== undefined
    )
  }

  /** Les lignes qui attendent un choix, avec leurs produits connus indisponibles (dans l'ordre de priorité). */
  private pending(run: Run): PendingLine[] {
    return run.plan.lines.flatMap((line) => {
      const ids = own(run.state.waiting, line.ingredientSlug)
      if (!ids) return []
      return [
        { line, unavailable: (line.products ?? []).filter((product) => ids.includes(product.id)) },
      ]
    })
  }

  /**
   * Une issue finale : sauvegardée pour la reprise, ajoutée au journal, la progression avance. `change` : le nombre de produits a été
   * recalculé sur le contenu lu en direct (DRV-613), à rappeler à l'écran de fin. `cart` : la quantité déjà au panier est conservée ou
   * illisible (ticket M), à rappeler aussi.
   */
  private record(run: Run, line: ResultLine, change?: ContentChange, cart?: CartNote): void {
    const { slug, entry } = this.describe(run, line)
    if (change) run.state.changes.push({ ingredientSlug: slug, ...change })
    if (cart) run.state.carts.push({ ingredientSlug: slug, ...cart })
    run.state.done[slug] = line
    delete run.state.waiting[slug]
    this.touch(run)
    run.log.push(entry)
    this.deps.ui.update({ done: Object.keys(run.state.done).length, entry })
  }

  /** Une ligne qui attend la phase B. */
  private wait(run: Run, line: PlanLine, unavailable: string[]): void {
    const name = line.name
    run.state.waiting[line.ingredientSlug] = unavailable
    this.touch(run)
    const entry = unavailable.length > 0 ? S.log.unavailable(name) : S.log.toChoose(name)
    run.log.push(entry)
    this.deps.ui.update({ entry })
  }

  private touch(run: Run): void {
    run.state.updatedAt = this.deps.now()
    this.runs.save(run.state)
  }

  private describe(run: Run, line: ResultLine): { slug: string; entry: string } {
    const slug = line.ingredientSlug
    const name = run.names.get(slug) ?? slug
    switch (line.outcome) {
      case 'ADDED':
        return { slug, entry: line.usedRank > 1 ? S.log.addedBackup(name) : S.log.added(name) }
      case 'CHOSEN':
        return { slug, entry: S.log.added(name) }
      case 'HAVE_AT_HOME':
        return { slug, entry: S.log.haveAtHome(name) }
      case 'SKIPPED':
        return { slug, entry: S.log.skipped(name) }
      default:
        return { slug, entry: S.log.failed(name) }
    }
  }

  /** L'écran de progression, avec un « Arrêter » qui demande au passage de finir proprement après la ligne en cours. */
  private showProgress(run: Run): void {
    void this.deps.ui
      .show('progress', {
        total: run.plan.lines.length,
        done: Object.keys(run.state.done).length,
        current: run.current,
        log: run.log.slice(-LOG_SIZE),
      })
      .then(() => {
        run.stopped = true
      })
  }
}
