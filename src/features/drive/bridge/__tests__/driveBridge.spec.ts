import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanMessage } from '@drive-protocol'

import {
  createDriveBridge,
  DRAFT_KEY,
  DRAFT_TTL_MS,
  driveBridge,
  DriveBridgeError,
  type DriveBridgeErrorCode,
  type DriveEvent,
} from '..'
import { fakeNative } from './fakeNative'

// Données SYNTHÉTIQUES : magasin et produits de test, jamais un vrai identifiant.
const RUN = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'
const OTHER_RUN = '0b6d1a3e-7c1f-4a55-9a8e-2f4d9c3b7e10'

const plan = (runId = RUN, lines: PlanMessage['lines'] = [farine()]): PlanMessage => ({
  v: 1,
  type: 'plan',
  runId,
  retailer: 'leclerc',
  store: { id: '123456', host: 'ville-test.leclercdrive.fr' },
  returnPath: '/drive/retour',
  lines,
})

const farine = (): PlanMessage['lines'][number] => ({
  ingredientSlug: 'farine',
  name: 'Farine',
  status: 'KNOWN',
  products: [
    { id: '111', label: 'Farine de test 1 kg', content: { value: 1000, unit: 'g' }, packs: 1 },
    { id: '222', label: 'Farine de test T45 1 kg', packs: 2, packsStatus: 'COMPUTED' },
  ],
  rejected: [{ id: '333', label: 'Farine refusée' }],
  searchQuery: 'farine',
})

const result = (runId = RUN) => ({
  v: 1,
  type: 'result',
  runId,
  agentVersion: '1.0.0',
  outcome: 'completed',
  store: { id: '123456' },
  lines: [
    { ingredientSlug: 'farine', outcome: 'ADDED', productId: '111', quantity: 1, usedRank: 1 },
  ],
})

const driveResult = (runId = RUN) => ({ v: 1, type: 'drive.result', result: result(runId) })

const NOW = new Date('2026-10-18T10:00:00.000Z')

// Les lignes du plan d'essai (farine, connue, deux produits acceptés), telles que le brouillon les garde
const SENT_LINES = [{ ingredientSlug: 'farine', status: 'KNOWN', products: ['111', '222'] }]

const line = (extra: Record<string, unknown> = {}) => ({
  ingredientSlug: 'farine',
  status: 'KNOWN',
  products: ['111'],
  ...extra,
})
const withLines = (lines: unknown) =>
  JSON.stringify({ runId: RUN, listId: 'l1', startedAt: NOW.toISOString(), lines })

const codeOf = (action: () => unknown): DriveBridgeErrorCode | undefined => {
  try {
    action()
  } catch (error) {
    return (error as DriveBridgeError).code
  }
  return undefined
}

