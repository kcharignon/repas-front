import { unitLabel } from '@/features/ingredients/equationMath'

const quantity = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** Un symbole d'au plus deux lettres (g, kg, l, cl, ml) est une abréviation : elle ne prend jamais de « s ». */
const ABBREVIATION = /^\p{L}{1,2}$/u

/**
 * « 1,6 kg », « 4 » (l'unité est parfois vide), « 4 tasses » : la quantité à acheter, dans l'unité d'achat. Un symbole qui est un nom
 * d'unité (tasse, cuillère à soupe, paquet) s'accorde avec la quantité, une abréviation reste telle quelle.
 */
export function formatQuantity(value: number, unitSymbol: string): string {
  const unit =
    unitSymbol === '' || ABBREVIATION.test(unitSymbol) ? unitSymbol : unitLabel(unitSymbol, value)

  return `${quantity.format(value)}${unit === '' ? '' : ` ${unit}`}`
}

/**
 * Les images du back sont soit un chemin relatif (`images/…`, servi sous la même origine), soit une adresse absolue (icônes
 * hébergées ailleurs, présentes dans les données actuelles) : celle-ci reste telle quelle.
 */
export function imageUrl(path: string): string {
  if (/^https?:\/\//.test(path) || path.startsWith('/')) return path

  return `/${path}`
}
