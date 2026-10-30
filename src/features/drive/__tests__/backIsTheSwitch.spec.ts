// Le back reste l'interrupteur des drives (DRV-738) : l'application publiée ANNONCE Auchan (`app.info.retailers`), mais tant que `DRIVE_RETAILERS` ne l'allume pas,
// le back ne la liste ni dans les réglages (`retailers`), ni dans les candidats de l'envoi (`selection.candidates`), et Repas ne la propose nulle part : ni tuile à
// l'envoi, ni bouton « Choisir mon magasin Auchan » aux réglages (là où « Configurer un drive » mène), ni phrase de mise à jour. Faux back qui ne sert que Leclerc,
// faux pont qui annonce les deux drives ; valeurs inventées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { appContext, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import DriveSendView from '../DriveSendView.vue'
import DriveSettingsView from '../DriveSettingsView.vue'
import { plan } from './fixtures'
import { FIRST_STORE } from './severalDrives'

/** Les réglages d'un back dont `DRIVE_RETAILERS=leclerc` : Auchan n'est pas dans `retailers` ni dans `candidates`. */
function leclercOnlyBack(configured: boolean) {
  return {
    enabled: true,
    retailer: 'leclerc',
    store: configured ? FIRST_STORE : null,
    retailers: [
      {
        retailer: 'leclerc',
        name: 'Leclerc',
        configured,
        isDefault: false,
        store: configured ? FIRST_STORE : null,
      },
    ],
    defaultRetailer: null,
    lastUsedRetailer: null,
    selection: {
      mode: configured ? 'AUTO' : 'NONE',
      retailer: configured ? 'leclerc' : null,
      candidates: configured ? ['leclerc'] : [],
    },
  }
}

/** Le faux pont d'une application PUBLIÉE : elle annonce Leclerc ET Auchan. */
function publishedApp() {
  const native = fakeNative((message, reply) => {
    if (message.type === 'app.info')
      reply({
        v: 1,
        type: 'app.info',
        version: '1.4.0',
        versionCode: 14,
        drive: true,
        retailers: ['leclerc', 'auchan'],
      })
  })
  ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge
}

async function open(
  view: typeof DriveSendView | typeof DriveSettingsView,
  path: string,
  configured: boolean,
) {
  stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/drive/settings': () => json(leclercOnlyBack(configured)),
    'GET /api/v1/drive/plans/l1': () => json(plan()),
    'GET /api/v1/drive/choices': () => json({ member: [], totalItems: 0 }),
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)
  const wrapper = mount(view, { attachTo: document.body, global: { plugins: context.plugins } })
  await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))
  await vi.waitFor(() => expect(wrapper.text()).not.toContain('Chargement'))

  return wrapper
}

beforeEach(() => localStorage.clear())

afterEach(() => {
  vi.unstubAllGlobals()
  delete (globalThis as { repasNative?: unknown }).repasNative
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('une application qui annonce Auchan, un back qui ne l’allume pas', () => {
  it('l’écran d’envoi n’a aucune tuile, aucune question et ne nomme pas Auchan', async () => {
    publishedApp()
    const wrapper = await open(DriveSendView, '/drive/envoi/l1', true)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Magasin …456'))

    expect(document.body.querySelectorAll('input[name="send-drive"]')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Auchan')
    expect(wrapper.text()).not.toContain('Où envoyer ta liste')
    expect(wrapper.text()).not.toContain('Envoyer ailleurs')
    expect(wrapper.text()).not.toContain('Mets à jour')
  })

  it('les réglages d’un compte sans magasin (où mène « Configurer un drive ») ne proposent que Leclerc : pas de question « Quel drive », pas de bouton Auchan', async () => {
    publishedApp()
    const wrapper = await open(
      DriveSettingsView,
      '/drive/reglages?magasin=requis&retour=liste',
      false,
    )

    expect(wrapper.text()).not.toContain('Auchan')
    expect(wrapper.text()).not.toContain('Quel drive utilises-tu ?')
    expect(wrapper.text()).not.toContain('Mes drives')
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain(
      'Choisir mon magasin Auchan',
    )
  })

  it('les réglages d’un compte qui a son magasin n’ont ni carte, ni drive habituel, ni ajout pour Auchan', async () => {
    publishedApp()
    const wrapper = await open(DriveSettingsView, '/drive/reglages', true)

    expect(wrapper.text()).toContain('Magasin …456')
    expect(wrapper.text()).not.toContain('Auchan')
    expect(wrapper.text()).not.toContain('Mes drives')
    expect(wrapper.text()).not.toContain('Mon drive habituel')
    expect(wrapper.findAll('li')).toHaveLength(0)
  })
})
