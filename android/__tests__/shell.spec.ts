// @vitest-environment node
// La coquille de l'application Repas (DRV-317) : ce qui doit rester vrai du manifeste, du pont natif et de l'origine de Repas.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(androidDir, '..', 'src')
const kotlinDir = join(androidDir, 'app', 'src', 'main', 'kotlin')
const coreKotlinDir = join(androidDir, 'core', 'src', 'main', 'kotlin')

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

  // VOX-501 (constat du 2026-10-26) : avec un filtre sur tout l'hôte, l'application Repas avalait la page de liaison d'Alexa
  // (« https://kantin.eu/alexa/lier », ouverte par l'application Alexa) au lieu du navigateur. Seuls les liens envoyés par courriel entrent.
  describe('les liens que l’application capture (VOX-501)', () => {
    const filter = /<intent-filter android:autoVerify="true">([\s\S]*?)<\/intent-filter>/.exec(manifest)?.[1] ?? ''
    const dataElements = [...filter.matchAll(/<data\b([^>]*?)\/>/g)].map((match) => match[1] ?? '')
    const hostElements = dataElements.filter((element) => element.includes('android:host='))
    const pathElements = dataElements.filter((element) => !element.includes('android:host='))
    const paths = pathElements.map((element) => /android:path="([^"]+)"/.exec(element)?.[1] ?? '')
    // Les liens que le back envoie par courriel : MailerEmailVerificationNotifier (« /confirmation-email?token=… »)
    // et MailerPasswordResetNotifier::CONFIRMATION_PATH (« /mot-de-passe-oublie/confirmation?token=… »)
    const emailedLinks = ['/confirmation-email', '/mot-de-passe-oublie/confirmation']
    const router = readFileSync(join(srcDir, 'router', 'index.ts'), 'utf8')

    /** Ce que fait Android d'un lien https vers l'hôte de Repas : il n'entre dans l'application que si son chemin est l'un des chemins du filtre. */
    const captured = (path: string) => paths.includes(path)

    it('garde l’hôte sur un seul élément, et ne capture que des chemins exacts, jamais tout l’hôte', () => {
      expect(hostElements).toHaveLength(1)
      expect(hostElements[0]).toContain('android:scheme="https"')
      expect(hostElements[0]).not.toMatch(/android:(path|pathPrefix|pathPattern|pathAdvancedPattern|pathSuffix)=/)
      // Au moins un chemin : sans lui, le filtre prend tout l'hôte
      expect(pathElements.length).toBeGreaterThan(0)
      for (const element of pathElements) {
        expect(element).toMatch(/^\s*android:path="\/[^"]+"\s*$/)
      }
      expect(manifest).not.toMatch(/android:(pathPrefix|pathPattern|pathAdvancedPattern|pathSuffix)=/)
    })

    it('capture exactement les liens envoyés par courriel, et ils sont des routes du site', () => {
      expect([...paths].sort()).toEqual([...emailedLinks].sort())
      for (const path of emailedLinks) {
        expect(captured(path)).toBe(true)
        expect(router).toContain(`path: '${path}'`)
      }
    })

    it('laisse au navigateur la liaison d’Alexa et toutes les autres pages', () => {
      for (const path of ['/alexa/lier', '/alexa', '/alexa/lier/', '/confidentialite', '/connexion', '/inscription', '/installer', '/mot-de-passe-oublie', '/verification-email', '/liste', '/moi', '/']) {
        expect(`${path} : ${captured(path)}`).toBe(`${path} : false`)
      }
      // Hors des commentaires qui expliquent la règle, le manifeste ne nomme jamais Alexa
      expect(manifest.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/alexa/i)
    })
  })

  it('ne laisse lancer le drive que par la coquille', () => {
    expect(/<activity[^>]*android:name="\.DriveActivity"[^>]*android:exported="false"/s.test(manifest)).toBe(true)
  })

  it('masque le drive dans l’aperçu des applications récentes et les captures d’écran, sauf dans l’APK de débogage', () => {
    // Les essais de l’émulateur (captures lues avant de conclure) et la recette sur téléphone s’appuient sur les captures de l’APK de débogage.
    const drive = read(join(kotlinDir, 'eu', 'kantin', 'repas', 'drive', 'DriveActivity.kt'))

    expect(drive).toContain('if (!BuildConfig.DEBUG) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)')
  })

  it('n’autorise pas le trafic en clair', () => {
    expect(manifest).toContain('android:usesCleartextTraffic="false"')
  })

  it('ne rattache aucun de ses deux écrans à une tâche par un nom d’affinité', () => {
    const activities = [...manifest.matchAll(/<activity\b[^>]*>/gs)].map((match) => match[0])

    expect(activities.map((tag) => /android:name="([^"]+)"/.exec(tag)?.[1])).toEqual([
      '.MainActivity',
      '.DriveActivity',
    ])
    for (const tag of activities) expect(tag).toMatch(/android:taskAffinity=""/)
    expect(manifest).not.toMatch(/android:taskAffinity="[^"]/)
  })
})

describe('le mode d’emploi de l’application', () => {
  const strings = read(join(androidDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml'))

  // Les pages de Leclerc chargent leurs propres services (anti-robot, mesure) et la WebView du drive accepte leurs cookies : ne pas dire
  // que l'application « ne parle qu'à leclercdrive.fr ». Le mode d'emploi ne dit plus rien de ce fond (DRV-628) ; il est dit, honnêtement,
  // dans les conditions d'utilisation du drive.
  it('ne prétend pas que le drive ne contacte que leclercdrive.fr', () => {
    expect(strings).not.toContain('ne parle qu’à leclercdrive.fr')
    expect(strings).not.toContain('ne contacte que Leclerc')
    const terms = read(join(srcDir, 'i18n', 'fr.ts'))
    expect(terms).toContain('les pages {retailerDe} font appel à leurs propres services')
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
  const sources = [...files(kotlinDir, /\.kt$/), ...files(coreKotlinDir, /\.kt$/)].map((path) => ({ path, text: read(path) }))

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
