// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateResult } from '@drive-protocol'
import type { ResultLine } from '@drive-protocol'

import { buildChoiceBatches, countChoices, MAX_INTENTS } from '../choices'
import { result } from './results'

const batchOf = (lines: ResultLine[]) => buildChoiceBatches(result({ lines }))

describe('buildChoiceBatches', () => {
  it('le résultat de référence est valide pour le protocole', () => {
    expect(() => validateResult(result())).not.toThrow()
  })

  it('un passage réussi enregistre 4 intentions en un appel : 2 ajouts, 1 « j’en ai toujours », 1 refus', () => {
    const [batch, ...others] = buildChoiceBatches(result())

    expect(others).toEqual([])
    expect(
      batch?.map((intent) => [intent.ingredientSlug, intent.action, intent.placement]),
    ).toEqual([
      ['poivre', 'ADD_PRODUCT', 'PRIMARY'],
      ['curry', 'ADD_PRODUCT', 'FALLBACK'],
      ['moutarde', 'REJECT_PRODUCT', null],
      ['sel', 'HAVE_AT_HOME', null],
    ])
  })

  it('traduit le produit : identifiant en chaîne, libellé, code-barres, contenu', () => {
    const [batch] = buildChoiceBatches(result())

    expect(batch?.[0]?.product).toEqual({
      retailerProductId: '555111',
      label: 'Poivre noir moulu 50 g',
      ean: null,
      content: { value: 50, unit: 'g' },
      price: null,
    })
    expect(batch?.[1]?.product).toMatchObject({
      retailerProductId: '555222',
      ean: '12345678',
      content: null,
    })
    expect(batch?.[2]?.product).toEqual({
      retailerProductId: '999111',
      label: 'Moutarde forte 200 g',
      ean: null,
      content: null,
      price: null,
    })
  })

  it('nettoie les libellés avant de les envoyer : un agent plus ancien peut laisser passer un caractère invisible que le back refuse (et le back rejette alors tout le lot)', () => {
    // Given : trait d'union conditionnel, opérateurs invisibles, largeur nulle, marque d'ordre des octets, espace insécable
    const [batch] = batchOf([
      {
        ingredientSlug: 'poivre',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'PRIMARY',
        product: { id: '1', label: 'Poi\u00ADvre\u2061 noir\u200B 50\u00A0g' },
        rejected: [
          { id: '2', label: 'Moutarde\u2062 forte\uFEFF' },
          { id: '3', label: '\u00AD\u200B' },
        ],
      },
    ])

    // Then : les refus d'abord, puis l'ajout ; un libellé qui n'était fait que d'invisibles devient l'identifiant (le back exige un libellé)
    expect(batch?.map((intent) => intent.product?.label)).toEqual([
      'Moutarde forte',
      '3',
      'Poivre noir 50 g',
    ])
  })

  it('ne mémorise rien pour « cette fois seulement », les lignes passées, indisponibles ou en échec', () => {
    expect(
      batchOf([
        {
          ingredientSlug: 'poivre',
          outcome: 'CHOSEN',
          quantity: 1,
          placement: 'ONCE',
          product: { id: '1', label: 'Poivre' },
        },
        { ingredientSlug: 'sel', outcome: 'SKIPPED' },
        { ingredientSlug: 'riz', outcome: 'UNAVAILABLE', unavailableIds: ['2'] },
        { ingredientSlug: 'lait', outcome: 'FAILED', error: 'BLOCKED' },
        { ingredientSlug: 'sucre', outcome: 'ADDED', productId: '3', quantity: 1, usedRank: 2 },
      ]),
    ).toEqual([])
  })

  it('rafraîchit le prix de chaque ligne ajoutée qui en porte un', () => {
    const [batch] = batchOf([
      {
        ingredientSlug: 'farine',
        outcome: 'ADDED',
        productId: '222333',
        quantity: 1,
        usedRank: 1,
        price: { cents: 189, perMeasure: { cents: 189, unit: 'kg' } },
      },
      {
        ingredientSlug: 'riz',
        outcome: 'ADDED',
        productId: '300004',
        quantity: 1,
        usedRank: 1,
        price: { cents: 250 },
      },
      { ingredientSlug: 'lait', outcome: 'ADDED', productId: '300002', quantity: 1, usedRank: 1 },
    ])

    expect(batch).toEqual([
      {
        ingredientSlug: 'farine',
        action: 'REFRESH_PRICE',
        placement: null,
        product: {
          retailerProductId: '222333',
          label: null,
          ean: null,
          content: null,
          price: { cents: 189, perMeasure: { cents: 189, unit: 'kg' } },
        },
      },
      {
        ingredientSlug: 'riz',
        action: 'REFRESH_PRICE',
        placement: null,
        product: {
          retailerProductId: '300004',
          label: null,
          ean: null,
          content: null,
          price: { cents: 250, perMeasure: null },
        },
      },
    ])
  })

  it('envoie le prix du produit choisi avec son ajout', () => {
    const [batch] = batchOf([
      {
        ingredientSlug: 'poivre',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'PRIMARY',
        product: { id: '555111', label: 'Poivre', price: { cents: 329 } },
      },
    ])

    expect(batch?.[0]?.product?.price).toEqual({ cents: 329, perMeasure: null })
  })

  it('ne garde pas un prix au-delà de ce que le back accepte', () => {
    const [batch] = batchOf([
      {
        ingredientSlug: 'riz',
        outcome: 'ADDED',
        productId: '300004',
        quantity: 1,
        usedRank: 1,
        price: { cents: 1_000_001 },
      },
      {
        ingredientSlug: 'lait',
        outcome: 'ADDED',
        productId: '300002',
        quantity: 1,
        usedRank: 1,
        price: { cents: 100, perMeasure: { cents: 5_000_000, unit: 'l' } },
      },
    ])

    expect(batch).toHaveLength(1)
    expect(batch?.[0]?.product?.price).toEqual({ cents: 100, perMeasure: null })
  })

  it('met « j’en ai toujours » après les produits refusés du même ingrédient', () => {
    const [batch] = batchOf([
      {
        ingredientSlug: 'sel',
        outcome: 'HAVE_AT_HOME',
        rejected: [
          { id: '10', label: 'Sel fin' },
          { id: '11', label: 'Sel gros' },
        ],
      },
    ])

    expect(batch?.map((intent) => intent.action)).toEqual([
      'REJECT_PRODUCT',
      'REJECT_PRODUCT',
      'HAVE_AT_HOME',
    ])
  })

  it('un produit choisi et aussi refusé n’est pas refusé : le lot serait rejeté en entier', () => {
    const [batch] = batchOf([
      {
        ingredientSlug: 'poivre',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'PRIMARY',
        product: { id: '555111', label: 'Poivre' },
        rejected: [
          { id: '555111', label: 'Poivre' },
          { id: '999', label: 'Poivre blanc' },
        ],
      },
    ])

    expect(batch?.map((intent) => [intent.action, intent.product?.retailerProductId])).toEqual([
      ['REJECT_PRODUCT', '999'],
      ['ADD_PRODUCT', '555111'],
    ])
  })

  it('coupe en lots de 200 intentions au plus, sans séparer les intentions d’une ligne', () => {
    const lines: ResultLine[] = Array.from({ length: 100 }, (_, index) => ({
      ingredientSlug: `article-${index}`,
      outcome: 'HAVE_AT_HOME',
      rejected: [
        { id: `${index}1`, label: 'A' },
        { id: `${index}2`, label: 'B' },
      ],
    }))

    const batches = batchOf(lines)

    expect(batches.map((batch) => batch.length)).toEqual([198, 102])
    expect(batches.every((batch) => batch.length <= MAX_INTENTS)).toBe(true)
    // Les trois intentions d'un ingrédient restent ensemble
    expect(batches[0]?.[197]).toMatchObject({
      ingredientSlug: 'article-65',
      action: 'HAVE_AT_HOME',
    })
  })
})

