// @vitest-environment node
// Le test automatique de la variante de débogage (DRV-318) : les étapes, leurs bornes et garde-fous, le nettoyage et le rapport. Le
// magasin est simulé (`selftest-helpers.ts`), l'horloge fausse ; aucun réseau, aucune attente.
import { describe, expect, it, vi } from 'vitest'

import { validateSelftestResult, type SelftestResultMessage } from '../protocol'
import { LeclercError } from '../src/leclerc'
import {
  compareCart,
  isOk,
  LOT_WORDS,
  MAX_PRODUCTS,
  MAX_TEST_QUANTITY,
  PASSAGE_WORDS,
  pickCandidate,
  reportOf,
  runSelftest,
  safeLabel,
  seconds,
  showSelftest,
  stepStatuses,
} from '../src/selftest'
import { S } from '../src/ui'
import { fakeUi } from './flow-helpers'
import { ALL_WORDS, blocked, runDeps, shop, standardShelves } from './selftest-helpers'

const play = (parts: ReturnType<typeof shop>) =>
  runSelftest(runDeps(parts.adapter), { stopped: () => false, step: () => undefined })

describe('le mot de la liste et ses bornes', () => {
  it('cherche douze mots courants, et essaie trois produits au plus', () => {
    expect(LOT_WORDS).toHaveLength(12)
    expect(LOT_WORDS).toEqual(expect.arrayContaining(['farine', 'sucre', 'sel', 'lait', 'bananes']))
    expect(PASSAGE_WORDS).toEqual(['farine', 'sucre', 'sel'])
    expect(MAX_PRODUCTS).toBe(3)
    expect(MAX_TEST_QUANTITY).toBe(3)
  })
})

describe('le choix automatique du produit', () => {
  const base = { id: '2000001', label: 'X', stock: 12, inCart: 0, price: 129 }
  const make = (parts: Partial<typeof base> & { id?: string }) =>
    ({
      ...base,
      ...parts,
      label2: null,
      pricePerMeasure: null,
      promo: null,
      imageUrl: null,
      content: null,
      contentSource: null,
    }) as Parameters<typeof pickCandidate>[0][number]

  it('prend le premier produit en stock pour trois exemplaires, hors panier, dont le prix est lu', () => {
    const picked = pickCandidate([
      make({ id: '2000001', stock: 0 }), // grisé : indisponible
      make({ id: '2000002', stock: 2 }), // pas assez pour la quantité 3
      make({ id: '2000003', inCart: 1 }), // déjà au panier : le retrait y toucherait
      make({ id: '2000004', price: null as never }),
      make({ id: '2000005', stock: null as never }),
      make({ id: '2000006', inCart: null as never }),
      make({ id: '2000007' }),
      make({ id: '2000008' }),
    ])

    expect(picked?.id).toBe('2000007')
  })

  it('ne reprend pas un produit que l’essai a déjà pris pour un autre ingrédient', () => {
    const picked = pickCandidate(
      [make({ id: '2000001' }), make({ id: '2000002' })],
      new Set(['2000001']),
    )

    expect(picked?.id).toBe('2000002')
  })

  it('ne prend rien quand aucun produit ne convient', () => {
    expect(pickCandidate([make({ stock: 0 })])).toBeUndefined()
    expect(pickCandidate([])).toBeUndefined()
  })
})

