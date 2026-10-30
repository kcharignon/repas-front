// Ce que l'interface et le diagnostic savent de l'enseigne de la page (DRV-705). Un fichier sans import : les textes (`ui/`) en dépendent sans tirer l'adaptateur.
export interface RetailerNames {
  readonly name: string
  readonly nameDe: string
}

/**
 * Où les photos de produits d'une enseigne peuvent vivre (DRV-717, la liste blanche de `photo-url.ts` rendue propre à chaque enseigne) : l'hôte de
 * l'image (en `https`, sans identifiant ni port) et, quand l'enseigne le précise, le début obligatoire de son chemin. Une adresse de photo vient de la
 * page de l'enseigne : du texte non fiable, jamais affiché hors de cette règle.
 */
export interface PhotoRule {
  /** L'hôte (en minuscules) où les images vivent. */
  readonly host: RegExp
  /** Le chemin (de `/` au premier `?`), s'il doit avoir une forme précise. Absent : tout chemin de l'hôte. */
  readonly path?: RegExp
}

/** Les noms de l'enseigne et la règle de ses photos : ce que l'écran de choix et la question « Toujours prendre ce produit ? » lui demandent. */
export interface PhotoRetailer extends RetailerNames {
  readonly photos: PhotoRule
}

/** Ce que l'interface et le diagnostic savent de l'enseigne de la page : son identifiant, ses noms, son domaine et la lecture de ses hôtes. */
export interface RetailerInfo extends PhotoRetailer {
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
