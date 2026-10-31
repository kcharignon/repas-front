import { describe, expect, it } from 'vitest'

import { plannedListNames, shouldTellWhere } from '../plannedMessage'

const main = { id: 'm', name: 'Liste du 31 octobre 2026', typeId: null }
const boucherie = { id: 'b', name: 'Boucherie', typeId: 't1' }
const marche = { id: 'k', name: 'Marché', typeId: 't2' }

describe('plannedListNames', () => {
  it('une seule liste', () => {
    expect(plannedListNames([boucherie])).toBe('Boucherie')
  })

  it('« et » avant la dernière, la liste principale se dit « Liste principale » et vient en dernier', () => {
    expect(plannedListNames([main, boucherie, marche])).toBe(
      'Boucherie, Marché et Liste principale',
    )
    expect(plannedListNames([boucherie, main])).toBe('Boucherie et Liste principale')
  })

  it('la liste principale seule', () => {
    expect(plannedListNames([main])).toBe('Liste principale')
  })
})

describe('shouldTellWhere', () => {
  it('dit où seulement si une liste d’un type a reçu quelque chose', () => {
    expect(shouldTellWhere([main, boucherie])).toBe(true)
    expect(shouldTellWhere([main])).toBe(false)
    expect(shouldTellWhere([])).toBe(false)
    expect(shouldTellWhere(undefined)).toBe(false)
  })
})
