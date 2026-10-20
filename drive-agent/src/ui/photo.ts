// La photo d'un produit (DRV-633), dans la fiche de l'écran de choix et dans la question « Toujours prendre ce produit ? ». L'adresse vient de la page
// de l'enseigne (texte non fiable) : elle est revérifiée ici (`photoUrl`, https, hôte de la liste blanche, sans identifiant ni port) avant d'être
// donnée à une balise `img` créée par le DOM (jamais de HTML injecté). Une adresse refusée ou une image qui ne charge pas ne laisse AUCUNE trace :
// pas d'icône d'image cassée, pas de message, la fiche reste en texte.
import { photoUrl } from '../photo-url'
import { h } from './dom'

/**
 * Le cadre de la photo, ou `null` si l'adresse est absente ou refusée. `alt` : le libellé du produit (vide quand la photo est décorative, à côté du nom). Le cadre se retire tout seul si l'image ne charge
 * pas ; aucun `referrerpolicy` ni `crossorigin` : la requête est celle d'une image de la page elle-même.
 */
export function photoFrame(
  address: string | null | undefined,
  alt: string,
  size: 'normal' | 'small' = 'normal',
): HTMLElement | null {
  const src = photoUrl(address)
  if (src === null) return null
  const frame = h('span', { class: size === 'small' ? 'photo small' : 'photo' })
  const side = size === 'small' ? '64' : '80'
  const image = h('img', {
    attrs: { alt, loading: 'lazy', decoding: 'async', width: side, height: side },
    on: { error: () => frame.remove() },
  })
  // `src` en dernier : l'écouteur d'erreur est déjà posé quand le chargement commence.
  image.setAttribute('src', src)
  frame.appendChild(image)
  return frame
}
