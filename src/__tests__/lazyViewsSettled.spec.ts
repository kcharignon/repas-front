import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { START_LOCATION } from 'vue-router'

import { appContext } from '@/__tests__/helpers'

// Garde de `src/__tests__/setup.ts` : `app.use(router)` lance la navigation initiale vers `/`, dont les vues sont importées à la demande.
// Un test synchrone qui monte puis se termine ne doit pas laisser cet import se résoudre après la fermeture de l'environnement
// (`EnvironmentTeardownError`) : l'`afterEach` global attend les imports en cours. Le second test voit le résultat du premier.

type Router = ReturnType<typeof appContext>['router']

describe('imports dynamiques en fin de test', () => {
  let router: Router | undefined

  it('monte avec le routeur de test et se termine sans rien attendre', () => {
    const context = appContext()
    router = context.router

    mount(defineComponent({ render: () => h('div') }), { global: { plugins: context.plugins } })

    expect(router.currentRoute.value).toBe(START_LOCATION)
  })

  it('la navigation initiale du test précédent est terminée avant le test suivant', () => {
    expect(router).toBeDefined()
    expect(router?.currentRoute.value).not.toBe(START_LOCATION)
    expect(router?.currentRoute.value.matched.length).toBeGreaterThan(0)
  })
})
