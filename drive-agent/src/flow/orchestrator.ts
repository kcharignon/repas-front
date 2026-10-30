// L'orchestrateur du passage (DRV-305) : une machine d'états sans réseau ni DOM propres, tout vient de `FlowDeps`.
//   START → VALIDATED → CONFIRMED → PHASE_A → PHASE_B → DONE      (+ ABORTED : l'utilisateur arrête ; ERROR : le passage s'interrompt)
//   START → VALIDATED → ENTERING        (le plan arrive sur l'accueil de l'enseigne, pas dans un magasin : l'agent suit « Commencer mes courses »)
// Aucun écran de confirmation (0.39.0) : « Envoyer au drive » et sa fenêtre, dans Repas, ont déjà donné l'intention ; le passage démarre dès que le
// plan est validé et que la page est celle du bon magasin. Rien n'est envoyé au site avant cela. Un seul passage à la fois.
import {
  LIMITS,
  ProtocolError,
  validatePlan,
  type ErrorCode,
  type PlanLine,
  type PlanMessage,
  type ResultLine,
  type ResultStats,
} from '../../protocol'
import {
  RetailerError,
  type EntryReading,
  type RetailerCause,
  type RequestStats,
} from '../retailers'
import { own } from '../own'
import { formatNeeded, summarySentence } from '../ui'
import type { EntryKind, ProgressEntry } from '../ui'
import type { RetailerNames } from '../retailers'
import { cardOf } from './card'
import { askPacks } from './pack-size'
import { settleKnownLine, type UnavailableNote } from './phase-a'
import {
  buildResult,
  cartsOf,
  changesOf,
  endingOf,
  endProps,
  hasSomethingToRead,
  reasonsOf,
  resultLines,
  unreachedOf,
} from './result'
import { emptyState, RunStore, type RunState } from './run-state'
import type { FlowDeps, LineNotes, PendingLine, Step } from './types'
import { keepAwake } from './wake-lock'

/** Un passage en cours. */
interface Run {
  plan: PlanMessage
  state: RunState
  names: Map<string, string>
  /** Les dernières actions affichées. */
  log: ProgressEntry[]
  /** L'ingrédient en cours. */
  current: string
  /** L'utilisateur a arrêté (ou annulé) : finir proprement. */
  stopped: boolean
  /** Le code qui a interrompu le passage (`BLOCKED`, `NOT_LOGGED_IN`…). */
  halted: ErrorCode | null
  /** Quelle vérification a échoué, quand l'adaptateur le dit (ticket A) : elle part dans le message du résultat. */
  cause: RetailerCause | null
  /** Une requête a dépassé son délai d'attente (ticket K) : l'écran de fin le dit. */
  slow: boolean
  /** Les compteurs de requêtes des pages d'avant, quand le passage est repris après un rechargement (ticket L). */
  base: ResultStats
  /** Les compteurs de l'adaptateur au début de cette page : le passage ne compte que ce qui part ensuite. */
  start: RequestStats
  /** Les produits à étiquette de rupture que le panier a refusés dans cet envoi : une seule tentative d'écriture chacun (DRV-635). */
  declined: Set<string>
  release: () => Promise<void>
}

/** Combien d'articles traités l'écran de progression garde (un envoi entier : 100 lignes au plus). */
const LOG_SIZE = 100
/** Combien de temps l'accueil a pour montrer « Commencer mes courses » (il se dessine parfois après l'arrivée du plan), et à quel rythme on le relit. */
const ENTRY_APPEAR_MS = 4_000
const ENTRY_POLL_MS = 500

/** Ce qui interrompt un passage : le code d'erreur du protocole, et la vérification précise qui a échoué quand on la connaît. */
interface Fault {
  code: ErrorCode
  cause: RetailerCause | null
}

/**
 * Une erreur de l'adaptateur a son code et sa cause ; tout autre incident est un site qui ne répond plus comme prévu, de cause
 * `EXCEPTION` (jamais son message).
 */
function faultOf(error: unknown): Fault {
  return error instanceof RetailerError
    ? { code: error.code, cause: error.cause }
    : { code: 'CONTRACT_CHANGED', cause: 'EXCEPTION' }
}

