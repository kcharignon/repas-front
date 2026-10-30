// La lecture du magasin par l'application (DRV-307, DRV-320, décision D28) : le front demande à l'application d'ouvrir le drive (message
// `drive.setup` du pont) : l'utilisateur s'y connecte et y choisit son magasin, l'agent le lit sur la page et l'application revient avec
// lui. Ce module est la seule frontière : l'écran des réglages n'en connaît que ces deux fonctions.
import { driveBridge, DriveBridgeError } from './bridge'
import type { DriveBridge } from './bridge'

/** Le magasin lu par l'agent : son identifiant et son adresse (jamais son nom, que l'agent ne lit pas). */
export interface StoreReading {
  id: string
  baseUrl: string
  label?: string | null
}

export type StoreReadErrorCode =
  /** L'application ne sait pas (ou ne peut pas) lire le magasin : hors de l'application, drive coupé ou application trop ancienne. */
  | 'UNAVAILABLE'
  /** Un envoi au drive (ou une autre lecture) est déjà en cours dans l'application. */
  | 'BUSY'
  /** L'utilisateur est revenu sans avoir choisi de magasin. */
  | 'CANCELLED'
  /** L'agent n'a trouvé aucun magasin sur la page. */
  | 'NOT_FOUND'
  | 'FAILED'

export class StoreReadError extends Error {
  constructor(readonly code: StoreReadErrorCode) {
    super(code)
    this.name = 'StoreReadError'
  }
}

/** L'application sait-elle lire le magasin ? Vrai dans l'application Repas (le pont natif est là) : l'écran affiche alors le bouton. */
export function canReadStoreFromApp(bridge: DriveBridge = driveBridge): boolean {
  return bridge.isAvailable()
}

/** Pourquoi la lecture a échoué, dans le vocabulaire de l'écran des réglages. */
function codeOf(error: DriveBridgeError): StoreReadErrorCode {
  switch (error.code) {
    case 'CANCELLED':
      return 'CANCELLED'
    case 'SETUP_FAILED':
      return error.detail === 'UNSUPPORTED_PAGE' ? 'NOT_FOUND' : 'FAILED'
    case 'REFUSED':
      return error.detail === 'BUSY' ? 'BUSY' : 'UNAVAILABLE'
    case 'INVALID_RESPONSE':
      return 'FAILED'
    default:
      return 'UNAVAILABLE'
  }
}

/**
 * Demande à l'application d'ouvrir le drive pour lire le magasin choisi, et le rend (le retour peut prendre plusieurs minutes : il faut
 * se connecter et choisir son magasin). `retailer` (DRV-709) : le drive touché, nommé dans le message ; `null`, le message d'avant les drives
 * multiples (une application qui n'annonce aucun drive). Lève une `StoreReadError`.
 */
export async function readStoreFromApp(
  bridge: DriveBridge = driveBridge,
  retailer: string | null = null,
): Promise<StoreReading> {
  try {
    const store = await bridge.startSetup(retailer)

    return { id: store.id, baseUrl: store.baseUrl, label: store.label }
  } catch (error) {
    throw error instanceof DriveBridgeError ? new StoreReadError(codeOf(error)) : error
  }
}