describe('buildChoiceBatches : le rayon et la famille du produit choisi (DRV-642)', () => {
  const chosen = (product: object, placement: 'PRIMARY' | 'ONCE' = 'PRIMARY'): ResultLine =>
    ({
      ingredientSlug: 'tomate',
      outcome: 'CHOSEN',
      quantity: 1,
      placement,
      product: { id: '555111', label: 'Tomates de test', ...product },
    }) as ResultLine

  it('recopie rayonId et familyId dans le produit de l’intention, un résultat valide pour le protocole', () => {
    const message = result({ lines: [chosen({ rayonId: 41, familyId: 410 })] })

    expect(() => validateResult(message)).not.toThrow()
    const intent = buildChoiceBatches(message)[0]?.[0]
    expect(intent?.product).toMatchObject({
      retailerProductId: '555111',
      rayonId: 41,
      familyId: 410,
    })
  })

  it('l’un sans l’autre : seule la clé donnée part', () => {
    const onlyRayon = batchOf([chosen({ rayonId: 41 })])[0]?.[0]
    const onlyFamily = batchOf([chosen({ familyId: 410 })])[0]?.[0]

    expect(onlyRayon?.product).toHaveProperty('rayonId', 41)
    expect(onlyRayon?.product).not.toHaveProperty('familyId')
    expect(onlyFamily?.product).toHaveProperty('familyId', 410)
    expect(onlyFamily?.product).not.toHaveProperty('rayonId')
  })

  it('un agent ancien (sans ces clés) : le corps est celui d’avant, sans clé de plus', () => {
    const intent = batchOf([chosen({})])[0]?.[0]

    expect(intent?.product).toEqual({
      retailerProductId: '555111',
      label: 'Tomates de test',
      ean: null,
      content: null,
      price: null,
    })
    expect(JSON.stringify(intent)).not.toMatch(/rayonId|familyId/)
  })

  it('ne laisse pas partir une valeur que le back refuserait (zéro, négative, fractionnaire, trop grande, en texte)', () => {
    for (const bad of [0, -3, 1.5, 2_147_483_648, '41', null]) {
      const intent = batchOf([chosen({ rayonId: bad, familyId: bad })])[0]?.[0]

      expect(JSON.stringify(intent)).not.toMatch(/rayonId|familyId/)
    }
  })

  it('un produit « cette fois seulement » (ONCE) n’enregistre rien, donc ne dit pas son rayon', () => {
    expect(batchOf([chosen({ rayonId: 41 }, 'ONCE')])).toEqual([])
  })
})

