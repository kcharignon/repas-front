import { computed } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { ApiError, unwrap } from '@/api'
import { shoppingListKeys } from '@/features/shopping-lists/queries'
import { useSessionStore } from '@/session/session'

export const ingredientKeys = {
  all: ['ingredients'] as const,
  departments: ['departments'] as const,
  inDepartment: (slug: string) => ['departments', slug, 'ingredients'] as const,
  detail: (slug: string) => ['ingredients', 'detail', slug] as const,
  search: (search: string) => ['ingredients', 'search', search] as const,
  units: ['units'] as const,
}

export function useDepartments() {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: ingredientKeys.departments,
    queryFn: () => unwrap(api.GET('/api/v1/departments')),
    staleTime: 5 * 60_000,
  })
}

export function useDepartmentIngredients(slug: () => string) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => ingredientKeys.inDepartment(slug())),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/departments/{slug}/ingredients', { params: { path: { slug: slug() } } }),
      ),
  })
}

/** En dessous, une recherche ramène trop de noms pour aider : on attend la deuxième lettre. */
export const MIN_SEARCH_LENGTH = 2

/** Ingrédients dont le nom ressemble à `search`, le plus pertinent d'abord (le back classe, fautes de frappe tolérées). */
export function useSearchIngredients(search: () => string) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => ingredientKeys.search(search())),
    queryFn: () =>
      unwrap(api.GET('/api/v1/ingredients/search', { params: { query: { q: search() } } })),
    enabled: computed(() => search().length >= MIN_SEARCH_LENGTH),
    // Pendant la frappe, les résultats précédents restent affichés jusqu'à l'arrivée des suivants
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

export function useIngredient(slug: () => string) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => ingredientKeys.detail(slug())),
    queryFn: () =>
      unwrap(api.GET('/api/v1/ingredients/{slug}', { params: { path: { slug: slug() } } })),
    enabled: computed(() => slug() !== ''),
  })
}

export function useUnits() {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: ingredientKeys.units,
    queryFn: () => unwrap(api.GET('/api/v1/units')),
    staleTime: 5 * 60_000,
  })
}

/**
 * Ajoute ou retire 1 à la quantité d'un ingrédient dans la liste en cours (la ligne disparaît à zéro). Sans liste en cours
 * on la crée d'abord pour un ajout.
 */
export function useChangeIngredientQuantity() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      slug,
      delta,
      hasActiveList,
    }: {
      slug: string
      delta: 1 | -1
      hasActiveList: boolean
    }) => {
      const params = { params: { path: { slug } } }
      if (delta === -1)
        return unwrap(api.POST('/api/v1/shopping-lists/active/ingredients/{slug}/decrease', params))
      if (!hasActiveList) await unwrap(api.PUT('/api/v1/shopping-lists/active'))

      return unwrap(api.POST('/api/v1/shopping-lists/active/ingredients/{slug}/increase', params))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
  })
}

export interface IngredientForm {
  name: string
  departmentSlug: string
  defaultCookingUnitSlug: string
  defaultPurchaseUnitSlug: string
  coefficient: number | null
}

/** Crée un ingrédient (rend son slug, en-tête `Location`) ou remplace celui de l'utilisateur ; les erreurs vont dans le formulaire. */
export function useSaveIngredient() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: async ({
      slug,
      form,
    }: {
      slug: string | null
      form: IngredientForm
    }): Promise<string> => {
      if (slug === null) {
        const { response, error } = await api.POST('/api/v1/ingredients', { body: form })
        if (!response.ok) throw ApiError.fromResponse(response, error)

        return response.headers.get('Location')?.split('/').pop() ?? ''
      }
      await unwrap(
        api.PUT('/api/v1/ingredients/{slug}', { params: { path: { slug } }, body: form }),
      )

      return slug
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ingredientKeys.all })
      void queryClient.invalidateQueries({ queryKey: ingredientKeys.departments })
    },
  })
}

export function useDeleteIngredient() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: (slug: string) =>
      unwrap(api.DELETE('/api/v1/ingredients/{slug}', { params: { path: { slug } } })),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ingredientKeys.all })
      void queryClient.invalidateQueries({ queryKey: ingredientKeys.departments })
    },
  })
}
