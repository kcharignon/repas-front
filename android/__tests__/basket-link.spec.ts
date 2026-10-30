// @vitest-environment node
// « Finaliser sur Leclerc » (DRV-631) : le front fait le lien `https://<hôte>/magasin-N-N`, qui ne dit que QUEL magasin ; la coquille Android y met la ville
// qu'elle a retenue et ouvre l'accueil du magasin (jamais la page du panier de Leclerc, « introuvable » quand on y arrive sans passer par son site).
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { finalizeLink } from '../../src/features/drive/retailers'

// Le Kotlin de l'application est en deux modules (AUTH-015) : le cœur sans Android et l'application ; un fichier se cherche dans les deux.
const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const kotlinFiles = ['core', 'app'].flatMap((module) => {
  const dir = join(androidDir, module, 'src/main/kotlin/eu/kantin/repas/drive')
  return readdirSync(dir)
    .filter((name) => name.endsWith('.kt'))
    .map((name) => ({ name, path: join(dir, name) }))
})
const source = (name: string) => readFileSync(kotlinFiles.find((file) => file.name === name)?.path ?? '', 'utf8')

describe('le lien « Finaliser sur Leclerc », des deux côtés', () => {
  it('le front ne fait que le lien du magasin, l’application ne l’ouvre que si c’est cette forme', () => {
    const link = finalizeLink('https://courses-test.leclercdrive.fr/magasin-000000-000000-Ville-Test/x', true)

    expect(link).toBe('https://courses-test.leclercdrive.fr/magasin-000000-000000')
    // La forme du lien est celle de l'entrée de l'enseigne au registre (DRV-706) ; DriveEntry la lit chez l'enseigne du lien, il ne l'écrit pas.
    expect(source('RetailerSites.kt')).toContain('frontLink = Regex("^/magasin-([0-9]{1,12})-([0-9]{1,12})$")')
    expect(source('DriveEntry.kt')).toContain('pages.frontLink')
  })

  it('aucune navigation vers la page du panier de Leclerc, nulle part dans l’application', () => {
    const files = kotlinFiles.map((file) => file.name)

    expect(files.length).toBeGreaterThan(10)
    expect(files.filter((name) => /detail-panier/i.test(source(name)))).toEqual([])
  })

  it('l’application ne bâtit l’adresse qu’avec l’hôte du lien et le chemin qu’une page a donné, jamais avec le message du plan', () => {
    const entry = source('DriveEntry.kt')
    const memory = source('StorePathMemory.kt')

    expect(entry).not.toMatch(/DrivePlan|storeHost|PassRequest/)
    expect(memory).not.toMatch(/DrivePlan|storeHost|PassRequest/)
  })

  it('l’application ne lit que le titre de la page « introuvable », jamais son contenu', () => {
    const activity = source('DriveActivity.kt')

    expect(activity).toContain('override fun onReceivedTitle')
    expect(activity).not.toMatch(/evaluateJavascript|onReceivedHttpError.*getContent|loadDataWithBaseURL/)
  })
})

describe('le bandeau de l’arrivée de « Finaliser sur Leclerc »', () => {
  const strings = readFileSync(join(androidDir, 'app/src/main/res/values/strings.xml'), 'utf8')
  const banner = /<string name="basket_banner">([^<]+)<\/string>/.exec(strings)?.[1] ?? ''

  it('est court, tutoie et ne contient aucun avertissement', () => {
    expect(banner).toBe('Ton panier est dans l’icône en haut à droite.')
    expect(banner.split(/\s+/).length).toBeLessThanOrEqual(15)
    expect(banner).not.toMatch(/\b(vous|votre|vos|attention|risque)\b/i)
  })

  it('n’a pas de bouton : le bandeau du panier ne porte pas l’action « Ouvrir l’accueil du drive »', () => {
    const pass = source('DrivePass.kt')

    expect(pass).toMatch(/val hasAction: Boolean get\(\) = this == PLAN \|\| this == VERIFICATION \|\| this == MOBILE/)
  })
})
