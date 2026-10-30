import type { DriveSettings, DriveStore } from '@/api'

import type { RetailerId } from './retailers'

/** Un drive de « Mes drives » (DRV-709) : ce que le back dit d'une enseigne allumée, rien de plus. */
export interface Drive {
  id: RetailerId
  /** Le nom, tel que le back le dit : c'est celui des textes de la ligne. */
  name: string
  /** Un magasin est enregistré chez ce drive. */
  configured: boolean
  /** C'est le drive habituel de la personne. */
  isDefault: boolean
  store: DriveStore | null
}

/**
 * Les drives allumés de la personne, d'après `retailers` des réglages (les champs sont lus un à un : un champ de plus du back est toléré).
 * Un back qui ne sert pas `retailers` (ou l'un de ses champs) n'a qu'un drive : la liste est vide, l'écran garde sa forme d'avant.
 */
export function drivesOf(settings: DriveSettings | undefined): Drive[] {
  return (settings?.retailers ?? []).map((entry) => {
    const store = entry.store ?? null

    return {
      id: entry.retailer,
      name: entry.name,
      configured: entry.configured === true && store !== null,
      isDefault: entry.isDefault === true,
      store,
    }
  })
}

/** « Mes drives » n'existe qu'avec plusieurs drives allumés : avec un seul, l'écran est celui d'avant (règle 1 du chantier). */
export const hasSeveralDrives = (drives: readonly Drive[]): boolean => drives.length > 1
