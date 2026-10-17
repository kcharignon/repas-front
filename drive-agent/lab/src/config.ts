// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
// Constantes du banc d'essai : tout ce qui se règle (cadence, tailles, limites) est ici.

export const LAB_NOTICE = 'Outil de test jetable, à supprimer après la décision G1 (DRV-005)'
export const LAB_VERSION = '1.0.0'

/** Seule autre adresse que l'hôte Leclerc courant : navigation explicite des essais 7 et 8. */
export const REPAS_ORIGIN = 'https://kantin.eu'

/** Cadence entre deux requêtes (architecture.md § 8) : 800 ms plus une gigue allant jusqu'à 700 ms. */
export const CADENCE_BASE_MS = 800
export const CADENCE_JITTER_MS = 700

/** Essai 4 : cinq recherches de mots courants, une par mot. */
export const CADENCE_QUERIES = ['farine', 'sucre', 'lait', 'beurre', 'oeufs'] as const

/** Essai 11 : nombre maximal de noms traités. */
export const BATCH_MAX = 30

/** Essais 2 et 3 : recherche proposée par défaut. */
export const DEFAULT_QUERY = 'farine'

/** Essai 2 : nombre de produits détaillés à l'écran. */
export const PRODUCTS_SHOWN = 5

/** Essai 10 : nombre maximal de produits comparés. */
export const CONTENT_SAMPLE = 30

/** Essai 7 : tailles des fragments factices, en Ko (1 Ko = 1024 caractères). */
export const FRAGMENT_SIZES_KO = [6, 16, 64] as const

/** Essai 9 : durée de maintien de l'écran allumé. */
export const WAKE_LOCK_MS = 60_000

/** Extrait de page affiché quand l'analyse échoue (ticket : 300 caractères autour du premier mot-clé). */
export const EXCERPT_CHARS = 300

/** Délai d'attente du chargement du cadre de l'essai 5. */
export const FRAME_LOAD_TIMEOUT_MS = 20_000

/** Taille maximale de la chaîne du favori (octets) ; `make lab` échoue au-delà. */
export const BOOKMARKLET_LIMIT = 60_000

/** Essai 11 : 30 noms d'ingrédients courants, modifiables dans le champ de saisie. */
export const DEFAULT_INGREDIENTS: readonly string[] = [
  'farine',
  'sucre',
  'sel',
  'poivre',
  "huile d'olive",
  'beurre',
  'lait',
  'oeufs',
  'crème fraîche',
  'riz',
  'pâtes',
  'tomates',
  'oignons',
  'ail',
  'pommes de terre',
  'carottes',
  'courgettes',
  'poulet',
  'steak haché',
  'jambon',
  'fromage râpé',
  'yaourt nature',
  'pain de mie',
  'levure chimique',
  'chocolat noir',
  'citron',
  'bananes',
  'vinaigre balsamique',
  'moutarde',
  'concentré de tomates',
]
