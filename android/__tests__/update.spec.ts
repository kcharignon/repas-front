// @vitest-environment node
// La mise à jour de l'application par elle-même (DRV-639) : ce qui doit rester vrai du code Kotlin, des manifestes, des variantes de
// distribution et du protocole avec la page. Les règles elles-mêmes (adresses, empreinte, états, effacement) sont jouées par les tests JUnit
// du cœur (`make android-test`) ; ici, des garde-fous d'architecture et de sécurité rejoués dans `make check`, sans construire l'application.
import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { UPDATE_STATUSES } from '../../src/features/drive/bridge'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (...path: string[]) => readFileSync(join(androidDir, ...path), 'utf8')

function files(dir: string, extension: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path, extension) : extension.test(entry.name) ? [path] : []
  })
}

/** Le code sans ses commentaires (KDoc compris) : une phrase qui dit « pas de `DownloadManager` » ne compte pas. */
const codeOf = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')

const src = (flavor: string) => join(androidDir, 'app', 'src', flavor)
const core = join(androidDir, 'core', 'src', 'main', 'kotlin')

const sources = [
  ...files(core, /\.kt$/),
  ...files(src('main'), /\.kt$/),
  ...files(src('direct'), /\.kt$/),
  ...files(src('play'), /\.kt$/),
].map((path) => ({
  path,
  name: basename(path),
  where: relative(androidDir, path),
  code: codeOf(readFileSync(path, 'utf8')),
}))
const named = (name: string) => sources.find((source) => source.name === name)!

