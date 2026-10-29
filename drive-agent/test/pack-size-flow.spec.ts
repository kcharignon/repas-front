// @vitest-environment node
// La contenance d'un produit dans l'unité de la liste (DRV-652) : l'aide à la saisie (nombre du libellé, pluriel), et la phase A, quand un produit connu
// dont le plan ne sait pas calculer le nombre de produits est mis au panier. La phase B et l'écran sont dans phase-b.spec.ts et ui.spec.ts.
import { describe, expect, it } from 'vitest'

import type { PlanLine, PlanProduct } from '../protocol'
import { askPacks, givenSize, sizeInLabel, unitOf } from '../src/flow/pack-size'
import { pluralOf, unitFor } from '../src/ui'
import { expectConform, fakeAdapter, fakeUi, known, makeFlow, plan, product } from './flow-helpers'

const SLICES = {
  quantity: 15,
  unitSymbol: 'tranche',
  dimension: null,
  baseFactor: null,
  unitSlug: 'tranche',
  unitName: 'tranche',
} as const
const CHEDDAR = 'Fromage Cheddar Burger Les Croisés 20 Tranches - 340g'

describe('pluralOf et unitFor : le nom de l’unité, au pluriel selon la quantité', () => {
  it.each([
    ['tranche', 'tranches'],
    ['gramme', 'grammes'],
    ['pièce', 'pièces'],
    ['cuillère à soupe', 'cuillères à soupe'],
    ['cuillère à café', 'cuillères à café'],
    ['pincée de sel', 'pincées de sel'],
    ['bocal', 'bocaux'],
    ['morceau', 'morceaux'],
    ['pruneau', 'pruneaux'],
    ['noix', 'noix'],
    ['gaz', 'gaz'],
    ['pas', 'pas'],
    ['  tranche  ', 'tranches'],
    ['', 's'],
  ])('« %s » devient « %s »', (name, plural) => {
    expect(pluralOf(name)).toBe(plural)
  })

  it.each([
    [0, 'tranche'],
    [1, 'tranche'],
    [1.5, 'tranche'],
    [1.99, 'tranche'],
    [2, 'tranches'],
    [15, 'tranches'],
  ])('à %s : « %s »', (quantity, expected) => {
    expect(unitFor('tranche', quantity)).toBe(expected)
  })
})

describe('sizeInLabel : le nombre que le libellé annonce pour l’unité de la ligne', () => {
  it.each([
    [CHEDDAR, 'tranche', 20],
    ['Cheddar 20 tranches', 'tranche', 20],
    ['CHEDDAR 20 TRANCHES', 'tranche', 20],
    ['Cheddar 20Tranches', 'tranche', 20],
    ['Cheddar 20 tranche', 'tranche', 20],
    ['Fromage 1 tranche', 'tranche', 1],
    ['Fromage 12,5 tranches', 'tranche', 12.5],
    ['Fromage 12.5 tranches', 'tranche', 12.5],
    ['Fromage 20 tranches', 'tranche', 20],
    ['6 pièces de bois', 'pièce', 6],
    ['6 PIECES', 'pièce', 6],
    ['Oeufs x12 unités', 'unité', 12],
    ['Cuillères 10 cuillères à soupe', 'cuillère à soupe', 10],
    ['Sachets 4 Cuilleres a Soupe', 'cuillère à soupe', 4],
    ['Œufs 6 œufs', 'œuf', 6],
    ['Bocaux 3 bocaux', 'bocal', 3],
  ])('« %s » pour « %s » : %s', (label, unit, expected) => {
    expect(sizeInLabel(label, unit)).toBe(expected)
  })

  it.each([
    ['le contenu net n’est pas l’unité de la ligne', 'Fromage 340g', 'tranche'],
    ['le contenu net en toutes lettres non plus', 'Fromage 340 grammes', 'tranche'],
    ['aucun nombre', 'Fromage en tranches', 'tranche'],
    ['un nombre sans l’unité', 'Fromage 20', 'tranche'],
    ['l’unité sans nombre', 'Tranches de fromage', 'tranche'],
    ['un autre mot qui commence pareil', 'Fromage 20 tranchettes', 'tranche'],
    ['un mot qui finit par l’unité', 'Fromage 20 contranche', 'tranche'],
    ['deux nombres différents', 'Fromage 10 tranches et 5 tranches', 'tranche'],
    ['un lot (2 x 10 : 20 serait un pari, 10 faux)', 'Fromage 2 x 10 tranches', 'tranche'],
    ['un lot collé', 'Fromage 2x10 tranches', 'tranche'],
    ['un lot avec le signe ×', 'Fromage 3 × 8 tranches', 'tranche'],
    ['un nombre hors bornes', 'Fromage 10000 tranches', 'tranche'],
    ['zéro', 'Fromage 0 tranches', 'tranche'],
    ['un nombre à quatre décimales', 'Fromage 1,2345 tranches', 'tranche'],
    ['un nombre collé à un autre', 'Fromage 1,234,5 tranches', 'tranche'],
    ['un libellé vide', '', 'tranche'],
    ['une unité vide', 'Fromage 20 tranches', ''],
  ])('%s : aucune proposition', (_name, label, unit) => {
    expect(sizeInLabel(label, unit)).toBeNull()
  })

  it('deux fois le même nombre : une seule proposition', () => {
    expect(sizeInLabel('Fromage 20 tranches, 20 tranches', 'tranche')).toBe(20)
  })

  it('une unité qui contient des caractères de motif est traitée comme du texte', () => {
    expect(sizeInLabel('Lot 3 (a+b)', '(a+b)')).toBe(3)
    expect(sizeInLabel('Lot 3 axb', '.*')).toBeNull()
  })
})

