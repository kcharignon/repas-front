// Ce que le diagnostic sait de la façon dont une enseigne a dit son magasin quand il ne se lit pas dans l'adresse de la page (DRV-717) : des FORMES et
// des nombres, jamais l'identifiant, le libellé, une adresse ou une localité. Un fichier sans import.

/** Les types de contexte de courses que le parcours d'une enseigne peut déclarer ; tout autre type n'est que compté. */
export const KNOWN_CONTEXT_TYPES = ['GROCERY', 'ONLINE', 'STORE'] as const

export interface StoreReadFacts {
  /** Le code HTTP de la réponse qui a donné le magasin ; `null` si aucune réponse n'est venue. */
  status: number | null
  /** Les types de contexte connus que la réponse déclare (sans doublon, dans l'ordre de `KNOWN_CONTEXT_TYPES`). */
  contexts: string[]
  /** Combien d'autres types de contexte la réponse déclare (leur nom n'est jamais rapporté). */
  otherContexts: number
  /** `READ` : un magasin de courses lisible ; `NONE` : le contexte de courses est là mais vide (aucun magasin choisi) ; `ABSENT` : pas de contexte de courses. */
  store: 'READ' | 'NONE' | 'ABSENT'
  /** La forme de l'identifiant du magasin (jamais sa valeur) ; `null` sans magasin lu. */
  idForm: 'UUID' | 'OTHER' | null
  /** Le magasin se retire sur place (le canal de retrait au drive) ; `null` si la réponse ne le dit pas. */
  pickUp: boolean | null
  /** Le libellé du magasin est lisible. */
  label: boolean
}
