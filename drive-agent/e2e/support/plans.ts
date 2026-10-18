// Les plans des tests de bout en bout : des messages de Repas inventés, au magasin du faux site, avec les produits de son catalogue.
import type { PlanLine, PlanMessage, PlanProduct } from '../../protocol'
import { PRODUCTS } from '../../fake-leclerc/catalog'
import { STORE } from '../../fake-leclerc/server'

export const RUN_ID = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'

/** Le libellé qu'un plan porte pour un produit du catalogue : les deux lignes de l'enseigne. */
export function labelOf(id: number): string {
  const product = PRODUCTS.find((candidate) => candidate.id === id)
  if (!product) throw new Error(`Produit ${id} absent du catalogue.`)
  return [product.label1, product.label2].filter(Boolean).join(' ')
}

/** Un produit connu du plan, avec le nombre de produits à mettre au panier (`null` : à vérifier avec l'utilisateur). */
export function product(id: number, packs: number | null = 1): PlanProduct {
  return {
    id: String(id),
    label: labelOf(id),
    packs,
    packsStatus: packs === null ? 'TO_CHECK' : 'COMPUTED',
  }
}

export function known(
  slug: string,
  name: string,
  products: PlanProduct[],
  extra: Partial<PlanLine> = {},
): PlanLine {
  return {
    ingredientSlug: slug,
    name,
    status: 'KNOWN',
    products,
    rejected: [],
    searchQuery: slug,
    ...extra,
  }
}

export function fresh(slug: string, name: string, extra: Partial<PlanLine> = {}): PlanLine {
  return {
    ingredientSlug: slug,
    name,
    status: 'NEW',
    products: [],
    rejected: [],
    searchQuery: slug,
    ...extra,
  }
}

export const home = (slug: string, name: string): PlanLine => ({
  ingredientSlug: slug,
  name,
  status: 'HAVE_AT_HOME',
})
export const skip = (slug: string, name: string): PlanLine => ({
  ingredientSlug: slug,
  name,
  status: 'SKIP',
})

export function planOf(lines: PlanLine[], extra: Partial<PlanMessage> = {}): PlanMessage {
  return {
    v: 1,
    type: 'plan',
    runId: RUN_ID,
    retailer: 'leclerc',
    store: { ...STORE },
    returnPath: '/drive/retour',
    lines,
    ...extra,
  }
}

/** Le message « lis le magasin de la page » (mode configuration). */
export const SETUP = {
  v: 1,
  type: 'setup',
  runId: RUN_ID,
  retailer: 'leclerc',
  store: { ...STORE },
  returnPath: '/drive/retour',
} as const
