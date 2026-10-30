// @vitest-environment node
// Le contrat du pont natif `repasNative` (DRV-317, DRV-314) entre le front et l'application Android : ce que l'application Kotlin envoie et
// reçoit est jugé par les validateurs du protocole et par le module `driveBridge` du front. Les fichiers de `core/src/test/resources` sont
// des copies des exemples du protocole que les tests Kotlin lisent : ils ne doivent pas dériver.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  validatePlan,
  validateResult,
  type PlanMessage,
  type ResultMessage,
} from '../../drive-agent/protocol'
import { createDriveBridge } from '../../src/features/drive/bridge/driveBridge'
import { parseInbound } from '../../src/features/drive/bridge/native'
import { fakeNative } from '../../src/features/drive/bridge/__tests__/fakeNative'

const here = dirname(fileURLToPath(import.meta.url))
const resource = (name: string) => readFileSync(join(here, '../core/src/test/resources', name), 'utf8')
const example = (name: string) =>
  readFileSync(join(here, '../../drive-agent/protocol/examples/valid', name), 'utf8')

const plan = JSON.parse(resource('plan-complet.json')) as PlanMessage
const aborted = JSON.parse(resource('aborted-result.json')) as unknown
const abortedSetup = JSON.parse(resource('aborted-setup-result.json')) as unknown
const RUN_ID = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'

describe('les fichiers de référence des tests Kotlin', () => {
  it.each(['plan-complet.json', 'plan-100-lignes.json'])(
    '%s est la copie exacte de l’exemple du protocole',
    (name) => {
      expect(resource(name)).toBe(example(name))
    },
  )

  it('le message setup de l’application (DRV-320) est la copie exacte de l’exemple sans magasin', () => {
    expect(resource('setup-message.json')).toBe(example('plan-setup-sans-magasin.json'))
    expect(validatePlan(JSON.parse(resource('setup-message.json')))).toMatchObject({
      type: 'setup',
    })
  })

  it('le plan est valide pour l’agent', () => {
    expect(() => validatePlan(plan)).not.toThrow()
  })

  it('le résultat aborted de l’application est valide pour l’agent comme pour Repas', () => {
    expect(() => validateResult(aborted)).not.toThrow()
    expect(aborted).toMatchObject({ outcome: 'aborted', error: { code: 'CANCELLED' }, lines: [] })
  })

  it('le résultat aborted d’une lecture du magasin est valide, sans magasin (DRV-320)', () => {
    expect(validateResult(abortedSetup)).toMatchObject({ outcome: 'aborted', lines: [] })
    expect(abortedSetup).not.toHaveProperty('store')
    expect((validateResult(abortedSetup) as ResultMessage).store).toBeUndefined()
  })
})

