// @vitest-environment node
// Le protocole v1 (DRV-302) : codec base64url, validateurs écrits à la main, et conformité aux exemples.
import { describe, expect, it } from 'vitest'

import {
  decodeMessage,
  encodeMessage,
  LIMITS,
  PROTOCOL_VERSION,
  ProtocolError,
  validateCommand,
  validatePlan,
  validateResult,
  validateSelftestResult,
} from '../protocol'
import { invalidExamples, validExamples } from './protocol-examples'

function pathOf(action: () => unknown): string {
  try {
    action()
  } catch (error) {
    if (error instanceof ProtocolError) return error.path
    throw error
  }
  return '(accepté)'
}

function raw(bytes: number): string {
  // Un texte JSON de `bytes` octets exactement : des guillemets autour de lettres ASCII.
  return Buffer.from(`"${'a'.repeat(bytes - 2)}"`).toString('base64url')
}

describe('encodeMessage et decodeMessage', () => {
  it.each([
    ['du texte simple', { v: 1, name: 'farine' }],
    ['des accents', { label: 'Crème fraîche épaisse, œufs, garçon, déjà' }],
    ['des emojis', { label: 'Lait 🥛 de vache 🐄, bio 🌿 👨‍👩‍👧' }],
    ['des listes et des nombres', { lines: [1, 2.5, null, true, { a: [] }] }],
  ])('redonne le message d’origine pour %s', (_name, message) => {
    // Given / When
    const decoded = decodeMessage(encodeMessage(message))

    // Then
    expect(decoded).toEqual(message)
  })

  it('écrit du base64url sans bourrage : - et _ à la place de + et /, jamais de =', () => {
    // Given : un texte dont le base64 ordinaire (Ij4+Pj8/PyI=) contient + / et =
    const text = encodeMessage('>>>???')

    // Then
    expect(text).toBe('Ij4-Pj8_PyI')
    expect(decodeMessage(text)).toBe('>>>???')
  })

  it('accepte un message de 64 Ko exactement et refuse un octet de plus', () => {
    expect(decodeMessage(raw(LIMITS.messageBytes))).toHaveLength(LIMITS.messageBytes - 2)
    expect(pathOf(() => decodeMessage(raw(LIMITS.messageBytes + 1)))).toBe('')
    expect(() => decodeMessage(raw(LIMITS.messageBytes + 1))).toThrow(/trop volumineux/)
  })

  it('refuse un texte démesuré sans le décoder', () => {
    expect(() => decodeMessage('A'.repeat(200_000))).toThrow(/trop volumineux/)
  })

  it('refuse d’encoder plus de 64 Ko', () => {
    expect(() => encodeMessage('a'.repeat(LIMITS.messageBytes))).toThrow(ProtocolError)
  })

  it.each([
    ['un +', 'Ij4+Pj8'],
    ['un /', 'Ij4/Pj8'],
    ['un bourrage =', 'Ij4-Pj8_PyI='],
    ['une espace', 'Ij4 Pj8'],
    ['un caractère accentué', 'Ijé'],
    ['une longueur impossible (4n+1)', 'Ij4-P'],
  ])('refuse du base64url invalide : %s', (_name, text) => {
    expect(() => decodeMessage(text)).toThrow(/base64url invalide/)
  })

  it.each([
    ['du JSON invalide', Buffer.from('{pas du json').toString('base64url')],
    ['un texte vide', ''],
    ['de l’UTF-8 invalide', Buffer.from([0x22, 0xff, 0xfe, 0x22]).toString('base64url')],
  ])('refuse %s', (_name, text) => {
    expect(() => decodeMessage(text)).toThrow(ProtocolError)
    expect(pathOf(() => decodeMessage(text))).toBe('')
  })
})

describe('ProtocolError', () => {
  it('porte le code INVALID_MESSAGE, le chemin et un texte lisible', () => {
    const error = new ProtocolError('lines[2].status', 'valeur invalide')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ProtocolError')
    expect(error.code).toBe('INVALID_MESSAGE')
    expect(error.path).toBe('lines[2].status')
    expect(error.message).toBe('lines[2].status : valeur invalide')
    expect(new ProtocolError('', 'x').message).toBe('message : x')
  })
})

