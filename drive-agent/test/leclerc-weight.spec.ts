// @vitest-environment node
// Le poids de l'adaptateur Leclerc dans l'agent (DRV-303) : un garde-fou, bien en deçà du budget de 256 000 octets du fichier.
import { describe, expect, it } from 'vitest'

import { buildAgent } from '../scripts/build.mjs'

describe('le poids de l’adaptateur Leclerc', () => {
  it('reste modeste une fois minifié dans l’agent', async () => {
    // Given : l'agent vide, puis le même avec tout l'adaptateur dedans
    const [empty, withAdapter] = await Promise.all([
      buildAgent(),
      buildAgent({ entry: 'test/entries/leclerc.ts' }),
    ])

    // When
    const added = withAdapter.manifest.bytes - empty.manifest.bytes

    // Then
    console.info(`L’adaptateur Leclerc ajoute ${added} octets`)
    expect(added).toBeLessThan(20_000)
  }, 60_000)
})
