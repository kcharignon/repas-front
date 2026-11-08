import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { ApiError, unwrap } from '@/api'
import type { DepartmentIcon, DepartmentPayload, UnitPayload, UserStatus } from '@/api'
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

export function useSaveUnit() {
  const { api } = useSessionStore()
  const refresh = useRefresh([ingredientKeys.units, ingredientKeys.all])

  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ slug, form }: { slug: string | null; form: UnitPayload }) => {
      if (slug === null) {
        const { response, error } = await api.POST('/api/v1/units', { body: form })
        if (!response.ok) throw ApiError.fromResponse(response, error)

        return slugOf(response)
      }
      await unwrap(api.PUT('/api/v1/units/{slug}', { params: { path: { slug } }, body: form }))

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
      // `icon` absent : le back ne touche pas à l'icône (`null` l'efface) ; le contrat généré la rend obligatoire
      form: { name: string; image: string; icon?: DepartmentIcon | null }
    }) => {
      const body = form as DepartmentPayload
      if (slug === null) {
        const { response, error } = await api.POST('/api/v1/departments', { body })
        if (!response.ok) throw ApiError.fromResponse(response, error)

        return slugOf(response)
      }
      await unwrap(api.PUT('/api/v1/departments/{slug}', { params: { path: { slug } }, body }))

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

/**
 * Supprime un type de recette : toutes ses recettes, de tous les utilisateurs, passent dans le type `transferTo` (le back refuse un type
 * inconnu ou identique). On relit les types et les listes de recettes que le déplacement change.
 */
export function useRemoveRecipeType() {
  const { api } = useSessionStore()
  const refresh = useRefresh([recipeKeys.all])

  return useMutation({
    meta: { silent: true },
    mutationFn: ({ slug, transferTo }: { slug: string; transferTo: string }) =>
      unwrap(
        api.DELETE('/api/v1/recipe-types/{slug}', {
          params: { path: { slug }, query: { transferTo } },
        }),
      ),
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
  // Une conversion de l'administrateur peut régler d'un coup des ingrédients que la liste « à régler » montrait
  const refresh = useRefresh([adminKeys.conversions, ingredientKeys.toFix])

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

/**
 * Envoie une image (fichier) : le back la vérifie, la ramène à 512 px, l'assainit si c'est un SVG et rend le chemin à mettre tel quel dans
 * le champ `image` d'un rayon ou d'un type de recette. Rien n'est lié à un rayon avant « Enregistrer ». Le corps est un `FormData` (champ `file`).
 */
export function useUploadImage() {
  const { api } = useSessionStore()

  return useMutation({
    meta: { silent: true },
    mutationFn: async (file: File): Promise<string> => {
      const data = await unwrap(
        api.POST('/api/v1/images', {
          body: { file: file as unknown as string },
          bodySerializer: () => {
            const form = new FormData()
            form.append('file', file)

            return form
          },
        }),
      )

      return data.path ?? ''
    },
  })
}

/** Le serveur télécharge l'image d'un lien direct (https, adresse publique) et rend le même chemin qu'un envoi de fichier. */
export function useStoreImageFromUrl() {
  const { api } = useSessionStore()

  return useMutation({
    meta: { silent: true },
    mutationFn: async (url: string): Promise<string> => {
      const data = await unwrap(api.POST('/api/v1/images/from-url', { body: { url } }))

      return data.path ?? ''
    },
  })
}
