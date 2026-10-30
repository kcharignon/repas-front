// Une enseigne FICTIVE qui a des offres (DRV-722) : le registre du protocole n'en connaît aucune (Leclerc n'a pas d'offre, Auchan n'est pas déclaré),
// et le ticket interdit d'écrire une règle d'Auchan. Ce fichier ajoute, le temps d'un fichier de test, une enseigne `exemple` dont l'identifiant d'offre
// est un UUID, et une `exemple-large` dont l'offre est un mot de 1 à 60 lettres (pour éprouver la borne de 40 caractères). Rien de tout cela n'existe
// dans l'agent publié.
import { afterAll, beforeAll } from 'vitest'

import { RETAILER_IDS, STORES } from '../protocol'
import type { StoreRules } from '../protocol/check'

export const OFFER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** L'enseigne fictive et son hôte de magasin (un `.invalid` : aucun site réel). */
export const EXEMPLE = { id: 'exemple', host: 'fd0-courses.exemple.invalid' }
export const EXEMPLE_LARGE = { id: 'exemple-large', host: 'fd0-courses.large.invalid' }
/** Deux offres inventées de la forme de `exemple`. */
export const OFFER_A = '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc'
export const OFFER_B = 'c3b2a1d0-5e4f-4a6b-9c8d-7e6f5a4b3c2d'

const rules = (host: RegExp, offerId: RegExp): StoreRules => ({
  host,
  id: /^[0-9]{1,12}$/,
  base: () => true,
  offerId,
})

/** À appeler au niveau d'un `describe` ou d'un fichier : ajoute les enseignes fictives avant les tests et les retire après. */
export function useOfferRetailers(): void {
  const ids = RETAILER_IDS as unknown as string[]
  const stores = STORES as unknown as Record<string, StoreRules>
  beforeAll(() => {
    ids.push(EXEMPLE.id, EXEMPLE_LARGE.id)
    stores[EXEMPLE.id] = rules(/^[a-z0-9-]+\.exemple\.invalid$/, OFFER_UUID)
    stores[EXEMPLE_LARGE.id] = rules(/^[a-z0-9-]+\.large\.invalid$/, /^[a-z]{1,60}$/)
  })
  afterAll(() => {
    for (const { id } of [EXEMPLE, EXEMPLE_LARGE]) {
      ids.splice(ids.indexOf(id), 1)
      delete stores[id]
    }
  })
}
