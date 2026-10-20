import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext } from '@/__tests__/helpers'
import { APP_RELEASES_URL } from '../appInstall'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import AppHelpLink from '../AppHelpLink.vue'
import DriveHelpView from '../DriveHelpView.vue'

type Native = ReturnType<typeof fakeNative>

afterEach(() => {
  delete (globalThis as { repasNative?: unknown }).repasNative
  document.body.innerHTML = ''
})

/** L'application Repas : le faux pont répond à `app.info` (ou par une erreur quand `version` est `null`). */
function installApp(version: string | null = '1.2.3'): Native {
  const native = fakeNative((message, reply) => {
    if (message.type !== 'app.info') return
    reply(
      version === null
        ? { v: 1, type: 'error', code: 'UNKNOWN_TYPE' }
        : { v: 1, type: 'app.info', version, versionCode: 12, drive: true },
    )
  })
  ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge

  return native
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
  it('dans un navigateur : une phrase, trois étapes et le bouton vers les versions', async () => {
    const { wrapper } = await open()

    expect(wrapper.find('h1').text()).toBe('Installer l’application Repas')
    expect(wrapper.findAll('p')).toHaveLength(1)
    const steps = wrapper.findAll('ol li').map((step) => step.text())
    expect(steps).toHaveLength(3)
    // Les pré-versions de débogage s'appellent « android-dev-… » : seules les versions « android-v… » sont à installer
    expect(steps[0]).toContain('commence par « android-v »')
    // Le nom du fichier dit la version (repas-drive-X.Y.Z.apk) : on prend celui qui a le plus grand numéro
    expect(steps[0]).toContain('se termine par le numéro de version')
    expect(steps[0]).toContain('le plus grand numéro')
    expect(steps[1]).toBe('Ouvre le fichier téléchargé.')
    expect(steps[2]).toBe('Touche « Installer ».')
    const download = wrapper.find(`a[href="${APP_RELEASES_URL}"]`)
    expect(download.text()).toBe('Télécharger la dernière version')
    expect(download.attributes('target')).toBe('_blank')
    expect(download.attributes('rel')).toBe('noopener noreferrer')
    expect(download.attributes('aria-label')).toContain('nouvel onglet')
    expect(wrapper.findAll('a')).toHaveLength(1)
  })

  it('dans l’application : le titre, la version installée et le bouton, rien d’autre', async () => {
    installApp('1.2.3')
    const { wrapper } = await open()

    expect(wrapper.find('h1').text()).toBe('Mettre à jour l’application')
    expect(wrapper.text()).toContain('Version installée : 1.2.3')
    expect(wrapper.find(`a[href="${APP_RELEASES_URL}"]`).text()).toBe(
      'Télécharger la dernière version',
    )
    expect(wrapper.findAll('a')).toHaveLength(1)
    expect(wrapper.find('ol').exists()).toBe(false)
    expect(wrapper.findAll('h2')).toHaveLength(0)
    expect(wrapper.find('details').exists()).toBe(false)
  })

  it('dans l’application qui ne donne pas sa version : n’affiche pas la ligne de version', async () => {
    installApp(null)
    const { wrapper } = await open()

    expect(wrapper.text()).not.toContain('Version installée')
    expect(wrapper.find('a').exists()).toBe(true)
  })

  it('l’ancre « mise-a-jour » des liens qui mènent ici existe', async () => {
    installApp()
    const { wrapper } = await open('/drive/aide#mise-a-jour')

    expect(wrapper.find('#mise-a-jour h1').text()).toBe('Mettre à jour l’application')
  })
})

describe('entrée de « Moi »', () => {
  async function entry() {
    const context = appContext()
    await context.router.push('/moi')

    return mount(AppHelpLink, { global: { plugins: context.plugins } })
  }

  it('dans un navigateur : propose d’installer l’application', async () => {
    const wrapper = await entry()

    expect(wrapper.find('h2').text()).toBe('Application')
    expect(wrapper.find('a').attributes('href')).toBe('/drive/aide')
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
