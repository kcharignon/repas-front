// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ResultLine } from '@drive-protocol'

import type { DriveEvent } from '../bridge'
import { useDriveReturnStore } from '../returnStore'
import { result, RUN } from './results'

// Données SYNTHÉTIQUES.
const draft = { runId: RUN, listId: 'l1', startedAt: '2026-10-18T10:00:00.000Z' }
const sent = [{ ingredientSlug: 'farine', status: 'KNOWN' as const, products: ['222333'] }]
const lines: ResultLine[] = [
  { ingredientSlug: 'farine', outcome: 'ADDED', productId: '222333', quantity: 1, usedRank: 1 },
  { ingredientSlug: 'pirate', outcome: 'HAVE_AT_HOME' },
]

const run = (withLines: boolean): DriveEvent => ({
  kind: 'result',
  result: result({ lines }),
  draft: withLines ? { ...draft, lines: sent } : draft,
})

const slugs = (store: ReturnType<typeof useDriveReturnStore>) =>
  store.event?.kind === 'result' && store.event.result.type === 'result'
    ? store.event.result.lines.map((line) => line.ingredientSlug)
    : null

beforeEach(() => setActivePinia(createPinia()))

describe('returnStore : le résultat recoupé avec le plan envoyé', () => {
  it('retire tout de suite les lignes que les lignes du brouillon n’expliquent pas', () => {
    const store = useDriveReturnStore()

    store.receive(run(true))

    expect(slugs(store)).toEqual(['farine'])
    expect(store.ignored).toBe(1)
    expect(store.checked).toBe(true)
  })

  it('attend le plan relu quand le brouillon n’a pas gardé les lignes, puis retire de même', () => {
    const store = useDriveReturnStore()

    store.receive(run(false))
    expect(slugs(store)).toEqual(['farine', 'pirate'])
    expect(store.checked).toBe(false)

    store.check(sent)

    expect(slugs(store)).toEqual(['farine'])
    expect(store.ignored).toBe(1)
    expect(store.checked).toBe(true)
  })

  it('ne touche ni à un refus ni à un résultat de lecture du magasin', () => {
    const store = useDriveReturnStore()
    const refused: DriveEvent = { kind: 'refused', code: 'UNAVAILABLE', runId: RUN }

    store.receive(refused)
    store.check(sent)

    expect(store.event).toBe(refused)
    expect(store.checked).toBe(false)
  })

  it('repart de zéro à chaque résultat reçu et à l’effacement', () => {
    const store = useDriveReturnStore()
    store.receive(run(true))

    store.receive(run(false))
    expect(store.ignored).toBe(0)
    expect(store.checked).toBe(false)

    store.receive(run(true))
    store.clear()
    expect(store.event).toBeNull()
    expect(store.ignored).toBe(0)
    expect(store.checked).toBe(false)
  })
})
