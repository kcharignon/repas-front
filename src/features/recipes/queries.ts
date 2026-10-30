import { computed } from 'vue'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { QueryClient } from '@tanstack/vue-query'

import { ApiError, ifMatch, unwrap } from '@/api'
import type { IngredientOption } from '@/api'
import { capitalizeFirst } from '@/design/capitalizeFirst'
import { shoppingListKeys } from '@/features/shopping-lists/queries'
import { useSessionStore } from '@/session/session'

export const recipeKeys = {
  all: ['recipes'] as const,
  types: ['recipes', 'types'] as const,
  byType: (slug: string) => ['recipes', 'type', slug] as const,
  others: (search: string) => ['recipes', 'others', search] as const,
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

/** Longueur minimale d'une recherche de recette des autres : en dessous, la liste n'est pas filtrée (comme la recherche d'ingrédients). */
export const MIN_OTHERS_SEARCH_LENGTH = 2

/**
 * Les recettes des autres utilisateurs que celui-ci n'a pas encore copiées, par pages de 200 au plus (`offset`) : `totalItems`
 * est le vrai nombre, la page suivante se charge à la demande. Sans recherche, le back les trie par catégorie ; avec `search`
 * (2 caractères au moins, sinon elle est ignorée), il rend les correspondances par pertinence, toutes catégories confondues.
 * Pendant qu'une recherche s'affine, les résultats de la précédente restent affichés (jamais ceux de la liste par catégories).
 */
export function useOtherPeopleRecipes(search: () => string = () => '') {
  const { api } = useSessionStore()
  const term = () => {
    const trimmed = search().trim()

    return trimmed.length >= MIN_OTHERS_SEARCH_LENGTH ? trimmed : ''
  }

  return useInfiniteQuery({
    queryKey: computed(() => recipeKeys.others(term())),
    initialPageParam: 0,
    queryFn: ({ queryKey, pageParam, signal }) => {
      // La recherche de la clé, pas celle d'aujourd'hui : « Voir plus » continue la liste qu'il a sous les yeux
      const q = queryKey[2]

      return unwrap(
        api.GET('/api/v1/recipes/other-people', {
          params: {
            query: { ...(q !== '' ? { q } : {}), ...(pageParam > 0 ? { offset: pageParam } : {}) },
          },
          signal,
        }),
      )
    },
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.member.length, 0)

      return lastPage.member.length > 0 && loaded < lastPage.totalItems ? loaded : undefined
    },
    placeholderData: (previous, previousQuery) =>
      term() !== '' && previousQuery?.queryKey[2] !== '' ? previous : undefined,
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
    // Sans attendre la relecture : le message et le bouton « Copiée » ne patientent pas derrière elle
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: recipeKeys.all })
    },
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

/** Les ingrédients que l'utilisateur peut mettre dans une recette (les communs et les siens), triés par nom. */
const ingredientOptionsKey = ['ingredients', 'options'] as const

/**
 * Un ingrédient qu'on vient de créer depuis le formulaire d'une recette entre tout de suite dans le choix : la ligne qui le sélectionne
 * affiche son nom sans attendre la relecture de la liste (qui suit, l'écriture invalide les ingrédients).
 */
export function addIngredientOption(queryClient: QueryClient, option: IngredientOption) {
  queryClient.setQueryData<{ member: IngredientOption[]; totalItems: number }>(
    ingredientOptionsKey,
    (current) =>
      current === undefined || current.member.some((known) => known.slug === option.slug)
        ? current
        : { ...current, member: [...current.member, option], totalItems: current.totalItems + 1 },
  )
}

export function useIngredientOptions(enabled: () => boolean = () => true) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: ingredientOptionsKey,
    queryFn: () => unwrap(api.GET('/api/v1/ingredients')),
    enabled: computed(enabled),
    staleTime: 5 * 60_000,
  })
}

/** Les unités qu'on peut choisir pour un ingrédient, dans l'ordre où le back les connaît. */
export function useCompatibleUnits(slug: () => string) {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: computed(() => ['ingredients', 'units', slug()] as const),
    queryFn: () =>
      unwrap(api.GET('/api/v1/ingredients/{slug}/units', { params: { path: { slug: slug() } } })),
    enabled: computed(() => slug() !== ''),
    staleTime: 5 * 60_000,
  })
}

export interface RecipeForm {
  name: string
  serving: number
  typeSlug: string
  /** Recette secrète (REC-002) : absent = on n'envoie rien (création : publique ; modification : inchangée). */
  secret?: boolean
  rows: { ingredientSlug: string; unitSlug: string; quantity: number }[]
}

/**
 * Crée une recette (rend l'identifiant de la nouvelle, en-tête `Location`) ou remplace une recette existante : la version
 * lue part en `If-Match`, une recette modifiée ailleurs entre-temps répond 412. Les erreurs s'affichent dans le formulaire.
 */
export function useSaveRecipe() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: async ({
      id,
      version,
      form,
    }: {
      id: string | null
      version: number | null
      form: RecipeForm
    }): Promise<string> => {
      // Le nom part toujours avec sa majuscule, quel que soit le chemin qui a rempli le formulaire (le back la met aussi)
      // `secret` absent : le back ne l'attend pas (création : publique) ou le laisse inchangé ; le contrat généré le rend obligatoire
      const sent = { ...form, name: capitalizeFirst(form.name.trim()) } as typeof form & {
        secret: boolean | null
      }
      if (id === null) {
        const { response, error } = await api.POST('/api/v1/recipes', { body: sent })
        if (!response.ok) throw ApiError.fromResponse(response, error)

        return response.headers.get('Location')?.split('/').pop() ?? ''
      }
      await unwrap(
        api.PUT('/api/v1/recipes/{id}', {
          params: { path: { id }, header: ifMatch(version) },
          body: sent,
        }),
      )

      return id
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: recipeKeys.all }),
  })
}
