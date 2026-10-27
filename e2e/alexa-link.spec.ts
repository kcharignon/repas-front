// Liaison d'Alexa (VOX-401) : la page `/alexa/lier` que l'application Alexa ouvre, sans back ni compte (l'API est simulée par `page.route`).
//  - parcours : connecté (compte et site du retour affichés), déconnecté (connexion puis retour avec les mêmes paramètres), « Ce n'est pas toi ? »,
//    « Annuler », refus du back ;
//  - une décision par écran à 360 × 640 : le bouton principal se voit sans défiler, accessibilité (WCAG AA), captures claires et sombres.
// Aucune vraie adresse : uniquement des valeurs inventées ; la redirection vers « Amazon » est interceptée, rien ne sort du test.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { hasSession, signIn } from './support/session'

const redirectUri = 'https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA'
const query = new URLSearchParams({
  client_id: 'repas-alexa',
  redirect_uri: redirectUri,
  state: 'etat-1',
  code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  code_challenge_method: 'S256',
  response_type: 'code',
  scope: 'voice:shopping_list:write',
}).toString()
const address = `/alexa/lier?${query}`
const returned = `${redirectUri}?state=etat-1&code=le-code`

const me = {
  id: 'u1',
  email: 'alexiane@example.com',
  roles: ['ROLE_USER'],
  isAdmin: false,
  defaultServing: 4,
}

interface Answer {
  status: number
  message?: string
  retryAfter?: string
}

interface Received {
  key: string
  body: unknown
}