describe('unitOf et givenSize', () => {
  it('l’unité de la ligne, avec la quantité demandée', () => {
    expect(unitOf(SLICES)).toEqual({
      slug: 'tranche',
      name: 'tranche',
      quantity: 15,
      counts: false,
    })
    expect(unitOf({ ...SLICES, dimension: 'COUNT' })?.counts).toBe(true)
    expect(unitOf({ ...SLICES, unitName: '  tranche ' })?.name).toBe('tranche')
  })

  it.each([
    ['pas de quantité demandée', undefined],
    ['le slug seul', { quantity: 15, unitSymbol: 'tranche', unitSlug: 'tranche' }],
    ['le nom seul', { quantity: 15, unitSymbol: 'tranche', unitName: 'tranche' }],
    ['un slug mal formé', { ...SLICES, unitSlug: 'Tranche' }],
    ['un nom vide', { ...SLICES, unitName: '  ' }],
    ['une quantité nulle', { ...SLICES, quantity: 0 }],
  ])('%s : pas d’unité (« Nombre de produits »)', (_name, needed) => {
    expect(unitOf(needed as PlanLine['needed'])).toBeNull()
  })

  it('la contenance déjà donnée compte dans l’unité exacte de la ligne seulement', () => {
    const size = { value: 20, unitSlug: 'tranche' }

    expect(givenSize({ packSize: size }, SLICES)).toEqual(size)
    expect(givenSize({ packSize: { value: 20, unitSlug: 'gramme' } }, SLICES)).toBeNull()
    expect(givenSize({ packSize: null }, SLICES)).toBeNull()
    expect(givenSize({}, SLICES)).toBeNull()
    expect(givenSize({ packSize: size }, undefined)).toBeNull()
    expect(givenSize({ packSize: size }, { quantity: 15, unitSymbol: 'tranche' })).toBeNull()
  })
})

