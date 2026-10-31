import { computed, ref, watchEffect } from 'vue'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/vue-query'

import { ApiError, ifMatch, unwrap } from '@/api'
import type { ActiveShoppingListSummary, OpenShoppingList, ShoppingList } from '@/api'
import { notifyMealFailure } from '@/notifications/failures'
import { useSessionStore } from '@/session/session'

export const shoppingListKeys = {
  all: ['shopping-lists'] as const,
  collection: ['shopping-lists', 'collection'] as const,
  activeSummary: ['shopping-lists', 'active', 'summary'] as const,
  /** Toutes les listes en cours : la principale et une par type de liste (ADR 0036). */
  open: ['shopping-lists', 'open'] as const,
  detail: (id: string) => ['shopping-lists', 'detail', id] as const,
}

/**
 * La liste active : son identifiant (résumé), puis son détail. `null` : l'utilisateur n'a pas de liste en cours.
 * Cocher la dernière ligne termine la liste : le back n'en a alors plus d'active, mais l'écran garde la liste qu'il vient
 * d'afficher (terminée) au lieu de dire « aucune liste » ; `forget()` l'oublie (nouvelle liste).
 */
export function useActiveShoppingList(
  /** Une liste en cours choisie à la main (une pastille d'un type) : elle passe avant la liste principale. */
  selected: () => string | null = () => null,
  /** Sans liste principale ni liste vue à l'instant : la liste à montrer quand même (la première liste en cours d'un type). */
  fallback: () => string | null = () => null,
) {
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
  const id = computed(
    () => selected() ?? summary.data.value?.shoppingListId ?? lastId.value ?? fallback(),
  )

  const detail = useQuery({
    queryKey: computed(() => shoppingListKeys.detail(id.value ?? '')),
    queryFn: () =>
      unwrap(api.GET('/api/v1/shopping-lists/{id}', { params: { path: { id: id.value ?? '' } } })),
    enabled: computed(() => id.value !== null),
  })

  return { summary, id, detail, forget: () => (lastId.value = null) }
}

/**
 * Toutes les listes en cours de l'utilisateur, la principale d'abord puis les types par date de création (une lecture). Un compte sans
 * type n'en a qu'une, la principale : les pastilles de l'écran Liste n'existent que s'il y en a au moins une de plus.
 */
export function useOpenShoppingLists() {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: shoppingListKeys.open,
    queryFn: () => unwrap(api.GET('/api/v1/shopping-lists/open')),
  })
}

/** Une liste d'un type (« Boucherie »), par opposition à la liste principale (sans type). */
export const isTyped = (list: { typeId?: string | null }): boolean => list.typeId != null

/**
 * La version à envoyer (`If-Match`) en écrivant un repas : celle de la liste affichée si c'est la principale ; `null` (aucun contrôle) pour
 * la liste d'un type, car le back ne contrôle que la version de la liste principale d'un groupe de repas (ADR 0036 décision 12) et
 * refuserait (412) celle d'un type. Le type de la liste se lit dans ce que l'écran a déjà : les listes en cours, puis « Mes listes ».
 */
export function useMealVersion() {
  const queryClient = useQueryClient()

  return (list: { id: string; version: number }): number | null => {
    const open = queryClient
      .getQueryData<{ member?: OpenShoppingList[] }>(shoppingListKeys.open)
      ?.member?.find((candidate) => candidate.id === list.id)
    const known =
      open ??
      queryClient
        .getQueryData<{
          member?: { id: string; typeId?: string | null }[]
        }>(shoppingListKeys.collection)
        ?.member?.find((candidate) => candidate.id === list.id)

    return known !== undefined && isTyped(known) ? null : list.version
  }
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
    // Un repas peut être réparti sur plusieurs listes : un refus (une liste partie au drive) a son texte
    meta: { silent: true },
    mutationFn: ({
      mealId,
      serving,
      version,
    }: {
      mealId: string
      serving: number
      version: number | null
    }) =>
      unwrap(
        api.PUT('/api/v1/meals/{id}/serving', {
          params: { path: { id: mealId }, header: ifMatch(version) },
          body: { serving },
        }),
      ),
    onError: notifyMealFailure,
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}