describe('ce que l’application répond à la page', () => {
  it('app.info', () => {
    expect(
      parseInbound('{"v":1,"type":"app.info","version":"1.2.3","versionCode":42,"drive":true}'),
    ).toEqual({ type: 'app.info', info: { version: '1.2.3', versionCode: 42, drive: true } })
  })

  it('app.info avec le champ facultatif retailers (DRV-707, lu par DRV-709) : le site lit les drives que l’application annonce', () => {
    expect(
      parseInbound(
        '{"v":1,"type":"app.info","version":"1.2.3","versionCode":42,"drive":true,"retailers":["leclerc"]}',
      ),
    ).toEqual({
      type: 'app.info',
      info: { version: '1.2.3', versionCode: 42, drive: true, retailers: ['leclerc'] },
    })
    expect(
      parseInbound(
        '{"v":1,"type":"app.info","version":"1.2.3","versionCode":42,"drive":true,"selfUpdate":true,"retailers":["leclerc","autre"]}',
      ),
    ).toEqual({
      type: 'app.info',
      info: {
        version: '1.2.3',
        versionCode: 42,
        drive: true,
        selfUpdate: true,
        retailers: ['leclerc', 'autre'],
      },
    })
  })

  it('app.info avec une liste retailers illisible : elle est ignorée, comme une application d’avant', () => {
    const old = parseInbound(
      '{"v":1,"type":"app.info","version":"1.2.3","versionCode":42,"drive":true}',
    )
    for (const retailers of ['[]', '"leclerc"', '[1]', '["Leclerc"]', '["leclerc",null]'])
      expect(
        parseInbound(
          `{"v":1,"type":"app.info","version":"1.2.3","versionCode":42,"drive":true,"retailers":${retailers}}`,
        ),
      ).toEqual(old)
  })

  it('drive.result d’une lecture du magasin : le front le reçoit et rend le magasin', async () => {
    const setupResult = {
      v: 1,
      type: 'setup-result',
      runId: RUN_ID,
      agentVersion: '1.0.0',
      store: {
        id: '000000',
        host: 'courses-test.leclercdrive.fr',
        baseUrl: 'https://courses-test.leclercdrive.fr/magasin-000000-000000',
        label: null,
      },
    }
    const native = fakeNative((message, reply) => {
      if (message.type === 'drive.setup') reply({ v: 1, type: 'drive.result', result: { ...setupResult, runId: message.runId } })
    })

    const store = await createDriveBridge({ window: native.window }).startSetup()

    expect(store).toEqual(setupResult.store)
  })

  it('drive.result : l’enveloppe porte le résultat du protocole, validé par Repas', () => {
    const inbound = parseInbound(JSON.stringify({ v: 1, type: 'drive.result', result: aborted }))
    expect(inbound).toMatchObject({ type: 'drive.result', result: { runId: RUN_ID } })
  })

  it.each(['INVALID_PLAN', 'INVALID_SETUP', 'BUSY', 'UNAVAILABLE', 'NO_PASS'])('drive.error %s', (code) => {
    expect(parseInbound(`{"v":1,"type":"drive.error","code":"${code}","runId":"${RUN_ID}"}`)).toEqual({
      type: 'drive.error',
      code,
      runId: RUN_ID,
    })
    expect(parseInbound(`{"v":1,"type":"drive.error","code":"${code}"}`)).toEqual({
      type: 'drive.error',
      code,
      runId: null,
    })
  })

  it.each(['INVALID_MESSAGE', 'UNKNOWN_TYPE'])('error %s', (code) => {
    expect(parseInbound(`{"v":1,"type":"error","code":"${code}"}`)).toEqual({ type: 'error', code })
  })
})

describe('ce que la page envoie à l’application', () => {
  const memory = () => {
    let value: string | null = null
    return { get: () => value, set: (next: string) => void (value = next), remove: () => void (value = null) }
  }

  it('drive.start porte le plan du protocole tel quel', () => {
    const native = fakeNative()
    createDriveBridge({ window: native.window, storage: memory() }).startRun(plan, 'liste-1')

    expect(native.sent).toEqual([{ v: 1, type: 'drive.start', plan }])
  })

  it('drive.setup ne porte qu’un identifiant de passage (UUID) : le magasin est lu sur la page', () => {
    const native = fakeNative()
    void createDriveBridge({ window: native.window, storage: memory() }).startSetup()

    expect(native.sent).toEqual([
      { v: 1, type: 'drive.setup', runId: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    ])
  })

  it('app.menu ne porte rien d’autre que son type', () => {
    const native = fakeNative()
    createDriveBridge({ window: native.window, storage: memory() }).openMenu()

    expect(native.sent).toEqual([{ v: 1, type: 'app.menu' }])
  })

  it('drive.cancel ne porte pas d’identifiant : l’application vise le passage en cours', () => {
    const native = fakeNative()
    createDriveBridge({ window: native.window, storage: memory() }).cancel()

    expect(native.sent).toEqual([{ v: 1, type: 'drive.cancel' }])
  })
})
