import { expect, test } from '@playwright/test'

import { withBack } from './support/session'

// Parcours complet contre le VRAI back et sa boîte de développement Mailpit (`make e2e`, service `mailer` du back). Chaque
// exécution inscrit une adresse neuve (`e2e-<horodatage>@example.com`) : le back de développement en garde la trace.
const mailpit = process.env.E2E_MAILPIT_URL ?? 'http://mailer:8025'

async function linkSentTo(
  request: import('@playwright/test').APIRequestContext,
  address: string,
): Promise<string> {
  let link = ''
  await expect
    .poll(
      async () => {
        const found = await request.get(
          `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
        )
        const { messages } = (await found.json()) as { messages: { ID: string }[] }
        if (messages.length === 0) return ''
        const message = await request.get(`${mailpit}/api/v1/message/${messages[0]!.ID}`)
        const { Text } = (await message.json()) as { Text: string }
        link = /https?:\/\/\S+\/confirmation-email\?token=[0-9a-f]+/.exec(Text)?.[0] ?? ''

        return link
      },
      { timeout: 10_000, message: `aucun e-mail de confirmation reçu pour ${address}` },
    )
    .not.toBe('')

  return link
}

test.describe('confirmation de l’adresse e-mail, avec le back', () => {
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!withBack, 'E2E_WITH_BACK est nécessaire')

  test('inscription, connexion refusée, lien reçu, confirmation, connexion', async ({
    page,
    request,
  }, testInfo) => {
    // Le back plafonne les inscriptions (10 par heure et par IP) : un seul projet joue le parcours.
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(testInfo.project.name !== 'chromium', 'jouer le parcours une fois suffit')
    const address = `e2e-${Date.now()}@example.com`
    const password = 'Un mot de passe 1 solide!'

    // Inscription : le compte attend, aucune session n'est ouverte
    await page.goto('/inscription')
    await page.getByLabel('Adresse e-mail').fill(address)
    await page.getByLabel('Mot de passe').fill(password)
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page).toHaveURL(/\/verification-email\?email=/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Vérifie ta boîte mail' }),
    ).toBeVisible()
    await expect(page.getByText(`Un lien de confirmation a été envoyé à ${address}`)).toBeVisible()

    // Connexion avant confirmation : refusée, avec le chemin pour renvoyer le lien
    await page.goto('/connexion')
    await page.getByLabel('Adresse e-mail').fill(address)
    await page.getByLabel('Mot de passe').fill(password)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page.getByRole('alert')).toContainText('pas encore confirmée')
    await expect(page.getByRole('link', { name: 'Renvoyer le lien de confirmation' })).toBeVisible()

    // Le lien reçu par e-mail active le compte, à usage unique
    const link = new URL(await linkSentTo(request, address))
    await page.goto(`${link.pathname}${link.search}`)
    await expect(page.getByText('ton compte est activé')).toBeVisible()
    await page.goto(`${link.pathname}${link.search}`)
    await expect(page.getByRole('alert')).toContainText(/Ce lien n.est plus valable/)

    // Connexion possible
    await page.goto('/connexion')
    await page.getByLabel('Adresse e-mail').fill(address)
    await page.getByLabel('Mot de passe').fill(password)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page).not.toHaveURL(/\/connexion/)
    await expect(page.getByRole('navigation').first()).toBeVisible()
  })
})
