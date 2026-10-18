import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { ApiError, unwrap } from '@/api'
import type { UnitPayload, UserStatus } from '@/api'
import { ingredientKeys } from '@/features/ingredients/queries'
import { recipeKeys } from '@/features/recipes/queries'
import { useSessionStore } from '@/session/session'

export const adminKeys = {
  conversions: ['conversions'] as const,
  users: ['users'] as const,
}

const slugOf = (response: Response): string =>
  response.headers.get('Location')?.split('/').pop() ?? ''

/** Les unités, rayons et types sont modifiés au même endroit qu'ils sont lus : on relit ce que chacun alimente. */
function useRefresh(keys: readonly (readonly string[])[]) {
  const queryClient = useQueryClient()

  return () => {
    for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey })
  }
}

// `dimension` et `baseFactor` valent `null` par défaut dans le contrat, ce qui les rend « requis » dans les types générés. Absents du
// corps, le back garde les valeurs de l'unité (`null`, `null` les effacerait) : leur saisie viendra avec DRV-409.
const unitBody = (form: { name: string; symbol: string }) => form as UnitPayload

export function useSaveUnit() {
  const { api } = useSessionStore()
  const refresh = useRefresh([ingredientKeys.units, ingredientKeys.all])

  return useMutation({
    meta: { silent: true },
    mutationFn: async ({
      slug,
      form,
    }: {
      slug: string | null
      form: { name: string; symbol: string }
    }) => {
      if (slug === null) {
        const { response, error } = await api.POST('/api/v1/units', { body: unitBody(form) })
        if (!response.ok) throw ApiError.fromResponse(response, error)

        return slugOf(response)
      }
      await unwrap(
        api.PUT('/api/v1/units/{slug}', { params: { path: { slug } }, body: unitBody(form) }),
      )

      return slug
    },
    onSettled: refresh,
  })
}

export function useSaveDepartment() {
  const { api } = useSessionStore()
  const refresh = useRefresh([ingredientKeys.departments])

  return useMutation({
    meta: { silent: true },
    mutationFn: async ({
      slug,
      form,
    }: {
      slug: string | null
      form: { name: string; image: string }
    }) => {
      if (slug === null) {
        const { response, error } = await api.POST('/api/v1/departments', { body: form })
        if (!response.ok) throw ApiError.fromResponse(response, error)

        return slugOf(response)
      }
      await unwrap(
        api.PUT('/api/v1/departments/{slug}', { params: { path: { slug } }, body: form }),
      )

      return slug
    },
    onSettled: refresh,
  })
}

export function useSaveRecipeType() {
  const { api } = useSessionStore()
  const refresh = useRefresh([recipeKeys.types])

  return useMutation({
    meta: { silent: true },
    mutationFn: async ({
      slug,
      form,
    }: {
      slug: string | null
      form: { name: string; image: string; order: number }
    }) => {
      if (slug === null) {
        const { response, error } = await api.POST('/api/v1/recipe-types', { body: form })
        if (!response.ok) throw ApiError.fromResponse(response, error)

        return slugOf(response)
      }
      await unwrap(
        api.PUT('/api/v1/recipe-types/{slug}', { params: { path: { slug } }, body: form }),
      )

      return slug
    },
    onSettled: refresh,
  })
}

export function useConversions() {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: adminKeys.conversions,
    queryFn: () => unwrap(api.GET('/api/v1/conversions')),
  })
}

export interface ConversionForm {
  startUnitSlug: string
  endUnitSlug: string
  coefficient: number
  ingredientSlug: string | null
}

export function useSaveConversion() {
  const { api } = useSessionStore()
  const refresh = useRefresh([adminKeys.conversions])

  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ id, form }: { id: string | null; form: ConversionForm }) => {
      if (id === null) {
        const { response, error } = await api.POST('/api/v1/conversions', { body: form })
        if (!response.ok) throw ApiError.fromResponse(response, error)

        return slugOf(response)
      }
      await unwrap(api.PUT('/api/v1/conversions/{id}', { params: { path: { id } }, body: form }))

      return id
    },
    onSettled: refresh,
  })
}

export function useUsers() {
  const { api } = useSessionStore()

  return useQuery({
    queryKey: adminKeys.users,
    queryFn: () => unwrap(api.GET('/api/v1/users')),
  })
}

/** Le statut d'un compte (administrateur) : n'importe lequel vers n'importe lequel, sauf le compte protégé (ADR 0021 du back). */
export function useChangeUserStatus() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      unwrap(api.PUT('/api/v1/users/{id}/status', { params: { path: { id } }, body: { status } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.users }),
  })
}

/** Supprime un compte et tout ce qu'il possède : irréversible, le back refuse son propre compte et le compte protégé. */
export function useDeleteUser() {
  const { api } = useSessionStore()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/v1/users/{id}', { params: { path: { id } } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.users }),
  })
}
