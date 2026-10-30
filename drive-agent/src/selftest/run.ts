// Le test automatique de la variante de débogage (DRV-318) : une suite d'étapes enchaînées sans autre geste de l'utilisateur, à la cadence
// de l'adaptateur (800 ms + gigue), qui rend ce qu'elle a relevé (`SelftestData`) ; `report.ts` en fait le texte à copier.
//
// Garde-fous : au plus 3 produits ajoutés, jamais une quantité au-dessus de 3, jamais un produit déjà au panier (le retrait y mettrait sa
// quantité à 0), arrêt immédiat sur blocage du site, et le nettoyage (quantité 0 de tout ce qui a été touché) est toujours tenté.
import { runChecks, type ChecksDeps, type PageFacts } from '../diagnostic'
import { RetailerError, type Candidate, type CartResult } from '../retailers'
import { S } from '../ui'
import type {
  CartState,
  CompareResult,
  Failure,
  ItemResult,
  SelftestData,
  Status,
  WordResult,
  WriteResult,
} from './types'

/** Les 12 mots du lot de recherches : des ingrédients courants, ceux du lot de 30 du banc d'essai. */
export const LOT_WORDS = [
  'farine',
  'sucre',
  'sel',
  'poivre',
  "huile d'olive",
  'beurre',
  'lait',
  'oeufs',
  'riz',
  'pâtes',
  'tomates',
  'bananes',
] as const

/** Les ingrédients du passage d'essai : les trois premiers du lot. */
export const PASSAGE_WORDS = LOT_WORDS.slice(0, 3)

/** Au plus trois produits ajoutés au panier. */
export const MAX_PRODUCTS = 3
/** Jamais plus de trois exemplaires d'un produit. */
export const MAX_TEST_QUANTITY = 3
/** Le stock minimal d'un produit choisi : il faut pouvoir en mettre trois. */
export const MIN_STOCK = 3
/** Recherches de suite sans résultat qui arrêtent le lot. */
export const MAX_FAILURES_IN_A_ROW = 3
/** Les unités de progression : diagnostic, magasin, lot, passage, comparaison. */
export const PROGRESS_TOTAL = 2 + LOT_WORDS.length + PASSAGE_WORDS.length + 1

export interface Hooks {
  /** Vrai dès que l'utilisateur a touché « Arrêter » : finir l'écriture en cours, nettoyer, rendre la main. */
  stopped(): boolean
  /** Fait avancer l'écran de progression. */
  step(done: number, current: string): void
}

export interface RunDeps extends ChecksDeps {
  now: () => number
}

const BLOCKING = new Set<Failure['code']>(['BLOCKED', 'NOT_LOGGED_IN', 'UNSUPPORTED_PAGE'])

const failureOf = (error: unknown): Failure =>
  error instanceof RetailerError
    ? { code: error.code, http: error.status, ...(error.cause && { cause: error.cause }) }
    : { code: 'OTHER', http: null }

const isBlocking = (failure: Failure) => BLOCKING.has(failure.code)

/** Ce qu'un libellé de produit n'a pas à porter dans le rapport : un nom de site, d'enseigne, de cookie ou de jeton. */
const FORBIDDEN_WORDS =
  /leclerc\w*|https?\w*|www\w*|cookie\w*|token\w*|jeton\w*|bearer|authorization/gi

/**
 * Le libellé d'un produit du catalogue, réduit à des lettres, des chiffres et un peu de ponctuation, court, sans longue suite de chiffres
 * ni nom de site : le rapport ne doit rien contenir qui ressemble à une adresse, un compte ou un cookie, même si un libellé l'imitait.
 */
export function safeLabel(label: string): string {
  const cleaned = label
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} .,'’%&()+-]/gu, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(FORBIDDEN_WORDS, '…')
    .replace(/\d{6,}/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
  return [...cleaned].slice(0, 40).join('').trim() || '?'
}

/**
 * Le choix automatique : le premier produit en stock pour trois exemplaires, qui n'est pas déjà au panier, dont le prix est lu, et que
 * l'essai n'a pas déjà pris pour un autre ingrédient (`taken`).
 */
export function pickCandidate(
  candidates: readonly Candidate[],
  taken: ReadonlySet<string> = new Set(),
): Candidate | undefined {
  return candidates.find(
    (candidate) =>
      /^[0-9]{1,12}$/.test(candidate.id) &&
      !taken.has(candidate.id) &&
      candidate.stock !== null &&
      candidate.stock >= MIN_STOCK &&
      candidate.inCart === 0 &&
      candidate.price !== null,
  )
}

