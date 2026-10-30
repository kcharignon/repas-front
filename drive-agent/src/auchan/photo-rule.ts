import type { PhotoRule } from '../retailers/names'

/**
 * Où les photos des produits d'Auchan vivent (DRV-714, mesuré : `cdn.auchan.fr/media/…`, nom du genre `S…G1GPRIMARY`) : l'hôte `cdn.auchan.fr` et un chemin
 * qui commence par `/media/`, en `https`, sans identifiant ni port. NON MESURÉ : que toutes les photos d'un magasin soient là (une seule forme d'adresse a
 * été vue) ; une autre adresse laisse la fiche en texte, sans erreur.
 */
export const PHOTO_RULE: PhotoRule = {
  host: /^cdn\.auchan\.fr$/,
  path: /^\/media\/[^/]/,
}
