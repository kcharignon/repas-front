// @vitest-environment node
// L'écran du drive par enseigne (DRV-707) : ce que `make check` garde sans construire l'application. Les règles elles-mêmes (navigation, origines,
// profils, plan refusé) sont jouées par les tests Kotlin (`ScreenRetailerTest`, `RetailerIsolationTest`) et par `make android-e2e` ; ici : les textes
// rendus pour Leclerc sont ceux d'avant, aucun texte ne nomme une enseigne à la main, et les fichiers de l'application ne retombent pas sur Leclerc.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const appSrc = join(androidDir, 'app', 'src')
const kotlinDir = join(appSrc, 'main', 'kotlin', 'eu', 'kantin', 'repas', 'drive')

const read = (path: string) => readFileSync(path, 'utf8')
const strings = read(join(appSrc, 'main', 'res', 'values', 'strings.xml'))
const kotlin = (name: string) => read(join(kotlinDir, name))

/** Le texte d'une ressource `strings.xml` (sans les entités XML ni les échappements Android que ces textes n'emploient pas). */
function resource(name: string): string {
  const match = new RegExp(`<string name="${name}">([^<]*)</string>`).exec(strings)
  expect(match, `la ressource ${name} existe`).not.toBeNull()
  return match?.[1] ?? ''
}

/** Ce que l'application affiche : `%1$s` est le nom de l'enseigne, `%2$s` sa forme avec « de », puis les arguments propres du texte. */
function rendered(name: string, ...args: string[]): string {
  return resource(name)
    .replace(/%(\d+)\$s/g, (_, index: string) => args[Number(index) - 1] ?? '')
    .replace(/\\n/g, '\n')
}

const LECLERC = ['Leclerc', 'de Leclerc']

describe('les textes rendus pour Leclerc sont ceux d’avant le multi-enseignes', () => {
  it.each([
    ['menu_open_drive', 'Ouvrir le drive Leclerc'],
    ['menu_logout_drive', 'Se déconnecter de Leclerc'],
    [
      'clear_message',
      'Tu seras déconnecté de Leclerc : les cookies, les données du site et l’historique du drive seront effacés de cette application. Ta session Repas reste ouverte.',
    ],
    [
      'clear_message_shared',
      'Tu seras déconnecté de Leclerc : les cookies, les données du site et l’historique seront effacés de cette application. Sur ce téléphone, Repas et le drive ne sont pas séparés : tu seras déconnecté de Repas aussi.',
    ],
    [
      'plan_banner',
      'Cette page n’est pas celle de ton magasin : Leclerc ne l’a pas ouverte ou ne répond pas. Touche « Ouvrir l’accueil du drive » pour recommencer. Le bouton retour du téléphone annule.',
    ],
    [
      'plan_banner_mobile',
      'Leclerc affiche son site mobile : ce n’est pas la version ordinateur du site, et Repas ne peut pas y agir. Touche « Ouvrir l’accueil du drive » pour recommencer. Le bouton retour du téléphone annule.',
    ],
    [
      'plan_banner_verification',
      'Leclerc demande une vérification. Fais-la sur la page. Sinon, touche « Ouvrir l’accueil du drive ». Le bouton retour du téléphone annule.',
    ],
    [
      'about_manual',
      'Repas affiche tes recettes et tes listes de courses, comme sur le site.\n\nPour envoyer une liste au drive Leclerc, touche « Envoyer au drive » dans la liste : le drive s’ouvre sur un second écran, l’application y remplit le panier, puis tu reviens ici avec le récapitulatif. C’est toi qui te connectes sur le site de Leclerc.\n\n• Le bouton retour du téléphone revient à la page précédente.\n• Un lien vers un autre site s’ouvre dans le navigateur du téléphone.\n• Pour changer de compte Leclerc ou effacer les données du drive : menu, « Se déconnecter de Leclerc ».',
    ],
  ])('%s', (name, expected) => {
    expect(rendered(name, ...LECLERC)).toBe(expected)
  })

  it('about_finalize garde sa forme avec le nom de l’enseigne et le mot du dernier « Finaliser »', () => {
    expect(rendered('about_finalize', 'Leclerc', 'OUVERTE')).toBe('Dernier « Finaliser sur Leclerc » : OUVERTE')
  })

  it('un texte sans trou rend le même quel que soit l’enseigne', () => {
    expect(rendered('plan_banner_open', 'Autre', 'd’Autre')).toBe('Touche « Commencer mes courses ».')
    expect(rendered('basket_banner', 'Autre', 'd’Autre')).toBe('Ton panier est dans l’icône en haut à droite.')
  })

  it('une autre enseigne est nommée à la place de Leclerc, avec « d’ » devant une voyelle', () => {
    expect(rendered('menu_logout_drive', 'Auchan', 'd’Auchan')).toBe('Se déconnecter d’Auchan')
    expect(rendered('menu_open_drive', 'Auchan', 'd’Auchan')).toBe('Ouvrir le drive Auchan')
    expect(rendered('plan_banner_verification', 'Auchan', 'd’Auchan')).toMatch(/^Auchan demande une vérification/)
  })
})

