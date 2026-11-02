// La carte de l'agent est exposée à un lecteur d'écran (DRV-764, recette réelle de 1.6.4 : « le texte de la carte n'apparaît pas toujours dans l'arbre d'accessibilité »).
// PROUVÉ dans Chromium, par l'arbre d'accessibilité du moteur (`Accessibility.getFullAXTree`, pas celui que Playwright déduit du DOM) : le dialogue de la carte a un nom, ses textes
// et ses boutons sont exposés avec un nom clair, rien n'est caché au lecteur (ni `aria-hidden`, ni `inert`, ni nœud ignoré), la carte annonce poliment ses changements, sur plusieurs
// écrans (Auchan, Leclerc, devant un mur de cookies `aria-modal`, barre réduite, choix de produit). NON prouvé ici : ce que la WebView d'Android fait de cet arbre (elle le transforme en
// vues, et ne le construit que quand un service d'accessibilité le demande) ; voir `drive-agent/README.md`, « Carte et lecteur d'écran ». Les faux sites ne sont pas les vrais.
import type { Page } from '@playwright/test'

import { openWithBridge, openWithFragment } from './support/agent'
import { agentTree, exposed, outline, spoken, type AxNode } from './support/accessibility'
import { expect, test } from './support/fixtures'
import { fresh, planOf, RUN_ID } from './support/plans'
import { MOBILE_HOSTS, MOBILE_PLAN_STORE, startFakeLeclerc } from '../fake-leclerc/server'
import { ACCOUNT_PATH } from '../fake-leclerc/mobile'
import { STORE } from '../fake-auchan/server'

const AUCHAN_PLAN = {
  v: 1,
  type: 'plan',
  runId: RUN_ID,
  retailer: 'auchan',
  store: { id: STORE.id, host: STORE.host },
  returnPath: '/drive/retour',
  lines: [{ ingredientSlug: 'sel', name: 'Sel', status: 'HAVE_AT_HOME' }],
} as const

/** Un mur de cookies comme les vrais : un dialogue modal de la PAGE, plein écran, avec ses boutons. */
const WALL = `(() => {
  const wall = document.createElement('div')
  wall.id = 'cookie-wall'
  wall.setAttribute('role', 'dialog')
  wall.setAttribute('aria-modal', 'true')
  wall.setAttribute('aria-label', 'Cookies')
  wall.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:#fff;padding:16px')
  wall.innerHTML = '<h2>Respect de votre vie privée</h2><button type="button">Tout accepter</button>'
  document.body.appendChild(wall)
})()`

async function tree(page: Page): Promise<AxNode> {
  const root = await agentTree(page)
  expect(root, 'le moteur expose le dialogue de la carte').not.toBeNull()
  return root as AxNode
}

/** Ce que doit offrir toute carte : un dialogue nommé, non ignoré, et aucun nœud de la carte « caché » au lecteur. */
function expectReadable(root: AxNode): void {
  expect(root.ignored).toBe(false)
  expect(root.name).not.toBe('')
  const hidden = [root, ...root.children].filter((one) => one.props.hidden === true)
  expect(hidden, 'rien de la carte n’est caché au lecteur').toEqual([])
}

const buttons = (root: AxNode): AxNode[] => exposed(root).filter((one) => one.role === 'button')

