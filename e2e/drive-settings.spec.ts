// Réglages du drive (DRV-403), sans back ni compte : l'API est simulée (`e2e/support/driveBack.ts`). Hors de l'application Repas : le
// pont natif est absent, le magasin se saisit à la main. Jouée sur bureau et sur Pixel 7.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { fakeDriveBack } from './support/driveBack'
import { fakeAppForSetup } from './support/setupApp'

const address = 'https://exemple.leclercdrive.fr/magasin-654321-654321'
const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.vue-devtools__anchor-btn')
    .analyze()

test('sans magasin : enregistrer son adresse, lui donner un nom, puis gérer ses produits', async ({
  page,
}) => {
  const back = await fakeDriveBack(page, { store: null })

  // Du compte aux réglages, avec le motif de l'envoi
  await page.goto('/moi')
  await page.getByRole('link', { name: /Réglages du drive/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Réglages du drive' })).toBeVisible()
  await expect(page.getByText('Aucun magasin enregistré.')).toBeVisible()

  // Une adresse qui n'est pas celle d'un magasin est refusée sans appeler le back
  await page.getByLabel('Adresse de votre magasin').fill('https://exemple.example.com/magasin-1-1')
  await page.getByRole('button', { name: 'Enregistrer mon magasin' }).click()
  await expect(
    page.getByText('Cette adresse n’est pas celle d’un magasin Leclerc Drive'),
  ).toBeVisible()
  expect(back.bodies).toEqual([])

  // Adresse collée du navigateur (avec une suite) et nom facultatif
  await page.getByLabel('Adresse de votre magasin').fill(`${address}/accueil?a=1`)
  await page.getByLabel('Nom de votre magasin (facultatif)').fill('Ville-Test')
  await page.getByRole('button', { name: 'Enregistrer mon magasin' }).click()
  await expect(page.getByText('Magasin enregistré.')).toBeVisible()
  expect(back.bodies).toEqual([
    { retailer: 'leclerc', store: { id: '654321', baseUrl: address, label: 'Ville-Test' } },
  ])
  await expect(page.getByText('Magasin …321')).toBeVisible()
  await expect(page.getByText('Aucun magasin enregistré.')).toHaveCount(0)

  // Le résumé des produits mène à leur gestion
  await expect(page.getByText('Articles avec des produits', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Gérer mes produits' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Mes produits' })).toBeVisible()
})

test.describe('à 360 × 640', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  for (const [name, store] of [
    ['sans magasin', null],
    ['avec un magasin', undefined],
  ] as const) {
    test(`${name} : aucune note au-dessus et « Votre magasin » est visible sans défiler (DRV-626, DRV-628)`, async ({
      page,
    }) => {
      await fakeDriveBack(page, store === null ? { store: null } : {})
      await page.goto('/drive/reglages')

      // Aucune note de vie privée ni mise en garde sur cet écran : elles sont dans les conditions d'utilisation (DRV-628)
      await expect(page.getByRole('heading', { name: 'Votre vie privée' })).toHaveCount(0)
      await expect(page.getByText(/ne voit jamais|suspendre/)).toHaveCount(0)
      await expect(page.getByRole('link', { name: /note complète|Conditions/ })).toHaveCount(0)
      // « Votre magasin » est le premier bloc
      await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Votre magasin')

      // « Votre magasin » est entièrement au-dessus de la barre du bas, sans défiler
      const heading = page.getByRole('heading', { level: 2, name: 'Votre magasin' })
      await expect(heading).toBeInViewport({ ratio: 1 })
      const box = await heading.boundingBox()
      const bar = await page.getByRole('navigation').last().boundingBox()
      expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y)
      expect(await page.evaluate(() => window.scrollY)).toBe(0)
      expect((await scan(page)).violations).toEqual([])
    })
  }
})

