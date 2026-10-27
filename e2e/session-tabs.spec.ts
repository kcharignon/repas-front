// La session d'un onglet à l'autre : deux onglets du même navigateur partagent le stockage et le cookie de session. Sans back ni compte
// (l'API est simulée par `context.route`). Quand l'un se déconnecte, l'autre l'apprend par l'événement `storage` du navigateur (jamais
// émis dans l'onglet qui écrit : il faut bien deux onglets), oublie ses copies et mène à la connexion, sans clic.
import { expect, test } from './support/test'

const me = {
  id: 'u1',
  email: 'alexiane@example.com',
  roles: ['ROLE_USER'],
  isAdmin: false,
  defaultServing: 4,
}

test('une déconnexion dans un onglet met fin à la session de l’autre, copies comprises', async ({
  context,
}) => {
  await context.addInitScript(() => {
    // Une session déjà ouverte : l'indice qui permet de la retrouver par le cookie de renouvellement
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('repas.session', '1')
      sessionStorage.setItem('seeded', '1')
    }
  })
  const received: string[] = []
  await context.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
      received.push(key)
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      switch (key) {
        case 'POST /api/auth/refresh':
          return json({ token: 'jeton' })
        case 'GET /api/v1/me':
          return json(me)
        case 'POST /api/auth/logout':
          return route.fulfill({ status: 204 })
        case 'GET /api/v1/voice/links':
          return json({ error: { message: 'VOICE_DISABLED' } }, 404)
        default:
          return json({ error: { message: 'NOT_FOUND' } }, 404)
      }
    },
  )

  const tabA = await context.newPage()
  const tabB = await context.newPage()
  await tabA.goto('/moi')
  await tabB.goto('/moi')
  await expect(tabA.getByText(me.email)).toBeVisible()
  await expect(tabB.getByText(me.email)).toBeVisible()
  // Ce que l'onglet B garde de la session et du drive (clés lues par l'application, valeurs sans importance ici)
  await tabB.evaluate(() => {
    localStorage.setItem(
      'repas.drive.run',
      JSON.stringify({
        runId: '00000000-0000-4000-8000-000000000000',
        listId: 'liste-1',
        startedAt: new Date().toISOString(),
      }),
    )
    localStorage.setItem(
      'repas.cache',
      JSON.stringify({ userId: 'u1', savedAt: Date.now(), state: { mutations: [], queries: [] } }),
    )
  })

  await tabA.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(tabA).toHaveURL(/\/connexion/)

  // L'onglet B n'a rien demandé : il suit
  await expect(tabB).toHaveURL(/\/connexion/)
  await expect(tabB.getByRole('heading', { level: 1 })).toBeVisible()
  expect(
    await tabB.evaluate(() =>
      ['repas.session', 'repas.user', 'repas.drive.run', 'repas.cache'].map((key) =>
        localStorage.getItem(key),
      ),
    ),
  ).toEqual([null, null, null, null])
  // Un seul appel de déconnexion : celui de l'onglet qui l'a demandée
  expect(received.filter((key) => key === 'POST /api/auth/logout')).toHaveLength(1)
})
