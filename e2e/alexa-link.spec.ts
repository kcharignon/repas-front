// Liaison d'Alexa (VOX-401) : la page `/alexa/lier` que l'application Alexa ouvre, sans back ni compte (l'API est simulée par `page.route`).
//  - le parcours déconnecté -> connexion -> retour avec les mêmes paramètres -> « Autoriser » -> départ vers l'adresse du back ; les textes, « Ce n'est
//    pas toi ? », « Annuler » et les refus du back sont des tests de composant (`AlexaLinkView.spec.ts`) ;
//  - une décision par écran à 360 × 640 : le bouton principal se voit sans défiler, accessibilité (WCAG AA) en clair et en sombre.
// Aucune vraie adresse : uniquement des valeurs inventées ; la redirection vers « Amazon » est interceptée, rien ne sort du test.
import { expect, test } from './support/test'
import type { Page } from '@playwright/test'

import { checkScreen, type Screen } from './support/screen'
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
  // Le seul enchaînement de bout en bout : la garde du routeur, la vraie connexion, le retour sur la page avec les cinq paramètres, puis
  // « Autoriser » qui quitte VRAIMENT le site vers l'adresse rendue par le back (en jsdom, `location.assign` n'est que simulé).
  test('déconnecté : la connexion par mot de passe, retour sur la page avec les mêmes paramètres, puis « Autoriser » mène à l’adresse du back', async ({
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
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Une décision par écran, à 360 × 640, clair et sombre. Les quatre écrans d'erreur (lien invalide, refusé, trop d'essais, pas disponible)
// ont le même gabarit (une alerte, « Retour à l'accueil ») et seule la phrase change : `lien-refuse` porte la plus longue et les
// représente ; leurs textes sont dans `AlexaLinkView.spec.ts`. La connexion est celle de `registration.spec.ts`.

const screens: Screen[] = [
  {
    name: 'autoriser',
    prepare: async (page) => {
      await fakeBack(page)
      await page.goto(address)
    },
    primary: 'Autoriser',
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
]

const phone = { width: 360, height: 640 }

test.describe('liaison d’Alexa, 360 × 640', () => {
  test.use({ viewport: phone })

  for (const screen of screens) {
    test(`${screen.name} : le bouton principal se voit sans défiler et l’écran reste accessible (WCAG AA) en clair et en sombre`, async ({
      page,
    }) => {
      await checkScreen(page, screen, phone)
    })
  }
})

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
