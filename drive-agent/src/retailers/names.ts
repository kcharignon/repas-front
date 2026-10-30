// Ce que l'interface et le diagnostic savent de l'enseigne de la page (DRV-705). Un fichier sans import : les textes (`ui/`) en dépendent sans tirer l'adaptateur.
export interface RetailerNames {
  readonly name: string
  readonly nameDe: string
}

/** Ce que l'interface et le diagnostic savent de l'enseigne de la page : son identifiant, ses noms, son domaine et la lecture de ses hôtes. */
export interface RetailerInfo extends RetailerNames {
  readonly id: string
  /** Le domaine du site, pour les relevés du diagnostic (« autre hôte <domaine> »). */
  readonly siteDomain: string
  /** Vrai : cet hôte de page est un hôte de cette enseigne (en minuscules). */
  matchesHost(host: string): boolean
  /** La famille d'hôte d'un magasin (un texte court, jamais le numéro du magasin), `null` si l'hôte n'est pas celui d'un magasin. */
  hostFamily(host: string): string | null
  /** Vrai pour le site mobile de l'enseigne, que l'agent n'utilise pas. */
  isMobileHost(host: string): boolean
}
