// Inscription par la seule adresse (back #314) : le formulaire, « Vérifie ta boîte mail », le lien de bienvenue qui fait choisir le
// premier mot de passe, puis la connexion.
//  - la première partie simule l'API (`page.route`) comme le fait le vrai back : `204` pour TOUTE adresse (nouvelle, déjà connue, en
//    attente, désactivée), jamais autre chose ; elle joue le parcours, les refus, les anciens liens, une décision par écran à 360 × 640,
//    l'accessibilité et les captures ;
//  - la seconde joue le parcours complet contre le VRAI back et sa boîte de développement Mailpit (`make e2e`).
// Aucune vraie adresse : uniquement `@example.com`, et les comptes et messages du test sont supprimés à la fin.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './support/test'
import type { APIRequestContext, Page } from '@playwright/test'

import { apiToken, hasSession } from './support/session'

// ---------------------------------------------------------------------------------------------------------------------------------
// Un faux back

interface Answer {
  status: number
  message?: string
  retryAfter?: string
}

interface Received {
  path: string
  body: unknown
}

/** Simule les trois routes publiques de l'inscription ; tout autre appel d'API échoue le test. Rend les appels reçus. */
async function fakeBack(
  page: Page,
  answers: { register?: Answer; confirm?: Answer; verify?: Answer } = {},
) {
  const received: Received[] = []
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const answer =
        path === '/api/v1/users'
          ? (answers.register ?? { status: 204 })
          : path.endsWith('/password-reset/confirm')
            ? (answers.confirm ?? { status: 204 })
            : path.endsWith('/email-verification/confirm')
              ? (answers.verify ?? { status: 204 })
              : null
      received.push({ path, body: request.postDataJSON() as unknown })
      if (answer === null) return route.fulfill({ status: 500, body: `Appel non prévu : ${path}` })
      if (answer.status === 204) return route.fulfill({ status: 204 })

      return route.fulfill({
        status: answer.status,
        contentType: 'application/json',
        headers: answer.retryAfter === undefined ? {} : { 'Retry-After': answer.retryAfter },
        body: JSON.stringify({ error: { message: answer.message ?? 'Refusé' } }),
      })
    },
  )

  return received
}

const email = (page: Page) => page.getByLabel('Adresse e-mail')
const firstPassword = (page: Page) => page.getByLabel('Mot de passe', { exact: true })
const confirmation = (page: Page) => page.getByLabel('Confirme ton mot de passe', { exact: true })

/** Le lien de l'e-mail de bienvenue : le même écran que « mot de passe oublié », avec `bienvenue=1`. */
const welcomeLink = '/mot-de-passe-oublie/confirmation?token=le-secret&bienvenue=1'

// ---------------------------------------------------------------------------------------------------------------------------------
// Parcours simulé