test('envoyé ici faute de magasin, « Choisissez votre magasin » disparaît une fois le magasin enregistré', async ({
  page,
}) => {
  await fakeDriveBack(page, { store: null })
  await page.goto('/drive/reglages?magasin=requis')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Choisissez votre magasin' }),
  ).toBeVisible()
  // Hors de l'application, personne ne peut lire le magasin : la saisie à la main est là, ouverte
  await expect(page.getByRole('button', { name: 'Choisir mon magasin' })).toHaveCount(0)

  await page.getByLabel('Adresse de votre magasin').fill(address)
  await page.getByRole('button', { name: 'Enregistrer mon magasin' }).click()

  await expect(page.getByText('Magasin …321')).toBeVisible()
  await expect(page).toHaveURL(/\/drive\/reglages$/)
  await expect(page.getByText('Choisissez votre magasin')).toHaveCount(0)
})

test('hors de l’application : propose de l’installer et mène à l’aide', async ({ page }) => {
  await fakeDriveBack(page)
  await page.goto('/drive/reglages')

  await expect(page.getByText('Vous utilisez Repas dans un navigateur')).toBeVisible()
  // Sans l'application, personne ne peut lire le magasin pour vous : on le saisit
  await expect(
    page.getByRole('button', { name: 'Lire mon magasin dans l’application' }),
  ).toHaveCount(0)
  await page.getByRole('link', { name: 'Aide d’installation' }).click()
  await expect(page).toHaveURL(/\/drive\/aide$/)
})

