// L'affichage de l'interface de l'agent sur un site de bureau vu sur un téléphone : l'application Android montre le site Leclerc en mode ordinateur
// (fenêtre de ~980 px CSS affichée sur ~411 dp), où le texte et les boutons de l'interface étaient minuscules. Le faux site n'a pas de balise
// `viewport` (comme le site PC de l'enseigne), donc Chromium mobile (Pixel 7, écran de 412 dp) lui donne la même fenêtre : l'interface doit s'y
// agrandir pour avoir la taille qu'elle aurait sur une page de téléphone. Ce que l'on mesure est en dp, ce que l'on voit réellement.
import { openWithFragment } from './support/agent'
import { expect, test } from './support/fixtures'
import { fresh, home, known, planOf, product } from './support/plans'

/** Ce que l'on voit de l'interface, en dp : chaque pixel CSS fait `visualViewport.scale` dp (zoom de la fenêtre large compris). */
async function seen(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const root = (document.documentElement.lastElementChild as HTMLElement).shadowRoot as ShadowRoot
    const overlay = root.querySelector('.overlay') as HTMLElement
    const dp = window.visualViewport?.scale ?? 1
    const frame = overlay.getBoundingClientRect()
    return {
      pageWidth: window.innerWidth,
      screenWidth: screen.width,
      dpPerCssPixel: dp,
      frameWidth: frame.width * dp,
      frameRight: frame.right * dp,
      frameHeight: frame.height * dp,
      horizontalOverflow: overlay.scrollWidth - overlay.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      buttons: [...root.querySelectorAll('button, summary')].map((element) => {
        const box = element.getBoundingClientRect()
        return {
          label: element.textContent,
          heightDp: box.height * dp,
          rightDp: box.right * dp,
        }
      }),
      // La taille de police calculée est celle de la feuille de style (16 px) : le cadre agrandi la multiplie par son facteur.
      factor: frame.width / overlay.offsetWidth,
      fontDp:
        parseFloat(getComputedStyle(root.querySelector('p') as Element).fontSize) *
        (frame.width / overlay.offsetWidth) *
        dp,
    }
  })
}

test('par-dessus un site de bureau affiché sur un téléphone, l’interface est agrandie : texte lisible, cibles d’au moins 44 dp, rien ne déborde', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : un plan qui affiche le récapitulatif, sur une page du faux site sans balise viewport (fenêtre de bureau)
  const plan = planOf([known('farine', 'Farine', [product(1000001, 3)]), home('sel', 'Sel')])

  // When
  await openWithFragment(page, fake, agentCode, plan)
  await expect(page.getByRole('heading', { name: 'Prêt à remplir votre panier' })).toBeVisible()
  const view = await seen(page)

  // Then : la fenêtre est celle d'un ordinateur (980 px) sur un écran de téléphone, et l'interface compense
  expect(view.pageWidth).toBeGreaterThan(900)
  expect(view.screenWidth).toBeLessThan(500)
  expect(view.dpPerCssPixel).toBeLessThan(0.6)
  // And : le cadre de l'interface fait la largeur de l'écran, pas un pixel de plus (aucun défilement horizontal)
  expect(view.frameWidth).toBeCloseTo(view.screenWidth, -1)
  expect(view.frameRight).toBeLessThanOrEqual(view.screenWidth + 1)
  expect(view.horizontalOverflow).toBe(0)
  expect(view.pageOverflow).toBe(0)
  // And : le texte courant fait 16 dp, comme sur une page de téléphone (6,7 dp avant), et chaque cible tactile au moins 44 dp
  expect(view.fontDp).toBeGreaterThan(15)
  expect(view.fontDp).toBeLessThan(17)
  expect(view.buttons.length).toBeGreaterThan(2)
  for (const button of view.buttons) {
    expect(button.heightDp, `${button.label} : hauteur en dp`).toBeGreaterThanOrEqual(44)
    expect(button.rightDp, `${button.label} : tient dans l’écran`).toBeLessThanOrEqual(
      view.screenWidth + 1,
    )
  }
})

test('l’écran de choix de produit, le plus chargé, tient lui aussi dans l’écran, avec des cibles d’au moins 44 dp', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : un nouvel ingrédient, dont l'agent affiche lui-même la liste des produits trouvés
  const needed = { quantity: 80, unitSymbol: 'g', dimension: 'WEIGHT', baseFactor: 1 } as const
  const plan = planOf([fresh('poivre', 'Poivre', { needed })])

  // When
  await openWithFragment(page, fake, agentCode, plan)
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('button', { name: 'Choisir' }).first()).toBeVisible()
  const view = await seen(page)

  // Then
  expect(view.horizontalOverflow).toBe(0)
  expect(view.frameWidth).toBeCloseTo(view.screenWidth, -1)
  for (const button of view.buttons) {
    expect(button.heightDp, `${button.label} : hauteur en dp`).toBeGreaterThanOrEqual(44)
    expect(button.rightDp, `${button.label} : tient dans l’écran`).toBeLessThanOrEqual(
      view.screenWidth + 1,
    )
  }
})
