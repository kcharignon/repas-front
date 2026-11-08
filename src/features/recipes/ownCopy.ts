import { computed } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { QueryClient } from '@tanstack/vue-query'

import { unwrap } from '@/api'
import type { ApiClient } from '@/api'
import { useSessionStore } from '@/session/session'
import { sameName } from './recipeStance'
import { recipeKeys } from './queries'

/** La version commune dont on cherche la copie. */
export interface CommonRecipeRef {
  id: string
  name: string
  typeSlug: string
}

/**
 * La copie que l'administrateur a déjà faite d'une version commune (MAR-005) : le back dit seulement « tu l'as déjà » (`alreadyCopied`),
 * pas où. On la retrouve parmi SES recettes du même type, de même nom, et on la confirme par la fiche (`originalId` est la version commune).
 * Plusieurs de même nom : la première qui est bien une copie de celle-ci. Rien de trouvé (copie renommée ou changée de type) : `null`.
 */
export async function findOwnCopy(
  queryClient: QueryClient,
  api: ApiClient,
  common: CommonRecipeRef,
): Promise<string | null> {
  const list = await queryClient.fetchQuery({
    queryKey: recipeKeys.byType(common.typeSlug),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/recipe-types/{slug}/recipes', {
          params: { path: { slug: common.typeSlug } },
        }),
      ),
    staleTime: 30_000,
  })

  for (const candidate of (list.member ?? []).filter((member) =>
    sameName(member.name, common.name),
  )) {
    const recipe = await queryClient.fetchQuery({
      queryKey: recipeKeys.detail(candidate.id),
      queryFn: () =>
        unwrap(api.GET('/api/v1/recipes/{id}', { params: { path: { id: candidate.id } } })),
      staleTime: 30_000,
    })
    if (recipe.originalId === common.id) return candidate.id
  }

  return null
}

/** Sa copie de la version commune affichée (`undefined` : pas encore su ; `null` : il n'en a pas). Désactivé pour tout autre que l'administrateur. */
export function useOwnCopy(common: () => CommonRecipeRef | null) {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: computed(() => recipeKeys.ownCopy(common()?.id ?? '')),
    queryFn: () => findOwnCopy(queryClient, api, common() as CommonRecipeRef),
    enabled: computed(() => common() !== null),
  })
}