describe('la recherche qui a fait trouver le produit (DRV-650)', () => {
  const chosen = (
    searchQuery: string | undefined,
    placement: 'PRIMARY' | 'FALLBACK' | 'ONCE' = 'PRIMARY',
  ): ResultLine => ({
    ingredientSlug: 'cereale',
    outcome: 'CHOSEN',
    quantity: 1,
    placement,
    product: { id: '555101', label: 'Céréales coussins chocolat 500 g' },
    ...(searchQuery !== undefined && { searchQuery }),
  })
  const intentOf = (line: ResultLine) => batchOf([line])[0]?.[0]

  it('part avec l’ajout du produit, en texte', () => {
    const intent = intentOf(chosen('céréales coussins'))

    expect(intent).toMatchObject({ action: 'ADD_PRODUCT', searchQuery: 'céréales coussins' })
  })

  it('une clé absente reste absente : le back garde la recherche déjà mémorisée, jamais « null » (qui l’effacerait)', () => {
    const batches = buildChoiceBatches(result())

    expect(intentOf(chosen(undefined))).not.toHaveProperty('searchQuery')
    expect(JSON.stringify(batches)).not.toContain('searchQuery')
  })

  it('n’est jamais envoyée en « null », ni pour une recherche trop courte une fois nettoyée', () => {
    for (const text of ['', ' ', 'x', ' \u200bx\u200b ', '🥚']) {
      const intent = intentOf(chosen(text))

      expect(intent).not.toHaveProperty('searchQuery')
      expect(JSON.stringify(intent)).not.toContain('"searchQuery"')
    }
  })

  it('est nettoyée une seconde fois, pour un agent plus ancien : le back refuse le lot entier sur un caractère invisible', () => {
    const intent = intentOf(chosen('  cé\u00adréales\u200b   coussins\u00a0choco\n'))

    expect(intent).toMatchObject({ searchQuery: 'céréales coussins choco' })
  })

  it('est coupée à 80 points de code, jamais au milieu d’une paire de substitution', () => {
    const intent = intentOf(chosen(`${'a'.repeat(79)}🥚suite`))

    expect(intent?.searchQuery).toBe(`${'a'.repeat(79)}🥚`)
    expect([...(intent?.searchQuery ?? '')]).toHaveLength(80)
    expect(() => new TextEncoder().encode(JSON.stringify(intent))).not.toThrow()
    expect(JSON.stringify(intent)).not.toMatch(/\\ud[89ab]/i)
  })

  it('80 emojis : 80 points de code, 160 unités UTF-16, gardés', () => {
    expect(intentOf(chosen('🥚'.repeat(90)))?.searchQuery).toBe('🥚'.repeat(80))
  })

  it('le texte de la personne reste du texte : un libellé HTML part tel quel, sans être interprété', () => {
    const intent = intentOf(chosen('<img src=x onerror=alert(1)>'))

    expect(intent?.searchQuery).toBe('<img src=x onerror=alert(1)>')
  })

  it('ne part pas pour un produit de secours (celle d’un produit de secours n’est pas celle de l’article)', () => {
    const intents = batchOf([chosen('céréales coussins', 'FALLBACK')]).flat()

    expect(JSON.stringify(intents)).not.toContain('searchQuery')
  })

  it('pour « Pas mon habituel » (ONCE), elle part seule, sans produit : l’intention NOTE_SEARCH (DRV-653)', () => {
    const intents = batchOf([chosen('céréales coussins', 'ONCE')]).flat()

    expect(intents).toEqual([
      {
        ingredientSlug: 'cereale',
        action: 'NOTE_SEARCH',
        placement: null,
        product: null,
        searchQuery: 'céréales coussins',
      },
    ])
  })

  it('jamais sur un produit refusé, un rafraîchissement de prix ni « j’en ai toujours » (le back répondrait 422 pour tout le lot)', () => {
    const batch = batchOf([
      { ...chosen('céréales coussins'), rejected: [{ id: '9', label: 'Autre céréale' }] },
      {
        ingredientSlug: 'lait',
        outcome: 'ADDED',
        productId: '3',
        quantity: 1,
        usedRank: 1,
        price: { cents: 99 },
      },
      { ingredientSlug: 'sel', outcome: 'HAVE_AT_HOME' },
    ]).flat()

    const withQuery = batch.filter((intent) => 'searchQuery' in intent)
    expect(withQuery.map((intent) => intent.action)).toEqual(['ADD_PRODUCT'])
  })
})