describe('les adresses de la mise à jour sont écrites en dur, à un seul endroit', () => {
  it('GitHub n’est nommé que par UpdateSource.kt', () => {
    const offenders = sources.filter(({ code }) => /github/i.test(code)).map(({ where }) => where)

    expect(offenders).toEqual(['core/src/main/kotlin/eu/kantin/repas/drive/UpdateSource.kt'])
  })

  it('aucune connexion réseau ailleurs que dans le port HTTP de la variante hors Google Play', () => {
    const offenders = sources
      .filter(({ code }) => /openConnection|HttpURLConnection|HttpsURLConnection|java\.net\.URL\b|OkHttp|DownloadManager/.test(code))
      .map(({ where }) => where)

    expect(offenders).toEqual(['app/src/direct/kotlin/eu/kantin/repas/drive/UpdateServices.kt'])
  })

  it('le port HTTP ne suit aucune redirection, reste en https et demande le fichier tel quel', () => {
    const { code } = named('UpdateServices.kt')

    expect(code).toContain('instanceFollowRedirects = false')
    expect(code).toContain('startsWith("https://")')
    expect(code).toContain('"Accept-Encoding", "identity"')
    expect(code).not.toMatch(/setRequestProperty\("(Cookie|Authorization)"/)
    expect(code).not.toContain('HttpURLConnection(') // jamais de connexion en clair
  })

  it('le cœur juge chaque redirection avant de la suivre (SafeFetcher) et n’a que trois hôtes de pièces jointes', () => {
    const fetcher = named('UpdateTransfer.kt').code
    const source = read('core/src/main/kotlin/eu/kantin/repas/drive/UpdateSource.kt')

    expect(fetcher).toContain('UpdateSource.isTrustedRedirect(next)')
    expect(fetcher).toContain('UpdateSource.isReleaseFile(first)')
    const hosts = [...source.matchAll(/^\s+"([a-z.-]+\.githubusercontent\.com)",$/gm)].map((match) => match[1])
    expect(hosts).toEqual([
      'release-assets.githubusercontent.com',
      'objects.githubusercontent.com',
      'github-releases.githubusercontent.com',
    ])
    expect(source).not.toMatch(/\*\.githubusercontent|endsWith\(/)
  })

  it('l’adresse de l’APK est calculée du nom de version validé, jamais lue dans version.json', () => {
    const release = named('ReleaseInfo.kt').code
    const flow = named('UpdateFlow.kt').code

    expect(release).not.toMatch(/apkUrl/)
    expect(flow).toContain('UpdateSource.apkUrl(info.versionName)')
    expect(flow).toContain('UpdateSource.VERSION_JSON_URL')
  })
})

describe('l’APK téléchargé reste dans l’espace privé de l’application', () => {
  const app = sources.filter(({ where }) => where.startsWith('app/'))

  it('n’utilise ni le dossier de téléchargements, ni le stockage partagé, ni le gestionnaire de téléchargements', () => {
    const offenders = app
      .filter(({ code }) =>
        /getExternalFilesDir|getExternalStorage|getExternalCacheDir|DIRECTORY_DOWNLOADS|MediaStore|DownloadManager|WRITE_EXTERNAL|Uri\.fromFile|file:\/\//.test(
          code,
        ),
      )
      .map(({ where }) => where)

    expect(offenders).toEqual([])
  })

  it('écrit dans files/update/ et le dit au fournisseur de fichiers, qui n’expose que ce dossier', () => {
    expect(named('UpdateServices.kt').code).toContain('DIRECTORY_NAME = "update"')
    expect(named('SelfUpdateDirect.kt').code).toContain('File(activity.filesDir, PrivateUpdateStorage.DIRECTORY_NAME)')
    const paths = read('app/src/direct/res/xml/update_file_paths.xml')
    expect([...paths.matchAll(/<([a-z-]+-path)\b[^>]*path="([^"]*)"/g)].map((match) => [match[1], match[2]])).toEqual([
      ['files-path', 'update/'],
    ])
  })

  it('le fournisseur de fichiers est privé et ne donne qu’un droit de lecture à l’installateur', () => {
    const manifest = read('app/src/direct/AndroidManifest.xml')
    const provider = /<provider[\s\S]*?<\/provider>/.exec(manifest)?.[0] ?? ''

    expect(provider).toContain('android:name="androidx.core.content.FileProvider"')
    expect(provider).toContain('android:exported="false"')
    expect(provider).toContain('android:grantUriPermissions="true"')
    expect(provider).toContain('android:authorities="${applicationId}.updates"')
    expect(manifest.match(/<provider\b/g)).toHaveLength(1)
    const installer = named('SelfUpdateDirect.kt').code
    expect(installer).toContain('FLAG_GRANT_READ_URI_PERMISSION')
    expect(installer).not.toContain('FLAG_GRANT_WRITE_URI_PERMISSION')
    expect(installer).toContain('"${activity.packageName}.updates"')
  })

  it('l’installateur ne reçoit qu’une intention d’installation, jamais une adresse de la page', () => {
    const installer = named('SelfUpdateDirect.kt').code

    expect(installer).toContain('Intent.ACTION_INSTALL_PACKAGE')
    expect(installer).toContain('startActivityForResult(intent, REQUEST_INSTALL)')
    // Le résultat de l'installateur efface le fichier, quel qu'il soit
    expect(installer).toMatch(/onInstallerResult[\s\S]*flow\.installerClosed\(\)/)
  })

  it('le fichier est relu et revérifié juste avant l’installateur', () => {
    const installer = named('SelfUpdateDirect.kt').code

    expect(installer.indexOf('flow.revalidate()')).toBeGreaterThan(0)
    expect(installer.indexOf('flow.revalidate()')).toBeLessThan(installer.indexOf('openInstaller()'))
  })

  it('le démarrage de la coquille (jamais du processus) efface ce qu’une mise à jour a laissé', () => {
    const installer = named('SelfUpdateDirect.kt').code
    const activity = named('MainActivity.kt').code

    expect(installer).toMatch(/init \{[\s\S]*storage\.purge\(\)/)
    expect(activity).toContain('selfUpdate = createSelfUpdate(this, ::post)')
    expect(named('RepasApp.kt').code).not.toMatch(/purge|SelfUpdate/)
  })

  it('une construction de débogage ne se met jamais à jour (sa clé est publique)', () => {
    expect(named('SelfUpdateDirect.kt').code).toContain('override val supported: Boolean = !BuildConfig.DEBUG')
  })

  it('la signature d’Android n’est jamais contournée : aucune installation silencieuse, aucun réglage de signature', () => {
    const offenders = sources
      .filter(({ code }) =>
        /PackageInstaller|INSTALL_ALLOW_TEST|INSTALL_REPLACE_EXISTING|INSTALL_ALLOW_DOWNGRADE|pm\s+install|setInstallReason|EXTRA_NOT_UNKNOWN_SOURCE|INSTALL_NON_MARKET|REQUEST_DELETE_PACKAGES|ACTION_DELETE|ACTION_UNINSTALL/.test(code),
      )
      .map(({ where }) => where)

    expect(offenders).toEqual([])
  })

  it('le contrôle du fichier refuse un autre paquet, un code qui ne monte pas, une version de débogage et un autre signataire', () => {
    const platform = named('UpdateServices.kt').code

    expect(platform).toContain('archive.packageName != context.packageName')
    expect(platform).toContain('archiveCode != expectedCode')
    expect(platform).toContain('archiveCode <= codeOf(installed)')
    expect(platform).toContain('FLAG_DEBUGGABLE')
    expect(platform).toContain('offered.containsAll(wanted)')
  })
})

describe('les deux variantes de distribution', () => {
  it('la permission d’installer n’est déclarée que dans la variante direct', () => {
    const permissions = (text: string) => [...text.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)].map((match) => match[1])

    expect(permissions(read('app/src/main/AndroidManifest.xml'))).toEqual(['android.permission.INTERNET'])
    expect(permissions(read('app/src/direct/AndroidManifest.xml'))).toEqual(['android.permission.REQUEST_INSTALL_PACKAGES'])
  })

  it('l’APK de débogage (direct) retire la permission et le fournisseur : il ne se met jamais à jour lui-même', () => {
    const debug = read('app/src/directDebug/AndroidManifest.xml')

    expect(debug).toContain('<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" tools:node="remove" />')
    expect(debug).toContain('<provider android:name="androidx.core.content.FileProvider" tools:node="remove" />')
  })

  it('la variante play n’a ni manifeste, ni ressource, ni fournisseur, ni autre code que son remplaçant', () => {
    const play = src('play')
    const all = files(play, /.*/).map((path) => relative(play, path))

    expect(all).toEqual(['kotlin/eu/kantin/repas/drive/SelfUpdatePlay.kt'])
    const code = named('SelfUpdatePlay.kt').code
    expect(code).toContain('object NoSelfUpdate : SelfUpdate')
    expect(code).toContain('override val supported = false')
    expect(code).not.toMatch(/Intent|FileProvider|Settings|URL|File\(|Executor/)
  })

  it('le code commun ne connaît que l’interface SelfUpdate', () => {
    const main = sources.filter(({ where }) => where.startsWith('app/src/main/'))
    const offenders = main
      .filter(({ name, code }) => name !== 'SelfUpdate.kt' && /DirectSelfUpdate|HttpsHop|PrivateUpdateStorage|AndroidUpdatePlatform|FileProvider|REQUEST_INSTALL/.test(code))
      .map(({ where }) => where)

    expect(offenders).toEqual([])
    expect(named('MainActivity.kt').code).toContain('createSelfUpdate(this, ::post)')
  })

  it('Gradle déclare les deux variantes et la construction de publication vise la variante direct', () => {
    const gradle = codeOf(read('app/build.gradle.kts'))
    const build = read('build.sh')

    expect(gradle).toContain('flavorDimensions += "distribution"')
    expect(gradle).toContain('create("direct") { dimension = "distribution" }')
    expect(gradle).toContain('create("play") { dimension = "distribution" }')
    expect(build).toContain(':app:assembleDirectRelease')
    expect(build).toContain(':app:assembleDirectDebug')
    expect(build).toContain('check_distributions')
    // L'APK publié a exactement deux permissions : Internet et l'installation de sa mise à jour
    expect(build).toContain('android.permission.INTERNET android.permission.REQUEST_INSTALL_PACKAGES ')
  })

  it('la publication refuse sans clé pour toutes les variantes', () => {
    const gradle = codeOf(read('app/build.gradle.kts'))

    expect(gradle).toContain('^pre\\w*ReleaseBuild$')
    expect(gradle).toContain('^validateSigning\\w*Release$')
  })

  it('les textes natifs de la mise à jour ne sont que dans la variante direct', () => {
    expect(read('app/src/main/res/values/strings.xml')).not.toContain('update_permission')
    expect(read('app/src/direct/res/values/strings.xml')).toContain('update_permission_message')
  })
})

describe('le protocole du pont pour la mise à jour', () => {
  const state = read('core/src/main/kotlin/eu/kantin/repas/drive/UpdateState.kt')
  const bridge = read('core/src/main/kotlin/eu/kantin/repas/drive/NativeBridge.kt')

  it('les mots de l’état sont ceux que la page lit', () => {
    const words = [...state.matchAll(/override val wire = "([A-Za-z]+)"/g)].map((match) => match[1])

    expect(words).toEqual(['inconnu', 'verification', 'aJour', 'miseAJourDisponible', 'telechargement', 'pretAInstaller', 'erreur'])
    expect(words).toEqual([...UPDATE_STATUSES])
  })

  it('les messages de la page sont ceux que le pont envoie, et rien d’autre n’est reconnu', () => {
    const received = [...bridge.matchAll(/"(update\.[a-z]+)" -> NativeRequest/g)].map((match) => match[1])

    expect(received).toEqual(['update.status', 'update.check', 'update.start', 'update.cancel'])
    const front = readFileSync(join(androidDir, '..', 'src/features/drive/bridge/driveBridge.ts'), 'utf8')
    for (const type of received) expect(front).toContain(`type: '${type}'`)
    expect(state).toContain('UPDATE_STATE_TYPE = "update.state"')
  })

  it('les codes d’erreur sont des mots en majuscules, que la page traduit', () => {
    const codes = [...state.matchAll(/\("([A-Z_]+)"\)/g)].map((match) => match[1])

    expect(codes.length).toBeGreaterThanOrEqual(9)
    for (const code of codes) expect(code).toMatch(/^[A-Z][A-Z0-9_]{0,63}$/)
  })

  it('app.info ne parle de la mise à jour que si l’application la sait', () => {
    expect(bridge).toContain('if (selfUpdate) put("selfUpdate", true)')
  })
})
