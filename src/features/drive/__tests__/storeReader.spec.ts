import { describe, expect, it } from 'vitest'

import { createDriveBridge } from '../bridge'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import { canReadStoreFromApp, readStoreFromApp, StoreReadError } from '../storeReader'

// Magasin et passages SYNTHÉTIQUES.
const STORE = {
  id: '123456',
  host: 'ville-test.leclercdrive.fr',
  baseUrl: 'https://ville-test.leclercdrive.fr/magasin-123456-123456',
  label: null,
}
const outcome = (runId: string, type: string, rest: object) => ({
  v: 1,
  type: 'drive.result',
  result: { v: 1, type, runId, agentVersion: '1.0.0', ...rest },
})
const found = (runId: string) => outcome(runId, 'setup-result', { store: STORE })
const stopped = (runId: string, state: string, code?: string) =>
  outcome(runId, 'result', {
    outcome: state,
    ...(code && { error: { code, message: 'Texte' } }),
    lines: [],
  })

/** Une application dont le faux pont répond à `drive.setup` en suivant `answer`. */
function app(answer: (runId: string, reply: (message: unknown) => void) => void) {
  const native = fakeNative((message, reply) => {
    if (message.type === 'drive.setup') answer(message.runId ?? '', reply)
  })

  return { native, bridge: createDriveBridge({ window: native.window }) }
}

describe('lecture du magasin par l’application', () => {
  it('hors de l’application : pas de bouton, et la lecture se déclare indisponible', async () => {
    const bridge = createDriveBridge({ window: {} })

    expect(canReadStoreFromApp(bridge)).toBe(false)
    await expect(readStoreFromApp(bridge)).rejects.toMatchObject({ code: 'UNAVAILABLE' })
  })

  it('dans l’application : le bouton est proposé, et la lecture rend l’identifiant, l’adresse et le nom', async () => {
    const { bridge, native } = app((runId, reply) => reply(found(runId)))

    expect(canReadStoreFromApp(bridge)).toBe(true)
    await expect(readStoreFromApp(bridge)).resolves.toEqual({
      id: '123456',
      baseUrl: STORE.baseUrl,
      label: null,
    })
    expect(native.sent.map((message) => message.type)).toEqual(['drive.setup'])
  })

  it.each([
    ['un abandon', (runId: string) => stopped(runId, 'aborted', 'CANCELLED'), 'CANCELLED'],
    [
      'une page sans magasin',
      (runId: string) => stopped(runId, 'error', 'UNSUPPORTED_PAGE'),
      'NOT_FOUND',
    ],
    [
      'une autre erreur de l’agent',
      (runId: string) => stopped(runId, 'error', 'CONTRACT_CHANGED'),
      'FAILED',
    ],
    ['une erreur sans code', (runId: string) => stopped(runId, 'partial'), 'FAILED'],
  ])('%s donne %s', async (_name, message, code) => {
    const { bridge } = app((runId, reply) => reply(message(runId)))

    await expect(readStoreFromApp(bridge)).rejects.toMatchObject({ code })
  })

  it.each([
    ['BUSY', 'BUSY'],
    ['UNAVAILABLE', 'UNAVAILABLE'],
    ['INVALID_SETUP', 'UNAVAILABLE'],
  ])('le refus %s de l’application donne %s', async (refusal, code) => {
    const { bridge } = app((_runId, reply) =>
      reply({ v: 1, type: 'drive.error', code: refusal, runId: null }),
    )

    const error = await readStoreFromApp(bridge).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(StoreReadError)
    expect(error).toMatchObject({ code })
  })

  it('un pont qui refuse l’envoi donne UNAVAILABLE', async () => {
    const native = fakeNative()
    native.bridge.postMessage = () => {
      throw new Error('boom')
    }
    const bridge = createDriveBridge({ window: native.window })

    await expect(readStoreFromApp(bridge)).rejects.toMatchObject({ code: 'UNAVAILABLE' })
  })
})
