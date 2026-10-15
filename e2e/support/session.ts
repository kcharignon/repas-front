import type { APIRequestContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'

export const withBack = Boolean(process.env.E2E_WITH_BACK)
export const email = process.env.E2E_EMAIL ?? ''
export const password = process.env.E2E_PASSWORD ?? ''
export const hasSession = withBack && email !== '' && password !== ''

/** Un jeton pour préparer ou nettoyer des données directement par l'API (le test, lui, passe par l'interface). */
export async function apiToken(request: APIRequestContext): Promise<string> {
  const login = await request.post('/api/login_check', { data: { email, password } })
  expect(login.status()).toBe(200)

  return ((await login.json()) as { token: string }).token
}

export async function signIn(page: Page, destination = '/') {
  await page.goto(destination)
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
}
