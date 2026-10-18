import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import { appContext } from '@/__tests__/helpers'
import DrivePlaceholderView from '../DrivePlaceholderView.vue'

afterEach(() => (document.body.innerHTML = ''))

describe('page d’aide du drive à venir', () => {
  it('l’aide d’installation a sa route', async () => {
    const context = appContext()
    await context.router.push('/drive/aide')
    const wrapper = mount(DrivePlaceholderView, {
      props: { topic: 'help' },
      global: { plugins: context.plugins },
    })

    expect(wrapper.find('h1').text()).toBe('Installer l’application')
  })
})
