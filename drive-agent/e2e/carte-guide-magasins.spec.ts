// La liste des magasins de Leclerc (DRV-760, recette de la 1.6.2) : la barre se posait pile sur la première carte de magasin et le repère « Touche ici » était au-dessus des cartes, sur un
// autre contrôle. Les cartes sont des blocs larges cliquables (curseur main), pas des liens ; les puces de filtre (aux libellés pas ceux qu'on attendait) et « Afficher la carte »
// sont des boutons. La règle : la première carte est le contrôle à toucher (le repère la désigne) et la barre ne la couvre pas.
// ATTENTION : la structure reprend la FORME mesurée (positions des cartes), pas le HTML réel de la page.
import { openWithBridge } from './support/agent'
import { expectClear } from './support/geometry'
import { expect, test } from './support/fixtures'
import { known, planOf, product } from './support/plans'
import { MOBILE_HOSTS, MOBILE_PLAN_STORE, startFakeLeclerc } from '../fake-leclerc/server'
import type { PlanLine } from '../protocol'

const PLAN = (...lines: PlanLine[]) => planOf(lines, { store: { ...MOBILE_PLAN_STORE } })
const FARINE = known('farine', 'Farine', [product(1000001, 2)])

/** Le panneau : titre, deux puces étroites, cinq cartes (blocs larges à curseur main), « Afficher la carte » en bas. Pixels de page (411 × 914). */
const SHOPS_PANEL = `(() => {
  const panel = document.createElement('div')
  panel.id = 'shops-panel'
  panel.setAttribute('style', 'position:absolute;top:90px;left:0;right:0;z-index:5;background:#fff;padding-bottom:140px')
  let html = '<h2 style="margin:0;padding:8px 16px">Choisissez votre service autour du 69720</h2>'
    + '<div style="padding:8px 16px"><button type="button" style="width:150px;height:40px">Retrait en magasin</button> <button type="button" style="width:150px;height:40px">Livraison</button></div>'
  for (let n = 1; n <= 5; n += 1) {
    html += '<div id="shop-' + n + '" style="cursor:pointer;margin:8px 16px;height:90px;border:1px solid #888"><span>Magasin ' + n + '</span></div>'
  }
  html += '<button type="button" style="position:absolute;left:100px;bottom:20px;width:200px;height:40px">Afficher la carte</button>'
  panel.innerHTML = html
  document.body.appendChild(panel)
})()`

test.use({ viewport: { width: 411, height: 914 } })

test('DRV-760 : sur la liste des magasins, le repère désigne la première carte et la barre ne la couvre pas', async ({
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
    await expect(page.locator('.screen.guide')).toBeAttached({ timeout: 15_000 })
    await page.evaluate(SHOPS_PANEL)

    await expect(page.locator('.g-bar-text')).toHaveText('Étape 1 sur 2 · Touche ton magasin', {
      timeout: 15_000,
    })
    await page.waitForTimeout(1500)

    await expectClear(page, ['#shop-1'], 5)
    const card = await page.locator('#shop-1').boundingBox()
    const tag = await page.getByText('Touche ici').boundingBox()
    expect(card).not.toBeNull()
    expect(tag).not.toBeNull()
    // Le cadre entoure la première carte (à quelques pixels près), pas une puce de filtre
    const ring = await page.locator('.ring').boundingBox()
    expect(ring).not.toBeNull()
    expect(Math.abs((ring?.y ?? 0) - ((card?.y ?? 0) - 6))).toBeLessThan(12)
    expect(Math.abs((ring?.height ?? 0) - ((card?.height ?? 0) + 12))).toBeLessThan(12)
    // Et le repère est contre elle, au-dessus (les cartes suivantes ne sont pas couvertes) ou au-dessous
    const above = Math.abs((card?.y ?? 0) - ((tag?.y ?? 0) + (tag?.height ?? 0)))
    const below = Math.abs((tag?.y ?? 0) - ((card?.y ?? 0) + (card?.height ?? 0)))
    expect(Math.min(above, below)).toBeLessThan(60)
  } finally {
    await fake.close()
  }
})