test.describe('inscription par l’adresse, parcours simulé', () => {
  test('de l’adresse au premier mot de passe, puis la connexion', async ({ page }) => {
    const received = await fakeBack(page)

    // 1. Le formulaire : l'adresse, rien d'autre
    await page.goto('/inscription')
    await expect(page.getByRole('heading', { level: 1, name: 'Créer un compte' })).toBeVisible()
    await expect(page.locator('input')).toHaveCount(1)
    await expect(firstPassword(page)).toHaveCount(0)
    await expect(page.getByLabel('Nombre de personnes par défaut')).toHaveCount(0)
    await email(page).fill('alexiane@example.com')
    await page.getByRole('button', { name: 'Créer mon compte' }).click()

    // 2. « Vérifie ta boîte mail » : ne dit jamais qu'un compte est créé (la réponse est la même pour toute adresse)
    await expect(page).toHaveURL(/\/verification-email\?email=alexiane(%40|@)example\.com$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Vérifie ta boîte mail' }),
    ).toBeVisible()
    await expect(
      page.getByText('Un message vient de partir à alexiane@example.com. Ouvre-le pour continuer.'),
    ).toBeVisible()
    await expect(page.getByRole('main')).not.toContainText(/créé|activé/)
    expect(received).toEqual([{ path: '/api/v1/users', body: { email: 'alexiane@example.com' } }])

    // 3. Renvoyer le lien : la même demande, puis une minute d'attente
    await page.getByRole('button', { name: 'Renvoyer le lien' }).click()
    await expect(page.getByRole('status')).toHaveText('Un nouveau message vient de partir.')
    await expect(page.getByRole('button', { name: /^Renvoyer le lien dans/ })).toBeDisabled()
    expect(received.at(-1)).toEqual({
      path: '/api/v1/users',
      body: { email: 'alexiane@example.com' },
    })

    // 4. Le lien reçu par e-mail : choisir le mot de passe, deux fois
    await page.goto(welcomeLink)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Choisis ton mot de passe' }),
    ).toBeVisible()
    await expect(page.getByText('Dernière étape pour ouvrir ton compte.')).toBeVisible()
    await firstPassword(page).fill('un premier mot de passe')
    await confirmation(page).fill('un premier mot de passe')
    await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click()

    // 5. Retour à la connexion, avec la bonne nouvelle (aucune connexion automatique)
    await expect(page).toHaveURL(/\/connexion\?compte=pret$/)
    await expect(page.getByRole('status')).toHaveText(
      'Ton compte est prêt. Connecte-toi avec ton mot de passe.',
    )
    expect(received.at(-1)).toEqual({
      path: '/api/v1/users/password-reset/confirm',
      body: { token: 'le-secret', password: 'un premier mot de passe' },
    })
    expect(received.map((call) => call.path)).not.toContain('/api/login_check')
  })

  test('une adresse refusée par le back est expliquée sous le formulaire', async ({ page }) => {
    await fakeBack(page, { register: { status: 422, message: 'email: invalide' } })
    await page.goto('/inscription')
    await email(page).fill('alexiane@example.com')
    await page.getByRole('button', { name: 'Créer mon compte' }).click()

    await expect(page.getByRole('alert')).toHaveText(
      'Cette adresse e-mail n’est pas valide. Vérifie-la, puis réessaie.',
    )
    await expect(page).toHaveURL(/\/inscription$/)
  })

  test('trop de demandes : le délai est annoncé et rien n’est perdu', async ({ page }) => {
    await fakeBack(page, { register: { status: 429, retryAfter: '1800' } })
    await page.goto('/inscription')
    await email(page).fill('alexiane@example.com')
    await page.getByRole('button', { name: 'Créer mon compte' }).click()

    await expect(page.getByRole('alert')).toHaveText(
      'Trop de demandes en peu de temps. Aucun message n’est parti. Réessaie dans 30 minutes.',
    )
    await expect(email(page)).toHaveValue('alexiane@example.com')
    await expect(page.getByRole('button', { name: 'Créer mon compte' })).toBeEnabled()
  })

  test('un lien de bienvenue périmé mène à « Demander un nouveau lien »', async ({ page }) => {
    await fakeBack(page, { confirm: { status: 422, message: 'INVALID_PASSWORD_RESET_TOKEN' } })
    await page.goto('/mot-de-passe-oublie/confirmation?token=vieux&bienvenue=1')
    await firstPassword(page).fill('un premier mot de passe')
    await confirmation(page).fill('un premier mot de passe')
    await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click()

    await expect(
      page.getByRole('heading', { level: 1, name: 'Ce lien ne marche plus' }),
    ).toBeVisible()
    await expect(page.getByRole('alert')).toHaveText(
      'Il a déjà servi, ou il a expiré. Demande-en un nouveau pour choisir ton mot de passe.',
    )
    await page.getByRole('link', { name: 'Demander un nouveau lien' }).click()
    await expect(page).toHaveURL(/\/mot-de-passe-oublie$/)
  })

  test('un ancien lien de confirmation active le compte, puis propose de choisir le mot de passe', async ({
    page,
  }) => {
    const received = await fakeBack(page)
    await page.goto('/confirmation-email?token=ancien')

    await expect(page.getByRole('status')).toHaveText(
      'Ton adresse est confirmée. Il te reste à choisir ton mot de passe.',
    )
    expect(received).toEqual([
      { path: '/api/v1/users/email-verification/confirm', body: { token: 'ancien' } },
    ])
    await page.getByRole('link', { name: 'Choisir mon mot de passe' }).click()
    await expect(page).toHaveURL(/\/mot-de-passe-oublie$/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Une décision par écran, à 360 × 640, clair et sombre

const screens: { name: string; prepare: (page: Page) => Promise<void>; primary: string }[] = [
  {
    name: 'inscription',
    prepare: async (page) => {
      await page.goto('/inscription')
    },
    primary: 'Créer mon compte',
  },
  {
    name: 'verifie-ta-boite-mail',
    prepare: async (page) => {
      await page.goto('/inscription')
      await email(page).fill('alexiane@example.com')
      await page.getByRole('button', { name: 'Créer mon compte' }).click()
      await page.getByRole('heading', { level: 1, name: 'Vérifie ta boîte mail' }).waitFor()
    },
    primary: 'Renvoyer le lien',
  },
  {
    name: 'bienvenue',
    prepare: async (page) => {
      await page.goto(welcomeLink)
    },
    primary: 'Enregistrer mon mot de passe',
  },
  {
    name: 'bienvenue-mot-de-passe-refuse',
    prepare: async (page) => {
      await page.goto(welcomeLink)
      await firstPassword(page).fill('court')
      await confirmation(page).fill('court')
      await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click()
      await page.getByText('Ton mot de passe doit avoir').waitFor()
    },
    primary: 'Enregistrer mon mot de passe',
  },
  {
    name: 'bienvenue-lien-perime',
    prepare: async (page) => {
      await page.goto('/mot-de-passe-oublie/confirmation?bienvenue=1')
    },
    primary: 'Demander un nouveau lien',
  },
  {
    name: 'connexion-compte-pret',
    prepare: async (page) => {
      await page.goto('/connexion?compte=pret')
    },
    primary: 'Se connecter',
  },
  {
    name: 'ancien-lien-de-confirmation',
    prepare: async (page) => {
      await page.goto('/confirmation-email?token=ancien')
      await page.getByRole('status').waitFor()
    },
    primary: 'Choisir mon mot de passe',
  },
  // En dernier : sa route remplace celle du faux back pour les écrans suivants
  {
    name: 'inscription-trop-de-demandes',
    prepare: async (page) => {
      await page.route('**/api/v1/users', (route) =>
        route.fulfill({
          status: 429,
          headers: { 'Retry-After': '1800' },
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Too many' } }),
        }),
      )
      await page.goto('/inscription')
      await email(page).fill('alexiane@example.com')
      await page.getByRole('button', { name: 'Créer mon compte' }).click()
      await page.getByRole('alert').waitFor()
    },
    primary: 'Créer mon compte',
  },
]

const viewports = [
  { label: '360 × 640', size: { width: 360, height: 640 } },
  { label: '390 × 844', size: { width: 390, height: 844 } },
  { label: 'bureau 1280 × 800', size: { width: 1280, height: 800 } },
]

for (const { label, size } of viewports) {
  test.describe(`inscription par l’adresse, ${label}`, () => {
    test.use({ viewport: size })

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`chaque écran tient en une décision, sans défiler, et reste accessible (WCAG AA), thème ${colorScheme}`, async ({
        page,
      }, testInfo) => {
        await page.emulateMedia({ colorScheme })
        await fakeBack(page)

        for (const screen of screens) {
          await screen.prepare(page)
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

          // Le bouton principal se voit sans défiler, et rien ne déborde sur le côté
          const primary = page
            .getByRole('button', { name: screen.primary })
            .or(page.getByRole('link', { name: screen.primary }))
            .first()
          const box = await primary.boundingBox()
          expect(box, `${screen.name} : le bouton principal est affiché`).not.toBeNull()
          expect(
            box!.y + box!.height,
            `${screen.name} : le bouton principal se voit sans défiler`,
          ).toBeLessThanOrEqual(size.height)
          expect(box!.height, `${screen.name} : cible d’au moins 44 px`).toBeGreaterThanOrEqual(44)
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          )
          expect(overflow, `${screen.name} : pas de défilement horizontal`).toBeLessThanOrEqual(0)

          const { violations } = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .exclude('.vue-devtools__anchor-btn')
            .analyze()
          expect(violations, screen.name).toEqual([])
          await page.screenshot({
            path: testInfo.outputPath(`${size.width}-${colorScheme}-${screen.name}.png`),
          })
        }
      })
    }
  })
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Parcours complet contre le vrai back et Mailpit

const mailpit = process.env.E2E_MAILPIT_URL ?? 'http://mailer:8025'

/** Le lien du dernier e-mail reçu par `address` dont l'adresse a ce chemin. */
async function linkSentTo(
  request: APIRequestContext,
  address: string,
  path: string,
): Promise<string> {
  let link = ''
  await expect
    .poll(
      async () => {
        const found = await request.get(
          `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
        )
        const { messages } = (await found.json()) as { messages: { ID: string }[] }
        for (const { ID } of messages) {
          const message = await request.get(`${mailpit}/api/v1/message/${ID}`)
          const { Text } = (await message.json()) as { Text: string }
          link =
            new RegExp(`https?://\\S+${path}\\?token=[0-9a-f]+(&bienvenue=1)?`).exec(Text)?.[0] ??
            ''
          if (link !== '') return link
        }

        return ''
      },
      { timeout: 10_000, message: `aucun e-mail ${path} reçu pour ${address}` },
    )
    .not.toBe('')

  return link
}

async function deleteMessagesTo(request: APIRequestContext, address: string) {
  await request.delete(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)
}

/** Supprime le compte du test (administrateur) : le test, lui, passe par l'interface. */
async function deleteAccount(request: APIRequestContext, address: string) {
  const headers = { Authorization: `Bearer ${await apiToken(request)}` }
  const users = (await (await request.get('/api/v1/users', { headers })).json()) as {
    member: { id: string; email: string }[]
  }
  const account = users.member.find((candidate) => candidate.email === address)
  if (account !== undefined) await request.delete(`/api/v1/users/${account.id}`, { headers })
}

test.describe('inscription par l’adresse, avec le back', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasSession, 'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires')

  test('adresse seule, connexion impossible, lien de bienvenue, mot de passe choisi, connexion', async ({
    page,
    request,
  }, testInfo) => {
    // Le back plafonne les inscriptions (10 par heure et par IP) : un seul projet joue le parcours.
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(testInfo.project.name !== 'chromium', 'jouer le parcours une fois suffit')
    const address = `e2e-${Date.now()}@example.com`
    const password = 'Un mot de passe 1 solide!'

    try {
      // Inscription : l'adresse seule, aucune session
      await page.goto('/inscription')
      await email(page).fill(address)
      await page.getByRole('button', { name: 'Créer mon compte' }).click()
      await expect(page).toHaveURL(/\/verification-email\?email=/)
      await expect(
        page.getByRole('heading', { level: 1, name: 'Vérifie ta boîte mail' }),
      ).toBeVisible()
      await expect(page.getByText(`Un message vient de partir à ${address}`)).toBeVisible()

      // Connexion avant d'avoir choisi un mot de passe : refusée
      await page.goto('/connexion')
      await email(page).fill(address)
      await page.getByLabel('Mot de passe').fill(password)
      await page.getByRole('button', { name: 'Se connecter' }).click()
      await expect(page.getByRole('alert')).toHaveText('Identifiants invalides.')

      // Le lien reçu par e-mail fait choisir le mot de passe, à usage unique
      const link = new URL(await linkSentTo(request, address, '/mot-de-passe-oublie/confirmation'))
      expect(link.searchParams.get('bienvenue')).toBe('1')
      await page.goto(`${link.pathname}${link.search}`)
      await expect(
        page.getByRole('heading', { level: 1, name: 'Choisis ton mot de passe' }),
      ).toBeVisible()
      await firstPassword(page).fill(password)
      await confirmation(page).fill(password)
      await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click()
      await expect(page).toHaveURL(/\/connexion\?compte=pret$/)
      await expect(page.getByRole('status')).toHaveText(
        'Ton compte est prêt. Connecte-toi avec ton mot de passe.',
      )
      await page.goto(`${link.pathname}${link.search}`)
      await firstPassword(page).fill(password)
      await confirmation(page).fill(password)
      await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click()
      await expect(
        page.getByRole('heading', { level: 1, name: 'Ce lien ne marche plus' }),
      ).toBeVisible()

      // Connexion possible avec le mot de passe choisi
      await page.goto('/connexion')
      await email(page).fill(address)
      await page.getByLabel('Mot de passe').fill(password)
      await page.getByRole('button', { name: 'Se connecter' }).click()
      await expect(page).not.toHaveURL(/\/connexion/)
      await expect(page.getByRole('navigation').first()).toBeVisible()
    } finally {
      await deleteAccount(request, address)
      await deleteMessagesTo(request, address)
    }
  })
})
