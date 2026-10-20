// La fiche d'un produit telle que la personne la voit : photo, nom, seconde ligne du libellé, contenu net, prix et prix à l'unité de mesure. La même pour la liste
// de l'écran de choix et pour l'écran « Vérifie la quantité » (DRV-652 : « il faut que tu affiches plus d'info sur le produit choisi : image, poids, etc. »).
// Rien n'est lu de plus : tout vient du produit que l'agent a déjà lu sur la page de recherche.
import type { Candidate } from '../leclerc'
import { cleanText } from '../text'
import { formatContent, formatMeasure, formatPrice, S, type ProductCard } from '../ui'

/** Un libellé sans espaces ni casse, virgule décimale en point : « 40 g », « 40g » et « 40 G » se valent. */
const squash = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[\s  ]+/gu, '')
    .replace(',', '.')

export function cardOf(candidate: Candidate): ProductCard {
  const { content, price, pricePerMeasure } = candidate
  const size = content ? formatContent(content.value, content.unit) : null
  const details = [
    size,
    price === null ? null : formatPrice(price),
    pricePerMeasure ? formatMeasure(pricePerMeasure.cents, pricePerMeasure.unit) : null,
  ].filter((detail): detail is string => detail !== null)
  const second = cleanText(candidate.label2 ?? '')
  // La seconde ligne du libellé qui ne fait que redire la taille (« 40 g ») est retirée : la ligne du prix la dit déjà (DRV-626).
  const repeatsSize = size !== null && squash(second) === squash(size)

  return {
    name: cleanText(candidate.label) || S.picker.noLabel(candidate.id),
    label2: second === '' || repeatsSize ? null : second,
    details,
    photo: candidate.imageUrl,
  }
}
