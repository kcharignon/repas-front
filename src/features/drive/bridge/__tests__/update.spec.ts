// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { createDriveBridge } from '../driveBridge'
import { parseInbound } from '../native'
import { parseUpdateState, UPDATE_STATUSES } from '../update'
import type { AppUpdateState } from '../update'
import { fakeNative } from './fakeNative'

// La mise à jour de l'application par elle-même (DRV-639), côté page : ce que l'application dit (`update.state`) est lu avec méfiance, ce que
// la page lui demande ne porte rien d'autre que le type du message (ni adresse, ni version, ni empreinte).

const wire = (state: Record<string, unknown>) => ({ v: 1, type: 'update.state', ...state })
const inbound = (state: Record<string, unknown>) => parseInbound(JSON.stringify(wire(state)))

describe('ce que l’application dit de la mise à jour', () => {
  it.each<[Record<string, unknown>, AppUpdateState]>([
    [{ state: 'inconnu' }, { status: 'inconnu' }],
    [{ state: 'verification' }, { status: 'verification' }],
    [{ state: 'aJour' }, { status: 'aJour' }],
    [
      { state: 'miseAJourDisponible', version: '0.1.30' },
      { status: 'miseAJourDisponible', version: '0.1.30' },
    ],
    [
      { state: 'telechargement', version: '0.1.30', progress: 42 },
      { status: 'telechargement', version: '0.1.30', progress: 42 },
    ],
    [
      { state: 'pretAInstaller', version: '12.3.456' },
      { status: 'pretAInstaller', version: '12.3.456' },
    ],
    [
      { state: 'erreur', code: 'OFFLINE' },
      { status: 'erreur', code: 'OFFLINE', version: null },
    ],
    [
      { state: 'erreur', code: 'DIGEST_MISMATCH', version: '0.1.30' },
      { status: 'erreur', code: 'DIGEST_MISMATCH', version: '0.1.30' },
    ],
  ])('lit %j', (message, expected) => {
    expect(inbound(message)).toEqual({ type: 'update.state', state: expected })
  })

  it('connaît les sept mots du protocole, ceux que l’application écrit', () => {
    expect([...UPDATE_STATUSES]).toEqual([
      'inconnu',
      'verification',
      'aJour',
      'miseAJourDisponible',
      'telechargement',
      'pretAInstaller',
      'erreur',
    ])
  })

  it.each<[string, Record<string, unknown>]>([
    ['un état inconnu', { state: 'installe' }],
    ['aucun état', {}],
    ['un état qui n’est pas du texte', { state: 3 }],
    ['une version absente', { state: 'miseAJourDisponible' }],
    ['une version qui n’est pas X.Y.Z', { state: 'miseAJourDisponible', version: 'v0.1.30' }],
    ['une version avec une adresse', { state: 'pretAInstaller', version: '0.1.30/../x' }],
    ['une version trop longue', { state: 'pretAInstaller', version: '1.2.3.4' }],
    ['une progression absente', { state: 'telechargement', version: '0.1.30' }],
    ['une progression négative', { state: 'telechargement', version: '0.1.30', progress: -1 }],
    [
      'une progression au-dessus de 100',
      { state: 'telechargement', version: '0.1.30', progress: 101 },
    ],
    ['une progression décimale', { state: 'telechargement', version: '0.1.30', progress: 4.5 }],
    ['une progression en texte', { state: 'telechargement', version: '0.1.30', progress: '42' }],
    ['une erreur sans code', { state: 'erreur' }],
    ['un code en minuscules', { state: 'erreur', code: 'offline' }],
    ['un code qui est une phrase', { state: 'erreur', code: 'Pas de connexion' }],
    ['un code trop long', { state: 'erreur', code: 'A'.repeat(65) }],
    [
      'une erreur dont la version est mal formée',
      { state: 'erreur', code: 'OFFLINE', version: 'x' },
    ],
  ])('ignore %s', (_name, message) => {
    expect(inbound(message)).toBeNull()
  })

  it('ne recopie rien d’autre que les champs du protocole', () => {
    const state = parseUpdateState({
      state: 'miseAJourDisponible',
      version: '0.1.30',
      url: 'https://evil.example/x.apk',
      sha256: 'a'.repeat(64),
    })

    expect(state).toEqual({ status: 'miseAJourDisponible', version: '0.1.30' })
  })

  it('un état mal formé ne passe pas pour une réponse à app.info', async () => {
    const native = fakeNative((message, reply) => {
      if (message.type === 'app.info') {
        reply({ v: 1, type: 'update.state', state: 'inconnu-de-nous' })
        reply({ v: 1, type: 'app.info', version: '0.1.26', versionCode: 1026, drive: true })
      }
    })

    const info = await createDriveBridge({ window: native.window }).info()

    expect(info.version).toBe('0.1.26')
  })
})

describe('app.info et la mise à jour', () => {
  it('une application qui sait se mettre à jour le dit', () => {
    const info =
      '{"v":1,"type":"app.info","version":"0.1.26","versionCode":1026,"drive":true,"selfUpdate":true}'

    expect(parseInbound(info)).toEqual({
      type: 'app.info',
      info: { version: '0.1.26', versionCode: 1026, drive: true, selfUpdate: true },
    })
  })

  it.each([
    '',
    ',"selfUpdate":false',
    ',"selfUpdate":"true"',
    ',"selfUpdate":1',
    ',"selfUpdate":null',
  ])(
    'sans la clé « selfUpdate » vraie%s, l’application ne se met pas à jour toute seule',
    (extra) => {
      const info = `{"v":1,"type":"app.info","version":"0.1.26","versionCode":1026,"drive":true${extra}}`

      expect(parseInbound(info)).toEqual({
        type: 'app.info',
        info: { version: '0.1.26', versionCode: 1026, drive: true },
      })
    },
  )
})

describe('ce que la page demande', () => {
  const asks = () => {
    const native = fakeNative()
    const bridge = createDriveBridge({ window: native.window })

    return { native, bridge }
  }

  it.each([
    ['updateStatus', 'update.status'],
    ['checkForUpdate', 'update.check'],
    ['startUpdate', 'update.start'],
    ['cancelUpdate', 'update.cancel'],
  ] as const)('%s envoie « %s » et rien d’autre', (method, type) => {
    const { native, bridge } = asks()

    bridge[method]()

    expect(native.sent).toEqual([{ v: 1, type }])
    expect(native.texts).toEqual([JSON.stringify({ v: 1, type })])
  })

  it('hors de l’application, rien ne part et le pont le dit', () => {
    const bridge = createDriveBridge({ window: {} })

    expect(() => bridge.startUpdate()).toThrowError(/UNAVAILABLE/)
  })

  it('annonce chaque état à ceux qui écoutent, et plus après l’arrêt de l’écoute', () => {
    const { native, bridge } = asks()
    const seen: AppUpdateState[] = []
    const stop = bridge.onUpdate((state) => seen.push(state))

    native.reply(wire({ state: 'verification' }))
    native.reply(wire({ state: 'telechargement', version: '0.1.30', progress: 10 }))
    stop()
    native.reply(wire({ state: 'aJour' }))

    expect(seen).toEqual([
      { status: 'verification' },
      { status: 'telechargement', version: '0.1.30', progress: 10 },
    ])
  })
})
