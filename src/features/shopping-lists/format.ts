const quantity = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** « 1,6 kg », « 4 » (l'unité est parfois vide) : la quantité à acheter, dans l'unité d'achat. */
export function formatQuantity(value: number, unitSymbol: string): string {
  return `${quantity.format(value)}${unitSymbol === '' ? '' : ` ${unitSymbol}`}`
}

/**
 * Les images du back sont soit un chemin relatif (`images/…`, servi sous la même origine), soit une adresse absolue (icônes
 * hébergées ailleurs, présentes dans les données actuelles) : celle-ci reste telle quelle.
 */
export function imageUrl(path: string): string {
  if (/^https?:\/\//.test(path) || path.startsWith('/')) return path

  return `/${path}`
}
