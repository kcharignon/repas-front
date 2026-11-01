// La preuve par la géométrie de la carte du guide (DRV-757), commune aux essais de Leclerc et d'Auchan : où est la carte (pleine, barre, effacée) et ce qu'elle ne doit jamais couvrir.
// Deux preuves à chaque fois : les boîtes ne se recouvrent pas, ET le point central de chaque contrôle est bien celui du contrôle (`elementFromPoint` : ce qu'un doigt toucherait, pas
// seulement une boîte ; un contrôle que la PAGE recouvre elle-même, un mur par exemple, n'est pas l'affaire de la carte : seul un conteneur de l'agent, qui a un shadow root ouvert en test, compte). Elle ne rend JAMAIS sans avoir vérifié quelque chose, même quand la carte s'est effacée faute de place (alors seul le second contrôle est non vide).
import { expect, type Page } from '@playwright/test'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/** La carte du guide telle que la personne la voit : pleine ou barre ; `null` quand elle s'est effacée faute de place. */
export const cardBox = (page: Page): Promise<Box | null> =>
  page.locator('.screen.guide').boundingBox()

/** Les contrôles que `selectors` désignent (les `limit` premiers de chaque), avec ce qu'un doigt toucherait au milieu de chacun. */
async function controls(
  page: Page,
  selectors: readonly string[],
  limit: number,
): Promise<{ name: string; box: Box; touched: boolean }[]> {
  return page.evaluate(
    ({ selectors: list, limit: max }) => {
      const found: { name: string; box: Box; touched: boolean }[] = []
      for (const selector of list) {
        const all = [...document.querySelectorAll(selector)].slice(0, max)
        for (const [index, element] of all.entries()) {
          const rect = element.getBoundingClientRect()
          if (!(rect.width > 0 && rect.height > 0)) continue
          const x = rect.left + rect.width / 2
          const y = rect.top + rect.height / 2
          // Hors de la fenêtre (une liste plus longue que l'écran) : rien ne la couvre, rien à toucher maintenant
          if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue
          const hit = document.elementFromPoint(x, y)
          found.push({
            name: `${selector}[${index}]`,
            box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            touched:
              hit !== null &&
              (element.contains(hit) || hit.contains(element) || hit.shadowRoot === null),
          })
        }
      }
      const active = document.activeElement
      if (active instanceof HTMLInputElement && active.getClientRects().length > 0) {
        const rect = active.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        const hit = document.elementFromPoint(x, y)
        // Défilé hors de la fenêtre par la page (le repère amène la liste à l'écran) : plus rien à toucher
        const inside = x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight
        if (inside) {
          found.push({
            name: 'champ en cours de saisie',
            box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            touched:
              hit !== null &&
              (active.contains(hit) || hit.contains(active) || hit.shadowRoot === null),
          })
        }
      }
      return found
    },
    { selectors, limit },
  )
}

/**
 * Laisse la carte se replacer (relue toutes les 500 ms), puis vérifie qu'elle ne recouvre rien de ce qui doit rester libre. Rend la forme de la carte : `full`, `bar` ou `away`
 * (effacée). Échoue quand rien n'est à protéger : un test qui ne prouve rien ne passe pas.
 */
export async function expectClear(
  page: Page,
  selectors: readonly string[],
  limit = 3,
): Promise<'full' | 'bar' | 'away'> {
  await page.waitForTimeout(900)
  // Le contrôle « un doigt tomberait sur le contrôle » compte tout hôte à shadow root FERMÉ comme la page ; il ne vaut que si les hôtes de l'agent sont ouverts (`OPEN_SHADOW`) : sans cela il deviendrait vrai sans bruit
  const open = await page.evaluate(() =>
    [...document.documentElement.children].some((host) => host.shadowRoot !== null),
  )
  expect(
    open,
    'aucun hôte de l’agent n’a de shadow root ouvert : la preuve du toucher ne vaudrait rien',
  ).toBe(true)
  const card = await cardBox(page)
  const must = await controls(page, selectors, limit)
  expect(must.length, 'rien à protéger à l’écran : le test ne prouverait rien').toBeGreaterThan(0)
  for (const { name, box, touched } of must) {
    expect(touched, `${name} : au milieu, un doigt ne toucherait pas le contrôle`).toBe(true)
    if (card !== null) {
      expect(
        overlaps(card, box),
        `${name} est recouvert par la carte (${JSON.stringify(card)})`,
      ).toBe(false)
    }
  }
  if (card === null) return 'away'
  return (await page.locator('.screen.guide.min').count()) === 1 ? 'bar' : 'full'
}