describe('askPacks : le nombre proposé dans le champ', () => {
  const ask = { ingredient: 'Tomate', need: null, packs: null }
  const UNITS = {
    quantity: 2.5,
    unitSymbol: 'unité',
    dimension: 'COUNT',
    baseFactor: 1,
    unitSlug: 'unite',
    unitName: 'unité',
  } as const
  const proposed = async (productLabel: string, needed: PlanLine['needed']) => {
    const screens = fakeUi({ packSize: () => null })
    await askPacks(screens.ui, { ...ask, productLabel, needed })

    return screens.propsOf('packSize')[0]?.prefill
  }

  it('une unité de pièces (« unité ») dont le libellé ne dit aucun nombre : 1, un produit = une pièce', async () => {
    expect(await proposed('Tomates cerises mélangées Barquette 400g', UNITS)).toBe(1)
    expect(await proposed('Tomates', { ...UNITS, unitSlug: 'piece', unitName: 'pièce' })).toBe(1)
  })

  it('« 2,5 unités » avec 1 par produit : 3 produits', async () => {
    const screens = fakeUi({ packSize: (props) => props.prefill })

    const answer = await askPacks(screens.ui, {
      ...ask,
      productLabel: 'Tomates cerises Barquette 400g',
      needed: UNITS,
    })

    expect(answer).toEqual({ packs: 3, packSize: { value: 1, unitSlug: 'unite' } })
  })

  it('le libellé qui dit le nombre l’emporte sur le 1 : « 6 unités » donne 6', async () => {
    expect(await proposed('Oeufs plein air 6 unités', UNITS)).toBe(6)
  })

  it.each([
    ['deux nombres différents', 'Lot 4 unités ou 6 unités'],
    ['un lot', 'Lot 2 x 6 unités'],
  ])('%s : pas de nombre sans ambiguïté, donc 1 pour une unité de pièces', async (_name, label) => {
    expect(await proposed(label, UNITS)).toBe(1)
  })

  it.each([
    [
      'la tranche (sans dimension)',
      { ...UNITS, dimension: null, unitSlug: 'tranche', unitName: 'tranche' },
    ],
    [
      'la cuillère (sans dimension)',
      { quantity: 2.5, unitSymbol: 'cuillère', unitSlug: 'cuillere', unitName: 'cuillère' },
    ],
    ['le gramme', { ...UNITS, dimension: 'WEIGHT', unitSlug: 'gramme', unitName: 'gramme' }],
    ['le paquet', { ...UNITS, dimension: 'PACKAGE', unitSlug: 'paquet', unitName: 'paquet' }],
  ] as const)(
    '%s dont le libellé ne dit aucun nombre : le champ reste vide',
    async (_name, needed) => {
      expect(await proposed('Tomates cerises mélangées Barquette 400g', needed)).toBeNull()
    },
  )
})

describe('askPacks', () => {
  const ask = { ingredient: 'Cheddar', productLabel: CHEDDAR, need: null, packs: null }

  it('avec l’unité : la question en unités, le nombre de produits en est déduit', async () => {
    const screens = fakeUi({ packSize: () => 8 })

    const answer = await askPacks(screens.ui, { ...ask, needed: SLICES })

    expect(answer).toEqual({ packs: 2, packSize: { value: 8, unitSlug: 'tranche' } })
    expect(screens.screens()).toEqual(['packSize'])
    expect(screens.propsOf('packSize')).toEqual([
      {
        ingredient: 'Cheddar',
        productLabel: CHEDDAR,
        quantity: 15,
        unitName: 'tranche',
        prefill: 20,
      },
    ])
  })

  it('sans l’unité : « Nombre de produits », et aucune contenance', async () => {
    const screens = fakeUi({ quantity: () => 3 })

    const answer = await askPacks(screens.ui, {
      ...ask,
      needed: { quantity: 15, unitSymbol: 'tranche' },
    })

    expect(answer).toEqual({ packs: 3 })
    expect(screens.screens()).toEqual(['quantity'])
  })

  it('« Pas cette fois », dans les deux cas : null', async () => {
    const withUnit = fakeUi({ packSize: () => null })
    const without = fakeUi({ quantity: () => null })

    expect(await askPacks(withUnit.ui, { ...ask, needed: SLICES })).toBeNull()
    expect(await askPacks(without.ui, { ...ask, needed: undefined })).toBeNull()
  })
})

// —— La phase A : un produit connu dont le plan ne sait pas calculer ——————————————————————————————————————————————————————————

