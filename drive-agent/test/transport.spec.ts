// @vitest-environment node
// Les transports de l'agent (DRV-302, mise à jour G1) : le fragment d'adresse et le pont de l'application portent les mêmes messages.
import { describe, expect, it, vi } from 'vitest'

import { decodeMessage, encodeMessage, ProtocolError, validatePlan } from '../protocol'
import type { ResultMessage, SetupResultMessage } from '../protocol'
import { bridgeTransport, type Bridge } from '../src/transport/bridge'
import { fragmentTransport } from '../src/transport/fragment'
import { validExamples } from './protocol-examples'

const PLAN = validExamples('plan').find((example) => example.name === 'plan-complet')?.message
const RESULT = validExamples('result').find((example) => example.name === 'result-complet')
  ?.message as ResultMessage
const SETUP_RESULT = validExamples('result').find(
  (example) => example.name === 'result-configuration-avec-libelle',
)?.message as SetupResultMessage
const ORIGIN = 'https://repas.exemple.invalid'

function fragmentPage(hash: string) {
  return { location: { hash }, navigate: vi.fn<(url: string) => void>() }
}

function fakeBridge() {
  let listener: ((event: { data: unknown }) => void) | undefined
  const bridge: Bridge = {
    postMessage: vi.fn<(text: string) => void>(),
    addEventListener: (_type, handler) => {
      listener = handler
    },
  }
  return { bridge, receive: (data: unknown) => listener?.({ data }) }
}

describe('fragmentTransport', () => {
  it('livre le plan lu dans le fragment #repas=', () => {
    // Given
    const page = fragmentPage(`#repas=${encodeMessage(PLAN)}`)
    const onMessage = vi.fn<(message: unknown) => void>()
    const onInvalid = vi.fn<() => void>()

    // When
    fragmentTransport(page, ORIGIN).listen(onMessage, onInvalid)

    // Then
    expect(onMessage).toHaveBeenCalledOnce()
    expect(validatePlan(onMessage.mock.calls[0]?.[0])).toEqual(PLAN)
    expect(onInvalid).not.toHaveBeenCalled()
  })

  it.each([[''], ['#autre=1'], ['#result=abc']])(
    'reste silencieux sans plan dans le fragment « %s »',
    (hash) => {
      const onMessage = vi.fn<() => void>()
      const onInvalid = vi.fn<() => void>()

      fragmentTransport(fragmentPage(hash), ORIGIN).listen(onMessage, onInvalid)

      expect(onMessage).not.toHaveBeenCalled()
      expect(onInvalid).not.toHaveBeenCalled()
    },
  )

  it('signale un fragment illisible sans livrer de message', () => {
    // Given
    const onMessage = vi.fn<() => void>()
    const onInvalid = vi.fn<(error: ProtocolError) => void>()

    // When
    fragmentTransport(fragmentPage('#repas=pas du base64url'), ORIGIN).listen(onMessage, onInvalid)

    // Then
    expect(onMessage).not.toHaveBeenCalled()
    expect(onInvalid.mock.calls[0]?.[0]).toBeInstanceOf(ProtocolError)
  })

  it('ne masque pas l’erreur d’un gestionnaire de message', () => {
    const page = fragmentPage(`#repas=${encodeMessage(PLAN)}`)

    expect(() =>
      fragmentTransport(page, ORIGIN).listen(() => {
        throw new Error('bug du gestionnaire')
      }, vi.fn<() => void>()),
    ).toThrow('bug du gestionnaire')
  })

  it('renvoie le résultat vers l’origine de Repas, au chemin de retour, dans #result=', () => {
    // Given
    const page = fragmentPage('')

    // When
    fragmentTransport(page, ORIGIN).send(RESULT)

    // Then
    const url = page.navigate.mock.calls[0]?.[0] ?? ''
    expect(url.startsWith(`${ORIGIN}/drive/retour#result=`)).toBe(true)
    expect(decodeMessage(url.slice(url.indexOf('#result=') + '#result='.length))).toEqual(RESULT)
  })
})

describe('bridgeTransport', () => {
  it('livre le plan reçu de l’application, en JSON', () => {
    // Given
    const { bridge, receive } = fakeBridge()
    const onMessage = vi.fn<(message: unknown) => void>()
    bridgeTransport(bridge).listen(onMessage, vi.fn<() => void>())

    // When
    receive(JSON.stringify(PLAN))

    // Then
    expect(onMessage).toHaveBeenCalledWith(PLAN)
  })

  it.each([
    ['du JSON invalide', '{pas du json'],
    ['un message qui n’est pas du texte', { plan: 1 }],
    ['un message de plus de 64 Ko', `"${'a'.repeat(70_000)}"`],
  ])('signale %s', (_name, data) => {
    // Given
    const { bridge, receive } = fakeBridge()
    const onMessage = vi.fn<() => void>()
    const onInvalid = vi.fn<(error: ProtocolError) => void>()
    bridgeTransport(bridge).listen(onMessage, onInvalid)

    // When
    receive(data)

    // Then
    expect(onMessage).not.toHaveBeenCalled()
    expect(onInvalid.mock.calls[0]?.[0]).toBeInstanceOf(ProtocolError)
    expect(onInvalid.mock.calls[0]?.[0].code).toBe('INVALID_MESSAGE')
  })

  it('envoie le résultat à l’application, en JSON', () => {
    const { bridge } = fakeBridge()

    bridgeTransport(bridge).send(SETUP_RESULT)

    expect(bridge.postMessage).toHaveBeenCalledWith(JSON.stringify(SETUP_RESULT))
  })

  it('refuse d’envoyer plus de 64 Ko', () => {
    const { bridge } = fakeBridge()
    const huge = {
      ...RESULT,
      lines: [{ ingredientSlug: 'x', outcome: 'SKIPPED', pad: 'a'.repeat(70_000) }],
    }

    expect(() => bridgeTransport(bridge).send(huge as unknown as ResultMessage)).toThrow(
      ProtocolError,
    )
    expect(bridge.postMessage).not.toHaveBeenCalled()
  })
})
