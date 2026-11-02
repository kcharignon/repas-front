// La carte du guide ne couvre jamais le champ, la case ni le bouton d'une page de connexion dont l'ADRESSE est inconnue de l'agent (DRV-761, recette réelle de 1.6.3 : la carte
// dépliée se posait sur le champ « Mot de passe »). La page n'est reconnue que par son texte (« Connectez-vous avec votre compte ») : sans cela l'agent ne savait pas que ses champs
// sont à garder libres. PROUVÉ PAR LA GÉOMÉTRIE, dans Chromium mobile : le formulaire (un champ, une case à cocher, un bouton) en haut, au milieu et en bas de la page, à 411 × 761 et
// 360 × 740, puis le clavier ouvert (fenêtre réduite, champ au focus). La carte, pleine ou barre, ne recouvre aucun des trois ; et elle n'est JAMAIS effacée ici : une place existe
// toujours, `away` serait un défaut (`expectClear` l'accepte, ce test non). Le faux site n'est pas le vrai : la lecture du vrai DOM reste à confirmer à la recette.
import type { Page } from '@playwright/test'

import { openWithBridge } from './support/agent'
import { expectClear } from './support/geometry'
import { expect, test } from './support/fixtures'
import { known, planOf, product } from './support/plans'
import { MOBILE_HOSTS, MOBILE_PLAN_STORE, startFakeLeclerc } from '../fake-leclerc/server'
import { ACCOUNT_PATH } from '../fake-leclerc/mobile'

const PLAN = planOf([known('farine', 'Farine', [product(1000001, 2)])], {
  store: { ...MOBILE_PLAN_STORE },
})
/** Une page du compte que ni son chemin ni son titre ne désignent comme la connexion (`home-espace-client` n'est pas une page de connexion pour l'agent). */
const UNKNOWN_PAGE = `${ACCOUNT_PATH}/home-espace-client-inconnue.aspx`
const VIEWPORTS = [
  { width: 411, height: 761 },
  { width: 360, height: 740 },
] as const
/** Le clavier d'un téléphone prend plus de 40 % de la hauteur : la page ne garde que cette part. */
const WITH_KEYBOARD = 0.55
const CONTROLS = ['#pass', '#stay', '#go'] as const

type Place = 'haut' | 'milieu' | 'bas'

/**
 * Le vide avant le formulaire (en pixels) : en haut, au milieu (le champ vers 300 px, où la recette réelle a mesuré la carte posée sur lui, le bouton plus bas que la carte pleine ne
 * tient) ou tout en bas de la fenêtre. Le formulaire fait environ 280 px de haut avec le bloc de vérification.
 */
const gap = (place: Place, height: number): number =>
  place === 'haut' ? 0 : place === 'milieu' ? 90 : height - 510

/** Trente champs transparents qui ne reçoivent aucun toucher, dans un calque fixe : ce que la personne ne voit pas. */
const GHOSTS = `<div style="position:fixed;inset:0;opacity:0;pointer-events:none">${Array.from(
  { length: 30 },
  (_, index) =>
    `<input style="position:absolute;top:${index * 25}px;left:10px;width:100px;height:20px">`,
).join('')}</div>`

/** `ghosts` : la page porte des champs fantômes et n'a pas le bloc de vérification (la carte pleine tient alors en bas). */
const pageHtml = (space: number, ghosts: boolean): string => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Identification</title>
<style>body{font-family:sans-serif;margin:0} header{height:56px;background:#eee} main{padding:16px}
input[type=password]{display:block;width:100%;height:44px;box-sizing:border-box;margin:8px 0} button{height:44px;width:100%}</style></head>
<body><header></header><main><div style="height:${space}px"></div><h1>Connexion</h1><p>Connectez-vous avec votre compte</p>
<form onsubmit="return false"><label for="pass">Mot de passe</label><input id="pass" type="password">
<label><input type="checkbox" id="stay"> Rester connecté</label>
${ghosts ? '' : '<div style="height:160px;background:#ddd">Je suis un humain</div>'}
<button type="submit" id="go">Me connecter</button></form></main>${ghosts ? GHOSTS : ''}</body></html>`

async function open(page: Page, agentCode: string, html: string, use: () => Promise<void>) {
  const fake = await startFakeLeclerc({ hosts: MOBILE_HOSTS })
  try {
    fake.setBehavior({ mobile: {} })
    await page.route(`**${UNKNOWN_PAGE}`, (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    )
    const app = await openWithBridge(page, fake, agentCode, {
      path: UNKNOWN_PAGE,
      origin: fake.mobileOrigins.account,
    })
    app.answerHello(PLAN)
    // La carte de la connexion est là, et elle a lu la page comme la connexion (le mot de passe, pas la phrase générale)
    await expect(page.locator('.screen.guide')).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator('.screen.guide')).toContainText('mot de passe')
    await use()
  } finally {
    await fake.close()
  }
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport })

    for (const place of ['haut', 'milieu', 'bas'] as const) {
      test(`le formulaire en ${place} : la carte ne couvre ni le champ, ni la case, ni le bouton, et elle reste affichée`, async ({
        page,
        agentCode,
      }) => {
        await open(page, agentCode, pageHtml(gap(place, viewport.height), false), async () => {
          const shape = await expectClear(page, CONTROLS)
          expect(shape, 'une place existe : la carte ne s’efface pas').not.toBe('away')
        })
      })
    }

    test('le clavier ouvert (fenêtre réduite, champ au focus) : la carte ne couvre rien et reste affichée', async ({
      page,
      agentCode,
    }) => {
      await open(page, agentCode, pageHtml(gap('haut', viewport.height), false), async () => {
        await page.locator('#pass').focus()
        await page.setViewportSize({
          width: viewport.width,
          height: Math.round(viewport.height * WITH_KEYBOARD),
        })
        const shape = await expectClear(page, CONTROLS)
        expect(shape, 'une place existe : la carte ne s’efface pas').not.toBe('away')
        expect(shape, 'pendant la saisie la carte est réduite').not.toBe('full')
      })
    })

    test('trente champs transparents sans toucher dans un calque ne réduisent pas la carte pleine ; le vrai formulaire reste libre', async ({
      page,
      agentCode,
    }) => {
      await open(page, agentCode, pageHtml(gap('haut', viewport.height), true), async () => {
        expect(await expectClear(page, CONTROLS)).toBe('full')
      })
    })
  })
}
