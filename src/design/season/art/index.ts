import type { Season } from '../../season'

/**
 * Les illustrations de saison (ADR 0012) : pour chaque saison, quelle pièce (un fichier de `art/<saison>/`) tient chaque emplacement.
 * Aucune vue ne connaît le nom d'une saison ni d'une pièce : elle demande un emplacement (`SeasonArt name="empty-list"`).
 * Une saison nouvelle ajoute ses fichiers et sa table ici, rien d'autre.
 */

/** Les emplacements : un nom qui dit où la pièce est posée, jamais ce qu'elle représente. */
export const SLOTS = [
  'hero',
  'corner',
  'scene',
  'aside',
  'empty-list',
  'empty-recipes',
  'empty-search',
  'offline',
  'not-found',
  'error',
  'title-list',
  'title-recipes',
  'title-aisles',
  'title-account',
  'recipe-placeholder',
] as const

export type Slot = (typeof SLOTS)[number]

/** Emplacement → nom du fichier (sans `.svg`). Une pièce ne tient jamais deux emplacements d'un même écran. */
export const PACKS: Record<Season, Record<Slot, string>> = {
  halloween: {
    hero: 'witch',
    corner: 'cobweb-corner',
    scene: 'manor',
    aside: 'cobweb',
    'empty-list': 'witch',
    'empty-recipes': 'pumpkin',
    'empty-search': 'ghost',
    offline: 'bat',
    'not-found': 'ghost',
    error: 'spider',
    'title-list': 'pumpkin',
    'title-recipes': 'potion',
    'title-aisles': 'cat',
    'title-account': 'moon',
    'recipe-placeholder': 'candy',
  },
  noel: {
    hero: 'cabin',
    corner: 'lights-corner',
    scene: 'village',
    aside: 'star',
    'empty-list': 'tree',
    'empty-recipes': 'gingerbread',
    'empty-search': 'snowman',
    offline: 'reindeer',
    'not-found': 'reindeer',
    error: 'sock',
    'title-list': 'gift',
    'title-recipes': 'candycane',
    'title-aisles': 'tree',
    'title-account': 'bauble',
    'recipe-placeholder': 'gingerbread',
  },
}

/**
 * Les emplacements dont la pièce se charge dès le démarrage de la saison : leur écran n'apparaît que sans réseau (le bandeau « hors
 * connexion »), où il serait trop tard pour aller la chercher.
 */
export const PRELOADED_SLOTS: readonly Slot[] = ['offline']

/** Les pièces laissées libres exprès (dessinées, pas encore posées) : le test de la table les connaît. */
export const FREE_PIECES: Record<Season, readonly string[]> = { halloween: [], noel: [] }

// Un fichier par pièce, chargé À LA DEMANDE : hors saison (ou décor coupé), aucun octet de décor n'est téléchargé.
// Le contenu vient de NOS fichiers versionnés, jamais d'une donnée de l'utilisateur.
const files = import.meta.glob<string>('./*/*.svg', { query: '?raw', import: 'default' })

/** Les noms de pièces qui existent pour une saison. */
export function pieceNames(season: Season): string[] {
  return Object.keys(files)
    .filter((path) => path.startsWith(`./${season}/`))
    .map((path) => path.slice(season.length + 3, -'.svg'.length))
}

const loaded = new Map<string, Promise<string | null>>()

/**
 * Le SVG de cet emplacement pour cette saison, ou `null` (emplacement ou fichier inconnu). Décoratif : `aria-hidden` et
 * `focusable="false"` sont posés ici, une pièce n'est jamais dans l'ordre de tabulation ni lue par un lecteur d'écran.
 */
export function loadPiece(season: Season, slot: string): Promise<string | null> {
  const piece = (PACKS[season] as Record<string, string | undefined>)[slot]
  const load = piece === undefined ? undefined : files[`./${season}/${piece}.svg`]
  if (load === undefined) return Promise.resolve(null)
  const key = `${season}/${piece}`
  let promise = loaded.get(key)
  if (promise === undefined) {
    promise = load()
      .then((raw) => raw.replace('<svg ', '<svg aria-hidden="true" focusable="false" '))
      .catch(() => {
        // Hors ligne et jamais vue : pas d'illustration, jamais d'erreur ; un nouvel essai reste possible.
        loaded.delete(key)

        return null
      })
    loaded.set(key, promise)
  }

  return promise
}
