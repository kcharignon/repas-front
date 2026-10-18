// La lecture du magasin par l'application (DRV-307, décision D28) : le front demande à l'application d'ouvrir le drive en mode
// réglage (message `drive.setup`) et reçoit le magasin lu sur la page. Ce module est la seule frontière : l'écran des réglages n'en
// connaît que ces deux fonctions. L'implémentation réelle (message `drive.setup` du pont, côté application DRV-314) est branchée à
// l'intégration ; en attendant, la lecture est déclarée indisponible et l'écran propose la saisie de l'adresse.

/** Le magasin lu par l'agent : son identifiant et son adresse (jamais son nom, que l'agent ne lit pas). */
export interface StoreReading {
  id: string
  baseUrl: string
  label?: string | null
}

export type StoreReadErrorCode =
  /** L'application ne sait pas (encore) lire le magasin. */
  | 'UNAVAILABLE'
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

/** L'application sait-elle lire le magasin ? Faux tant que l'intégration n'est pas faite : l'écran n'affiche alors pas le bouton. */
export function canReadStoreFromApp(): boolean {
  return false
}

/** Demande à l'application d'ouvrir le drive en mode réglage et rend le magasin choisi ; lève une `StoreReadError`. */
export function readStoreFromApp(): Promise<StoreReading> {
  return Promise.reject(new StoreReadError('UNAVAILABLE'))
}
