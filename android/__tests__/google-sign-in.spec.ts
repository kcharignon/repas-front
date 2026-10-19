// @vitest-environment node
// La connexion avec Google côté application (AUTH-011, ADR 0024 du dépôt back) : ce qui doit rester vrai du code, sans construire l'application.
// Les règles de fond (validation, une demande à la fois, traduction des erreurs) sont jouées en Kotlin par `make android-test` ; l'aller-retour par
// le pont, avec le fournisseur factice, par `make android-smoke`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = join(androidDir, '..')
const pkg = join('eu', 'kantin', 'repas', 'drive')
const app = (sourceSet: string, file: string) => join(androidDir, 'app', 'src', sourceSet, 'kotlin', pkg, file)
const core = (file: string) => join(androidDir, 'core', 'src', 'main', 'kotlin', pkg, file)
const read = (path: string) => readFileSync(path, 'utf8')

/** Le code sans ses commentaires (KDoc compris) : un commentaire qui dit « jamais de `Log` » ne compte pas. */
const codeOf = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')

const SKIPPED = new Set(['node_modules', 'dist', 'build', '.gradle', '.kotlin', 'coverage', 'playwright-report', 'test-results', '.git'])
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED.has(entry.name)) return []
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path) : statSync(path).size < 2_000_000 ? [path] : []
  })
}

const kotlinOf = (dir: string) => files(dir).filter((path) => path.endsWith('.kt'))
const appKotlin = kotlinOf(join(androidDir, 'app', 'src'))
const coreKotlin = kotlinOf(join(androidDir, 'core', 'src'))

describe('aucune connexion Google dans une WebView', () => {
  it('ni la coquille, ni le drive, ni le script injecté ne chargent une page de Google', () => {
    const sources = [...appKotlin, ...coreKotlin, join(androidDir, 'app', 'src', 'main', 'assets', 'injection.js')]
    const offenders = sources.filter((path) => /accounts\.google\.com|gsi\/client|oauth2/i.test(codeOf(read(path))))
    expect(offenders.map((path) => relative(androidDir, path))).toEqual([])
  })

  it('passe par Credential Manager en flux « bouton » (GetSignInWithGoogleOption), jamais par la feuille du bas', () => {
    const signIn = codeOf(read(app('main', 'GoogleSignIn.kt')))
    expect(signIn).toContain('GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce)')
    expect(signIn).toContain('getCredentialAsync(')
    expect(appKotlin.filter((path) => codeOf(read(path)).includes('GetGoogleIdOption'))).toEqual([])
  })
})

describe('l’ID client Web n’est écrit nulle part dans le dépôt', () => {
  // Un vrai ID client a un numéro de projet quelconque (12 chiffres) ; les valeurs des tests sont synthétiques : 1, 12, 123… (chiffres qui se suivent).
  const CLIENT_ID = /\b(\d+)-[a-z0-9]+\.apps\.googleusercontent\.com\b/g
  const synthetic = (digits: string) => '12345678901234567890'.startsWith(digits)

  it('ni dans l’application, ni dans le front, ni dans la documentation : il vient de la page, qui le tient du back', () => {
    const roots = ['android', 'src', 'e2e', 'public', 'docker', 'docs', 'drive-agent'].map((dir) => join(repoDir, dir))
    const found = roots
      .flatMap(files)
      .flatMap((path) => [...read(path).matchAll(CLIENT_ID)].map((match) => ({ path, digits: match[1] ?? '' })))
      .filter(({ digits }) => !synthetic(digits))
      .map(({ path }) => relative(repoDir, path))
    expect(found).toEqual([])
  })

  it('l’application ne garde ni ID client ni nonce : elle les reçoit avec chaque demande', () => {
    expect(codeOf(read(core('NativeBridge.kt')))).toContain('NativeRequest.GoogleSignIn(clientId as String, nonce as String)')
    const gradle = read(join(androidDir, 'app', 'build.gradle.kts'))
    expect(gradle).not.toMatch(/googleusercontent|GOOGLE_CLIENT_ID|serverClientId/i)
  })
})

