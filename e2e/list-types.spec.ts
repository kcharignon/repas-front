// « Moi, Types de liste » (LST-006), sans back ni compte : l'API est simulée par `page.route`, avec un état qui suit les créations, les
// enregistrements et les suppressions. Un seul test, à 360 px : le parcours entier de « Moi » jusqu'à la suppression (vrais clics), avec à chaque
// écran la mise en page (pas de défilement horizontal, cibles de 44 px) et l'accessibilité (WCAG AA, contraste compris) dans les DEUX thèmes de
// la même visite. Les textes, les refus du back et chaque état sont des tests de composant (`src/features/list-types/__tests__`).
// `E2E_SHOTS=<dossier>` garde une capture de chaque thème.
import { expect, test, type Page } from './support/test'
import { axeBothThemes } from './support/screen'

test.use({ viewport: { width: 360, height: 780 } })

const departments = [
  { slug: 'viandes', name: 'Viandes' },
  { slug: 'charcuterie', name: 'Charcuterie' },
  { slug: 'fruits-legumes', name: 'Fruits et légumes' },
  { slug: 'epicerie', name: 'Épicerie' },
]

interface FakeType {
  id: string
  name: string
  departmentSlugs: string[]
  products: { slug: string; name: string; departmentSlug: string }[]
}

async function fakeBack(page: Page, initial: FakeType[]) {
  const types = [...initial]
  const sent: { key: string; body: unknown }[] = []
  await page.addInitScript(() => localStorage.setItem('repas.session', '1'))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const key = `${request.method()} ${path}`
      const reply = (body?: unknown, status = body === undefined ? 204 : 200) =>
        route.fulfill(
          body === undefined
            ? { status }
            : { status, contentType: 'application/json', body: JSON.stringify(body) },
        )
      const body = request.postData() === null ? null : request.postDataJSON()
      if (['POST', 'PUT', 'DELETE'].includes(request.method())) sent.push({ key, body })

      if (key === 'POST /api/auth/refresh') return reply({ token: 'jeton' })
      if (key === 'GET /api/v1/me')
        return reply({
          id: 'u1',
          email: 'moi@example.com',
          roles: ['ROLE_USER'],
          isAdmin: false,
          defaultServing: 4,
        })
      if (key === 'GET /api/v1/departments')
        return reply({
          member: departments.map((department) => ({
            ...department,
            image: '',
            icon: null,
            listTypeId:
              types.find((type) => type.departmentSlugs.includes(department.slug))?.id ?? null,
          })),
          totalItems: departments.length,
        })
      if (key === 'GET /api/v1/shopping-list-types')
        return reply({
          member: types.map((type) => ({
            id: type.id,
            name: type.name,
            departmentSlugs: type.departmentSlugs,
            ingredientCount: type.products.length,
          })),
          totalItems: types.length,
        })
      if (key === 'POST /api/v1/shopping-list-types') {
        const id = `t${types.length + 1}`
        types.push({
          id,
          name: (body as { name: string }).name,
          departmentSlugs: [],
          products: [],
        })

        return route.fulfill({
          status: 201,
          headers: { Location: `/api/v1/shopping-list-types/${id}` },
        })
      }
      const one = /^(GET|PUT|DELETE) \/api\/v1\/shopping-list-types\/([^/]+)$/.exec(key)
      const type = one === null ? undefined : types.find((candidate) => candidate.id === one[2])
      if (one !== null && type !== undefined) {
        if (one[1] === 'GET')
          return reply({
            id: type.id,
            name: type.name,
            departments: departments.filter((d) => type.departmentSlugs.includes(d.slug)),
            ingredients: type.products.map((product) => ({
              ...product,
              departmentName:
                departments.find((d) => d.slug === product.departmentSlug)?.name ?? '',
            })),
          })
        if (one[1] === 'PUT') {
          const payload = body as { name: string; departmentSlugs: string[] }
          for (const other of types)
            if (other !== type)
              other.departmentSlugs = other.departmentSlugs.filter(
                (slug) => !payload.departmentSlugs.includes(slug),
              )
          type.name = payload.name
          type.departmentSlugs = payload.departmentSlugs

          return reply()
        }
        types.splice(types.indexOf(type), 1)

        return reply()
      }
      const release = /^PUT \/api\/v1\/ingredients\/([^/]+)\/list-destination$/.exec(key)
      if (release !== null) {
        for (const candidate of types)
          candidate.products = candidate.products.filter((product) => product.slug !== release[1])

        return reply()
      }

      return reply({ error: { message: `Appel non prévu : ${key}` } }, 500)
    },
  )

  return { sent, bodyOf: (key: string) => sent.find((entry) => entry.key === key)?.body }
}

