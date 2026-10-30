// Les causes propres à l'adaptateur d'Auchan (DRV-717) : une vérification de plus qui peut échouer, dite par un code fixe (jamais un morceau de page,
// d'adresse, de cookie ni de libellé). Le tableau des causes du diagnostic (`retailers/causes.ts`) les reprend : une cause se lit au même endroit,
// quelle que soit l'enseigne qui la lève. Chaque libellé dit ce qui a été VÉRIFIÉ, pas ce qui a été deviné.
export const AUCHAN_CAUSES = {
  // Le magasin (DRV-717). Le magasin ne se lit pas dans l'adresse : le site le dit par son parcours (`GET /journey`).
  STORE_NOT_CHOSEN:
    'aucun magasin n’est choisi (pas de contexte de courses, ou barre « Choisir vos courses »)',
  JOURNEY_NOT_JSON: 'réponse du parcours qui n’est pas du JSON',
  JOURNEY_NO_CONTEXTS: 'réponse du parcours sans liste de contextes',
  JOURNEY_NO_SELLER: 'contexte de courses sans vendeur lisible',
  JOURNEY_STORE_ID_INVALID: 'identifiant du magasin qui n’a pas la forme attendue',
  // La page courante.
  PAGE_NOT_FOUND: 'la page est une page « introuvable » du site (404)',
} as const

export type AuchanCause = keyof typeof AUCHAN_CAUSES
