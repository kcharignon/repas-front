// Les réponses du back pour la fusion : les cas réels de production, avec des noms inventés ou communs (« Melon », « Pâte »…).
import type { DuplicatePair, MergeCandidate, MergePreview } from '@/api'

export const side = (
  slug: string,
  name: string,
  recipeCount: number,
  listCount: number,
  departmentSlug = 'fruit-et-legume',
  departmentName = 'Fruit & légume',
) => ({
  slug,
  name,
  departmentSlug,
  departmentName,
  purchaseUnitName: 'kilo',
  recipeCount,
  listCount,
})

export const pair = (
  first: ReturnType<typeof side>,
  second: ReturnType<typeof side>,
  suggestedKeep = first.slug,
  level: string = 'EXACT',
): DuplicatePair => ({
  first,
  second,
  score: 1,
  level: level as DuplicatePair['level'],
  suggestedKeep,
})

/** Trois paires de deux rayons : le cas « Melon » (adopté et perso), « Épice guacamole » et deux « Pâte » exactement semblables. */
export const duplicates = {
  member: [
    pair(side('melon', 'Melon', 1, 0), side('melon-2', 'Melon', 0, 0), 'melon'),
    pair(
      side('epice-guacamole', 'Épice guacamole', 2, 1, 'epicerie', 'Épicerie'),
      side('epice-pour-guacamole', 'Épice pour guacamole', 5, 2, 'epicerie', 'Épicerie'),
      'epice-pour-guacamole',
      'SUGGESTION',
    ),
    pair(
      side('pate', 'Pâte', 3, 1, 'epicerie', 'Épicerie'),
      side('pate-2', 'Pâte', 1, 0, 'epicerie', 'Épicerie'),
      'pate',
      'EXACT',
    ),
  ],
  totalItems: 3,
}

export const preview = (overrides: Partial<MergePreview> = {}): MergePreview => ({
  keep: {
    slug: 'melon',
    name: 'Melon',
    departmentSlug: 'fruit-et-legume',
    departmentName: 'Fruit & légume',
    purchaseUnitName: 'kilo',
  },
  absorbed: {
    slug: 'melon-2',
    name: 'Melon',
    departmentSlug: 'fruit-et-legume',
    departmentName: 'Fruit & légume',
    purchaseUnitName: 'kilo',
  },
  recipeCount: 7,
  listCount: 2,
  driveChoiceCount: 1,
  departmentChanges: false,
  listQuantitiesConverted: false,
  missingUnits: [],
  blockedBy: null,
  canMerge: true,
  resultRecipeCount: 19,
  resultListCount: 5,
  recoveredConversionCount: 0,
  ...overrides,
})

/** La réponse d'un back qui n'envoie pas encore le total ni les conversions récupérées (avant la v0.6.20 du back). */
export const oldPreview = (overrides: Partial<MergePreview> = {}): MergePreview => {
  const {
    resultRecipeCount: _recipes,
    resultListCount: _lists,
    recoveredConversionCount: _conversions,
    ...rest
  } = preview(overrides)

  return rest as MergePreview
}

export const candidate = (
  slug: string,
  name: string,
  overrides: Partial<MergeCandidate> = {},
): MergeCandidate => ({
  slug,
  name,
  departmentSlug: 'fruit-et-legume',
  departmentName: 'Fruit & légume',
  purchaseUnitName: 'kilo',
  recipeCount: 12,
  listCount: 3,
  sameDepartment: true,
  veryClose: false,
  ...overrides,
})
