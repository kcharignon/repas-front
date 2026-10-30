// L'adaptateur d'Auchan (DRV-727) : tout ce qui est propre à l'enseigne vit dans ce dossier, derrière `RetailerAdapter`. Pour l'instant : l'hôte, la cadence de
// départ et un adaptateur vide (DRV-717 l'écrit).
export { AuchanAdapter } from './adapter'

/**
 * Le site d'Auchan : l'hôte où l'agent vit (jamais `compte.auchan.fr`, la page du mot de passe : aucun code de Repas n'y est injecté, DRV-715 § 2 point 6).
 * Le magasin ne se lit pas dans l'adresse, et un seul site sert le téléphone et l'ordinateur : pas de site mobile à refuser.
 */
export const SITE_HOST = /^www\.auchan\.fr$/

export const hostFamily = (host: string): string | null =>
  SITE_HOST.test(host.toLowerCase()) ? 'www' : null

export const isMobileHost = (): boolean => false

/**
 * La cadence de départ d'Auchan (DRV-715 § 2 point 7) : **NON MESURÉE au-delà de ce qui a été essayé** (huit recherches espacées de 2 s, des écritures
 * espacées de 2,5 s, toutes en `200`). Les chiffres de départ sont prudents ; ils se règlent à la recette réelle (DRV-726), pas avant.
 */
export const PACING = {
  pauseMs: 2_000,
  jitterMs: 1_000,
  maxPauseMs: 4_000,
  measured: false,
} as const