const marche: FakeType = {
  id: 't1',
  name: 'Marché',
  departmentSlugs: ['fruits-legumes'],
  products: [],
}

test('on crée un type, on lui range des rayons, on retire un produit à part puis on le supprime, accessible dans les deux thèmes à chaque écran', async ({
  page,
}) => {
  const back = await fakeBack(page, [
    marche,
    {
      id: 't2',
      name: 'Boucherie',
      departmentSlugs: ['viandes'],
      products: [{ slug: 'merguez', name: 'Merguez', departmentSlug: 'charcuterie' }],
    },
  ])
  const noOverflow = async () =>
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0)

  // 1. « Moi » : l'entrée avec son sous-titre
  await page.goto('/moi')
  const entry = page.getByRole('link', { name: /Types de liste/ })
  await expect(entry).toContainText('Sépare tes courses par magasin.')
  expect((await entry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await entry.click()

  // 2. L'écran des types : chaque type avec ses rayons et ses produits à part, la liste principale en bas
  await expect(page.getByRole('heading', { name: 'Types de liste', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /Boucherie/ })).toContainText(
    'Viandes · 1 produit à part',
  )
  await expect(page.getByText('Tout le reste')).toBeVisible()
  await noOverflow()
  await axeBothThemes(page, 'types-de-liste')

  // 3. Ajouter un type : le seul champ « Nom du type », puis Enregistrer
  await page.getByRole('button', { name: 'Ajouter un type' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Nom du type')).toBeFocused()
  await dialog.getByLabel('Nom du type').fill('Primeur')
  await axeBothThemes(page, 'types-de-liste-ajout')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()
  expect(back.bodyOf('POST /api/v1/shopping-list-types')).toEqual({ name: 'Primeur' })
  await expect(page.getByRole('link', { name: /Primeur/ })).toContainText(
    'Aucun rayon pour l’instant',
  )

  // 4. La fiche du nouveau type : cocher « Fruits et légumes » (pris par Marché) le déplace ici
  await page.getByRole('link', { name: /Primeur/ }).click()
  await expect(page.getByRole('heading', { name: 'Primeur', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  await expect(page.getByText('Dans Marché')).toBeVisible()
  await page.getByRole('switch', { name: /Fruits et légumes/ }).click()
  await expect(page.getByRole('switch', { name: /Fruits et légumes/ })).toBeChecked()
  await noOverflow()
  await axeBothThemes(page, 'type-de-liste')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Type enregistré.')).toBeVisible()
  expect(back.bodyOf('PUT /api/v1/shopping-list-types/t3')).toEqual({
    name: 'Primeur',
    departmentSlugs: ['fruits-legumes'],
  })

  // 5. Retour à la liste : Marché a perdu son rayon, Primeur l'a
  await page.getByRole('link', { name: 'Types de liste' }).first().click()
  await expect(page.getByRole('link', { name: /Marché/ })).toContainText(
    'Aucun rayon pour l’instant',
  )
  await expect(page.getByRole('link', { name: /Primeur/ })).toContainText('Fruits et légumes')

  // 6. La fiche de Boucherie : retirer le produit à part d'un geste, puis supprimer le type après confirmation
  await page.getByRole('link', { name: /Boucherie/ }).click()
  await expect(page.getByText('Merguez')).toBeVisible()
  const remove = page.getByRole('button', { name: 'Retirer Merguez de ce type' })
  expect((await remove.boundingBox())!.width).toBeGreaterThanOrEqual(44)
  await remove.click()
  await expect(page.getByText('Aucun produit à part pour l’instant.')).toBeVisible()
  expect(back.bodyOf('PUT /api/v1/ingredients/merguez/list-destination')).toEqual({
    destination: 'default',
  })
  await page.getByRole('button', { name: 'Supprimer ce type' }).click()
  await expect(dialog).toContainText('Supprimer « Boucherie » ?')
  await expect(dialog).toContainText('Sa liste en cours passe dans Mes listes. Rien n’est perdu.')
  await axeBothThemes(page, 'type-de-liste-suppression')
  await dialog.getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByRole('heading', { name: 'Types de liste', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /Boucherie/ })).toHaveCount(0)
})
