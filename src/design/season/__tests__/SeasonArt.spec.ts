import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, eventually } from '@/__tests__/helpers'
import SeasonArt from '../SeasonArt.vue'
import SeasonCorner from '../SeasonCorner.vue'
import SeasonScene from '../SeasonScene.vue'
import SeasonEmpty from '../SeasonEmpty.vue'

// ADR 0012. Hors de ces tests, la suite tourne le 15 juin (src/__tests__/setup.ts) : une saison se fixe explicitement.

const HALLOWEEN = new Date(2026, 9, 20, 12)
const NOEL = new Date(2026, 11, 20, 12)
const GALETTE = new Date(2027, 0, 15, 12)
const VALENTIN = new Date(2027, 1, 12, 12)
const PAQUES = new Date(2027, 2, 20, 12)
const ETE = new Date(2027, 6, 15, 12)
const AUTOMNE = new Date(2027, 8, 20, 12)

async function render(
  component: typeof SeasonArt | typeof SeasonCorner | typeof SeasonScene | typeof SeasonEmpty,
  props: Record<string, unknown> = {},
  slots: Record<string, string> = {},
) {
  const { plugins } = appContext()
  const wrapper = mount(component, { props: props as never, slots, global: { plugins } })
  await flushPromises()

  return wrapper
}

/** Les fichiers se chargent à la demande (import dynamique) : on attend que la pièce soit là. */
async function rendered(...args: Parameters<typeof render>) {
  const wrapper = await render(...args)
  await eventually(() => expect(wrapper.find('svg').exists()).toBe(true))

  return wrapper
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-season')
})

