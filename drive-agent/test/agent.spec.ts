// Le squelette de l'agent (DRV-301) : tant qu'aucun plan n'est reçu, il reste silencieux sur la page de l'enseigne.
import { describe, expect, it, vi } from 'vitest'

import { run } from '../src/agent'

describe('run', () => {
  it('ne change rien à la page : ni élément, ni variable globale', () => {
    // Given : une page de magasin inventée
    document.body.innerHTML = '<p>Page</p>'
    const before = document.documentElement.outerHTML
    const names = Object.getOwnPropertyNames(window)

    // When
    run()

    // Then
    expect(document.documentElement.outerHTML).toBe(before)
    expect(Object.getOwnPropertyNames(window)).toEqual(names)
  })

  it('n’écrit rien dans la console et ne contacte aucun site', () => {
    const log = vi.spyOn(console, 'log')
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)

    run()

    expect(log).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