describe('en fonctionnement normal', () => {
  it('joue toutes les étapes dans l’ordre : douze recherches, trois produits, puis le retrait de tout', async () => {
    // Given
    const parts = shop(standardShelves(ALL_WORDS))

    // When
    const data = await play(parts)

    // Then : le diagnostic cherche « sel » puis le mot absurde (la forme d'une réponse sans résultat), le lot cherche les douze mots, puis l'essai
    expect(parts.calls.slice(0, 17)).toEqual([
      'search sel',
      'search zzqxkw',
      'search tomate',
      'search pomme',
      'search courgette',
      ...ALL_WORDS.map((w) => `search ${w}`),
    ])
    expect(parts.calls.slice(17)).toEqual([
      'search farine',
      'cart 2000000 1',
      'cart 2000000 3',
      'cart 2000000 2',
      'search sucre',
      'cart 2000010 1',
      'search sel',
      'cart 2000020 1',
      'cart 2000020 0',
      'cart 2000010 0',
      'cart 2000000 0',
    ])
    expect(parts.cart()).toEqual({})
    expect(stepStatuses(data)).toEqual(['OK', 'OK', 'OK', 'OK', 'OK'])
    expect(isOk(data)).toBe(true)
    expect(data.halt).toBeNull()
  })

  it('relève, pour chaque écriture, le code HTTP et la quantité obtenue', async () => {
    const data = await play(shop(standardShelves(ALL_WORDS)))

    const [first, second, third] = data.items
    expect(first?.writes.map((w) => [w.wanted, w.obtained, w.http])).toEqual([
      [1, 1, 200],
      [3, 3, 200],
      [2, 2, 200],
    ])
    expect(first?.removal).toMatchObject({ wanted: 0, obtained: 0, http: 200, ok: true })
    expect(second?.writes.map((w) => w.wanted)).toEqual([1])
    expect(third?.writes.map((w) => w.wanted)).toEqual([1])
    expect(data.words.map((word) => word.found)).toEqual(Array(12).fill(3))
    expect(data.words.every((word) => word.withContent === 3 && word.withPrice === 3)).toBe(true)
  })

  it('compare le panier avant et après : il est revenu à son état initial', async () => {
    const data = await play(shop(standardShelves(ALL_WORDS)))

    expect(data.compare).toMatchObject({
      status: 'OK',
      before: { items: 0, totalCents: 0 },
      beforeDerived: true,
      after: { items: 0, totalCents: 0 },
      leftovers: [],
    })
  })

  it('rend le panier de l’utilisateur tel qu’il était, sans jamais toucher à ses produits', async () => {
    // Given : l'utilisateur a déjà deux articles au panier, dont le premier produit du rayon « farine »
    const shelves = standardShelves(ALL_WORDS)
    const parts = shop(shelves, { cart: { '2000000': 2 } })

    // When
    const data = await play(parts)

    // Then : le premier produit (déjà au panier) est écarté, et le panier garde ses deux articles
    expect(parts.cart()).toEqual({ '2000000': 2 })
    expect(parts.writes.some((w) => w.id === '2000000')).toBe(false)
    expect(data.compare).toMatchObject({
      status: 'OK',
      before: { items: 2, totalCents: 258 },
      after: { items: 2, totalCents: 258 },
    })
  })

  it('ne dépasse jamais trois produits ni la quantité 3, même avec des rayons très garnis', async () => {
    const shelves = standardShelves(ALL_WORDS)
    for (const word of ALL_WORDS) {
      shelves[word] = Array.from({ length: 40 }, (_, rank) => ({
        id: String(3_000_000 + rank),
        stock: 500,
        price: 100,
      }))
    }
    const parts = shop(shelves)

    await play(parts)

    expect(new Set(parts.writes.map((w) => w.id)).size).toBeLessThanOrEqual(MAX_PRODUCTS)
    expect(Math.max(...parts.writes.map((w) => w.quantity))).toBeLessThanOrEqual(MAX_TEST_QUANTITY)
    expect(parts.cart()).toEqual({})
  })

  it('n’est pas gêné par un site qui ne dit ni le nombre d’articles ni le total : le panier est déclaré « non relu »', async () => {
    const parts = shop(standardShelves(ALL_WORDS), { silentCart: true, pageTotal: false })

    const data = await play(parts)

    expect(parts.cart()).toEqual({})
    expect(data.compare.status).toBe('KO')
    expect(reportOf(data)).toContain('non lu')
  })

  it('compare les nombres d’articles quand le total manque', async () => {
    const parts = shop(standardShelves(ALL_WORDS), { pageTotal: false })

    const data = await play(parts)

    expect(data.compare.before.totalCents).toBeNull()
    expect(data.compare.status).toBe('OK')
  })
})