describe('SeasonArt', () => {
  it('hors saison : ne rend rien', async () => {
    const wrapper = await render(SeasonArt, { name: 'empty-list' })

    expect(wrapper.html()).toBe('')
  })

  it('en saison d’Halloween : rend le SVG de la pièce de l’emplacement', async () => {
    vi.setSystemTime(HALLOWEEN)

    const wrapper = await rendered(SeasonArt, { name: 'empty-list' })

    expect(wrapper.html()).toContain('viewBox="0 0 280 220"')
  })

  it('en saison de Noël : la pièce est celle de Noël, aucune vue ne connaît la saison', async () => {
    vi.setSystemTime(NOEL)

    const christmas = await rendered(SeasonArt, { name: 'empty-list' })
    const noel = christmas.html()
    vi.setSystemTime(HALLOWEEN)
    localStorage.clear()
    const other = await rendered(SeasonArt, { name: 'empty-list' })

    expect(noel).not.toBe('')
    expect(noel).not.toBe(other.html())
  })

  it('en saison de la galette : la pièce est celle de la galette', async () => {
    vi.setSystemTime(GALETTE)
    const galette = (await rendered(SeasonArt, { name: 'empty-list' })).html()
    vi.setSystemTime(HALLOWEEN)
    localStorage.clear()
    const other = (await rendered(SeasonArt, { name: 'empty-list' })).html()

    expect(galette).toContain('viewBox="0 0 120 120"')
    expect(galette).not.toBe(other)
  })

  it('en saison de la Saint-Valentin : la pièce est celle de la Saint-Valentin', async () => {
    vi.setSystemTime(VALENTIN)
    const valentin = (await rendered(SeasonArt, { name: 'empty-list' })).html()
    vi.setSystemTime(HALLOWEEN)
    localStorage.clear()
    const other = (await rendered(SeasonArt, { name: 'empty-list' })).html()

    expect(valentin).toContain('viewBox="0 0 120 120"')
    expect(valentin).not.toBe(other)
  })

  it.each([
    ['de l’été', ETE],
    ['de l’automne', AUTOMNE],
  ] as const)('en saison %s : la pièce est celle de la saison', async (_, date) => {
    vi.setSystemTime(date)
    const piece = (await rendered(SeasonArt, { name: 'empty-list' })).html()
    vi.setSystemTime(HALLOWEEN)
    localStorage.clear()
    const other = (await rendered(SeasonArt, { name: 'empty-list' })).html()

    expect(piece).toContain('viewBox="0 0 120 120"')
    expect(piece).not.toBe(other)
  })

  it('en saison de Pâques : la pièce est celle de Pâques', async () => {
    vi.setSystemTime(PAQUES)
    const easter = (await rendered(SeasonArt, { name: 'empty-list' })).html()
    vi.setSystemTime(HALLOWEEN)
    localStorage.clear()
    const other = (await rendered(SeasonArt, { name: 'empty-list' })).html()

    expect(easter).toContain('viewBox="0 0 120 120"')
    expect(easter).not.toBe(other)
  })

  it('décorative : cachée des lecteurs d’écran, non focalisable, sans événement de souris, sans titre', async () => {
    vi.setSystemTime(HALLOWEEN)

    const wrapper = await rendered(SeasonArt, { name: 'empty-search' })

    const root = wrapper.get('span')
    expect(root.attributes('aria-hidden')).toBe('true')
    expect(root.classes()).toContain('pointer-events-none')
    const svg = wrapper.get('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('focusable')).toBe('false')
    expect(wrapper.find('title').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('saison coupée par l’utilisateur : ne rend rien, même en octobre', async () => {
    vi.setSystemTime(HALLOWEEN)
    localStorage.setItem('repas.season', 'halloween')

    const wrapper = await render(SeasonArt, { name: 'empty-list' })

    expect(wrapper.html()).toBe('')
  })

  it('emplacement inconnu : ne rend rien', async () => {
    vi.setSystemTime(HALLOWEEN)

    const wrapper = await render(SeasonArt, { name: 'nimporte-quoi' })

    expect(wrapper.html()).toBe('')
  })

  it('suit l’interrupteur : couper le décor retire la pièce', async () => {
    vi.setSystemTime(HALLOWEEN)
    const wrapper = await rendered(SeasonArt, { name: 'title-list' })

    const { useSeasonStore } = await import('../../season')
    useSeasonStore().enabled = false
    await flushPromises()

    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('ne confond pas une saison et l’autre quand la saison change', async () => {
    vi.setSystemTime(HALLOWEEN)
    const wrapper = await rendered(SeasonArt, { name: 'hero' })
    const before = wrapper.html()

    vi.setSystemTime(NOEL)
    const { useSeasonStore } = await import('../../season')
    useSeasonStore().refresh()
    await eventually(() => expect(wrapper.html()).not.toBe(before))
    expect(wrapper.find('svg').exists()).toBe(true)
  })
})

describe('SeasonCorner et SeasonScene', () => {
  it('absents hors saison', async () => {
    expect((await render(SeasonCorner)).html()).toBe('<!--v-if-->')
    expect((await render(SeasonScene)).html()).toBe('<!--v-if-->')
  })

  it('absents quand la saison est coupée', async () => {
    vi.setSystemTime(NOEL)
    localStorage.setItem('repas.season', 'noel')

    expect((await render(SeasonCorner)).html()).toBe('<!--v-if-->')
    expect((await render(SeasonScene)).html()).toBe('<!--v-if-->')
  })

  for (const [label, date] of [
    ['la galette', GALETTE],
    ['la Saint-Valentin', VALENTIN],
    ['Pâques', PAQUES],
    ['l’été', ETE],
    ['l’automne', AUTOMNE],
    ['Halloween', HALLOWEEN],
    ['Noël', NOEL],
  ] as const) {
    it(`${label} : le coin est un calque fixe, haut droit, sans événement, caché des lecteurs d’écran`, async () => {
      vi.setSystemTime(date)

      const wrapper = await rendered(SeasonCorner)

      const corner = wrapper.get('[data-testid="season-corner"]')
      expect(corner.classes()).toEqual(
        expect.arrayContaining(['pointer-events-none', 'fixed', 'right-0']),
      )
      expect(corner.attributes('aria-hidden')).toBe('true')
      expect(corner.classes()).toContain('top-[env(safe-area-inset-top)]')
      expect(corner.find('svg').exists()).toBe(true)
      expect(corner.text()).toBe('')
    })

    it(`${label} : la scène est un calque fixe derrière tout, sans événement, d’opacité réglée par jeton`, async () => {
      vi.setSystemTime(date)

      const wrapper = await rendered(SeasonScene)

      const scene = wrapper.get('[data-testid="season-scene"]')
      expect(scene.classes()).toEqual(
        expect.arrayContaining(['pointer-events-none', 'fixed', '-z-10']),
      )
      expect(scene.attributes('aria-hidden')).toBe('true')
      expect(scene.attributes('style')).toContain('var(--scene-opacity)')
      expect(scene.find('svg').exists()).toBe(true)
    })
  }
})

describe('SeasonEmpty', () => {
  it('hors saison : seulement la phrase', async () => {
    const wrapper = await render(
      SeasonEmpty,
      { name: 'empty-list' },
      { default: '<p>Rien ici.</p>' },
    )

    expect(wrapper.findAll('svg')).toHaveLength(0)
    expect(wrapper.text()).toBe('Rien ici.')
  })

  it('en saison : l’illustration est au-dessus de la phrase', async () => {
    vi.setSystemTime(HALLOWEEN)
    const wrapper = await rendered(
      SeasonEmpty,
      { name: 'empty-recipes' },
      { default: '<p>Rien ici.</p>' },
    )

    expect(wrapper.findAll('svg')).toHaveLength(1)
    expect(wrapper.element.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
    expect(wrapper.element.lastElementChild?.textContent).toBe('Rien ici.')
  })
})
