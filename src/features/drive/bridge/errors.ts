/**
 * Ce qui peut empêcher un envoi au drive, dans le vocabulaire des écrans (DRV-403 à 405) qui choisissent le texte à montrer.
 *  - `UNAVAILABLE` : hors de l'application Repas (aucun pont natif) : proposer l'installation (DRV-316) et le mode assisté ;
 *  - `INVALID_PLAN` : le plan ne respecte pas le protocole v1 (`detail` : le champ fautif) ;
 *  - `TOO_LARGE` : le message dépasse les 64 Ko du pont ;
 *  - `RUN_IN_PROGRESS` : un autre passage est en cours (brouillon de moins de 24 h) ;
 *  - `SEND_FAILED` : le pont a refusé l'envoi ;
 *  - `REFUSED` : l'application a refusé (`detail` : son code, par exemple `UNKNOWN_TYPE`) ;
 *  - `TIMEOUT` : l'application n'a pas répondu ;
 *  - `INVALID_RESPONSE` : la réponse de l'application est mal formée ;
 *  - `CANCELLED` : la lecture du magasin a été abandonnée (l'utilisateur est revenu sans choisir de magasin) ;
 *  - `SETUP_FAILED` : l'agent n'a pas pu lire le magasin (`detail` : son code d'erreur, par exemple `UNSUPPORTED_PAGE`).
 */
export type DriveBridgeErrorCode =
  | 'UNAVAILABLE'
  | 'INVALID_PLAN'
  | 'TOO_LARGE'
  | 'RUN_IN_PROGRESS'
  | 'SEND_FAILED'
  | 'REFUSED'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'CANCELLED'
  | 'SETUP_FAILED'

/** Une erreur du pont. Ni son texte ni `detail` ne contiennent le message : seulement un code ou le chemin d'un champ. */
export class DriveBridgeError extends Error {
  readonly code: DriveBridgeErrorCode
  readonly detail: string | null

  constructor(code: DriveBridgeErrorCode, detail: string | null = null) {
    super(detail === null ? code : `${code} : ${detail}`)
    this.name = 'DriveBridgeError'
    this.code = code
    this.detail = detail
  }
}
