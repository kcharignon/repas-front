import { computed } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { QueryClient } from '@tanstack/vue-query'

import { unwrap } from '@/api'
import type { ChoiceIntent, DriveSettings, DriveStorePayload } from '@/api'
import { shoppingListKeys } from '@/features/shopping-lists/queries'
import { useSessionStore } from '@/session/session'

import { retailerOf } from './retailers'
import type { Retailer, RetailerId } from './retailers'

export const driveKeys = {
  all: ['drive'] as const,
  settings: ['drive', 'settings'] as const,
  appInfo: ['drive', 'app-info'] as const,
  plan: (listId: string) => ['drive', 'plan', listId] as const,
  // Sous les clés des listes : toute écriture sur une liste (qui invalide `shoppingListKeys.all`) relit aussi son estimation
  estimate: (listId: string) => [...shoppingListKeys.all, 'drive-estimate', listId] as const,
}

/**
 * Les réglages du drive : l'interrupteur de la fonction (`enabled`) et le magasin de l'utilisateur. Sans interrupteur
 * allumé, aucune action du drive n'est proposée ; en cas d'échec de lecture, on ne propose rien non plus.
 */
export function useDriveSettings(enabled: () => boolean = () => true) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: driveKeys.settings,
    queryFn: () => unwrap(api.GET('/api/v1/drive/settings')),
    enabled: computed(enabled),
  })
}

/**
 * L'enseigne du drive de l'utilisateur, d'après ses réglages (`retailer`) ; l'enseigne par défaut du registre tant qu'ils ne sont pas lus. C'est
 * d'elle que viennent le nom des textes et l'enseigne de chaque appel de l'API : jamais un littéral.
 */
export function useRetailer() {
  const settings = useDriveSettings()

  return computed(() => retailerOf(settings.data.value?.retailer))
}

/** L'enseigne des réglages déjà lus, au moment de l'appel (sans les lire de nouveau) : pour les appels de l'API faits hors d'un rendu. */
export const cachedRetailer = (queryClient: QueryClient): Retailer =>
  retailerOf(queryClient.getQueryData<DriveSettings>(driveKeys.settings)?.retailer)

/**
 * Le plan d'une liste envoyée : ce que le back sait de chaque ligne (produits classés, refusés, nombre de produits). Il dépend des
 * choix mémorisés, qui changent entre deux ouvertures : il est relu à chaque ouverture de l'écran, jamais gardé.
 */
export function useDrivePlan(listId: () => string, enabled: () => boolean = () => true) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => driveKeys.plan(listId())),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/drive/plans/{shoppingListId}', {
          params: { path: { shoppingListId: listId() } },
        }),
      ),
    enabled: computed(enabled),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })
}

/**
 * Enregistre ce que le passage a appris (`PUT /drive/choices`), lot après lot (200 intentions au plus par appel, un seul lot presque
 * toujours). L'écran du retour dit lui-même l'échec et propose de réessayer : pas de notification en plus.
 */
export function useSaveChoices() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ storeId, batches }: { storeId: string; batches: ChoiceIntent[][] }) => {
      for (const choices of batches)
        await unwrap(
          api.PUT('/api/v1/drive/choices', {
            body: { retailer: cachedRetailer(queryClient).id, storeId, choices },
          }),
        )
    },
    meta: { silent: true },
  })
}

/**
 * Enregistre le magasin de l'utilisateur (`PUT /drive/settings`) ; il remplace le précédent. `retailer` (DRV-709) : le drive de la ligne touchée
 * dans « Mes drives » ; sans lui, celui des réglages (le seul quand il n'y en a qu'un). L'échec s'affiche dans l'écran (`silent`) ; en cas de succès,
 * tout ce que le drive a lu pour l'ancien magasin (choix, plans) est relu.
 */
export function useSaveDriveSettings() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ store, retailer }: { store: DriveStorePayload; retailer?: RetailerId }) =>
      unwrap(
        api.PUT('/api/v1/drive/settings', {
          body: { retailer: retailer ?? cachedRetailer(queryClient).id, store },
        }),
      ),
    meta: { silent: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: driveKeys.all }),
  })
}

/**
 * Fixe le drive habituel (`PUT /drive/default-retailer`, DRV-709), ou l'efface (`null`, « Aucun ») : la clé `retailer` est toujours écrite. L'échec
 * s'affiche dans l'écran (`silent`) ; en cas de succès les réglages sont relus (la sélection du back change avec lui).
 */
export function useSetDefaultRetailer() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (retailer: RetailerId | null) =>
      unwrap(api.PUT('/api/v1/drive/default-retailer', { body: { retailer } })),
    meta: { silent: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: driveKeys.settings }),
  })
}

/**
 * Retire un drive (`DELETE /drive/settings?retailer=`, DRV-709) : son magasin n'est plus enregistré ; les produits habituels et les choix restent,
 * pour un retour. Le back efface lui-même le drive habituel et la dernière enseigne si c'était celui-là. L'échec s'affiche dans l'écran (`silent`) ;
 * en cas de succès tout ce que le drive a lu est relu.
 */
export function useRemoveDrive() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (retailer: RetailerId) =>
      unwrap(api.DELETE('/api/v1/drive/settings', { params: { query: { retailer } } })),
    meta: { silent: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: driveKeys.all }),
  })
}

/**
 * L'estimation du coût d'une liste d'après les prix mémorisés (DRV-612). Elle dépend des produits choisis et des prix vus, qui changent
 * entre deux ouvertures : elle est relue à chaque ouverture de l'écran, et après toute écriture sur les listes.
 */
export function useDriveEstimate(listId: () => string, enabled: () => boolean = () => true) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => driveKeys.estimate(listId())),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/drive/estimates/{shoppingListId}', {
          params: { path: { shoppingListId: listId() } },
        }),
      ),
    enabled: computed(enabled),
    staleTime: 0,
    refetchOnMount: 'always',
  })
}