describe('validatePlan', () => {
  it('connaît la version du protocole', () => {
    expect(PROTOCOL_VERSION).toBe(1)
  })

  it.each(validExamples('plan'))('accepte l’exemple valide « $name »', ({ message }) => {
    expect(validatePlan(message)).toBe(message)
  })

  it.each(invalidExamples('plan'))(
    'refuse « $name » au chemin $path : $why',
    ({ message, path }) => {
      expect(pathOf(() => validatePlan(message))).toBe(path)
    },
  )

  it('compte les caractères Unicode, pas les unités UTF-16, pour les bornes de libellé', () => {
    // Given : 255 emojis (510 unités UTF-16) puis 256
    const plan = (label: string) => ({
      v: 1,
      type: 'plan',
      runId: '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c',
      retailer: 'leclerc',
      store: { id: '000000', host: 'courses-test.leclercdrive.fr' },
      returnPath: '/drive/retour',
      lines: [{ ingredientSlug: 'farine', name: label, status: 'SKIP' }],
    })

    // Then
    expect(() => validatePlan(plan('🥛'.repeat(255)))).not.toThrow()
    expect(pathOf(() => validatePlan(plan('🥛'.repeat(256))))).toBe('lines[0].name')
    expect(pathOf(() => validatePlan(plan('')))).toBe('lines[0].name')
  })

  it.each([
    ['null', null],
    ['un texte', 'plan'],
    ['un nombre', 1],
    ['une liste', []],
  ])('refuse %s à la racine', (_name, value) => {
    expect(pathOf(() => validatePlan(value))).toBe('')
  })

  it('refuse un message sans type', () => {
    expect(pathOf(() => validatePlan({ v: 1 }))).toBe('type')
  })

  it('refuse une clé __proto__ posée par JSON.parse', () => {
    // Given : JSON.parse crée une vraie propriété « __proto__ » (et non le prototype)
    const message = JSON.parse(
      '{"v":1,"type":"setup","runId":"8f14e45f-ceea-467a-9575-8e6b8c0a1b2c","retailer":"leclerc","store":{"id":"1","host":"a.leclercdrive.fr"},"returnPath":"/drive/retour","__proto__":{"x":1}}',
    ) as unknown

    expect(pathOf(() => validatePlan(message))).toBe('__proto__')
  })

  it('refuse les types de résultat', () => {
    expect(pathOf(() => validatePlan({ type: 'result' }))).toBe('type')
  })
})

describe('validateResult', () => {
  it.each(validExamples('result'))('accepte l’exemple valide « $name »', ({ message }) => {
    expect(validateResult(message)).toBe(message)
  })

  it.each(invalidExamples('result'))(
    'refuse « $name » au chemin $path : $why',
    ({ message, path }) => {
      expect(pathOf(() => validateResult(message))).toBe(path)
    },
  )

  it('refuse les types de plan', () => {
    expect(pathOf(() => validateResult({ type: 'plan' }))).toBe('type')
    expect(pathOf(() => validateResult(null))).toBe('')
  })
})

describe('validateCommand', () => {
  it.each(validExamples('command'))('accepte l’exemple valide « $name »', ({ message }) => {
    expect(validateCommand(message)).toBe(message)
  })

  it.each(invalidExamples('command'))(
    'refuse « $name » au chemin $path : $why',
    ({ message, path }) => {
      expect(pathOf(() => validateCommand(message))).toBe(path)
    },
  )

  it('ne prend pas une commande pour un plan, ni un plan pour une commande', () => {
    const command = validExamples('command')[0]?.message
    const planMessage = validExamples('plan')[0]?.message

    expect(pathOf(() => validatePlan(command))).toBe('type')
    expect(pathOf(() => validateCommand(planMessage))).not.toBe('(accepté)')
  })
})

