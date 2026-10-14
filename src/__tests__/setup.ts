import { afterEach, beforeEach, vi } from 'vitest'

// Une sortie sans bruit : un avertissement ou une erreur de console fait échouer le test qui l'a produit
// (même règle que `make test` côté back : aucune ligne tolérée).
beforeEach(() => {
  vi.spyOn(console, 'warn')
  vi.spyOn(console, 'error')
})

afterEach(() => {
  const noisy = [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls]
  vi.restoreAllMocks()
  if (noisy.length > 0) {
    throw new Error(
      `Sortie de console inattendue : ${noisy.map((call) => call.join(' ')).join(' | ')}`,
    )
  }
})
