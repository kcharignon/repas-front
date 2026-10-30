// « Mes drives » dans les réglages (DRV-709) : la liste des drives allumés, l'ajout (la lecture du magasin pour le drive touché), le retrait et
// le drive habituel. Avec un seul drive allumé, l'écran est celui d'avant (`DriveSettings.spec.ts` le prouve en détail). Faux back qui suit les
// écritures, faux pont natif qui répond comme l'application ; valeurs inventées.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, bodyOf, calls, json, me, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import type { SentMessage } from '../bridge/__tests__/fakeNative'
import DriveSettingsView from '../DriveSettingsView.vue'

const LECLERC_STORE = {
  id: '123456',
  label: 'Ville-Test',
  baseUrl: 'https://exemple.leclercdrive.fr/magasin-123456-123456',
}
const OTHER_STORE = {
  id: '0b5f8a2e-3c1d-4e7f-9a6b-123456789abc',
  label: null,
  baseUrl: 'https://www.auchan.fr/',
}
type Store = { id: string; label: string | null; baseUrl: string }
type Id = 'leclerc' | 'auchan'
const NAMES = { leclerc: 'Leclerc', auchan: 'Auchan' } as const

const noContent = () => new Response(null, { status: 204 })

/** Un faux back à deux drives, qui se souvient de ce qu'on lui écrit. */
function fakeBack(initial: { leclerc?: Store | null; auchan?: Store | null; def?: Id | null }) {
  const state = {
    stores: { leclerc: initial.leclerc ?? null, auchan: initial.auchan ?? null } as Record<
      Id,
      Store | null
    >,
    def: initial.def ?? null,
    failDefault: false,
    failRemove: null as string | null,
  }
  const retailers = () =>
    (['leclerc', 'auchan'] as const).map((id) => ({
      retailer: id,
      name: NAMES[id],
      configured: state.stores[id] !== null,
      isDefault: state.def === id && state.stores[id] !== null,
      store: state.stores[id],
    }))
  const handlers = {
    'GET /api/v1/drive/settings': () => {
      const first = state.stores.leclerc ? 'leclerc' : 'auchan'

      return json({
        enabled: true,
        retailer: first,
        store: state.stores[first],
        retailers: retailers(),
        defaultRetailer: state.def,
        lastUsedRetailer: null,
        selection: { mode: 'ASK', retailer: first, candidates: [first] },
      })
    },
    'GET /api/v1/drive/choices': () => json({ member: [], totalItems: 0 }),
    'PUT /api/v1/drive/settings': async (request: Request) => {
      const body = (await request.clone().json()) as { retailer: Id; store: Store }
      state.stores[body.retailer] = body.store

      return noContent()
    },
    'PUT /api/v1/drive/default-retailer': async (request: Request) => {
      if (state.failDefault)
        return json({ error: { message: 'DRIVE_RETAILER_NOT_CONFIGURED' } }, { status: 422 })
      state.def = ((await request.clone().json()) as { retailer: Id | null }).retailer

      return noContent()
    },
    'DELETE /api/v1/drive/settings': (request: Request) => {
      if (state.failRemove !== null)
        return json({ error: { message: state.failRemove } }, { status: 404 })
      const id = new URL(request.url).searchParams.get('retailer') as Id
      state.stores[id] = null
      if (state.def === id) state.def = null

      return noContent()
    },
  }

  return { state, handlers }
}

/** `announce` : ce que l'application dit sous `app.info.retailers` (`undefined` : rien, une application d'avant). */
function appOf(announce: string[] | undefined, found?: (runId: string) => unknown) {
  return fakeNative((message: SentMessage, reply) => {
    if (message.type === 'app.info')
      reply({
        v: 1,
        type: 'app.info',
        version: '1.4.0',
        versionCode: 14,
        drive: true,
        ...(announce === undefined ? {} : { retailers: announce }),
      })
    if (message.type === 'drive.setup' && found !== undefined)
      setTimeout(() => reply(found(message.runId ?? '')), 10)
  })
}

