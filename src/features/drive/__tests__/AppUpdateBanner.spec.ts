import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, me } from '@/__tests__/helpers'
import type { CurrentUser } from '@/api'
import { useSessionStore } from '@/session/session'
import AppUpdateBanner from '../AppUpdateBanner.vue'
import { fakeNative } from '../bridge/__tests__/fakeNative'

/** L'application Repas : le faux pont répond à `app.info` (ou par une erreur quand `version` est `null`). */
function installApp(version: string | null) {
  const native = fakeNative((message, reply) => {
    if (message.type !== 'app.info') return
    reply(
      version === null
        ? { v: 1, type: 'error', code: 'UNKNOWN_TYPE' }
        : { v: 1, type: 'app.info', version, versionCode: 108, drive: true },
    )
  })
  ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge

  return native
}

async function open(appUpdate: CurrentUser['appUpdate'] | undefined) {
  const context = appContext()
  await context.router.push('/moi')
  useSessionStore().user = { ...me, appUpdate } as CurrentUser
  const wrapper = mount(AppUpdateBanner, { global: { plugins: context.plugins } })
  await flushPromises()

  return wrapper
}

const update = (latest: string | null, minimum: string | null = null, outdated = false) => ({
  latest,
  minimum,
  outdated,
})

afterEach(() => {
  delete (globalThis as { repasNative?: unknown }).repasNative
})

describe('l’invitation à mettre à jour l’application, en haut de « Moi » (DRV-637)', () => {
  it('une application plus ancienne que la dernière version : une phrase et un bouton vers le mode d’emploi', async () => {
    installApp('0.1.8')
    const wrapper = await open(update('0.1.10'))

    expect(wrapper.find('p').text()).toBe('Une nouvelle version de l’application est prête.')
    const link = wrapper.find('a')
    expect(link.text()).toBe('Mettre à jour')
    expect(link.attributes('href')).toBe('/drive/aide#mise-a-jour')
    expect(wrapper.findAll('a')).toHaveLength(1)
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('compare nombre par nombre : 0.1.9 est plus ancienne que 0.1.10', async () => {
    installApp('0.1.9')
    const wrapper = await open(update('0.1.10'))

    expect(wrapper.text()).toContain('Une nouvelle version')
  })

  it('une application plus ancienne que la version minimale seulement', async () => {
    installApp('0.1.8')
    const wrapper = await open(update(null, '0.1.9'))

    expect(wrapper.text()).toContain('Une nouvelle version')
  })

  it.each(['0.1.10', '0.1.11', '0.1.100'])(
    'l’application %s est à jour : rien, même si le serveur croit encore l’ancienne version',
    async (running) => {
      installApp(running)
      const wrapper = await open(update('0.1.10', '0.1.9', true))

      expect(wrapper.html()).not.toContain('Une nouvelle version')
    },
  )

  it('l’application ne dit pas sa version : le calcul du serveur sert de repli', async () => {
    installApp(null)
    expect((await open(update('0.1.10', null, true))).text()).toContain('Une nouvelle version')
    expect((await open(update('0.1.10', null, false))).html()).not.toContain('Une nouvelle version')
  })

  it('le serveur ne connaît aucune version publiée : rien', async () => {
    installApp('0.1.8')
    const wrapper = await open(update(null, null, true))

    expect(wrapper.html()).not.toContain('Une nouvelle version')
  })

  it('une ancienne copie de la session, sans ce que le serveur sait des versions : rien', async () => {
    installApp('0.1.8')
    const wrapper = await open(undefined)

    expect(wrapper.html()).not.toContain('Une nouvelle version')
  })

  it('dans un navigateur : rien, même si le serveur dit le compte à mettre à jour', async () => {
    const wrapper = await open(update('0.1.10', '0.1.9', true))

    expect(wrapper.html()).not.toContain('Une nouvelle version')
  })

  it('demande la version une seule fois à l’application', async () => {
    const native = installApp('0.1.8')
    await open(update('0.1.10'))

    expect(native.sent.filter((message) => message.type === 'app.info')).toHaveLength(1)
  })
})
