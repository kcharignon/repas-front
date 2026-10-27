import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import type { DuplicatePair } from '@/api'
import DepartmentsView from '@/features/ingredients/DepartmentsView.vue'
import { useSessionStore } from '@/session/session'
import { pair, side } from './mergeFixtures'

const departments = {
  member: [{ slug: 'legumes', name: 'Fruits et légumes', image: '' }],
  totalItems: 1,
}

const pairs = (count: number): DuplicatePair[] =>
  Array.from({ length: count }, (_, index) =>
    pair(side(`a${index}`, `A${index}`, 1, 0), side(`b${index}`, `B${index}`, 1, 0)),
  )

async function open(duplicates: () => Response) {
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/departments': () => json(departments),
    'GET /api/v1/ingredients/duplicates': duplicates,
    'GET /api/v1/ingredients/to-fix': () => json({ member: [], totalItems: 0 }),
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/rayons')
  const wrapper = mount(DepartmentsView, { global: { plugins: context.plugins } })
  await vi.waitFor(() => expect(wrapper.find('a[href="/rayons/legumes"]').exists()).toBe(true))

  return { wrapper, fetchMock }
}

const link = (wrapper: Awaited<ReturnType<typeof open>>['wrapper']) =>
  wrapper.find('a[href="/ingredients/doublons"]')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('le lien « N doublons possibles » de la page Rayons', () => {
  it.each([
    [3, '3 doublons possibles'],
    [1, '1 doublon possible'],
    [49, '49 doublons possibles'],
  ])('dit %i doublon(s) et mène à l’écran des doublons', async (count, label) => {
    const { wrapper } = await open(() => json({ member: pairs(count), totalItems: count }))

    await vi.waitFor(() => expect(link(wrapper).exists()).toBe(true))
    expect(link(wrapper).text()).toBe(label)
  })

  it('dit « plus de 49 » au plafond du back (50 paires)', async () => {
    const { wrapper } = await open(() => json({ member: pairs(50), totalItems: 50 }))

    await vi.waitFor(() => expect(link(wrapper).exists()).toBe(true))
    expect(link(wrapper).text()).toBe('Plus de 49 doublons possibles')
  })

  it('n’existe pas sans doublon, avec une seule lecture', async () => {
    const { wrapper, fetchMock } = await open(() => json({ member: [], totalItems: 0 }))

    await vi.waitFor(() => expect(calls(fetchMock)).toContain('GET /api/v1/ingredients/duplicates'))
    expect(link(wrapper).exists()).toBe(false)
    expect(calls(fetchMock).filter((call) => call.endsWith('/duplicates'))).toHaveLength(1)
  })

  it('n’existe pas quand la lecture échoue : les rayons restent entiers', async () => {
    const { wrapper } = await open(() => json({ error: { message: 'x' } }, { status: 500 }))

    await vi.waitFor(() => expect(wrapper.find('a[href="/rayons/legumes"]').exists()).toBe(true))
    expect(link(wrapper).exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('laisse la place aux résultats pendant une recherche', async () => {
    const { wrapper } = await open(() => json({ member: pairs(2), totalItems: 2 }))
    await vi.waitFor(() => expect(link(wrapper).exists()).toBe(true))

    await wrapper.find('input[type="search"]').setValue('tomate')

    expect(link(wrapper).exists()).toBe(false)
  })
})
