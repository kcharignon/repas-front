import type { DriveSettings } from '@/api'

import { drivesOf } from './drives'
import type { Drive } from './drives'
import { appServes } from './retailers'
import type { RetailerId } from './retailers'

/**
 * Le choix du drive à l'envoi (DRV-710). La règle R1 à R5 (`multi-enseignes.md` § 5) est calculée par le back et lue dans `selection` des réglages :
 * ce fichier ne la recopie pas, il en tire seulement ce que l'écran montre (les tuiles, le drive de l'envoi). Un seul drive configuré : aucune question ; plusieurs :
 * la question est toujours posée (`ASK`), le drive habituel n'est que la présélection (DRV-737). Un back qui
 * ne sert pas `selection` (ou des réglages pas encore lus) donne l'écran d'avant : un seul drive, celui de `retailer`.
 */
export interface SendChoiceInput {
  settings: DriveSettings | undefined
  /** Le drive touché sur l'écran (une tuile) ; `null` : aucun. */
  picked: RetailerId | null
}

export interface SendChoice {
  /** Le drive de cet envoi ; `undefined` tant que les réglages ne le disent pas (le back prend alors celui de sa sélection). */
  retailer: RetailerId | undefined
  /** Les tuiles de la question « Où envoyer ta liste ? » ; vide : aucune question. */
  tiles: Drive[]
  /** Plusieurs drives sont configurés : le bouton principal nomme le drive (« Remplir le panier {drive} »), sinon c'est « Remplir mon panier ». */
  named: boolean
}

/** La sélection du back ; absente d'un back plus ancien et des réglages pas encore lus (le type du contrat la dit toujours là). */
const selectionOf = (settings: DriveSettings | undefined): DriveSettings['selection'] | undefined =>
  settings?.selection

/** Les drives candidats de la sélection, dans l'ordre des réglages (stable, quelle que soit la dernière utilisation). */
function candidatesOf(settings: DriveSettings | undefined): Drive[] {
  const candidates: readonly string[] = selectionOf(settings)?.candidates ?? []

  return drivesOf(settings).filter((drive) => candidates.includes(drive.id))
}

export function sendChoice({ settings, picked }: SendChoiceInput): SendChoice {
  const selection = selectionOf(settings)
  const candidates = candidatesOf(settings)
  const several = candidates.length > 1
  // `retailer` de la sélection : le drive à utiliser (`AUTO`) ou la présélection (`ASK`) ; à défaut, celui des réglages
  const base: RetailerId | undefined = selection?.retailer ?? settings?.retailer
  const asking = several && selection?.mode === 'ASK'

  if (!asking) return { retailer: base, tiles: [], named: several }

  const touched = candidates.find((drive) => drive.id === picked)?.id

  return { retailer: touched ?? base, tiles: candidates, named: true }
}

/**
 * Faut-il d'abord choisir un magasin ? (`selection.mode` vaut `NONE` : aucun drive n'est configuré.) Sans `selection` (un back plus ancien), c'est
 * l'absence de magasin dans les réglages, comme avant.
 */
export function needsStore(settings: DriveSettings): boolean {
  const selection = selectionOf(settings)

  return selection === undefined ? !settings.store : selection.mode === 'NONE'
}

/**
 * L'application ne sert aucun des drives configurés ? Rend alors celui que la sélection désigne (pour le nommer dans la phrase de mise à jour), sinon
 * `null` : au moins un drive est servi, l'écran d'envoi arbitre. `announced` : `app.info.retailers` (absent : le drive d'avant, `appServes`).
 */
export function unservedDrive(
  settings: DriveSettings,
  announced: readonly string[] | undefined,
): RetailerId | null {
  const candidates = candidatesOf(settings)
  const ids: readonly RetailerId[] =
    candidates.length > 0 ? candidates.map((drive) => drive.id) : [settings.retailer]
  if (ids.some((id) => appServes(announced, id))) return null

  return selectionOf(settings)?.retailer ?? ids[0] ?? null
}
