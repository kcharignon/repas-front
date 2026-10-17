import { describe, expect, it, vi } from 'vitest'

import { holdWakeLock, type SentinelLike, type WakeLockLike } from '../wakelock'

function fakeLock(options: { releaseAfterMs?: number; refuse?: string } = {}) {
  let now = 0
  const listeners: (() => void)[] = []
  const sentinel: SentinelLike = {
    addEventListener: (_type, listener) => void listeners.push(listener),
    release: vi.fn<() => Promise<void>>(async () => {}),
  }
  const wakeLock: WakeLockLike = {
    request: vi.fn<WakeLockLike['request']>(async () => {
      if (options.refuse) throw Object.assign(new Error('refusé'), { name: options.refuse })
      return sentinel
    }),
  }
  const deps = {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms
      if (options.releaseAfterMs !== undefined && now >= options.releaseAfterMs)
        listeners.forEach((listener) => listener())
    },
    cancelled: () => false,
  }
  return { wakeLock, sentinel, deps }
}

describe('holdWakeLock', () => {
  it('garde le verrou jusqu’au bout puis le rend', async () => {
    // Given
    const { wakeLock, sentinel, deps } = fakeLock()
    const ticks: number[] = []

    // When
    const result = await holdWakeLock(wakeLock, 60_000, {
      ...deps,
      onTick: (remaining) => void ticks.push(remaining),
    })

    // Then
    expect(result).toEqual({
      available: true,
      obtained: true,
      error: null,
      heldMs: 60_000,
      releasedEarly: false,
    })
    expect(sentinel.release).toHaveBeenCalledTimes(1)
    expect(ticks[0]).toBe(60_000)
    expect(ticks).toHaveLength(60)
  })

  it('dit quand le navigateur rend le verrou avant la fin', async () => {
    const { wakeLock, sentinel, deps } = fakeLock({ releaseAfterMs: 23_000 })

    const result = await holdWakeLock(wakeLock, 60_000, deps)

    expect(result).toMatchObject({ obtained: true, releasedEarly: true, heldMs: 23_000 })
    expect(sentinel.release).not.toHaveBeenCalled()
  })

  it('dit que l’API manque', async () => {
    const { deps } = fakeLock()

    expect(await holdWakeLock(undefined, 60_000, deps)).toEqual({
      available: false,
      obtained: false,
      error: null,
      heldMs: 0,
      releasedEarly: false,
    })
  })

  it('donne le nom de l’erreur d’un refus', async () => {
    const { wakeLock, deps } = fakeLock({ refuse: 'NotAllowedError' })

    expect(await holdWakeLock(wakeLock, 60_000, deps)).toMatchObject({
      available: true,
      obtained: false,
      error: 'NotAllowedError',
    })
  })

  it('décrit un refus qui n’est pas une erreur', async () => {
    const wakeLock: WakeLockLike = { request: async () => Promise.reject('non') }
    const { deps } = fakeLock()

    expect((await holdWakeLock(wakeLock, 1000, deps)).error).toBe('non')
  })

  it('s’arrête quand on l’annule', async () => {
    const { wakeLock, sentinel, deps } = fakeLock()
    let calls = 0

    const result = await holdWakeLock(wakeLock, 60_000, { ...deps, cancelled: () => ++calls > 3 })

    expect(result.heldMs).toBe(3000)
    expect(result.releasedEarly).toBe(false)
    expect(sentinel.release).toHaveBeenCalledTimes(1)
  })

  it('ne plante pas si le verrou est déjà rendu', async () => {
    const { wakeLock, sentinel, deps } = fakeLock()
    vi.mocked(sentinel.release).mockRejectedValueOnce(new Error('déjà rendu'))

    expect((await holdWakeLock(wakeLock, 2000, deps)).obtained).toBe(true)
  })
})
