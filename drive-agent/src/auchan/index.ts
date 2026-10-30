// L'adaptateur d'Auchan (DRV-727, DRV-717) : tout ce qui est propre à l'enseigne vit dans ce dossier, derrière `RetailerAdapter`. DRV-717 a écrit sa première
// moitié (le magasin, la connexion, l'entrée, le diagnostic) ; la recherche (DRV-724) et le panier (DRV-725) restent à écrire.
export { AuchanAdapter, browserDeps, ENTRY_WAIT_MS, type AuchanDeps } from './adapter'
export { AUCHAN_CAUSES, type AuchanCause } from './causes'
export { PACING } from './pacing'
export { PHOTO_RULE } from './photo-rule'

/**
 * Le site d'Auchan : l'hôte où l'agent vit (jamais `compte.auchan.fr`, la page du mot de passe : aucun code de Repas n'y est injecté, DRV-715 § 2 point 6).
 * Le magasin ne se lit pas dans l'adresse, et un seul site sert le téléphone et l'ordinateur : pas de site mobile à refuser.
 */
export const SITE_HOST = /^www\.auchan\.fr$/

export const hostFamily = (host: string): string | null =>
  SITE_HOST.test(host.toLowerCase()) ? 'www' : null

export const isMobileHost = (): boolean => false
