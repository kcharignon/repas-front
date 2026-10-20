import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext } from '@/__tests__/helpers'
import { APP_APK_URL, APP_RELEASES_URL } from '../appInstall'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import { fakeUpdateApp, installFakeApp, removeFakeApp } from '../bridge/__tests__/fakeUpdateApp'
import type { FakeUpdateAppOptions } from '../bridge/__tests__/fakeUpdateApp'
import AppHelpLink from '../AppHelpLink.vue'
import DriveHelpView from '../DriveHelpView.vue'
import InstallView from '../InstallView.vue'

type Native = ReturnType<typeof fakeNative>

afterEach(() => {
  removeFakeApp()
  document.body.innerHTML = ''
})

/** L'application Repas, ancienne : le faux pont répond à `app.info` (ou par une erreur quand `version` est `null`), sans mise à jour. */
function installApp(version: string | null = '1.2.3'): Native {
  const native = fakeNative((message, reply) => {
    if (message.type !== 'app.info') return
    reply(
      version === null
        ? { v: 1, type: 'error', code: 'UNKNOWN_TYPE' }
        : { v: 1, type: 'app.info', version, versionCode: 12, drive: true },
    )
  })
  installFakeApp(native)

  return native
}

/** L'application Repas d'aujourd'hui : elle sait se mettre à jour toute seule. */
function installUpdatingApp(options: FakeUpdateAppOptions = {}) {
  const app = fakeUpdateApp({ version: '1.2.3', ...options })
  installFakeApp(app)

  return app
}

async function open(path = '/drive/aide') {
  const context = appContext()
  await context.router.push(path)
  const wrapper = mount(DriveHelpView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await flushPromises()

  return { wrapper, context }
}

describe('page de l’application', () => {
  it('dans l’application qui se met à jour seule : la version installée et un seul bouton, sans lien', async () => {
    const app = installUpdatingApp({ remote: 'newer' })
    const { wrapper } = await open()

    expect(wrapper.find('h1').text()).toBe('Mettre à jour l’application')
    expect(wrapper.text()).toContain('Version installée : 1.2.3')
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.find('button').text()).toBe('Mettre à jour')
    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.find('ol').exists()).toBe(false)
    expect(wrapper.findAll('h2')).toHaveLength(0)
    expect(wrapper.find('details').exists()).toBe(false)
    expect(app.updateMessages()).toEqual(['update.status', 'update.check'])
  })

  it('« Mettre à jour » lance tout, sans passer par GitHub, puis montre le téléchargement', async () => {
    const app = installUpdatingApp({ remote: 'newer' })
    const { wrapper } = await open()

    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(app.updateMessages().slice(-1)).toEqual(['update.start'])

    app.say({ state: 'telechargement', version: '0.1.30', progress: 70 })
    await flushPromises()
    expect(wrapper.text()).toContain('Téléchargement de la mise à jour… 70 %')
    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.html()).not.toContain('github.com')

    app.say({ state: 'pretAInstaller', version: '0.1.30' })
    await flushPromises()
    expect(wrapper.text()).toContain('Touche « Installer » dans l’écran d’Android.')
  })

  it('l’application est à jour : une phrase, plus de bouton', async () => {
    installUpdatingApp({ remote: 'same' })
    const { wrapper } = await open()

    expect(wrapper.text()).toContain('Tu as la dernière version.')
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('hors connexion : une phrase et « Réessayer », qui relance la recherche', async () => {
    const app = installUpdatingApp({ remote: 'offline' })
    const { wrapper } = await open()

    expect(wrapper.find('[role="alert"]').text()).toBe('Pas de connexion pour le moment.')
    expect(wrapper.find('button').text()).toBe('Réessayer')

    await wrapper.find('button').trigger('click')
    await flushPromises()
    // Pas de version connue : on cherche d'abord, puis on lance si une version est trouvée
    expect(app.updateMessages().filter((type) => type === 'update.check')).toHaveLength(2)
  })

  it('une application plus ancienne, qui ne sait pas se mettre à jour : le téléchargement à la main, trois étapes', async () => {
    const native = installApp('1.2.3')
    const { wrapper } = await open()

    expect(wrapper.find('h1').text()).toBe('Mettre à jour l’application')
    expect(wrapper.text()).toContain('Version installée : 1.2.3')
    const download = wrapper.find(`a[href="${APP_APK_URL}"]`)
    expect(download.text()).toBe('Télécharger l’application')
    expect(wrapper.findAll('ol li').map((step) => step.text())).toEqual([
      'Ouvre le fichier quand Android le propose.',
      'Autorise l’installation (une seule fois).',
      'Touche « Installer ».',
    ])
    // Rien d'update n'est envoyé à une application qui ne dit pas le savoir
    expect(native.sent.map((message) => message.type)).toEqual(['app.info'])
  })

  it('l’application ne donne pas sa version : n’affiche pas la ligne de version', async () => {
    installApp(null)
    const { wrapper } = await open()

    expect(wrapper.text()).not.toContain('Version installée')
    expect(wrapper.find('a').exists()).toBe(true)
  })

  it('l’ancre « mise-a-jour » des liens qui mènent ici existe', async () => {
    installUpdatingApp()
    const { wrapper } = await open('/drive/aide#mise-a-jour')

    expect(wrapper.find('#mise-a-jour h1').text()).toBe('Mettre à jour l’application')
  })

  it('l’ancienne page des versions de GitHub n’est plus le chemin de la mise à jour', async () => {
    installUpdatingApp()
    const { wrapper } = await open()

    expect(wrapper.html()).not.toContain(APP_RELEASES_URL)
  })
})

