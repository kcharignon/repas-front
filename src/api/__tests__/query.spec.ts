import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { ApiError } from '@/api'
import { createQueryClient } from '@/api/query'
import { useNotificationsStore } from '@/notifications/store'

describe('createQueryClient', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const fail = (
    client: ReturnType<typeof createQueryClient>,
    error: Error,
    meta?: Record<string, unknown>,
  ) =>
    client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(error), meta })
      .execute(undefined)
      .catch(() => undefined)

  it("dit à l'utilisateur qu'une écriture a échoué", async () => {
    const client = createQueryClient()

    await fail(client, new ApiError(403, 'Forbidden'))

    expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
      "Vous n'avez pas le droit de faire cela.",
    ])
  })

  it('relit tout quand la ressource a changé ailleurs (412)', async () => {
    const client = createQueryClient()
    await client.fetchQuery({ queryKey: ['x'], queryFn: () => 'ancien' })

    await fail(client, new ApiError(412, 'outdated'))

    expect(client.getQueryState(['x'])?.isInvalidated).toBe(true)
  })

  it('ne relit pas pour une autre erreur', async () => {
    const client = createQueryClient()
    await client.fetchQuery({ queryKey: ['x'], queryFn: () => 'ancien' })

    await fail(client, new ApiError(404, 'x'))

    expect(client.getQueryState(['x'])?.isInvalidated).toBe(false)
  })

  it('se tait pour une mutation silencieuse', async () => {
    const client = createQueryClient()

    await fail(client, new ApiError(500, 'x'), { silent: true })

    expect(useNotificationsStore().items).toEqual([])
  })

  it('ne rejoue pas une lecture refusée par le back (4xx) mais réessaie une panne (5xx)', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry as (
      count: number,
      error: Error,
    ) => boolean

    expect(retry(0, new ApiError(404, 'x'))).toBe(false)
    expect(retry(0, new ApiError(500, 'x'))).toBe(true)
    expect(retry(2, new ApiError(500, 'x'))).toBe(false)
  })
})