describe('un blocage du site', () => {
  it('arrête tout aussitôt : pas une recherche de plus, rien au panier', async () => {
    // Given : la cinquième recherche du lot est bloquée (429)
    const parts = shop(standardShelves(ALL_WORDS), {
      before: (call) => {
        if (call === `search ${ALL_WORDS[4]}`) throw blocked(429)
      },
    })

    // When
    const data = await play(parts)

    // Then
    expect(parts.calls.at(-1)).toBe(`search ${ALL_WORDS[4]}`)
    expect(parts.writes).toEqual([])
    expect(data.halt).toEqual({ code: 'BLOCKED', http: 429 })
    expect(data.words.map((word) => word.status)).toEqual([
      'OK',
      'OK',
      'OK',
      'OK',
      'KO',
      ...Array(7).fill('NOT_TESTED'),
    ])
    expect(data.items.every((item) => item.status === 'NOT_TESTED')).toBe(true)
    expect(data.compare.status).toBe('NOT_TESTED')
    expect(isOk(data)).toBe(false)
    expect(reportOf(data)).toContain('Arrêt : BLOCKED, HTTP 429')
  })

  it('tente le nettoyage après un blocage en plein essai, et liste ce qui reste au panier', async () => {
    // Given : le site se bloque après le premier ajout, et reste bloqué (comme le Pacer, qui n'envoie plus rien)
    let stopped = false
    const parts = shop(standardShelves(ALL_WORDS), {
      before: (call) => {
        if (stopped) throw blocked(429)
        if (call === 'cart 2000000 3') {
          stopped = true
          throw blocked(429)
        }
      },
    })

    // When
    const data = await play(parts)

    // Then : le produit ajouté est resté au panier, et le rapport dit lequel retirer à la main
    expect(parts.cart()).toEqual({ '2000000': 1 })
    expect(data.compare.status).toBe('KO')
    expect(data.compare.leftovers).toEqual(['farine de test 1'])
    expect(data.halt).toEqual({ code: 'BLOCKED', http: 429 })
    expect(data.items.map((item) => item.status)).toEqual(['KO', 'NOT_TESTED', 'NOT_TESTED'])
    const report = reportOf(data)
    expect(report).toContain('à retirer à la main : « farine de test 1 »')
    expect(report).toContain('BLOCKED, HTTP 429')
    expect(isOk(data)).toBe(false)
  })

  it('arrête un site qui n’est pas connecté, ou une page qui n’est pas celle d’un magasin', async () => {
    const parts = shop(standardShelves(ALL_WORDS), {
      before: () => {
        throw new LeclercError('NOT_LOGGED_IN', 401)
      },
    })

    const data = await play(parts)

    expect(data.halt).toEqual({ code: 'NOT_LOGGED_IN', http: null })
    expect(parts.calls).toEqual(['search sel'])
    expect(parts.writes).toEqual([])
  })
})

