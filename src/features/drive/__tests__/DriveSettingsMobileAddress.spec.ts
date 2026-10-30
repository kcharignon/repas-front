// L'adresse du site MOBILE d'un magasin collée dans la saisie à la main (DRV-741) : jamais enregistrée telle quelle (son hôte n'est pas celui du magasin).
// Dans l'application, elle fait lire le magasin à l'adresse donnée (`drive.setup` avec `address`) et c'est la lecture, avec le bon hôte, qui est enregistrée ;
// dans un navigateur, un message explique ce qu'il faut faire et rien n'est enregistré. Valeurs SYNTHÉTIQUES.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import type { SentMessage } from '../bridge/__tests__/fakeNative'
import DriveSettingsView from '../DriveSettingsView.vue'

const MOBILE = 'https://m-courses.leclercdrive.fr/magasin-123456-123456-ville-test.aspx'
const MOBILE_OPENED = 'https://m-courses.leclercdrive.fr/magasin-123456-123456-ville-test'
// Ce que l'agent lit sur la page finale, où l'enseigne a redirigé l'application
const STORE = {
  id: '123456',
  host: 'fd9-courses.leclercdrive.fr',
  baseUrl: 'https://fd9-courses.leclercdrive.fr/magasin-123456-123456',
  label: null,
}
const settingsOf = (store: unknown = null) => ({ enabled: true, retailer: 'leclerc', store })
const found = (runId: string) => ({
  v: 1,
  type: 'drive.result',
  result: { v: 1, type: 'setup-result', runId, agentVersion: '1.0.0', store: STORE },
})

async function open(inApp: boolean) {
  const native = fakeNative((message: SentMessage, reply) => {
    if (message.type === 'app.info')
      reply({
        v: 1,
        type: 'app.info',
        version: '0.5.0',
        versionCode: 5,
        drive: true,
        retailers: ['leclerc'],
      })
    if (message.type === 'drive.setup') setTimeout(() => reply(found(message.runId ?? '')), 10)
  })
  if (inApp) Object.assign(globalThis, { repasNative: native.bridge })
  let saved: unknown = null
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/drive/settings': () => json(settingsOf(saved)),
    'PUT /api/v1/drive/settings': async (request) => {
      saved = ((await request.clone().json()) as { store: unknown }).store

      return new Response(null, { status: 204 })
    },
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/drive/reglages')
  const wrapper = mount(DriveSettingsView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))
  await flushPromises()

  return { wrapper, native, fetchMock }
}

/** Ouvre la saisie à la main, colle l'adresse et touche « Enregistrer mon magasin ». */
async function paste(wrapper: Awaited<ReturnType<typeof open>>['wrapper'], address: string) {
  await wrapper.find('details summary').trigger('click')
  await wrapper.find('details input[type="url"]').setValue(address)
  await wrapper.find('details form').trigger('submit')
  await flushPromises()
}

const puts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.map(([input]) => input as Request).filter((r) => r.method === 'PUT')

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(globalThis, 'repasNative')
  document.body.innerHTML = ''
})

describe('adresse du site mobile collée dans la saisie à la main', () => {
  it('dans l’application : l’application ouvre cette adresse, et le magasin lu (le bon hôte) est enregistré', async () => {
    const { wrapper, native, fetchMock } = await open(true)

    await paste(wrapper, MOBILE)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Magasin …456 enregistré.'))

    const setups = native.sent.filter((message) => message.type === 'drive.setup')
    expect(setups).toHaveLength(1)
    // L'adresse est ramenée à celle du magasin (sans `.aspx`), jamais enregistrée
    expect(setups[0]).toMatchObject({ retailer: 'leclerc', address: MOBILE_OPENED })
    expect(puts(fetchMock)).toHaveLength(1)
    const body = (await bodyOf(
      fetchMock,
      fetchMock.mock.calls.findIndex(([input]) => (input as Request).method === 'PUT'),
    )) as { store: { baseUrl: string } }
    expect(body.store.baseUrl).toBe(STORE.baseUrl)
    expect(JSON.stringify(body)).not.toContain('m-courses')
  })

  it('hors de l’application : un message clair, rien n’est enregistré', async () => {
    const { wrapper, fetchMock } = await open(false)

    await paste(wrapper, MOBILE)

    expect(wrapper.text()).toContain(
      'Cette adresse est celle du site mobile. Ouvre-la dans l’application Repas, ou colle l’adresse du site sur ordinateur.',
    )
    expect(wrapper.text()).not.toContain('n’est pas celle d’un magasin')
    expect(puts(fetchMock)).toHaveLength(0)
    expect(calls(fetchMock)).not.toContain('PUT /api/v1/drive/settings')
  })

  it('dans l’application, une adresse qui n’est pas celle d’un magasin reste refusée comme avant, sans lire de magasin', async () => {
    const { wrapper, native, fetchMock } = await open(true)

    await paste(wrapper, 'https://m-courses.leclercdrive.fr/connexion.aspx')

    expect(wrapper.text()).toContain('n’est pas celle d’un magasin Leclerc Drive')
    expect(native.sent.filter((message) => message.type === 'drive.setup')).toHaveLength(0)
    expect(puts(fetchMock)).toHaveLength(0)
  })

  it('une adresse du site ordinateur est enregistrée comme avant, sans lecture par l’application', async () => {
    const { wrapper, native, fetchMock } = await open(true)

    await paste(wrapper, 'https://exemple.leclercdrive.fr/magasin-123456-123456')
    await flushPromises()

    expect(native.sent.filter((message) => message.type === 'drive.setup')).toHaveLength(0)
    expect(puts(fetchMock)).toHaveLength(1)
  })

  it('une adresse ordinateur avec ville et .aspx est acceptée et l’adresse de base est enregistrée (DRV-742)', async () => {
    const { wrapper, native, fetchMock } = await open(true)

    await paste(
      wrapper,
      'https://exemple.leclercdrive.fr/magasin-123456-123456-ville-test.aspx?a=1',
    )
    await flushPromises()

    expect(native.sent.filter((message) => message.type === 'drive.setup')).toHaveLength(0)
    const sent = puts(fetchMock)
    expect(sent).toHaveLength(1)
    const body = await (sent[0] as Request).clone().text()
    expect(body).toContain('https://exemple.leclercdrive.fr/magasin-123456-123456')
    expect(body).not.toContain('ville-test')
    expect(body).not.toContain('.aspx')
  })
})
