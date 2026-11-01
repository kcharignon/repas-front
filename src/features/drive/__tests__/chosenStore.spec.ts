// Le magasin que la personne a choisi à la place de celui de Repas (DRV-755) : ce que le site retient d'un résultat, et ce qu'il refuse de croire. Magasins INVENTÉS.
import { describe, expect, it } from 'vitest'
import type { ResultMessage } from '@drive-protocol'

import { chosenStoreOf } from '../chosenStore'
import { result } from './results'

const OTHER = {
  id: '000456',
  host: 'fd8-courses.leclercdrive.fr',
  baseUrl: 'https://fd8-courses.leclercdrive.fr/magasin-000456-000456',
  label: 'Ville-Test',
}
const aborted = (extra: Partial<ResultMessage> = {}): ResultMessage =>
  result({ outcome: 'aborted', lines: [], chosenStore: OTHER, ...extra })

describe('chosenStoreOf', () => {
  it('un envoi arrêté qui porte le magasin lu : le magasin à retenir, pour le drive du passage', () => {
    expect(chosenStoreOf(aborted(), 'leclerc')).toEqual({
      retailer: 'leclerc',
      store: { id: '000456', baseUrl: OTHER.baseUrl, label: 'Ville-Test' },
    })
  })

  it('sans nom de ville : le libellé reste « null », jamais inventé', () => {
    expect(chosenStoreOf(aborted({ chosenStore: { ...OTHER, label: null } }), 'leclerc')).toEqual({
      retailer: 'leclerc',
      store: { id: '000456', baseUrl: OTHER.baseUrl, label: null },
    })
  })

  it('un résultat sans magasin choisi : rien à retenir', () => {
    expect(chosenStoreOf(result({ outcome: 'aborted', lines: [] }), 'leclerc')).toBeNull()
  })

  it('un autre résultat que « arrêté » ne retient rien, même avec la clé (jamais un envoi terminé ou en erreur)', () => {
    expect(chosenStoreOf(aborted({ outcome: 'completed' }), 'leclerc')).toBeNull()
    expect(chosenStoreOf(aborted({ outcome: 'partial' }), 'leclerc')).toBeNull()
    expect(chosenStoreOf(aborted({ outcome: 'error' }), 'leclerc')).toBeNull()
  })

  it('le magasin d’un AUTRE drive que celui du passage n’est jamais retenu', () => {
    expect(chosenStoreOf(aborted(), 'auchan')).toBeNull()
  })

  it('une adresse de base qui n’est pas celle de CE numéro de magasin (page de l’enseigne falsifiée) : rien n’est retenu', () => {
    const forged = {
      ...OTHER,
      baseUrl: 'https://fd8-courses.leclercdrive.fr/magasin-999111-999111',
    }
    expect(chosenStoreOf(aborted({ chosenStore: forged }), 'leclerc')).toBeNull()
    const elsewhere = { ...OTHER, baseUrl: 'https://exemple.invalid/magasin-000456-000456' }
    expect(chosenStoreOf(aborted({ chosenStore: elsewhere }), 'leclerc')).toBeNull()
  })

  it('un hôte qui n’est celui d’aucune enseigne : rien n’est retenu', () => {
    const forged = { ...OTHER, host: 'exemple.invalid' }
    expect(chosenStoreOf(aborted({ chosenStore: forged }), 'leclerc')).toBeNull()
  })
})
