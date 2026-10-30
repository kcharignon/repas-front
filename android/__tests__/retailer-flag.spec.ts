// @vitest-environment node
// Auchan est inscrite et ÉTEINTE (DRV-728) : ce que `make check` garde sans construire l'application. Les règles de chaque enseigne sont jouées par les
// tests Kotlin (`AuchanSiteTest`, `RetailerSitesTest`) ; ici, le MÉCANISME qui laisse la version publiée sans menu, sans annonce et sans origine du pont
// d'une enseigne éteinte : un drapeau de construction (`ANDROID_EXTRA_RETAILERS` → `BuildConfig.EXTRA_RETAILERS` → `RetailerSites.serving`), vide et
// refusé dans toute publication, vérifié par `build.sh`, et aucun nom d'enseigne dans l'application.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = join(androidDir, '..')
const appSrc = join(androidDir, 'app', 'src')
const kotlinDir = join(appSrc, 'main', 'kotlin', 'eu', 'kantin', 'repas', 'drive')

const read = (path: string) => readFileSync(path, 'utf8')
const kotlin = (name: string) => read(join(kotlinDir, name))
const gradle = read(join(androidDir, 'app', 'build.gradle.kts'))
const buildScript = read(join(androidDir, 'build.sh'))

function allFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? allFiles(path) : [path]
  })
}

/** Le code sans ses commentaires (KDoc compris). */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')
}

/** Le corps d'un bloc `getByName("<nom>") { … }` du fichier Gradle de l'application. */
function buildType(name: string): string {
  const types = gradle.indexOf('buildTypes {')
  expect(types).toBeGreaterThan(-1)
  const start = gradle.indexOf(`getByName("${name}") {`, types)
  expect(start, `le type de construction ${name} existe`).toBeGreaterThan(-1)
  return gradle.slice(start, gradle.indexOf('\n        }\n', start))
}

