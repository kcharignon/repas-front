import { describe, expect, it } from 'vitest'

import {
  MIN_DRIVE_APP_VERSION,
  RAYON_HINTS_APP_VERSION,
  compareVersions,
  isDriveAppVersionEnough,
  isRayonHintsAppVersion,
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
