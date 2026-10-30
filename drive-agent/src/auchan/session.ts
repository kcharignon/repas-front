// La connexion de la personne chez Auchan : le site écrit `sessionStorage.tracking_authenticated` (`"false"` visiteur, `"true"` connecté, D-6, mesuré
// sur le téléphone de test le 2026-10-30). Un seul signe, lu sans requête. Il se met à jour AU CHARGEMENT SUIVANT d'une page : juste après une
// déconnexion il a encore dit `"true"` un instant (rapport DRV-713) ; un « vrai » trop long ne bloque donc rien, et un « faux » est lu à la lettre.
// Tout autre contenu (absent, autre valeur) : état inconnu, l'agent ne devine pas et ne s'arrête pas pour cela. Les noms de signes sont ceux de
// l'agent (`STATE_FLAG_ON` / `STATE_FLAG_OFF` : un indicateur d'état de la page), jamais une valeur lue.
import type { SessionReading } from '../retailers/contract'

/** Ce que la valeur de `tracking_authenticated` dit de la connexion. */
export function readSession(flag: string | null): SessionReading {
  if (flag === 'false') return { state: 'VISITOR', signs: ['STATE_FLAG_OFF'] }
  if (flag === 'true') return { state: 'MEMBER', signs: ['STATE_FLAG_ON'] }
  return { state: 'UNKNOWN', signs: [] }
}