async function open(
  back: ReturnType<typeof fakeBack>,
  native?: ReturnType<typeof appOf>,
  path = '/drive/reglages',
) {
  if (native !== undefined) Object.assign(globalThis, { repasNative: native.bridge })
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    ...back.handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push(path)
  const wrapper = mount(DriveSettingsView, {
    attachTo: document.body,
    global: { plugins: context.plugins },
  })
  await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))
  await flushPromises()

  return { wrapper, fetchMock }
}

type Wrapper = Awaited<ReturnType<typeof open>>['wrapper']
const button = (wrapper: Wrapper, name: string | RegExp) =>
  wrapper
    .findAll('button')
    .find((candidate) =>
      typeof name === 'string' ? candidate.text() === name : name.test(candidate.text()),
    )
const card = (wrapper: Wrapper, name: string) =>
  wrapper.findAll('li').find((candidate) => candidate.find('h3').text() === name)

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(globalThis, 'repasNative')
  document.body.innerHTML = ''
  window.dispatchEvent(new Event('online'))
})

describe('« Mes drives » : la liste', () => {
  it('avec un seul drive allumé, l’écran est celui d’avant (aucun mot de plus)', async () => {
    const back = fakeBack({ leclerc: LECLERC_STORE })
    const alone = {
      ...back.handlers,
      'GET /api/v1/drive/settings': () =>
        json({
          enabled: true,
          retailer: 'leclerc',
          store: LECLERC_STORE,
          retailers: [
            {
              retailer: 'leclerc',
              name: 'Leclerc',
              configured: true,
              isDefault: false,
              store: LECLERC_STORE,
            },
          ],
          defaultRetailer: null,
          lastUsedRetailer: null,
          selection: { mode: 'AUTO', retailer: 'leclerc', candidates: ['leclerc'] },
        }),
    }
    const { wrapper } = await open({ state: back.state, handlers: alone })

    expect(wrapper.find('#store-title').text()).toBe('Ton magasin')
    expect(wrapper.text()).toContain('Magasin …456')
    expect(wrapper.text()).not.toContain('Mes drives')
    expect(wrapper.text()).not.toContain('Mon drive habituel')
    expect(wrapper.text()).not.toContain('Retirer')
    expect(wrapper.findAll('li')).toHaveLength(0)
  })

  it('envoyé ici faute de magasin avec plusieurs drives : la question « Quel drive utilises-tu ? », un bouton « Choisir mon magasin » par drive (DRV-710)', async () => {
    const { wrapper } = await open(
      fakeBack({}),
      appOf(['leclerc', 'auchan']),
      '/drive/reglages?magasin=requis&retour=liste',
    )

    expect(wrapper.find('h1').text()).toBe('Choisis ton magasin')
    expect(wrapper.text()).toContain('Quel drive utilises-tu ?')
    expect(button(wrapper, 'Choisir mon magasin Leclerc')).toBeDefined()
    expect(button(wrapper, 'Choisir mon magasin Auchan')).toBeDefined()
    expect(wrapper.text()).not.toMatch(/enseigne|retailer/i)
  })

  it('deux drives dont un configuré : le magasin de l’un, « Choisir mon magasin » pour l’autre, pas de drive habituel', async () => {
    const { wrapper } = await open(
      fakeBack({ leclerc: LECLERC_STORE }),
      appOf(['leclerc', 'auchan']),
    )

    expect(wrapper.find('h2').text()).toBe('Mes drives')
    const configured = card(wrapper, 'Leclerc')
    expect(configured?.text()).toContain('Ville-Test')
    expect(configured?.text()).toContain('Ton magasin : …456')
    expect(button(wrapper, 'Changer de magasin')).toBeDefined()
    expect(button(wrapper, 'Retirer Leclerc')).toBeDefined()
    const other = card(wrapper, 'Auchan')
    expect(other?.text()).toContain('Aucun magasin enregistré.')
    expect(button(wrapper, 'Choisir mon magasin Auchan')).toBeDefined()
    expect(button(wrapper, 'Retirer Auchan')).toBeUndefined()
    expect(wrapper.text()).not.toContain('Mon drive habituel')
  })

  it('aucun texte ne dit « enseigne » ni « retailer »', async () => {
    const { wrapper } = await open(
      fakeBack({ leclerc: LECLERC_STORE, auchan: OTHER_STORE }),
      appOf(['leclerc', 'auchan']),
    )

    expect(wrapper.text()).not.toMatch(/enseigne|retailer|par défaut|préféré/i)
  })
})

