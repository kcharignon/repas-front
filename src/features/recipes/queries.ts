import { computed } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { ApiError, unwrap } from '@/api'
import { shoppingListKeys } from '@/features/shopping-lists/queries'
import { useSessionStore } from '@/session/session'

export const recipeKeys = {
  all: ['recipes'] as const,
  types: ['recipes', 'types'] as const,
  byType: (slug: string) => ['recipes', 'type', slug] as const,
  others: ['recipes', 'others'] as const,
  detail: (id: string) => ['recipes', 'detail', id] as const,
}

export function useRecipeTypes() {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: recipeKeys.types,
    queryFn: () => unwrap(api.GET('/api/v1/recipe-types')),
    staleTime: 5 * 60_000,
  })
}

/** Les recettes de l'utilisateur pour un type, triées par nom côté back. */
export function useRecipesByType(slug: () => string | null) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => recipeKeys.byType(slug() ?? '')),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/recipe-types/{slug}/recipes', {
          params: { path: { slug: slug() ?? '' } },
        }),
      ),
    enabled: computed(() => slug() !== null),
  })
}

/** Les recettes des autres utilisateurs que celui-ci n'a pas encore copiées. */
export function useOtherPeopleRecipes() {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: recipeKeys.others,
    queryFn: () => unwrap(api.GET('/api/v1/recipes/other-people')),
  })
}

export function useRecipe(id: () => string) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => recipeKeys.detail(id())),
    queryFn: () => unwrap(api.GET('/api/v1/recipes/{id}', { params: { path: { id: id() } } })),
  })
}

/** Copie une recette d'un autre dans les siennes : rend l'identifiant de la copie (en-tête `Location`). */
export function useCopyRecipe() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<string | null> => {
      const { response, error } = await api.POST('/api/v1/recipes/{id}/copy', {
        params: { path: { id } },
      })
      if (!response.ok) throw ApiError.fromResponse(response, error)

      return response.headers.get('Location')?.split('/').pop() ?? null
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: recipeKeys.all }),
  })
}

export function useDeleteRecipe() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      unwrap(api.DELETE('/api/v1/recipes/{id}', { params: { path: { id } } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: recipeKeys.all }),
  })
}

/**
 * Planifier une recette dans la liste active (ses ingrédients s'y ajoutent, avec le nombre de personnes de l'utilisateur) ou
 * l'en retirer. Sans liste active, on la crée d'abord (la lecture n'a plus d'effet de bord, ADR 0007 du back).
 */
export function usePlanRecipe() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      recipeId,
      planned,
      hasActiveList,
    }: {
      recipeId: string
      planned: boolean
      hasActiveList: boolean
    }) => {
      const params = { params: { path: { recipeId } } }
      if (!planned)
        return unwrap(api.DELETE('/api/v1/shopping-lists/active/recipes/{recipeId}', params))
      if (!hasActiveList) await unwrap(api.PUT('/api/v1/shopping-lists/active'))

      return unwrap(api.PUT('/api/v1/shopping-lists/active/recipes/{recipeId}', params))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}