describe('driveBridge', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.useRealTimers())

  const setup = (onMessage?: Parameters<typeof fakeNative>[0], now = NOW) => {
    const native = fakeNative(onMessage)
    let clock = now
    const bridge = createDriveBridge({ window: native.window, now: () => clock })
    const events: DriveEvent[] = []
    return {
      ...native,
      bridge,
      events,
      listen: () => bridge.onEvent((event) => events.push(event)),
      at: (date: Date) => (clock = date),
    }
  }

  describe('présence du pont', () => {
    it('est absent dans un navigateur ordinaire', () => {
      const bridge = createDriveBridge({ window: {} })

      expect(bridge.isAvailable()).toBe(false)
      expect(codeOf(() => bridge.cancel())).toBe('UNAVAILABLE')
      expect(codeOf(() => bridge.startRun(plan(), 'l1'))).toBe('UNAVAILABLE')
      expect(codeOf(() => void bridge.info())).toBe('UNAVAILABLE')
    })

    it.each([
      ['pas un objet', 'repasNative'],
      ['sans postMessage', { addEventListener: () => undefined }],
      ['sans addEventListener', { postMessage: () => undefined }],
    ])('refuse un objet qui n’a pas la forme d’un pont (%s)', (_name, repasNative) => {
      expect(createDriveBridge({ window: { repasNative } }).isAvailable()).toBe(false)
    })

    it('est présent quand l’application expose repasNative', () => {
      expect(setup().bridge.isAvailable()).toBe(true)
    })

    it('le pont de la page cherche repasNative sur window à chaque appel', () => {
      expect(driveBridge.isAvailable()).toBe(false)

      const native = fakeNative()
      Object.defineProperty(window, 'repasNative', { value: native.bridge, configurable: true })
      expect(driveBridge.isAvailable()).toBe(true)
      Reflect.deleteProperty(window, 'repasNative')
      expect(driveBridge.isAvailable()).toBe(false)
    })
  })

  describe('info', () => {
    it('demande app.info et rend la version et l’état du drive', async () => {
      const { bridge, sent } = setup((message, reply) => {
        if (message.type === 'app.info')
          reply({ v: 1, type: 'app.info', version: '0.5.0', versionCode: 5, drive: true })
      })

      await expect(bridge.info()).resolves.toEqual({
        version: '0.5.0',
        versionCode: 5,
        drive: true,
      })
      expect(sent).toEqual([{ v: 1, type: 'app.info' }])
    })

    it('une demande déjà en cours sert à tous ceux qui attendent', async () => {
      const { bridge, sent, reply } = setup()

      const first = bridge.info()
      const second = bridge.info()
      reply({ v: 1, type: 'app.info', version: '0.5.0', versionCode: 5, drive: false })

      expect(await first).toEqual(await second)
      expect(sent).toHaveLength(1)
      // Une fois répondue, la demande suivante repart
      const third = bridge.info()
      reply({ v: 1, type: 'app.info', version: '0.5.0', versionCode: 5, drive: false })
      await third
      expect(sent).toHaveLength(2)
    })

    it('dit le refus de l’application avec son code', async () => {
      const { bridge } = setup((_message, reply) =>
        reply({ v: 1, type: 'error', code: 'UNKNOWN_TYPE' }),
      )

      await expect(bridge.info()).rejects.toMatchObject({ code: 'REFUSED', detail: 'UNKNOWN_TYPE' })
    })

    it.each([
      ['version', { version: '', versionCode: 5, drive: true }],
      ['versionCode', { version: '0.5.0', versionCode: '5', drive: true }],
      ['versionCode', { version: '0.5.0', versionCode: -1, drive: true }],
      ['drive', { version: '0.5.0', versionCode: 5, drive: 'oui' }],
    ])('refuse une réponse mal formée (%s)', async (field, body) => {
      const { bridge } = setup((_message, reply) => reply({ v: 1, type: 'app.info', ...body }))

      await expect(bridge.info()).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
        detail: field,
      })
    })

    it('abandonne sans réponse de l’application', async () => {
      vi.useFakeTimers()
      const { bridge } = setup()

      const answer = bridge.info()
      const failure = answer.catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(3000)

      expect(await failure).toMatchObject({ code: 'TIMEOUT' })
    })

    it('dit quand le pont refuse l’envoi', async () => {
      const native = fakeNative()
      vi.mocked(native.bridge.postMessage).mockImplementation(() => {
        throw new Error('boom')
      })
      const bridge = createDriveBridge({ window: native.window })

      await expect(bridge.info()).rejects.toMatchObject({ code: 'SEND_FAILED' })
    })
  })

  describe('startRun', () => {
    it('valide le plan, garde le brouillon puis envoie drive.start', () => {
      const { bridge, sent } = setup()

      const draft = bridge.startRun(plan(), 'l1')

      expect(draft).toEqual({
        runId: RUN,
        listId: 'l1',
        startedAt: NOW.toISOString(),
        lines: SENT_LINES,
      })
      expect(sent).toEqual([{ v: 1, type: 'drive.start', plan: plan() }])
      expect(bridge.loadDraft()).toEqual(draft)
    })

    it('garde l’ordre des produits de chaque ligne tel quel', () => {
      const { bridge, sent } = setup()

      bridge.startRun(plan(), 'l1')

      const line = sent[0]?.plan?.lines[0]
      expect(line?.products?.map((product) => product.id)).toEqual(['111', '222'])
      expect(line?.rejected).toEqual([{ id: '333', label: 'Farine refusée' }])
    })

    it('refuse un plan qui ne respecte pas le protocole, sans rien envoyer ni garder', () => {
      const { bridge, sent } = setup()
      const broken = { ...plan(), runId: 'pas-un-uuid' }

      let error: unknown
      try {
        bridge.startRun(broken, 'l1')
      } catch (caught) {
        error = caught
      }

      expect(error).toMatchObject({ code: 'INVALID_PLAN', detail: 'runId' })
      expect(sent).toEqual([])
      expect(bridge.loadDraft()).toBeNull()
    })

    it('refuse un message setup : startRun ne lance que des passages', () => {
      const { bridge } = setup()
      const { lines: _lines, ...setupMessage } = plan()

      expect(codeOf(() => bridge.startRun({ ...setupMessage, type: 'setup' } as never, 'l1'))).toBe(
        'INVALID_PLAN',
      )
    })

    it('refuse un plan de plus de 64 Ko et n’en garde aucune trace', () => {
      const { bridge, sent } = setup()
      const heavy = Array.from({ length: 100 }, (_unused, index) => ({
        ...farine(),
        ingredientSlug: `ingredient-${index}`,
        name: 'é'.repeat(255),
        searchQuery: 'é'.repeat(255),
      }))

      expect(codeOf(() => bridge.startRun(plan(RUN, heavy), 'l1'))).toBe('TOO_LARGE')
      expect(sent).toEqual([])
      expect(bridge.loadDraft()).toBeNull()
    })

    it('n’accepte qu’un passage à la fois', () => {
      const { bridge, sent } = setup()
      bridge.startRun(plan(), 'l1')

      expect(codeOf(() => bridge.startRun(plan(OTHER_RUN), 'l2'))).toBe('RUN_IN_PROGRESS')

      expect(sent).toHaveLength(1)
      expect(bridge.loadDraft()?.runId).toBe(RUN)
    })

    it('reprend le même passage en gardant sa date de départ', () => {
      const { bridge, sent, at } = setup()
      bridge.startRun(plan(), 'l1')
      at(new Date(NOW.getTime() + 60_000))

      const draft = bridge.startRun(plan(), 'l1')

      expect(draft.startedAt).toBe(NOW.toISOString())
      expect(sent).toHaveLength(2)
    })

    it('un passage expiré (24 h) ne bloque plus', () => {
      const { bridge, at } = setup()
      bridge.startRun(plan(), 'l1')
      at(new Date(NOW.getTime() + DRAFT_TTL_MS + 1))

      expect(bridge.startRun(plan(OTHER_RUN), 'l2').runId).toBe(OTHER_RUN)
    })

    it('si le pont refuse l’envoi, le nouveau brouillon est retiré', () => {
      const native = fakeNative()
      vi.mocked(native.bridge.postMessage).mockImplementation(() => {
        throw new Error('boom')
      })
      const bridge = createDriveBridge({ window: native.window })

      expect(codeOf(() => bridge.startRun(plan(), 'l1'))).toBe('SEND_FAILED')

      expect(bridge.loadDraft()).toBeNull()
    })
  })

  it('cancel envoie drive.cancel', () => {
    const { bridge, sent } = setup()

    bridge.cancel()

    expect(sent).toEqual([{ v: 1, type: 'drive.cancel' }])
  })

  describe('ce que l’application renvoie', () => {
    it('rattache le résultat au passage en cours, avec sa liste', () => {
      const { bridge, events, listen, reply } = setup()
      listen()
      bridge.startRun(plan(), 'l1')

      reply(driveResult())

      expect(events).toEqual([
        {
          kind: 'result',
          result: result(),
          draft: { runId: RUN, listId: 'l1', startedAt: NOW.toISOString(), lines: SENT_LINES },
        },
      ])
      expect(bridge.matchesDraft(result())).toBe(true)
      // Le brouillon reste jusqu’à ce que l’écran l’efface
      expect(bridge.loadDraft()).not.toBeNull()
    })

    it('met de côté le résultat d’un autre passage ou sans passage en cours (périmé)', () => {
      const { bridge, events, listen, reply } = setup()
      listen()

      reply(driveResult())
      bridge.startRun(plan(), 'l1')
      reply(driveResult(OTHER_RUN))

      expect(events.map((event) => event.kind)).toEqual(['stale', 'stale'])
      expect(bridge.matchesDraft(result(OTHER_RUN))).toBe(false)
    })

    it('reconnaît aussi la lecture du magasin', () => {
      const { bridge, events, listen, reply } = setup()
      listen()
      bridge.startRun(plan(), 'l1')
      const setupResult = {
        v: 1,
        type: 'setup-result',
        runId: RUN,
        agentVersion: '1.0.0',
        store: {
          id: '123456',
          host: 'ville-test.leclercdrive.fr',
          baseUrl: 'https://ville-test.leclercdrive.fr/magasin-123456-123456',
          label: 'Ville-Test',
        },
      }

      reply({ v: 1, type: 'drive.result', result: setupResult })

      expect(events[0]).toMatchObject({ kind: 'result', result: setupResult })
    })

    it('signale un résultat invalide sans le recopier', () => {
      const { events, listen, reply } = setup()
      listen()

      reply({ v: 1, type: 'drive.result', result: { ...result(), outcome: 'peut-etre' } })
      reply({ v: 1, type: 'drive.result' })

      expect(events).toEqual([
        { kind: 'invalid', detail: 'outcome' },
        { kind: 'invalid', detail: '' },
      ])
    })

    it('annonce un refus de l’application, avec le passage concerné', () => {
      const { events, listen, reply } = setup()
      listen()

      reply({ v: 1, type: 'drive.error', code: 'UNAVAILABLE', runId: RUN })
      reply({ v: 1, type: 'drive.error', code: 'BUSY' })
      reply({ v: 1, type: 'drive.error', code: 'minuscules' })
      reply({ v: 1, type: 'drive.error', code: 'BUSY', runId: 'x' })

      expect(events).toEqual([
        { kind: 'refused', code: 'UNAVAILABLE', runId: RUN },
        { kind: 'refused', code: 'BUSY', runId: null },
        { kind: 'invalid', detail: 'code' },
        { kind: 'invalid', detail: 'runId' },
      ])
    })

    it.each([
      ['du texte qui n’est pas du JSON', 'bonjour'],
      ['autre chose que du texte', { v: 1, type: 'drive.result', result: result() }],
      ['une autre version du protocole', JSON.stringify({ v: 2, type: 'drive.result' })],
      ['un type inconnu', JSON.stringify({ v: 1, type: 'autre' })],
      ['un tableau', '[1]'],
      ['plus de 64 Ko', JSON.stringify({ v: 1, type: 'drive.result', filler: 'a'.repeat(70_000) })],
    ])('ignore %s', (_name, data) => {
      const { events, listen, emit, bridge } = setup()
      listen()
      bridge.startRun(plan(), 'l1')

      emit(data)

      expect(events).toEqual([])
    })

    it('garde les événements arrivés sans écran, pour le premier qui écoute', () => {
      const { bridge, events, reply, sent, listenerCount } = setup()
      bridge.listen()
      bridge.listen()
      expect(listenerCount()).toBe(1)
      bridge.startRun(plan(), 'l1')
      reply({ v: 1, type: 'drive.error', code: 'BUSY' })
      reply(driveResult())
      reply({ v: 1, type: 'drive.result', result: { nope: true } })

      bridge.onEvent((event) => events.push(event))

      // L'événement mal formé n'est pas rejoué : seul ce qui reste utile à un écran l'est
      expect(events.map((event) => event.kind)).toEqual(['refused', 'result'])
      expect(sent).toHaveLength(1)
    })

    it('rejoue au plus les 20 derniers événements', () => {
      const { bridge, events, reply } = setup()
      bridge.listen()
      for (let index = 0; index < 25; index++)
        reply({ v: 1, type: 'drive.error', code: `CODE_${index}` })

      bridge.onEvent((event) => events.push(event))

      expect(events).toHaveLength(20)
      expect(events[0]).toMatchObject({ code: 'CODE_5' })
    })

    it('arrête d’écouter à la demande, et n’écoute le pont qu’une fois', () => {
      const { bridge, events, reply, listenerCount } = setup()
      const stop = bridge.onEvent((event) => events.push(event))
      bridge.onEvent(() => undefined)
      bridge.cancel()
      void bridge.info().catch(() => undefined)

      expect(listenerCount()).toBe(1)
      stop()
      reply({ v: 1, type: 'drive.error', code: 'BUSY' })

      expect(events).toEqual([])
    })
  })

  describe('brouillon de passage', () => {
    it('survit au rechargement de la page', () => {
      const first = setup()
      first.bridge.startRun(plan(), 'l1')

      const reloaded = createDriveBridge({ window: first.window, now: () => NOW })

      const expected = { runId: RUN, listId: 'l1', startedAt: NOW.toISOString(), lines: SENT_LINES }
      expect(reloaded.loadDraft()).toEqual(expected)
      expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '')).toEqual(expected)
    })

    it('rattache après un rechargement le résultat qui arrive', () => {
      const first = setup()
      first.bridge.startRun(plan(), 'l1')
      const reloaded = setup()
      reloaded.listen()

      reloaded.reply(driveResult())

      expect(reloaded.events[0]).toMatchObject({ kind: 'result', draft: { listId: 'l1' } })
    })

    it('expire après 24 h et disparaît du stockage', () => {
      const { bridge, at } = setup()
      bridge.startRun(plan(), 'l1')

      at(new Date(NOW.getTime() + DRAFT_TTL_MS))
      expect(bridge.loadDraft()).not.toBeNull()
      at(new Date(NOW.getTime() + DRAFT_TTL_MS + 1))

      expect(bridge.loadDraft()).toBeNull()
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
      expect(bridge.matchesDraft(result())).toBe(false)
    })

    it('s’efface à la demande', () => {
      const { bridge } = setup()
      bridge.startRun(plan(), 'l1')

      bridge.clearDraft()

      expect(bridge.loadDraft()).toBeNull()
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    })

    it('garde les lignes du plan telles qu’envoyées : une ligne remplacée y est « à choisir »', () => {
      const { bridge } = setup()
      const lines: PlanMessage['lines'] = [
        farine(),
        { ingredientSlug: 'poivre', name: 'Poivre', status: 'NEW', products: [] },
        {
          ingredientSlug: 'beurre',
          name: 'Beurre',
          status: 'NEW',
          replaces: { id: '444', label: 'Beurre de test' },
        },
        { ingredientSlug: 'sel', name: 'Sel', status: 'HAVE_AT_HOME' },
        { ingredientSlug: 'riz', name: 'Riz', status: 'SKIP' },
      ]

      const draft = bridge.startRun(plan(RUN, lines), 'l1')

      expect(draft.lines).toEqual([
        ...SENT_LINES,
        { ingredientSlug: 'poivre', status: 'NEW', products: [] },
        { ingredientSlug: 'beurre', status: 'NEW', products: [] },
        { ingredientSlug: 'sel', status: 'HAVE_AT_HOME', products: [] },
        { ingredientSlug: 'riz', status: 'SKIP', products: [] },
      ])
    })

    it('garde le slug de l’unité de la ligne quand le plan le portait (DRV-652), et le relit', () => {
      const { bridge } = setup()
      const lines: PlanMessage['lines'] = [
        {
          ...farine(),
          needed: { quantity: 15, unitSymbol: 'tranche', unitSlug: 'tranche', unitName: 'tranche' },
        },
        { ingredientSlug: 'poivre', name: 'Poivre', status: 'NEW', products: [] },
      ]

      const draft = bridge.startRun(plan(RUN, lines), 'l1')

      expect(draft.lines).toEqual([
        {
          ingredientSlug: 'farine',
          status: 'KNOWN',
          products: ['111', '222'],
          unitSlug: 'tranche',
        },
        { ingredientSlug: 'poivre', status: 'NEW', products: [] },
      ])
      expect(bridge.loadDraft()).toEqual(draft)
    })

    it('refuse un brouillon dont le slug d’unité est mal formé', () => {
      const { bridge } = setup()
      const bad = {
        runId: RUN,
        listId: 'l1',
        startedAt: NOW.toISOString(),
        lines: [{ ingredientSlug: 'farine', status: 'KNOWN', products: [], unitSlug: 'Tranche' }],
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(bad))

      expect(bridge.loadDraft()).toBeNull()
    })

    it('relit un brouillon sans lignes, écrit par une version plus ancienne', () => {
      const { bridge } = setup()
      const old = { runId: RUN, listId: 'l1', startedAt: NOW.toISOString() }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(old))

      expect(bridge.loadDraft()).toEqual(old)
    })

    it.each([
      ['du texte qui n’est pas du JSON', 'pas json'],
      ['une liste', '[]'],
      [
        'une clé en trop',
        JSON.stringify({ runId: RUN, listId: 'l1', startedAt: NOW.toISOString(), extra: 1 }),
      ],
      ['une clé en moins', JSON.stringify({ runId: RUN, startedAt: NOW.toISOString() })],
      [
        'un runId qui n’est pas un UUID',
        JSON.stringify({ runId: 'abc', listId: 'l1', startedAt: NOW.toISOString() }),
      ],
      ['une liste vide', JSON.stringify({ runId: RUN, listId: '', startedAt: NOW.toISOString() })],
      [
        'un identifiant de liste trop long',
        JSON.stringify({ runId: RUN, listId: 'x'.repeat(101), startedAt: NOW.toISOString() }),
      ],
      ['une date illisible', JSON.stringify({ runId: RUN, listId: 'l1', startedAt: 'hier' })],
      ['des lignes qui ne sont pas une liste', withLines({})],
      [
        'plus de 100 lignes',
        withLines(Array.from({ length: 101 }, (_, i) => line({ ingredientSlug: 'a' + i }))),
      ],
      ['une ligne qui n’est pas un objet', withLines(['farine'])],
      ['une ligne avec une clé en trop', withLines([line({ name: 'Farine' })])],
      ['une ligne sans produits', withLines([{ ingredientSlug: 'farine', status: 'KNOWN' }])],
      ['un slug invalide', withLines([line({ ingredientSlug: 'Farine !' })])],
      ['deux lignes du même ingrédient', withLines([line(), line()])],
      ['un statut inconnu', withLines([line({ status: 'DONE' })])],
      ['plus de 5 produits', withLines([line({ products: ['1', '2', '3', '4', '5', '6'] })])],
      [
        'un identifiant de produit qui n’est pas en chiffres',
        withLines([line({ products: ['abc'] })]),
      ],
      [
        'une date dans le futur',
        JSON.stringify({ runId: RUN, listId: 'l1', startedAt: '2026-10-19T10:00:00.000Z' }),
      ],
    ])('ignore et efface un brouillon qui a %s', (_name, raw) => {
      const { bridge } = setup()
      localStorage.setItem(DRAFT_KEY, raw)

      expect(bridge.loadDraft()).toBeNull()
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    })

    it('reste en mémoire de la page quand le stockage est refusé', () => {
      const native = fakeNative()
      const refusing = {
        ...native.window,
        get localStorage(): Storage {
          throw new Error('stockage refusé')
        },
      }
      const bridge = createDriveBridge({ window: refusing, now: () => NOW })

      bridge.startRun(plan(), 'l1')

      expect(bridge.loadDraft()?.runId).toBe(RUN)
      bridge.clearDraft()
      expect(bridge.loadDraft()).toBeNull()
    })

    it('reste en mémoire de la page quand le stockage est plein', () => {
      const native = fakeNative()
      const full = {
        getItem: () => null,
        removeItem: () => undefined,
        setItem: () => {
          throw new Error('quota')
        },
      } as unknown as Storage
      const bridge = createDriveBridge({
        window: { ...native.window, localStorage: full },
        now: () => NOW,
      })

      bridge.startRun(plan(), 'l1')

      expect(bridge.loadDraft()?.listId).toBe('l1')
    })
  })

  describe('startSetup : lire le magasin dans l’application (DRV-320)', () => {
    const STORE = {
      id: '123456',
      host: 'ville-test.leclercdrive.fr',
      baseUrl: 'https://ville-test.leclercdrive.fr/magasin-123456-123456',
      label: null,
    }
    const setupResult = (runId: string) => ({
      v: 1,
      type: 'drive.result',
      result: { v: 1, type: 'setup-result', runId, agentVersion: '1.0.0', store: STORE },
    })
    const plainResult = (runId: string, outcome: string, error?: string) => ({
      v: 1,
      type: 'drive.result',
      result: {
        v: 1,
        type: 'result',
        runId,
        agentVersion: '1.0.0',
        outcome,
        ...(error && { error: { code: error, message: 'Texte' } }),
        lines: [],
      },
    })
    /** Le faux pont répond à `drive.setup` en suivant `answer`. */
    const reading = (answer: (runId: string, reply: (message: unknown) => void) => void) =>
      setup((message, reply) => {
        if (message.type === 'drive.setup') answer(message.runId ?? '', reply)
      })
    const rejection = async (promise: Promise<unknown>) => {
      try {
        await promise
      } catch (error) {
        return error as DriveBridgeError
      }
      throw new Error('aurait dû être refusé')
    }

    it('envoie drive.setup avec un identifiant de passage, et rend le magasin lu', async () => {
      const { bridge, sent } = reading((runId, reply) => reply(setupResult(runId)))

      await expect(bridge.startSetup()).resolves.toEqual(STORE)

      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({ v: 1, type: 'drive.setup' })
      expect(sent[0]?.runId).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
      expect(Object.keys(sent[0] ?? {}).sort()).toEqual(['runId', 'type', 'v'])
    })

    it('nomme le drive dont on lit le magasin (DRV-709), et refuse la lecture d’un autre drive tant qu’une est en cours', async () => {
      const { bridge, sent, reply } = reading(() => undefined)

      const first = bridge.startSetup('exemple')
      const refused = await rejection(bridge.startSetup('autre'))

      expect(refused).toMatchObject({ code: 'REFUSED', detail: 'BUSY' })
      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({ v: 1, type: 'drive.setup', retailer: 'exemple' })
      // Le même drive rouvre la lecture en cours, sans la doubler
      expect(bridge.startSetup('exemple')).toBe(first)
      reply(setupResult(sent[0]?.runId ?? ''))
      await expect(first).resolves.toEqual(STORE)
    })

    it('le résultat n’est pas montré aux écrans du retour, et ne touche pas au brouillon d’un envoi', async () => {
      const { bridge, listen, events } = reading((runId, reply) => reply(setupResult(runId)))
      listen()
      bridge.startRun(plan(), 'l1')

      await bridge.startSetup()

      expect(events).toEqual([])
      expect(bridge.loadDraft()?.runId).toBe(RUN)
    })

    it('attend la réponse : rien n’est rendu tant que l’application ne revient pas', async () => {
      const { bridge, sent, reply } = setup()
      const settled = vi.fn<(value: unknown) => void>()

      void bridge.startSetup().then(settled, settled)
      await Promise.resolve()
      expect(settled).not.toHaveBeenCalled()

      reply(setupResult(sent[0]?.runId ?? ''))
      await vi.waitFor(() => expect(settled).toHaveBeenCalledWith(STORE))
    })

    it('un résultat d’un autre passage ne termine pas la lecture', async () => {
      const { bridge, sent, reply } = setup()
      const settled = vi.fn<(value: unknown) => void>()
      void bridge.startSetup().then(settled, settled)

      reply(setupResult(OTHER_RUN))
      await Promise.resolve()
      expect(settled).not.toHaveBeenCalled()

      reply(setupResult(sent[0]?.runId ?? ''))
      await vi.waitFor(() => expect(settled).toHaveBeenCalledWith(STORE))
    })

    it('une lecture déjà en cours est rouverte avec le même identifiant, pas doublée', async () => {
      const { bridge, sent, reply } = setup()

      const first = bridge.startSetup()
      const second = bridge.startSetup()

      expect(second).toBe(first)
      expect(sent).toHaveLength(2)
      expect(sent[1]?.runId).toBe(sent[0]?.runId)
      reply(setupResult(sent[0]?.runId ?? ''))
      expect(await first).toEqual(STORE)
    })

    it('une nouvelle lecture, après la fin de la précédente, a un nouvel identifiant', async () => {
      const { bridge, sent } = reading((runId, reply) => reply(setupResult(runId)))

      await bridge.startSetup()
      await bridge.startSetup()

      expect(sent[1]?.runId).not.toBe(sent[0]?.runId)
    })

    it('un abandon (résultat aborted) rejette avec CANCELLED', async () => {
      const { bridge } = reading((runId, reply) =>
        reply(plainResult(runId, 'aborted', 'CANCELLED')),
      )

      expect(await rejection(bridge.startSetup())).toMatchObject({ code: 'CANCELLED' })
    })

    it('une erreur de l’agent rejette avec SETUP_FAILED et son code', async () => {
      const { bridge } = reading((runId, reply) =>
        reply(plainResult(runId, 'error', 'UNSUPPORTED_PAGE')),
      )

      expect(await rejection(bridge.startSetup())).toMatchObject({
        code: 'SETUP_FAILED',
        detail: 'UNSUPPORTED_PAGE',
      })
    })

    it.each(['BUSY', 'UNAVAILABLE', 'INVALID_SETUP'])(
      'le refus %s de l’application rejette avec REFUSED, sans événement pour les écrans',
      async (code) => {
        const { bridge, listen, events } = reading((_runId, reply) =>
          reply({ v: 1, type: 'drive.error', code, runId: OTHER_RUN }),
        )
        listen()

        expect(await rejection(bridge.startSetup())).toMatchObject({
          code: 'REFUSED',
          detail: code,
        })
        expect(events).toEqual([])
      },
    )

    it('un magasin lu que personne n’attend (page rechargée) est ignoré, pas montré comme périmé', () => {
      const { listen, events, reply } = setup()
      listen()

      reply(setupResult(OTHER_RUN))

      expect(events).toEqual([])
    })

    it('hors de l’application : UNAVAILABLE, sans rien envoyer', () => {
      const bridge = createDriveBridge({ window: {} })

      expect(codeOf(() => void bridge.startSetup())).toBe('UNAVAILABLE')
    })

    it('si le pont refuse l’envoi, la lecture n’attend pas pour rien', () => {
      const native = fakeNative()
      vi.mocked(native.bridge.postMessage).mockImplementationOnce(() => {
        throw new Error('boom')
      })
      const bridge = createDriveBridge({ window: native.window, now: () => NOW })

      expect(codeOf(() => void bridge.startSetup())).toBe('SEND_FAILED')
      void bridge.startSetup()
      expect(native.sent).toHaveLength(1)
    })
  })

  describe('openMenu', () => {
    it('envoie app.menu, sans rien attendre', () => {
      const { bridge, sent } = setup()

      bridge.openMenu()

      expect(sent).toEqual([{ v: 1, type: 'app.menu' }])
    })

    it('hors de l’application : UNAVAILABLE', () => {
      expect(codeOf(() => createDriveBridge({ window: {} }).openMenu())).toBe('UNAVAILABLE')
    })
  })

  it('ne fait aucun appel réseau et n’écrit rien dans la console', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const { bridge, reply } = setup((message, answer) => {
      if (message.type === 'app.info')
        answer({ v: 1, type: 'app.info', version: '0.5.0', versionCode: 5, drive: true })
    })
    bridge.onEvent(() => undefined)

    await bridge.info()
    bridge.startRun(plan(), 'l1')
    reply(driveResult())
    reply({ v: 1, type: 'drive.result', result: {} })
    bridge.cancel()

    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
