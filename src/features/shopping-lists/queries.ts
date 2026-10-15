import { computed, ref, watchEffect } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { unwrap } from '@/api'
import type { ShoppingList } from '@/api'
import { useSessionStore } from '@/session/session'

export const shoppingListKeys = {
  all: ['shopping-lists'] as const,
  activeSummary: ['shopping-lists', 'active', 'summary'] as const,
  detail: (id: string) => ['shopping-lists', 'detail', id] as const,
}

/**
 * La liste active : son identifiant (résumé), puis son détail. `null` : l'utilisateur n'a pas de liste en cours.
 * Cocher la dernière ligne termine la liste : le back n'en a alors plus d'active, mais l'écran garde la liste qu'il vient
 * d'afficher (terminée) au lieu de dire « aucune liste » ; `forget()` l'oublie (nouvelle liste).
 */
export function useActiveShoppingList() {
  const { api } = useSessionStore()

  const summary = useQuery({
    queryKey: shoppingListKeys.activeSummary,
    queryFn: () => unwrap(api.GET('/api/v1/shopping-lists/active/summary')),
  })
  const lastId = ref<string | null>(null)
  watchEffect(() => {
    const current = summary.data.value?.shoppingListId
    if (current) lastId.value = current
  })
  const id = computed(() => summary.data.value?.shoppingListId ?? lastId.value)

  const detail = useQuery({
    queryKey: computed(() => shoppingListKeys.detail(id.value ?? '')),
    queryFn: () =>
      unwrap(api.GET('/api/v1/shopping-lists/{id}', { params: { path: { id: id.value ?? '' } } })),
    enabled: computed(() => id.value !== null),
  })

  return { summary, id, detail, forget: () => (lastId.value = null) }
}

/** Crée la liste active si l'utilisateur n'en a pas (le front le demande, la lecture n'a plus d'effet de bord). */
export function useEnsureActiveShoppingList() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => unwrap(api.PUT('/api/v1/shopping-lists/active')),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}

/**
 * Cocher ou décocher une ligne : l'écran change tout de suite (mise à jour optimiste), le back confirme ensuite ; en cas
 * d'erreur la ligne revient à son état et la liste est relue.
 */
export function useToggleRow(listId: () => string | null) {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ rowId, checked }: { rowId: string; checked: boolean }) => {
      const params = { params: { path: { id: rowId } } }

      return unwrap(
        checked
          ? api.POST('/api/v1/shopping-list-rows/{id}/tick', params)
          : api.POST('/api/v1/shopping-list-rows/{id}/uncheck', params),
      )
    },
    onMutate: async ({ rowId, checked }) => {
      const id = listId()
      if (id === null) return undefined
      const key = shoppingListKeys.detail(id)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ShoppingList>(key)
      if (previous !== undefined) {
        queryClient.setQueryData<ShoppingList>(key, {
          ...previous,
          departments: previous.departments.map((department) => ({
            ...department,
            rows: department.rows.map((row) => (row.id === rowId ? { ...row, checked } : row)),
          })),
        })
      }

      return { key, previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(context.key, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}

/** Change le nombre de personnes d'un repas : le back recalcule les quantités de la liste. */
export function useChangeServing() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ mealId, serving }: { mealId: string; serving: number }) =>
      unwrap(
        api.PUT('/api/v1/meals/{id}/serving', {
          params: { path: { id: mealId } },
          body: { serving },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}

/** Retire une recette de la liste active (ses ingrédients sont déduits par le back). */
export function useUnplanRecipe() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (recipeId: string) =>
      unwrap(
        api.DELETE('/api/v1/shopping-lists/active/recipes/{recipeId}', {
          params: { path: { recipeId } },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}
