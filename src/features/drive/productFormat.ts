import type { DriveChoiceProduct } from '@/api'
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

/** Le texte sans accent ni majuscule (et « œ » écrit « oe ») : « oeufs » trouve « Œufs ». */
export const plain = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
