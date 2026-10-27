import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, reactive, ref } from 'vue'

import { appContext } from '@/__tests__/helpers'
import ConversionEquation from '../ConversionEquation.vue'
import type { EquationUnit, EquationValue } from '../equationMath'

const units: EquationUnit[] = [
  { slug: 'tasse', name: 'tasse', dimension: null, baseFactor: null },
  { slug: 'cuillere', name: 'cuillère à soupe', dimension: null, baseFactor: null },
  { slug: 'gramme', name: 'gramme', dimension: 'WEIGHT', baseFactor: 1 },
  { slug: 'kilo', name: 'kilo', dimension: 'WEIGHT', baseFactor: 1000 },
]

type Props = {
  ingredientName?: string
  submitted?: boolean
  startUnits?: EquationUnit[]
  endUnits?: EquationUnit[]
}

// Un parent qui garde la valeur, comme un écran : le composant s'édite lui-même par v-model
function mountEquation(initial: EquationValue, props: Props = {}) {
  const value = ref<EquationValue>(initial)
  const state = reactive<Props>({ ...props })
  const Host = defineComponent({
    components: { ConversionEquation },
    setup: () => ({ value, units, props: state }),
    template: '<ConversionEquation v-model="value" :units="units" v-bind="props" />',
  })
  const wrapper = mount(Host, {
    attachTo: document.body,
    global: { plugins: appContext().plugins },
  })

  return { wrapper, value, state }
}

const start = { start: 'tasse', end: 'kilo', left: '8', right: '1' }

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ConversionEquation', () => {
  it('lit l’équation en direct, ramenée à une unité de départ et redite dans l’autre sens', () => {
    const { wrapper } = mountEquation(start)

    expect(wrapper.find('[aria-live="polite"]').text()).toBe(
      '1 tasse = 0,125 kilo, et 1 kilo = 8 tasses.',
    )
  })

  it('met le nom de l’ingrédient devant la phrase, avec une majuscule', () => {
    const { wrapper } = mountEquation(start, { ingredientName: 'farine' })

    expect(wrapper.find('[aria-live="polite"]').text()).toBe(
      'Farine : 1 tasse = 0,125 kilo, et 1 kilo = 8 tasses.',
    )
  })

  it('suit chaque frappe : le nombre et l’unité changent la phrase', async () => {
    const { wrapper, value } = mountEquation({ ...start, left: '1', right: '' })
    expect(wrapper.find('[aria-live="polite"]').text()).toContain('Écris les deux nombres')

    await wrapper.find('input[aria-label="Quantité d\'arrivée"]').setValue('125')
    await wrapper.find('select[aria-label="Unité d\'arrivée"]').setValue('gramme')

    expect(value.value).toEqual({ start: 'tasse', end: 'gramme', left: '1', right: '125' })
    expect(wrapper.find('[aria-live="polite"]').text()).toBe(
      '1 tasse = 125 grammes, et 1 gramme = 0,008 tasse.',
    )
  })

  it('accorde les noms d’unités des listes avec les nombres écrits', async () => {
    const { wrapper } = mountEquation({ start: 'cuillere', end: 'kilo', left: '3', right: '1' })

    const options = (label: string) =>
      wrapper.findAll(`select[aria-label="${label}"] option`).map((option) => option.text())
    expect(options('Unité de départ')).toContain('cuillères à soupe')
    expect(options("Unité d'arrivée")).toContain('kilo')

    await wrapper.find('input[aria-label="Quantité de départ"]').setValue('1')
    expect(options('Unité de départ')).toContain('cuillère à soupe')
  })

  it('accepte une virgule', () => {
    const { wrapper } = mountEquation({ start: 'tasse', end: 'kilo', left: '1', right: '0,125' })

    expect(wrapper.find('[aria-live="polite"]').text()).toBe(
      '1 tasse = 0,125 kilo, et 1 kilo = 8 tasses.',
    )
  })

  it('inverse les deux côtés, nombres compris', async () => {
    const { wrapper, value } = mountEquation(start)

    await wrapper.find('button[type="button"]').trigger('click')

    expect(value.value).toEqual({ start: 'kilo', end: 'tasse', left: '1', right: '8' })
    expect(wrapper.find('[aria-live="polite"]').text()).toBe(
      '1 kilo = 8 tasses, et 1 tasse = 0,125 kilo.',
    )
  })

  it('dit tout de suite que deux unités identiques ne vont pas, sans phrase', () => {
    const { wrapper } = mountEquation({ ...start, end: 'tasse' })

    expect(wrapper.find('[aria-live="polite"]').text()).toBe('Choisis deux unités différentes.')
    expect(wrapper.find('select[aria-label="Unité d\'arrivée"]').attributes('aria-invalid')).toBe(
      'true',
    )
  })

  it('dit tout de suite qu’un nombre nul ou négatif ne va pas, et marque le champ', () => {
    const { wrapper } = mountEquation({ ...start, right: '-1' })

    expect(wrapper.find('[aria-live="polite"]').text()).toBe('Entre un nombre supérieur à zéro.')
    expect(wrapper.find('input[aria-label="Quantité d\'arrivée"]').attributes('aria-invalid')).toBe(
      'true',
    )
    expect(
      wrapper.find('input[aria-label="Quantité de départ"]').attributes('aria-invalid'),
    ).toBeUndefined()
  })

  it('ne réclame un nombre vide qu’une fois l’enregistrement tenté', async () => {
    const { wrapper, state } = mountEquation({ ...start, right: '' })
    expect(wrapper.find('[aria-live="polite"]').text()).not.toContain('Entre un nombre')

    state.submitted = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[aria-live="polite"]').text()).toBe('Entre un nombre supérieur à zéro.')
  })

  it('écrit l’unité au lieu de la faire choisir quand une seule est permise, et n’offre plus d’inverser', () => {
    const { wrapper } = mountEquation(
      { start: 'tasse', end: 'kilo', left: '1', right: '0,125' },
      { startUnits: [units[0] as EquationUnit], endUnits: [units[3] as EquationUnit] },
    )

    expect(wrapper.findAll('select')).toHaveLength(0)
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).toContain('tasse')
    expect(wrapper.text()).toContain('kilo')
  })

  it('a des champs nommés pour un lecteur d’écran, un groupe et une zone annoncée poliment', () => {
    const { wrapper } = mountEquation(start)

    expect(wrapper.find('[role="group"]').attributes('aria-label')).toBe('La conversion')
    for (const label of ['Quantité de départ', "Quantité d'arrivée"])
      expect(wrapper.find(`input[aria-label="${label}"]`).attributes('inputmode')).toBe('decimal')
    for (const label of ['Unité de départ', "Unité d'arrivée"])
      expect(wrapper.find(`select[aria-label="${label}"]`).exists()).toBe(true)
  })

  it('propose « Choisis une unité » tant qu’un côté n’en a pas, et le dit à l’enregistrement', () => {
    const { wrapper } = mountEquation(
      { start: 'tasse', end: '', left: '1', right: '125' },
      { submitted: true },
    )

    const select = wrapper.find('select[aria-label="Unité d\'arrivée"]')
    expect(select.find('option[value=""]').text()).toBe('Choisis une unité')
    expect(select.attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('[aria-live="polite"]').text()).toBe('Choisis les deux unités.')
    expect(
      wrapper.find('select[aria-label="Unité de départ"]').attributes('aria-invalid'),
    ).toBeUndefined()
  })

  it('n’affiche pas ce choix quand l’unité est déjà là', () => {
    const { wrapper } = mountEquation(start)

    expect(wrapper.find('option[value=""]').exists()).toBe(false)
  })
})
