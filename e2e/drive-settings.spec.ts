// Réglages du drive (DRV-403), sans back ni compte : l'API est simulée (`e2e/support/driveBack.ts`). Hors de l'application Repas : le
// pont natif est absent, le magasin se saisit à la main. Jouée sur bureau et sur Pixel 7.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { fakeDriveBack } from './support/driveBack'

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

test('envoyé ici faute de magasin, le motif disparaît une fois le magasin enregistré', async ({
  page,
}) => {
  await fakeDriveBack(page, { store: null })
  await page.goto('/drive/reglages?magasin=requis')
  await expect(
    page.getByText('Choisissez d’abord votre magasin pour envoyer une liste au drive.'),
  ).toBeVisible()

  await page.getByLabel('Adresse de votre magasin').fill(address)
  await page.getByRole('button', { name: 'Enregistrer mon magasin' }).click()

  await expect(page.getByText('Magasin …321')).toBeVisible()
  await expect(page).toHaveURL(/\/drive\/reglages$/)
  await expect(page.getByText('Choisissez d’abord votre magasin')).toHaveCount(0)
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
  await expect(page.getByText('Le drive est prêt dans cette application.')).toBeVisible()
  await expect(page.getByText('Vous utilisez Repas dans un navigateur')).toHaveCount(0)
  // Déjà installée : l'aide ne propose pas de l'installer, elle mène à la mise à jour
  await expect(page.getByRole('link', { name: 'Aide d’installation' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Mettre à jour l’application' }).click()
  await expect(page).toHaveURL(/\/drive\/aide#mise-a-jour$/)
})

/**
 * Un faux pont natif qui joue l'application : il répond à `drive.setup` comme elle (après l'aller-retour dans le drive) par le
 * résultat de l'agent donné, et garde ce que la page envoie dans `window.__sent`.
 */
async function fakeAppForSetup(page: Page, answer: 'found' | 'aborted' | 'busy' | 'unsupported') {
  await page.addInitScript((answer) => {
    const listeners: ((event: { data: unknown }) => void)[] = []
    const win = window as unknown as { __sent: { type: string; runId?: string }[] }
    win.__sent = []
    const emit = (message: unknown, delay: number) =>
      setTimeout(
        () => listeners.forEach((listener) => listener({ data: JSON.stringify(message) })),
        delay,
      )
    Object.assign(window, {
      repasNative: {
        postMessage: (text: string) => {
          const message = JSON.parse(text) as { type: string; runId?: string }
          win.__sent.push(message)
          if (message.type === 'app.info')
            emit({ v: 1, type: 'app.info', version: '0.5.0', versionCode: 5, drive: true }, 0)
          if (message.type !== 'drive.setup') return
          const head = { v: 1, runId: message.runId, agentVersion: '1.0.0' }
          if (answer === 'busy') emit({ v: 1, type: 'drive.error', code: 'BUSY', runId: null }, 50)
          else if (answer === 'found')
            emit(
              {
                v: 1,
                type: 'drive.result',
                result: {
                  ...head,
                  type: 'setup-result',
                  store: {
                    id: '654321',
                    host: 'exemple.leclercdrive.fr',
                    baseUrl: 'https://exemple.leclercdrive.fr/magasin-654321-654321',
                    label: null,
                  },
                },
              },
              150,
            )
          else
            emit(
              {
                v: 1,
                type: 'drive.result',
                result: {
                  ...head,
                  type: 'result',
                  lines: [],
                  ...(answer === 'aborted'
                    ? { outcome: 'aborted', error: { code: 'CANCELLED', message: 'Abandonné' } }
                    : { outcome: 'error', error: { code: 'UNSUPPORTED_PAGE', message: 'Page' } }),
                },
              },
              150,
            )
        },
        addEventListener: (_type: string, listener: (event: { data: unknown }) => void) =>
          void listeners.push(listener),
      },
    })
  }, answer)
}

test('dans l’application : « Lire mon magasin » ouvre le drive, et au retour le formulaire est rempli', async ({
  page,
}) => {
  const back = await fakeDriveBack(page, { store: null })
  await fakeAppForSetup(page, 'found')
  await page.goto('/drive/reglages')

  await page.getByRole('button', { name: 'Lire mon magasin dans l’application' }).click()

  await expect(page.getByText('Magasin …321 lu dans l’application')).toBeVisible()
  await expect(page.getByLabel('Adresse de votre magasin')).toHaveValue(address)
  const sent = await page.evaluate(() =>
    (window as unknown as { __sent: { type: string; runId?: string }[] }).__sent.filter(
      (message) => message.type === 'drive.setup',
    ),
  )
  expect(sent).toHaveLength(1)
  expect(sent[0]?.runId).toMatch(/^[0-9a-f-]{36}$/)

  // L'utilisateur vérifie, donne un nom et enregistre : seul ce geste écrit dans Repas
  expect(back.bodies).toEqual([])
  await page.getByLabel('Nom de votre magasin (facultatif)').fill('Ville-Test')
  await page.getByRole('button', { name: 'Enregistrer mon magasin' }).click()
  await expect(page.getByText('Magasin enregistré.')).toBeVisible()
  expect(back.bodies).toEqual([
    { retailer: 'leclerc', store: { id: '654321', baseUrl: address, label: 'Ville-Test' } },
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