/** Simule l'API. `signedIn` pose l'indice de session (sinon la page renvoie à la connexion). Rend les appels reçus. */
async function fakeBack(page: Page, options: { signedIn?: boolean; authorize?: Answer } = {}) {
  const received: Received[] = []
  if (options.signedIn ?? true)
    await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  // Le « site d'Amazon » : la navigation de retour est interceptée pour ne rien joindre
  await page.route(`${redirectUri}**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Amazon</title>' }),
  )
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
      received.push({
        key,
        body: request.postData() === null ? null : (request.postDataJSON() as unknown),
      })
      const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          headers,
          body: JSON.stringify(body),
        })
      switch (key) {
        case 'POST /api/auth/refresh':
          return json({ token: 'jeton' })
        case 'POST /api/login_check':
          return json({ token: 'jeton' })
        case 'GET /api/v1/me':
          return json(me)
        case 'POST /api/auth/logout':
          return route.fulfill({ status: 204 })
        case 'POST /api/v1/voice/alexa/authorize': {
          const answer = options.authorize ?? { status: 200 }
          if (answer.status === 200) return json({ redirectUrl: returned })

          return json(
            { error: { message: answer.message ?? 'Refusé' } },
            answer.status,
            answer.retryAfter === undefined ? {} : { 'Retry-After': answer.retryAfter },
          )
        }
        default:
          return route.fulfill({ status: 500, body: `Appel non prévu : ${key}` })
      }
    },
  )

  return received
}

const authorizeCalls = (received: Received[]) =>
  received.filter((call) => call.key === 'POST /api/v1/voice/alexa/authorize')

test.describe('liaison d’Alexa, parcours simulé', () => {
  test('connecté : ce qu’Alexa pourra faire, le compte et le site du retour, rien d’envoyé avant « Autoriser », puis retour vers l’adresse du back', async ({
    page,
  }) => {
    const received = await fakeBack(page)
    await page.goto(address)

    await expect(
      page.getByRole('heading', { level: 1, name: 'Lier Alexa à ton compte ?' }),
    ).toBeVisible()
    await expect(
      page.getByText(
        'Alexa pourra lire ta liste, ajouter ou retirer des produits, et planifier des repas.',
      ),
    ).toBeVisible()
    await expect(page.getByTestId('alexa-account')).toHaveText('alexiane@example.com')
    await expect(page.getByTestId('alexa-host')).toHaveText('pitangui.amazon.com')
    await expect(page.getByRole('button')).toHaveText([
      'Ce n’est pas toi ?',
      'Autoriser',
      'Annuler',
    ])
    expect(authorizeCalls(received)).toEqual([])

    await page.getByRole('button', { name: 'Autoriser' }).click()

    await expect(page).toHaveURL(returned)
    expect(authorizeCalls(received)).toEqual([
      {
        key: 'POST /api/v1/voice/alexa/authorize',
        body: {
          clientId: 'repas-alexa',
          redirectUri,
          state: 'etat-1',
          codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
          codeChallengeMethod: 'S256',
        },
      },
    ])
  })

  test('déconnecté : la connexion par mot de passe, puis retour sur la page avec les mêmes paramètres', async ({
    page,
  }) => {
    const received = await fakeBack(page, { signedIn: false })
    await page.goto(address)

    await expect(page).toHaveURL(/\/connexion\?redirect=/)
    expect(authorizeCalls(received)).toEqual([])
    await page.getByLabel('Adresse e-mail').fill('alexiane@example.com')
    await page.getByLabel('Mot de passe').fill('un mot de passe')
    await page.getByRole('button', { name: 'Se connecter' }).click()

    await expect(
      page.getByRole('heading', { level: 1, name: /Lier Alexa à ton compte/ }),
    ).toBeVisible()
    const back = new URL(page.url())
    expect(back.pathname).toBe('/alexa/lier')
    expect(Object.fromEntries(back.searchParams)).toEqual(
      Object.fromEntries(new URLSearchParams(query)),
    )
    expect(authorizeCalls(received)).toEqual([])
  })

  test('« Ce n’est pas toi ? » ferme la session, puis la connexion ramène sur la page avec les mêmes paramètres', async ({
    page,
  }) => {
    const received = await fakeBack(page)
    await page.goto(address)

    await page.getByRole('button', { name: 'Ce n’est pas toi ?' }).click()

    await expect(page).toHaveURL(/\/connexion\?redirect=/)
    expect(received.map((call) => call.key)).toContain('POST /api/auth/logout')
    expect(authorizeCalls(received)).toEqual([])
    await page.getByLabel('Adresse e-mail').fill('autre@example.com')
    await page.getByLabel('Mot de passe').fill('un mot de passe')
    await page.getByRole('button', { name: 'Se connecter' }).click()

    await expect(
      page.getByRole('heading', { level: 1, name: 'Lier Alexa à ton compte ?' }),
    ).toBeVisible()
    const back = new URL(page.url())
    expect(back.pathname).toBe('/alexa/lier')
    expect(Object.fromEntries(back.searchParams)).toEqual(
      Object.fromEntries(new URLSearchParams(query)),
    )
    expect(authorizeCalls(received)).toEqual([])
  })

  test('« Annuler » mène à l’accueil sans rien demander au back', async ({ page }) => {
    const received = await fakeBack(page, { authorize: { status: 500 } })
    await page.route('**/api/v1/shopping-lists/**', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: '{"error":{"message":"x"}}',
      }),
    )
    await page.goto(address)

    await page.getByRole('button', { name: 'Annuler' }).click()

    await expect(page).not.toHaveURL(/alexa/)
    expect(authorizeCalls(received)).toEqual([])
  })

  test('des paramètres manquants : une phrase et l’accueil, aucun appel', async ({ page }) => {
    const received = await fakeBack(page)
    await page.goto('/alexa/lier?client_id=repas-alexa')

    await expect(page.getByRole('alert')).toHaveText(
      'Ce lien ne marche pas. Reprends depuis l’application Alexa.',
    )
    await expect(page.getByRole('link', { name: 'Retour à l’accueil' })).toBeVisible()
    await expect(page.getByRole('button')).toHaveCount(0)
    expect(authorizeCalls(received)).toEqual([])
  })

  for (const [name, answer, text] of [
    [
      '422',
      { status: 422, message: 'VOICE_AUTHORIZATION_REFUSED' },
      'Alexa ne peut pas être liée avec ce lien. Reprends depuis l’application Alexa.',
    ],
    [
      '429',
      { status: 429, message: 'VOICE_RATE_LIMITED', retryAfter: '600' },
      'Trop d’essais pour le moment. Réessaie dans quelques minutes.',
    ],
    [
      '404',
      { status: 404, message: 'VOICE_DISABLED' },
      'Cette fonction n’est pas encore disponible.',
    ],
  ] as const) {
    test(`refus ${name} : une phrase et l’accueil, jamais de redirection`, async ({ page }) => {
      await fakeBack(page, { authorize: answer })
      await page.goto(address)

      await page.getByRole('button', { name: 'Autoriser' }).click()

      await expect(page.getByRole('alert')).toHaveText(text)
      await expect(page.getByRole('link', { name: 'Retour à l’accueil' })).toBeVisible()
      await expect(page).toHaveURL(/\/alexa\/lier/)
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Une décision par écran, à 360 × 640, clair et sombre

const screens: { name: string; prepare: (page: Page) => Promise<void>; primary: string }[] = [
  {
    name: 'autoriser',
    prepare: async (page) => {
      await fakeBack(page)
      await page.goto(address)
    },
    primary: 'Autoriser',
  },
  {
    name: 'connexion',
    prepare: async (page) => {
      await fakeBack(page, { signedIn: false })
      await page.goto(address)
    },
    primary: 'Se connecter',
  },
  {
    name: 'lien-invalide',
    prepare: async (page) => {
      await fakeBack(page)
      await page.goto('/alexa/lier')
    },
    primary: 'Retour à l’accueil',
  },
  {
    name: 'lien-refuse',
    prepare: async (page) => {
      await fakeBack(page, { authorize: { status: 422, message: 'VOICE_AUTHORIZATION_REFUSED' } })
      await page.goto(address)
      await page.getByRole('button', { name: 'Autoriser' }).click()
      await page.getByRole('alert').waitFor()
    },
    primary: 'Retour à l’accueil',
  },
  {
    name: 'trop-d-essais',
    prepare: async (page) => {
      await fakeBack(page, {
        authorize: { status: 429, message: 'VOICE_RATE_LIMITED', retryAfter: '600' },
      })
      await page.goto(address)
      await page.getByRole('button', { name: 'Autoriser' }).click()
      await page.getByRole('alert').waitFor()
    },
    primary: 'Retour à l’accueil',
  },
  {
    name: 'pas-disponible',
    prepare: async (page) => {
      await fakeBack(page, { authorize: { status: 404, message: 'VOICE_DISABLED' } })
      await page.goto(address)
      await page.getByRole('button', { name: 'Autoriser' }).click()
      await page.getByRole('alert').waitFor()
    },
    primary: 'Retour à l’accueil',
  },
]

const viewports = [
  { label: '360 × 640', size: { width: 360, height: 640 } },
  { label: 'bureau 1280 × 800', size: { width: 1280, height: 800 } },
]

for (const { label, size } of viewports) {
  test.describe(`liaison d’Alexa, ${label}`, () => {
    test.use({ viewport: size })

    for (const colorScheme of ['light', 'dark'] as const) {
      for (const screen of screens) {
        test(`${screen.name} : le bouton principal se voit sans défiler et l’écran reste accessible (WCAG AA), thème ${colorScheme}`, async ({
          page,
        }, testInfo) => {
          await page.emulateMedia({ colorScheme })
          await screen.prepare(page)
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

          const primary = page
            .getByRole('button', { name: screen.primary })
            .or(page.getByRole('link', { name: screen.primary }))
            .first()
          const box = await primary.boundingBox()
          expect(box, 'le bouton principal est affiché').not.toBeNull()
          expect(
            box!.y + box!.height,
            'le bouton principal se voit sans défiler',
          ).toBeLessThanOrEqual(size.height)
          expect(box!.height, 'cible d’au moins 44 px').toBeGreaterThanOrEqual(44)
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          )
          expect(overflow, 'pas de défilement horizontal').toBeLessThanOrEqual(0)

          const { violations } = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .exclude('.vue-devtools__anchor-btn')
            .analyze()
          expect(violations).toEqual([])
          await page.screenshot({
            path: testInfo.outputPath(`${colorScheme}-${screen.name}-${size.width}.png`),
          })
        })
      }
    }
  })
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Avec le VRAI back (`make e2e`)

test.describe('liaison d’Alexa, avec le back', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasSession, 'E2E_WITH_BACK, E2E_EMAIL et E2E_PASSWORD sont nécessaires')

  test('la vraie connexion ramène sur la page ; une adresse de retour inconnue est refusée sans redirection', async ({
    page,
  }) => {
    await signIn(page, address)

    await expect(
      page.getByRole('heading', { level: 1, name: /Lier Alexa à ton compte/ }),
    ).toBeVisible()
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(
      Object.fromEntries(new URLSearchParams(query)),
    )

    // La fonction est coupée par défaut (404 `VOICE_DISABLED`) ; allumée, cette adresse n'est pas dans la liste du back (422) :
    // dans les deux cas, une phrase, l'accueil, et aucun départ vers l'adresse donnée.
    await page.getByRole('button', { name: 'Autoriser' }).click()
    await expect(page.getByRole('alert')).toHaveText(
      /Cette fonction n’est pas encore disponible\.|Alexa ne peut pas être liée avec ce lien\./,
    )
    await expect(page).toHaveURL(/\/alexa\/lier/)
  })
})
