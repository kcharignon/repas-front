import { driveBridge } from '@/features/drive/bridge'
import { useDriveReturnStore } from '@/features/drive/returnStore'
import { useCopiedRecipesStore } from '@/features/recipes/copiedRecipes'
import { eraseOfflineCopy } from '@/offline/offlineCopy'

/**
 * Ce que l'application garde pour le compte connecté en dehors de la session elle-même, et qui doit partir avec elle (déconnexion,
 * mot de passe changé, session perdue, autre fenêtre déconnectée) : le brouillon du passage au drive (`repas.drive.run` : identifiant de
 * liste, articles et produits du plan envoyé) et le résultat du dernier envoi, gardé en mémoire de la page. La copie hors-ligne de la
 * liste (`repas.cache`) est effacée ici aussi, sans dépendre d'un changement d'utilisateur ; les données serveur en mémoire partent
 * avec l'utilisateur (`offline/persistence.ts`).
 *
 * Tout nouveau magasin Pinia ou toute nouvelle clé de navigateur qui porte des données du compte s'ajoute ici (et au test de ce module).
 */
export function forgetAccountData() {
  driveBridge.clearDraft()
  useDriveReturnStore().clear()
  useCopiedRecipesStore().clear()
  eraseOfflineCopy()
}
