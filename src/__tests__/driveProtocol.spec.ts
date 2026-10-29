// @vitest-environment node
// L'alias `@drive-protocol` : le front importe le protocole de l'agent du drive (DRV-302) sans chemin relatif.
import { describe, expect, it } from 'vitest'

import {
  decodeMessage,
  encodeMessage,
  PROTOCOL_VERSION,
  ProtocolError,
  validateResult,
} from '@drive-protocol'

describe('@drive-protocol', () => {
  it('encode, décode et valide un résultat de l’agent', () => {
    // Given
    const result = {
      v: PROTOCOL_VERSION,
      type: 'result',
      runId: '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c',
      agentVersion: '1.0.0',
      outcome: 'completed',
      store: { id: '000000' },
      lines: [{ ingredientSlug: 'farine', outcome: 'HAVE_AT_HOME' }],
    }

    // When
    const decoded = validateResult(decodeMessage(encodeMessage(result)))

    // Then
    expect(decoded).toEqual(result)
  })

  it('refuse un message invalide avec le chemin du champ fautif', () => {
    expect(() => validateResult({ type: 'result', v: 2 })).toThrow(ProtocolError)
  })
})
