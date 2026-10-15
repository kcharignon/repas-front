// Budgets Lighthouse (plan du front, phase 5) : `make lighthouse` mesure les pages principales de l'IMAGE DE PRODUCTION, connecté
// avec le compte de démonstration, et échoue sous les budgets. Lighthouse est installé à la volée (LIGHTHOUSE_MODULE), pas dans
// package.json : l'outil pèse des centaines de paquets et ne sert qu'ici.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

import { chromium } from '@playwright/test'

const base = process.env.LH_URL ?? 'http://localhost'
const email = process.env.LH_EMAIL ?? 'user@repas.fr'
const password = process.env.LH_PASSWORD ?? ''
const port = 9333

// Budgets : performance sur un téléphone moyen simulé (réseau lent, CPU ralenti x4), les trois autres sans concession.
const budgets = { performance: 90, accessibility: 100, 'best-practices': 100, seo: 90 }
const pages = [
  { name: 'connexion', path: '/connexion', signedIn: false },
  { name: 'liste', path: '/liste', signedIn: true },
  { name: 'listes', path: '/listes', signedIn: true },
  { name: 'recettes', path: '/recettes', signedIn: true },
  { name: 'rayons', path: '/rayons', signedIn: true },
]

const { default: lighthouse } = await import(pathToFileURL(process.env.LIGHTHOUSE_MODULE ?? 'lighthouse').href)

// Contexte persistant = contexte par défaut du navigateur : Lighthouse y ouvre son onglet, avec les cookies de la session.
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'lighthouse-')), {
  args: [`--remote-debugging-port=${port}`],
})
const page = context.pages()[0] ?? (await context.newPage())
const rows = []
let failed = false

async function measure({ name, path }) {
  const { lhr } = await lighthouse(`${base}${path}`, {
    port,
    output: 'json',
    logLevel: 'error',
    formFactor: 'mobile',
    onlyCategories: Object.keys(budgets),
    disableStorageReset: true,
  })
  const row = { page: name }
  for (const [category, minimum] of Object.entries(budgets)) {
    const score = Math.round((lhr.categories[category]?.score ?? 0) * 100)
    row[category] = score
    if (score < minimum) {
      failed = true
      const culprits = Object.values(lhr.audits)
        .filter((audit) => audit.score !== null && audit.score < 0.9 && audit.scoreDisplayMode === 'numeric')
        .map((audit) => audit.id)
      console.error(`✘ ${name} : ${category} ${score} < ${minimum} (${culprits.join(', ')})`)
    }
  }
  row.LCP = lhr.audits['largest-contentful-paint'].displayValue
  row.TBT = lhr.audits['total-blocking-time'].displayValue
  rows.push(row)
}

try {
  for (const entry of pages.filter((candidate) => !candidate.signedIn)) await measure(entry)

  await page.goto(`${base}/connexion`)
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL('**/liste')
  for (const entry of pages.filter((candidate) => candidate.signedIn)) await measure(entry)
} finally {
  await context.close()
}

console.table(rows)
console.log(failed ? '✘ Budgets Lighthouse non tenus' : '✔ Budgets Lighthouse tenus')
process.exit(failed ? 1 : 0)
