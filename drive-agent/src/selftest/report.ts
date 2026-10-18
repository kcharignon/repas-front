// Le rapport du test automatique (DRV-318) : un texte à copier et à coller, sans aucune donnée personnelle (pas de cookie, d'adresse,
// de nom, de ville, de numéro de magasin entier ni d'hôte autre que `fdN`). Il ne se construit qu'à partir du relevé (`SelftestData`),
// qui ne porte que des nombres, des codes d'erreur, des mots de recherche fixes et des libellés de produits nettoyés.
import { dateOf, pageLines, probeLines, rowsOf } from '../diagnostic'
import { formatPrice, S } from '../ui'
import { LOT_WORDS, MAX_PRODUCTS, PASSAGE_WORDS } from './run'
import type {
  CartState,
  Failure,
  ItemResult,
  SelftestData,
  Status,
  WordResult,
  WriteResult,
} from './types'

const T = S.selftest.text
const BADGE = S.diagnostic.badge

/** « 1,2 s » : à la dixième de seconde, jamais en millisecondes (un nombre à six chiffres serait pris pour un numéro de magasin). */
export function seconds(ms: number): string {
  return `${(Math.round(Math.max(0, ms) / 100) / 10).toFixed(1).replace('.', ',')} s`
}

const badge = (status: Status) => BADGE[status]

/** « BLOCKED, HTTP 429 » ou « CONTRACT_CHANGED (SEARCH_NO_STATE), HTTP 200 » : le code d'erreur, sa cause et, s'il y en a un, le code HTTP. */
export function failureText(failure: Failure): string {
  const code = failure.code === 'OTHER' ? T.otherFailure : failure.code
  const named = failure.cause === undefined ? code : `${code} (${failure.cause})`
  return failure.http === null ? named : `${named}, HTTP ${failure.http}`
}

/** Le statut de chaque étape, dans l'ordre du rapport. */
export function stepStatuses(data: SelftestData): Status[] {
  const lot: Status = data.words.every((word) => word.status === 'OK')
    ? 'OK'
    : data.words.some((word) => word.status === 'KO')
      ? 'KO'
      : 'NOT_TESTED'
  const passage: Status = data.items.some((item) => item.status === 'KO')
    ? 'KO'
    : data.items.every((item) => item.status === 'NOT_TESTED')
      ? 'NOT_TESTED'
      : data.items.every((item) => item.status === 'OK')
        ? 'OK'
        : 'KO'
  return [data.check.status, data.store.status, lot, passage, data.compare.status]
}

/** Vrai : toutes les étapes sont réussies, le test n'a été ni interrompu ni arrêté, et le panier est revenu à son état initial. */
export function isOk(data: SelftestData): boolean {
  return (
    !data.stopped && data.halt === null && stepStatuses(data).every((status) => status === 'OK')
  )
}

function wordLine(word: WordResult): string {
  if (word.status === 'NOT_TESTED') return `${word.word} : ${T.notTested}`
  const time = seconds(word.ms)
  if (word.failure) return `${word.word} : ${badge('KO')} ${failureText(word.failure)}, ${time}`
  const body =
    word.found === 0 ? T.wordNone : T.wordOk(word.found, word.withContent, word.withPrice)
  return `${word.word} : ${badge(word.status)}, ${body}, ${time}`
}

function writeText(what: string, written: WriteResult): string {
  return written.failure
    ? `${what} : ${badge('KO')} ${failureText(written.failure)}`
    : T.write(what, written.http, written.obtained)
}

function itemLine(item: ItemResult): string {
  if (item.status === 'NOT_TESTED') return `${item.word} : ${T.notTested}`
  if (item.noEligible) return `${item.word} : ${badge('KO')}, ${T.noEligible}`
  const parts = [
    ...(item.label === undefined ? [] : [`« ${item.label} »`]),
    ...item.writes.map((written, index) =>
      writeText(index === 0 ? T.add : T.set(written.wanted), written),
    ),
    ...(item.removal ? [writeText(T.remove, item.removal)] : []),
    ...(item.failure && item.writes.length === 0 ? [failureText(item.failure)] : []),
  ]
  return `${item.word} : ${badge(item.status)} ${parts.join(' ; ')}`
}