describe('un produit connu dont le plan ne sait pas calculer le nombre de produits (phase A)', () => {
  const cheddar = (item: PlanProduct, needed: PlanLine['needed'] = SLICES) => ({
    ...known('cheddar', [item]),
    name: 'Cheddar en tranche',
    needed,
  })
  const toCheck = product('1000001', null, CHEDDAR)

  it('pose la question en unités, met le nombre déduit au panier et rend la contenance avec la ligne ADDED', async () => {
    // Given : 15 tranches voulues, le produit en contient 20 (le contenu net lu en direct est en grammes : sans rapport)
    const { adapter, writes, calls } = fakeAdapter({
      '1000001': {
        content: { value: 340, unit: 'g' },
        price: 299,
        perMeasure: { cents: 879, unit: 'kg' },
        label: 'Fromage cheddar en tranches',
        label2: '20 Tranches',
        image: 'https://photos-test.leclercdrive.fr/image.ashx?id=1&use=l&cat=p',
      },
    })
    const screens = fakeUi({ packSize: () => 20 })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    // When
    await flow.start(plan([cheddar(toCheck)]))

    // Then
    expect(screens.screens()).toEqual(['progress', 'packSize', 'progress'])
    expect(screens.propsOf('packSize')).toEqual([
      {
        ingredient: 'Cheddar en tranche',
        productLabel: CHEDDAR,
        quantity: 15,
        unitName: 'tranche',
        prefill: 20,
        // Ce que l'agent a lu sur la page de recherche, sans requête de plus : photo, nom, contenu, prix et prix au kilo
        product: {
          name: 'Fromage cheddar en tranches',
          label2: '20 Tranches',
          details: ['340 g', '2,99 €', '8,79 € / kg'],
          photo: 'https://photos-test.leclercdrive.fr/image.ashx?id=1&use=l&cat=p',
        },
      },
    ])
    expect(calls.filter((call) => call.startsWith('search'))).toEqual(['search 1000001'])
    expect(writes).toEqual([{ id: '1000001', quantity: 1 }])
    expect(expectConform(sent[0]).lines[0]).toEqual({
      ingredientSlug: 'cheddar',
      outcome: 'ADDED',
      productId: '1000001',
      quantity: 1,
      usedRank: 1,
      packSize: { value: 20, unitSlug: 'tranche' },
      price: { cents: 299, perMeasure: { cents: 879, unit: 'kg' } },
    })
  })

  it('25 tranches pour 20 par produit : 2 produits', async () => {
    const { adapter, writes } = fakeAdapter({ '1000001': {} })
    const { flow } = makeFlow({ ui: fakeUi({ packSize: () => 20 }).ui, adapter })

    await flow.start(plan([cheddar(toCheck, { ...SLICES, quantity: 25 })]))

    expect(writes).toEqual([{ id: '1000001', quantity: 2 }])
  })

  it('le plan dit déjà « à vérifier » pour un produit au contenu connu : même question', async () => {
    const { adapter } = fakeAdapter({ '1000001': {} })
    const screens = fakeUi({ packSize: () => 20 })
    const { flow } = makeFlow({ ui: screens.ui, adapter })
    const item: PlanProduct = { ...toCheck, packs: 4, packsStatus: 'TO_CHECK' }

    await flow.start(plan([cheddar(item)]))

    expect(screens.screens()).toContain('packSize')
  })

  it('sans l’unité dans le plan (back ou application plus anciens) : « Nombre de produits », et aucune contenance', async () => {
    const { adapter, writes } = fakeAdapter({ '1000001': {} })
    const screens = fakeUi({ quantity: () => 2 })
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })

    await flow.start(plan([cheddar(toCheck, { quantity: 15, unitSymbol: 'tranche' })]))

    expect(screens.screens()).toEqual(['progress', 'quantity', 'progress'])
    expect(writes).toEqual([{ id: '1000001', quantity: 2 }])
    expect(JSON.stringify(sent[0])).not.toContain('packSize')
  })

  it('« Pas cette fois » : la ligne est passée, rien n’est écrit ni mémorisé', async () => {
    const { adapter, writes } = fakeAdapter({ '1000001': {} })
    const { flow, sent } = makeFlow({ ui: fakeUi({ packSize: () => null }).ui, adapter })

    await flow.start(plan([cheddar(toCheck)]))

    expect(writes).toEqual([])
    expect(sent[0]?.lines).toEqual([{ ingredientSlug: 'cheddar', outcome: 'SKIPPED' }])
  })

  it('l’envoi suivant : le plan dit COMPUTED avec la contenance donnée, aucune question, aucune clé rendue', async () => {
    // Given : ce que le back renvoie la fois suivante (15 tranches, produit de 20 : 1, COMPUTED)
    const { adapter, writes } = fakeAdapter({ '1000001': {} })
    const screens = fakeUi()
    const { flow, sent } = makeFlow({ ui: screens.ui, adapter })
    const item: PlanProduct = {
      ...product('1000001', 1, CHEDDAR),
      packSize: { value: 20, unitSlug: 'tranche' },
    }

    // When
    await flow.start(plan([cheddar(item)]))

    // Then
    expect(screens.screens()).not.toContain('packSize')
    expect(screens.screens()).not.toContain('quantity')
    expect(writes).toEqual([{ id: '1000001', quantity: 1 }])
    expect(JSON.stringify(sent[0])).not.toContain('packSize')
  })

  it('la contenance donnée fait le calcul : le contenu lu en direct (en grammes) ne le défait pas', async () => {
    // Given : une ligne en grammes dont la personne a donné la contenance du produit (100 g) ; le site lit pourtant 500 g
    const { adapter, writes } = fakeAdapter({ '1000001': { content: { value: 500, unit: 'g' } } })
    const screens = fakeUi()
    const { flow } = makeFlow({ ui: screens.ui, adapter })
    const grams = {
      quantity: 400,
      unitSymbol: 'g',
      dimension: 'WEIGHT' as const,
      baseFactor: 1,
      unitSlug: 'gramme',
      unitName: 'gramme',
    }
    const item: PlanProduct = {
      ...product('1000001', 4, 'Produit de test 1000001'),
      packSize: { value: 100, unitSlug: 'gramme' },
    }

    await flow.start(plan([cheddar(item, grams)]))

    expect(writes).toEqual([{ id: '1000001', quantity: 4 }])
    expect(screens.screens()).not.toContain('end')
  })

  it('une contenance donnée dans une autre unité que celle de la ligne ne fait pas le calcul : le contenu lu en direct le refait', async () => {
    const { adapter, writes } = fakeAdapter({ '1000001': { content: { value: 500, unit: 'g' } } })
    const { flow } = makeFlow({ ui: fakeUi().ui, adapter })
    const grams = {
      quantity: 400,
      unitSymbol: 'g',
      dimension: 'WEIGHT' as const,
      baseFactor: 1,
      unitSlug: 'gramme',
      unitName: 'gramme',
    }
    const item: PlanProduct = {
      ...product('1000001', 4, 'Produit de test 1000001'),
      packSize: { value: 100, unitSlug: 'tranche' },
    }

    await flow.start(plan([cheddar(item, grams)]))

    // 400 g / 500 g = 1 (le plan disait 4 : le contenu lu en direct fait foi, DRV-613)
    expect(writes).toEqual([{ id: '1000001', quantity: 1 }])
  })

  it('un produit à étiquette de rupture que le panier refuse : la contenance donnée n’est pas rendue (rien n’a été mis au panier)', async () => {
    const { adapter } = fakeAdapter({ '1000001': { stock: 0, obtained: () => 0 } })
    const { flow, sent } = makeFlow({
      ui: fakeUi({ packSize: () => 20, chooser: () => ({ kind: 'skip' }) }).ui,
      adapter,
    })

    await flow.start(plan([cheddar(toCheck)]))

    expect(JSON.stringify(sent[0])).not.toContain('packSize')
  })
})

describe('askPacks : le produit montré à l’écran de quantité (DRV-652)', () => {
  const card = {
    name: 'Fromage cheddar en tranches',
    label2: '20 Tranches',
    details: ['340 g', '2,99 €', '8,79 € / kg'],
    photo: 'https://photos-test.leclercdrive.fr/image.ashx?id=1&use=l&cat=p',
  }

  it('la fiche du produit passe à la question en unités comme à « Nombre de produits »', async () => {
    const withUnit = fakeUi({ packSize: () => 20 })
    const without = fakeUi({ quantity: () => 2 })
    const base = {
      ingredient: 'Cheddar',
      productLabel: CHEDDAR,
      need: null,
      packs: null,
      product: card,
    }

    await askPacks(withUnit.ui, { ...base, needed: SLICES })
    await askPacks(without.ui, { ...base, needed: { quantity: 15, unitSymbol: 'tranche' } })

    expect(withUnit.propsOf('packSize')[0]?.product).toEqual(card)
    expect(without.propsOf('quantity')[0]?.product).toEqual(card)
  })
})
