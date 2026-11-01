// Le magasin que la personne a choisi à la place de celui de Repas (DRV-755). À l'étape guidée du choix du magasin, la personne ouvre un autre magasin que celui du plan ;
// l'agent le lui propose (« Tu as ouvert <ville> »), elle touche « Utiliser ce magasin » et l'agent rend un résultat `aborted` qui porte ce magasin (`chosenStore`). Ce
// fichier juge ce résultat : c'est le seul endroit où le site décide qu'il y a un magasin à retenir. La page de l'enseigne partage le monde JavaScript de l'agent et peut
// poster un faux résultat : rien n'est retenu qui ne soit celui du drive du passage en cours, sous la règle de l'enseigne (les mêmes que la lecture du magasin des
// réglages), et jamais autre chose qu'un envoi arrêté avant le moindre article (le validateur du protocole le garantit déjà).
import { retailerOfHost } from '@drive-protocol'
import type { ResultMessage } from '@drive-protocol'

import type { DriveStorePayload } from '@/api'
import { parseStoreAddress, readExplicitStore } from './storeAddress'
import { retailerOf } from './retailers'
import type { RetailerId } from './retailers'

/** Le magasin à retenir, et le drive pour lequel il l'est. */
export interface ChosenStore {
  retailer: RetailerId
  store: DriveStorePayload
}

/**
 * Le magasin choisi d'un résultat, ou `null` quand il n'y en a pas, ou qu'on ne peut pas le croire : ni un envoi arrêté (`aborted`), ni le drive du passage (`draftRetailer`,
 * celui du brouillon), ni une adresse de base que la règle de l'enseigne reconnaît pour CE numéro de magasin.
 */
export function chosenStoreOf(
  result: ResultMessage,
  draftRetailer: RetailerId,
): ChosenStore | null {
  const found = result.chosenStore
  if (found === undefined || result.outcome !== 'aborted') return null
  // L'hôte du magasin est celui d'une enseigne connue, et c'est celle du passage : jamais le magasin d'un autre drive
  if (retailerOfHost(found.host) !== draftRetailer) return null
  const drive = retailerOf(draftRetailer)
  const address =
    drive.storeIdSource === 'EXPLICIT'
      ? readExplicitStore(found.id, found.baseUrl, drive)
      : parseStoreAddress(found.baseUrl, drive)
  if (address === null || address.id !== found.id) return null

  return {
    retailer: draftRetailer,
    store: { id: address.id, baseUrl: address.baseUrl, label: found.label },
  }
}
