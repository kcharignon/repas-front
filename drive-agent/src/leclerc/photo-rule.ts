import type { PhotoRule } from '../retailers/names'

/**
 * La liste blanche des hôtes d'images de Leclerc (DRV-633) : `leclercdrive.fr` et ses sous-domaines. Les photos du site réel viennent de
 * `fdN-photos.leclercdrive.fr` (`image.ashx?id=…&use=l&cat=p`, relevé de `recherche.md`) : un sous-domaine de l'enseigne, le même que celui de la page.
 * À confirmer à la recette réelle. Aucune règle de chemin.
 */
export const PHOTO_RULE: PhotoRule = {
  host: /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*leclercdrive\.fr$/,
}