describe('la recherche d’un produit pris « Pas mon habituel » (DRV-653)', () => {
  const once = (searchQuery: string | undefined, extra: Partial<ResultLine> = {}): ResultLine =>
    ({
      ingredientSlug: 'cereale',
      outcome: 'CHOSEN',
      quantity: 1,
      placement: 'ONCE',
      product: { id: '555101', label: 'Céréales coussins chocolat 500 g' },
      ...(searchQuery !== undefined && { searchQuery }),
      ...extra,
    }) as ResultLine

  it('est renettoyée comme pour un produit retenu : invisibles retirés, espaces réduites, 80 points de code', () => {
    const [intent] = batchOf([once('  céréales\u200B   coussins\n')]).flat()
    expect(intent).toMatchObject({ action: 'NOTE_SEARCH', searchQuery: 'céréales coussins' })

    const [long] = batchOf([once('🥚'.repeat(90))]).flat()
    expect(long?.searchQuery).toBe('🥚'.repeat(80))
  })

  it.each([[undefined], [''], ['a'], ['  \u200B '], ['\u00AD\u200B']])(
    'sans texte exploitable (%j) : aucune intention du tout, jamais une intention vide (le back refuserait tout le lot)',
    (searchQuery) => {
      expect(batchOf([once(searchQuery)])).toEqual([])
    },
  )

  it('ne double jamais un produit retenu du même article dans le lot : la recherche part déjà avec l’ADD_PRODUCT', () => {
    const intents = batchOf([
      once('céréales coussins'),
      { ...once('céréales coussins'), placement: 'PRIMARY' } as ResultLine,
    ]).flat()

    expect(intents.map((intent) => intent.action)).toEqual(['ADD_PRODUCT'])
  })

  it('ne suit jamais un « j’en ai toujours » du même article (le back répondrait 422 pour tout le lot)', () => {
    const intents = batchOf([
      once('céréales coussins'),
      { ingredientSlug: 'cereale', outcome: 'HAVE_AT_HOME' },
    ]).flat()

    expect(intents.map((intent) => intent.action)).toEqual(['HAVE_AT_HOME'])
  })

  it('vient après les produits refusés de l’article, comme le back l’attend', () => {
    const intents = batchOf([
      once('céréales coussins', { rejected: [{ id: '9', label: 'Autre' }] }),
    ]).flat()

    expect(intents.map((intent) => intent.action)).toEqual(['REJECT_PRODUCT', 'NOTE_SEARCH'])
  })

  it('n’est pas un choix : l’écran du retour ne dit pas « tes choix sont enregistrés » pour elle seule', () => {
    expect(countChoices(batchOf([once('céréales coussins')]))).toBe(0)
  })
})

