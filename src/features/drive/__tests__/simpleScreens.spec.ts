// Non-régression de DRV-622 : l'écran de l'envoi et le récapitulatif tiennent en une phrase. Sur chaque variante (terminé, partiel, arrêté,
// erreur) : aucun compteur à zéro, aucun code visible, un seul bouton principal, aucune phrase de plus de 20 mots. Données SYNTHÉTIQUES.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { ResultLine } from '@drive-protocol'

import { appContext, calls, json, me, stubApi } from '@/__tests__/helpers'
import fr from '@/i18n/fr'
import { WARNING_WORDS } from '@/i18n/__tests__/warningWords'
import { useSessionStore } from '@/session/session'
import { DRAFT_KEY } from '../bridge'
import type { DriveEvent } from '../bridge'
import { fakeNative } from '../bridge/__tests__/fakeNative'
import DriveReturnView from '../DriveReturnView.vue'
import DriveSendView from '../DriveSendView.vue'
import { useDriveReturnStore } from '../returnStore'
import { sendSummary } from '../sendSummary'
import { t } from './retailerT'
import { plan, storeBaseUrl } from './fixtures'
import { result, RUN } from './results'

const MAX_WORDS = 20

/** Les phrases d'un texte : on coupe à chaque ligne et après « . », « ! » ou « ? » ; un deux-points ou une virgule ne finit pas une phrase. */
const sentencesOf = (text: string): string[] =>
  text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '')

/** Les mots d'une phrase : ce qui est séparé par une espace et porte au moins une lettre ou un chiffre (« : » et « · » n'en sont pas). */
const wordsOf = (sentence: string): string[] =>
  sentence.split(/\s+/).filter((word) => /[\p{L}\d]/u.test(word))

const tooLong = (where: string, text: string): string[] =>
  sentencesOf(text)
    .filter((sentence) => wordsOf(sentence).length > MAX_WORDS)
    .map((sentence) => `${where} : ${wordsOf(sentence).length} mots dans « ${sentence} »`)

/** Un code visible : une constante en majuscules avec un tiret bas (« NOT_LOGGED_IN »), ou le mot « Code : ». */
const CODE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\bCode\s*:/

/**
 * Ce que l'utilisateur lit sans rien déplier : le texte de `main` sans le contenu des blocs repliés (`details`), un morceau par ligne
 * (chaque titre, bouton, compteur ou paragraphe commence la sienne).
 */
function visibleText(main: Element): string {
  const clone = main.cloneNode(true) as Element
  clone.querySelectorAll('details').forEach((element) => element.remove())
  const lines: string[] = []
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const line = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (line !== '') lines.push(line)
  }

  return lines.join('\n')
}

/** Les boutons et liens qui portent le style du bouton principal. */
const primaries = (main: Element) =>
  [...main.querySelectorAll('a, button')].filter((item) =>
    /(^|\s)bg-primary(\s|$)/.test(item.className),
  )

describe('les textes de l’envoi et du récapitulatif : phrases courtes (20 mots au plus)', () => {
  const groups = ['driveSend', 'driveReturn', 'errors'] as const

  function flatten(value: unknown, path: string, out: { where: string; text: string }[]) {
    if (typeof value === 'string') out.push({ where: path, text: value })
    else if (typeof value === 'object' && value !== null)
      for (const [key, child] of Object.entries(value)) flatten(child, `${path}.${key}`, out)
  }

  it('aucune phrase de plus de 20 mots', () => {
    const entries: { where: string; text: string }[] = []
    for (const group of groups) flatten(fr[group], group, entries)
    // Les formes d'un pluriel (« 1 article | 2 articles ») sont des phrases à part
    const found = entries.flatMap(({ where, text }) =>
      text.split(' | ').flatMap((part) => tooLong(`fr.ts ${where}`, part)),
    )

    expect(entries.length).toBeGreaterThan(100)
    expect(found).toEqual([])
  })

  it('compte les mots comme un lecteur : les signes seuls (« : », « · ») n’en sont pas', () => {
    expect(wordsOf('6 articles : 2 sont déjà choisis, 4 sont à choisir sur Leclerc.')).toHaveLength(
      12,
    )
    expect(tooLong('essai', 'Une phrase. ' + 'mot '.repeat(21) + '.')).toHaveLength(1)
  })
})