interface Touched {
  id: string
  label: string
  item: ItemResult
}

type Written = WriteResult & { items: number | null; totalCents: number | null }

/** Joue le test. N'écrit au panier que dans les bornes ci-dessus, et rend toujours un relevé, même après une erreur imprévue. */
export async function runSelftest(deps: RunDeps, hooks: Hooks): Promise<SelftestData> {
  const { adapter, now } = deps
  const started = now()
  const T = S.selftest.current
  let done = 0
  // Ce qui a arrêté le test (un objet : les fonctions ci-dessous le changent).
  const run: { halt: Failure | 'REPEATED' | null } = { halt: null }
  const stopNow = () => run.halt !== null || hooks.stopped()
  const halted = (failure: Failure) => {
    if (isBlocking(failure)) run.halt ??= failure
  }

  // 1. Le diagnostic de l'agent : les huit contrôles en lecture seule (une recherche).
  hooks.step(done, T.check)
  let t = now()
  const checks = await runChecks(deps, () => undefined)
  const blocked = checks.results.find(
    (result) => result.status === 'KO' && result.code && BLOCKING.has(result.code),
  )
  if (blocked?.code) {
    run.halt = { code: blocked.code, http: null, ...(blocked.cause && { cause: blocked.cause }) }
  }
  const checkStatus: Status = checks.results.some(
    (result) => result.status === 'KO' && result.id !== 'wakeLock',
  )
    ? 'KO'
    : 'OK'
  const check = { status: checkStatus, ms: now() - t, results: checks.results }
  const probes = checks.probes
  done += 1

  // 2. La lecture du magasin de la page (aucune requête).
  hooks.step(done, S.selftest.step.store)
  t = now()
  let store: SelftestData['store']
  try {
    const read = adapter.readStore()
    store = { status: 'OK', ms: now() - t, labelKnown: read.label !== null }
  } catch (error) {
    const failure = failureOf(error)
    halted(failure)
    store = { status: 'KO', ms: now() - t, failure }
  }
  done += 1

  // 3. Le lot de recherches, en série.
  const words: WordResult[] = []
  let streak = 0
  for (const word of LOT_WORDS) {
    if (stopNow()) {
      words.push({ word, status: 'NOT_TESTED', found: 0, withContent: 0, withPrice: 0, ms: 0 })
      continue
    }
    hooks.step(done, T.search(word))
    t = now()
    try {
      const found = await adapter.searchProducts(word)
      const ms = now() - t
      words.push({
        word,
        status: found.length > 0 ? 'OK' : 'KO',
        found: found.length,
        withContent: found.filter((candidate) => candidate.content !== null).length,
        withPrice: found.filter((candidate) => candidate.price !== null).length,
        ms,
      })
      streak = found.length > 0 ? 0 : streak + 1
    } catch (error) {
      const failure = failureOf(error)
      words.push({
        word,
        status: 'KO',
        found: 0,
        withContent: 0,
        withPrice: 0,
        ms: now() - t,
        failure,
      })
      halted(failure)
      streak += 1
    }
    if (streak >= MAX_FAILURES_IN_A_ROW) run.halt ??= 'REPEATED'
    done += 1
  }
  done = 2 + LOT_WORDS.length

  // 4. L'essai au panier, puis le nettoyage (toujours tenté).
  const items: ItemResult[] = []
  const touched: Touched[] = []
  const before: CartState = { items: null, totalCents: null }
  let beforeDerived = false
  let writesStopped = false
  let after: CartState | null = null
  const leftovers: string[] = []

  const write = async (id: string, quantity: number): Promise<Written> => {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_TEST_QUANTITY) {
      throw new RangeError('Le test automatique ne met jamais plus de trois exemplaires.')
    }
    const begun = now()
    try {
      const result: CartResult = await adapter.setCartQuantity(id, quantity)
      return {
        wanted: quantity,
        obtained: result.obtained,
        http: result.status,
        ms: now() - begun,
        ok: result.ok,
        items: result.items,
        totalCents: result.totalCents,
      }
    } catch (error) {
      const failure = failureOf(error)
      halted(failure)
      return {
        wanted: quantity,
        obtained: null,
        http: failure.http,
        ms: now() - begun,
        ok: false,
        failure,
        items: null,
        totalCents: null,
      }
    }
  }

  try {
    for (const word of PASSAGE_WORDS) {
      if (stopNow() || writesStopped || touched.length >= MAX_PRODUCTS) {
        items.push({ word, status: 'NOT_TESTED', writes: [] })
        continue
      }
      hooks.step(done, T.passage(word))
      const item: ItemResult = { word, status: 'OK', writes: [] }
      items.push(item)
      let candidates: Candidate[]
      try {
        candidates = await adapter.searchProducts(word)
      } catch (error) {
        item.status = 'KO'
        item.failure = failureOf(error)
        halted(item.failure)
        writesStopped = true
        done += 1
        continue
      }
      // L'état du panier d'avant : lu dans la page de la toute première recherche, avant toute écriture.
      if (touched.length === 0 && before.totalCents === null) {
        before.totalCents = adapter.pageCartTotal()
      }
      const pick = pickCandidate(candidates, new Set(touched.map((entry) => entry.id)))
      if (!pick) {
        item.status = 'KO'
        item.noEligible = true
        done += 1
        continue
      }
      item.label = safeLabel(pick.label)
      const first = touched.length === 0
      touched.push({ id: pick.id, label: item.label, item })
      // Le premier produit passe par trois quantités (1, puis 3, puis 2) ; les autres sont seulement ajoutés.
      for (const quantity of first ? [1, 3, 2] : [1]) {
        const written = await write(pick.id, quantity)
        item.writes.push(written)
        if (written.failure) {
          item.status = 'KO'
          item.failure = written.failure
          writesStopped = true
          break
        }
        if (!written.ok) item.status = 'KO'
        if (first && quantity === 1 && written.items !== null && written.obtained !== null) {
          before.items = Math.max(0, written.items - written.obtained)
          beforeDerived = true
        }
        if (hooks.stopped()) {
          writesStopped = true
          break
        }
      }
      done += 1
    }
  } catch {
    // Un incident imprévu arrête les écritures ; le nettoyage ci-dessous se fait quand même.
    run.halt ??= { code: 'OTHER', http: null }
  } finally {
    // Le nettoyage : tout ce qui a été touché revient à la quantité 0, même après une erreur ou un arrêt.
    if (touched.length > 0) {
      hooks.step(done, T.cleanup)
      let cleaning = true
      for (const entry of [...touched].reverse()) {
        let removal: Written | null = null
        for (let attempt = 0; cleaning && attempt < 2; attempt += 1) {
          removal = await write(entry.id, 0)
          if (removal.failure && isBlocking(removal.failure)) cleaning = false
          if (removal.ok && removal.obtained === 0) break
        }
        if (removal) entry.item.removal = removal
        if (removal?.ok && removal.obtained === 0) {
          after = { items: removal.items, totalCents: removal.totalCents }
        } else {
          leftovers.push(entry.label)
        }
      }
    }
  }
  items.forEach((item) => {
    if (item.status === 'OK' && item.removal && !(item.removal.ok && item.removal.obtained === 0)) {
      item.status = 'KO'
    }
  })

  // 5. Le panier d'avant et d'après.
  hooks.step(PROGRESS_TOTAL - 1, T.compare)
  const compare = compareCart(touched.length > 0, before, beforeDerived, after, leftovers)
  const page: PageFacts | null = checks.page
  return {
    agentVersion: deps.agentVersion,
    now: now(),
    durationMs: now() - started,
    page,
    check,
    probes,
    store,
    words,
    items,
    compare,
    stopped: hooks.stopped(),
    halt: run.halt,
  }
}

/** Le panier est-il revenu à son état initial ? Compare ce que l'on sait des deux côtés ; ce que le site n'a pas dit n'est pas deviné. */
export function compareCart(
  touched: boolean,
  before: CartState,
  beforeDerived: boolean,
  after: CartState | null,
  leftovers: string[],
): CompareResult {
  const base = { before, beforeDerived, after, leftovers }
  if (!touched) return { status: 'NOT_TESTED', ...base }
  if (leftovers.length > 0 || after === null) return { status: 'KO', ...base }
  const same = (a: number | null, b: number | null) => (a === null || b === null ? null : a === b)
  const items = same(before.items, after.items)
  const total = same(before.totalCents, after.totalCents)
  const unreadable = items === null && total === null
  return { status: items === false || total === false || unreadable ? 'KO' : 'OK', ...base }
}