describe('validateSelftestResult', () => {
  it.each(validExamples('selftest-result'))('accepte l’exemple valide « $name »', ({ message }) => {
    expect(validateSelftestResult(message)).toBe(message)
  })

  it.each(invalidExamples('selftest-result'))(
    'refuse « $name » au chemin $path : $why',
    ({ message, path }) => {
      expect(pathOf(() => validateSelftestResult(message))).toBe(path)
    },
  )

  it('borne le rapport à 20 000 caractères', () => {
    const message = (report: string) => ({
      v: 1,
      type: 'selftest-result',
      ok: true,
      agentVersion: '0.6.0',
      report,
    })

    expect(pathOf(() => validateSelftestResult(message('a'.repeat(LIMITS.selftestReport))))).toBe(
      '(accepté)',
    )
    expect(
      pathOf(() => validateSelftestResult(message('a'.repeat(LIMITS.selftestReport + 1)))),
    ).toBe('report')
  })

  it('ne prend pas un résultat de passage pour un rapport, ni l’inverse', () => {
    const report = validExamples('selftest-result')[0]?.message
    const result = validExamples('result')[0]?.message

    expect(pathOf(() => validateResult(report))).toBe('type')
    expect(pathOf(() => validateSelftestResult(result))).not.toBe('(accepté)')
  })
})

describe('validateResult : les compteurs d’un passage (ticket L)', () => {
  const base = {
    v: 1,
    type: 'result',
    runId: '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c',
    agentVersion: '1.0.0',
    outcome: 'completed',
    lines: [],
  }

  it('est facultatif : un résultat sans « stats » est valide, comme avant', () => {
    expect(() => validateResult(base)).not.toThrow()
  })

  it('accepte trois entiers de 0 à la borne', () => {
    const stats = { requests: LIMITS.requests, errors: 0, blocks: 7 }

    expect(validateResult({ ...base, stats })).toMatchObject({ stats })
  })

  it.each([
    ['un compteur manquant', { requests: 1, errors: 0 }, 'stats.blocks'],
    ['un compteur négatif', { requests: 1, errors: -1, blocks: 0 }, 'stats.errors'],
    ['un compteur fractionnaire', { requests: 1.5, errors: 0, blocks: 0 }, 'stats.requests'],
    [
      'un compteur au-delà de la borne',
      { requests: LIMITS.requests + 1, errors: 0, blocks: 0 },
      'stats.requests',
    ],
    ['un compteur en texte', { requests: '1', errors: 0, blocks: 0 }, 'stats.requests'],
    ['une clé inconnue', { requests: 1, errors: 0, blocks: 0, timeouts: 1 }, 'stats.timeouts'],
    ['des compteurs qui ne sont pas un objet', [1, 2, 3], 'stats'],
    ['des compteurs nuls', null, 'stats'],
  ])('refuse %s', (_name, stats, path) => {
    expect(pathOf(() => validateResult({ ...base, stats }))).toBe(path)
  })

  it('un setup-result n’en porte pas', () => {
    const setup = {
      v: 1,
      type: 'setup-result',
      runId: base.runId,
      agentVersion: '1.0.0',
      store: {
        id: '000000',
        host: 'courses-test.leclercdrive.fr',
        baseUrl: 'https://courses-test.leclercdrive.fr/magasin-000000-000000',
        label: null,
      },
    }

    expect(
      pathOf(() => validateResult({ ...setup, stats: { requests: 0, errors: 0, blocks: 0 } })),
    ).toBe('stats')
  })
})

