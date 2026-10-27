// Mot de passe oublié (issue 31, ADR 0026 du back) : demande du lien, nouveau mot de passe, retour à la connexion.
//  - la première partie simule l'API (`page.route`) : parcours, une décision par écran à 360 × 640, accessibilité, captures ;
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

/** Simule les deux routes publiques du back ; tout autre appel d'API échoue le test. Rend les appels reçus. */
async function fakeBack(page: Page, answers: { send?: Answer; confirm?: Answer } = {}) {
  const received: Received[] = []
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const answer = path.endsWith('/password-reset/send')
        ? (answers.send ?? { status: 204 })
        : path.endsWith('/password-reset/confirm')
          ? (answers.confirm ?? { status: 204 })
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

const newPassword = (page: Page) => page.getByLabel('Nouveau mot de passe', { exact: true })
const confirmation = (page: Page) => page.getByLabel('Confirme ton mot de passe', { exact: true })

/** Le message de la demande : le même que l'adresse ait un compte ou non (pas d'énumération). */
const neutralMessage =
  'Si un compte existe pour cette adresse, un lien vient de partir. Il est valable 30 minutes.'

const invalidToken: Answer = { status: 422, message: 'INVALID_PASSWORD_RESET_TOKEN' }

// ---------------------------------------------------------------------------------------------------------------------------------
// Parcours simulé

test.describe('mot de passe oublié, parcours simulé', () => {
  test('de la connexion au nouveau mot de passe, puis de nouveau la connexion', async ({
    page,
  }) => {
    const received = await fakeBack(page)

    // 1. La connexion : « Mot de passe oublié ? » reprend l'adresse déjà saisie
    await page.goto('/connexion')
    await page.getByLabel('Adresse e-mail').fill('alexiane@example.com')
    await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click()
    await expect(page).toHaveURL(/\/mot-de-passe-oublie\?email=alexiane(%40|@)example\.com$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Mot de passe oublié' })).toBeVisible()
    await expect(page.getByLabel('Adresse e-mail')).toHaveValue('alexiane@example.com')

    // 2. La demande : un message neutre
    await page.getByRole('button', { name: 'Envoyer le lien' }).click()
    await expect(page.getByRole('status')).toHaveText(neutralMessage)
    expect(received).toEqual([
      { path: '/api/v1/users/password-reset/send', body: { email: 'alexiane@example.com' } },
    ])

    // 3. Le lien reçu par e-mail : le nouveau mot de passe, deux fois
    await page.goto('/mot-de-passe-oublie/confirmation?token=le-secret')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Choisis un nouveau mot de passe' }),
    ).toBeVisible()
    await newPassword(page).fill('un nouveau mot de passe')
    await confirmation(page).fill('un nouveau mot de passe')
    await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click()

    // 4. Retour à la connexion, avec la bonne nouvelle (aucune connexion automatique)
    await expect(page).toHaveURL(/\/connexion\?mot-de-passe=change$/)
    await expect(page.getByRole('status')).toHaveText(
      'Ton nouveau mot de passe est enregistré. Tu peux te connecter.',
    )
    expect(received.at(-1)).toEqual({
      path: '/api/v1/users/password-reset/confirm',
      body: { token: 'le-secret', password: 'un nouveau mot de passe' },
    })
    expect(received.map((call) => call.path)).not.toContain('/api/login_check')
  })

  test('un mot de passe trop court ou deux saisies différentes sont expliqués sous le champ', async ({
    page,
  }) => {
    const received = await fakeBack(page)
    await page.goto('/mot-de-passe-oublie/confirmation?token=le-secret')

    await newPassword(page).fill('court')
    await confirmation(page).fill('court')
    await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click()
    await expect(page.getByText('Ton mot de passe doit avoir 8 caractères au moins.')).toBeVisible()
    await expect(newPassword(page)).toBeFocused()

    await newPassword(page).fill('un nouveau mot de passe')
    await confirmation(page).fill('un autre mot de passe')
    await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click()
    await expect(page.getByText('Les deux mots de passe ne sont pas les mêmes.')).toBeVisible()
    await expect(confirmation(page)).toBeFocused()

    expect(received).toEqual([])
  })

  test('un lien périmé mène à « Demander un nouveau lien »', async ({ page }) => {
    await fakeBack(page, { confirm: invalidToken })
    await page.goto('/mot-de-passe-oublie/confirmation?token=vieux')
    await newPassword(page).fill('un nouveau mot de passe')
    await confirmation(page).fill('un nouveau mot de passe')
    await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click()

    await expect(
      page.getByRole('heading', { level: 1, name: 'Ce lien ne marche plus' }),
    ).toBeVisible()
    await expect(page.getByRole('alert')).toHaveText(
      'Il a déjà servi, ou il a expiré. Ton mot de passe n’a pas changé.',
    )
    await page.getByRole('link', { name: 'Demander un nouveau lien' }).click()
    await expect(page).toHaveURL(/\/mot-de-passe-oublie$/)
  })

  test('une adresse sans secret montre la même page d’erreur', async ({ page }) => {
    const received = await fakeBack(page)
    await page.goto('/mot-de-passe-oublie/confirmation')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Ce lien ne marche plus' }),
    ).toBeVisible()
    expect(received).toEqual([])
  })

  test('trop de demandes : le délai est annoncé et rien n’est perdu', async ({ page }) => {
    await fakeBack(page, { send: { status: 429, retryAfter: '600' } })
    await page.goto('/mot-de-passe-oublie')
    await page.getByLabel('Adresse e-mail').fill('alexiane@example.com')
    await page.getByRole('button', { name: 'Envoyer le lien' }).click()

    await expect(page.getByRole('alert')).toHaveText(
      'Trop de demandes en peu de temps. Aucun lien n’est parti. Réessaie dans 10 minutes.',
    )
    await expect(page.getByRole('button', { name: 'Envoyer le lien' })).toBeEnabled()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Une décision par écran, à 360 × 640, clair et sombre

const screens: { name: string; prepare: (page: Page) => Promise<void>; primary: string }[] = [
  {
    name: 'connexion',
    prepare: async (page) => {
      await page.goto('/connexion?mot-de-passe=change')
    },
    primary: 'Se connecter',
  },
  {
    name: 'demande',
    prepare: async (page) => {
      await page.goto('/mot-de-passe-oublie')
    },
    primary: 'Envoyer le lien',
  },
  {
    name: 'demande-envoyee',
    prepare: async (page) => {
      await page.goto('/mot-de-passe-oublie?email=alexiane%40example.com')
      await page.getByRole('button', { name: 'Envoyer le lien' }).click()
      await page.getByRole('status').waitFor()
    },
    primary: 'Renvoyer le lien dans',
  },
  {
    name: 'demande-trop-de-demandes',
    prepare: async (page) => {
      await page.route('**/api/v1/users/password-reset/send', (route) =>
        route.fulfill({
          status: 429,
          headers: { 'Retry-After': '1800' },
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Too many' } }),
        }),
      )
      await page.goto('/mot-de-passe-oublie?email=alexiane%40example.com')
      await page.getByRole('button', { name: 'Envoyer le lien' }).click()
      await page.getByRole('alert').waitFor()
    },
    primary: 'Envoyer le lien',
  },
  {
    name: 'nouveau-mot-de-passe',
    prepare: async (page) => {
      await page.goto('/mot-de-passe-oublie/confirmation?token=le-secret')
    },
    primary: 'Enregistrer mon mot de passe',
  },
  {
    name: 'nouveau-mot-de-passe-refuse',
    prepare: async (page) => {
      await page.goto('/mot-de-passe-oublie/confirmation?token=le-secret')
      await newPassword(page).fill('court')
      await confirmation(page).fill('court')
      await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click()
      await page.getByText('Ton mot de passe doit avoir').waitFor()
    },
    primary: 'Enregistrer mon mot de passe',
  },
  {
    name: 'lien-perime',
    prepare: async (page) => {
      await page.goto('/mot-de-passe-oublie/confirmation')
    },
    primary: 'Demander un nouveau lien',
  },
]

const viewports = [
  { label: '360 × 640', size: { width: 360, height: 640 } },
  { label: 'bureau 1280 × 800', size: { width: 1280, height: 800 } },
]

for (const { label, size } of viewports) {
  test.describe(`mot de passe oublié, ${label}`, () => {
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
          await page.screenshot({ path: testInfo.outputPath(`${colorScheme}-${screen.name}.png`) })
        }
      })
    }
  })
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Parcours complet contre le vrai back et Mailpit

const mailpit = process.env.E2E_MAILPIT_URL ?? 'http://mailer:8025'

/** Le lien du dernier e-mail reçu par `address` dont l'adresse a ce chemin (le compte reçoit aussi sa confirmation d'adresse). */
async function linkSentTo(
  request: APIRequestContext,
  address: string,
  path: string,
  options: { notIn?: string[] } = {},
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
          const pattern = new RegExp(`https?://\\S+${path}\\?token=[0-9a-f]+`)
          const candidate = pattern.exec(Text)?.[0] ?? ''
          if (candidate !== '' && !(options.notIn ?? []).includes(candidate)) {
            link = candidate

            return link
          }
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

test.describe('mot de passe oublié, avec le back', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasSession, 'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires')

  test('lien reçu, nouveau mot de passe, connexion avec le nouveau, lien réutilisé, adresse inconnue', async ({
    page,
    request,
  }, testInfo) => {
    // Le back plafonne les demandes (20 par heure et par IP) et les inscriptions : un seul projet joue le parcours.
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(testInfo.project.name !== 'chromium', 'jouer le parcours une fois suffit')
    const stamp = Date.now()
    const address = `e2e-mdp-${stamp}@example.com`
    const unknown = `e2e-mdp-inconnu-${stamp}@example.com`
    const oldPassword = 'Un ancien mot de passe 1!'
    const freshPassword = 'Un tout nouveau mot de passe 2!'

    try {
      // Un compte actif : inscription, puis confirmation de l'adresse par le lien de l'e-mail (par l'API)
      const registered = await request.post('/api/v1/users', {
        data: { email: address, password: oldPassword, defaultServing: 4 },
      })
      expect(registered.status()).toBe(201)
      const confirmationLink = new URL(await linkSentTo(request, address, '/confirmation-email'))
      const verified = await request.post('/api/v1/users/email-verification/confirm', {
        data: { token: confirmationLink.searchParams.get('token') },
      })
      expect(verified.status()).toBe(204)

      // Mot de passe oublié : depuis la connexion, l'adresse saisie est reprise
      await page.goto('/connexion')
      await page.getByLabel('Adresse e-mail').fill(address)
      await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click()
      await expect(page.getByLabel('Adresse e-mail')).toHaveValue(address)
      await page.getByRole('button', { name: 'Envoyer le lien' }).click()
      await expect(page.getByRole('status')).toHaveText(neutralMessage)

      // Une adresse inconnue reçoit exactement le même message : rien ne montre qu'un compte existe
      await page.goto('/mot-de-passe-oublie')
      await page.getByLabel('Adresse e-mail').fill(unknown)
      await page.getByRole('button', { name: 'Envoyer le lien' }).click()
      await expect(page.getByRole('status')).toHaveText(neutralMessage)

      // Le lien reçu : nouveau mot de passe, puis la connexion annonce que c'est fait
      const link = new URL(await linkSentTo(request, address, '/mot-de-passe-oublie/confirmation'))
      expect(link.pathname).toBe('/mot-de-passe-oublie/confirmation')
      await page.goto(`${link.pathname}${link.search}`)
      await newPassword(page).fill(freshPassword)
      await confirmation(page).fill(freshPassword)
      await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click()
      await expect(page).toHaveURL(/\/connexion\?mot-de-passe=change$/)
      await expect(page.getByRole('status')).toHaveText(
        'Ton nouveau mot de passe est enregistré. Tu peux te connecter.',
      )

      // Le lien est à usage unique : le back ne le dit qu'à l'envoi du formulaire, la page d'erreur prend alors la place
      await page.goto(`${link.pathname}${link.search}`)
      await newPassword(page).fill(oldPassword)
      await confirmation(page).fill(oldPassword)
      await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click()
      await expect(
        page.getByRole('heading', { level: 1, name: 'Ce lien ne marche plus' }),
      ).toBeVisible()
      await expect(page.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible()

      // L'ancien mot de passe ne marche plus, le nouveau si
      await page.goto('/connexion')
      await page.getByLabel('Adresse e-mail').fill(address)
      await page.getByLabel('Mot de passe').fill(oldPassword)
      await page.getByRole('button', { name: 'Se connecter' }).click()
      await expect(page.getByRole('alert')).toHaveText('Identifiants invalides.')
      await page.getByLabel('Mot de passe').fill(freshPassword)
      await page.getByRole('button', { name: 'Se connecter' }).click()
      await expect(page).not.toHaveURL(/\/connexion/)
      await expect(page.getByRole('navigation').first()).toBeVisible()
    } finally {
      await deleteAccount(request, address)
      await deleteMessagesTo(request, address)
      await deleteMessagesTo(request, unknown)
    }
  })
})