describe('« Mon drive habituel »', () => {
  it('deux drives configurés : le choix apparaît, « Aucun » coché tant que rien n’est choisi', async () => {
    const { wrapper } = await open(
      fakeBack({ leclerc: LECLERC_STORE, auchan: OTHER_STORE }),
      appOf(['leclerc', 'auchan']),
    )

    const group = wrapper.find('fieldset')
    expect(group.find('legend').text()).toBe('Mon drive habituel')
    // Proposé d'avance à l'envoi (DRV-737), plus « utilisé sans rien demander »
    expect(group.text()).toContain('Repas te le propose d’avance quand tu envoies ta liste.')
    expect(group.text()).not.toContain('sans rien te demander')
    const radios = group.findAll('input[type="radio"]')
    expect(radios.map((radio) => (radio.element as HTMLInputElement).value)).toEqual([
      'leclerc',
      'auchan',
      '',
    ])
    expect((radios[2]!.element as HTMLInputElement).checked).toBe(true)
  })

  it('choisir un drive écrit PUT /drive/default-retailer, « Aucun » écrit null', async () => {
    const back = fakeBack({ leclerc: LECLERC_STORE, auchan: OTHER_STORE })
    const { wrapper, fetchMock } = await open(back, appOf(['leclerc', 'auchan']))
    const radios = () => wrapper.findAll('fieldset input[type="radio"]')

    await radios()[1]!.setValue(true)
    await vi.waitFor(() => expect(back.state.def).toBe('auchan'))
    await flushPromises()
    const index = fetchMock.mock.calls.findIndex(([input]) =>
      (input as Request).url.endsWith('/default-retailer'),
    )
    expect(await bodyOf(fetchMock, index)).toEqual({ retailer: 'auchan' })
    expect((radios()[1]!.element as HTMLInputElement).checked).toBe(true)

    await radios()[2]!.setValue(true)
    await vi.waitFor(() => expect(back.state.def).toBeNull())
    await flushPromises()
    const last = fetchMock.mock.calls
      .map(([input], position) => ({ input: input as Request, position }))
      .filter(({ input }) => input.url.endsWith('/default-retailer'))
      .pop()
    expect(await bodyOf(fetchMock, last!.position)).toEqual({ retailer: null })
    expect((radios()[2]!.element as HTMLInputElement).checked).toBe(true)
  })

  it('un refus du back remet le choix d’avant et le dit', async () => {
    const back = fakeBack({ leclerc: LECLERC_STORE, auchan: OTHER_STORE, def: 'leclerc' })
    back.state.failDefault = true
    const { wrapper } = await open(back, appOf(['leclerc', 'auchan']))

    await wrapper.findAll('fieldset input[type="radio"]')[1]!.setValue(true)
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    const radios = wrapper.findAll('fieldset input[type="radio"]')
    expect((radios[0]!.element as HTMLInputElement).checked).toBe(true)
    expect((radios[1]!.element as HTMLInputElement).checked).toBe(false)
  })
})

