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
import { STORE } from '../../drive-agent/fake-leclerc/server'
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
  it('en compte au moins un complet (connus, nouveau, à la maison, ignoré) et un court', () => {
    expect(planFiles).toEqual(['plan-complet.json', 'plan-connu.json'])
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

  it('ne parlent qu’à des noms de faux sites, jamais à un vrai hôte', () => {
    const hosts = new Set(
      ['lib.sh', 'smoke.sh', 'e2e.sh']
        .flatMap((file) => read(join(emulatorDir, file)).match(/https?:\/\/[a-z0-9.$_{}-]+/gi) ?? [])
        .map((address) => address.replace(/^https?:\/\//i, '')),
    )
    expect([...hosts].sort()).toEqual(['$FAKE_STORE_HOST', '$REPAS_HOST', '127.0.0.1', 'repas.test'])
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