describe('aucune ressource ne nomme une enseigne à la main', () => {
  it('ne contient ni « Leclerc » ni le domaine d’une enseigne', () => {
    expect(strings).not.toMatch(/leclerc/i)
    expect(strings).not.toMatch(/https?:\/\//)
  })

  it('formate chaque texte à trous avec des indices positionnels, jamais « %s » seul', () => {
    expect(strings.match(/%s|%d/g) ?? []).toEqual([])
  })
})

describe('l’écran du drive est celui d’une enseigne', () => {
  const drive = kotlin('DriveActivity.kt')

  it('ne retombe sur aucune forme sans enseigne de la politique de navigation', () => {
    // Les formes sans enseigne (`NavigationPolicy.START_URL`, `decide(url)`, `isAllowed(url)`) sont celles de l’enseigne d’avant : l’écran passe son enseigne.
    expect(drive).not.toMatch(/NavigationPolicy\.(START_URL|isAllowed|isMobileSite|isStorePage|isHomePage|isLoginPage)\b/)
    expect(drive).not.toMatch(/NavigationPolicy\.decide\((?!site, )/)
    const entryCalls = drive.split('\n').filter((line) => /DriveEntry\.(startPage|isStoreHome|isArrivalPage)\(/.test(line))

    expect(entryCalls.length).toBeGreaterThan(0)
    for (const line of entryCalls) expect(line).toContain(', site)')
  })

  it('choisit son enseigne à la création : le passage d’abord, puis l’extra, puis l’enseigne d’avant', () => {
    expect(drive).toContain('site = pass.current()?.request?.site ?: repasApp.sites.forScreen(intent?.getStringExtra(EXTRA_RETAILER))')
    expect(drive).toContain('watch = OpeningWatch(site)')
  })

  it('range la WebView dans le profil de son enseigne, avant tout chargement, avec le mode de son site', () => {
    expect(drive).toContain('DriveProfile.attach(view, site, repasApp.sites)')
    expect(drive).toContain('DesktopMode.apply(this, view.settings, site.siteMode)')
    const create = drive.slice(drive.indexOf('private fun createWebView()'))

    expect(create.indexOf('DriveProfile.attach(')).toBeGreaterThan(-1)
    expect(create.indexOf('DriveProfile.attach(')).toBeLessThan(create.indexOf('DesktopMode.apply('))
    // et la WebView est créée avant tout chargement
    expect(drive.indexOf('webView = createWebView()')).toBeLessThan(drive.indexOf('webView.loadUrl(firstUrl())'))
  })

  it('pose le pont et l’injection avant le premier chargement, avec l’enseigne de l’écran', () => {
    expect(drive).toContain('AgentHost.create(repasApp.agentLoad, BuildConfig.DEBUG, site,')
    const create = drive.slice(drive.indexOf('private fun createWebView()'))

    expect(create.indexOf('agent.attach(view)')).toBeGreaterThan(-1)
    expect(create.indexOf('agent.attach(view)')).toBeLessThan(create.indexOf('view.webViewClient = DriveWebViewClient()'))
    expect(drive.indexOf('webView = createWebView()')).toBeLessThan(drive.indexOf('webView.loadUrl(firstUrl())'))
  })

  it('ne livre le message du passage qu’aux pages de l’enseigne du passage', () => {
    expect(drive).toContain('if (request.site !== site) return delivery.failed()')
    expect(drive).toContain('watch.canDeliver(request, webView.url)')
    expect(drive).toContain('if (plan.site !== site) return false')
  })

  it('« Se déconnecter » n’efface que le profil et les mémoires de l’enseigne de l’écran', () => {
    expect(drive).toContain('DriveProfile.clear(webView, site, repasApp.sites)')
    expect(drive).toContain('repasApp.storePaths.forget(site)')
    expect(drive).toContain('repasApp.finalizeOutcomes.forget(site)')
    // jamais l’oubli de toutes les enseignes d’un coup
    expect(drive).not.toMatch(/storePaths\.forget\(\)|finalizeOutcomes\.forget\(\)/)
  })

  it('le repli d’injection de l’agent ne vaut que sur une page où le pont existe pour l’enseigne', () => {
    const host = kotlin('AgentHost.kt')

    expect(host).toContain('!site.isBridgePage(url)')
    expect(host).not.toContain('NavigationPolicy.isAllowed')
    expect(host).not.toContain('BridgeMessages.ORIGIN_RULES')
  })
})

describe('le profil de WebView de chaque enseigne', () => {
  const profile = kotlin('DriveProfile.kt')

  it('est nommé par le cœur, et l’enseigne d’avant garde le profil « drive »', () => {
    expect(profile).toContain('DriveProfileName.of(site, sites)')
    expect(profile).not.toMatch(/"drive"/)
    expect(read(join(androidDir, 'core', 'src', 'main', 'kotlin', 'eu', 'kantin', 'repas', 'drive', 'DriveProfileName.kt'))).toContain('const val LEGACY = "drive"')
  })
})

describe('l’annonce de la coquille et ses mémoires', () => {
  const main = kotlin('MainActivity.kt')
  const app = kotlin('RepasApp.kt')

  it('annonce les enseignes de la construction (registre de la version et drapeau), jamais une enseigne d’essai', () => {
    expect(main).toContain('retailers = repasApp.announced.announcedRetailers()')
  })

  it('ne lit le pont natif qu’avec les enseignes que cette construction sert', () => {
    expect(main).toContain('NativeBridge.screen(text, origin, isMainFrame, repasOrigin, repasApp.sites)')
  })

  it('range les mémoires du drive par enseigne dans la préférence « drive-store », sur les clés du cœur', () => {
    expect(app).toContain('StorePathMemories(sites, driveStore)')
    expect(app).toContain('FinalizeOutcomeMemories(sites, driveStore)')
    expect(app).toContain('getSharedPreferences("drive-store", Context.MODE_PRIVATE)')
    // pas de clé écrite à la main : le cœur choisit `path.<enseigne>` et `finalize.<enseigne>`
    expect(app).not.toMatch(/const val KEY = "(path|finalize)"/)
  })

  it('passe le registre au passage gardé, pour qu’une reprise garde l’enseigne du passage', () => {
    expect(app).toMatch(/DrivePass\([\s\S]*sites = sites,/)
  })
})

describe('les enseignes d’essai ne sont que dans la variante de débogage', () => {
  const debug = read(join(appSrc, 'debug', 'kotlin', 'eu', 'kantin', 'repas', 'drive', 'TestRetailers.kt'))
  const release = read(join(appSrc, 'release', 'kotlin', 'eu', 'kantin', 'repas', 'drive', 'TestRetailers.kt'))

  function allFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? allFiles(path) : [path]
    })
  }

  it('la construction de publication n’en a aucune', () => {
    expect(release).toContain('val extra: List<RetailerSite> = emptyList()')
    expect(release).not.toContain('exemple')
  })

  it('celle de débogage est fictive (domaine réservé .test) et n’est jamais celle d’une vraie enseigne', () => {
    expect(debug).toContain('https://www.exemple-b.test/')
    expect(debug).not.toMatch(/leclerc|auchan|carrefour|intermarch|lidl/i)
  })

  it('aucun autre fichier de l’application ne nomme l’enseigne d’essai, sauf les tests', () => {
    const offenders = allFiles(appSrc)
      .filter((path) => path.endsWith('.kt') && !path.includes(`${join('src', 'test')}`) && !path.endsWith(join('debug', 'kotlin', 'eu', 'kantin', 'repas', 'drive', 'TestRetailers.kt')))
      .filter((path) => /exemple-b|exempleb/.test(read(path)))

    expect(offenders.map((path) => path.slice(androidDir.length + 1))).toEqual([])
  })

  it('la variante de publication ne compile pas le dossier de débogage', () => {
    // `src/debug` est le dossier du type de construction « debug » : Gradle ne le prend jamais pour « release ».
    expect(read(join(androidDir, 'app', 'build.gradle.kts'))).not.toMatch(/sourceSets[\s\S]*debug/)
  })
})