describe('une erreur, un arrêt demandé', () => {
  it('nettoie ce qui a été ajouté quand une écriture échoue en route (erreur réseau)', async () => {
    const parts = shop(standardShelves(ALL_WORDS), {
      before: (call) => {
        if (call === 'cart 2000010 1') throw new LeclercError('NETWORK')
      },
    })

    const data = await play(parts)

    expect(parts.cart()).toEqual({})
    expect(data.items.map((item) => item.status)).toEqual(['OK', 'KO', 'NOT_TESTED'])
    expect(data.items[1]?.failure).toEqual({ code: 'NETWORK', http: null })
    expect(data.compare.status).toBe('OK')
    expect(isOk(data)).toBe(false)
  })

  it('retente un retrait qui échoue une fois', async () => {
    let failed = false
    const parts = shop(standardShelves(ALL_WORDS), {
      before: (call) => {
        if (call === 'cart 2000010 0' && !failed) {
          failed = true
          throw new LeclercError('NETWORK')
        }
      },
    })

    const data = await play(parts)

    expect(parts.cart()).toEqual({})
    expect(data.compare.leftovers).toEqual([])
  })

  it('un arrêt demandé pendant l’essai interrompt les écritures, nettoie et le dit dans le rapport', async () => {
    const parts = shop(standardShelves(ALL_WORDS))
    const data = await runSelftest(runDeps(parts.adapter), {
      stopped: () => parts.calls.includes('cart 2000000 1'),
      step: () => undefined,
    })

    expect(parts.cart()).toEqual({})
    expect(parts.writes.map((w) => `${w.id}:${w.quantity}`)).toEqual(['2000000:1', '2000000:0'])
    expect(data.stopped).toBe(true)
    expect(data.items.map((item) => item.status)).toEqual(['OK', 'NOT_TESTED', 'NOT_TESTED'])
    expect(isOk(data)).toBe(false)
    expect(reportOf(data)).toContain('Verdict : INTERROMPU')
  })

  it('un arrêt demandé pendant le lot ne lance ni écriture ni recherche de plus', async () => {
    const parts = shop(standardShelves(ALL_WORDS))
    const data = await runSelftest(runDeps(parts.adapter), {
      stopped: () => parts.calls.includes('search sucre'),
      step: () => undefined,
    })

    expect(parts.writes).toEqual([])
    expect(data.words.filter((word) => word.status === 'OK').map((word) => word.word)).toEqual([
      'farine',
      'sucre',
    ])
    expect(data.compare.status).toBe('NOT_TESTED')
  })

  it('s’arrête après trois recherches de suite sans résultat', async () => {
    const shelves = standardShelves(ALL_WORDS)
    for (const word of ['poivre', "huile d'olive", 'beurre']) shelves[word] = []
    const parts = shop(shelves)

    const data = await play(parts)

    expect(data.halt).toBe('REPEATED')
    expect(data.words.filter((word) => word.status === 'NOT_TESTED')).toHaveLength(6)
    expect(parts.writes).toEqual([])
    expect(reportOf(data)).toContain('trois recherches de suite sans résultat')
  })

  it('rend KO l’essai d’un ingrédient sans produit éligible, sans rien écrire pour lui', async () => {
    const shelves = standardShelves(ALL_WORDS)
    shelves.sucre = [{ id: '2000011', stock: 0 }]
    const parts = shop(shelves)

    const data = await play(parts)

    expect(data.items[1]).toMatchObject({ status: 'KO', noEligible: true })
    expect(parts.writes.map((w) => w.id)).not.toContain('2000011')
    expect(data.compare.status).toBe('OK')
    expect(reportOf(data)).toContain('aucun produit éligible')
  })

  it('dit quand le panier n’est pas revenu à son état initial, avec les produits à retirer à la main', async () => {
    // Given : le site « oublie » de retirer le deuxième produit
    const parts = shop(standardShelves(ALL_WORDS), {
      keep: (id, quantity) => (id === '2000010' ? 1 : quantity),
    })

    // When
    const data = await play(parts)

    // Then
    expect(parts.cart()).toEqual({ '2000010': 1 })
    expect(data.compare).toMatchObject({ status: 'KO', leftovers: ['sucre de test 1'] })
    expect(data.items[1]?.status).toBe('KO')
    expect(reportOf(data)).toContain('à retirer à la main : « sucre de test 1 »')
  })

  it('une panne imprévue du code arrête les écritures mais le nettoyage a quand même lieu', async () => {
    const parts = shop(standardShelves(ALL_WORDS), {
      before: (call) => {
        if (call === 'search sel' && parts.writes.length > 0) throw new TypeError('imprévu')
      },
    })

    const data = await play(parts)

    expect(parts.cart()).toEqual({})
    expect(data.items[2]?.failure).toEqual({ code: 'OTHER', http: null })
    expect(isOk(data)).toBe(false)
  })
})

