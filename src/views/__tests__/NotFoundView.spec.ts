import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext } from '@/__tests__/helpers'
import NotFoundView from '@/views/NotFoundView.vue'

// La page d'une adresse inconnue : une page claire, qui ramène à l'application. La route est publique (`legacy.spec.ts`) ; l'arrivée d'un
// anonyme à la connexion est la garde de session (`guard.spec.ts`) ; le tout, de bout en bout : `e2e/not-found.spec.ts`.

async function open() {
  const context = appContext()
  await context.router.push('/cette-page-nexiste-pas')
  const wrapper = mount(NotFoundView, { global: { plugins: context.plugins } })
  await flushPromises()

  return { wrapper, context }
}

describe('la page introuvable', () => {
  it('dit en titre « Page introuvable » et explique, en une phrase, que l’adresse n’existe pas ou plus', async () => {
    const { wrapper } = await open()

    expect(wrapper.get('h1').text()).toBe('Page introuvable')
    expect(wrapper.text()).toContain('Cette adresse n’existe pas ou plus.')
    // Le « 404 » est décoratif : le titre porte le sens
    expect(wrapper.get('p[aria-hidden="true"]').text()).toBe('404')
  })

  it('ramène à l’application par un seul lien, « Retour à la liste », vers l’accueil', async () => {
    const { wrapper, context } = await open()

    const links = wrapper.findAll('a')
    expect(links).toHaveLength(1)
    expect(links[0]!.text()).toBe('Retour à la liste')
    expect(links[0]!.attributes('href')).toBe(context.router.resolve({ name: 'home' }).href)
    expect(links[0]!.attributes('href')).toBe('/')
  })

  it('ne montre aucune illustration hors saison : le texte seul', async () => {
    const { wrapper } = await open()

    expect(wrapper.findAll('svg')).toHaveLength(0)
  })
})
