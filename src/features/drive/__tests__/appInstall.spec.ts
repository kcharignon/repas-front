// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { APP_APK_URL, APP_RELEASES_URL } from '../appInstall'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const kotlin = readFileSync(
  join(root, 'android/core/src/main/kotlin/eu/kantin/repas/drive/UpdateSource.kt'),
  'utf8',
)

/** La valeur d'une constante `const val NAME = "…"` de `UpdateSource.kt`. */
const constant = (name: string): string => {
  const match = new RegExp(`const val ${name}(?::[^=]+)? = "([^"]*)"`).exec(kotlin)
  if (match === null) throw new Error(`${name} introuvable dans UpdateSource.kt`)

  return match[1] as string
}

describe('l’adresse de l’APK de la page /installer (DRV-639)', () => {
  it('est celle de la release roulante android-latest, pas de « releases/latest » (qui est la release du site)', () => {
    expect(APP_APK_URL).toBe(
      'https://github.com/kcharignon/repas-front/releases/download/android-latest/repas-drive.apk',
    )
    expect(APP_APK_URL).not.toContain('/latest/download/')
  })

  it('est la même que celle de l’application (UpdateSource.INSTALL_APK_URL)', () => {
    const releases = /private const val RELEASES = "([^"]*)"/.exec(kotlin)?.[1]
    const composed = `${releases}${constant('ROLLING_TAG')}/${constant('APK_FILE_NAME')}`

    expect(composed).toBe(APP_APK_URL)
  })

  it('la page des versions reste celle de GitHub', () => {
    expect(APP_RELEASES_URL).toBe('https://github.com/kcharignon/repas-front/releases')
  })
})
