import type { ProtocolError, ResultMessage, SetupResultMessage } from '../../protocol'

/**
 * Le canal entre Repas et l'agent. Le protocole (messages, validation, bornes) est le même pour tous les transports ; seul change le
 * moyen de faire passer le message :
 *  - `fragmentTransport` : le fragment d'adresse (`#repas=…` à l'aller, `…/drive/retour#result=…` au retour), pour le favori de bureau
 *    et les tests ;
 *  - `bridgeTransport` : le pont de l'application Android (DRV-313), pour l'application « Repas Drive ».
 */
export interface Transport {
  /**
   * Écoute le message de Repas (plan ou setup). `onMessage` reçoit le message décodé, pas encore validé : l'agent le passe à
   * `validatePlan`. `onInvalid` reçoit un message illisible (trop gros, ni base64url ni JSON). Un message déjà arrivé est livré aussitôt.
   */
  listen(onMessage: (message: unknown) => void, onInvalid: (error: ProtocolError) => void): void
  /** Renvoie le résultat à Repas. */
  send(message: ResultMessage | SetupResultMessage): void
}
