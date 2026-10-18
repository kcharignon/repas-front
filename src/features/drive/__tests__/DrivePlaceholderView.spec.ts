import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import { appContext } from '@/__tests__/helpers'
import DrivePlaceholderView from '../DrivePlaceholderView.vue'

afterEach(() => (document.body.innerHTML = ''))

async function open(path: string, topic: 'settings' | 'help') {
  const context = appContext()
  await context.router.push(path)

  return mount(DrivePlaceholderView, { props: { topic }, global: { plugins: context.plugins } })
}

describe('pages du drive à venir', () => {
  it('les réglages disent d’abord de choisir un magasin quand l’envoi y mène', async () => {
    const wrapper = await open('/drive/reglages?magasin=requis', 'settings')

    expect(wrapper.find('h1').text()).toBe('Réglages du drive')
    expect(wrapper.find('[role="status"]').text()).toBe(
      'Choisissez d’abord votre magasin pour envoyer une liste au drive.',
    )
  })

  it('les réglages ouverts directement n’ont pas ce message', async () => {
    const wrapper = await open('/drive/reglages', 'settings')

    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('l’aide d’installation a sa route', async () => {
    const wrapper = await open('/drive/aide', 'help')

    expect(wrapper.find('h1').text()).toBe('Installer l’application')
  })
})
