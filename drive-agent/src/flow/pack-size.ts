// La contenance d'un produit dans l'unité de la liste (DRV-652). Quand le plan ne sait pas calculer le nombre de produits (la tranche n'a ni poids ni volume,
// « 15 tranches » ne se convertit pas en « 340 g »), l'écran « Vérifie la quantité » ne demande plus « combien de produits ? » mais « combien de tranches y
// a-t-il dans ce produit ? » : le nombre de produits s'en déduit, et Repas retient la réponse pour ne plus poser la question. Rien ici n'est propre à une enseigne.
import {
  packsFromSize,
  parsePackValue,
  UNIT_SLUG,
  type NeededQuantity,
  type PackSize,
  type PlanProduct,
} from '../../protocol'
import { pluralOf, type ProductCard, type Ui } from '../ui'

/** Ce que la personne a répondu : le nombre de produits à mettre au panier et, si elle l'a donnée, la contenance du produit dans l'unité de la liste. */
export interface PackAnswer {
  packs: number
  /** Absente quand elle a répondu par le nombre de produits (plan sans l'unité de la ligne) : rien n'est alors à mémoriser. */
  packSize?: PackSize
}

/** Le texte sans accent ni casse, les espaces insécables en espaces ordinaires : « Tranches » et « tranche » se comparent. */
const plain = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[  ]/g, ' ')

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Le nombre que le libellé du produit annonce pour l'unité de la ligne : « Fromage Cheddar Burger 20 Tranches - 340g » donne 20 pour « tranche ». Sans casse ni
 * accent, singulier et pluriel. Le contenu net (« 340g ») n'est pas l'unité de la ligne : ignoré. `null` quand le libellé ne dit rien de l'unité, quand il en dit
 * deux (« 10 tranches … 5 tranches »), ou quand il compte un lot (« 2 x 10 tranches » : 10 serait faux, 20 un pari) ; le champ est alors vide. Le nombre
 * n'est qu'une proposition : la personne le valide.
 */
export function sizeInLabel(label: string, unitName: string): number | null {
  const text = plain(label)
  if (/\d\s*[x×]\s*\d/.test(text)) return null
  const forms = [...new Set([plain(pluralOf(unitName)), plain(unitName.trim())])]
    .filter((form) => form !== '')
    .sort((a, b) => b.length - a.length)
    .map((form) => escape(form).replace(/ +/g, '\\s+'))
  if (forms.length === 0) return null
  const found = new RegExp(
    `(?<![\\d.,])(\\d{1,4}(?:[.,]\\d{1,3})?)\\s*(?:${forms.join('|')})(?![a-z])`,
    'g',
  )
  const values = new Set<number>()
  for (const match of text.matchAll(found)) {
    const value = parsePackValue(match[1] ?? '')
    if (value !== null) values.add(value)
  }

  return values.size === 1 ? ([...values][0] ?? null) : null
}

/** Le plan dit-il l'unité de la ligne ? Les deux clés ensemble, et une quantité demandée : sinon l'agent retombe sur le nombre de produits. */
export function unitOf(
  needed: NeededQuantity | undefined,
): { slug: string; name: string; quantity: number; counts: boolean } | null {
  if (!needed || !(needed.quantity > 0)) return null
  const { unitSlug, unitName } = needed
  if (typeof unitSlug !== 'string' || !UNIT_SLUG.test(unitSlug)) return null
  if (typeof unitName !== 'string' || unitName.trim() === '') return null

  return {
    slug: unitSlug,
    name: unitName.trim(),
    quantity: needed.quantity,
    // Une unité de pièces (« unité », « pièce ») : un produit en contient une, sauf si son libellé dit autre chose
    counts: needed.dimension === 'COUNT',
  }
}

/**
 * La contenance que le plan donne déjà pour ce produit, dans l'unité de la ligne : alors `packs` est calculé avec elle, rien à demander, et le contenu lu en
 * direct ne doit pas défaire ce calcul (la personne a répondu pour CE produit).
 */
export function givenSize(
  product: Pick<PlanProduct, 'packSize'>,
  needed: NeededQuantity | undefined,
): PackSize | null {
  const unit = unitOf(needed)
  const size = product.packSize

  return unit !== null && size && size.unitSlug === unit.slug ? size : null
}

/**
 * L'écran « Vérifie la quantité ». Avec l'unité de la ligne (DRV-652) : « Combien de tranches y a-t-il dans ce produit ? », d'où le nombre de produits et la
 * contenance à mémoriser. Sans elle (back ou application plus anciens) : « Nombre de produits », comme avant, et rien à mémoriser. `null` : « Pas cette fois ».
 */
export async function askPacks(
  ui: Ui,
  ask: {
    ingredient: string
    productLabel: string
    needed: NeededQuantity | undefined
    need: string | null
    packs: number | null
    /** Le produit, avec sa photo, son contenu et son prix (DRV-652) : la personne estime mieux en le voyant. */
    product?: ProductCard | undefined
  },
): Promise<PackAnswer | null> {
  const unit = unitOf(ask.needed)
  if (unit === null) {
    const packs = await ui.show('quantity', {
      ingredient: ask.ingredient,
      productLabel: ask.productLabel,
      packs: ask.packs,
      need: ask.need,
      product: ask.product,
    })

    return packs === null ? null : { packs }
  }
  const value = await ui.show('packSize', {
    ingredient: ask.ingredient,
    productLabel: ask.productLabel,
    quantity: unit.quantity,
    unitName: unit.name,
    // Le nombre que le libellé annonce ; sinon, pour une unité de pièces, 1 (un produit = une pièce : « 2,5 unités » donne 3 produits) ; sinon rien
    prefill: sizeInLabel(ask.productLabel, unit.name) ?? (unit.counts ? 1 : null),
    product: ask.product,
  })
  if (value === null) return null
  const packs = packsFromSize(unit.quantity, value)

  return packs === null ? null : { packs, packSize: { value, unitSlug: unit.slug } }
}
