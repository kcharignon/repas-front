// La carte du guide ne cache JAMAIS ce que la personne doit toucher ou voir (DRV-757), PROUVÉ PAR LA GÉOMÉTRIE : l'agent réel, dans Chromium mobile, contre le faux site mobile de
// Leclerc, à 411 × 761 (le téléphone de test, mesuré) puis 411 × 914. À chaque étape, avec le clavier simulé ouvert (la fenêtre rétrécit et le champ a le focus) ou fermé, la carte,
// réduite ou non, ne recouvre ni le champ où l'on écrit, ni la ville proposée, ni le bouton de chaque magasin, ni les champs et le bouton de validation de la connexion (e-mail,
// mot de passe, les six cases du code, « Valider »). ATTENTION : le faux site n'est PAS le vrai (ses cartes de magasin sont plus basses que les 240 px mesurés, le DOM des vraies
// pages n'a jamais été relevé) : ce test prouve la logique de placement, pas la lecture du vrai DOM. Les captures de chaque étape sont écrites dans le dossier de
// `CARD_SHOTS=<dossier>` quand il est donné (jamais dans le dépôt).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from '@playwright/test'

import { openWithBridge } from './support/agent'
import { expectClear, overlaps } from './support/geometry'
import { expect, test } from './support/fixtures'
import { known, planOf, product } from './support/plans'
import {
  MOBILE_HOSTS,
  MOBILE_PLAN_STORE,
  startFakeLeclerc,
  type FakeLeclerc,
  type MobileBehavior,
} from '../fake-leclerc/server'
import { MOBILE_PAGE_PATH } from '../fake-leclerc/mobile'
import type { PlanLine } from '../protocol'

const PLAN = (...lines: PlanLine[]) => planOf(lines, { store: { ...MOBILE_PLAN_STORE } })
const FARINE = known('farine', 'Farine', [product(1000001, 2)])
const VIEWPORTS = [
  { width: 411, height: 761 },
  { width: 411, height: 914 },
] as const
/** Le clavier d'un téléphone prend plus de 40 % de la hauteur : la page ne garde que cette part. */
const WITH_KEYBOARD = 0.55

async function withMobile(
  mobile: MobileBehavior,
  use: (fake: FakeLeclerc) => Promise<void>,
): Promise<void> {
  const fake = await startFakeLeclerc({ hosts: MOBILE_HOSTS })
  try {
    fake.setBehavior({ mobile })
    await use(fake)
  } finally {
    await fake.close()
  }
}

/** Le clavier s'ouvre : la fenêtre rétrécit, le champ a le focus. Il se ferme : la fenêtre revient, le champ perd le focus. */
async function keyboard(page: Page, open: boolean, height: number, field?: string): Promise<void> {
  if (open) {
    if (field !== undefined) await page.locator(field).first().focus()
    await page.setViewportSize({ width: 411, height: Math.round(height * WITH_KEYBOARD) })
  } else {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.setViewportSize({ width: 411, height })
  }
}

