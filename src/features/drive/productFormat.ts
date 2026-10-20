import type { DriveChoiceProduct } from '@/api'
import { unitFor } from '@drive-protocol'

import { i18n } from '@/i18n'

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** Le contenu net d'un produit (« 1 kg », « 6 pièces »), ou `null` quand il est inconnu. */
export function contentLabel(content: DriveChoiceProduct['content']): string | null {
  if (content === undefined || content === null) return null
  if (content.unit === 'piece') {
    return i18n.global.t('driveProducts.pieces', { n: number.format(content.value) }, content.value)
  }

  return `${number.format(content.value)} ${content.unit}`
}

/** Le nom d'une unité d'après son slug quand la liste des unités n'est pas là : « cuillere-a-soupe » devient « cuillere a soupe ». */
const nameOfSlug = (slug: string): string => slug.replace(/-/g, ' ')

/**
 * La contenance d'un produit dans l'unité de la liste (DRV-652) : « 20 tranches », « 1 tranche ». Le nom de l'unité vient de la liste des unités de Repas
 * (`names`, par slug), au singulier ; à défaut, le slug lisible.
 */
export function packSizeLabel(
  size: { value: number; unitSlug: string },
  names: ReadonlyMap<string, string>,
): string {
  const name = (names.get(size.unitSlug) ?? nameOfSlug(size.unitSlug)).toLowerCase()
  const value = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(size.value)

  return `${value} ${unitFor(name, size.value)}`
}

/** Le texte sans accent ni majuscule (et « œ » écrit « oe ») : « oeufs » trouve « Œufs ». */
export const plain = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
