// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Le code du banc publié sur jsDelivr (DRV-009) : où il est dans le dépôt et d'où le chargeur le tire.

/** Le fichier versionné que jsDelivr sert, relatif à `drive-agent/lab/`. */
export const PUBLISHED_FILE = 'published/lab.js'

/** Dépôt public d'où jsDelivr tire le fichier (adresse figée sur un commit, jamais sur une branche). */
export const GITHUB_REPO = 'kcharignon/repas-front'

/** Longueur maximale de la chaîne du chargeur : elle doit tenir dans un favori synchronisé (DRV-006). */
export const LOADER_LIMIT = 1500
