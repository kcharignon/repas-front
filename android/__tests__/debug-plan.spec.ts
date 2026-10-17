// @vitest-environment node
// Le plan d'essai de la variante de débogage (DRV-313) : le modèle que l'application remplit doit être un plan valide du protocole v1,
// jugé par les validateurs de l'agent (ceux que l'agent applique à l'exécution), avec un magasin et un passage synthétiques.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { LIMITS, validatePlan, type PlanMessage } from '../../drive-agent/protocol'

const template = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../app/src/debug/assets/debug-plan.json'),
  'utf8',
)

/** Ce que fait `DebugPlan.plan` en Kotlin : trois remplacements textuels. */
const filled = template
  .replaceAll('__RUN_ID__', '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c')
  .replaceAll('__STORE_ID__', '123456')
  .replaceAll('__STORE_HOST__', 'fd0-courses.leclercdrive.fr')

describe('le plan d’essai de débogage', () => {
  it('est un plan valide du protocole v1 une fois rempli', () => {
    expect(() => validatePlan(JSON.parse(filled))).not.toThrow()
  })

  it('n’a pas de marqueur oublié', () => {
    expect(filled).not.toContain('__')
  })

  it('demande des ingrédients courants sans produit mémorisé, avec la quantité demandée', () => {
    const plan = validatePlan(JSON.parse(filled)) as PlanMessage

    expect(plan.lines.map((line) => line.ingredientSlug)).toEqual([
      'farine',
      'sucre',
      'sel',
      'huile',
    ])
    for (const line of plan.lines) {
      expect(line.status).toBe('NEW')
      expect(line.products ?? []).toEqual([])
      expect(line.needed?.quantity).toBeGreaterThan(0)
      expect(line.needed?.dimension).toBeTruthy()
    }
  })

  it('reste très en dessous de la borne de 64 Ko', () => {
    expect(new TextEncoder().encode(filled).length).toBeLessThan(LIMITS.messageBytes / 20)
  })
})
