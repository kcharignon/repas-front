import type { DrivePlan, DriveSettings } from '@/api'

// Données SYNTHÉTIQUES pour les écrans à plusieurs drives (DRV-710) : deux magasins d'essai et un plan de l'autre drive. Jamais un vrai identifiant.
type Id = 'leclerc' | 'auchan'

export const FIRST_STORE = {
  id: '123456',
  label: 'Ville-Test',
  baseUrl: 'https://exemple.leclercdrive.fr/magasin-123456-123456',
}
export const SECOND_STORE = {
  id: '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc',
  label: null,
  baseUrl: 'https://www.auchan.fr/',
}
const NAMES = { leclerc: 'Leclerc', auchan: 'Auchan' } as const

interface SettingsOptions {
  /** Ce que le back calcule : la règle R1 à R5 n'est pas rejouée ici, le test dit le verdict. */
  mode: 'NONE' | 'AUTO' | 'ASK'
  retailer: Id | null
  /** Les drives configurés (magasin enregistré) ; deux par défaut. */
  configured?: Id[]
  habitual?: Id | null
  lastUsed?: Id | null
}

/** Les réglages d'un back qui sert deux drives. */
export function severalSettings({
  mode,
  retailer,
  configured = ['leclerc', 'auchan'],
  habitual = null,
  lastUsed = null,
}: SettingsOptions): DriveSettings {
  const stores = { leclerc: FIRST_STORE, auchan: SECOND_STORE }
  const current: Id = retailer ?? configured[0] ?? 'leclerc'

  return {
    enabled: true,
    retailer: current,
    store: configured.includes(current) ? stores[current] : null,
    retailers: (['leclerc', 'auchan'] as const).map((id) => ({
      retailer: id,
      name: NAMES[id],
      configured: configured.includes(id),
      isDefault: habitual === id,
      store: configured.includes(id) ? stores[id] : null,
    })),
    defaultRetailer: habitual,
    lastUsedRetailer: lastUsed,
    selection: { mode, retailer, candidates: configured },
  }
}

const UUID_A = '5d3c2b1a-9f8e-4d7c-8b6a-0123456789ab'
const UUID_OFFER = 'c3b2a1d0-5e4f-4a6b-9c8d-7e6f5a4b3c2d'

/** Le plan de la liste `l1` chez l'autre drive : un produit connu (identifiants à tirets, avec son offre) et un article nouveau. */
export function secondPlan(): DrivePlan {
  return {
    shoppingListId: 'l1',
    listVersion: 7,
    retailer: 'auchan',
    store: { id: SECOND_STORE.id, label: null, baseUrl: SECOND_STORE.baseUrl },
    generatedAt: '2026-10-18T10:00:00+02:00',
    counts: { known: 1, new: 1, haveAtHome: 0 },
    lines: [
      {
        ingredientSlug: 'farine',
        ingredientName: 'Farine',
        needed: {
          quantity: 800,
          unitSymbol: 'g',
          dimension: 'WEIGHT',
          baseFactor: 1,
          unitSlug: 'gramme',
          unitName: 'gramme',
        },
        status: 'KNOWN',
        products: [
          {
            rank: 1,
            retailerProductId: UUID_A,
            offerId: UUID_OFFER,
            ean: null,
            label: 'Farine de blé T55 1 kg',
            content: { value: 1000, unit: 'g' },
            packs: 1,
            packsStatus: 'COMPUTED',
            packSize: null,
          },
        ],
        rejected: [],
        searchQuery: 'Farine',
        rayonHints: [],
      },
      {
        ingredientSlug: 'poivre',
        ingredientName: 'Poivre',
        needed: {
          quantity: 2,
          unitSymbol: 'pièce',
          dimension: 'COUNT',
          baseFactor: 1,
          unitSlug: 'piece',
          unitName: 'pièce',
        },
        status: 'NEW',
        products: [],
        rejected: [],
        searchQuery: 'Poivre',
        rayonHints: [],
      },
    ],
  }
}
