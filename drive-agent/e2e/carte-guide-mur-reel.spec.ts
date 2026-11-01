// Le mur de cookies RÉEL de Leclerc (DRV-759, recette de la 1.6.1 sur le téléphone de test, écran de 1080 × 2400, soit 411 × 914 pixels de page) : AUCUNE carte pendant plus de 20 s.
// Les éléments du mur, lus dans l'application (positions seulement) : le lien « Continuer sans accepter » en haut, un texte, « Paramétrer les cookies » et « Tout accepter » plus bas ;
// libre : de y 790 à 1540 et de 1800 à 2270 (en pixels de l'écran). Le mur est un dialogue FIXE plein écran dont la zone défilante est elle-même focalisable : lue comme « un
// contrôle du mur », elle couvrait tout l'écran et la carte n'avait plus aucune place (elle s'effaçait). La règle : la carte ne disparaît JAMAIS devant un mur.
// ATTENTION : le faux mur reprend la FORME mesurée (positions, dialogue fixe plein écran), pas le HTML réel du mur.
import { openWithBridge } from './support/agent'
import { expectClear } from './support/geometry'
import { expect, test } from './support/fixtures'
import { known, planOf, product } from './support/plans'
import { MOBILE_HOSTS, MOBILE_PLAN_STORE, startFakeLeclerc } from '../fake-leclerc/server'
import type { PlanLine } from '../protocol'

const PLAN = (...lines: PlanLine[]) => planOf(lines, { store: { ...MOBILE_PLAN_STORE } })
const FARINE = known('farine', 'Farine', [product(1000001, 2)])

/** Le mur : un dialogue fixe plein écran, sa zone défilante focalisable (plein écran aussi), le lien en haut, le texte, deux boutons ; tout est posé comme sur la mesure (pixels de page). */
const REAL_WALL = `(() => {
  const wall = document.createElement('div')
  wall.id = 'cookie-wall'
  wall.setAttribute('role', 'dialog')
  wall.setAttribute('aria-modal', 'true')
  wall.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:#fff')
  wall.innerHTML = '<div class="scroll" tabindex="0" style="position:absolute;inset:0;overflow:auto">'
    + '<a href="#" class="wall-btn" id="refuse" style="position:absolute;left:233px;top:233px;width:146px;height:22px">Continuer sans accepter</a>'
    + '<p style="position:absolute;left:32px;top:260px;width:348px;margin:0">Le Groupement d’Achats des Centres E.Leclerc et ses partenaires utilisent des cookies.</p>'
    + '<button type="button" class="wall-btn" style="position:absolute;left:32px;top:590px;width:348px;height:41px">Paramétrer les cookies</button>'
    + '<button type="button" class="wall-btn" style="position:absolute;left:32px;top:641px;width:348px;height:41px">Tout accepter</button>'
    + '</div>'
  wall.querySelector('#refuse').addEventListener('click', (event) => { event.preventDefault(); wall.remove() })
  document.body.appendChild(wall)
})()`

test.use({ viewport: { width: 411, height: 914 } })

test('DRV-759 : devant le mur réel (dialogue fixe plein écran) la carte ne disparaît jamais et ne couvre aucune réponse', async ({
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
    app.answerHello(PLAN(FARINE))
    await expect(page.locator('.g-text')).toBeAttached({ timeout: 15_000 })
    await page.evaluate(REAL_WALL)
    await expect(page.locator('.g-text')).toHaveText('D’abord, réponds aux cookies, dans la page.')
    // La carte est là (jamais effacée faute de place) et ne couvre aucune réponse
    await page.waitForTimeout(1200)
    await expect(page.locator('.screen.guide.away')).toHaveCount(0)
    await expect(page.locator('.screen.guide')).toBeVisible()
    await expectClear(page, ['.wall-btn'], 5)
  } finally {
    await fake.close()
  }
})