describe('les rayons du produit (DRV-642) : des ajouts facultatifs du protocole v1', () => {
  const head = {
    v: 1,
    type: 'plan',
    runId: '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c',
    retailer: 'leclerc',
    store: { id: '000000', host: 'courses-test.leclercdrive.fr' },
    returnPath: '/drive/retour',
  }
  const plan = (line: object) => ({
    ...head,
    lines: [{ ingredientSlug: 'tomate', name: 'Tomate', status: 'NEW', ...line }],
  })
  const result = (product: object) => ({
    v: 1,
    type: 'result',
    runId: head.runId,
    agentVersion: '1.0.0',
    outcome: 'completed',
    lines: [
      {
        ingredientSlug: 'tomate',
        outcome: 'CHOSEN',
        quantity: 1,
        placement: 'PRIMARY',
        product: { id: '555111', label: 'Tomates de test', ...product },
      },
    ],
  })

  it('les bornes du module sont celles du contrat : 3 rayons, des entiers de 1 à 2147483647', () => {
    expect(LIMITS.rayonHints).toBe(3)
    expect(LIMITS.catalogId).toBe(2_147_483_647)
  })

  it('un plan sans « rayonHints » reste valide et repart octet pour octet', () => {
    // Given : un message d'avant, sans la clé
    const before = encodeMessage(plan({ products: [], rejected: [], searchQuery: 'tomate' }))

    // When
    const after = encodeMessage(validatePlan(decodeMessage(before)))

    // Then
    expect(after).toBe(before)
    expect(before).not.toMatch(/^$/)
    expect(JSON.stringify(decodeMessage(before))).not.toContain('rayonHints')
  })

  it('un résultat sans « rayonId » ni « familyId » reste valide et repart octet pour octet', () => {
    const before = encodeMessage(result({ content: { value: 500, unit: 'g' } }))

    expect(encodeMessage(validateResult(decodeMessage(before)))).toBe(before)
    expect(JSON.stringify(decodeMessage(before))).not.toMatch(/rayonId|familyId/)
  })

  it.each([[[]], [[1]], [[41, 12, 60]], [[1, 2_147_483_647]]])(
    'accepte les rayons %j',
    (rayonHints) => {
      expect(validatePlan(plan({ rayonHints }))).toBeTruthy()
    },
  )

  it.each([
    ['quatre rayons', [1, 2, 3, 4], 'lines[0].rayonHints'],
    ['un rayon à zéro', [0], 'lines[0].rayonHints[0]'],
    ['un rayon négatif', [5, -1], 'lines[0].rayonHints[1]'],
    ['un rayon fractionnaire', [1.5], 'lines[0].rayonHints[0]'],
    ['un rayon trop grand', [2_147_483_648], 'lines[0].rayonHints[0]'],
    ['un rayon en texte', ['41'], 'lines[0].rayonHints[0]'],
    ['un rayon nul', [null], 'lines[0].rayonHints[0]'],
    ['un nombre seul', 41, 'lines[0].rayonHints'],
    ['un objet', { 0: 41 }, 'lines[0].rayonHints'],
    ['null', null, 'lines[0].rayonHints'],
  ])('refuse %s', (_name, rayonHints, path) => {
    expect(pathOf(() => validatePlan(plan({ rayonHints })))).toBe(path)
  })

  it('accepte le rayon et la famille du seul produit choisi', () => {
    expect(validateResult(result({ rayonId: 41, familyId: 410 }))).toBeTruthy()
    expect(validateResult(result({ rayonId: 41 }))).toBeTruthy()
    expect(validateResult(result({ familyId: 410 }))).toBeTruthy()
  })

  it.each([
    ['un rayon à zéro', { rayonId: 0 }, 'lines[0].product.rayonId'],
    ['un rayon fractionnaire', { rayonId: 1.5 }, 'lines[0].product.rayonId'],
    ['une famille négative', { familyId: -4 }, 'lines[0].product.familyId'],
    ['une famille trop grande', { familyId: 2_147_483_648 }, 'lines[0].product.familyId'],
    ['un rayon en texte', { rayonId: '41' }, 'lines[0].product.rayonId'],
    ['une famille nulle', { familyId: null }, 'lines[0].product.familyId'],
  ])('refuse %s', (_name, product, path) => {
    expect(pathOf(() => validateResult(result(product)))).toBe(path)
  })
})

