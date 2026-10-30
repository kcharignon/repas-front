// @vitest-environment node
// Le plan d'essai de la variante de débogage (DRV-313) : le modèle que l'application remplit doit être un plan valide du protocole v1,
// jugé par les validateurs de l'agent (ceux que l'agent applique à l'exécution), avec un magasin et un passage synthétiques.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { LIMITS, validatePlan, type PlanMessage } from '../../drive-agent/protocol'

const assets = (name: string) =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../app/src/debug/assets', name), 'utf8')
const template = assets('debug-plan.json')

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

/** Le modèle d'Auchan (DRV-735) : le magasin lu par l'agent est un UUID sur `www.auchan.fr`, jugé par `STORES.auchan` comme le fait l'agent. */
describe('le plan d’essai de débogage d’Auchan', () => {
  const auchan = assets('debug-plan.auchan.json')
    .replaceAll('__RUN_ID__', '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c')
    .replaceAll('__STORE_ID__', '0b5b1d0c-6f4e-4d0e-9a53-2f6a3c1d7e88')
    .replaceAll('__STORE_HOST__', 'www.auchan.fr')

  it('est un plan valide du protocole v1 pour Auchan une fois rempli', () => {
    const plan = validatePlan(JSON.parse(auchan)) as PlanMessage

    expect(plan.retailer).toBe('auchan')
    expect(auchan).not.toContain('__')
  })

  it('a les mêmes ingrédients courants que celui de Leclerc, sans produit mémorisé', () => {
    const plan = validatePlan(JSON.parse(auchan)) as PlanMessage
    const leclerc = validatePlan(JSON.parse(filled)) as PlanMessage

    expect(plan.lines).toEqual(leclerc.lines)
    for (const line of plan.lines) expect(line.products ?? []).toEqual([])
  })

  it('refuse le magasin de Leclerc (identifiant numérique, autre hôte)', () => {
    const wrong = assets('debug-plan.auchan.json')
      .replaceAll('__RUN_ID__', '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c')
      .replaceAll('__STORE_ID__', '123456')
      .replaceAll('__STORE_HOST__', 'fd0-courses.leclercdrive.fr')

    expect(() => validatePlan(JSON.parse(wrong))).toThrow(/store/i)
  })
})