/** Le dossier des captures du test en cours : la taille du téléphone, pas celle de la fenêtre que le clavier rétrécit. */
let shotFolder = ''
const shot = async (page: Page, name: string): Promise<void> => {
  const dir = process.env.CARD_SHOTS
  if (dir === undefined || dir === '') return
  const folder = join(dir, shotFolder)
  mkdirSync(folder, { recursive: true })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(folder, `${name}.png`) })
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport })

    test('le choix du magasin : ni le champ, ni la ville proposée, ni les trois premiers magasins ne sont recouverts, clavier ouvert ou fermé ; la carte se réduit toute seule', async ({
      page,
      agentCode,
    }) => {
      test.setTimeout(120_000)
      shotFolder = `${viewport.width}x${viewport.height}`
      await withMobile({ loginCode: true }, async (fake) => {
        const app = await openWithBridge(page, fake, agentCode, {
          path: '/',
          origin: fake.mobileOrigins.www,
          asApplication: true,
        })
        app.answerHello(PLAN(FARINE))
        const FIELDS = ['#postal', '#suggestion']
        const SHOPS = ['.card button']

        // (1) Le champ est à remplir : la carte pleine, sans rien recouvrir
        await expect(page.locator('.g-text')).toHaveText('Écris ton code postal dans la page.', {
          timeout: 15_000,
        })
        await page
          .getByRole('button', { name: 'Tout accepter' })
          .click({ timeout: 2_000 })
          .catch(() => undefined)
        await expectClear(page, FIELDS)
        await shot(page, '1-magasin-champ')

        // (2) La personne écrit son code postal, clavier ouvert : la carte se réduit (ou s'efface), le champ et la ville proposée restent libres
        await keyboard(page, true, viewport.height, '#postal')
        await page.locator('#postal').pressSequentially('69720')
        expect(await expectClear(page, FIELDS), 'réduite (ou effacée) pendant la saisie').not.toBe(
          'full',
        )
        await shot(page, '2-magasin-ville-clavier')
        // Le repère « Touche ici » désigne la ville et ne la recouvre pas
        const tag = page.locator('.tag')
        const suggestion = await page.locator('#suggestion').boundingBox()
        if ((await tag.count()) > 0 && (await tag.isVisible()) && suggestion !== null) {
          const tagBox = await tag.boundingBox()
          expect(tagBox !== null && overlaps(tagBox, suggestion)).toBe(false)
        }

        // (3) La ville est touchée, la liste des magasins s'ouvre ; le clavier reste ouvert (le champ garde le focus) : la carte ne couvre pas la flèche des magasins
        await page.locator('#suggestion').click()
        await keyboard(page, true, viewport.height, '#postal')
        await expect(page.locator('#pick')).toBeVisible()
        await expectClear(page, SHOPS)
        await shot(page, '3-magasin-liste-clavier')

        // (4) Le clavier se ferme : la liste est affichée, la carte se réduit à la barre (pleine, elle couvrirait les magasins), qui dit quoi toucher
        await keyboard(page, false, viewport.height)
        await expectClear(page, SHOPS)
        await expect(page.locator('.screen.guide.min .g-bar-text')).toHaveText(
          'Étape 1 sur 2 · Touche ton magasin',
        )
        await shot(page, '4-magasin-liste')
        // Elle se rouvre d'un toucher : la personne l'a demandé
        await page.locator('.g-bar').click()
        await expect(page.locator('.screen.guide:not(.min)')).toBeVisible()
        await shot(page, '5-magasin-carte-rouverte')
        await page.locator('.g-fold').click()

        // (5) Le magasin est touché : la page du magasin (menu fermé, puis ouvert)
        await page.locator('#pick').click()
        await expect(page).toHaveURL(new RegExp(`${MOBILE_PAGE_PATH}$`))
        await expect(page.locator('.g-text')).toHaveText('Ouvre le menu, en haut de la page.', {
          timeout: 15_000,
        })
        await expectClear(page, ['#menu'])
        await shot(page, '6-connexion-menu')
        await page.locator('#menu').click()
        await expect(page.locator('.g-text')).toHaveText('Touche « Connexion » dans le menu.')
        await expectClear(page, ['#login-link', '#signup-link'])
        await shot(page, '7-connexion-mot')
        await page.locator('#login-link').click()

        // (6) La page de connexion : e-mail, mot de passe, code : le champ où l'on écrit et le bouton de la page ne sont jamais couverts
        await expect(page).toHaveURL(/authentification\.aspx/)
        await expect(page.locator('.g-text')).toHaveText(
          'Écris ton adresse e-mail, puis touche « Continuer ».',
        )
        await expect(page.locator('.g-step').filter({ hasText: 'Étape 2 sur 2' })).toBeAttached()
        const FORM = [
          '#email',
          '#secret',
          '#continue',
          '#next',
          '.digit',
          '#validate',
          '#hcaptcha',
          '#hc-frame',
        ]
        await expectClear(page, FORM, 8)
        await shot(page, '8-connexion-formulaire')
        await keyboard(page, true, viewport.height, '#email')
        await expectClear(page, FORM, 8)
        await shot(page, '9-connexion-email-clavier')
        await keyboard(page, false, viewport.height)
        await page.locator('#continue').click()
        await expect(page.locator('.g-text')).toHaveText(
          'Écris ton mot de passe, coche « Je suis un humain », puis valide.',
        )
        await keyboard(page, true, viewport.height, '#secret')
        await expectClear(page, FORM, 8)
        await shot(page, '10-connexion-mot-de-passe-clavier')
        await keyboard(page, false, viewport.height)
        await expectClear(page, FORM, 8)
        await page.locator('#hcaptcha').check()
        // Le cadre de vérification s'ouvre en bas de la page (petit : il ne réduit pas la carte à lui seul, mais il ne doit JAMAIS être couvert : la carte, pleine, couvrirait le bas de l'écran)
        await expect(page.locator('#hc-frame')).toBeVisible()
        await expectClear(page, FORM, 8)
        await shot(page, '10b-connexion-defi')
        await page.locator('#next').click()
        await expect(page.locator('#step3')).toBeVisible()
        await expect(page.locator('.g-text')).toHaveText(
          'Leclerc t’a envoyé un code par e-mail. Tape-le dans la page.',
        )
        await expectClear(page, FORM, 8)
        await shot(page, '11-connexion-code')
        await keyboard(page, true, viewport.height, '.digit')
        await expectClear(page, FORM, 8)
        await shot(page, '12-connexion-code-clavier')
      })
    })
  })
}
