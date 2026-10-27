/** Clé du navigateur où `persistence.ts` garde la copie hors-ligne de la liste en cours. */
export const OFFLINE_COPY_KEY = 'repas.cache'

/**
 * Efface la copie hors-ligne du navigateur, sans condition : appelée à chaque fin de session (déconnexion, session perdue, mot de
 * passe changé, autre fenêtre déconnectée), que l'utilisateur de la page ait déjà été oublié ou non.
 */
export function eraseOfflineCopy() {
  try {
    localStorage.removeItem(OFFLINE_COPY_KEY)
  } catch {
    // Stockage indisponible : rien n'a été gardé.
  }
}
