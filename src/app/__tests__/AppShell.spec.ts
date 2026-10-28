import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, eventually } from '@/__tests__/helpers'
import AppShell from '@/app/AppShell.vue'

// Le menu latéral du bureau porte un petit motif de la saison (ADR 0010, 0011, 0012) ; la navigation du téléphone n'en porte jamais.
// Hors de ces tests, la suite tourne le 15 juin (src/__tests__/setup.ts).

async function mountShell() {
  const { plugins, router } = appContext()
  await router.push('/connexion')
  await router.isReady()
  const wrapper = mount(AppShell, { global: { plugins } })
  await flushPromises()

  return wrapper
}

describe('menu latéral, décor de saison', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-season')
  })

  it('hors saison : aucun motif', async () => {
    const wrapper = await mountShell()

    expect(wrapper.findAll('svg[focusable="false"]')).toHaveLength(0)
  })

  it('en saison d’Halloween : la toile, dans le menu seulement', async () => {
    vi.setSystemTime(new Date(2026, 9, 27, 12))

    const wrapper = await mountShell()

    await eventually(() => expect(wrapper.find('svg[focusable="false"]').exists()).toBe(true))
    expect(wrapper.findAll('aside svg[focusable="false"]')).toHaveLength(1)
    expect(
      wrapper.get('svg[focusable="false"]').element.closest('[aria-hidden="true"]'),
    ).not.toBeNull()
  })

  it('en saison de Noël : un motif, dans le menu seulement, sans texte', async () => {
    vi.setSystemTime(new Date(2026, 11, 20, 12))

    const wrapper = await mountShell()

    await eventually(() => expect(wrapper.find('svg[focusable="false"]').exists()).toBe(true))
    const decor = wrapper.findAll('aside svg[focusable="false"]')
    expect(decor).toHaveLength(1)
    expect(decor[0]!.attributes('focusable')).toBe('false')
    expect(decor[0]!.text()).toBe('')
    expect(wrapper.get('aside').element.contains(decor[0]!.element)).toBe(true)
  })

  it('Noël coupé : aucun motif', async () => {
    vi.setSystemTime(new Date(2026, 11, 20, 12))
    localStorage.setItem('repas.season', 'noel')

    const wrapper = await mountShell()

    expect(wrapper.findAll('aside svg[focusable="false"]')).toHaveLength(0)
  })
})
