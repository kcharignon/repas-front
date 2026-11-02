// Le mur de cookies de Leclerc DEVANT le vrai accueil (DRV-760, recette de la 1.6.2) : toujours aucune carte pendant plus de 20 s dans l'application, l'agent présent. Structure RELEVÉE
// avec Chrome sur l'accueil (structure seulement) : HUIT panneaux `div.modal` en `position: fixed`, plein écran, `z-index: -1`, décalés à gauche de la largeur de la fenêtre (donc hors écran,
// à droite), chacun avec ses liens et boutons ; un `header` sticky de 52 px (`z-index: 21`) ; un `div` fixe plein écran vide (`z-index: 0`). Le mur de cookies (visible dans l'application
// seulement) : une boîte fixe plein écran, le lien « Continuer sans accepter » en haut, le texte au milieu, « Paramétrer les cookies » et « Tout accepter » en bas.
// ATTENTION : le faux mur reprend la FORME mesurée, pas le HTML réel du mur ; il est posé AVANT le plan (comme le vrai : il est là quand l'agent démarre).
import { openWithBridge } from './support/agent'
import { expectClear } from './support/geometry'
import { expect, test } from './support/fixtures'
import { known, planOf, product } from './support/plans'
import { MOBILE_HOSTS, MOBILE_PLAN_STORE, startFakeLeclerc } from '../fake-leclerc/server'
import type { PlanLine } from '../protocol'

const PLAN = (...lines: PlanLine[]) => planOf(lines, { store: { ...MOBILE_PLAN_STORE } })
const FARINE = known('farine', 'Farine', [product(1000001, 2)])

/** Les huit panneaux, le header sticky, le div fixe vide, puis le mur. Les pixels de page sont ceux de la fenêtre (411 × 914). */
const HOME_WITH_WALL = `(() => {
  const width = window.innerWidth
  const names = ['ChoixDrive', 'Recherche', 'Map', 'Connexion', 'MotDePasseOublie', 'VerificationIdentite', 'Magasin', 'Video']
  for (const name of names) {
    const modal = document.createElement('div')
    modal.id = 'divModal' + name
    modal.className = 'modal'
    modal.setAttribute('style', 'position:fixed;top:0;left:' + width + 'px;width:100%;height:100%;z-index:-1')
    modal.innerHTML = '<a href="#">Qu’est-ce que le compte unique</a><a href="#">Mot de passe oublié ?</a><button type="button">Continuer</button><button type="button">Valider</button><button type="button">Se connecter</button><a href="#">Créer mon compte</a><a href="#">Mentions légales</a>'
    document.body.appendChild(modal)
  }
  const header = document.createElement('header')
  header.className = 'header'
  header.setAttribute('style', 'position:sticky;top:0;z-index:21;height:52px;background:#eee')
  header.textContent = 'Drive'
  document.body.prepend(header)
  const empty = document.createElement('div')
  empty.setAttribute('style', 'position:fixed;inset:0;z-index:0')
  document.body.appendChild(empty)

  const wall = document.createElement('div')
  wall.id = 'cookie-wall'
  wall.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:#fff')
  wall.innerHTML = '<a href="#" class="wall-btn" id="refuse" style="position:absolute;left:233px;top:233px;width:146px;height:22px">Continuer sans accepter</a>'
    + '<p style="position:absolute;left:32px;top:260px;width:348px;margin:0">Le Groupement d’Achats des Centres E.Leclerc et ses partenaires utilisent des cookies.</p>'
    + '<button type="button" class="wall-btn" style="position:absolute;left:32px;top:590px;width:348px;height:41px">Paramétrer les cookies</button>'
    + '<button type="button" class="wall-btn" style="position:absolute;left:32px;top:641px;width:348px;height:41px">Tout accepter</button>'
  document.body.appendChild(wall)
})()`

test.use({ viewport: { width: 411, height: 914 } })

test('DRV-760 : devant le mur posé avant le plan, sur un accueil à huit panneaux hors écran, une barre est visible et ne couvre aucune réponse', async ({
  page,
  agentCode,
}) => {
  test.setTimeout(90_000)
  const fake = await startFakeLeclerc({ hosts: MOBILE_HOSTS })
  try {
    fake.setBehavior({ mobile: {} })
    const app = await openWithBridge(page, fake, agentCode, {
      path: '/',
      origin: fake.mobileOrigins.www,
      asApplication: true,
    })
    await page.evaluate(HOME_WITH_WALL)
    app.answerHello(PLAN(FARINE))

    await expect(page.locator('.screen.guide')).toBeAttached({ timeout: 15_000 })
    await page.waitForTimeout(1500)
    await expect(page.locator('.screen.guide.away')).toHaveCount(0)
    await expect(page.locator('.screen.guide')).toBeVisible()
    await expectClear(page, ['.wall-btn'], 5)
    // L'agent le dit à l'application (qui pose son bandeau de repli sinon) : un écran est à l'écran
    expect(
      app.messages.filter((message) => message.type === 'log' && message.card === true),
    ).toHaveLength(1)
    expect(app.messages.some((message) => message.type === 'log' && message.card === false)).toBe(
      false,
    )
  } finally {
    await fake.close()
  }
})
