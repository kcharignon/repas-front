// Le mur de cookies en couche supérieure (DRV-760, relecture de la PR #308) : un `<dialog>` ouvert par `showModal()` passe au-dessus de TOUT, quel que soit le z-index de l'agent ; l'agent
// avait décidé de montrer sa carte (`card: true`) mais la personne ne la voyait pas, et le bandeau de repli de l'application ne se posait jamais. Preuve avec un vrai navigateur : la
// carte n'est comptée « à l'écran » que si le toucher à son centre tombe sur l'agent. Même chose pour un document dont un bloc conteneur (`transform`) décale ce qui est `fixed` hors de la fenêtre.
// ATTENTION : le faux mur reprend la FORME (une boîte modale en couche supérieure), pas le HTML réel du mur de l'enseigne.
import { openWithBridge } from './support/agent'
import { expect, test } from './support/fixtures'
import { known, planOf, product } from './support/plans'
import { MOBILE_HOSTS, MOBILE_PLAN_STORE, startFakeLeclerc } from '../fake-leclerc/server'
import type { PlanLine } from '../protocol'

const PLAN = (...lines: PlanLine[]) => planOf(lines, { store: { ...MOBILE_PLAN_STORE } })
const FARINE = known('farine', 'Farine', [product(1000001, 2)])

const MODAL_WALL = `(() => {
  const dialog = document.createElement('dialog')
  dialog.id = 'cookie-wall'
  dialog.setAttribute('style', 'position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;border:0;padding:16px;background:#fff')
  dialog.innerHTML = '<p>Nous utilisons des cookies.</p><button type="button" id="accept" style="position:absolute;left:32px;top:300px;width:300px;height:40px">Tout accepter</button>'
  dialog.querySelector('#accept').addEventListener('click', () => dialog.close())
  document.body.appendChild(dialog)
  dialog.showModal()
})()`

const cards = (messages: { type: string; card?: boolean }[]): boolean[] =>
  messages.filter((m) => m.type === 'log' && typeof m.card === 'boolean').map((m) => m.card!)

test.use({ viewport: { width: 411, height: 914 } })

test('DRV-760 : un mur en couche supérieure recouvre la carte : l’agent dit « aucun écran » (card false), puis « un écran » dès que le mur part', async ({
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
    await page.evaluate(MODAL_WALL)
    app.answerHello(PLAN(FARINE))

    await expect(page.locator('.screen.guide')).toBeAttached({ timeout: 15_000 })
    await page.waitForTimeout(1500)
    // La carte existe pour l'agent, mais le toucher à son centre tombe sur le mur : la personne ne la voit pas
    const box = await page.locator('.screen.guide').boundingBox()
    const covered = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, {
      x: box!.x + box!.width / 2,
      y: box!.y + box!.height / 2,
    })
    expect(covered).toBe('cookie-wall')
    expect(cards(app.messages as never)).toEqual([false])

    // Le diagnostic de l'application le dit en formes : la prochaine recette saura que c'est un mur en couche supérieure
    await app.send({ v: 1, type: 'command', command: 'diagnostic' })
    await expect
      .poll(
        () =>
          app.messages
            .filter((m) => m.type === 'log' && Array.isArray(m.lines))
            .flatMap((m) => m.lines as string[])
            .find((line) => line.startsWith('Carte : ')),
        { timeout: 5000 },
      )
      .toMatch(
        /^Carte : dernière étape du flux [A-Z_]+, écran guide, dite à l’écran non, boîte \d+\/\d+\/\d+\/\d+, toucher au centre sur autre chose, conteneur dernier du document oui, déplacements \d+, élément actif \w+$/,
      )

    // La personne accepte : le mur part, la carte se voit, l'agent le dit
    await page.locator('#accept').click()
    await expect.poll(() => cards(app.messages as never), { timeout: 5000 }).toEqual([false, true])
  } finally {
    await fake.close()
  }
})

test('DRV-760 : un document dont un bloc conteneur décale ce qui est fixe hors de la fenêtre : la carte n’est pas à l’écran (card false)', async ({
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
    // `transform` sur <html> : il devient le bloc conteneur de tout ce qui est `fixed`, décalé ici de deux fenêtres
    await page.evaluate(() => {
      document.documentElement.style.transform = 'translateY(2000px)'
    })
    app.answerHello(PLAN(FARINE))

    await expect(page.locator('.screen.guide')).toBeAttached({ timeout: 15_000 })
    await page.waitForTimeout(1500)
    expect(cards(app.messages as never)).toEqual([false])
    await page.evaluate(() => {
      document.documentElement.style.transform = ''
    })
    await expect.poll(() => cards(app.messages as never), { timeout: 5000 }).toEqual([false, true])
  } finally {
    await fake.close()
  }
})

test('DRV-760 : sans mur ni décalage, la carte est à l’écran : un seul card true, jamais de card false', async ({
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
    await expect(page.locator('.screen.guide')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1500)
    expect(cards(app.messages as never)).toEqual([true])
  } finally {
    await fake.close()
  }
})
