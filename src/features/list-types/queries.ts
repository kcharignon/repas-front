import { computed } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { ApiError, unwrap } from '@/api'
import { ingredientKeys } from '@/features/ingredients/queries'
import { shoppingListKeys } from '@/features/shopping-lists/queries'
import { useSessionStore } from '@/session/session'

export const listTypeKeys = {
  all: ['list-types'] as const,
  collection: ['list-types', 'collection'] as const,
  detail: (id: string) => ['list-types', 'detail', id] as const,
}

/** Au plus 10 types par compte (le back refuse le onzième) : l'écran le sait pour ne pas proposer un ajout voué à l'échec. */
export const LIST_TYPE_LIMIT = 10

/** Les types de liste de l'utilisateur, par date de création. Un compte sans type reçoit une liste vide. */
export function useListTypes() {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: listTypeKeys.collection,
    queryFn: () => unwrap(api.GET('/api/v1/shopping-list-types')),
  })
}

export function useListType(id: () => string) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => listTypeKeys.detail(id())),
    queryFn: () =>
      unwrap(api.GET('/api/v1/shopping-list-types/{id}', { params: { path: { id: id() } } })),
    enabled: computed(() => id() !== ''),
  })
}

/**
 * Ce que change un type : sa propre lecture, la liste des types, et les rayons (chacun dit le type qui le prend, `listTypeId`). Une
 * suppression ne relit pas le type qui n'existe plus, mais change « Mes listes » (la liste du type y passe en pause).
 */
function useRefresh() {
  const queryClient = useQueryClient()

  return (removed = false) => {
    void queryClient.invalidateQueries({
      queryKey: removed ? listTypeKeys.collection : listTypeKeys.all,
    })
    void queryClient.invalidateQueries({ queryKey: ingredientKeys.departments })
    if (removed) void queryClient.invalidateQueries({ queryKey: shoppingListKeys.all })
  }
}

/** Crée un type (le nom seul, les rayons viennent ensuite) ; rend son identifiant, lu dans `Location`. Le refus se dit dans la fenêtre. */
export function useCreateListType() {
  const { api } = useSessionStore()
  const refresh = useRefresh()

  return useMutation({
    meta: { silent: true },
    mutationFn: async (name: string): Promise<string> => {
      const { response, error } = await api.POST('/api/v1/shopping-list-types', { body: { name } })
      if (!response.ok) throw ApiError.fromResponse(response, error)

      return response.headers.get('Location')?.split('/').pop() ?? ''
    },
    onSettled: () => refresh(),
  })
}

/** Enregistre le nom ET le jeu complet des rayons d'un type, en une seule requête. */
export function useSaveListType(id: () => string) {
  const { api } = useSessionStore()
  const refresh = useRefresh()

  return useMutation({
    meta: { silent: true },
    mutationFn: (body: { name: string; departmentSlugs: string[] }) =>
      unwrap(api.PUT('/api/v1/shopping-list-types/{id}', { params: { path: { id: id() } }, body })),
    onSettled: () => refresh(),
  })
}

export function useRemoveListType(id: () => string) {
  const { api } = useSessionStore()
  const refresh = useRefresh()

  return useMutation({
    meta: { silent: true },
    mutationFn: () =>
      unwrap(api.DELETE('/api/v1/shopping-list-types/{id}', { params: { path: { id: id() } } })),
    onSettled: () => refresh(true),
  })
}

/** Retire un produit à part de son type : il retombe « comme son rayon » (`default`), pour les ajouts suivants. */
export function useUnsetProductDestination() {
  const { api } = useSessionStore()
  const refresh = useRefresh()

  return useMutation({
    meta: { silent: true },
    mutationFn: (slug: string) =>
      unwrap(
        api.PUT('/api/v1/ingredients/{slug}/list-destination', {
          params: { path: { slug } },
          body: { destination: 'default' },
        }),
      ),
    onSettled: () => refresh(),
  })
}