describe('le jeton, le nonce et l’ID client ne vont ni au journal ni dans un stockage', () => {
  const googlePath = [
    app('main', 'GoogleSignIn.kt'),
    app('debug', 'FakeGoogleIdentity.kt'),
    app('debug', 'IdentityProviders.kt'),
    app('release', 'IdentityProviders.kt'),
    core('SignInRelay.kt'),
    core('IdentityProvider.kt'),
  ]

  it.each(googlePath.map((path) => [relative(androidDir, path), path]))('%s n’écrit rien au journal', (_name, path) => {
    expect(codeOf(read(path))).not.toMatch(/\bLog\.|println|printStackTrace|System\.(out|err)/)
  })

  it.each(googlePath.map((path) => [relative(androidDir, path), path]))('%s ne garde rien (ni préférence, ni passage)', (_name, path) => {
    expect(codeOf(read(path))).not.toMatch(/SharedPreferences|getSharedPreferences|PassStore|DrivePass|putString/)
  })

  it('la coquille ne journalise pas la demande et répond par le canal de la page qui a demandé', () => {
    const shell = codeOf(read(app('main', 'MainActivity.kt')))
    const branch = shell.split('\n').filter((line) => line.includes('NativeRequest.GoogleSignIn'))
    expect(branch).toHaveLength(1)
    expect(branch[0]).toContain('postTo(proxy, answer)')
    expect(branch[0]).not.toMatch(/\bLog\./)
    expect(shell).toContain('if (signInRelay.isInitialized()) signInRelay.value.cancel()')
  })
})

describe('le fournisseur factice n’existe que dans l’APK de débogage', () => {
  it('vit dans app/src/debug seulement', () => {
    const outsideDebug = [...appKotlin, ...coreKotlin]
      .filter((path) => !path.includes(join('app', 'src', 'debug')) && !path.includes(join('app', 'src', 'testDebug')))
      .filter((path) => codeOf(read(path)).includes('FakeGoogleIdentity'))
    expect(outsideDebug.map((path) => relative(androidDir, path))).toEqual([])
  })

  it('chaque variante a son IdentityProviders : le faux en débogage, Credential Manager en publication', () => {
    expect(codeOf(read(app('debug', 'IdentityProviders.kt')))).toMatch(/IdentityProvider = FakeGoogleIdentity\(\)/)
    expect(codeOf(read(app('release', 'IdentityProviders.kt')))).toMatch(/IdentityProvider = CredentialManagerGoogleIdentity\(activity\)/)
  })

  it('le contrôle de l’APK de publication le refuse, et l’essai de la publication prouve ce refus', () => {
    const build = read(join(androidDir, 'build.sh'))
    expect(build).toContain("grep -aq 'FakeGoogleIdentity' \"$dex\"")
    expect(build).toContain("grep -aq 'CredentialManagerGoogleIdentity' \"$dex\"")
    expect(build).toContain('refused "fournisseur d\'identité factice"')
  })
})

describe('les bibliothèques de la connexion avec Google', () => {
  const gradle = read(join(androidDir, 'app', 'build.gradle.kts'))

  it.each([
    'androidx.credentials:credentials:1.6.0',
    'androidx.credentials:credentials-play-services-auth:1.6.0',
    'com.google.android.libraries.identity.googleid:googleid:1.2.0',
  ])('épingle %s', (coordinate) => {
    expect(gradle).toContain(`implementation("${coordinate}")`)
  })

  it('n’utilise aucune préversion', () => {
    const versions = [...gradle.matchAll(/implementation\("([^"]+)"\)/g)].map((match) => match[1] ?? '')
    expect(versions.filter((coordinate) => /-(alpha|beta|rc|dev)/i.test(coordinate))).toEqual([])
  })
})