describe('le drapeau de construction des enseignes éteintes', () => {
  it('est lu de l’environnement pour le débogage seulement, et refusé s’il est mal écrit', () => {
    expect(gradle).toContain('val extraRetailers = env("ANDROID_EXTRA_RETAILERS") ?: ""')
    expect(gradle).toContain('[a-z][a-z0-9]{0,19}(,[a-z][a-z0-9]{0,19})*')
    expect(buildType('debug')).toContain('buildConfigField("String", "EXTRA_RETAILERS", "\\"$extraRetailers\\"")')
  })

  it('est vide, écrit en dur, dans la publication, quoi que dise l’environnement', () => {
    const release = buildType('release')

    expect(release).toContain('buildConfigField("String", "EXTRA_RETAILERS", "\\"\\"")')
    expect(release).not.toContain('extraRetailers')
    expect(release).not.toContain('ANDROID_EXTRA_RETAILERS')
  })

  it('fait refuser toute publication construite avec la variable', () => {
    const start = gradle.indexOf('val verifyReleaseInputs by tasks.registering')
    expect(start).toBeGreaterThan(-1)
    const verify = gradle.slice(start, gradle.indexOf('\n}\n', start))

    expect(verify).toContain('if (extraRetailers.isNotEmpty())')
    expect(verify).toContain('Une publication n\'embarque aucune enseigne éteinte')
    // et la vérification précède toutes les autres, donc toute tâche de publication la subit
    expect(verify.indexOf('extraRetailers.isNotEmpty()')).toBeLessThan(verify.indexOf('val missing'))
    expect(gradle).toMatch(/\^pre\\w\*ReleaseBuild\$/)
  })

  it('est contrôlé par build.sh : vide dans les deux variantes de publication, refusé par la publication, vide dans l’APK contrôlé', () => {
    expect(buildScript).toMatch(/for flavor in direct play[\s\S]*?EXTRA_RETAILERS = "";/)
    expect(buildScript).toContain('ANDROID_EXTRA_RETAILERS=auchan')
    expect(buildScript).toContain(':app:preDirectReleaseBuild')
    expect(buildScript).toContain('n\'embarque aucune enseigne éteinte')
    // verify-release lit le BuildConfig de l'APK de publication
    const verify = buildScript.slice(buildScript.indexOf('verify_release() {'), buildScript.indexOf('release_selftest() {'))
    expect(verify).toContain('EXTRA_RETAILERS = "";')
    // et l'essai de la publication n'en hérite pas de l'environnement du développeur
    expect(buildScript).toContain('env -u ANDROID_VERSION_CODE -u ANDROID_EXTRA_RETAILERS')
  })

  it('traverse Docker (compose) comme les autres variables de construction de débogage', () => {
    expect(read(join(repoDir, 'compose.yaml'))).toMatch(/- ANDROID_APK_NAME\n(\s+#.*\n)*\s+- ANDROID_EXTRA_RETAILERS\n/)
  })

  it('n’est posé par aucun workflow : ni la CI, ni la publication ne l’allument', () => {
    const workflows = join(repoDir, '.github', 'workflows')
    const mentioning = readdirSync(workflows).filter((file) => read(join(workflows, file)).includes('ANDROID_EXTRA_RETAILERS'))

    expect(mentioning).toEqual([])
  })
})

describe('l’application ne nomme aucune enseigne et ne passe que par le drapeau', () => {
  const app = kotlin('RepasApp.kt')
  const main = kotlin('MainActivity.kt')

  it('RepasApp annonce le registre que le drapeau donne, et sert ce registre plus les enseignes d’essai', () => {
    expect(app).toContain('internal val announced: RetailerSites by lazy { RetailerSites.serving(BuildConfig.EXTRA_RETAILERS) }')
    expect(app).toContain('if (TestRetailers.extra.isEmpty()) announced else RetailerSites(announced.all + TestRetailers.extra, legacy = announced.legacy)')
  })

  it('l’annonce à Repas et le menu viennent de ce registre, jamais de la table complète ni de la liste des enseignes éteintes', () => {
    expect(main).toContain('retailers = repasApp.announced.announcedRetailers()')
    expect(main).toContain('val announced = repasApp.announced.all')
    for (const file of allFiles(join(appSrc, 'main', 'kotlin')).concat(allFiles(join(appSrc, 'direct', 'kotlin')), allFiles(join(appSrc, 'play', 'kotlin')))) {
      const code = codeOf(read(file))
      expect({ file, switchedOff: code.includes('SWITCHED_OFF'), registered: code.includes('REGISTERED') }).toEqual({ file, switchedOff: false, registered: false })
    }
  })

  it('aucun fichier de l’application ne nomme une enseigne éteinte (seul le registre du cœur le fait)', () => {
    const registry = codeOf(read(join(androidDir, 'core', 'src', 'main', 'kotlin', 'eu', 'kantin', 'repas', 'drive', 'RetailerSites.kt')))
    // Leclerc, l’enseigne d’avant, reste nommée par les actifs de débogage (plan d’essai) : seules les enseignes éteintes sont à l’abri de toute mention.
    const ids = [...registry.matchAll(/\bid = "([a-z][a-z0-9]*)"/g)].map((match) => match[1] as string).filter((id) => id !== 'leclerc')
    expect(ids).toEqual(['auchan'])

    const files = allFiles(appSrc).filter((path) => /\.(kt|kts|xml|json|js)$/.test(path) && !path.includes(join('src', 'test')))
    for (const id of ids) {
      // Seule exception (DRV-735) : le modèle de plan d'essai de CETTE enseigne, une donnée de la variante de débogage seulement (`src/debug/assets/`) qui dit son
      // enseigne ; le même fichier dans un autre dossier (publication comprise) reste une faute.
      const planModel = join(appSrc, 'debug', 'assets', `debug-plan.${id}.json`)
      const offenders = files.filter((path) => path !== planModel && new RegExp(id, 'i').test(codeOf(read(path))))
      expect({ id, offenders: offenders.map((path) => path.slice(androidDir.length + 1)) }).toEqual({ id, offenders: [] })
    }
  })

  it('la variante de publication ne voit aucun hôte d’Auchan dans ses sources propres (les enseignes d’essai sont vides)', () => {
    expect(read(join(appSrc, 'release', 'kotlin', 'eu', 'kantin', 'repas', 'drive', 'TestRetailers.kt'))).toContain('val extra: List<RetailerSite> = emptyList()')
  })
})
