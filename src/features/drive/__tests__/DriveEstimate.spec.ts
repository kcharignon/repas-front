import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import { appContext, calls, json, me, rateLimited, stubApi } from '@/__tests__/helpers'
import { useSessionStore } from '@/session/session'
import DriveEstimate from '../DriveEstimate.vue'
import { disclaimer, estimate } from './estimateFixtures'

type Handlers = Parameters<typeof stubApi>[0]

const store = {
  id: '123456',
  label: null,
  baseUrl: 'https://courses-test.leclercdrive.fr/magasin-123456-123456',
}
const settings =
  (enabled = true, withStore = true) =>
  () =>
    json({ enabled, retailer: 'leclerc', store: withStore ? store : null })
const failure = (status: number, message: string) => () => json({ error: { message } }, { status })
// Les espaces de la mise en forme française sont insécables : on les compare en espaces ordinaires
const plain = (text: string) => text.replace(/\s+/g, ' ').trim()

async function open(handlers: Handlers = {}) {
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(me),
    'GET /api/v1/drive/settings': settings(),
    'GET /api/v1/drive/estimates/l1': () => json(estimate()),
    ...handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  await context.router.push('/liste')
  const wrapper = mount(DriveEstimate, {
    props: { listId: 'l1' },
    global: { plugins: context.plugins },
  })
  await flushPromises()

  return { wrapper, fetchMock }
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.dispatchEvent(new Event('online'))
})

