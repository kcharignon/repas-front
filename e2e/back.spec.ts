import { expect, test } from '@playwright/test'

// Ces tests parlent au VRAI back de développement, à travers le proxy du front (même origine que l'application) :
// `make e2e` les joue (E2E_WITH_BACK est posé par compose). La CI, sans back, les ignore.
// Les identifiants de session viennent de l'environnement (`E2E_EMAIL=… E2E_PASSWORD=… make e2e`), jamais du dépôt.
const withBack = Boolean(process.env.E2E_WITH_BACK)
const credentials = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD)

test.describe('avec le back', () => {
  // Skips conditionnels voulus : sans back ou sans identifiants, seuls les tests qui n'en ont pas besoin tournent.
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!withBack, 'E2E_WITH_BACK : lancer `make e2e` avec le back de développement')

  test('le front joint le back par son proxy', async ({ request }) => {
    const response = await request.get('/api/v1/health')

    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  test.describe('session', () => {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(!credentials, 'E2E_EMAIL et E2E_PASSWORD sont nécessaires pour se connecter au back')

    test('la connexion donne un jeton et pose le cookie de rafraîchissement, le refresh en rend un neuf', async ({
      request,
    }) => {
      const login = await request.post('/api/login_check', {
        data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
      })

      expect(login.status()).toBe(200)
      const { token } = (await login.json()) as { token: string }
      expect(token).toBeTruthy()
      expect(login.headers()['set-cookie']).toContain('repas_refresh')

      // Le cookie (HttpOnly, Path=/api/auth) est rejoué par le contexte de requêtes : aucun jeton dans le corps.
      const refresh = await request.post('/api/auth/refresh')

      expect(refresh.status()).toBe(200)
      expect(((await refresh.json()) as { token: string }).token).toBeTruthy()
    })

    test('un mauvais mot de passe est refusé sans rien révéler', async ({ request }) => {
      const login = await request.post('/api/login_check', {
        data: { email: process.env.E2E_EMAIL, password: 'pas-le-bon-mot-de-passe' },
      })

      expect(login.status()).toBe(401)
    })
  })
})
