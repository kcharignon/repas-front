// @vitest-environment node
// La publication signée de l'application (DRV-315) : ce que le workflow `android-release.yml` s'interdit et ce que la procédure
// `android/PUBLICATION.md` promet à l'humain. Le workflow lui-même ne se joue qu'à la main (une étiquette poussée par l'humain, une vraie clé) : ces
// tests gardent ses garde-fous, et le script de contrôle de l'APK (`build.sh verify-release`) est joué par `make android-release-selftest`.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = join(androidDir, '..')
const read = (...path: string[]) => readFileSync(join(repoDir, ...path), 'utf8')

/** Le texte d'un workflow sans ses commentaires (une ligne de commentaire peut citer ce que le fichier interdit). */
const withoutComments = (text: string) =>
  text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')

const SECRETS = ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']
const workflow = read('.github', 'workflows', 'android-release.yml')
const code = withoutComments(workflow)
const [buildJob, publishJob] = code.split(/^ {2}publish:$/m)

describe('android-release.yml ne publie que sur une étiquette android-vX.Y.Z poussée', () => {
  it("n'a qu'un déclencheur : le push d'une étiquette de la forme android-vX.Y.Z", () => {
    const triggers = code.slice(code.indexOf('\non:'), code.indexOf('\npermissions:'))
    expect(triggers.trim()).toBe(
      ["on:", "  push:", "    tags:", "      - 'android-v[0-9]+.[0-9]+.[0-9]+'"].join('\n'),
    )
  })

  it.each(['pull_request', 'pull_request_target', 'workflow_dispatch', 'workflow_call', 'schedule', 'repository_dispatch', 'branches', 'release:'])(
    "n'a aucun déclencheur %s",
    (trigger) => {
      expect(code).not.toContain(trigger)
    },
  )

  it("publie une release ordinaire : jamais un brouillon ni une pré-version, ni l'étiquette « Latest » du site", () => {
    expect(code).not.toMatch(/--prerelease|--draft/)
    expect(code).toContain('--latest=false')
    expect(code).toContain('--verify-tag')
    expect(code).toContain('isDraft,isPrerelease')
  })

  it("construit l'APK signé puis le contrôle avant de rien publier, et publie dans un travail à part", () => {
    expect(buildJob).toBeDefined()
    expect(publishJob).toBeDefined()
    const build = buildJob!
    for (const command of ['make android-test', 'make android-release ANDROID_AGENT=', 'make android-release-verify']) {
      expect(build).toContain(command)
    }
    expect(build.indexOf('make android-release ANDROID_AGENT=')).toBeLessThan(build.indexOf('make android-release-verify'))
    expect(build).not.toContain('gh release create')
    expect(publishJob).toContain('gh release create')
    expect(publishJob).toContain('needs: build')
  })

  it("garde le droit d'écrire pour le seul travail de publication, qui n'a aucun secret", () => {
    expect(code.match(/contents: write/g)).toHaveLength(1)
    expect(publishJob).toContain('contents: write')
    expect(buildJob).not.toContain('contents: write')
    expect(publishJob).not.toContain('secrets.')
  })

  it("n'utilise que les quatre secrets de signature, uniquement dans des blocs `env`", () => {
    const lines = code.split('\n').filter((line) => line.includes('secrets.'))
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(line).toMatch(/^\s+(ANDROID_[A-Z0-9_]+): \$\{\{ secrets\.\1 \}\}$/)
    }
    expect(new Set(lines.map((line) => line.trim().split(':')[0]))).toEqual(new Set(SECRETS))
  })

  it("n'affiche aucun secret : ni écho de la valeur d'une variable de signature, ni trace d'exécution", () => {
    expect(code).not.toMatch(/set -[a-z]*x/)
    expect(code).not.toMatch(/^\s*(echo|printf|cat)\b.*\$\{?ANDROID_(KEYSTORE|KEY_)/m)
    expect(code).not.toMatch(/\$\{\{ *secrets\.[A-Z_]+ *\}\}.*(echo|printf)/)
  })

  it("refuse sans secret par un message qui renvoie vers la procédure, avant de construire quoi que ce soit", () => {
    const first = buildJob!.slice(buildJob!.indexOf('steps:'))
    expect(first.indexOf('Secrets de signature')).toBeLessThan(first.indexOf('actions/checkout'))
    expect(first).toContain('android/PUBLICATION.md')
    expect(first).toContain('Pas de clé de signature')
    for (const name of SECRETS) expect(first).toContain(name)
  })

  it("exige une étiquette sur main, plus récente que les précédentes, et le certificat déclaré par assetlinks.json", () => {
    expect(buildJob).toContain('git merge-base --is-ancestor "$GITHUB_SHA" origin/main')
    expect(buildJob).toContain('sort -V')
    expect(buildJob).toContain('public/.well-known/assetlinks.json')
    expect(buildJob).toContain('android/agent.js.sha384')
  })

  it("passe l'étiquette par l'environnement, jamais dans le texte d'un script (pas d'injection par un nom d'étiquette)", () => {
    const scripts = code.split('\n').filter((line) => /\$\{\{ *github\.(ref_name|head_ref|event\.)/.test(line))
    for (const line of scripts) expect(line).toMatch(/^\s+[A-Z_]+: \$\{\{/)
  })
})

/** Les étapes du travail « build », chacune avec son texte sans commentaire. */
const buildSteps = buildJob!.slice(buildJob!.indexOf('steps:')).split(/\n(?= {6}- )/)
const step = (name: string) => {
  const found = buildSteps.find((text) => text.includes(`name: ${name}`))
  expect(found, `l'étape « ${name} » existe`).toBeDefined()

  return found!
}
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16)

describe("l'APK est aussi publié sous un nom qui dit la version (repas-drive-X.Y.Z.apk), sans toucher à la signature", () => {
  const files = step('Fichiers et notes de la release')
  const upload = buildSteps.find((text) => text.includes('actions/upload-artifact'))!

  it("copie l'APK DÉJÀ signé et contrôlé sous le nom de la version, tiré de l'étiquette, après la signature et le contrôle", () => {
    expect(files).toContain('version="${TAG#android-v}"')
    expect(files).toContain('versioned="repas-drive-${version}.apk"')
    expect(files).toContain('cp release/repas-drive.apk "release/${versioned}"')
    expect(files).toContain('cmp release/repas-drive.apk "release/${versioned}"')
    // La copie part du fichier déjà copié depuis android/dist (le seul APK construit) : jamais une seconde construction ni signature
    expect(files.indexOf('cp android/dist/repas-drive.apk release/repas-drive.apk')).toBeLessThan(
      files.indexOf('cp release/repas-drive.apk'),
    )
    expect(files).not.toMatch(/make android|apksigner|gradle|keystore|ANDROID_KEY/i)
    const order = [
      'Secrets de signature',
      'APK signé',
      "Contrôle de l'APK",
      'Fichiers et notes de la release',
    ].map((name) => buildSteps.findIndex((text) => text.includes(`name: ${name}`)))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it("l'empreinte du contrôle couvre les deux noms (même SHA-256), et la version de l'étiquette est celle de l'APK contrôlé", () => {
    expect(files).toContain('[ "$(cut -d\' \' -f1 release/repas-drive.apk.sha256)" = "$sha256" ]')
    expect(files).toContain('[ "$(cut -d\' \' -f1 "release/${versioned}.sha256")" = "$sha256" ]')
    expect(files).toContain('sha256sum "${versioned}" > "${versioned}.sha256"')
    expect(files).toContain('[ "$version" = "$name" ]')
  })

  it("joint les deux noms et leurs empreintes à l'artefact, et publie toujours le nom stable et version.json", () => {
    for (const name of [
      'release/repas-drive.apk',
      'release/repas-drive.apk.sha256',
      'release/repas-drive-*.apk',
      'release/repas-drive-*.apk.sha256',
      'release/version.json',
    ]) {
      expect(upload).toContain(name)
    }
    expect(upload).toContain('if-no-files-found: error')
  })

  it('publie les deux APK avec leurs empreintes, vérifie les deux avant et après la publication, et ne change pas la forme de version.json', () => {
    expect(publishJob).toContain('versioned="repas-drive-${TAG#android-v}.apk"')
    expect(publishJob).toContain(
      'gh release create "$TAG" repas-drive.apk repas-drive.apk.sha256 "${versioned}" "${versioned}.sha256" version.json',
    )
    expect(publishJob).toContain('sha256sum -c repas-drive.apk.sha256')
    expect(publishJob).toContain('sha256sum -c "${versioned}.sha256"')
    expect(publishJob).toContain('cmp repas-drive.apk "${versioned}"')
    expect(publishJob).toContain('--pattern "${versioned}" --pattern "${versioned}.sha256"')
    expect(publishJob).toContain('cmp repas-drive.apk "published/${versioned}"')
    // Le fichier lu par le futur outil de mise à jour garde le nom stable et ses cinq clés
    expect(files).toContain('releases/download/${TAG}/repas-drive.apk')
    expect(files).toContain(
      '{versionName: $versionName, versionCode: $versionCode, apkUrl: $apkUrl, sha256: $sha256, minAndroid: 26}',
    )
  })

  // Empreintes (sans les commentaires) des étapes de signature, de clé, de secret et de vérification, telles qu'elles étaient avant ce
  // changement : une modification, même d'une virgule, fait échouer ce test et demande une relecture humaine, puis de mettre ici la nouvelle valeur.
  it.each([
    ['Secrets de signature', '4fb1807a06045fb7'],
    ['Empreinte du certificat attendu', '9924d6cbedb91945'],
    ['APK signé', '8b19b7837b01cafe'],
    ["Contrôle de l'APK (certificat attendu, permissions, version, agent)", '4c29691802f6fc7f'],
  ])("l'étape « %s » n'a pas bougé", (name, expected) => {
    expect(fingerprint(step(name))).toBe(expected)
  })
})

describe("les autres workflows Android ne publient pas d'APK signé et avertissent", () => {
  it.each(['android.yml'])("%s prévient de ne pas installer la pré-version sur le téléphone des courses", (name) => {
    const text = read('.github', 'workflows', name)
    expect(text).toContain('Ne pas installer cette pré-version sur le téléphone des courses')
    expect(text).toContain('android/PUBLICATION.md')
    for (const secret of SECRETS) expect(text).not.toContain(`secrets.${secret}`)
  })

  it('release.yml (le site) ne déploie jamais une release de l’application Android', () => {
    expect(read('.github', 'workflows', 'release.yml')).toContain("!startsWith(github.event.release.tag_name, 'android-')")
  })
})

describe('la procédure humaine android/PUBLICATION.md', () => {
  const procedure = read('android', 'PUBLICATION.md')

  it.each(SECRETS)('nomme le secret %s', (name) => {
    expect(procedure).toContain(name)
  })

  it('donne les commandes de chaque étape', () => {
    for (const command of ['keytool -genkeypair', 'gh secret set', 'git tag android-v', 'git push origin android-v', 'assetlinks.json', 'sha256sum']) {
      expect(procedure).toContain(command)
    }
  })

  it('rappelle de ne pas installer les pré-versions de débogage et de sauvegarder la clé', () => {
    expect(procedure).toContain('android-dev-')
    expect(procedure).toContain('android-lab-')
    expect(procedure).toMatch(/clé de débogage/)
    expect(procedure).toMatch(/sauvegarde/i)
  })

  it('ne contient aucun mot de passe ni empreinte réelle (l’empreinte vient de la clé de l’utilisateur)', () => {
    expect(procedure).not.toMatch(/(?:[0-9A-F]{2}:){31}[0-9A-F]{2}/)
    expect(procedure).not.toMatch(/storepass\s+\S*[a-z0-9]{12,}/i)
  })

  it('passe la variable des empreintes attendues au conteneur de construction', () => {
    expect(read('compose.yaml')).toMatch(/^\s+- ANDROID_EXPECTED_CERT_SHA256$/m)
  })
})

describe('public/.well-known/assetlinks.json (quand il existe)', () => {
  /** L'empreinte SHA-256 de `android/debug.keystore`, la clé de débogage PUBLIQUE : elle ne doit jamais être déclarée au site. */
  const DEBUG_CERT_SHA256 = '53:73:CF:14:EB:66:88:53:BA:25:0E:88:EC:78:F2:DF:3B:C2:14:46:A3:70:96:DA:75:FE:6C:2D:E0:11:CE:0D'
  const path = join(repoDir, 'public', '.well-known', 'assetlinks.json')

  it.skipIf(!existsSync(path))("déclare l'application eu.kantin.repas.drive avec les empreintes de publication, jamais celle de débogage", () => {
    const statements = JSON.parse(readFileSync(path, 'utf8')) as Array<{
      relation: string[]
      target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] }
    }>
    expect(Array.isArray(statements)).toBe(true)
    expect(statements).toHaveLength(1)
    const [statement] = statements
    expect(statement!.relation).toEqual(['delegate_permission/common.handle_all_urls'])
    expect(statement!.target.namespace).toBe('android_app')
    expect(statement!.target.package_name).toBe('eu.kantin.repas.drive')
    expect(statement!.target.sha256_cert_fingerprints.length).toBeGreaterThan(0)
    for (const fingerprint of statement!.target.sha256_cert_fingerprints) {
      expect(fingerprint).toMatch(/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/)
      expect(fingerprint).not.toBe(DEBUG_CERT_SHA256)
    }
  })
})
