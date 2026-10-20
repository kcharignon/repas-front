import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, me } from '@/__tests__/helpers'
import type { CurrentUser } from '@/api'
import { useSessionStore } from '@/session/session'
import AppUpdateBanner from '../AppUpdateBanner.vue'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import { fakeUpdateApp, installFakeApp, removeFakeApp } from '../bridge/__tests__/fakeUpdateApp'

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

// DRV-639 : une application qui sait se mettre à jour toute seule. « Mettre à jour » fait tout sur place, sans lien vers l'aide, GitHub ou Chrome.
describe('la mise à jour faite par l’application elle-même (DRV-639)', () => {
  const banner = (wrapper: Awaited<ReturnType<typeof open>>) =>
    wrapper.find('[data-testid="app-update-banner"]')

  async function pressUpdate(wrapper: Awaited<ReturnType<typeof open>>) {
    await wrapper.find('[data-testid="app-update-start"]').trigger('click')
    await flushPromises()
  }

  afterEach(() => removeFakeApp())

  it('l’application trouve une version plus récente : une phrase et un bouton, pas de lien', async () => {
    const app = fakeUpdateApp({ remote: 'newer' })
    installFakeApp(app)
    const wrapper = await open(update('0.1.30'))

    expect(banner(wrapper).text()).toContain('Une nouvelle version de l’application est prête.')
    expect(banner(wrapper).find('a').exists()).toBe(false)
    expect(banner(wrapper).find('button').text()).toBe('Mettre à jour')
    expect(app.updateMessages()).toEqual(['update.status', 'update.check'])
  })

  it('le bandeau paraît même si le serveur ne sait pas encore la nouvelle version', async () => {
    installFakeApp(fakeUpdateApp({ remote: 'newer' }))
    const wrapper = await open(update(null))

    expect(banner(wrapper).exists()).toBe(true)
  })

  it('un seul geste : « Mettre à jour » envoie update.start, sans adresse ni version', async () => {
    const app = fakeUpdateApp({ remote: 'newer' })
    installFakeApp(app)
    const wrapper = await open(update('0.1.30'))

    await pressUpdate(wrapper)

    expect(app.updateMessages()).toEqual(['update.status', 'update.check', 'update.start'])
    expect(app.sent[app.sent.length - 1]).toEqual({ v: 1, type: 'update.start' })
    expect(app.texts[app.texts.length - 1]).toBe('{"v":1,"type":"update.start"}')
  })

  it('le téléchargement se voit avec sa progression, puis l’invitation à toucher « Installer »', async () => {
    const app = fakeUpdateApp({ remote: 'newer' })
    installFakeApp(app)
    const wrapper = await open(update('0.1.30'))
    await pressUpdate(wrapper)

    app.say({ state: 'telechargement', version: '0.1.30', progress: 42 })
    await flushPromises()
    expect(banner(wrapper).text()).toContain('Téléchargement de la mise à jour… 42 %')
    expect(banner(wrapper).find('[role="progressbar"]').exists()).toBe(true)
    expect(banner(wrapper).find('button').exists()).toBe(false)

    app.say({ state: 'pretAInstaller', version: '0.1.30' })
    await flushPromises()
    expect(banner(wrapper).text()).toContain('Touche « Installer » dans l’écran d’Android.')
    expect(banner(wrapper).text()).toContain('Installer sans analyser')
    expect(banner(wrapper).find('button').exists()).toBe(false)
  })

  it('une erreur tient en une phrase et propose de réessayer', async () => {
    const app = fakeUpdateApp({ remote: 'newer' })
    installFakeApp(app)
    const wrapper = await open(update('0.1.30'))
    await pressUpdate(wrapper)

    app.say({ state: 'erreur', code: 'DIGEST_MISMATCH', version: '0.1.30' })
    await flushPromises()
    expect(banner(wrapper).text()).toBe(
      'Le fichier téléchargé n’est pas le bon : rien n’a été installé.Réessayer',
    )

    // Réessayer relance le téléchargement (la version est connue : pas besoin de chercher de nouveau)
    await pressUpdate(wrapper)
    expect(app.updateMessages().slice(-1)).toEqual(['update.start'])
    expect(app.updateMessages().filter((type) => type === 'update.check')).toHaveLength(1)
  })

  it.each([
    ['OFFLINE', 'Pas de connexion pour le moment.'],
    ['PERMISSION_DENIED', 'Android n’a pas autorisé l’installation.'],
    ['TOO_LARGE', 'La mise à jour n’a pas pu se faire. Réessaie un peu plus tard.'],
    ['UNTRUSTED_ADDRESS', 'La mise à jour n’a pas pu se faire. Réessaie un peu plus tard.'],
    [
      'UN_CODE_QUE_LA_PAGE_NE_CONNAIT_PAS',
      'La mise à jour n’a pas pu se faire. Réessaie un peu plus tard.',
    ],
  ])('l’erreur %s dit « %s », sans montrer le code', async (code, sentence) => {
    const app = fakeUpdateApp({ remote: 'newer' })
    installFakeApp(app)
    const wrapper = await open(update('0.1.30'))
    await pressUpdate(wrapper)

    app.say({ state: 'erreur', code, version: '0.1.30' })
    await flushPromises()

    expect(banner(wrapper).find('[role="alert"]').text()).toBe(sentence)
    expect(banner(wrapper).text()).not.toContain(code)
  })

  it('l’application dit « à jour » : aucun bandeau, même si le serveur croit l’ancienne version', async () => {
    installFakeApp(fakeUpdateApp({ remote: 'same' }))
    const wrapper = await open(update('0.1.30', '0.1.29', true))

    expect(banner(wrapper).exists()).toBe(false)
  })

  it('hors connexion, c’est le serveur qui invite ; la recherche se refera au toucher', async () => {
    const app = fakeUpdateApp({ remote: 'offline' })
    installFakeApp(app)
    const wrapper = await open(update('0.1.30', null, true))

    expect(banner(wrapper).exists()).toBe(true)
    expect(banner(wrapper).text()).toContain('Une nouvelle version de l’application est prête.')
    expect(banner(wrapper).text()).not.toContain('Pas de connexion')
    expect(banner(wrapper).find('button').text()).toBe('Mettre à jour')
  })

  it('une application qui ne sait pas se mettre à jour garde l’ancien bouton vers l’aide, et rien d’update n’est envoyé', async () => {
    const app = fakeUpdateApp({ selfUpdate: false, version: '0.1.8' })
    installFakeApp(app)
    const wrapper = await open(update('0.1.30'))

    expect(banner(wrapper).find('a').attributes('href')).toBe('/drive/aide#mise-a-jour')
    expect(banner(wrapper).find('button').exists()).toBe(false)
    expect(app.updateMessages()).toEqual([])
  })

  it('dans un navigateur : rien, et aucun message update', async () => {
    const wrapper = await open(update('0.1.30'))

    expect(banner(wrapper).exists()).toBe(false)
  })
})
