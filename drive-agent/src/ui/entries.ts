// Ce que l'écran de progression montre de chaque ligne du journal (DRV-744) : une icône ronde, le nom de l'article, son état en petit, et la phrase
// complète (`S.log`) comme nom accessible. Aucun texte ne se construit ailleurs ; aucun nom d'enseigne n'est écrit ici (il vient de la table de l'enseigne).
import type { RetailerNames } from '../retailers/names'
import { S } from './strings'
import type { EntryKind, ProgressEntry } from './types'

export type IconName = 'check' | 'home' | 'dash' | 'attention'
/** `ok` : fait ; `neutral` : rien à faire ; `attention` : il reste quelque chose à voir ensuite. */
export type Tone = 'ok' | 'neutral' | 'attention'

export interface EntryView {
  icon: IconName
  tone: Tone
  /** Le nom de l'article, en gras. */
  name: string
  /** L'état, en petit à droite ; absent d'une simple note. */
  state: string | null
  /** La phrase complète : le nom accessible de la ligne. */
  sentence: string
}

interface KindView {
  icon: IconName
  tone: Tone
  state: (retailer: RetailerNames) => string
  sentence: (retailer: RetailerNames, name: string) => string
}

const plain = (value: string) => () => value

const KINDS: Record<EntryKind, KindView> = {
  added: {
    icon: 'check',
    tone: 'ok',
    state: plain(S.progress.state.added),
    sentence: (_r, name) => S.log.added(name),
  },
  addedBackup: {
    icon: 'check',
    tone: 'ok',
    state: plain(S.progress.state.addedBackup),
    sentence: (_r, name) => S.log.addedBackup(name),
  },
  acceptedAnyway: {
    icon: 'check',
    tone: 'ok',
    state: S.progress.state.acceptedAnyway,
    sentence: S.log.acceptedAnyway,
  },
  savedNotInCart: {
    icon: 'attention',
    tone: 'attention',
    state: plain(S.progress.state.savedNotInCart),
    sentence: (_r, name) => S.log.savedNotInCart(name),
  },
  haveAtHome: {
    icon: 'home',
    tone: 'neutral',
    state: plain(S.progress.state.haveAtHome),
    sentence: (_r, name) => S.log.haveAtHome(name),
  },
  skipped: {
    icon: 'dash',
    tone: 'neutral',
    state: plain(S.progress.state.skipped),
    sentence: (_r, name) => S.log.skipped(name),
  },
  toChoose: {
    icon: 'attention',
    tone: 'attention',
    state: plain(S.progress.state.toChoose),
    sentence: (_r, name) => S.log.toChoose(name),
  },
  unavailable: {
    icon: 'attention',
    tone: 'attention',
    state: plain(S.progress.state.unavailable),
    sentence: (_r, name) => S.log.unavailable(name),
  },
  notFound: {
    icon: 'attention',
    tone: 'attention',
    state: plain(S.progress.state.notFound),
    sentence: (_r, name) => S.log.notFound(name),
  },
  cartRefused: {
    icon: 'attention',
    tone: 'attention',
    state: plain(S.progress.state.cartRefused),
    sentence: (_r, name) => S.log.cartRefused(name),
  },
  slow: {
    icon: 'attention',
    tone: 'attention',
    state: S.progress.state.slow,
    sentence: S.log.slow,
  },
  failed: {
    icon: 'attention',
    tone: 'attention',
    state: plain(S.progress.state.failed),
    sentence: (_r, name) => S.log.failed(name),
  },
}

/** Les sortes d'état connues, dans l'ordre de l'écran (les tests les parcourent toutes). */
export const ENTRY_KINDS = Object.keys(KINDS) as EntryKind[]

export function viewOf(entry: ProgressEntry, retailer: RetailerNames): EntryView {
  if (entry.kind === 'note') {
    return { icon: 'check', tone: 'neutral', name: entry.text, state: null, sentence: entry.text }
  }
  const kind = KINDS[entry.kind]
  return {
    icon: kind.icon,
    tone: kind.tone,
    name: entry.name,
    state: kind.state(retailer),
    sentence: kind.sentence(retailer, entry.name),
  }
}
