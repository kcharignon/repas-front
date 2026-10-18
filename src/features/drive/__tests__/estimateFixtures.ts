import type { DriveEstimate, DriveEstimateLine } from '@/api'

/** Données inventées : un magasin d'essai, des produits de test. */
const OLDEST = '2026-10-12T09:30:00+02:00'
const NEWEST = '2026-10-18T10:00:00+02:00'

const estimated = (
  slug: string,
  name: string,
  label: string,
  packs: number,
  unitPriceCents: number,
  priceSeenAt = OLDEST,
): DriveEstimateLine => ({
  ingredientSlug: slug,
  ingredientName: name,
  productLabel: label,
  packs,
  unitPriceCents,
  subtotalCents: packs * unitPriceCents,
  priceSeenAt,
  status: 'ESTIMATED',
})

const without = (
  slug: string,
  name: string,
  status: DriveEstimateLine['status'],
  extra: Partial<DriveEstimateLine> = {},
): DriveEstimateLine => ({
  ingredientSlug: slug,
  ingredientName: name,
  productLabel: null,
  packs: null,
  unitPriceCents: null,
  subtotalCents: null,
  priceSeenAt: null,
  status,
  ...extra,
})

/** 13 lignes : 8 estimées (12,47 €), 4 non estimées, 1 « déjà à la maison » ; couverture 8 sur 12. */
export const estimateLines: DriveEstimateLine[] = [
  estimated('beurre', 'Beurre', 'Beurre doux 250 g', 1, 245),
  without('curry', 'Curry', 'NO_PRODUCT'),
  estimated('farine', 'Farine', 'Farine de blé T55 1 kg', 1, 129, NEWEST),
  estimated('huile', 'Huile', 'Huile de test 1 L', 1, 310),
  estimated('lait', 'Lait', 'Lait demi-écrémé 1 L', 2, 99),
  without('moutarde', 'Moutarde', 'NO_PRICE', { productLabel: 'Moutarde de test 200 g' }),
  estimated('pates', 'Pâtes', 'Pâtes de test 500 g', 1, 85),
  without('poivre', 'Poivre', 'NO_PRODUCT'),
  estimated('riz', 'Riz', 'Riz de test 1 kg', 1, 120),
  without('sel', 'Sel', 'HAVE_AT_HOME'),
  estimated('sucre', 'Sucre', 'Sucre de test 1 kg', 1, 60),
  without('thym', 'Thym', 'TO_CHECK', {
    productLabel: 'Thym de test 20 g',
    unitPriceCents: 150,
    priceSeenAt: OLDEST,
  }),
  estimated('vinaigre', 'Vinaigre', 'Vinaigre de test 50 cl', 1, 100),
]

export const disclaimer =
  'Estimation d’après les derniers prix vus ; le prix réel est celui du drive.'

export const estimate = (overrides: Partial<DriveEstimate> = {}): DriveEstimate => ({
  shoppingListId: 'l1',
  retailer: 'leclerc',
  store: {
    id: '123456',
    label: null,
    baseUrl: 'https://courses-test.leclercdrive.fr/magasin-123456-123456',
  },
  estimatedTotalCents: 1247,
  estimatedLines: 8,
  unestimatedLines: 4,
  coverage: 0.6667,
  oldestPriceAt: OLDEST,
  newestPriceAt: NEWEST,
  lines: estimateLines,
  disclaimer,
  ...overrides,
})
