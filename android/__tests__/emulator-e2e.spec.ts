// @vitest-environment node
// Les essais complets de l'émulateur (DRV-319, partie 2 : `make android-e2e`) ne tournent pas en CI (pas de KVM), mais ce qui les nourrit se
// vérifie ici : les plans que le faux Repas envoie doivent être de vrais plans du protocole v1 au magasin du faux Leclerc et ne citer que ses
// produits ; les scripts doivent au moins être de la syntaxe bash valide ; et l'application ne doit jamais accepter un faux certificat (le
// certificat du faux site n'est accepté que par la WebView de l'émulateur de test, réglée de l'extérieur).
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PRODUCTS } from '../../drive-agent/fake-leclerc/catalog'
import { HOME_HOST, STORE } from '../../drive-agent/fake-leclerc/server'
import { validatePlan, type PlanMessage } from '../../drive-agent/protocol'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const emulatorDir = join(androidDir, 'emulator')
const plansDir = join(emulatorDir, 'e2e')
const read = (path: string): string => readFileSync(path, 'utf8')
const RUN_ID = '8f14e45f-ceea-467a-9575-8e6b8c0a1b2c'
/** La commande du faux Repas (`testsite.py`, `MAX_COMMAND_BYTES`) : le plan et son enveloppe doivent y tenir. */
const COMMAND_BYTES = 16 * 1024

const planFiles = readdirSync(plansDir).filter((file) => file.endsWith('.json'))

function planOf(file: string): PlanMessage {
  return validatePlan(JSON.parse(read(join(plansDir, file)).replaceAll('__RUN_ID__', RUN_ID))) as PlanMessage
}

describe('les plans des scénarios de l’émulateur', () => {
  it('en compte au moins un complet (connus, nouveau, à la maison, ignoré), un court , un de quatre nouveaux articles (DRV-624) et un à la quantité à vérifier (DRV-626)', () => {
    expect(planFiles).toEqual([
      'plan-complet.json',
      'plan-connu.json',
      'plan-nouveaux.json',
      'plan-quantite.json',
    ])
    const statuses = new Set(planOf('plan-complet.json').lines.map((line) => line.status))
    expect([...statuses].sort()).toEqual(['HAVE_AT_HOME', 'KNOWN', 'NEW', 'SKIP'])
  })

  it.each(planFiles)('%s est un plan valide du protocole v1, au magasin du faux Leclerc', (file) => {
    expect(planOf(file).store).toEqual({ ...STORE })
  })

  it.each(planFiles)('%s ne laisse aucun marqueur oublié, à part celui du passage', (file) => {
    const text = read(join(plansDir, file))
    expect(text.match(/__[A-Z_]+__/g)).toEqual(['__RUN_ID__'])
  })

  it.each(planFiles)('%s ne cite que des produits du catalogue du faux Leclerc, avec leur libellé', (file) => {
    const problems = planOf(file).lines.flatMap((line) =>
      (line.products ?? []).flatMap((product) => {
        const found = PRODUCTS.find((candidate) => String(candidate.id) === product.id)
        if (!found) return [`produit ${product.id} de ${line.ingredientSlug} absent du catalogue`]
        const label = [found.label1, found.label2].filter(Boolean).join(' ')
        return [
          ...(product.label === label ? [] : [`libellé de ${product.id} : ${product.label} au lieu de ${label}`]),
          ...(found.stock > 0 ? [] : [`produit ${product.id} en rupture`]),
        ]
      }),
    )
    expect(problems).toEqual([])
  })

  it.each(planFiles)('%s tient dans une commande du faux Repas', (file) => {
    const oneLine = read(join(plansDir, file)).replace(/\n/g, '')
    expect(new TextEncoder().encode(`{"do":"drive.start","plan":${oneLine}}`).length).toBeLessThan(COMMAND_BYTES)
  })

  it('sont tous joués par e2e.sh', () => {
    const script = read(join(emulatorDir, 'e2e.sh'))
    expect(planFiles.filter((file) => !script.includes(file))).toEqual([])
  })
})