describe('la recherche mémorisée du produit choisi (DRV-650) : un ajout facultatif du protocole v1', () => {
  const result = (extra: object, outcome: 'CHOSEN' | 'ADDED' = 'CHOSEN') => ({
    v: 1,
    type: 'result',
    runId: '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c',
    agentVersion: '1.0.0',
    outcome: 'completed',
    lines: [
      outcome === 'CHOSEN'
        ? {
            ingredientSlug: 'cereale',
            outcome,
            quantity: 1,
            placement: 'PRIMARY',
            product: { id: '555101', label: 'Céréales coussins de test' },
            ...extra,
          }
        : {
            ingredientSlug: 'cereale',
            outcome,
            productId: '555101',
            quantity: 1,
            usedRank: 1,
            ...extra,
          },
    ],
  })

  it('les bornes du module sont celles du back : 2 à 80 points de code', () => {
    expect(LIMITS.searchQueryMin).toBe(2)
    expect(LIMITS.searchQueryMax).toBe(80)
  })

  it('un résultat sans « searchQuery » reste valide et repart octet pour octet', () => {
    const before = encodeMessage(result({}))

    expect(encodeMessage(validateResult(decodeMessage(before)))).toBe(before)
    expect(JSON.stringify(decodeMessage(before))).not.toContain('searchQuery')
  })

  it.each([
    ['deux caractères', 'ab'],
    ['une recherche courante', 'céréales coussins'],
    ['80 caractères', 'x'.repeat(80)],
    ['80 points de code dont des emojis (plus de 80 unités UTF-16)', '🥚'.repeat(80)],
  ])('accepte %s', (_name, searchQuery) => {
    expect(validateResult(result({ searchQuery }))).toBeTruthy()
  })

  it.each([
    ['vide', ''],
    ['un caractère', 'a'],
    ['un emoji seul', '🥚'],
    ['81 caractères', 'x'.repeat(81)],
    ['81 emojis', '🥚'.repeat(81)],
    ['null (il effacerait la recherche mémorisée : l’agent n’envoie rien)', null],
    ['un nombre', 42],
    ['une liste', ['ab']],
    ['un objet', { a: 'ab' }],
  ])('refuse %s', (_name, searchQuery) => {
    expect(pathOf(() => validateResult(result({ searchQuery })))).toBe('lines[0].searchQuery')
  })

  it('refuse la clé sur une autre issue qu’un choix', () => {
    expect(pathOf(() => validateResult(result({ searchQuery: 'ab' }, 'ADDED')))).toBe(
      'lines[0].searchQuery',
    )
  })
})

describe('« notInCart » d’un produit choisi que le panier n’a pas pris (DRV-742) : un ajout facultatif du protocole v1', () => {
  const result = (line: object) => ({
    v: 1,
    type: 'result',
    runId: '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c',
    agentVersion: '1.0.0',
    outcome: 'completed',
    lines: [line],
  })
  const chosen = (extra: object) => ({
    ingredientSlug: 'cereale',
    outcome: 'CHOSEN',
    quantity: 1,
    placement: 'PRIMARY',
    product: { id: '555101', label: 'Céréales coussins de test' },
    ...extra,
  })

  it('un résultat sans la clé (un agent d’avant) reste valide et repart octet pour octet', () => {
    const before = encodeMessage(result(chosen({})))

    expect(encodeMessage(validateResult(decodeMessage(before)))).toBe(before)
    expect(JSON.stringify(decodeMessage(before))).not.toContain('notInCart')
  })

  it('accepte « true » sur un choix, seul ou avec une recherche', () => {
    expect(validateResult(result(chosen({ notInCart: true })))).toBeTruthy()
    expect(validateResult(result(chosen({ notInCart: true, searchQuery: 'ab' })))).toBeTruthy()
  })

  it.each([
    ['false (l’absence dit « au panier »)', false],
    ['le texte « true »', 'true'],
    ['le nombre 1', 1],
    ['null', null],
    ['une liste', [true]],
    ['un objet', { a: true }],
  ])('refuse %s', (_name, notInCart) => {
    expect(pathOf(() => validateResult(result(chosen({ notInCart }))))).toBe('lines[0].notInCart')
  })

  it.each([
    [
      'ADDED',
      {
        ingredientSlug: 'cereale',
        outcome: 'ADDED',
        productId: '555101',
        quantity: 1,
        usedRank: 1,
      },
    ],
    ['SKIPPED', { ingredientSlug: 'cereale', outcome: 'SKIPPED' }],
    ['HAVE_AT_HOME', { ingredientSlug: 'cereale', outcome: 'HAVE_AT_HOME' }],
    ['UNAVAILABLE', { ingredientSlug: 'cereale', outcome: 'UNAVAILABLE' }],
  ])('refuse la clé sur une ligne %s (seul un choix peut ne pas être au panier)', (_name, line) => {
    expect(pathOf(() => validateResult(result({ ...line, notInCart: true })))).toBe(
      'lines[0].notInCart',
    )
  })
})