test('dans l’application : montre sa version et que le drive est prêt', async ({ page }) => {
  await fakeDriveBack(page)
  // Un faux pont natif (`repasNative`) qui répond à `app.info`, comme le fera l'application
  await page.addInitScript(() => {
    const listeners: ((event: { data: unknown }) => void)[] = []
    Object.assign(window, {
      repasNative: {
        postMessage: (text: string) => {
          if ((JSON.parse(text) as { type: string }).type !== 'app.info') return
          const data = JSON.stringify({
            v: 1,
            type: 'app.info',
            version: '0.5.0',
            versionCode: 5,
            drive: true,
          })
          setTimeout(() => listeners.forEach((listener) => listener({ data })), 0)
        },
        addEventListener: (_type: string, listener: (event: { data: unknown }) => void) =>
          void listeners.push(listener),
      },
    })
  })
  await page.goto('/drive/reglages')

  await expect(page.getByText('Version 0.5.0')).toBeVisible()
  await expect(page.getByText('Le drive est prêt dans cette application.')).toHaveCount(0)
  await expect(page.getByText('Vous utilisez Repas dans un navigateur')).toHaveCount(0)
  // Déjà installée : l'aide ne propose pas de l'installer, elle mène à la mise à jour
  await expect(page.getByRole('link', { name: 'Aide d’installation' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Mettre à jour l’application' }).click()
  await expect(page).toHaveURL(/\/drive\/aide#mise-a-jour$/)
})

test('dans l’application : « Lire mon magasin » ouvre le drive, et au retour le magasin est enregistré tout seul', async ({
  page,
}) => {
  const back = await fakeDriveBack(page, { store: null })
  await fakeAppForSetup(page, 'found')
  await page.goto('/drive/reglages')
  // La saisie à la main est repliée : le geste est dans l'application
  await expect(page.getByLabel('Adresse de votre magasin')).toBeHidden()

  await page.getByRole('button', { name: 'Lire mon magasin dans l’application' }).click()

  await expect(page.getByText('Magasin …321 enregistré.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enregistrer mon magasin' })).toBeHidden()
  const sent = await page.evaluate(() =>
    (window as unknown as { __sent: { type: string; runId?: string }[] }).__sent.filter(
      (message) => message.type === 'drive.setup',
    ),
  )
  expect(sent).toHaveLength(1)
  expect(sent[0]?.runId).toMatch(/^[0-9a-f-]{36}$/)

  // Un seul enregistrement, sans nom : celui du résultat de l'agent
  expect(back.bodies).toEqual([
    { retailer: 'leclerc', store: { id: '654321', baseUrl: address, label: null } },
  ])

  // Le nom est facultatif : il se donne, si l'on veut, sous « Saisir l'adresse à la main »
  await page.getByText('Saisir l’adresse à la main').click()
  await page.getByLabel('Nom de votre magasin (facultatif)').fill('Ville-Test')
  await page.getByRole('button', { name: 'Enregistrer mon magasin' }).click()
  await expect(page.getByText('Magasin enregistré.')).toBeVisible()
  expect(back.bodies.at(-1)).toEqual({
    retailer: 'leclerc',
    store: { id: '654321', baseUrl: address, label: 'Ville-Test' },
  })
})

test('dans l’application : un autre magasin que le mien demande confirmation, « Garder l’ancien » ne change rien', async ({
  page,
}) => {
  // Le magasin enregistré (123456) n'est pas celui que l'application lit (654321)
  const back = await fakeDriveBack(page)
  await fakeAppForSetup(page, 'found')
  await page.goto('/drive/reglages')

  await page.getByRole('button', { name: 'Changer de magasin' }).click()
  const confirm = page.getByRole('dialog')
  await expect(confirm).toContainText('Utiliser le magasin …321 ?')
  await expect(confirm).toContainText(
    'Les produits habituels de l’ancien magasin ne seront plus proposés.',
  )
  await confirm.getByRole('button', { name: 'Garder l’ancien' }).click()
  await expect(confirm).toBeHidden()
  expect(back.bodies).toEqual([])
  await expect(page.getByText('Magasin …456')).toBeVisible()

  await page.getByRole('button', { name: 'Changer de magasin' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Changer de magasin' }).click()
  await expect(page.getByText('Magasin …321 enregistré.')).toBeVisible()
  expect(back.bodies).toEqual([
    { retailer: 'leclerc', store: { id: '654321', baseUrl: address, label: null } },
  ])
})

for (const [answer, message] of [
  ['aborted', 'Aucun magasin choisi'],
  ['unsupported', 'n’a pas trouvé de magasin'],
  ['busy', 'Un envoi au drive est déjà en cours'],
] as const) {
  test(`dans l'application : la lecture du magasin qui échoue (${answer}) est expliquée, la saisie reste possible`, async ({
    page,
  }) => {
    await fakeDriveBack(page, { store: null })
    await fakeAppForSetup(page, answer)
    await page.goto('/drive/reglages')

    await page.getByRole('button', { name: 'Lire mon magasin dans l’application' }).click()

    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible()
    // Rien n'est enregistré, et la saisie à la main s'ouvre
    await expect(page.getByLabel('Adresse de votre magasin')).toBeVisible()
    await expect(page.getByLabel('Adresse de votre magasin')).toHaveValue('')
    await expect(
      page.getByRole('button', { name: 'Lire mon magasin dans l’application' }),
    ).toBeEnabled()
  })
}

test('« Moi » : « Menu de l’application » n’existe que dans l’application et ouvre son menu', async ({
  page,
}) => {
  await fakeDriveBack(page)
  await page.goto('/moi')
  await expect(page.getByRole('link', { name: /Réglages du drive/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Menu de l’application/ })).toHaveCount(0)

  await fakeAppForSetup(page, 'found')
  await page.goto('/moi')
  await page.getByRole('button', { name: /Menu de l’application/ }).click()

  const types = await page.evaluate(() =>
    (window as unknown as { __sent: { type: string }[] }).__sent.map((message) => message.type),
  )
  expect(types).toContain('app.menu')
})

test('le drive coupé : « pas encore activé », sans formulaire', async ({ page }) => {
  await fakeDriveBack(page, { enabled: false })
  await page.goto('/drive/reglages')

  await expect(page.getByText('L’envoi au drive n’est pas encore activé')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enregistrer mon magasin' })).toHaveCount(0)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`les réglages du drive sont accessibles, sans défilement horizontal, thème ${colorScheme}`, async ({
    page,
  }) => {
    await fakeDriveBack(page)
    await page.emulateMedia({ colorScheme })

    await page.goto('/drive/reglages')
    await expect(page.getByText('Magasin …456')).toBeVisible()
    await expect(page.getByText('Articles avec des produits', { exact: true })).toBeVisible()
    expect((await scan(page)).violations).toEqual([])
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    // L'erreur de saisie est lue par les lecteurs d'écran et lisible
    await page.getByLabel('Adresse de votre magasin').fill('pas une adresse')
    await page.getByRole('button', { name: 'Enregistrer mon magasin' }).click()
    await expect(
      page.getByText('Cette adresse n’est pas celle d’un magasin Leclerc Drive'),
    ).toBeVisible()
    expect((await scan(page)).violations).toEqual([])
  })
}
