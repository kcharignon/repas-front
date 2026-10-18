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

      expect(draft).toEqual({ runId: RUN, listId: 'l1', startedAt: NOW.toISOString() })
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
          draft: { runId: RUN, listId: 'l1', startedAt: NOW.toISOString() },
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

      expect(reloaded.loadDraft()).toEqual({
        runId: RUN,
        listId: 'l1',
        startedAt: NOW.toISOString(),
      })
      expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '')).toEqual({
        runId: RUN,
        listId: 'l1',
        startedAt: NOW.toISOString(),
      })
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