describe('les routes', () => {
  it('dans un navigateur, la page d’aide mène à la page publique d’installation', async () => {
    const { router } = appContext()

    await router.push('/drive/aide')

    expect(router.currentRoute.value.fullPath).toBe('/installer')
  })

  it('dans l’application, la page d’installation mène à la mise à jour', async () => {
    installUpdatingApp()
    const { router } = appContext()

    await router.push('/installer')

    expect(router.currentRoute.value.fullPath).toBe('/drive/aide#mise-a-jour')
  })

  it('la page d’installation est publique et la page d’aide ne l’est pas', () => {
    const { router } = appContext()

    expect(router.resolve('/installer').meta.public).toBe(true)
    expect(router.resolve('/drive/aide').meta.public).toBeUndefined()
  })
})

describe('la page publique /installer', () => {
  async function installPage() {
    const context = appContext()
    await context.router.push('/installer')

    return mount(InstallView, { attachTo: document.body, global: { plugins: context.plugins } })
  }

  it('un gros bouton vers l’APK de la dernière version, puis trois étapes', async () => {
    const wrapper = await installPage()

    expect(wrapper.find('h1').text()).toBe('Installer l’application Repas')
    const download = wrapper.find('[data-testid="install-download"]')
    expect(download.text()).toBe('Télécharger l’application')
    expect(download.attributes('href')).toBe(
      'https://github.com/kcharignon/repas-front/releases/download/android-latest/repas-drive.apk',
    )
    expect(download.attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.findAll('ol li').map((step) => step.text())).toEqual([
      'Ouvre le fichier quand Android le propose.',
      'Autorise l’installation (une seule fois).',
      'Touche « Installer ».',
    ])
  })

  it('n’a ni formulaire, ni champ, ni autre lien que le téléchargement dans sa partie principale', async () => {
    const wrapper = await installPage()
    const main = wrapper.find('main')

    expect(main.findAll('a')).toHaveLength(1)
    expect(main.findAll('input, form, button')).toHaveLength(0)
  })
})

describe('entrée de « Moi »', () => {
  async function entry() {
    const context = appContext()
    await context.router.push('/moi')

    return mount(AppHelpLink, { global: { plugins: context.plugins } })
  }

  it('dans un navigateur : propose d’installer l’application, vers la page publique', async () => {
    const wrapper = await entry()

    expect(wrapper.find('h2').text()).toBe('Application')
    expect(wrapper.find('a').attributes('href')).toBe('/installer')
    expect(wrapper.find('a').text()).toContain('Installer l’application Android')
    expect(wrapper.find('a').text()).toContain('Télécharger et installer')
    expect(wrapper.find('a').text()).not.toContain('Mettre à jour l’application')
  })

  it('dans l’application : propose de la mettre à jour, jamais de l’installer, et mène à cette rubrique', async () => {
    installApp()
    const wrapper = await entry()

    expect(wrapper.find('h2').text()).toBe('Application')
    expect(wrapper.find('a').attributes('href')).toBe('/drive/aide#mise-a-jour')
    expect(wrapper.find('a').text()).toContain('Mettre à jour l’application')
    expect(wrapper.find('a').text()).toContain('Ouvrir la dernière version.')
    expect(wrapper.find('a').text()).not.toContain('Installer')
  })
})
