// @vitest-environment node
// La coquille de l'application Repas (DRV-317) : ce qui doit rester vrai du manifeste, du pont natif et de l'origine de Repas.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(androidDir, '..', 'src')
const kotlinDir = join(androidDir, 'app', 'src', 'main', 'kotlin')

const read = (path: string) => readFileSync(path, 'utf8')
const manifest = read(join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml'))
const gradle = read(join(androidDir, 'app', 'build.gradle.kts'))
const buildTypes = /buildTypes\s*\{([\s\S]*?)\n {4}\}/.exec(gradle)?.[1] ?? ''

function files(dir: string, extension: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path, extension) : extension.test(entry.name) ? [path] : []
  })
}

describe('le manifeste de l’application', () => {
  it('ne demande que la permission Internet', () => {
    const permissions = [...manifest.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)].map((match) => match[1])
    expect(permissions).toEqual(['android.permission.INTERNET'])
  })

  it('ouvre les liens https vers l’hôte de Repas, vérifiés (autoVerify), dans la coquille seulement', () => {
    const filter = /<intent-filter android:autoVerify="true">([\s\S]*?)<\/intent-filter>/.exec(manifest)?.[1] ?? ''
    expect(filter).toContain('android.intent.action.VIEW')
    expect(filter).toContain('android.intent.category.BROWSABLE')
    expect(filter).toContain('android:scheme="https"')
    expect(filter).toContain('android:host="${repasHost}"')
    expect(manifest.match(/android:autoVerify=/g)).toHaveLength(1)
  })

  it('ne laisse lancer le drive que par la coquille', () => {
    expect(/<activity[^>]*android:name="\.DriveActivity"[^>]*android:exported="false"/s.test(manifest)).toBe(true)
  })

  it('n’autorise pas le trafic en clair', () => {
    expect(manifest).toContain('android:usesCleartextTraffic="false"')
  })
})

describe('le mode d’emploi de l’application', () => {
  const strings = read(join(androidDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml'))

  // Les pages de Leclerc chargent leurs propres services (anti-robot, mesure) et la WebView du drive accepte leurs cookies : ne pas dire
  // que l'application « ne parle qu'à leclercdrive.fr ».
  it('ne prétend pas que le drive ne contacte que leclercdrive.fr', () => {
    expect(strings).not.toContain('ne parle qu’à leclercdrive.fr')
    expect(strings).toContain('ses pages font appel à leurs propres services')
  })
})

describe('l’origine de Repas', () => {
  it('est celle de la production dans l’APK de publication, quoi qu’on passe à la construction', () => {
    const release = /getByName\("release"\)\s*\{([\s\S]*?)\n {8}\}/.exec(buildTypes)?.[1] ?? ''
    expect(release).toContain('buildConfigField("String", "REPAS_ORIGIN", "\\"$productionOrigin\\"")')
    expect(release).not.toContain('debugOrigin')
    expect(gradle).toContain('val productionOrigin = "https://kantin.eu/"')
  })

  it('ne se règle par ANDROID_REPAS_ORIGIN que dans l’APK de débogage, en https', () => {
    const debug = /getByName\("debug"\)\s*\{([\s\S]*?)\n {8}\}/.exec(buildTypes)?.[1] ?? ''
    expect(debug).toContain('"\\"$debugOrigin\\""')
    expect(gradle).toContain('env("ANDROID_REPAS_ORIGIN")')
    expect(gradle).toContain('^https://')
  })
})

describe('le pont natif', () => {
  const sources = files(kotlinDir, /\.kt$/).map((path) => ({ path, text: read(path) }))

  it('n’expose aucun objet natif aux pages (pas de addJavascriptInterface)', () => {
    expect(sources.filter(({ text }) => text.includes('addJavascriptInterface(')).map(({ path }) => path)).toEqual([])
  })

  it('est réservé à l’origine de Repas : la liste des origines autorisées n’a que celle-là', () => {
    const shell = read(join(kotlinDir, 'eu', 'kantin', 'repas', 'drive', 'MainActivity.kt'))
    expect(shell).toContain('addWebMessageListener(view, NativeBridge.OBJECT_NAME, setOf(repasOrigin))')
  })
})

describe('les fichiers que le front envoie', () => {
  // La coquille ne demande aucune permission ni n'implémente `onShowFileChooser` : si le front se met à envoyer des fichiers ou des photos,
  // il faut ajouter le sélecteur de fichiers de la WebView (et la permission qu'il demande) avant de livrer.
  it('n’existent pas : le front n’a aucun champ de fichier', () => {
    const withFileInput = files(srcDir, /\.(vue|ts)$/)
      .filter((path) => !path.includes('__tests__'))
      .filter((path) => /type=["']file["']|showOpenFilePicker/.test(read(path)))
    expect(withFileInput).toEqual([])
  })
})
