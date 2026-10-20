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

  it('ne recopie que les clés du protocole : une clé ajoutée par le back, à tous les niveaux, ne casse jamais l’envoi', () => {
    // La forme actuelle du back (DRV-652 : `unitSlug`, `unitName`, `packSize`) plus une clé inventée à chaque niveau
    const future = plan() as unknown as { lines: Record<string, unknown>[] }
    for (const line of future.lines) {
      line.futureLineKey = 'x'
      Object.assign(line.needed as object, { futureNeededKey: 1 })
      for (const product of line.products as object[])
        Object.assign(product, {
          packSize: { value: 20, unitSlug: 'tranche' },
          futureProductKey: 'x',
        })
      for (const rejected of line.rejected as object[])
        Object.assign(rejected, { futureRejectedKey: 'x' })
    }

    for (const changes of [{}, { farine: 'REPLACE', lait: 'SKIP' } as const]) {
      const message = buildPlanMessage(
        future as unknown as ReturnType<typeof plan>,
        changes,
        RUN_ID,
        {
          rayonHints: true,
        },
      )

      expect(() => validatePlan(message)).not.toThrow()
      expect(JSON.stringify(message)).not.toMatch(/future|unitSlug|unitName|packSize/)
    }
    expect(lineOf(buildPlanMessage(plan(), {}, RUN_ID), 'farine').needed).toEqual({
      quantity: 800,
      unitSymbol: 'g',
      dimension: 'WEIGHT',
      baseFactor: 1,
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

  it('ne change ni une ligne « tu en as déjà » ni une ligne à choisir qu’on veut « remplacer »', () => {
    const message = buildPlanMessage(plan(), { sel: 'SKIP', curry: 'REPLACE' }, RUN_ID)

    expect(lineOf(message, 'sel')).toEqual({
      ingredientSlug: 'sel',
      name: 'Sel',
      status: 'HAVE_AT_HOME',
    })
    expect(lineOf(message, 'curry')).toMatchObject({ status: 'NEW', products: [] })
    expect(lineOf(message, 'curry')).not.toHaveProperty('replaces')
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

describe('buildPlanMessage : les rayons conseillés (DRV-642)', () => {
  const hinted = (hints: unknown) => {
    const base = plan()
    return {
      ...base,
      lines: base.lines.map((line) =>
        ['farine', 'poivre', 'sel'].includes(line.ingredientSlug)
          ? { ...line, rayonHints: hints }
          : line,
      ),
    } as ReturnType<typeof plan>
  }

  it('sans l’option, le message est celui d’avant, octet pour octet, même si le plan porte des rayons', () => {
    const before = JSON.stringify(buildPlanMessage(plan(), {}, RUN_ID))

    expect(JSON.stringify(buildPlanMessage(hinted([41, 12]), {}, RUN_ID))).toBe(before)
    expect(before).not.toContain('rayonHints')
  })

  it('avec l’option, recopie les rayons conseillés des lignes connues et des lignes à choisir, validés par le protocole', () => {
    const message = buildPlanMessage(hinted([41, 12, 60]), {}, RUN_ID, { rayonHints: true })

    expect(() => validatePlan(message)).not.toThrow()
    expect(lineOf(message, 'farine')).toMatchObject({ rayonHints: [41, 12, 60] })
    expect(lineOf(message, 'poivre')).toMatchObject({ status: 'NEW', rayonHints: [41, 12, 60] })
    // Une ligne « Choisir un autre produit » est à choisir sur le site : les rayons la suivent
    const replaced = buildPlanMessage(hinted([41]), { farine: 'REPLACE' }, RUN_ID, {
      rayonHints: true,
    })
    expect(lineOf(replaced, 'farine')).toMatchObject({ status: 'NEW', rayonHints: [41] })
    // Les lignes sans rayon appris n'ont pas la clé
    expect(lineOf(message, 'curry')).not.toHaveProperty('rayonHints')
  })

  it.each([
    ['absent', undefined],
    ['null', null],
    ['vide', []],
  ])('rayons %s : la clé n’est pas envoyée', (_name, hints) => {
    const message = buildPlanMessage(hinted(hints), {}, RUN_ID, { rayonHints: true })

    expect(() => validatePlan(message)).not.toThrow()
    expect(JSON.stringify(message)).not.toContain('rayonHints')
  })

  it('ne laisse partir que des valeurs que l’agent accepte : invalides retirées, doublons retirés, trois au plus', () => {
    const message = buildPlanMessage(
      hinted([0, -1, 1.5, '41', 41, 41, 2_147_483_648, 12, 60, 7]),
      {},
      RUN_ID,
      { rayonHints: true },
    )

    expect(() => validatePlan(message)).not.toThrow()
    expect(lineOf(message, 'farine')).toMatchObject({ rayonHints: [41, 12, 60] })
  })

  it('ne met pas de rayons sur une ligne passée ou « tu en as déjà »', () => {
    const message = buildPlanMessage(hinted([41]), { poivre: 'SKIP' }, RUN_ID, { rayonHints: true })

    expect(lineOf(message, 'poivre')).toEqual({
      ingredientSlug: 'poivre',
      name: 'Poivre',
      status: 'SKIP',
    })
    expect(lineOf(message, 'sel')).not.toHaveProperty('rayonHints')
  })
})
