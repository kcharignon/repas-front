import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext } from '@/__tests__/helpers'
import { APP_RELEASES_URL } from '../appInstall'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import AppHelpLink from '../AppHelpLink.vue'
import DriveHelpView from '../DriveHelpView.vue'

type Native = ReturnType<typeof fakeNative>

const scrollIntoView = vi.fn<() => void>()

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView
})

afterEach(() => {
  delete (globalThis as { repasNative?: unknown }).repasNative
  scrollIntoView.mockClear()
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

describe('aide et installation de l’application', () => {
  it('dans un navigateur : explique l’installation et propose la dernière version', async () => {
    const { wrapper } = await open()

    expect(wrapper.find('h1').text()).toBe('Installer l’application Repas')
    expect(wrapper.text()).toContain('Tu es dans un navigateur.')
    const download = wrapper.find(`a[href="${APP_RELEASES_URL}"]`)
    expect(download.text()).toBe('Télécharger la dernière version')
    expect(download.attributes('target')).toBe('_blank')
    expect(download.attributes('rel')).toBe('noopener noreferrer')
    expect(download.attributes('aria-label')).toContain('nouvel onglet')
    // Les étapes de l’installation, dans l’ordre
    const steps = wrapper.findAll('#installer li').map((step) => step.text())
    expect(steps).toHaveLength(6)
    expect(steps[2]).toContain('Autoriser depuis cette source')
    expect(steps[5]).toContain('connecte-toi à Repas')
  })

  it('ne mène pas à une version d’essai : seules les versions « android-v… » sont à installer', async () => {
    // Les pré-versions de débogage s'appellent « android-dev-… » : debuggables et signées d'une clé publique, jamais à installer.
    const { wrapper } = await open()

    const step = wrapper.findAll('#installer li')[1]?.text() ?? ''
    expect(step).toContain('commence par « android-v »')
    expect(step).toContain('« dev »')
    expect(step).toContain('Pre-release')
    expect(step).not.toContain('commence par « android- »')
  })

  it('couvre la connexion à Leclerc, l’envoi, la mise à jour, la désinstallation et l’ancienne icône', async () => {
    const { wrapper } = await open()

    expect(wrapper.find('#connexion-leclerc').text()).toContain(
      'Connecte-toi à ton compte E.Leclerc',
    )
    expect(wrapper.find('#connexion-leclerc a[href="/drive/reglages"]').text()).toBe(
      'Réglages du drive',
    )
    expect(wrapper.find('#envoi').text()).toContain('Garde l’application ouverte.')
    expect(wrapper.find('#mise-a-jour').text()).toContain('installe-la par-dessus')
    expect(wrapper.find('#desinstaller').text()).toContain('Désinstaller')
    expect(wrapper.find('#ancienne-icone').text()).toContain('ancienne icône')
  })

  it('le dépannage est repliable et couvre l’installation, Play Protect, Leclerc et le mode assisté', async () => {
    const { wrapper } = await open()

    const details = wrapper.findAll('#depannage details')
    expect(details).toHaveLength(7)
    expect(details.every((item) => item.element.hasAttribute('open'))).toBe(false)
    const questions = details.map((item) => item.find('summary').text())
    expect(questions).toEqual(
      expect.arrayContaining([
        'L’installation est bloquée',
        'Play Protect affiche un avertissement',
        'Je n’arrive pas à me connecter à Leclerc',
        '« Le site a changé » ou « Leclerc a changé »',
      ]),
    )
    expect(wrapper.find('#depannage').text()).toContain('Chercher à la main')
  })

  it('hors de l’application : le mode assisté mène à la liste', async () => {
    const { wrapper } = await open()

    const assisted = wrapper.find('#mode-assiste')
    expect(assisted.find('h2').text()).toBe('Sans l’application : chercher à la main')
    expect(assisted.find('a').attributes('href')).toBe('/liste')
    expect(wrapper.find('nav a[href="/drive/aide#mode-assiste"]').exists()).toBe(true)
  })

  it('dans l’application : annonce la version et n’affiche pas le mode assisté', async () => {
    installApp('1.2.3')
    const { wrapper } = await open()

    expect(wrapper.text()).toContain('Tu es dans l’application Repas, version 1.2.3.')
    expect(wrapper.text()).not.toContain('Tu es dans un navigateur.')
    // Déjà installée : le titre ne propose pas de l'installer, l'introduction dit à quoi sert la page
    expect(wrapper.find('h1').text()).toBe('L’application Repas')
    expect(wrapper.find('header p').text()).toContain('Tu utilises déjà l’application')
    expect(wrapper.find('header p').text()).toContain('comment la mettre à jour')
    expect(wrapper.find('#mode-assiste').exists()).toBe(false)
    expect(wrapper.find('nav a[href="/drive/aide#mode-assiste"]').exists()).toBe(false)
  })

  it('dans l’application qui ne donne pas sa version : le dit sans elle', async () => {
    installApp(null)
    const { wrapper } = await open()

    expect(wrapper.text()).toContain('Tu es dans l’application Repas.')
    expect(wrapper.find('header').text()).not.toContain('version')
  })

  it('ne porte plus la note de vie privée : un lien discret mène aux conditions d’utilisation (DRV-628)', async () => {
    const { wrapper } = await open()

    expect(wrapper.find('#vie-privee').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('suspendre')
    expect(wrapper.text()).not.toContain('jamais')
    const link = wrapper.find('a[href="/drive/conditions"]')
    expect(link.text()).toBe('Conditions d’utilisation')
    // Hors du sommaire et jamais imposé : un simple lien au pied de la page
    expect(wrapper.find('nav a[href="/drive/conditions"]').exists()).toBe(false)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  })

  it('le lien mène à la page des conditions', async () => {
    const { wrapper, context } = await open()

    await wrapper.find('a[href="/drive/conditions"]').trigger('click')
    // La page des conditions se charge à la demande : on attend la fin de la navigation
    await vi.waitFor(() => expect(context.router.currentRoute.value.name).toBe('drive-terms'))
  })

  it('le sommaire mène à la rubrique et y pose le focus', async () => {
    const { wrapper, context } = await open()
    scrollIntoView.mockClear()

    await wrapper.find('nav a[href="/drive/aide#depannage"]').trigger('click')
    await flushPromises()

    expect(context.router.currentRoute.value.hash).toBe('#depannage')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(document.activeElement?.id).toBe('depannage')
  })

  it('ouverte sur une ancre, amène la rubrique à l’écran', async () => {
    await open('/drive/aide#depannage')

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(document.activeElement?.id).toBe('depannage')
  })

  it('ouverte sur une ancre inconnue, ne fait rien', async () => {
    await open('/drive/aide#nimporte-quoi')

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('chaque rubrique du sommaire existe dans la page', async () => {
    const { wrapper } = await open()

    const targets = wrapper.findAll('nav a').map((link) => link.attributes('href')?.split('#')[1])
    expect(targets).toHaveLength(8)
    for (const id of targets) expect(wrapper.find(`#${id}`).exists()).toBe(true)
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
    expect(wrapper.find('a').text()).toContain('installer et mettre à jour')
    expect(wrapper.find('a').text()).not.toContain('Mettre à jour l’application')
  })

  it('dans l’application : propose de la mettre à jour, jamais de l’installer, et mène à cette rubrique', async () => {
    installApp()
    const wrapper = await entry()

    expect(wrapper.find('h2').text()).toBe('Application')
    expect(wrapper.find('a').attributes('href')).toBe('/drive/aide#mise-a-jour')
    expect(wrapper.find('a').text()).toContain('Mettre à jour l’application')
    expect(wrapper.find('a').text()).toContain('Mode d’emploi pour mettre à jour l’application.')
    expect(wrapper.find('a').text()).not.toContain('Installer')
  })

  it('dans l’application : l’adresse de l’entrée amène la rubrique de mise à jour à l’écran', async () => {
    installApp()
    const { wrapper } = await open('/drive/aide#mise-a-jour')

    expect(wrapper.find('#mise-a-jour h2').text()).toBe('Mettre à jour l’application')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(document.activeElement?.id).toBe('mise-a-jour')
  })
})
