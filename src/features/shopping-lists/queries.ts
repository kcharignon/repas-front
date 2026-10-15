import { computed, ref, watchEffect } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { ifMatch, unwrap } from '@/api'
import type { ShoppingList } from '@/api'
import { useSessionStore } from '@/session/session'

export const shoppingListKeys = {
  all: ['shopping-lists'] as const,
  collection: ['shopping-lists', 'collection'] as const,
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
    // `version` : celle de la liste affichée (ETag) ; si elle a changé ailleurs, le back répond 412 et l'écran se relit.
    mutationFn: ({
      mealId,
      serving,
      version,
    }: {
      mealId: string
      serving: number
      version: number
    }) =>
      unwrap(
        api.PUT('/api/v1/meals/{id}/serving', {
          params: { path: { id: mealId }, header: ifMatch(version) },
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
    mutationFn: ({ recipeId, version }: { recipeId: string; version: number }) =>
      unwrap(
        api.DELETE('/api/v1/shopping-lists/active/recipes/{recipeId}', {
          params: { path: { recipeId }, header: ifMatch(version) },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}

/** Les listes de l'utilisateur, de la plus récente à la plus ancienne. */
export function useShoppingLists() {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: shoppingListKeys.collection,
    queryFn: () => unwrap(api.GET('/api/v1/shopping-lists')),
  })
}

/** Le détail d'une liste précise (pas seulement l'active). */
export function useShoppingList(id: () => string) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => shoppingListKeys.detail(id())),
    queryFn: () =>
      unwrap(api.GET('/api/v1/shopping-lists/{id}', { params: { path: { id: id() } } })),
  })
}

/** Nouvelle liste active : l'éventuelle liste active passe en pause, les listes terminées sont supprimées par le back. */
export function useCreateShoppingList() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/shopping-lists')),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}

type Lifecycle = 'activate' | 'pause' | 'complete'

/** Activer, mettre en pause ou terminer une liste (transitions d'état, ADR 0007 §11 du back). */
export function useChangeListStatus() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: Lifecycle }) => {
      const params = { params: { path: { id } } }

      switch (action) {
        case 'activate':
          return unwrap(api.POST('/api/v1/shopping-lists/{id}/activate', params))
        case 'pause':
          return unwrap(api.POST('/api/v1/shopping-lists/{id}/pause', params))
        case 'complete':
          return unwrap(api.POST('/api/v1/shopping-lists/{id}/complete', params))
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}

/** Renomme une liste ; un nom vide rétablit le nom par défaut (la date). */
export function useRenameShoppingList() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, name, version }: { id: string; name: string; version: number }) =>
      unwrap(
        api.PATCH('/api/v1/shopping-lists/{id}', {
          params: { path: { id }, header: ifMatch(version) },
          body: { name: name.trim() === '' ? null : name.trim() },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}

export function useDeleteShoppingList() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/v1/shopping-lists/{id}', { params: { path: { id } } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}
