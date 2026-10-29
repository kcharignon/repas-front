// Mot de passe oublié (issue 31, ADR 0026 du back) : demande du lien, nouveau mot de passe, retour à la connexion.
//  - la première partie simule l'API (`page.route`) : le parcours, et les deux écrans propres à ce parcours à 360 × 640, accessibles dans les
//    deux thèmes (`e2e/support/screen.ts`) ; les refus et les liens périmés sont des tests de composant (`PasswordResetViews.spec.ts`) ;
//  - la seconde joue le parcours complet contre le VRAI back et sa boîte de développement Mailpit (`make e2e`).
// Aucune vraie adresse : uniquement `@example.com`, et les comptes et messages du test sont supprimés à la fin.
import { expect, test } from './support/test'
import type { APIRequestContext, Page } from '@playwright/test'

import { apiToken, hasSession } from './support/session'
import { checkScreen, type Screen } from './support/screen'

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
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Une décision par écran, à 360 × 640, clair et sombre

const screens: Screen[] = [
  {
    name: 'demande',
    prepare: async (page) => {
      await page.goto('/mot-de-passe-oublie')
    },
    primary: 'Envoyer le lien',
  },
  // Le statut « Un lien vient de partir » et le bouton « Renvoyer le lien dans… », grisé pendant l'attente
  {
    name: 'demande-envoyee',
    prepare: async (page) => {
      await page.goto('/mot-de-passe-oublie?email=alexiane%40example.com')
      await page.getByRole('button', { name: 'Envoyer le lien' }).click()
      await page.getByRole('status').waitFor()
    },
    primary: 'Renvoyer le lien dans',
  },
]

// Les autres écrans de ce parcours sont ceux de l'inscription (même `ResetPasswordView`, même alerte, même connexion : seuls les textes
// changent) et sont jugés dans `registration.spec.ts` ; la mise en page large d'`AuthLayout` aussi.
const phone = { width: 360, height: 640 }

test.describe('mot de passe oublié, 360 × 640', () => {
  test.use({ viewport: phone })

  for (const screen of screens) {
    test(`${screen.name} : une décision, sans défiler, accessible (WCAG AA) en clair et en sombre`, async ({
      page,
    }) => {
      await fakeBack(page)
      await checkScreen(page, screen, phone)
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Parcours complet contre le vrai back et Mailpit

const mailpit = process.env.E2E_MAILPIT_URL ?? 'http://mailer:8025'

/** Le lien du dernier e-mail reçu par `address` dont l'adresse a ce chemin (le compte reçoit aussi le lien de bienvenue de son inscription). */
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
  }) => {
    // Le back plafonne les demandes (20 par heure et par IP) et les inscriptions : ce parcours n’est joué qu’une fois (sur le téléphone).
    const stamp = Date.now()
    const address = `e2e-mdp-${stamp}@example.com`
    const unknown = `e2e-mdp-inconnu-${stamp}@example.com`
    const oldPassword = 'Un ancien mot de passe 1!'
    const freshPassword = 'Un tout nouveau mot de passe 2!'

    try {
      // Un compte actif : inscription par l'adresse seule, puis premier mot de passe choisi par le lien de bienvenue (par l'API)
      const registered = await request.post('/api/v1/users', { data: { email: address } })
      expect(registered.status()).toBe(204)
      const welcomeLink = await linkSentTo(request, address, '/mot-de-passe-oublie/confirmation')
      const chosen = await request.post('/api/v1/users/password-reset/confirm', {
        data: { token: new URL(welcomeLink).searchParams.get('token'), password: oldPassword },
      })
      expect(chosen.status()).toBe(204)

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
      const link = new URL(
        await linkSentTo(request, address, '/mot-de-passe-oublie/confirmation', {
          notIn: [welcomeLink],
        }),
      )
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
