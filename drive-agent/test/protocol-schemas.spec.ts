// @vitest-environment node
// Conformité du protocole v1 (DRV-302) : les schémas JSON (documentation qui fait foi) et les validateurs écrits à la main donnent
// le même verdict sur tous les exemples. Ajv n'est qu'une dépendance de développement : il ne part jamais dans l'agent.
import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'

import {
  COMMANDS,
  CONTENT_UNITS,
  ERROR_CODES,
  LIMITS,
  LINE_OUTCOMES,
  LINE_STATUSES,
  MEASURE_UNITS,
  OUTCOMES,
  PACKS_STATUSES,
  PLACEMENTS,
  validateCommand,
  validatePlan,
  validateResult,
  validateSelftestResult,
} from '../protocol'
import { buildAgent } from '../scripts/build.mjs'
import { invalidExamples, schema, validExamples } from './protocol-examples'

const ajv = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true })

function accepts(validator: (message: unknown) => unknown, message: unknown): boolean {
  try {
    validator(message)
    return true
  } catch {
    return false
  }
}

describe.each([
  ['plan', validatePlan],
  ['result', validateResult],
  ['command', validateCommand],
  ['selftest-result', validateSelftestResult],
] as const)('schéma %s.schema.json', (kind, validator) => {
  const validate = ajv.compile(schema(kind))

  it.each(validExamples(kind))(
    'accepte l’exemple valide « $name », comme le validateur',
    ({ message }) => {
      expect(validate(message)).toBe(true)
      expect(accepts(validator, message)).toBe(true)
    },
  )

  it.each(invalidExamples(kind))(
    'refuse « $name » comme le validateur, sauf si la faute dépasse JSON Schema',
    ({ message, schemaCannotSee }) => {
      expect(accepts(validator, message)).toBe(false)
      expect(validate(message)).toBe(schemaCannotSee)
    },
  )

  it('a au moins 6 exemples invalides et 6 valides (1 ou 2 pour les commandes et le rapport du test, qui sont courts)', () => {
    expect(validExamples(kind).length).toBeGreaterThanOrEqual(
      kind === 'plan' || kind === 'result' ? 6 : 1,
    )
    expect(invalidExamples(kind).length).toBeGreaterThanOrEqual(6)
  })
})

describe('les schémas et le module disent la même chose', () => {
  function find(node: unknown, key: string, found: unknown[] = []): unknown[] {
    if (Array.isArray(node)) node.forEach((item) => find(item, key, found))
    else if (typeof node === 'object' && node !== null) {
      for (const [name, value] of Object.entries(node)) {
        if (name === key) found.push(value)
        find(value, key, found)
      }
    }
    return found
  }
  const both = JSON.stringify([
    schema('plan'),
    schema('result'),
    schema('command'),
    schema('selftest-result'),
  ])

  it.each([
    ['statuts de ligne', LINE_STATUSES],
    ['états des quantités', [...PACKS_STATUSES, null]],
    ['codes d’erreur', ERROR_CODES],
    ['commandes', COMMANDS],
    ['issues globales', OUTCOMES],
    ['placements', PLACEMENTS],
    ['unités de contenu', CONTENT_UNITS],
    ['unités de mesure', MEASURE_UNITS],
  ])('énumère les mêmes %s', (_name, values) => {
    expect(both).toContain(JSON.stringify(values))
  })

  it('énumère les issues de ligne dans le schéma du résultat', () => {
    const enums = find(schema('result'), 'enum').map((item) => JSON.stringify(item))
    expect(enums).toContain(JSON.stringify(LINE_OUTCOMES))
  })

  it('reprend les bornes du module', () => {
    const plan = schema('plan')
    const result = schema('result')
    const bounds = (node: unknown, key: string) =>
      find(node, key).filter((v) => typeof v === 'number')

    expect(bounds(plan, 'maxItems')).toEqual(
      expect.arrayContaining([LIMITS.lines, LIMITS.products, LIMITS.rejected]),
    )
    expect(bounds(result, 'maxItems')).toEqual(
      expect.arrayContaining([LIMITS.lines, LIMITS.rejected, LIMITS.unavailableAdded]),
    )
    expect(bounds(plan, 'maximum')).toContain(LIMITS.packsMax)
    expect(bounds(result, 'maximum')).toEqual(
      expect.arrayContaining([LIMITS.packsMax, LIMITS.cents]),
    )
    expect(bounds(schema('selftest-result'), 'maxLength')).toContain(LIMITS.selftestReport)
    expect(bounds(plan, 'maxLength')).toContain(LIMITS.label)
    expect(bounds(result, 'maxLength')).toEqual(
      expect.arrayContaining([LIMITS.label, LIMITS.errorMessage]),
    )
  })
})

describe('le poids du protocole', () => {
  it('ajoute moins de 6 Ko à l’agent', async () => {
    // Given : l'agent vide, puis le même avec tout le protocole dedans
    const [empty, withProtocol] = await Promise.all([
      buildAgent(),
      buildAgent({ entry: 'test/entries/protocol.ts' }),
    ])

    // When
    const added = withProtocol.manifest.bytes - empty.manifest.bytes

    // Then
    console.info(`Le protocole ajoute ${added} octets`)
    expect(added).toBeLessThan(6000)
  }, 60_000)
})
