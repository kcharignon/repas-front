import { computed } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { ApiError, unwrap } from '@/api'
import type { DuplicatePair, IngredientConversionPayload, IngredientPayload } from '@/api'
import { capitalizeFirst } from '@/design/capitalizeFirst'
import { choiceKeys } from '@/features/drive/choicesQueries'
import { driveKeys } from '@/features/drive/queries'
import { recipeKeys } from '@/features/recipes/queries'
import { shoppingListKeys } from '@/features/shopping-lists/queries'
import { useSessionStore } from '@/session/session'

export const ingredientKeys = {
  all: ['ingredients'] as const,
  departments: ['departments'] as const,
  inDepartment: (slug: string) => ['departments', slug, 'ingredients'] as const,
  detail: (slug: string) => ['ingredients', 'detail', slug] as const,
  conversions: (slug: string) => ['ingredients', 'conversions', slug] as const,
  search: (search: string) => ['ingredients', 'search', search] as const,
  duplicates: ['ingredients', 'duplicates'] as const,
  toFix: ['ingredients', 'to-fix'] as const,
  mergeCandidates: (slug: string, search: string) =>
    ['ingredients', 'merge-candidates', slug, search] as const,
  mergePreview: (slug: string, into: string) =>
    ['ingredients', 'merge-preview', slug, into] as const,
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

/** Les conversions de l'ingrédient : les siennes (`member`) et celles de tout le monde (`common`, en lecture seule). */
export function useIngredientConversions(slug: () => string) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => ingredientKeys.conversions(slug())),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/ingredients/{slug}/conversions', { params: { path: { slug: slug() } } }),
      ),
    enabled: computed(() => slug() !== ''),
  })
}

/**
 * Ce que change une conversion d'ingrédient : la liste de ses conversions, sa fiche (unités compatibles), les unités qu'une ligne de
 * recette peut prendre, les recettes (`convertible` de chaque ligne) et la liste des ingrédients à régler.
 */
function invalidateConversionReaders(queryClient: ReturnType<typeof useQueryClient>, slug: string) {
  void queryClient.invalidateQueries({ queryKey: ingredientKeys.conversions(slug) })
  void queryClient.invalidateQueries({ queryKey: ingredientKeys.detail(slug) })
  void queryClient.invalidateQueries({ queryKey: ['ingredients', 'units', slug] })
  void queryClient.invalidateQueries({ queryKey: recipeKeys.all })
  void queryClient.invalidateQueries({ queryKey: ingredientKeys.toFix })
}

/** Ajoute (`id` absent) ou remplace une conversion PROPRE de l'ingrédient ; les refus du back (409, 422) vont dans la feuille. */
export function useSaveIngredientConversion() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: async ({
      slug,
      id,
      body,
    }: {
      slug: string
      id: string | null
      body: IngredientConversionPayload
    }) => {
      if (id === null) {
        const { response, error } = await api.POST('/api/v1/ingredients/{slug}/conversions', {
          params: { path: { slug } },
          body,
        })
        if (!response.ok) throw ApiError.fromResponse(response, error)

        return
      }
      await unwrap(
        api.PUT('/api/v1/ingredients/{slug}/conversions/{conversionId}', {
          params: { path: { slug, conversionId: id } },
          body,
        }),
      )
    },
    onSettled: (_data, _error, { slug }) => invalidateConversionReaders(queryClient, slug),
  })
}

export function useDeleteIngredientConversion() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: ({ slug, id }: { slug: string; id: string }) =>
      unwrap(
        api.DELETE('/api/v1/ingredients/{slug}/conversions/{conversionId}', {
          params: { path: { slug, conversionId: id } },
        }),
      ),
    onSettled: (_data, _error, { slug }) => invalidateConversionReaders(queryClient, slug),
  })
}

/** Les unités ; `enabled` laisse un écran qui n'en a besoin que parfois ne les lire qu'à ce moment-là (la liste est gardée cinq minutes). */
export function useUnits(enabled: () => boolean = () => true) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: ingredientKeys.units,
    queryFn: () => unwrap(api.GET('/api/v1/units')),
    enabled: computed(enabled),
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
  /**
   * Le marqueur « de base » (ING-015) : à n'envoyer que pour le propriétaire du catalogue, quand il l'a changé. Absent, le back
   * le laisse tel quel ; jamais `null`.
   */
  isBase?: boolean
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
      // Le nom part toujours avec sa majuscule, quel que soit le chemin qui a rempli le formulaire (le back la met aussi)
      const sent = { ...form, name: capitalizeFirst(form.name.trim()) }
      if (slug === null) {
        const { response, error } = await api.POST('/api/v1/ingredients', {
          body: sent as IngredientPayload,
        })
        if (!response.ok) throw ApiError.fromResponse(response, error)

        return response.headers.get('Location')?.split('/').pop() ?? ''
      }
      await unwrap(
        api.PUT('/api/v1/ingredients/{slug}', {
          params: { path: { slug } },
          // Le contrat généré rend `isBase` obligatoire (défaut `null`) alors que le back l'accepte absent
          body: sent as IngredientPayload,
        }),
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

/** Le back rend 50 paires au plus : à ce plafond le compte est « plus de 49 », la liste se renouvelle après chaque traitement. */
export const DUPLICATES_LIMIT = 50

/** Les paires d'ingrédients de l'utilisateur que le back croit être le même (une lecture à l'ouverture de l'écran ou du lien des rayons). */
export function useDuplicates() {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: ingredientKeys.duplicates,
    queryFn: () => unwrap(api.GET('/api/v1/ingredients/duplicates')),
    staleTime: 60_000,
  })
}