describe('« Retirer »', () => {
  it('demande confirmation, écrit DELETE ?retailer=, et le drive quitte la liste ; le drive habituel s’efface avec lui', async () => {
    const back = fakeBack({ leclerc: LECLERC_STORE, auchan: OTHER_STORE, def: 'auchan' })
    const { wrapper, fetchMock } = await open(back, appOf(['leclerc', 'auchan']))

    await button(wrapper, 'Retirer Auchan')?.trigger('click')
    await flushPromises()
    const dialog = document.body.querySelector('[role="dialog"], [role="alertdialog"]')
    expect(dialog?.textContent).toContain('Retirer Auchan ?')
    expect(dialog?.textContent).toContain('Tes produits habituels sont gardés')
    expect(calls(fetchMock)).not.toContain('DELETE /api/v1/drive/settings')

    const confirm = [...document.body.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Retirer Auchan' && dialog?.contains(candidate),
    )
    confirm?.click()
    await vi.waitFor(() => expect(calls(fetchMock)).toContain('DELETE /api/v1/drive/settings'))
    await flushPromises()

    const removed = fetchMock.mock.calls
      .map(([input]) => input as Request)
      .find((request) => request.method === 'DELETE')
    expect(new URL(removed!.url).searchParams.get('retailer')).toBe('auchan')
    expect(card(wrapper, 'Auchan')?.text()).toContain('Aucun magasin enregistré.')
    expect(back.state.def).toBeNull()
    expect(wrapper.text()).not.toContain('Mon drive habituel')
  })

  it('« Garder » ne retire rien', async () => {
    const back = fakeBack({ leclerc: LECLERC_STORE, auchan: OTHER_STORE })
    const { wrapper, fetchMock } = await open(back, appOf(['leclerc', 'auchan']))

    await button(wrapper, 'Retirer Leclerc')?.trigger('click')
    await flushPromises()
    const keep = [...document.body.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Garder Leclerc',
    )
    keep?.click()
    await flushPromises()

    expect(calls(fetchMock)).not.toContain('DELETE /api/v1/drive/settings')
    expect(back.state.stores.leclerc).not.toBeNull()
  })

  it('un drive déjà retiré ailleurs (DRIVE_SETTINGS_NOT_FOUND) : l’écran se relit, sans erreur', async () => {
    const back = fakeBack({ leclerc: LECLERC_STORE, auchan: OTHER_STORE })
    back.state.failRemove = 'DRIVE_SETTINGS_NOT_FOUND'
    const { wrapper, fetchMock } = await open(back, appOf(['leclerc', 'auchan']))

    await button(wrapper, 'Retirer Leclerc')?.trigger('click')
    await flushPromises()
    ;[...document.body.querySelectorAll('button')]
      .find(
        (candidate) => candidate.textContent === 'Retirer Leclerc' && candidate.closest('[role]'),
      )
      ?.click()
    await vi.waitFor(() => expect(calls(fetchMock)).toContain('DELETE /api/v1/drive/settings'))
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('ajouter un drive : la lecture du magasin par l’application', () => {
  const found = (runId: string) => ({
    v: 1,
    type: 'drive.result',
    result: {
      v: 1,
      type: 'setup-result',
      runId,
      agentVersion: '1.0.0',
      store: {
        id: OTHER_STORE.id,
        host: 'www.auchan.fr',
        baseUrl: OTHER_STORE.baseUrl,
        label: null,
      },
    },
  })

  it('envoie drive.setup pour le drive touché, puis enregistre son magasin chez lui', async () => {
    const back = fakeBack({ leclerc: LECLERC_STORE })
    const native = appOf(['leclerc', 'auchan'], found)
    const { wrapper, fetchMock } = await open(back, native)

    await button(wrapper, 'Choisir mon magasin Auchan')?.trigger('click')
    await vi.waitFor(() => expect(back.state.stores.auchan).not.toBeNull())
    await flushPromises()

    const setup = native.sent.find((message) => message.type === 'drive.setup')
    expect(setup?.retailer).toBe('auchan')
    const index = fetchMock.mock.calls.findIndex(
      ([input]) =>
        (input as Request).method === 'PUT' && (input as Request).url.endsWith('/drive/settings'),
    )
    expect(await bodyOf(fetchMock, index)).toEqual({
      retailer: 'auchan',
      store: { id: OTHER_STORE.id, baseUrl: OTHER_STORE.baseUrl, label: null },
    })
    expect(card(wrapper, 'Auchan')?.text()).toContain('Magasin …abc enregistré.')
    // Deux drives configurés : le choix du drive habituel apparaît
    expect(wrapper.text()).toContain('Mon drive habituel')
  })

  it('pendant la lecture, seul ce drive est « en cours » : les autres boutons ne bougent pas, aucun second message', async () => {
    const back = fakeBack({ leclerc: LECLERC_STORE })
    const native = appOf(['leclerc', 'auchan'])
    const { wrapper } = await open(back, native)

    await button(wrapper, 'Choisir mon magasin Auchan')?.trigger('click')
    await flushPromises()

    expect(button(wrapper, 'Choisir mon magasin Auchan')?.attributes('aria-busy')).toBe('true')
    expect(button(wrapper, 'Changer de magasin')?.attributes('aria-busy')).toBeUndefined()
    expect(button(wrapper, 'Changer de magasin')?.attributes('disabled')).toBeDefined()
    await button(wrapper, 'Changer de magasin')?.trigger('click')
    expect(native.sent.filter((message) => message.type === 'drive.setup')).toHaveLength(1)
    // La lecture se termine (le pont du module garde la lecture en cours d'un test à l'autre)
    const runId = native.sent.find((message) => message.type === 'drive.setup')?.runId ?? ''
    native.reply({
      v: 1,
      type: 'drive.result',
      result: {
        v: 1,
        type: 'setup-result',
        runId,
        agentVersion: '1.0.0',
        store: {
          id: OTHER_STORE.id,
          host: 'www.auchan.fr',
          baseUrl: OTHER_STORE.baseUrl,
          label: null,
        },
      },
    })
    await vi.waitFor(() => expect(button(wrapper, 'Choisir mon magasin Auchan')).toBeUndefined())
  })

  it('une application qui ne connaît pas ce drive : la phrase de mise à jour remplace le bouton', async () => {
    const { wrapper } = await open(fakeBack({ leclerc: LECLERC_STORE }), appOf(undefined))

    expect(wrapper.text()).toContain('Mets à jour l’application pour ajouter Auchan.')
    expect(button(wrapper, 'Choisir mon magasin Auchan')).toBeUndefined()
    // Le drive d’avant reste servi
    expect(button(wrapper, 'Changer de magasin')).toBeDefined()
  })

  it('une application qui annonce seulement le drive d’avant : même phrase', async () => {
    const { wrapper } = await open(fakeBack({ leclerc: LECLERC_STORE }), appOf(['leclerc']))

    expect(wrapper.text()).toContain('Mets à jour l’application pour ajouter Auchan.')
    expect(button(wrapper, 'Choisir mon magasin Auchan')).toBeUndefined()
  })

  it('dans un navigateur : la phrase « ouvre Repas dans l’application » pour un magasin que l’application seule lit, rien d’autre à lire', async () => {
    const { wrapper } = await open(fakeBack({ leclerc: LECLERC_STORE }))

    expect(card(wrapper, 'Auchan')?.text()).toContain(
      'Pour choisir ce magasin, ouvre Repas dans l’application.',
    )
    expect(button(wrapper, 'Choisir mon magasin Auchan')).toBeUndefined()
    // La saisie à la main reste pour le drive dont l’adresse se colle
    expect(card(wrapper, 'Leclerc')?.find('details').exists()).toBe(true)
    expect(card(wrapper, 'Auchan')?.find('details').exists()).toBe(false)
  })

  it('une application d’avant, un seul drive à lire : le message est celui d’avant (sans retailer)', async () => {
    const back = fakeBack({ leclerc: LECLERC_STORE })
    const native = appOf(undefined, (runId) => ({
      v: 1,
      type: 'drive.result',
      result: {
        v: 1,
        type: 'setup-result',
        runId,
        agentVersion: '1.0.0',
        store: {
          id: '123456',
          host: 'exemple.leclercdrive.fr',
          baseUrl: LECLERC_STORE.baseUrl,
          label: null,
        },
      },
    }))
    const { wrapper } = await open(back, native)

    await button(wrapper, 'Changer de magasin')?.trigger('click')
    await vi.waitFor(() =>
      expect(native.sent.some((message) => message.type === 'drive.setup')).toBe(true),
    )

    expect(native.sent.find((message) => message.type === 'drive.setup')).toEqual({
      v: 1,
      type: 'drive.setup',
      runId: expect.any(String),
    })
  })
})
