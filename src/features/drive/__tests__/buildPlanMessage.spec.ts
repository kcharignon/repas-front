import { describe, expect, it } from 'vitest'
import { validatePlan } from '@drive-protocol'
import type { PlanLine } from '@drive-protocol'

import { buildPlanMessage, effectiveStatus } from '../buildPlanMessage'
import { plan, storeBaseUrl } from './fixtures'

const RUN_ID = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'

const lineOf = (message: ReturnType<typeof buildPlanMessage>, slug: string): PlanLine => {
  const line = message.lines.find((candidate) => candidate.ingredientSlug === slug)
  if (line === undefined) throw new Error(`Ligne absente : ${slug}`)

  return line
}

describe('buildPlanMessage', () => {
  it('traduit le plan du back en message du protocole v1, validé par le protocole', () => {
    const message = buildPlanMessage(plan(), {}, RUN_ID)

    expect(() => validatePlan(message)).not.toThrow()
    expect(message).toMatchObject({
      v: 1,
      type: 'plan',
      runId: RUN_ID,
      retailer: 'leclerc',
      store: { id: '123456', host: new URL(storeBaseUrl).host },
      returnPath: '/drive/retour',
    })
    expect(message.lines).toHaveLength(12)
    expect(message.lines.map((line) => line.status)).toEqual([
      ...Array<string>(8).fill('KNOWN'),
      'NEW',
      'NEW',
      'NEW',
      'HAVE_AT_HOME',
    ])
  })

  it('garde les produits dans l’ordre de priorité, avec leur refusé, leur contenu, leurs produits et la quantité demandée', () => {
    const reversed = plan()
    reversed.lines[0]!.products.reverse()
    const farine = lineOf(buildPlanMessage(reversed, {}, RUN_ID), 'farine')

    expect(farine).toEqual({
      ingredientSlug: 'farine',
      name: 'Farine',
      status: 'KNOWN',
      products: [
        {
          id: '123456',
          label: 'Farine de blé T55 Marque Repère 1 kg',
          content: { value: 1000, unit: 'g' },
          packs: 1,
          packsStatus: 'COMPUTED',
        },
        {
          id: '222333',
          label: 'Farine de blé T45 1 kg',
          content: { value: 1000, unit: 'g' },
          packs: 2,
          packsStatus: 'COMPUTED',
        },
      ],
      rejected: [{ id: '999000', label: 'Farine complète bio 1 kg' }],
      searchQuery: 'Farine',
      needed: { quantity: 800, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
    })
  })

  it('transmet « à vérifier » : packs nul et statut TO_CHECK', () => {
    const [beurre] = (lineOf(buildPlanMessage(plan(), {}, RUN_ID), 'beurre').products ?? []) as {
      packs: number | null
      packsStatus: string
    }[]

    expect(beurre).toMatchObject({ packs: null, packsStatus: 'TO_CHECK' })
  })

  it('« Choisir un autre produit » : la ligne connue devient à choisir, le produit préféré est remplacé, le refusé reste', () => {
    const message = buildPlanMessage(plan(), { farine: 'REPLACE' }, RUN_ID)

    expect(() => validatePlan(message)).not.toThrow()
    expect(lineOf(message, 'farine')).toEqual({
      ingredientSlug: 'farine',
      name: 'Farine',
      status: 'NEW',
      products: [],
      rejected: [{ id: '999000', label: 'Farine complète bio 1 kg' }],
      searchQuery: 'Farine',
      needed: { quantity: 800, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 },
      replaces: { id: '123456', label: 'Farine de blé T55 Marque Repère 1 kg' },
    })
  })

  it('« Passer cette fois » : la ligne est passée, sans produit', () => {
    const message = buildPlanMessage(plan(), { lait: 'SKIP', poivre: 'SKIP' }, RUN_ID)

    expect(lineOf(message, 'lait')).toEqual({
      ingredientSlug: 'lait',
      name: 'Lait',
      status: 'SKIP',
    })
    expect(lineOf(message, 'poivre').status).toBe('SKIP')
    expect(() => validatePlan(message)).not.toThrow()
  })

  it('ne change ni une ligne « vous en avez déjà » ni une ligne à choisir qu’on veut « remplacer »', () => {
    const message = buildPlanMessage(plan(), { sel: 'SKIP', curry: 'REPLACE' }, RUN_ID)

    expect(lineOf(message, 'sel')).toEqual({
      ingredientSlug: 'sel',
      name: 'Sel',
      status: 'HAVE_AT_HOME',
    })
    expect(lineOf(message, 'curry')).toMatchObject({ status: 'NEW', products: [] })
    expect(lineOf(message, 'curry')).not.toHaveProperty('replaces')
  })

  it('omet la quantité demandée quand son symbole est vide : le protocole le refuse, l’agent la demandera', () => {
    const poivre = lineOf(buildPlanMessage(plan(), {}, RUN_ID), 'poivre')

    expect(poivre.status).toBe('NEW')
    expect(poivre).not.toHaveProperty('needed')
  })

  it('garde le refusé d’une ligne nouvelle', () => {
    expect(lineOf(buildPlanMessage(plan(), {}, RUN_ID), 'moutarde')).toMatchObject({
      status: 'NEW',
      rejected: [{ id: '999111', label: 'Moutarde forte 200 g' }],
    })
  })

  it('refuse une adresse de magasin qui n’en est pas une', () => {
    const broken = plan()
    broken.store.baseUrl = 'pas une adresse'

    expect(() => buildPlanMessage(broken, {}, RUN_ID)).toThrow(TypeError)
  })
})

describe('effectiveStatus', () => {
  it('suit le statut du plan, ou le choix de l’utilisateur', () => {
    const [farine, , , , , , , , poivre, , , sel] = plan().lines as [
      ...ReturnType<typeof plan>['lines'],
    ]

    expect(effectiveStatus(farine!, {})).toBe('KNOWN')
    expect(effectiveStatus(farine!, { farine: 'REPLACE' })).toBe('NEW')
    expect(effectiveStatus(farine!, { farine: 'SKIP' })).toBe('SKIP')
    expect(effectiveStatus(poivre!, { poivre: 'REPLACE' })).toBe('NEW')
    expect(effectiveStatus(sel!, { sel: 'SKIP' })).toBe('HAVE_AT_HOME')
  })
})