/** Le back rend 200 ingrédients à régler au plus : au-delà, `totalItems` dit combien il en reste. */
export const TO_FIX_LIMIT = 200

/**
 * Les ingrédients de l'utilisateur dont l'unité des recettes ne se convertit pas en unité d'achat (une lecture pour la ligne des Rayons et
 * pour l'écran « Ingrédients à régler »). Elle se relit après toute écriture de conversion, de fusion ou d'ingrédient : sa clé est sous
 * `ingredients`, donc `ingredientKeys.all` la renouvelle.
 */
export function useIngredientsToFix() {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: ingredientKeys.toFix,
    queryFn: () => unwrap(api.GET('/api/v1/ingredients/to-fix')),
    staleTime: 60_000,
  })
}

/** Les ingrédients de l'utilisateur dans lesquels `slug` (l'absorbé) peut être fusionné, filtrés par `search` (le même rayon d'abord). */
export function useMergeCandidates(
  slug: () => string,
  search: () => string,
  enabled: () => boolean,
) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => ingredientKeys.mergeCandidates(slug(), search())),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/ingredients/{slug}/merge-candidates', {
          params: { path: { slug: slug() }, query: { q: search() } },
        }),
      ),
    enabled: computed(() => enabled() && slug() !== ''),
    // Pendant la frappe, la liste précédente reste affichée jusqu'à l'arrivée de la suivante
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 0,
  })
}

/**
 * Ce que fusionner `slug` (l'absorbé) dans `into` (le gardé) ferait. Toujours relu à l'ouverture de la confirmation : l'aperçu est
 * exact à l'instant où on le lit, jamais gardé d'une fois sur l'autre.
 */
export function useMergePreview(slug: () => string, into: () => string, enabled: () => boolean) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => ingredientKeys.mergePreview(slug(), into())),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/ingredients/{slug}/merge-preview', {
          params: { path: { slug: slug() }, query: { into: into() } },
        }),
      ),
    enabled: computed(() => enabled() && slug() !== '' && into() !== ''),
    staleTime: 0,
    gcTime: 0,
  })
}

/**
 * Tout ce qu'une fusion a pu changer : les ingrédients (leurs slugs, leurs compteurs, les doublons), les rayons, les recettes et les
 * listes de courses (leurs versions ont monté : un `ETag` gardé répondrait `412`), l'estimation et le plan du drive (sous les listes et
 * sous `drive`) et les choix de produits. Une fonction : ces modules se citent les uns les autres, leurs clés ne sont lues qu'à l'usage.
 */
export const mergeAffectedKeys = (): readonly (readonly string[])[] => [
  ingredientKeys.all,
  ingredientKeys.departments,
  recipeKeys.all,
  shoppingListKeys.all,
  driveKeys.all,
  choiceKeys.all,
]

const isMergeLookup = (queryKey: readonly unknown[]) =>
  queryKey[0] === 'ingredients' &&
  (queryKey[1] === 'merge-preview' || queryKey[1] === 'merge-candidates')

/** Fusionne `slug` (l'absorbé) dans `into` (le gardé). Les erreurs vont à l'appelant (la confirmation les dit). */
export function useMergeIngredients() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: ({ slug, into }: { slug: string; into: string }) =>
      unwrap(
        api.POST('/api/v1/ingredients/{slug}/merge', {
          params: { path: { slug } },
          body: { into },
        }),
      ),
    onSuccess: (_data, { slug }) => {
      queryClient.removeQueries({ queryKey: ingredientKeys.detail(slug) })
      // L'aperçu et les candidats se lisent toujours à neuf et parlent de l'absorbé, qui n'existe plus : on ne les relit pas
      for (const queryKey of mergeAffectedKeys())
        void queryClient.invalidateQueries({
          queryKey,
          predicate: (query) => !isMergeLookup(query.queryKey),
        })
    },
    // Un refus ou un conflit : les doublons et l'aperçu ont pu changer, les relire
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ingredientKeys.duplicates })
    },
  })
}

const sameDuplicate = (pair: DuplicatePair, a: string, b: string) =>
  (pair.first.slug === a && pair.second.slug === b) ||
  (pair.first.slug === b && pair.second.slug === a)

/**
 * « Pas le même » : la paire disparaît tout de suite de la liste (le back la retient dans un sens comme dans l'autre), puis la liste se
 * relit. Si l'écriture échoue, sauf un `404` (un des deux n'existe plus : la paire n'a plus lieu d'être), la paire revient.
 */
export function useMarkDistinct() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: ({ slug, other }: { slug: string; other: string }) =>
      unwrap(
        api.POST('/api/v1/ingredients/{slug}/distinct-from', {
          params: { path: { slug } },
          body: { other },
        }),
      ),
    onMutate: async ({ slug, other }) => {
      await queryClient.cancelQueries({ queryKey: ingredientKeys.duplicates })
      const before = queryClient.getQueryData<{ member: DuplicatePair[]; totalItems: number }>(
        ingredientKeys.duplicates,
      )
      if (before !== undefined) {
        const member = before.member.filter((pair) => !sameDuplicate(pair, slug, other))
        queryClient.setQueryData(ingredientKeys.duplicates, {
          ...before,
          member,
          totalItems: member.length,
        })
      }

      return { before }
    },
    onError: (error, _variables, context) => {
      const gone = error instanceof ApiError && error.status === 404
      if (!gone && context?.before !== undefined)
        queryClient.setQueryData(ingredientKeys.duplicates, context.before)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ingredientKeys.duplicates }),
  })
}