/** Retire une recette de la liste active (ses ingrédients sont déduits par le back), de toutes les listes qui l'ont reçue. */
export function useUnplanRecipe() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: ({ recipeId, version }: { recipeId: string; version: number | null }) =>
      unwrap(
        api.DELETE('/api/v1/shopping-lists/active/recipes/{recipeId}', {
          params: { path: { recipeId }, header: ifMatch(version) },
        }),
      ),
    onError: notifyMealFailure,
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
export function useShoppingList(id: () => string, enabled: () => boolean = () => true) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => shoppingListKeys.detail(id())),
    queryFn: () =>
      unwrap(api.GET('/api/v1/shopping-lists/{id}', { params: { path: { id: id() } } })),
    enabled: computed(enabled),
  })
}

/**
 * Nouvelle liste active : l'éventuelle liste active du même type passe en pause, les listes terminées sont supprimées par le back.
 * Sans `typeId`, la liste principale. Rend l'identifiant de la liste créée (en-tête `Location`, vide s'il manque).
 */
export function useCreateShoppingList() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (typeId?: string | null): Promise<string> => {
      const { response, error } = await api
        .POST('/api/v1/shopping-lists', typeId == null ? {} : { body: { typeId } })
        .catch((cause: unknown) => {
          throw ApiError.network(cause)
        })
      if (!response.ok) throw ApiError.fromResponse(response, error)

      return response.headers.get('Location')?.split('/').pop() ?? ''
    },
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

/**
 * Le résumé de la liste active : son identifiant et les recettes qu'elle planifie (pour les boutons « Ajouter à la liste »).
 *
 * Le back ne résume que la liste principale ; une recette ou un produit peut être allé dans la liste d'un type (ADR 0036). Quand le
 * compte a des listes de types en cours, leurs recettes et leurs quantités sont donc ajoutées au résumé (leur détail est déjà lu par
 * l'écran Liste, la même requête). Sans type, c'est exactement la réponse du back.
 */
export function useActiveSummary() {
  const { api } = useSessionStore()

  const summary = useQuery({
    queryKey: shoppingListKeys.activeSummary,
    queryFn: () => unwrap(api.GET('/api/v1/shopping-lists/active/summary')),
  })
  const open = useOpenShoppingLists()
  const typed = computed(() => (open.data.value?.member ?? []).filter(isTyped))
  const details = useQueries({
    queries: computed(() =>
      typed.value.map((list) => ({
        queryKey: shoppingListKeys.detail(list.id),
        queryFn: () =>
          unwrap(api.GET('/api/v1/shopping-lists/{id}', { params: { path: { id: list.id } } })),
      })),
    ),
  })

  const data = computed<ActiveShoppingListSummary | undefined>(() => {
    const main = summary.data.value
    const lists = details.value.flatMap((detail) =>
      detail.data === undefined ? [] : [detail.data],
    )
    if (main === undefined || lists.length === 0) return main

    const planned = new Set(main.plannedRecipeIds)
    const quantities: Record<string, number> = { ...main.quantityByIngredientSlug }
    for (const list of lists) {
      for (const type of list.recipeTypes) for (const meal of type.meals) planned.add(meal.recipeId)
      for (const department of list.departments)
        for (const row of department.rows)
          quantities[row.ingredientSlug] = (quantities[row.ingredientSlug] ?? 0) + row.quantity
    }

    return { ...main, plannedRecipeIds: [...planned], quantityByIngredientSlug: quantities }
  })

  return { ...summary, data }
}

/** Envoie une liste au drive : elle passe à `SENT` et n'est plus modifiable (sans effet si elle l'est déjà). */
export function useSendShoppingList() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      unwrap(
        api.POST('/api/v1/shopping-lists/{id}/send', {
          params: { path: { id }, header: ifMatch(version) },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}

/** Rouvre une liste envoyée : elle redevient active et modifiable (l'éventuelle autre liste active passe en pause). */
export function useReopenShoppingList() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      unwrap(
        api.POST('/api/v1/shopping-lists/{id}/reopen', {
          params: { path: { id }, header: ifMatch(version) },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}
