import { describe, expect, it } from 'vitest'

import {
  MIN_DRIVE_APP_VERSION,
  RAYON_HINTS_APP_VERSION,
  compareVersions,
  isDriveAppVersionEnough,
  isRayonHintsAppVersion,
  isReportableAppVersion,
  offersAppUpdate,
} from '../appVersion'

describe('compareVersions (comparaison numérique, jamais lexicale)', () => {
  it.each([
    ['0.1.10', '0.1.10', 0],
    ['0.1.8', '0.1.10', -2],
    ['0.1.9', '0.1.10', -1],
    ['0.1.10', '0.1.9', 1],
    ['0.2.0', '0.1.10', 1],
    ['0.1.10', '0.2.0', -1],
    ['1.0.0', '0.99.99', 1],
    ['0.99.99', '1.0.0', -1],
    ['10.0.0', '9.9.9', 1],
    ['0.1.8-debug', '0.1.8', 0],
    [' 0.1.8 ', '0.1.8', 0],
  ])('%s face à %s : %i', (a, b, sign) => {
    const order = compareVersions(a, b)
    expect(Math.sign(order ?? NaN)).toBe(Math.sign(sign))
  })

  it.each([null, undefined, '', ' ', 'abc', '1', '1.2', '1.2.x', 'v1.2.3', '1.2.3.4', '-1.0.0'])(
    'une version absente ou mal formée (%j) ne se compare pas',
    (bad) => {
      expect(compareVersions(bad, '0.1.10')).toBeNull()
      expect(compareVersions('0.1.10', bad)).toBeNull()
    },
  )
})

describe('isDriveAppVersionEnough', () => {
  it('fixe le minimum à 0.1.10', () => expect(MIN_DRIVE_APP_VERSION).toBe('0.1.10'))

  it.each([
    ['0.1.10', true],
    ['0.1.11', true],
    ['0.2.0', true],
    ['1.0.0', true],
    ['0.1.9', false],
    ['0.1.8', false],
    ['0.0.1', false],
    // Une construction de développement est le code courant, pas une ancienne version
    ['0.0.0-dev', true],
    ['0.0.0', false],
    [null, false],
    [undefined, false],
    ['', false],
    ['inconnue', false],
  ])('%j : %s', (version, enough) => {
    expect(isDriveAppVersionEnough(version)).toBe(enough)
  })
})

describe('isRayonHintsAppVersion (DRV-642)', () => {
  it.each(['0.1.15', '0.1.16', '0.2.0', '1.0.0', '0.0.0-dev'])(
    '%s connaît les rayons conseillés',
    (version) => {
      expect(isRayonHintsAppVersion(version)).toBe(true)
    },
  )

  it.each(['0.1.14', '0.1.10', '0.1.9', '0.0.1', null, undefined, '', 'abc'])(
    '%s ne les connaît pas',
    (version) => {
      expect(isRayonHintsAppVersion(version)).toBe(false)
    },
  )

  it('compare nombre par nombre, jamais en texte (0.1.100 est au-dessus de 0.1.15)', () => {
    expect(isRayonHintsAppVersion('0.1.100')).toBe(true)
  })

  it('n’est jamais plus bas que la version minimale du drive', () => {
    expect(compareVersions(RAYON_HINTS_APP_VERSION, MIN_DRIVE_APP_VERSION)).toBeGreaterThanOrEqual(
      0,
    )
  })
})

describe('isReportableAppVersion (DRV-637 : ce que le serveur retient)', () => {
  it.each(['0.1.8', '0.1.10', '1.0.0', '10.20.30'])('%s est envoyée', (version) => {
    expect(isReportableAppVersion(version)).toBe(true)
  })

  it.each([
    '0.0.0-dev',
    '0.1.8-debug',
    '0.1.8+abc',
    ' 0.1.8',
    '0.1',
    '0.1.8.1',
    'v0.1.8',
    '1234567890.123456789.1',
    '',
    null,
    undefined,
  ])('%j n’est pas envoyée', (version) => {
    expect(isReportableAppVersion(version)).toBe(false)
  })
})

describe('offersAppUpdate (DRV-637 : le bandeau de « Moi »)', () => {
  const facts = (latest: string | null, minimum: string | null, outdated = false) => ({
    latest,
    minimum,
    outdated,
  })

  it.each([
    ['0.1.8', facts('0.1.10', null), true],
    ['0.1.9', facts('0.1.10', null), true],
    ['0.1.10', facts('0.1.10', null), false],
    ['0.1.11', facts('0.1.10', null), false],
    ['0.1.100', facts('0.1.15', null), false],
    ['0.1.8', facts(null, '0.1.9'), true],
    ['0.1.9', facts(null, '0.1.9'), false],
    ['0.1.9', facts('0.1.12', '0.1.8'), true],
    ['0.1.12', facts('0.1.12', '0.1.8'), false],
  ])('application %s, serveur %j : %s', (running, update, offered) => {
    expect(offersAppUpdate(running, update)).toBe(offered)
  })

  it('compare la version qui tourne, pas celle que le serveur a retenue (juste après une mise à jour)', () => {
    expect(offersAppUpdate('0.1.10', facts('0.1.10', null, true))).toBe(false)
    expect(offersAppUpdate('0.1.8', facts('0.1.10', null, false))).toBe(true)
  })

  it.each([null, undefined, '', 'abc'])(
    'version de l’application inconnue (%j) : le calcul du serveur sert de repli',
    (running) => {
      expect(offersAppUpdate(running, facts('0.1.10', null, true))).toBe(true)
      expect(offersAppUpdate(running, facts('0.1.10', null, false))).toBe(false)
    },
  )

  it('le serveur ne connaît aucune version publiée : jamais de bandeau, même si `outdated` dit vrai', () => {
    expect(offersAppUpdate('0.1.8', facts(null, null, true))).toBe(false)
    expect(offersAppUpdate(null, facts(null, null, true))).toBe(false)
    expect(offersAppUpdate('0.1.8', { outdated: true })).toBe(false)
  })

  it('sans réponse du serveur (ancienne copie de la session) : pas de bandeau', () => {
    expect(offersAppUpdate('0.1.8', undefined)).toBe(false)
    expect(offersAppUpdate('0.1.8', null)).toBe(false)
  })

  it('une construction de développement est le code courant : pas de bandeau', () => {
    expect(offersAppUpdate('0.0.0-dev', facts('0.1.10', '0.1.9', true))).toBe(false)
  })
})