describe('compareCart', () => {
  const same = { items: 2, totalCents: 500 }

  it.each([
    ['rien n’a été ajouté', false, same, same, [], 'NOT_TESTED'],
    ['les deux états sont égaux', true, same, same, [], 'OK'],
    ['le nombre d’articles diffère', true, same, { items: 3, totalCents: 500 }, [], 'KO'],
    ['le total diffère', true, same, { items: 2, totalCents: 650 }, [], 'KO'],
    ['il reste un produit', true, same, same, ['x'], 'KO'],
    ['le panier n’a pas été relu', true, same, null, [], 'KO'],
    [
      'seul le total est connu des deux côtés',
      true,
      { items: null, totalCents: 5 },
      { items: 9, totalCents: 5 },
      [],
      'OK',
    ],
    ['rien n’est lisible', true, { items: null, totalCents: null }, same, [], 'KO'],
  ] as const)('quand %s : %s', (_name, touched, before, after, leftovers, status) => {
    expect(compareCart(touched, before, false, after, [...leftovers]).status).toBe(status)
  })
})

describe('showSelftest (l’écran et l’envoi du rapport)', () => {
  it('affiche la progression, envoie un seul rapport conforme au protocole, puis retire l’interface', async () => {
    // Given
    const parts = shop(standardShelves(ALL_WORDS))
    const screens = fakeUi()
    const sent: SelftestResultMessage[] = []

    // When
    await showSelftest({
      ...runDeps(parts.adapter),
      ui: screens.ui,
      send: (message) => void sent.push(message),
    })

    // Then
    expect(screens.screens()).toEqual(['progress'])
    expect(screens.propsOf('progress')[0]).toMatchObject({ title: 'Test automatique', total: 18 })
    expect(screens.updates.at(-1)).toMatchObject({ done: 18 })
    expect(screens.closed.count).toBe(1)
    expect(sent).toHaveLength(1)
    const message = validateSelftestResult(JSON.parse(JSON.stringify(sent[0])))
    expect(message).toMatchObject({ ok: true, agentVersion: '0.6.0' })
    expect(message.report).toContain('Verdict : OK')
  })

  it('« Arrêter » sur l’écran de progression interrompt le test ; le rapport part quand même', async () => {
    const parts = shop(standardShelves(ALL_WORDS), {
      before: (call) => {
        if (call === 'search lait') screens.pressStop()
      },
    })
    const screens = fakeUi()
    const sent: SelftestResultMessage[] = []

    await showSelftest({
      ...runDeps(parts.adapter),
      ui: screens.ui,
      send: (message) => void sent.push(message),
    })

    expect(sent[0]?.ok).toBe(false)
    expect(sent[0]?.report).toContain('INTERROMPU')
    expect(parts.writes).toEqual([])
  })
})

