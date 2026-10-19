// @vitest-environment node
// Aucune clé, aucun mot de passe ni secret dans le dépôt public (DRV-311) : seule la clé de débogage publique du spike est suivie.
// La clé de publication arrive par variables d'environnement au moment de la construction et ne touche jamais le dépôt.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = join(androidDir, '..')

/** Les sorties de construction ne comptent pas : elles ne sont pas dans le dépôt (.gitignore). Chemins relatifs à android/. */
const BUILD_OUTPUTS = new Set(['.gradle', '.kotlin', 'build', 'dist', 'app/build', 'core/build', 'buildSrc/.gradle', 'buildSrc/build'])
const KEY_FILE = /\.(jks|p12|pfx|keystore|pem|key|pk8)$/i
const SIGNING_VARIABLES = ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (BUILD_OUTPUTS.has(relative(androidDir, path))) return []
    return entry.isDirectory() ? sourceFiles(path) : [path]
  })
}

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('l’application Android ne garde aucun secret dans le dépôt', () => {
  it('ne contient aucun fichier de clé hors la clé de débogage publique', () => {
    const keys = sourceFiles(androidDir)
      .filter((path) => KEY_FILE.test(path))
      .map((path) => relative(androidDir, path))
    expect(keys).toEqual(['debug.keystore'])
  })

  it.each(['android/*.jks', 'android/*.p12', 'android/*.pfx', 'android/**/*.keystore', '!android/debug.keystore'])(
    'fait ignorer par Git %s',
    (pattern) => {
      expect(read(join(repoDir, '.gitignore'))).toContain(pattern)
    },
  )

  it.each(['ANDROID_KEYSTORE_FILE', ...SIGNING_VARIABLES])('lit %s dans l’environnement, jamais dans un fichier du dépôt', (variable) => {
    expect(read(join(androidDir, 'app', 'build.gradle.kts'))).toContain(`env("${variable}")`)
  })

  it('n’écrit en clair que le mot de passe, public, de la clé de débogage', () => {
    const gradle = read(join(androidDir, 'app', 'build.gradle.kts'))
    const literalPasswords = [...gradle.matchAll(/(?:storePassword|keyPassword)\s*=\s*"([^"]*)"/g)].map((match) => match[1])
    expect(literalPasswords).toEqual(['android', 'android'])
  })

  it.each(['ANDROID_KEYSTORE_BASE64', ...SIGNING_VARIABLES])('passe %s au conteneur sans en écrire la valeur', (variable) => {
    expect(read(join(repoDir, 'compose.yaml'))).toMatch(new RegExp(`^\\s+- ${variable}$`, 'm'))
  })
})