describe('la contenance du produit dans l’unité de la liste (DRV-652)', () => {
  const SIZE = { value: 20, unitSlug: 'tranche' }
  const chosen = (extra: Partial<ResultLine> = {}): ResultLine =>
    ({
      ingredientSlug: 'cheddar',
      outcome: 'CHOSEN',
      quantity: 1,
      placement: 'PRIMARY',
      product: { id: '555701', label: 'Fromage Cheddar Burger 20 Tranches - 340g' },
      ...extra,
    }) as ResultLine
  const added = (extra: Partial<ResultLine> = {}): ResultLine =>
    ({
      ingredientSlug: 'cheddar',
      outcome: 'ADDED',
      productId: '555701',
      quantity: 1,
      usedRank: 2,
      ...extra,
    }) as ResultLine
  const known = new Map([
    [
      '555701',
      {
        label: 'Fromage Cheddar Burger 20 Tranches - 340g',
        content: { value: 340, unit: 'g' as const },
      },
    ],
  ])
  const build = (lines: ResultLine[]) => buildChoiceBatches(result({ lines }), known)

  it('part dans le produit de l’ADD_PRODUCT d’un produit choisi, avec une clé packSize {value, unitSlug}', () => {
    const [intent] = build([chosen({ packSize: SIZE })]).flat()

    expect(intent).toMatchObject({ action: 'ADD_PRODUCT', placement: 'PRIMARY' })
    expect(intent?.product?.packSize).toEqual(SIZE)
  })

  it('clé absente quand l’agent n’en dit rien : le back garde alors la contenance déjà mémorisée, jamais null', () => {
    const [intent] = build([chosen()]).flat()

    expect(intent?.product).not.toHaveProperty('packSize')
    expect(JSON.stringify(build([chosen(), added()]))).not.toContain('"packSize":null')
  })

  it('jamais pour « Pas mon habituel » (ONCE) : rien n’est gardé de ce produit', () => {
    expect(build([chosen({ placement: 'ONCE', packSize: SIZE })])).toEqual([])
  })

  it.each([
    [{ value: 0, unitSlug: 'tranche' }],
    [{ value: 0.0001, unitSlug: 'tranche' }],
    [{ value: 10_000, unitSlug: 'tranche' }],
    [{ value: 12.3456, unitSlug: 'tranche' }],
    [{ value: -3, unitSlug: 'tranche' }],
    [{ value: Number.NaN, unitSlug: 'tranche' }],
    [{ value: '20', unitSlug: 'tranche' }],
    [{ value: 20, unitSlug: 'Tranche' }],
    [{ value: 20, unitSlug: '' }],
    [{ value: 20 }],
    [{ value: 20, unitSlug: 'tranche', extra: 1 }],
    [null],
    ['20 tranches'],
  ])('ne laisse pas partir %j (le back refuserait tout le lot)', (packSize) => {
    const [intent] = build([chosen({ packSize } as Partial<ResultLine>)]).flat()

    expect(intent?.product).not.toHaveProperty('packSize')
    // Le produit choisi, lui, part toujours
    expect(intent).toMatchObject({ action: 'ADD_PRODUCT' })
  })

  it('accepte les bornes : 0,001 et 9 999, trois décimales', () => {
    for (const value of [0.001, 9999, 12.345, 0.5]) {
      const [intent] = build([chosen({ packSize: { value, unitSlug: 'tranche' } })]).flat()

      expect(intent?.product?.packSize).toEqual({ value, unitSlug: 'tranche' })
    }
  })

  it('pour un produit connu mis au panier : un ADD_PRODUCT « de secours », qui ne change pas son rang, avec le libellé et le contenu du plan', () => {
    const [intent] = build([added({ packSize: SIZE })]).flat()

    expect(intent).toEqual({
      ingredientSlug: 'cheddar',
      action: 'ADD_PRODUCT',
      placement: 'FALLBACK',
      product: {
        retailerProductId: '555701',
        label: 'Fromage Cheddar Burger 20 Tranches - 340g',
        ean: null,
        content: { value: 340, unit: 'g' },
        price: null,
        packSize: SIZE,
      },
    })
  })

  it('un produit connu sans réponse de la personne : rien de plus (le prix seul le rafraîchit)', () => {
    const intents = build([added({ price: { cents: 199 } })]).flat()

    expect(intents.map((intent) => intent.action)).toEqual(['REFRESH_PRICE'])
  })

  it('un produit que le plan ne décrit pas n’est pas redécrit à l’aveugle', () => {
    expect(buildChoiceBatches(result({ lines: [added({ packSize: SIZE })] }))).toEqual([])
  })

  it('le libellé du plan est nettoyé comme tout libellé (un trait d’union conditionnel ferait refuser tout le lot)', () => {
    const dirty = new Map([['555701', { label: 'Che\u00ADddar\u200B 20 Tranches', content: null }]])
    const [intent] = buildChoiceBatches(
      result({ lines: [added({ packSize: SIZE })] }),
      dirty,
    ).flat()

    expect(intent?.product?.label).toBe('Cheddar 20 Tranches')
  })

  it('n’est pas un choix : un produit connu dont on ne retient que la contenance ne compte pas', () => {
    expect(countChoices(build([added({ packSize: SIZE })]))).toBe(0)
    expect(countChoices(build([chosen({ packSize: SIZE })]))).toBe(1)
  })

  it('le produit d’une ligne passée, indisponible ou en échec n’en retient aucune', () => {
    const intents = build([
      { ingredientSlug: 'a', outcome: 'SKIPPED' },
      { ingredientSlug: 'b', outcome: 'UNAVAILABLE' },
    ])

    expect(intents).toEqual([])
  })
})
