import type { DrivePlan, DrivePlanLine, DrivePlanProduct } from '@/api'

/** Données inventées : un magasin d'essai, jamais une enseigne réelle. */
export const storeBaseUrl = 'https://courses-test.leclercdrive.fr/magasin-123456-123456'

const product = (
  rank: number,
  id: string,
  label: string,
  extra: Partial<DrivePlanProduct> = {},
): DrivePlanProduct => ({
  rank,
  retailerProductId: id,
  ean: null,
  label,
  content: { value: 1000, unit: 'g' },
  packs: 1,
  packsStatus: 'COMPUTED',
  ...extra,
})

const known = (
  slug: string,
  name: string,
  products: DrivePlanProduct[],
  rejected: DrivePlanLine['rejected'] = [],
): DrivePlanLine => ({
  ingredientSlug: slug,
  ingredientName: name,
  needed: { quantity: 800, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
  status: 'KNOWN',
  products,
  rejected,
  searchQuery: name,
})

const fresh = (slug: string, name: string): DrivePlanLine => ({
  ingredientSlug: slug,
  ingredientName: name,
  needed: { quantity: 2, unitSymbol: '', dimension: 'COUNT', baseFactor: 1 },
  status: 'NEW',
  products: [],
  rejected: [],
  searchQuery: name,
})

/**
 * Une liste de 12 lignes : 8 connues (dont « Farine » à deux produits classés et un refusé, et « Beurre » à vérifier), 3 nouvelles
 * et 1 « vous en avez déjà ».
 */
export function plan(overrides: Partial<DrivePlan> = {}): DrivePlan {
  const lines: DrivePlanLine[] = [
    known(
      'farine',
      'Farine',
      [
        product(1, '123456', 'Farine de blé T55 Marque Repère 1 kg', { packs: 1 }),
        product(2, '222333', 'Farine de blé T45 1 kg', { packs: 2 }),
      ],
      [{ retailerProductId: '999000', label: 'Farine complète bio 1 kg' }],
    ),
    known('beurre', 'Beurre', [
      product(1, '300001', 'Beurre doux 250 g', {
        content: { value: 250, unit: 'g' },
        packs: null,
        packsStatus: 'TO_CHECK',
      }),
    ]),
    known('lait', 'Lait', [product(1, '300002', 'Lait demi-écrémé UHT 1 L')]),
    known('oeufs', 'Œufs', [
      product(1, '300003', 'Œufs x6', { content: { value: 6, unit: 'piece' } }),
    ]),
    known('riz', 'Riz', [product(1, '300004', 'Riz long 1 kg')]),
    known('sucre', 'Sucre', [product(1, '300005', 'Sucre en poudre 1 kg')]),
    known('pates', 'Pâtes', [product(1, '300006', 'Pâtes coquillettes 500 g', { packs: 2 })]),
    known('huile', 'Huile', [product(1, '300007', 'Huile de tournesol 1 L')]),
    fresh('poivre', 'Poivre'),
    fresh('curry', 'Curry'),
    {
      ...fresh('moutarde', 'Moutarde'),
      rejected: [{ retailerProductId: '999111', label: 'Moutarde forte 200 g' }],
    },
    { ...fresh('sel', 'Sel'), status: 'HAVE_AT_HOME' },
  ]

  return {
    shoppingListId: 'l1',
    listVersion: 7,
    retailer: 'leclerc',
    store: { id: '123456', label: null, baseUrl: storeBaseUrl },
    generatedAt: '2026-10-18T10:00:00+02:00',
    counts: { known: 8, new: 3, haveAtHome: 1 },
    lines,
    ...overrides,
  }
}