describe('bloc « Estimation du coût »', () => {
  it('donne le total en euros, la couverture, les dates et l’avertissement du back', async () => {
    const { wrapper, fetchMock } = await open()

    expect(wrapper.find('h2').text()).toBe('Estimation du coût')
    expect(plain(wrapper.find('dt').text())).toBe('Total estimé')
    expect(plain(wrapper.find('dd').text())).toBe('12,47 €')
    expect(wrapper.text()).toContain('8 articles sur 12 estimés')
    expect(wrapper.text()).toContain('4 articles ne sont pas dans le total.')
    expect(wrapper.text()).toContain(
      'D’après les prix vus entre le 12 octobre 2026 et le 18 octobre 2026.',
    )
    expect(wrapper.text()).toContain(disclaimer)
    expect(wrapper.find('[data-testid="low-coverage"]').exists()).toBe(false)
    expect(calls(fetchMock)).toContain('GET /api/v1/drive/estimates/l1')
  })

  it('une seule date quand tous les prix datent du même jour', async () => {
    const { wrapper } = await open({
      'GET /api/v1/drive/estimates/l1': () =>
        json(estimate({ newestPriceAt: '2026-10-12T18:00:00+02:00' })),
    })

    expect(wrapper.text()).toContain('D’après les prix vus le 12 octobre 2026.')
    expect(wrapper.text()).not.toContain('entre le')
  })

  it('le détail est replié et range les lignes : non estimées d’abord, jamais devinées', async () => {
    const { wrapper } = await open()

    const details = wrapper.find('details')
    expect(details.element.hasAttribute('open')).toBe(false)
    expect(details.find('summary').text()).toBe('Voir le détail (13 articles)')
    expect(details.findAll('h3').map((title) => title.text())).toEqual([
      'Non estimées (4)',
      'Estimées (8)',
      'J’en ai toujours (1)',
    ])
    const lines = details.findAll('li').map((line) => plain(line.text()))
    expect(lines[0]).toContain('Curry')
    expect(lines[0]).toContain('pas de produit choisi')
    expect(lines[1]).toContain('Moutarde de test 200 g')
    expect(lines[1]).toContain('pas de prix connu')
    expect(lines[3]).toContain('Thym de test 20 g')
    expect(lines[3]).toContain('1,50 €')
    expect(lines[3]).toContain('à vérifier')
    expect(lines[3]).not.toContain('×')
    // Une ligne estimée : produit, nombre × prix unitaire, date du prix, sous-total, statut
    const milk = lines.find((line) => line.startsWith('Lait')) ?? ''
    expect(milk).toContain('Lait demi-écrémé 1 L')
    expect(milk).toContain('2 × 0,99 €')
    expect(milk).toContain('prix vu le 12 octobre 2026')
    expect(milk).toContain('1,98 €')
    expect(milk).toContain('estimée')
    expect(lines[lines.length - 1]).toContain('Sel')
    expect(lines[lines.length - 1]).toContain('j’en ai toujours')
    expect(details.text()).toContain('Repas ne devine jamais un prix')
  })

  it('en tête, prévient quand la couverture est faible', async () => {
    const { wrapper } = await open({
      'GET /api/v1/drive/estimates/l1': () =>
        json(estimate({ estimatedLines: 5, unestimatedLines: 7, coverage: 0.4167 })),
    })

    expect(wrapper.find('[data-testid="low-coverage"]').text()).toContain(
      'moins de la moitié des articles ont un prix connu',
    )
    expect(wrapper.find('section > :nth-child(2)').attributes('data-testid')).toBe('low-coverage')
  })

  it('sans aucun prix connu : pas de total à 0 euro', async () => {
    const { wrapper } = await open({
      'GET /api/v1/drive/estimates/l1': () =>
        json(
          estimate({
            estimatedTotalCents: 0,
            estimatedLines: 0,
            unestimatedLines: 12,
            coverage: 0,
            oldestPriceAt: null,
            newestPriceAt: null,
            lines: estimate().lines.filter((line) => line.status !== 'ESTIMATED'),
          }),
        ),
    })

    expect(wrapper.find('dl').exists()).toBe(false)
    expect(wrapper.text()).toContain('Aucun prix connu pour le moment')
    expect(wrapper.text()).toContain('0 articles sur 12 estimés')
    expect(wrapper.text()).not.toContain('D’après les prix vus')
    expect(wrapper.find('[data-testid="low-coverage"]').exists()).toBe(true)
  })

  it('rien à acheter : le dit, sans total', async () => {
    const { wrapper } = await open({
      'GET /api/v1/drive/estimates/l1': () =>
        json(
          estimate({
            estimatedTotalCents: 0,
            estimatedLines: 0,
            unestimatedLines: 0,
            coverage: 0,
            oldestPriceAt: null,
            newestPriceAt: null,
            lines: [],
          }),
        ),
    })

    expect(wrapper.text()).toContain('Rien à estimer')
    expect(wrapper.find('dl').exists()).toBe(false)
    expect(wrapper.find('details').exists()).toBe(false)
    expect(wrapper.text()).toContain(disclaimer)
  })

  it('un seul article non estimé : accord au singulier', async () => {
    const { wrapper } = await open({
      'GET /api/v1/drive/estimates/l1': () =>
        json(estimate({ estimatedLines: 11, unestimatedLines: 1, coverage: 0.9167 })),
    })

    expect(wrapper.text()).toContain('1 article n’est pas dans le total.')
  })

  it('affiche le chargement tant que l’estimation arrive', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { wrapper } = await open({
      'GET /api/v1/drive/estimates/l1': async () => {
        await gate

        return json(estimate())
      },
    })

    expect(wrapper.find('[role="status"]').text()).toBe('Calcul de l’estimation…')
    release()
    await flushPromises()
    expect(wrapper.find('dd').exists()).toBe(true)
  })

  it('une panne du back : message et nouvel essai', async () => {
    let attempts = 0
    const { wrapper } = await open({
      'GET /api/v1/drive/estimates/l1': () =>
        ++attempts === 1 ? failure(500, 'boom')() : json(estimate()),
    })

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'L’estimation n’est pas disponible pour le moment.',
    )
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(plain(wrapper.find('dd').text())).toBe('12,47 €')
  })

  it('trop de lectures (429) : le dit comme un refus passager, sans relire tout seul, puis réessaie à la demande', async () => {
    let limited = true
    const { wrapper, fetchMock } = await open({
      'GET /api/v1/drive/estimates/l1': () => (limited ? rateLimited(1)() : json(estimate())),
    })

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Trop de demandes en peu de temps. Rien n’est perdu. Attendez une minute, puis réessayez.',
    )
    // L'écran n'insiste pas : une seule lecture tant que l'utilisateur ne redemande rien
    await flushPromises()
    expect(calls(fetchMock).filter((call) => call.includes('/drive/estimates/'))).toHaveLength(1)

    limited = false
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(plain(wrapper.find('dd').text())).toBe('12,47 €')
  })

  it('magasin non enregistré (409) : mène aux réglages du drive', async () => {
    const { wrapper } = await open({
      'GET /api/v1/drive/estimates/l1': failure(409, 'DRIVE_NOT_CONFIGURED'),
    })

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Choisissez d’abord votre magasin dans les réglages du drive.',
    )
    expect(wrapper.find('a').attributes('href')).toBe('/drive/reglages')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it.each([
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
  ])('refus ou liste inconnue (%i) : estimation indisponible', async (status, code) => {
    const { wrapper } = await open({ 'GET /api/v1/drive/estimates/l1': failure(status, code) })

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'L’estimation n’est pas disponible pour le moment.',
    )
  })

  it('le drive coupé (404 DRIVE_DISABLED) : le bloc disparaît', async () => {
    const { wrapper } = await open({
      'GET /api/v1/drive/estimates/l1': failure(404, 'DRIVE_DISABLED'),
    })

    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('drive éteint : pas de bloc, pas d’appel', async () => {
    const { wrapper, fetchMock } = await open({ 'GET /api/v1/drive/settings': settings(false) })

    expect(wrapper.find('section').exists()).toBe(false)
    expect(calls(fetchMock)).not.toContain('GET /api/v1/drive/estimates/l1')
  })

  it('drive allumé mais magasin non enregistré : pas de bloc, pas d’appel', async () => {
    const { wrapper, fetchMock } = await open({
      'GET /api/v1/drive/settings': settings(true, false),
    })

    expect(wrapper.find('section').exists()).toBe(false)
    expect(calls(fetchMock)).not.toContain('GET /api/v1/drive/estimates/l1')
  })

  it('réglages illisibles : pas de bloc', async () => {
    const { wrapper } = await open({ 'GET /api/v1/drive/settings': failure(500, 'boom') })

    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('hors connexion et sans estimation déjà lue : pas de bloc', async () => {
    window.dispatchEvent(new Event('offline'))
    const { wrapper } = await open({
      'GET /api/v1/drive/estimates/l1': () => {
        throw new TypeError('Failed to fetch')
      },
    })

    expect(wrapper.find('section').exists()).toBe(false)
  })
})