describe('les scripts de l’émulateur', () => {
  it.each(['lib.sh', 'smoke.sh', 'e2e.sh', 'ctl.sh', 'entrypoint.sh'])('%s est de la syntaxe bash valide', (file) => {
    const checked = spawnSync('bash', ['-n', join(emulatorDir, file)], { encoding: 'utf8' })
    expect(checked.stderr).toBe('')
    expect(checked.status).toBe(0)
  })

  it('jouent Auchan (DRV-731, DRV-738) contre le faux site d’Auchan, sur ses deux seuls hôtes de test, avec l’APK ordinaire', () => {
    const entrypoint = read(join(emulatorDir, 'entrypoint.sh'))
    const lib = read(join(emulatorDir, 'lib.sh'))
    const script = read(join(emulatorDir, 'e2e.sh'))
    const makefile = read(join(androidDir, '..', 'Makefile'))
    expect(entrypoint).toContain('--address=/www.auchan.fr/10.0.2.2 --address=/compte.auchan.fr/10.0.2.2')
    expect(entrypoint).not.toMatch(/--address=\/auchan\.fr\//)
    expect(entrypoint).toContain('DNS:www.auchan.fr,DNS:compte.auchan.fr')
    expect(lib).toContain('AUCHAN_HOST=www.auchan.fr')
    expect(lib).toContain('AUCHAN_LOGIN_HOST=compte.auchan.fr')
    expect(script).toContain('auchan_scenario')
    // Un seul APK de débogage, l'ordinaire : plus de second APK ni de drapeau de construction pour Auchan (elle est servie par la version publiée).
    expect(makefile).not.toContain('ANDROID_EXTRA_RETAILERS=auchan')
    expect(makefile).not.toContain('repas-drive-auchan.apk')
    expect(script).not.toContain('repas-drive-auchan.apk')
    const ordinary = makefile.split('\n').filter((line) => line.includes('ANDROID_APK_NAME=repas-drive-smoke.apk'))
    expect(ordinary.length).toBeGreaterThan(0)
    expect(ordinary.filter((line) => line.includes('ANDROID_EXTRA_RETAILERS'))).toEqual([])
    // L'APK ordinaire annonce Auchan et son menu la propose ; la preuve du pont sur l'hôte du mot de passe est gardée (jamais de pont sur compte).
    expect(script).toContain('"retailers": \\["leclerc", "auchan"\\]')
    expect(read(join(emulatorDir, 'smoke.sh'))).toContain("ui_has 'Ouvrir le drive Auchan'")
    expect(script).toContain('\\"hostLocked\\": false')
  })

  it('ne parlent qu’à des noms de faux sites, jamais à un vrai hôte', () => {
    const hosts = new Set(
      ['lib.sh', 'smoke.sh', 'e2e.sh']
        .flatMap((file) => read(join(emulatorDir, file)).match(/https?:\/\/[a-z0-9.$_{}-]+/gi) ?? [])
        .map((address) => address.replace(/^https?:\/\//i, '')),
    )
    expect([...hosts].sort()).toEqual(['$FAKE_STORE_HOST', '$REPAS_HOST', '127.0.0.1', 'repas.test'])
  })
})

// Recette réelle du 2026-10-18 (Pixel 9, application 0.1.3) : un plan s'ouvrait sur la racine de l'hôte du magasin, une PAGE 404 du vrai site, que
// le faux site servait à tort comme un accueil et qui a masqué le défaut. Le faux site est fidèle (racine de l'hôte du magasin = 404, accueil sur
// l'enseigne) ; ces gardes tiennent ensemble ce que l'application, le faux site et les scripts de l'émulateur disent de la page de départ.
describe('la page de départ d’un plan dans l’émulateur (recette réelle du 2026-10-18)', () => {
  const script = read(join(emulatorDir, 'e2e.sh'))

  it('est celle de l’application : l’accueil de l’enseigne (NavigationPolicy.START_URL), servi par le faux Leclerc complet sous le même nom', () => {
    // L'accueil de l'enseigne est une donnée de son entrée au registre (DRV-706) ; `NavigationPolicy.START_URL` et les pages de départ la lisent.
    const registry = read(join(androidDir, 'core/src/main/kotlin/eu/kantin/repas/drive/RetailerSites.kt'))
    const policy = read(join(androidDir, 'core/src/main/kotlin/eu/kantin/repas/drive/NavigationPolicy.kt'))
    const plan = read(join(androidDir, 'core/src/main/kotlin/eu/kantin/repas/drive/DrivePlan.kt'))

    expect(/startUrl = "([^"]+)"/.exec(registry)?.[1]).toBe(`https://${HOME_HOST}/`)
    expect(policy).toContain('val START_URL: String get() = legacy.startUrl')
    // La lecture du magasin (SetupRequest) et le plan (DrivePlan) : les deux pages de départ sont celle-là, jamais l'hôte du magasin du plan.
    const starts = [...plan.matchAll(/override val startUrl: String get\(\) = (.+)/g)].map((match) => match[1])
    expect(starts).toEqual(['site.startUrl', 'site.startUrl'])
    expect(read(join(emulatorDir, 'lib.sh'))).toContain(`SITE_HOST=${HOME_HOST}`)
    expect(read(join(emulatorDir, 'testsite.py'))).toContain(`HOME_HOST = "${HOME_HOST}"`)
    expect(read(join(emulatorDir, 'entrypoint.sh'))).toContain(`FAKE_LECLERC_HOSTS=${HOME_HOST}`)
  })

  it('fait échouer les scénarios complets si le départ retombe sur la racine de l’hôte du magasin', () => {
    expect(script).toContain(`not_requested_on "$FAKE_STORE_HOST" '/'`)
    expect(script).toContain(`requested_on "$SITE_HOST" '/'`)
    expect(script).toContain('www_mode fake')
    expect(script).toContain(`trap 'www_mode test' EXIT`)
    expect(read(join(emulatorDir, 'smoke.sh'))).toContain('www_mode test')
  })

  it('vérifie, avant de jouer, que le faux site est fidèle : racine de l’hôte du magasin en 404, accueil sur l’enseigne', () => {
    expect(script).toContain(`-H "Host: $FAKE_STORE_HOST"`)
    expect(script).toContain(`-H "Host: $SITE_HOST"`)
    expect(script).toMatch(/= "404" \]/)
  })

  it('joue le repli sur les pages 404 de la recette réelle : la racine de l’hôte du magasin et /magasin-N-N/ sans ville', () => {
    expect(script).toContain("dead_page_checks '/'")
    expect(script).toContain(`dead_page_checks '/magasin-${STORE.id}-${STORE.id}/'`)
    expect(script).toContain('"startPath"')
  })
})

describe('l’application ne fait confiance à aucun faux certificat', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === 'build' ? [] : files(path)
      return /\.(kt|kts|xml)$/.test(entry.name) ? [path] : []
    })
  const sources = files(join(androidDir, 'app')).map((path) => ({ path: relative(androidDir, path), text: read(path) }))

  it.each(['ignore-certificate-errors', 'networkSecurityConfig', 'trust-anchors', 'handler.proceed()', 'TrustManager'])(
    'n’écrit jamais « %s » (le faux certificat n’est accepté que par la WebView de l’émulateur, réglée de l’extérieur)',
    (forbidden) => {
      expect(sources.filter(({ text }) => text.includes(forbidden)).map(({ path }) => path)).toEqual([])
    },
  )

  it('refuse un certificat en cause dans la coquille comme dans le drive', () => {
    const refusing = sources
      .filter(({ text }) => /onReceivedSslError[\s\S]{0,200}handler\.cancel\(\)/.test(text))
      .map(({ path }) => path.split('/').pop())
    expect(refusing.sort()).toEqual(['DriveActivity.kt', 'MainActivity.kt'])
  })

  it('ne règle la WebView que depuis les scripts de l’émulateur, dans /data/local/tmp', () => {
    const lib = read(join(emulatorDir, 'lib.sh'))
    expect(lib).toContain('/data/local/tmp/webview-command-line')
    expect(lib).toContain('--ignore-certificate-errors-spki-list=')
  })
})