describe('la phrase de synthèse de l’envoi', () => {
  // t : le registre donne le nom de l'enseigne (retailerT.ts)

  it('dit les comptes en une phrase, sans jamais écrire un zéro', () => {
    expect(sendSummary(t, { known: 2, new: 4, haveAtHome: 0, skipped: 0 })).toBe(
      '6 articles : 2 sont déjà choisis, 4 sont à choisir sur Leclerc.',
    )
    expect(sendSummary(t, { known: 1, new: 0, haveAtHome: 0, skipped: 0 })).toBe(
      '1 article : il est déjà choisi.',
    )
    expect(sendSummary(t, { known: 0, new: 3, haveAtHome: 0, skipped: 0 })).toBe(
      '3 articles : tous sont à choisir sur Leclerc.',
    )
    expect(sendSummary(t, { known: 3, new: 1, haveAtHome: 1, skipped: 1 })).toBe(
      '6 articles : 3 sont déjà choisis, 1 est à choisir sur Leclerc, 2 ne seront pas mis au panier.',
    )
    expect(sendSummary(t, { known: 0, new: 0, haveAtHome: 0, skipped: 0 })).toBe('')
    for (const counts of [
      { known: 2, new: 4, haveAtHome: 0, skipped: 0 },
      { known: 0, new: 3, haveAtHome: 2, skipped: 0 },
      { known: 3, new: 1, haveAtHome: 0, skipped: 2 },
    ])
      expect(sendSummary(t, counts)).not.toMatch(/(^|\D)0(\D|$)/)
  })

  it('reste sous 20 mots même avec tous les états et un grand nombre d’articles', () => {
    const worst = sendSummary(t, { known: 40, new: 30, haveAtHome: 15, skipped: 15 })

    expect(worst).toBe(
      '100 articles : 40 sont déjà choisis, 30 sont à choisir sur Leclerc, 30 ne seront pas mis au panier.',
    )
    expect(tooLong('synthèse', worst)).toEqual([])
  })
})

describe('l’écran de l’envoi : une décision', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    delete (globalThis as { repasNative?: unknown }).repasNative
    document.body.innerHTML = ''
    localStorage.clear()
  })

  async function openSend() {
    const native = fakeNative((message, reply) => {
      if (message.type === 'app.info')
        reply({ v: 1, type: 'app.info', version: '1.0.0', versionCode: 1, drive: true })
    })
    ;(globalThis as { repasNative?: unknown }).repasNative = native.bridge
    stubApi({
      'POST /api/auth/refresh': () => json({ token: 'jeton' }),
      'GET /api/v1/me': () => json(me),
      'GET /api/v1/drive/plans/l1': () => json(plan()),
    })
    localStorage.setItem('repas.session', '1')
    const context = appContext()
    await useSessionStore().restore()
    await context.router.push('/drive/envoi/l1')
    const wrapper = mount(DriveSendView, {
      attachTo: document.body,
      global: { plugins: context.plugins },
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Magasin'))

    return wrapper
  }

  it('un titre, une phrase de synthèse, une phrase d’explication, un seul bouton principal, la liste repliée, aucun compteur', async () => {
    const wrapper = await openSend()
    const main = wrapper.find('main').element

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.find('dl').exists()).toBe(false)
    expect(main.textContent).not.toMatch(/\b0\b/)
    expect(wrapper.find('details > summary').text()).toBe('Voir les articles')
    expect(primaries(main).map((item) => item.textContent.trim())).toEqual(['Remplir mon panier'])
    // Le bouton vient avant la liste : visible sans défiler (la mise en page est mesurée dans le test visuel)
    const order = [...main.querySelectorAll('button, summary')].map((item) =>
      item.textContent.trim(),
    )
    expect(order.indexOf('Remplir mon panier')).toBeLessThan(order.indexOf('Voir les articles'))
    expect(tooLong('envoi', visibleText(main))).toEqual([])
    expect(CODE.test(visibleText(main))).toBe(false)
  })

  it('ne contient ni mise en garde ni rassurance ni explication : le titre, la synthèse, le bouton (DRV-628)', async () => {
    const wrapper = await openSend()
    const main = wrapper.find('main').element

    // Tout le texte, liste dépliée comprise : aucun mot d'avertissement
    expect(main.textContent).not.toMatch(WARNING_WORDS)
    expect(wrapper.text()).not.toContain('va se remplir')
    // Ce qui est lu sans rien déplier : le magasin et UNE phrase de synthèse, puis le bouton
    expect(wrapper.findAll('main > section > p, main > p').map((p) => p.text())).toEqual([
      'Magasin …456',
      '12 articles : 8 sont déjà choisis, 3 sont à choisir sur Leclerc, 1 ne sera pas mis au panier.',
    ])
  })
})

