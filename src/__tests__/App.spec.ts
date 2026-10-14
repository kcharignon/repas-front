import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import App from '@/App.vue'
import { i18n } from '@/i18n'
import router from '@/router'

describe('App', () => {
  it("affiche l'accueil à la racine", async () => {
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router, i18n] } })

    expect(wrapper.find('h1').text()).toBe('Repas')
  })
})
