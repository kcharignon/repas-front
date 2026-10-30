// L'identifiant d'offre (DRV-722) : Auchan, l'entrée réelle du registre du protocole (DRV-727), a des offres en UUID. Pour éprouver la borne de 40 caractères,
// que l'UUID (36) n'atteint pas, un fichier de test peut ajouter, le temps d'un `describe`, une enseigne FICTIVE `exemple-large` dont l'offre est un mot
// de 1 à 60 lettres. Rien de tout cela n'existe dans l'agent publié.
import { afterAll, beforeAll } from 'vitest'

import { RETAILER_IDS, STORES } from '../protocol'
import type { StoreRules } from '../protocol/check'

export const OFFER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** Deux offres inventées, de la forme de celles d'Auchan. */
export const OFFER_A = '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc'
export const OFFER_B = 'c3b2a1d0-5e4f-4a6b-9c8d-7e6f5a4b3c2d'

/** L'enseigne fictive à offre large et son hôte de magasin (un `.invalid` : aucun site réel). */
export const EXEMPLE_LARGE = { id: 'exemple-large', host: 'fd0-courses.large.invalid' }

/** À appeler au niveau d'un `describe` ou d'un fichier : ajoute l'enseigne fictive avant les tests et la retire après. */
export function useLargeOfferRetailer(): void {
  const ids = RETAILER_IDS as unknown as string[]
  const stores = STORES as unknown as Record<string, StoreRules>
  beforeAll(() => {
    ids.push(EXEMPLE_LARGE.id)
    stores[EXEMPLE_LARGE.id] = {
      host: /^[a-z0-9-]+\.large\.invalid$/,
      id: /^[0-9]{1,12}$/,
      productId: /^[0-9]{1,12}$/,
      base: () => true,
      offerId: /^[a-z]{1,60}$/,
    }
  })
  afterAll(() => {
    ids.splice(ids.indexOf(EXEMPLE_LARGE.id), 1)
    delete stores[EXEMPLE_LARGE.id]
  })
}