describe('le récapitulatif : aucun compteur à zéro, aucun code visible, un seul bouton principal', () => {
  const draft = {
    runId: RUN,
    listId: 'l1',
    retailer: 'leclerc' as const,
    startedAt: new Date().toISOString(),
  }
  const farine: ResultLine = {
    ingredientSlug: 'farine',
    outcome: 'ADDED',
    productId: '123456',
    quantity: 1,
    usedRank: 1,
  }

  const variants: [string, DriveEvent | null][] = [
    ['terminé', { kind: 'result', draft, result: result() }],
    [
      'terminé, une seule sorte de ligne',
      { kind: 'result', draft, result: result({ lines: [farine] }) },
    ],
    [
      'partiel (Leclerc ralentit)',
      {
        kind: 'result',
        draft,
        result: result({
          outcome: 'partial',
          lines: [
            farine,
            { ingredientSlug: 'beurre', outcome: 'FAILED', error: 'BLOCKED' },
            { ingredientSlug: 'lait', outcome: 'UNAVAILABLE' },
          ],
          error: { code: 'BLOCKED', message: 'Trop de demandes' },
        }),
      },
    ],
    [
      'partiel (sans code)',
      {
        kind: 'result',
        draft,
        result: result({
          outcome: 'partial',
          lines: [farine, { ingredientSlug: 'beurre', outcome: 'FAILED', error: 'NETWORK' }],
        }),
      },
    ],
    ['arrêté', { kind: 'result', draft, result: result({ outcome: 'aborted', lines: [farine] }) }],
    [
      'arrêté (annulé)',
      {
        kind: 'result',
        draft,
        result: result({
          outcome: 'aborted',
          lines: [],
          error: { code: 'CANCELLED', message: 'Envoi annulé' },
        }),
      },
    ],
    ...(
      [
        'NOT_LOGGED_IN',
        'STORE_MISMATCH',
        'BLOCKED',
        'CONTRACT_CHANGED',
        'NETWORK',
        'INVALID_MESSAGE',
        'UNSUPPORTED_PAGE',
      ] as const
    ).map((code): [string, DriveEvent] => [
      `erreur ${code}`,
      {
        kind: 'result',
        draft,
        result: result({
          outcome: 'error',
          lines: [],
          error: { code, message: 'Le site a changé (SEARCH_NO_STATE)' },
        }),
      },
    ]),
    ['refus de l’application', { kind: 'refused', code: 'UNAVAILABLE', runId: RUN }],
    ['réponse mal formée', { kind: 'invalid', detail: 'lines[0]' }],
    ['résultat d’un autre envoi', { kind: 'stale', result: result({ runId: 'autre' }) }],
    ['rien à montrer', null],
  ]

  beforeEach(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)))
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    localStorage.clear()
    useDriveReturnStore().clear()
  })

  async function open(event: DriveEvent | null) {
    const fetchMock = stubApi({
      'POST /api/auth/refresh': () => json({ token: 'jeton' }),
      'GET /api/v1/me': () => json(me),
      'GET /api/v1/drive/plans/l1': () => json(plan()),
      'GET /api/v1/shopping-lists/l1': () => json({ id: 'l1', version: 7 }),
      'GET /api/v1/drive/settings': () =>
        json({
          enabled: true,
          retailer: 'leclerc',
          store: { id: '123456', label: null, baseUrl: storeBaseUrl },
        }),
      'PUT /api/v1/drive/choices': () => new Response(null, { status: 204 }),
    })
    localStorage.setItem('repas.session', '1')
    const context = appContext()
    await useSessionStore().restore()
    if (event !== null) useDriveReturnStore().receive(event)
    await context.router.push('/drive/retour')
    const wrapper = mount(DriveReturnView, {
      attachTo: document.body,
      global: { plugins: context.plugins },
    })
    await vi.waitFor(() => expect(wrapper.find('h1').exists()).toBe(true))
    // Un résultat s'enregistre d'abord ; la page du panier est tirée des réglages : l'action principale d'un panier rempli attend qu'ils soient lus
    const isResult = event?.kind === 'result'
    await vi.waitFor(() => expect(!isResult || useDriveReturnStore().status === 'saved').toBe(true))
    await vi.waitFor(() =>
      expect(!isResult || calls(fetchMock).includes('GET /api/v1/drive/settings')).toBe(true),
    )
    await flushPromises()

    return wrapper
  }

  it.each(variants)('%s', async (_name, event) => {
    const wrapper = await open(event)
    const main = wrapper.find('main').element
    const text = visibleText(main)

    // Aucun compteur à zéro, et jamais « Échecs » ni « Prix lus »
    const cells = wrapper.findAll('dl > div')
    for (const cell of cells) expect(Number(cell.find('dd').text())).toBeGreaterThan(0)
    expect(text).not.toMatch(/Échecs|Prix lus/)
    expect(text).not.toMatch(/(^|[^\d,.])0 (article|produit)/)

    // Aucun code visible sans déplier « Détails »
    expect(text).not.toMatch(CODE)

    // Un seul bouton principal au plus : jamais deux décisions de même poids (un seul titre aussi)
    expect(primaries(main).length).toBeLessThanOrEqual(1)
    expect(wrapper.findAll('h1')).toHaveLength(1)
    // Un résultat a toujours son action principale
    expect(primaries(main)).toHaveLength(event?.kind === 'result' ? 1 : primaries(main).length)

    // Aucune phrase de plus de 20 mots
    expect(tooLong('récapitulatif', text)).toEqual([])

    // Ni mise en garde ni rassurance, dépliée ou non (DRV-628) : « Repas ne vide pas ton panier », « Le panier n'est pas vidé par Repas »…
    expect(main.textContent).not.toMatch(WARNING_WORDS)
  })
})
