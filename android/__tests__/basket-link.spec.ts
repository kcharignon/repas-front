// @vitest-environment node
// « Finaliser sur Leclerc » (DRV-629) : le front fait le lien `https://<hôte>/magasin-N-N/detail-panier.aspx`, la coquille Android y met la ville
// qu'elle a retenue. Le nom de la page du panier est écrit des deux côtés : ce test échoue s'ils divergent.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { BASKET_PATH } from '../../src/features/drive/leclerc'

const kotlin = join(dirname(fileURLToPath(import.meta.url)), '..', 'core/src/main/kotlin/eu/kantin/repas/drive')

describe('la page du panier, des deux côtés', () => {
  it('le front et l’application nomment la même page', () => {
    const source = readFileSync(join(kotlin, 'DriveEntry.kt'), 'utf8')

    expect(/const val BASKET_PAGE = "([^"]+)"/.exec(source)?.[1]).toBe(BASKET_PATH.slice(1))
  })

  it('l’application ne bâtit l’adresse qu’avec l’hôte du lien et le chemin qu’une page a donné, jamais avec le message du plan', () => {
    const entry = readFileSync(join(kotlin, 'DriveEntry.kt'), 'utf8')
    const memory = readFileSync(join(kotlin, 'StorePathMemory.kt'), 'utf8')

    expect(entry).not.toMatch(/DrivePlan|storeHost|PassRequest/)
    expect(memory).not.toMatch(/DrivePlan|storeHost|PassRequest/)
  })
})