describe('le rapport', () => {
  it('porte les sondes du site réel du diagnostic (ticket B), avant les étapes, sans la moindre valeur', async () => {
    const parts = shop(standardShelves(ALL_WORDS), { label: 'Ville-Test' })
    const data = await play(parts)

    const report = reportOf(data)

    expect(data.probes?.arrival).toMatchObject({ address: '/' })
    expect(report).toContain(
      'Sondes du site (des formes, des noms et des nombres : aucune valeur du site) :',
    )
    expect(report).toContain(' - Adresse d’arrivée : /')
    expect(report.indexOf('Sondes du site')).toBeLessThan(
      report.indexOf('1. [OK] Diagnostic de l’agent'),
    )
  })

  it('dit OK ou KO par étape, les durées, les codes HTTP, les quantités et les produits trouvés par mot', async () => {
    const parts = shop(standardShelves(ALL_WORDS), { label: 'Ville-Test' })
    const data = await play(parts)

    const report = reportOf(data)

    expect(report).toContain('Repas Drive : test automatique')
    expect(report).toContain('Agent : 0.6.0')
    expect(report).toContain('Date : 2026-10-18 14:03 UTC')
    expect(report).toContain('Verdict : OK')
    expect(report).toMatch(/1\. \[OK\] Diagnostic de l’agent \(\d+,\d s\)/)
    expect(report).toMatch(/2\. \[OK\] Lecture du magasin/)
    expect(report).toMatch(/3\. \[OK\] Lot de 12 recherches/)
    expect(report).toMatch(/4\. \[OK\] Essai au panier/)
    expect(report).toMatch(/5\. \[OK\] Panier avant et après/)
    expect(report).toContain('farine : OK, 3 produits, contenu net lu 3, prix lus 3,')
    expect(report).toContain(
      '« farine de test 1 » ; ajout 1 : HTTP 200, obtenu 1 ; mise à 3 : HTTP 200, obtenu 3 ; mise à 2 : HTTP 200, obtenu 2 ; retrait : HTTP 200, obtenu 0',
    )
    expect(report).toContain('articles : 0 avant (déduit de la première réponse), 0 après')
    expect(report).toContain('total : 0,00 € avant, 0,00 € après')
    expect(report).toContain('le panier est revenu à son état initial')
    expect(report).toContain('Aucune commande, aucun paiement.')
  })

  it('un seul rapport, sous la limite du protocole', async () => {
    const report = reportOf(await play(shop(standardShelves(ALL_WORDS))))

    expect(report.length).toBeLessThan(20_000)
    expect(report.split('\n').length).toBeGreaterThan(30)
  })

  it('compte la durée en secondes, jamais en millisecondes', () => {
    expect(seconds(0)).toBe('0,0 s')
    expect(seconds(1234)).toBe('1,2 s')
    expect(seconds(125_000)).toBe('125,0 s')
  })
})

describe('aucune donnée personnelle dans le rapport', () => {
  // Un magasin et des libellés hostiles : numéro complet, ville, adresse, e-mail, jeton, longue suite de chiffres.
  const HOSTILE = [
    'Farine jean.dupont@exemple.invalid',
    'https://fd0-courses.leclercdrive.fr/magasin-123456-123456',
    'Sucre 12345678901 cookie=ABCDEF',
    'Sel <script>alert(1)</script> "x"',
  ]

  async function hostileReport() {
    const shelves = standardShelves(ALL_WORDS)
    PASSAGE_WORDS.forEach((word, index) => {
      shelves[word] = [
        { id: String(2_000_000 + index), label: HOSTILE[index] ?? 'x', price: 100, stock: 12 },
      ]
    })
    const parts = shop(shelves, { label: 'Drive Ville-Test' })
    // La dernière ligne du rapport dit justement qu'il n'y a pas de cookie : ce n'est pas ce que l'on cherche.
    return reportOf(await play(parts)).replace(S.diagnostic.privacy, '')
  }

  it.each([
    ['le numéro de magasin entier', /123456/],
    ['l’hôte complet', /leclercdrive/i],
    ['une adresse web', /https?:|www\./i],
    ['un nom de ville', /Ville-Test/],
    ['une adresse e-mail', /@/],
    ['un cookie ou un jeton', /cookie|token|jeton|set-cookie|authorization|bearer|zcwb/i],
    ['une suite de six chiffres ou plus', /\d{6,}/],
    ['du HTML', /[<>]/],
  ])('ne contient pas %s', async (_name, pattern) => {
    expect(await hostileReport()).not.toMatch(pattern)
  })

  it('réduit le magasin à ses trois derniers chiffres et l’hôte à fdN', async () => {
    const report = await hostileReport()

    expect(report).toContain('Hôte : fd0')
    expect(report).toContain('Magasin : …456')
  })

  it('nettoie un libellé : lettres, chiffres et ponctuation simple, 40 caractères au plus', () => {
    expect(safeLabel('Farine <b>de blé</b> jean@exemple.invalid')).toBe(
      'Farine b de blé b jean exemple invalid',
    )
    expect(safeLabel('Lait 1234567 UHT')).toBe('Lait … UHT')
    expect(safeLabel('x'.repeat(100))).toHaveLength(40)
    expect(safeLabel('@@@')).toBe('?')
  })
})