test.describe('Auchan', () => {
  test('carte pleine : dialogue nommé, titre, phrase, et chaque bouton avec un nom clair', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setBehavior({ store: 'none' })
    const app = await openWithBridge(page, {}, agentCode, {
      origin: fakeAuchan.site,
      path: '/courses',
    })
    app.answerHello(AUCHAN_PLAN)
    await expect(page.locator('.g-text')).toBeAttached({ timeout: 15_000 })

    const root = await tree(page)
    expectReadable(root)
    expect(root.props.modal, 'un bandeau n’est pas modal : la page reste lisible').toBe(false)
    const card = exposed(root).find((one) => one.role === 'status')
    expect(card, 'la carte est une zone de statut').toBeDefined()
    expect(card?.props).toMatchObject({ live: 'polite', atomic: true })
    expect(card?.name).toBe('Choisis ton magasin')
    expect(exposed(root).find((one) => one.role === 'heading')).toMatchObject({
      name: 'Choisis ton magasin',
    })
    expect(spoken(root)).toContain('Touche « Choisir vos courses », en haut de la page.')
    expect(buttons(root).map((one) => one.name)).toEqual([
      'Réduire',
      'Arrêter pour l’instant Ta liste est gardée, tu pourras reprendre.',
    ])
  })

  test('devant un mur de cookies modal de la page : la barre réduite est un bouton nommé, la carte reste exposée et le mur aussi', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setBehavior({ store: 'none' })
    const app = await openWithBridge(page, {}, agentCode, {
      origin: fakeAuchan.site,
      path: '/courses',
    })
    app.answerHello(AUCHAN_PLAN)
    await expect(page.locator('.g-text')).toBeAttached({ timeout: 15_000 })
    await page.evaluate(WALL)
    await expect(page.locator('.screen.guide.min')).toHaveCount(1, { timeout: 15_000 })

    const root = await tree(page)
    expectReadable(root)
    expect(buttons(root).map((one) => one.name)).toEqual([
      'Il reste une étape · Réponds aux cookies',
    ])
    // Le mur de la page n'a pas retiré la carte de l'arbre, et la carte n'a pas retiré le mur : la personne lit les deux
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Accessibility.enable')
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: { ignored?: boolean; role?: { value?: string }; name?: { value?: string } }[]
    }
    const live = nodes.filter((node) => node.ignored !== true)
    expect(
      live.some((node) => node.role?.value === 'dialog' && node.name?.value === 'Cookies'),
    ).toBe(true)
    expect(
      live.some((node) => node.role?.value === 'button' && node.name?.value === 'Tout accepter'),
    ).toBe(true)
  })

  test('un changement de texte est annoncé par la zone de statut, sans que le focus quitte la page', async ({
    page,
    fakeAuchan,
    agentCode,
  }) => {
    fakeAuchan.setBehavior({ store: 'none' })
    const app = await openWithBridge(page, {}, agentCode, {
      origin: fakeAuchan.site,
      path: '/courses',
    })
    app.answerHello(AUCHAN_PLAN)
    await expect(page.locator('.g-text')).toBeAttached({ timeout: 15_000 })
    // La personne est dans un champ de la page
    await page.evaluate(() => {
      const field = document.createElement('input')
      field.id = 'field'
      field.setAttribute('aria-label', 'Code postal')
      document.body.appendChild(field)
      field.focus()
    })

    // Le mur apparaît : la carte change de texte (elle se réduit en barre), dans sa zone de statut polie
    await page.evaluate(WALL)
    await expect(page.locator('.screen.guide.min')).toHaveCount(1, { timeout: 15_000 })
    const statusOutline = async (): Promise<string[]> => {
      const status = exposed(await tree(page)).find((one) => one.role === 'status')
      expect(status?.props).toMatchObject({ live: 'polite', relevant: 'additions text' })
      return outline(status as AxNode)
    }
    await expect
      .poll(async () => (await statusOutline()).join('\n'))
      .toContain('button : Il reste une étape · Réponds aux cookies')
    // Sans voler le focus : le champ de la page l'a toujours
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('field')
  })
})

test.describe('Leclerc', () => {
  test('connexion : la carte dit quoi faire et ses boutons sont nommés', async ({
    page,
    agentCode,
  }) => {
    const fake = await startFakeLeclerc({ hosts: MOBILE_HOSTS })
    try {
      fake.setBehavior({ mobile: {} })
      await page.route(`**${ACCOUNT_PATH}/home-espace-client-inconnue.aspx`, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Identification</title></head>
<body><main><h1>Connexion</h1><p>Connectez-vous avec votre compte</p><form onsubmit="return false"><label for="pass">Mot de passe</label><input id="pass" type="password"><button type="submit">Me connecter</button></form></main></body></html>`,
        }),
      )
      const app = await openWithBridge(page, fake, agentCode, {
        path: `${ACCOUNT_PATH}/home-espace-client-inconnue.aspx`,
        origin: fake.mobileOrigins.account,
      })
      app.answerHello(planOf([fresh('farine', 'Farine')], { store: { ...MOBILE_PLAN_STORE } }))
      await expect(page.locator('.screen.guide')).toContainText('mot de passe', { timeout: 15_000 })

      const root = await tree(page)
      expectReadable(root)
      expect(spoken(root)).toContain('mot de passe')
      const names = buttons(root).map((one) => one.name)
      expect(names).toContain('Arrêter pour l’instant Ta liste est gardée, tu pourras reprendre.')
      for (const name of names) expect(name.trim(), outline(root).join('\n')).not.toBe('')
    } finally {
      await fake.close()
    }
  })

  test('choix de produit : le dialogue est modal, la liste est nommée et chaque bouton dit son produit', async ({
    page,
    fake,
    agentCode,
  }) => {
    await openWithFragment(page, fake, agentCode, planOf([fresh('poivre', 'Poivre')]))
    await expect(page.getByRole('listitem').filter({ hasText: 'Poivre noir moulu' })).toBeVisible()

    const root = await tree(page)
    expectReadable(root)
    expect(root.props.modal, 'un écran plein est modal').toBe(true)
    expect(exposed(root).some((one) => one.role === 'list' && one.name !== '')).toBe(true)
    const choose = buttons(root).filter((one) => one.name.startsWith('Choisir'))
    expect(choose.length).toBeGreaterThan(0)
    for (const one of choose)
      expect(one.name, 'le bouton dit quel produit').toMatch(/^Choisir .{3,}/)
  })
})
