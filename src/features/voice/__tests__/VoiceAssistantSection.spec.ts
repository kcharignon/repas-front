import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import { useNotificationsStore } from '@/notifications/store'
import { useSessionStore } from '@/session/session'
import AccountView from '@/views/AccountView.vue'
import VoiceAssistantSection from '../VoiceAssistantSection.vue'
import { ALEXA_SKILL_NAME } from '../skill'

const links = 'GET /api/v1/voice/links'
const unlink = (id: string) => `DELETE /api/v1/voice/links/${id}`
const link = {
  id: 'l1',
  provider: 'alexa',
  createdAt: '2026-10-25T10:00:00+00:00',
  lastUsedAt: null,
}
const disabled = () => json({ error: { message: 'VOICE_DISABLED' } }, { status: 404 })

async function open(handlers: Parameters<typeof stubApi>[0], view = VoiceAssistantSection) {
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  const wrapper = mount(view, {
    global: { plugins: context.plugins },
    attachTo: document.body,
  })
  await flushPromises()

  return { wrapper, context, fetchMock }
}

const body = () => document.body.textContent ?? ''

describe('section « Assistant vocal » de « Moi »', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('le nom du skill vient d’une seule constante', () => {
    expect(ALEXA_SKILL_NAME).toBe('Jarvis')
  })

  it('est invisible quand la fonction est coupée (404 VOICE_DISABLED), sans erreur', async () => {
    const { wrapper, fetchMock } = await open({ [links]: disabled })

    expect(wrapper.find('section').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
    expect(calls(fetchMock).filter((call) => call === links)).toHaveLength(1)
    expect(useNotificationsStore().items).toEqual([])
  })

  it('ne redemande pas une fonction coupée quand « Moi » se rouvre ou reprend le focus', async () => {
    const { wrapper, context, fetchMock } = await open({ [links]: disabled })
    wrapper.unmount()

    mount(VoiceAssistantSection, { global: { plugins: context.plugins } })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()

    expect(calls(fetchMock).filter((call) => call === links)).toHaveLength(1)
  })

  it('est invisible quand la lecture échoue', async () => {
    const { wrapper } = await open({
      [links]: () => json({ error: { message: 'x' } }, { status: 500 }),
    })

    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('sans liaison : dit où lier Alexa, avec le nom du skill, et la ligne d’aide', async () => {
    const { wrapper } = await open({ [links]: () => json({ member: [], totalItems: 0 }) })

    expect(wrapper.find('h2').text()).toBe('Assistant vocal')
    expect(wrapper.findAll('p').map((p) => p.text())).toEqual([
      'Pour lier Alexa, ouvre l’application Alexa, Skills, Jarvis.',
      'Alexa ne voit pas ta liste de courses d’Amazon : dis bien le nom du skill.',
    ])
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('avec une liaison : donne la phrase à dire et propose « Délier Alexa »', async () => {
    const { wrapper } = await open({ [links]: () => json({ member: [link], totalItems: 1 }) })

    expect(wrapper.findAll('p').map((p) => p.text())).toEqual([
      'Alexa est liée. Dis : « Alexa, demande à Jarvis d’ajouter du pain ».',
      'Alexa ne voit pas ta liste de courses d’Amazon : dis bien le nom du skill.',
    ])
    expect(wrapper.find('button').text()).toBe('Délier Alexa')
  })

  it('« Délier » demande confirmation, puis supprime et revient à « aucune liaison » sans recharger', async () => {
    let remaining = [link]
    const { wrapper, fetchMock } = await open({
      [links]: () => json({ member: remaining, totalItems: remaining.length }),
      [unlink('l1')]: () => {
        remaining = []

        return new Response(null, { status: 204 })
      },
    })

    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(body()).toContain('Délier Alexa ?')
    expect(calls(fetchMock)).not.toContain(unlink('l1'))

    const confirm = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Délier',
    )!
    confirm.click()
    await flushPromises()

    expect(calls(fetchMock)).toContain(unlink('l1'))
    expect(wrapper.text()).toContain('Pour lier Alexa, ouvre l’application Alexa, Skills, Jarvis.')
    expect(wrapper.text()).not.toContain('Alexa est liée')
    expect(body()).not.toContain('Délier Alexa ?')
  })

  it('« Annuler » dans la confirmation ne supprime rien', async () => {
    const { wrapper, fetchMock } = await open({
      [links]: () => json({ member: [link], totalItems: 1 }),
    })

    await wrapper.find('button').trigger('click')
    await flushPromises()
    const cancel = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Annuler',
    )!
    cancel.click()
    await flushPromises()

    expect(calls(fetchMock).filter((call) => call.startsWith('DELETE'))).toEqual([])
    expect(wrapper.text()).toContain('Alexa est liée')
  })

  it('délie toutes les liaisons listées', async () => {
    const second = { ...link, id: 'l2' }
    const { wrapper, fetchMock } = await open({
      [links]: () => json({ member: [link, second], totalItems: 2 }),
      [unlink('l1')]: () => new Response(null, { status: 204 }),
      [unlink('l2')]: () => new Response(null, { status: 204 }),
    })

    await wrapper.find('button').trigger('click')
    await flushPromises()
    ;[...document.body.querySelectorAll('button')]
      .find((button) => button.textContent === 'Délier')!
      .click()
    await flushPromises()

    expect(
      calls(fetchMock)
        .filter((call) => call.startsWith('DELETE'))
        .sort(),
    ).toEqual([unlink('l1'), unlink('l2')])
  })

  it('un refus du back à la suppression est dit, la liaison reste affichée', async () => {
    const { wrapper } = await open({
      [links]: () => json({ member: [link], totalItems: 1 }),
      [unlink('l1')]: () => json({ error: { message: 'Forbidden' } }, { status: 403 }),
    })

    await wrapper.find('button').trigger('click')
    await flushPromises()
    ;[...document.body.querySelectorAll('button')]
      .find((button) => button.textContent === 'Délier')!
      .click()
    await flushPromises()

    expect(useNotificationsStore().items.map((item) => item.text)).toEqual([
      "Tu n'as pas le droit de faire cela.",
    ])
    expect(wrapper.text()).toContain('Alexa est liée')
  })

  it('apparaît dans « Moi » quand la fonction est allumée', async () => {
    const { wrapper } = await open(
      {
        [links]: () => json({ member: [], totalItems: 0 }),
        'GET /api/v1/drive/settings': () => json({ enabled: false }),
      },
      AccountView as never,
    )

    expect(wrapper.text()).toContain('Assistant vocal')
  })
})
