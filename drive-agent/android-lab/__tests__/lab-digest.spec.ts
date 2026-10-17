// @vitest-environment node
// L'empreinte du banc embarqué dans l'application Android (DRV-011) : si `published/lab.js` change, la CI le dit tout de suite,
// au lieu d'attendre la construction de l'APK. Remède : `make android-lab-hash`.
import { describe, expect, it } from 'vitest'

import { actualDigest, digestOf, expectedDigest } from '../lab-digest'

describe('l’empreinte du banc embarqué', () => {
  it('est celle de drive-agent/lab/published/lab.js', () => {
    expect(
      expectedDigest(),
      'published/lab.js a changé : lancer make android-lab-hash, relire, commiter lab.js.sha384 et le dire dans la PR',
    ).toBe(actualDigest())
  })

  it('a le format de l’attribut integrity, sur une ligne', () => {
    expect(expectedDigest()).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/)
  })

  it('calcule un SHA-384 en base64', () => {
    // Vecteur de test officiel du SHA-384 de « abc ».
    expect(digestOf('abc')).toBe(
      'sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn',
    )
  })
})