const itemsText = (state: CartState | null) =>
  state === null || state.items === null ? T.unknown : String(state.items)
const totalText = (state: CartState | null) =>
  state === null || state.totalCents === null ? T.unknown : formatPrice(state.totalCents)

/** Le texte du rapport. */
export function reportOf(data: SelftestData): string {
  const statuses = stepStatuses(data)
  const failed = statuses.filter((status) => status === 'KO').length
  const verdict = isOk(data)
    ? T.verdictOk
    : data.stopped
      ? T.verdictStopped
      : T.verdictKo(Math.max(failed, 1))
  const searches = data.words.filter((word) => word.status !== 'NOT_TESTED')
  const average =
    searches.length === 0
      ? T.unknown
      : seconds(searches.reduce((sum, word) => sum + word.ms, 0) / searches.length)
  const halt =
    data.halt === null
      ? []
      : [T.halt(data.halt === 'REPEATED' ? T.haltRepeated : failureText(data.halt))]
  const indent = (lines: readonly string[]) => lines.map((line) => `   - ${line}`)
  const block = (index: number, title: string, ms: number | null, lines: readonly string[]) => [
    `${index + 1}. [${badge(statuses[index] ?? 'NOT_TESTED')}] ${title}${ms === null ? '' : ` (${seconds(ms)})`}`,
    ...indent(lines),
  ]
  const lotMs = data.words.reduce((sum, word) => sum + word.ms, 0)
  const passageMs = data.items.reduce(
    (sum, item) =>
      sum + [...item.writes, ...(item.removal ? [item.removal] : [])].reduce((s, w) => s + w.ms, 0),
    0,
  )
  const compare = data.compare
  const compareLines =
    compare.status === 'NOT_TESTED'
      ? [T.noWrite]
      : [
          T.items(itemsText(compare.before), itemsText(compare.after), compare.beforeDerived),
          T.total(totalText(compare.before), totalText(compare.after)),
          compare.leftovers.length > 0
            ? T.leftovers(compare.leftovers.map((label) => `« ${label} »`).join(', '))
            : compare.after === null
              ? T.unreadable
              : compare.status === 'OK'
                ? T.back
                : T.differs,
        ]
  return [
    T.title,
    S.diagnostic.text.agent(data.agentVersion),
    S.diagnostic.text.date(dateOf(data.now)),
    ...(data.page ? pageLines(data.page) : []),
    verdict,
    T.duration(seconds(data.durationMs)),
    ...halt,
    '',
    ...(probeLines(data.probes).length > 0 ? [...probeLines(data.probes), ''] : []),
    ...block(
      0,
      S.selftest.step.check,
      data.check.ms,
      rowsOf(data.check.results).map(
        (row) => `[${row.badge}] ${row.label}${row.detail === null ? '' : ` : ${row.detail}`}`,
      ),
    ),
    ...block(
      1,
      S.selftest.step.store,
      data.store.ms,
      data.store.failure
        ? [failureText(data.store.failure)]
        : data.page
          ? [
              T.storeRead(
                data.page.host,
                data.page.store,
                data.store.labelKnown ? T.labelKnown : T.labelUnknown,
              ),
            ]
          : [T.notTested],
    ),
    ...block(2, S.selftest.step.lot(LOT_WORDS.length), lotMs, [
      T.lotSummary(
        LOT_WORDS.length,
        searches.length,
        searches.filter((word) => word.status === 'OK').length,
        average,
      ),
      ...data.words.map(wordLine),
    ]),
    ...block(
      3,
      S.selftest.step.passage(Math.min(PASSAGE_WORDS.length, MAX_PRODUCTS)),
      passageMs,
      data.items.map(itemLine),
    ),
    ...block(4, S.selftest.step.compare, null, compareLines),
    '',
    T.noOrder,
    S.diagnostic.privacy,
  ].join('\n')
}
