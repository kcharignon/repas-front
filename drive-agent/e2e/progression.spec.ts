// L'écran « Ton panier se remplit » pendant un vrai remplissage (DRV-744) : le repère d'enseigne, la carte d'avancement, l'article en cours et la
// liste des articles traités avec leur icône et leur état, sur un téléphone (Pixel 7). Le faux site tarde un peu pour que l'écran reste affiché.
import { openWithFragment } from './support/agent'
import { expect, test } from './support/fixtures'
import { home, known, planOf, product, skip } from './support/plans'

const plan = () =>
  planOf([
    known('farine', 'Farine', [product(1000001, 3)]),
    home('sel', 'Sel'),
    skip('sucre', 'Sucre'),
    known('beurre', 'Beurre', [product(1000006, 1)]),
  ])

test('pendant le remplissage : repère d’enseigne, avancement, article en cours et articles traités', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given : un site un peu lent, pour que l'écran de progression reste affiché
  fake.setBehavior({ latencyMs: 1200 })

  // When
  await openWithFragment(page, fake, agentCode, plan())

  // Then : le repère d'enseigne (le nom vient de la table de l'enseigne), le titre et la barre
  await expect(page.getByRole('heading', { name: 'Ton panier se remplit' })).toBeVisible()
  await expect(page.getByText('Panier Leclerc', { exact: true })).toBeVisible()
  const bar = page.getByRole('progressbar', { name: 'Avancement' })
  await expect(bar).toHaveAttribute('aria-valuemin', '0')
  await expect(bar).toHaveAttribute('aria-valuemax', '4')
  // And : l'article en cours a sa carte
  await expect(page.getByText('En ce moment')).toBeVisible()
  // And : chaque article traité est une ligne dont le nom accessible est la phrase complète, avec son état en petit
  const farine = page.getByRole('listitem', { name: 'Farine : ajouté' })
  await expect(farine).toBeVisible()
  await expect(farine.getByText('ajouté', { exact: true })).toBeVisible()
  const sel = page.getByRole('listitem', { name: 'Sel : j’en ai toujours' })
  await expect(sel).toBeVisible()
  await expect(sel.getByText('j’en ai toujours', { exact: true })).toBeVisible()
  await expect(page.getByRole('listitem', { name: 'Sucre : pas cette fois' })).toBeVisible()
  // And : la barre dit où elle en est
  await expect(bar).toHaveAttribute('aria-valuenow', /^[3-4]$/)
  await expect(page.getByText('Garde l’application ouverte.')).toBeVisible()
})

test('à 360 × 640 : « Arrêter » se touche (52 px), rien ne déborde sur le côté, la palette est sombre', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given
  fake.setBehavior({ latencyMs: 5000 })
  await page.setViewportSize({ width: 360, height: 640 })

  // When
  await openWithFragment(page, fake, agentCode, plan())
  await expect(page.getByRole('heading', { name: 'Ton panier se remplit' })).toBeVisible()

  // Then
  const seen = await page.evaluate(() => {
    const root = (document.documentElement.lastElementChild as HTMLElement).shadowRoot as ShadowRoot
    const overlay = root.querySelector('.overlay') as HTMLElement
    const dp = window.visualViewport?.scale ?? 1
    const stop = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Arrêter')
    const box = stop?.getBoundingClientRect()
    return {
      overflow: overlay.scrollWidth - overlay.clientWidth,
      stopHeightDp: (box?.height ?? 0) * dp,
      stopBottom: (box?.bottom ?? 0) * dp,
      screenHeight: screen.height,
      background: getComputedStyle(overlay).backgroundColor,
    }
  })
  expect(seen.overflow).toBe(0)
  expect(seen.stopHeightDp).toBeGreaterThanOrEqual(44)
  expect(seen.stopBottom).toBeLessThanOrEqual(seen.screenHeight)
  // la palette sombre de l'écran, quel que soit le thème du téléphone (#0f1713)
  expect(seen.background).toBe('rgb(15, 23, 19)')
})

test('en mouvement réduit : l’indicateur est un point fixe, sans animation', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given
  fake.setBehavior({ latencyMs: 5000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })

  // When
  await openWithFragment(page, fake, agentCode, plan())
  await expect(page.getByText('En ce moment')).toBeVisible()

  // Then
  const spin = await page.evaluate(() => {
    const root = (document.documentElement.lastElementChild as HTMLElement).shadowRoot as ShadowRoot
    const style = getComputedStyle(root.querySelector('.spin') as Element)
    return { animation: style.animationName, border: style.borderTopWidth }
  })
  expect(spin).toEqual({ animation: 'none', border: '0px' })
})

test('avec le mouvement normal : l’indicateur tourne', async ({ page, fake, agentCode }) => {
  // Given
  fake.setBehavior({ latencyMs: 5000 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  // When
  await openWithFragment(page, fake, agentCode, plan())
  await expect(page.getByText('En ce moment')).toBeVisible()

  // Then
  const animation = await page.evaluate(() => {
    const root = (document.documentElement.lastElementChild as HTMLElement).shadowRoot as ShadowRoot
    return getComputedStyle(root.querySelector('.spin') as Element).animationName
  })
  expect(animation).toBe('spin')
})

test('« Arrêter » garde sa place et dit qu’il s’arrête après l’article en cours', async ({
  page,
  fake,
  agentCode,
}) => {
  // Given
  fake.setBehavior({ latencyMs: 1500 })
  await openWithFragment(page, fake, agentCode, plan())

  // When
  await page.getByRole('button', { name: 'Arrêter' }).click()

  // Then
  await expect(
    page.getByRole('button', { name: 'J’arrête après l’article en cours…' }),
  ).toBeDisabled()
})
