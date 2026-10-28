import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'

import UiTextInput from '@/design/UiTextInput.vue'

/** Un champ branché sur un modèle, comme dans un formulaire : le texte du modèle est ce que le formulaire enverrait. */
function field(capitalizeFirst: boolean, initial = '') {
  const value = ref<string | number>(initial)
  const Host = defineComponent({
    components: { UiTextInput },
    setup: () => ({ value, capitalizeFirst }),
    template: '<UiTextInput v-model="value" :capitalize-first="capitalizeFirst" />',
  })
  const wrapper = mount(Host, { attachTo: document.body })
  const input = wrapper.get('input')
  const element = input.element as HTMLInputElement

  /** Frappe ou collage : le navigateur a déjà posé le texte et le curseur quand `input` part. */
  async function type(text: string, caret = text.length) {
    element.value = text
    element.setSelectionRange(caret, caret)
    await input.trigger('input')
  }

  return { wrapper, input, element, value, type }
}

describe('UiTextInput, capitalizeFirst', () => {
  it('met la première lettre tapée en majuscule, dans le champ et dans le modèle', async () => {
    const { element, value, type, wrapper } = field(true)

    await type('p')
    expect(element.value).toBe('P')
    expect(value.value).toBe('P')
    await type('Pâtes')
    await type('Pâtes carbonara')

    expect(element.value).toBe('Pâtes carbonara')
    expect(value.value).toBe('Pâtes carbonara')
    wrapper.unmount()
  })

  it('garde le curseur où il était', async () => {
    const { element, value, type, wrapper } = field(true)

    await type('pates', 1)
    expect(element.value).toBe('Pates')
    expect([element.selectionStart, element.selectionEnd]).toEqual([1, 1])

    // Une lettre insérée en tête d'un texte existant : le curseur reste juste après elle
    await type('éclair', 1)
    expect(element.value).toBe('Éclair')
    expect(element.selectionStart).toBe(1)
    expect(value.value).toBe('Éclair')
    wrapper.unmount()
  })

  it('met en majuscule un texte collé', async () => {
    const { element, value, type, wrapper } = field(true)

    await type('de la farine')

    expect(element.value).toBe('De la farine')
    expect(value.value).toBe('De la farine')
    wrapper.unmount()
  })

  it('efface puis retape sans garder la majuscule oubliée', async () => {
    const { element, value, type, wrapper } = field(true)

    await type('Pâtes')
    await type('')
    expect(value.value).toBe('')
    await type('œufs')

    expect(element.value).toBe('Œufs')
    expect(value.value).toBe('Œufs')
    wrapper.unmount()
  })

  it('ne touche pas au texte pendant une composition et le corrige à sa fin', async () => {
    const { element, value, input, wrapper } = field(true)

    await input.trigger('compositionstart')
    element.value = 'pât'
    element.setSelectionRange(3, 3)
    await input.trigger('input', { isComposing: true })
    expect(element.value).toBe('pât')

    element.value = 'pâtes'
    await input.trigger('compositionend')

    expect(element.value).toBe('Pâtes')
    expect(value.value).toBe('Pâtes')
    wrapper.unmount()
  })

  it('corrige aussi à la sortie du champ', async () => {
    const { element, value, input, wrapper } = field(true)

    // Valeur posée sans événement `input` (remplissage automatique du navigateur)
    element.value = 'tarte aux pommes'
    await input.trigger('blur')

    expect(element.value).toBe('Tarte aux pommes')
    expect(value.value).toBe('Tarte aux pommes')
    wrapper.unmount()
  })

  it('demande la majuscule au clavier du téléphone', () => {
    const { element, wrapper } = field(true)

    expect(element.getAttribute('autocapitalize')).toBe('sentences')
    wrapper.unmount()
  })

  it("ne modifie PAS un champ qui n'est pas un nom (recherche, par exemple)", async () => {
    const { element, value, type, input, wrapper } = field(false)

    await type('pâtes')
    await input.trigger('blur')

    expect(element.value).toBe('pâtes')
    expect(value.value).toBe('pâtes')
    expect(element.hasAttribute('autocapitalize')).toBe(false)
    wrapper.unmount()
  })
})
