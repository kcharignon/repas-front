import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'

import { i18n } from '@/i18n'
import UiSearchField from '@/design/UiSearchField.vue'

/** Un champ branché sur un modèle, comme dans une vue : le texte du modèle est ce que la recherche enverrait. */
function search(initial = '') {
  const value = ref(initial)
  const Host = defineComponent({
    components: { UiSearchField },
    setup: () => ({ value }),
    template: '<UiSearchField v-model="value" label="Rechercher une recette" :maxlength="100" />',
  })
  const wrapper = mount(Host, { attachTo: document.body, global: { plugins: [i18n] } })
  const input = wrapper.get('input')
  const element = input.element as HTMLInputElement
  const clear = () => wrapper.find('button[aria-label="Effacer la recherche"]')

  return { wrapper, input, element, value, clear }
}

describe('UiSearchField', () => {
  it('est un champ de recherche dont l’étiquette est lue par les lecteurs d’écran', () => {
    const { wrapper, element } = search()

    expect(element.type).toBe('search')
    expect(element.getAttribute('maxlength')).toBe('100')
    expect(wrapper.get('label').text()).toBe('Rechercher une recette')
  })

  it('ne propose d’effacer que lorsqu’il y a du texte', async () => {
    const { input, clear } = search()
    expect(clear().exists()).toBe(false)

    await input.setValue('tarte')
    expect(clear().exists()).toBe(true)

    await input.setValue('')
    expect(clear().exists()).toBe(false)
  })

  it('efface le texte et rend le focus au champ', async () => {
    const { input, element, value, clear } = search()
    await input.setValue('tarte')
    expect(value.value).toBe('tarte')
    ;(clear().element as HTMLElement).focus()
    expect(document.activeElement).toBe(clear().element)

    await clear().trigger('click')

    expect(value.value).toBe('')
    expect(element.value).toBe('')
    expect(document.activeElement).toBe(element)
    expect(clear().exists()).toBe(false)
  })

  it('garde le texte tel qu’il est tapé : une recherche n’est pas un nom, pas de majuscule forcée', async () => {
    const { input, element, value } = search()

    await input.setValue('pâtes carbonara')
    await input.trigger('blur')

    expect(value.value).toBe('pâtes carbonara')
    expect(element.value).toBe('pâtes carbonara')
    expect(element.getAttribute('autocapitalize')).toBeNull()
  })
})
