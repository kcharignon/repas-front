import { LIMITS } from '@drive-protocol'

/**
 * Les rayons du produit (DRV-642) : le plan du back donne, par ligne, les rayons de l'enseigne où l'on prend d'habitude l'ingrédient
 * (`rayonHints`), et l'agent rend, pour le produit choisi, son rayon et sa famille (`rayonId`, `familyId`) que `PUT /drive/choices` accepte.
 *
 * TEMPORAIRE : ces trois champs ne sont pas encore dans le contrat OpenAPI figé (`api/contract.json`). Les types ci-dessous les ajoutent à la
 * main ; quand `npm run api:update` apporte les champs du back, ils sont générés dans `src/api/schema.d.ts` : supprimer alors ces types et
 * lire `DrivePlanLine['rayonHints']` et `ChoiceIntent['product']` directement (le compilateur dira où).
 */
export interface WithRayonHints {
  /** Du rayon le plus choisi au moins choisi ; absent ou vide : rien n'est appris. */
  rayonHints?: readonly number[] | null
}

export interface WithRayon {
  rayonId?: number
  familyId?: number
}

/** Un identifiant de rayon ou de famille que le protocole accepte : un entier de 1 à 2 147 483 647. Sinon `null`. */
export function catalogIdOf(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= LIMITS.catalogId
    ? value
    : null
}

/**
 * Les rayons conseillés d'une ligne tels qu'ils partent à l'agent : les valeurs valides seulement (jamais un message que l'agent refuserait en
 * bloc), sans doublon, trois au plus, dans l'ordre reçu. Vide quand le back n'en donne pas.
 */
export function rayonHintsOf(line: WithRayonHints): number[] {
  const hints: number[] = []
  for (const value of line.rayonHints ?? []) {
    const id = catalogIdOf(value)
    if (id !== null && !hints.includes(id)) hints.push(id)
    if (hints.length === LIMITS.rayonHints) break
  }

  return hints
}
