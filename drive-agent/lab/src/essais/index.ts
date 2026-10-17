// Outil de test jetable, à supprimer après la décision G1 (DRV-005).
import type { Essai } from '../ui/types'
import { cadence } from './cadence'
import { cadre, capture } from './cadre'
import { contenu } from './contenu'
import { dispo } from './dispo'
import { ecran } from './ecran'
import { fragment, retour } from './fragment'
import { lot } from './lot'
import { panier } from './panier'
import { recherche } from './recherche'
import { sonde } from './sonde'

/** Les 12 essais du menu, dans l'ordre du ticket DRV-001. */
export const ESSAIS: readonly Essai[] = [
  sonde,
  recherche,
  panier,
  cadence,
  cadre,
  capture,
  fragment,
  retour,
  ecran,
  contenu,
  lot,
  dispo,
]
