// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { watchForUpdates } from '@/pwaUpdate'

describe('watchForUpdates', () => {
  let clock = 0
  let page = Object.assign(new EventTarget(), { visibilityState: 'hidden' as string })
  const update = vi.fn<() => Promise<unknown>>()

  const show = () => {
    page.visibilityState = 'visible'
    page.dispatchEvent(new Event('visibilitychange'))
  }
  const hide = () => {
    page.visibilityState = 'hidden'
    page.dispatchEvent(new Event('visibilitychange'))
  }
  const watch = () => watchForUpdates({ update }, page as unknown as Document, () => clock)

  beforeEach(() => {
    vi.useFakeTimers()
    clock = 0
    page = Object.assign(new EventTarget(), { visibilityState: 'hidden' as string })
    update.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("cherche une nouvelle version quand l'application revient au premier plan", () => {
    watch()

    clock = 5 * 60_000
    hide()
    show()

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('ne cherche pas quand la page passe en arrière-plan', () => {
    watch()

    clock = 5 * 60_000
    hide()

    expect(update).not.toHaveBeenCalled()
  })

  it('ne cherche pas plus d’une fois par minute', () => {
    watch()

    clock = 30_000
    show()
    expect(update).not.toHaveBeenCalled()

    clock = 90_000
    show()
    show()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('cherche aussi toutes les heures, application restée ouverte', () => {
    watch()

    clock = 60 * 60_000
    vi.advanceTimersByTime(60 * 60_000)

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('garde sa version quand la recherche échoue (hors-ligne)', async () => {
    update.mockRejectedValue(new TypeError('Failed to fetch'))
    watch()

    clock = 5 * 60_000
    show()
    await vi.waitFor(() => expect(update).toHaveBeenCalled())
  })
})
