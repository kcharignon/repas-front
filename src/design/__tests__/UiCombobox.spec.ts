import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

import UiCombobox from '@/design/UiCombobox.vue'
import type { ComboboxOption } from '@/design/UiCombobox.vue'

// Le choix d'un ingrédient : le repère du rayon devant le nom, le rayon sous le nom quand il faut distinguer deux noms identiques (ING-017).
const opened: VueWrapper[] = []
const open = async (options: ComboboxOption[], modelValue = '') => {
  const wrapper = mount(UiCombobox, {
    attachTo: document.body,
    props: { options, label: 'Ingrédient 1', empty: 'Aucun ingrédient ne correspond.', modelValue },
  })
  opened.push(wrapper)
  await wrapper.find('button').trigger('click')
  await new Promise((resolve) => setTimeout(resolve, 0))

  return wrapper
}
const items = () => [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]

describe('UiCombobox : le rayon dans les choix', () => {
  // jsdom ne dessine rien : Reka fait défiler l'option active dans la vue, et mesure le champ
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn<() => void>()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })
  afterEach(() => {
    for (const wrapper of opened.splice(0)) wrapper.unmount()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('pose le repère devant le nom et le rayon dessous, seulement quand l’option les porte', async () => {
    await open([
      { value: 'pois-surgele', label: 'Petits pois', icon: 'snowflake', hint: 'Surgelés' },
      { value: 'pois-frais', label: 'Petits pois', icon: null, hint: 'Fruits et légumes' },
      { value: 'mais', label: 'Maïs', icon: 'can' },
      { value: 'oignon', label: 'Oignon' },
    ])

    const [surgele, frais, mais, oignon] = items()
    expect(surgele?.querySelector('[data-department-marker="snowflake"]')).not.toBeNull()
    expect(surgele?.textContent).toContain('Surgelés')
    // Sans icône : rien, mais la place est gardée pour que les noms restent alignés
    expect(frais?.querySelector('[data-department-marker]')).toBeNull()
    expect(frais?.textContent).toContain('Fruits et légumes')
    expect(mais?.querySelector('[data-department-marker="can"]')).not.toBeNull()
    expect(mais?.textContent?.trim()).toBe('Maïs')
    expect(oignon?.querySelector('[data-department-marker]')).toBeNull()
    expect(oignon?.textContent?.trim()).toBe('Oignon')
  })

  it('n’ajoute ni repère ni place vide quand aucune option n’a d’icône (ancien back)', async () => {
    await open([
      { value: 'courgette', label: 'Courgette' },
      { value: 'lait', label: 'Lait' },
    ])

    expect(items().map((item) => item.textContent?.trim())).toEqual(['Courgette', 'Lait'])
    expect(document.body.querySelector('[data-department-marker]')).toBeNull()
    expect(document.body.querySelector('[role="option"] [aria-hidden="true"]')).toBeNull()
  })
})
