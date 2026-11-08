// L'image d'un rayon (ADR 0039 du back) : l'administrateur ENVOIE un fichier puis enregistre, sans back ni compte (l'API est simulée par
// `page.route`). Le flux critique seulement, au téléphone ET au bureau (la fenêtre n'a pas la même largeur) : envoyer une image, la voir,
// refuser un format, enregistrer, avec l'accessibilité (WCAG AA, contraste compris) de chaque étape dans les DEUX thèmes. Les refus de chaque code,
// le lien collé et les retraits sont des tests de composant (`ImageField.spec.ts`). `E2E_SHOTS=<dossier>` garde une capture de chaque étape et thème.
import { expect, test, BUREAU, type Page, type Route } from './support/test'
import { axeBothThemes } from './support/screen'

const reply = (route: Route, body?: unknown, status = body === undefined ? 204 : 200) =>
  route.fulfill(
    body === undefined
      ? { status }
      : { status, contentType: 'application/json', body: JSON.stringify(body) },
  )

// Une pomme plate : l'aperçu de l'image envoyée, servie par le faux back comme `/images/…` l'est par le vrai
const apple = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M24 14c-3-5-9-3-9 3 0 5 3 15 9 15s9-10 9-15c0-6-6-8-9-3Z" fill="${fill}"/><path d="M24 14c0-3 1-5 4-6" stroke="#3f7a3a" stroke-width="3" fill="none"/></svg>`

/** Un vrai PNG de 1 pixel : le sélecteur de fichiers de la page en reçoit un. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Un faux back : un rayon, une image qui s'envoie (le serveur la rend `images/uploads/neuve.png`) et l'enregistrement. */
async function fakeBack(page: Page) {
  const saved: unknown[] = []
  let uploads = 0
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/images/'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: apple(route.request().url().includes('uploads') ? '#d9993f' : '#e8553a'),
      }),
  )
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const key = `${route.request().method()} ${new URL(route.request().url()).pathname}`
      switch (key) {
        case 'POST /api/auth/refresh':
          return reply(route, { token: 'jeton' })
        case 'GET /api/v1/me':
          return reply(route, {
            id: 'u1',
            email: 'alexiane@example.com',
            roles: ['ROLE_USER', 'ROLE_ADMIN'],
            isAdmin: true,
            defaultServing: 4,
          })
        case 'GET /api/v1/departments':
          return reply(route, {
            member: [{ slug: 'fruits', name: 'Fruits et légumes', image: 'images/fruits.png' }],
            totalItems: 1,
          })
        case 'POST /api/v1/images': {
          // Le premier envoi est un format refusé par le serveur ; le second réussit après un temps (l'envoi se voit en cours)
          if (uploads++ === 0)
            return reply(route, { error: { message: 'IMAGE_NOT_AN_IMAGE' } }, 422)
          await gate
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            headers: { Location: '/images/uploads/neuve.png' },
            body: JSON.stringify({ path: 'images/uploads/neuve.png' }),
          })
        }
        case 'PUT /api/v1/departments/fruits':
          saved.push(route.request().postDataJSON())
          return reply(route)
        default:
          return reply(route, { error: { message: 'inconnu' } }, 404)
      }
    },
  )

  return { saved, release: () => release() }
}

test('envoyer une image, la voir, puis enregistrer le rayon', { tag: BUREAU }, async ({ page }) => {
  const back = await fakeBack(page)
  await page.goto('/admin/rayons')
  await page.getByRole('button', { name: 'Modifier Fruits et légumes', exact: true }).click()
  const group = page.getByRole('group', { name: 'Image' })
  await expect(group).toContainText('PNG, WebP ou SVG, 3 Mo au plus.')
  await expect(
    group.getByRole('img', { name: 'Image actuelle de Fruits et légumes' }),
  ).toBeVisible()
  await axeBothThemes(page, 'admin-image-rayon')

  // Un premier fichier est refusé par le serveur : l'image actuelle ne change pas
  const send = async () => {
    const chooser = page.waitForEvent('filechooser')
    await group.getByRole('button', { name: 'Envoyer une autre image' }).click()
    await (await chooser).setFiles({ name: 'pomme.png', mimeType: 'image/png', buffer: PNG })
  }
  await send()
  await expect(group.getByRole('alert')).toContainText('Ce format n’est pas accepté.')
  await expect(
    group.getByRole('img', { name: 'Image actuelle de Fruits et légumes' }),
  ).toBeVisible()
  await axeBothThemes(page, 'admin-image-refus')

  // Le second réussit : pendant l'envoi le groupe est occupé et « Enregistrer » attend
  await send()
  await expect(group).toHaveAttribute('aria-busy', 'true')
  await expect(group.getByRole('progressbar', { name: 'Envoi de l’image…' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  await axeBothThemes(page, 'admin-image-envoi')
  back.release()
  await expect(group).toContainText('Image prête. Enregistre pour la garder.')
  await expect(group).not.toHaveAttribute('aria-busy')
  await axeBothThemes(page, 'admin-image-prete')

  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect
    .poll(() => back.saved)
    .toEqual([{ name: 'Fruits et légumes', image: 'images/uploads/neuve.png' }])
})
