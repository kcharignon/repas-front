import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import type { Component } from 'vue'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'

// Les données des tests des types de liste : un compte avec « Boucherie » (Viandes, 1 produit à part) et « Marché » (Fruits et légumes).
export const departments = {
  member: [
    { slug: 'viandes', name: 'Viandes', image: '', icon: null, listTypeId: 't1' },
    { slug: 'charcuterie', name: 'Charcuterie', image: '', icon: null, listTypeId: null },
    { slug: 'fruits-legumes', name: 'Fruits et légumes', image: '', icon: null, listTypeId: 't2' },
    { slug: 'epicerie', name: 'Épicerie', image: '', icon: null, listTypeId: null },
  ],
  totalItems: 4,
}

export const boucherie = {
  id: 't1',
  name: 'Boucherie',
  departmentSlugs: ['viandes'],
  ingredientCount: 1,
}
export const marche = {
  id: 't2',
  name: 'Marché',
  departmentSlugs: ['fruits-legumes'],
  ingredientCount: 0,
}

export const boucherieDetail = {
  id: 't1',
  name: 'Boucherie',
  departments: [{ slug: 'viandes', name: 'Viandes' }],
  ingredients: [
    {
      slug: 'merguez',
      name: 'Merguez',
      departmentSlug: 'charcuterie',
      departmentName: 'Charcuterie',
    },
  ],
}

export const collection =
  (...member: unknown[]) =>
  () =>
    json({ member, totalItems: member.length })

export const base = {
  'POST /api/auth/refresh': () => json({ token: 'jeton' }),
  'GET /api/v1/me': () => json(me),
  'GET /api/v1/departments': () => json(departments),
}

const mounted: VueWrapper[] = []

/** Démonte les vues montrées par `open` : une vue oubliée recevrait des relectures dans un document déjà vidé. */
export function cleanUp() {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
}

export async function open(view: Component, path: string, handlers: Parameters<typeof stubApi>[0]) {
  const fetchMock = stubApi({ ...base, ...handlers })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)
  const wrapper = mount(view, { global: { plugins: context.plugins }, attachTo: document.body })
  mounted.push(wrapper as VueWrapper)
  await flushPromises()

  return { wrapper, context, fetchMock }
}

/** La requête n° `index` de la méthode et du chemin donnés, pour lire son corps. */
export async function sentBody(
  fetchMock: ReturnType<typeof stubApi>,
  key: string,
): Promise<unknown> {
  const request = fetchMock.mock.calls
    .map(([call]) => call as Request)
    .find((candidate) => `${candidate.method} ${new URL(candidate.url).pathname}` === key)

  return request?.json()
}