describe('la progression', () => {
  it('annonce chaque étape à l’écran', async () => {
    const parts = shop(standardShelves(ALL_WORDS))
    const steps = vi.fn<(done: number, current: string) => void>()

    await runSelftest(runDeps(parts.adapter), { stopped: () => false, step: steps })

    const names = steps.mock.calls.map(([, current]) => current)
    expect(names[0]).toBe('Diagnostic de l’agent')
    expect(names).toContain('Recherche « farine »')
    expect(names).toContain('Essai au panier : sel')
    expect(names).toContain('Retrait des produits d’essai')
    expect(names.at(-1)).toBe('Comparaison du panier')
    expect(Math.max(...steps.mock.calls.map(([done]) => done))).toBeLessThanOrEqual(18)
  })
})

describe('la cause précise des échecs et la connexion dans le rapport (tickets A et G)', () => {
  it('un visiteur détecté par la recherche arrête le test avant toute écriture, et le rapport en donne la cause', async () => {
    const parts = shop(standardShelves(ALL_WORDS), {
      before: () => {
        throw new LeclercError('NOT_LOGGED_IN', 200, 'SESSION_VISITOR')
      },
    })

    const data = await play(parts)

    expect(data.halt).toEqual({ code: 'NOT_LOGGED_IN', http: null, cause: 'SESSION_VISITOR' })
    expect(parts.writes).toEqual([])
    expect(parts.cart()).toEqual({})
    expect(reportOf(data)).toContain('Arrêt : NOT_LOGGED_IN (SESSION_VISITOR)')
  })

  it('une recherche du lot qui échoue porte sa cause et son code HTTP', async () => {
    const parts = shop(standardShelves(ALL_WORDS), {
      before: (call) => {
        if (call === 'search riz')
          throw new LeclercError('CONTRACT_CHANGED', 200, 'SEARCH_NO_STATE')
      },
    })

    const data = await play(parts)

    expect(data.words.find((word) => word.word === 'riz')?.failure).toEqual({
      code: 'CONTRACT_CHANGED',
      http: 200,
      cause: 'SEARCH_NO_STATE',
    })
    expect(reportOf(data)).toContain('riz : KO CONTRACT_CHANGED (SEARCH_NO_STATE), HTTP 200')
  })

  it('une écriture refusée porte aussi sa cause, et le panier est nettoyé', async () => {
    const parts = shop(standardShelves(ALL_WORDS), {
      before: (call) => {
        if (call === 'cart 2000000 3')
          throw new LeclercError('CONTRACT_CHANGED', 200, 'CART_NO_CART_EVENT')
      },
    })

    const data = await play(parts)

    expect(data.items[0]?.writes.at(-1)?.failure).toEqual({
      code: 'CONTRACT_CHANGED',
      http: 200,
      cause: 'CART_NO_CART_EVENT',
    })
    expect(reportOf(data)).toContain('CONTRACT_CHANGED (CART_NO_CART_EVENT)')
  })

  it('le rapport dit ce que la page montre de la connexion', async () => {
    const parts = shop(standardShelves(ALL_WORDS), {
      session: { state: 'MEMBER', signs: ['LOGOUT_LINK'] },
    })

    const data = await play(parts)

    expect(data.page?.session).toBe('connecté (signes : LOGOUT_LINK)')
    expect(reportOf(data)).toContain('Connexion : connecté (signes : LOGOUT_LINK)')
  })
})