/** Le site a servi une page de défi de l'anti-robot (ticket K) : l'utilisateur peut la passer, le passage attend. */
const isChallenge = ({ code, cause }: Fault): boolean => code === 'BLOCKED' && cause === 'CHALLENGE'

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

/** La phrase qui ouvre l'écran de progression, la même que sur l'écran d'envoi de Repas : « 6 articles : 2 sont déjà choisis, 4 sont à choisir sur Leclerc. » */
function leadOf(plan: PlanMessage, retailer: RetailerNames): string {
  const count = (status: PlanLine['status']) =>
    plan.lines.filter((line) => line.status === status).length
  return summarySentence(
    {
      known: count('KNOWN'),
      new: count('NEW'),
      haveAtHome: count('HAVE_AT_HOME'),
      skipped: count('SKIP'),
    },
    retailer,
  )
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
    // Le plan d'une autre enseigne que celle de la page (DRV-704) : refusé sans une requête ni une lecture du magasin.
    if (deps.retailer !== undefined && message.retailer !== deps.retailer) {
      return this.showError('STORE_MISMATCH', message)
    }
    const problem = (await this.storeProblem(message)) ?? this.sessionProblem()
    // Une page de l'enseigne qui n'est pas celle d'un magasin (l'accueil, où le plan s'ouvre) : l'agent y entre dans le magasin (DRV-625).
    if (problem?.code === 'UNSUPPORTED_PAGE' && problem.cause === 'PAGE_PATH') {
      return this.enterStore(message)
    }
    if (problem) return this.showError(problem.code, message, problem.cause)
    // La fenêtre d'accueil du magasin (« Commencer mes courses ») sur la page même du magasin du plan : l'agent la ferme comme le ferait un doigt.
    await this.dismissWelcome(message)

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
      slow: false,
      base: { ...state.stats },
      start: deps.adapter.stats(),
      declined: new Set(),
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

  /**
   * Entrer dans le magasin sans geste (DRV-625, DRV-629) : sur l'accueil de l'enseigne, l'agent touche lui-même « Commencer mes courses » (il
   * CLIQUE le bouton du vrai site, ou suit son lien s'il en a un qui mène au magasin du plan : une action de la page, à la cadence des autres,
   * pendant que le bandeau dit « Ouverture de ton magasin… ») ; la page suivante est celle du magasin, l'application y renvoie le plan et l'agent
   * y vérifie le magasin. Une seule tentative par envoi et par onglet : au moindre doute (bouton ou lien absent, adresse qui n'est pas celle du
   * magasin du plan, défi de l'anti-robot, clic sans effet : la page est restée là) le bandeau dit de toucher le bouton, sans boucle, sans
   * requête et sans écriture.
   */
  private async enterStore(plan: PlanMessage): Promise<void> {
    const { adapter, ui } = this.deps
    this.enter('ENTERING')
    // Déjà tenté pour cet envoi (ou aucun moyen de le noter) : pas de seconde tentative, le geste manuel tout de suite.
    if (!this.runs.hasEntered(plan.runId)) {
      const { reading, announced } = await this.awaitEntry(plan)
      if (
        (reading.kind === 'LINK' || reading.kind === 'BUTTON') &&
        this.runs.markEntered(plan.runId)
      ) {
        if (!announced) void ui.show('entry', { stage: 'opening' })
        try {
          await adapter.followEntry()
        } catch {
          // Le site est bloqué, la navigation a échoué ou le clic n'a rien fait : le geste manuel reste possible.
        }
      }
    }
    // Ici seulement si le bouton ou le lien manque, a été refusé, a déjà été touché une fois, ou n'a rien changé : l'utilisateur touche le bouton du site.
    void ui.show('entry', { stage: 'manual' })
  }

  /**
   * Ce que l'accueil laisse suivre : la page de l'enseigne peut finir de s'afficher après l'arrivée du plan (la fenêtre « Commencer mes courses »
   * n'est pas là au premier regard). On relit donc la page jusqu'à ENTRY_APPEAR_MS tant qu'elle ne montre ni bouton, ni lien sûr, ni défi : des
   * lectures du DOM, aucune requête. Un défi de l'anti-robot ou un lien refusé arrête l'attente tout de suite. Le bandeau « Ouverture de ton
   * magasin… » s'affiche dès qu'on attend (`announced`) : l'utilisateur ne regarde pas une page muette.
   */
  private async awaitEntry(
    plan: PlanMessage,
  ): Promise<{ reading: EntryReading; announced: boolean }> {
    const sleep =
      this.deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
    let announced = false
    for (let waited = 0; ; waited += ENTRY_POLL_MS) {
      let reading: EntryReading
      try {
        reading = this.deps.adapter.readEntry(plan.store)
      } catch {
        reading = { kind: 'NONE' }
      }
      if (reading.kind !== 'NONE' || waited >= ENTRY_APPEAR_MS) return { reading, announced }
      if (!announced) {
        announced = true
        void this.deps.ui.show('entry', { stage: 'opening' })
      }
      await sleep(ENTRY_POLL_MS)
    }
  }

  /**
   * Sur la page du magasin du plan, la fenêtre d'accueil du site (« <magasin> vous propose… » et son « Commencer mes courses ») peut être là :
   * l'agent appuie sur ce bouton, comme le ferait un doigt, une seule fois par envoi et par onglet. Rien d'autre n'est touché. Si la page
   * change, elle reçoit de nouveau le plan ; sinon le passage continue. Un bouton absent, un lien ou le moindre doute : on passe.
   */
  private async dismissWelcome(plan: PlanMessage): Promise<void> {
    const { adapter, ui } = this.deps
    let reading: EntryReading
    try {
      reading = adapter.readEntry(plan.store)
    } catch {
      return
    }
    if (reading.kind !== 'BUTTON' || !this.runs.markEntered(plan.runId)) return
    void ui.show('entry', { stage: 'opening' })
    try {
      await adapter.followEntry()
    } catch {
      // Le clic n'a rien fait : le passage continue sur la page telle qu'elle est.
    }
  }

  /** Le magasin de la page doit être celui du message. */
  private async storeProblem(plan: PlanMessage): Promise<Fault | null> {
    try {
      const store = await this.deps.adapter.readStore()
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

  /** Reprise éventuelle (un rechargement en plein passage : la seule question encore posée), sinon un passage neuf qui démarre sans confirmation. */
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
    return { state: emptyState(plan.runId, now()), proceed: true }
  }

  private async phaseA(run: Run): Promise<void> {
    for (const line of run.plan.lines) {
      if (run.stopped || run.halted !== null) return
      if (this.isProcessed(run, line)) continue
      run.current = line.name
      this.deps.ui.update({ current: line.name })
      for (;;) {
        try {
          await this.settle(run, line)
          break
        } catch (error) {
          const fault = faultOf(error)
          // Un défi de l'anti-robot : le passage attend que l'utilisateur le passe, puis refait la ligne en cours.
          if (isChallenge(fault) && (await this.verification(run)) === 'resume') continue
          this.absorb(run, line, fault)
          break
        }
      }
    }
  }

  /**
   * Le site demande une vérification (ticket K) : un bandeau dit à l'utilisateur de la faire dans la page, puis de toucher « Reprendre ». Le
   * passage est suspendu, son état reste dans le stockage de session (la page peut se recharger : la reprise le propose) et rien n'est rendu à Repas.
   * « Reprendre » remet l'écran de progression ; « Arrêter » rend la main comme un blocage.
   */
  private async verification(run: Run): Promise<'resume' | 'stop'> {
    const answer = await this.deps.ui.show('challenge', {})
    if (answer === 'resume') this.showProgress(run)
    return answer
  }

  private async settle(run: Run, line: PlanLine): Promise<void> {
    const fixed = staticOutcome(line)
    if (fixed) return this.record(run, fixed)
    if (line.status === 'NEW') return this.wait(run, line, [], [])
    const verdict = await settleKnownLine(line, {
      adapter: this.deps.adapter,
      declined: run.declined,
      askQuantity: async (asked, product, seen) => {
        const answer = await askPacks(this.deps.ui, {
          ingredient: asked.name,
          productLabel: product.label,
          needed: asked.needed,
          need: formatNeeded(asked.needed),
          packs: product.packs ?? null,
          // Ce que l'agent vient de lire sur la page de recherche pour ce produit : photo, contenu, prix (aucune requête de plus)
          product: cardOf(seen),
        })
        this.showProgress(run)
        return answer
      },
    })
    if (verdict.kind === 'waiting') this.wait(run, line, verdict.unavailable, verdict.notes)
    else {
      this.record(run, verdict.line, {
        ...(verdict.change && { change: verdict.change }),
        ...(verdict.cart && { cart: verdict.cart }),
        ...(verdict.accepted && { accepted: true }),
      })
    }
  }

  /** Une erreur pendant une ligne : une erreur réseau n'abîme que la ligne (l'adaptateur a déjà retenté), les autres arrêtent le passage. */
  private absorb(run: Run, line: PlanLine, { code, cause }: Fault): void {
    if (code === 'NETWORK') {
      return this.record(run, failed(line, code), cause === 'REQUEST_TIMEOUT' ? { slow: true } : {})
    }
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
    for (;;) {
      try {
        const outcome = await phaseB({
          pending: this.pending(run),
          adapter: this.deps.adapter,
          ui: this.deps.ui,
          record: (line, notes) => this.record(run, line, notes),
          stopRequested: () => run.stopped,
          ...(this.deps.retailer !== undefined && { retailer: this.deps.retailer }),
          showProgress: () => this.showProgress(run),
        })
        if (outcome === 'cancelled') run.stopped = true
        return
      } catch (error) {
        const fault = faultOf(error)
        // Un défi de l'anti-robot : une fois la vérification faite, la phase B reprend avec les lignes qui attendent encore.
        if (isChallenge(fault) && (await this.verification(run)) === 'resume') continue
        run.halted = fault.code
        run.cause = fault.cause
        // Leclerc bloque : les lignes qui attendaient encore un choix échouent (`BLOCKED`), comme en phase A. Pour les autres erreurs
        // elles restent « indisponibles » au résultat.
        if (run.halted === 'BLOCKED') {
          for (const { line } of this.pending(run)) this.record(run, failed(line, run.halted))
        }
        return
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
    const result = buildResult(
      run.plan,
      lines,
      ending,
      agentVersion,
      this.deps.ui.retailer,
      this.passStats(run),
    )
    const props = endProps(
      lines,
      ending,
      changesOf(run.plan, run.state),
      cartsOf(run.plan, run.state),
      run.slow,
      reasonsOf(run.plan, run.state),
      unreachedOf(run.plan, run.state),
    )
    // Les raisons de cet envoi restent pour le diagnostic (DRV-635) : des mots fixes et des nombres, sans libellé.
    this.runs.keepReasons(run.state.reasons)
    this.runs.keepRefusals(run.state.unreached)
    // Un envoi terminé sans rien à lire repart tout de suite vers Repas (DRV-625) ; l'écran de fin reste pour le reste (partiel, arrêté, erreur).
    if (hasSomethingToRead(props)) await ui.show('end', props)
    this.runs.remove(run.plan.runId)
    send(result)
    ui.close()
  }

  private async showError(
    code: ErrorCode,
    plan: PlanMessage | null,
    cause: RetailerCause | null = null,
  ): Promise<void> {
    const { ui, send, agentVersion } = this.deps
    this.enter('ERROR')
    const answer = await ui.show('error', {
      code,
      canReturn: plan !== null,
      ...(cause && { cause }),
    })
    if (answer === 'return' && plan) {
      send(
        buildResult(
          plan,
          [],
          { outcome: 'error', code, ...(cause && { cause }) },
          agentVersion,
          this.deps.ui.retailer,
        ),
      )
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
      const reasons = new Map(
        run.state.reasons
          .filter((note) => note.ingredientSlug === line.ingredientSlug)
          .map((note) => [note.id, note.reason] as const),
      )
      return [
        {
          line,
          unavailable: (line.products ?? []).filter((product) => ids.includes(product.id)),
          reasons,
        },
      ]
    })
  }

  /**
   * Une issue finale : sauvegardée pour la reprise, ajoutée au journal, la progression avance. `change` : le nombre de produits a été
   * recalculé sur le contenu lu en direct (DRV-613), à rappeler à l'écran de fin. `cart` : la quantité déjà au panier est conservée ou
   * illisible (ticket M), à rappeler aussi. `slow` : la ligne a échoué parce que Leclerc a mis trop de temps à répondre (ticket K).
   */
  private record(
    run: Run,
    line: ResultLine,
    { change, cart, slow, accepted, unreached }: LineNotes = {},
  ): void {
    const { slug, entry } = this.describe(run, line, {
      slow: slow === true,
      accepted: accepted === true,
      unreached: unreached !== undefined,
    })
    if (slow) run.slow = true
    if (change) run.state.changes.push({ ingredientSlug: slug, ...change })
    if (cart) run.state.carts.push({ ingredientSlug: slug, ...cart })
    if (unreached) {
      run.state.unreached = [
        ...run.state.unreached.filter((note) => note.ingredientSlug !== slug),
        { ingredientSlug: slug, ...unreached },
      ]
    }
    run.state.done[slug] = line
    delete run.state.waiting[slug]
    this.touch(run)
    run.log.push(entry)
    this.deps.ui.update({ done: Object.keys(run.state.done).length, entry })
  }

  /** Une ligne qui attend la phase B, avec la raison de chacun de ses produits habituels écartés (DRV-635). */
  private wait(
    run: Run,
    line: PlanLine,
    unavailable: string[],
    notes: readonly UnavailableNote[],
  ): void {
    const name = line.name
    run.state.waiting[line.ingredientSlug] = unavailable
    run.state.reasons = [
      ...run.state.reasons.filter((note) => note.ingredientSlug !== line.ingredientSlug),
      ...notes.map((note) => ({ ...note, ingredientSlug: line.ingredientSlug })),
    ]
    this.touch(run)
    // Le produit préféré donne le ton : rupture, introuvable ou refusé par le panier.
    const first = notes[0]?.reason
    const kind: EntryKind =
      first === undefined
        ? 'toChoose'
        : first === 'NOT_FOUND'
          ? 'notFound'
          : first === 'CART_REFUSED'
            ? 'cartRefused'
            : 'unavailable'
    const entry: ProgressEntry = { kind, name }
    run.log.push(entry)
    this.deps.ui.update({ entry })
  }

  /**
   * Les compteurs du passage entier (ticket L) : ceux des pages d'avant (l'état de reprise) plus ce que l'adaptateur a compté depuis le début de
   * celle-ci. Des nombres seulement, dans les bornes du protocole.
   */
  private passStats(run: Run): ResultStats {
    const now = this.deps.adapter.stats()
    const count = (before: number, from: number, until: number) =>
      Math.min(LIMITS.requests, Math.max(0, before + until - from))
    return {
      requests: count(run.base.requests, run.start.requests, now.requests),
      errors: count(run.base.errors, run.start.errors, now.errors),
      blocks: count(run.base.blocks, run.start.blocks, now.blocks),
    }
  }

  private touch(run: Run): void {
    run.state.stats = this.passStats(run)
    run.state.updatedAt = this.deps.now()
    this.runs.save(run.state)
  }

  private describe(
    run: Run,
    line: ResultLine,
    { slow, accepted, unreached }: { slow: boolean; accepted: boolean; unreached: boolean },
  ): { slug: string; entry: ProgressEntry } {
    const slug = line.ingredientSlug
    const name = run.names.get(slug) ?? slug
    switch (line.outcome) {
      case 'ADDED':
        return {
          slug,
          entry: {
            kind: accepted ? 'acceptedAnyway' : line.usedRank > 1 ? 'addedBackup' : 'added',
            name,
          },
        }
      case 'CHOSEN':
        return {
          slug,
          entry: {
            kind: unreached ? 'savedNotInCart' : accepted ? 'acceptedAnyway' : 'added',
            name,
          },
        }
      case 'HAVE_AT_HOME':
        return { slug, entry: { kind: 'haveAtHome', name } }
      case 'SKIPPED':
        return { slug, entry: { kind: 'skipped', name } }
      default:
        return {
          slug,
          entry: { kind: slow ? 'slow' : 'failed', name },
        }
    }
  }

  /** L'écran de progression, avec un « Arrêter » qui demande au passage de finir proprement après la ligne en cours. */
  private showProgress(run: Run): void {
    void this.deps.ui
      .show('progress', {
        lead: leadOf(run.plan, this.deps.ui.retailer),
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
