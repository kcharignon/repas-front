import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { focusManager, onlineManager, QueryObserver } from '@tanstack/vue-query'
import { ref } from 'vue'

import { ApiError } from '@/api'
import { createQueryClient, hasFailed } from '@/api/query'
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
      "Tu n'as pas le droit de faire cela.",
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

  describe('au retour du focus ou du réseau', () => {
    afterEach(() => {
      focusManager.setFocused(undefined)
      onlineManager.setOnline(true)
    })

    /** Combien de fois la lecture est rejouée toute seule après son échec, quand le focus puis le réseau reviennent. */
    async function rejoue(error: Error): Promise<number> {
      const client = createQueryClient()
      client.mount()
      let attempts = 0
      const observer = new QueryObserver(client, {
        queryKey: ['lecture', error.message],
        queryFn: () => {
          attempts++

          return Promise.reject(error)
        },
        retry: false,
      })
      const stop = observer.subscribe(() => undefined)
      await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true))
      expect(attempts).toBe(1)

      focusManager.setFocused(true)
      await vi.waitFor(() => expect(observer.getCurrentResult().isFetching).toBe(false))
      onlineManager.setOnline(false)
      onlineManager.setOnline(true)
      await vi.waitFor(() => expect(observer.getCurrentResult().isFetching).toBe(false))
      stop()
      client.unmount()
      client.clear()

      return attempts - 1
    }

    it('ne relit pas toute seule une lecture que le back vient de refuser pour trop de demandes (429)', async () => {
      expect(await rejoue(new ApiError(429, 'DRIVE_RATE_LIMITED', 1))).toBe(0)
    })

    it('relit une lecture tombée en panne (5xx), puisque la panne peut être finie', async () => {
      expect(await rejoue(new ApiError(500, 'boom'))).toBeGreaterThan(0)
    })
  })

  it('ne rejoue pas une lecture sans réseau : elle échoue tout de suite', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry as (
      count: number,
      error: Error,
    ) => boolean
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    expect(retry(0, new ApiError(0, 'réseau'))).toBe(false)
    onLine.mockRestore()
  })

  it("n'attend pas le réseau en silence : lectures et écritures partent toujours", () => {
    const options = createQueryClient().getDefaultOptions()

    expect(options.queries?.networkMode).toBe('always')
    expect(options.mutations?.networkMode).toBe('always')
  })

  describe('hasFailed', () => {
    it("n'affiche l'échec que s'il n'y a rien à montrer", () => {
      expect(hasFailed({ isError: ref(true), data: ref(undefined) })).toBe(true)
      expect(hasFailed({ isError: ref(true), data: ref({ liste: 1 }) })).toBe(false)
      expect(hasFailed({ isError: ref(false), data: ref(undefined) })).toBe(false)
    })
  })
})
