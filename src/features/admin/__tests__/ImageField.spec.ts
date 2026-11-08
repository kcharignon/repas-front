import { File as NodeFile } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'

import { appContext, json, me, stubApi, type Handler } from '@/__tests__/helpers'
import ImageField from '@/features/admin/ImageField.vue'
import { useSessionStore } from '@/session/session'

const UPLOADED = 'images/uploads/3f5a0d1c.png'
const admin = { ...me, roles: ['ROLE_USER', 'ROLE_ADMIN'], isAdmin: true }
const created = (path = UPLOADED) =>
  json({ path }, { status: 201, headers: { Location: `/${path}` } })
const refused = (message: string, status: number, headers: Record<string, string> = {}) =>
  json({ error: { message } }, { status, headers })

// jsdom a ses propres File et FormData, que le Request de Node (undici) ne sait pas lire : dans le navigateur c'est le même moteur,
// ici le test prend ceux de Node. Les fichiers du test sont des File de Node.
const File = NodeFile as unknown as typeof globalThis.File
const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'pomme.png', { type: 'image/png' })

beforeEach(async () => {
  const sample = await new Response('a=b', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).formData()
  vi.stubGlobal('FormData', sample.constructor)
})

interface Options {
  modelValue?: string
  name?: string
  error?: string
  handlers?: Record<string, Handler>
}

/** Monte le bloc avec un vrai faux back ; `modelValue` suit ce que le bloc annonce, comme `v-model` dans un formulaire. */
async function mountField(options: Options = {}) {
  const fetchMock = stubApi({
    'POST /api/auth/refresh': () => json({ token: 'jeton' }),
    'GET /api/v1/me': () => json(admin),
    ...options.handlers,
  })
  localStorage.setItem('repas.session', '1')
  const context = appContext()
  await useSessionStore().restore()
  const busy: boolean[] = []
  const models: string[] = []
  const harness = defineComponent({
    setup() {
      const value = ref(options.modelValue ?? '')

      return () =>
        h(ImageField, {
          modelValue: value.value,
          'onUpdate:modelValue': (next: string) => {
            models.push(next)
            value.value = next
          },
          'onUpdate:busy': (next: boolean) => busy.push(next),
          name: options.name ?? 'Fruits et légumes',
          unnamed: 'Rayon',
          error: options.error,
        })
    },
  })
  const wrapper = mount(harness, { attachTo: document.body, global: { plugins: context.plugins } })

  return { wrapper, fetchMock, busy, models }
}

const button = (label: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
const fileInput = () => document.body.querySelector<HTMLInputElement>('[data-testid="image-file"]')!
const pick = async (file: File | null) => {
  const input = fileInput()
  Object.defineProperty(input, 'files', { value: file === null ? [] : [file], configurable: true })
  input.dispatchEvent(new Event('change'))
  await flushPromises()
}
const text = () => document.body.textContent
const alert = () => document.body.querySelector('[role="alert"]')?.textContent ?? null
const posts = (fetchMock: ReturnType<typeof stubApi>, suffix: string) =>
  fetchMock.mock.calls
    .map(([call]) => call as Request)
    .filter((request) => request.method === 'POST' && request.url.endsWith(suffix))

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('le bloc d’image : état de départ', () => {
  it('sans image, propose d’envoyer ou de coller un lien, avec un aperçu vide', async () => {
    await mountField()

    const group = document.body.querySelector('[role="group"]')!
    expect(group.getAttribute('aria-labelledby')).not.toBeNull()
    expect(text()).toContain('PNG, WebP ou SVG, 3 Mo au plus.')
    expect(button('Envoyer une image')).toBeDefined()
    expect(button('Coller un lien')).toBeDefined()
    expect(button('Retirer l’image')).toBeUndefined()
    expect(button('Envoyer une autre image')).toBeUndefined()
    expect(
      document.body.querySelector('[data-testid="image-preview"]')?.getAttribute('aria-label'),
    ).toBe('Pas d’image')
    expect(fileInput().accept).toBe('image/png,image/webp,image/svg+xml')
  })

  it('avec une image, l’aperçu est la vraie tuile : la balise <img> et le nom, jamais du HTML injecté', async () => {
    await mountField({ modelValue: 'images/uploads/abc.svg', name: 'Boulangerie' })

    const preview = document.body.querySelector('[data-testid="image-preview"]')!
    expect(preview.getAttribute('aria-label')).toBe('Image actuelle de Boulangerie')
    expect(preview.querySelector('img')?.getAttribute('src')).toBe('/images/uploads/abc.svg')
    expect(preview.querySelectorAll('img')).toHaveLength(1)
    expect(preview.textContent).toContain('Boulangerie')
    expect(button('Envoyer une autre image')).toBeDefined()
    expect(button('Retirer l’image')).toBeDefined()
  })

  it('prend le nom de repli tant que le nom est vide', async () => {
    await mountField({ modelValue: 'images/a.png', name: '  ' })

    expect(document.body.querySelector('[data-testid="image-preview"]')?.textContent).toContain(
      'Rayon',
    )
  })

  it('dit « Ajoute une image. » (alerte) quand le formulaire a été validé sans image', async () => {
    await mountField({ error: 'Ajoute une image.' })

    expect(alert()).toBe('Ajoute une image.')
  })
})

describe('le bloc d’image : envoyer un fichier', () => {
  it('envoie le fichier en multipart, garde le chemin rendu et dit que l’image est prête', async () => {
    let received = ''
    const { fetchMock, busy, models } = await mountField({
      handlers: {
        'POST /api/v1/images': async (request) => {
          received = Buffer.from(await request.arrayBuffer()).toString('latin1')

          return created()
        },
      },
    })

    await pick(png())

    expect(posts(fetchMock, '/images')).toHaveLength(1)
    await vi.waitFor(() => expect(received).not.toBe(''))
    // Le corps est un multipart/form-data dont le champ s'appelle `file`
    expect(received).toContain('name="file"; filename="pomme.png"')
    expect(received).toContain('image/png')
    expect(models).toEqual([UPLOADED])
    expect(busy).toEqual([true, false])
    expect(text()).toContain('Image prête. Enregistre pour la garder.')
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('Image prête')
    expect(alert()).toBeNull()
    expect(
      document.body.querySelector('[data-testid="image-preview"] img')?.getAttribute('src'),
    ).toBe(`/${UPLOADED}`)
    expect(button('Envoyer une autre image')).toBeDefined()
  })

  it('pendant l’envoi : groupe occupé, boutons désactivés, barre nommée, aperçu inchangé', async () => {
    let release: (response: Response) => void = () => {}
    const { models } = await mountField({
      modelValue: 'images/ancienne.png',
      handlers: {
        'POST /api/v1/images': () => new Promise<Response>((resolve) => (release = resolve)),
      },
    })

    await pick(png())

    const group = document.body.querySelector('[role="group"]')!
    expect(group.getAttribute('aria-busy')).toBe('true')
    expect((button('Envoyer une autre image') as HTMLButtonElement).disabled).toBe(true)
    expect((button('Coller un lien') as HTMLButtonElement).disabled).toBe(true)
    expect(button('Retirer l’image')).toBeUndefined()
    expect(document.body.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe(
      'Envoi de l’image…',
    )
    expect(
      document.body.querySelector('[data-testid="image-preview"] img')?.getAttribute('src'),
    ).toBe('/images/ancienne.png')
    expect(models).toEqual([])

    release(created())
    await flushPromises()
    expect(group.getAttribute('aria-busy')).toBeNull()
    expect(models).toEqual([UPLOADED])
  })

  it('la fenêtre du sélecteur fermée sans choix ne change rien', async () => {
    const { fetchMock, models } = await mountField({ modelValue: 'images/ancienne.png' })

    await pick(null)

    expect(posts(fetchMock, '/images')).toHaveLength(0)
    expect(models).toEqual([])
    expect(text()).not.toContain('Image prête')
    expect(alert()).toBeNull()
  })

  it('refuse un JPEG tout de suite, sans appel réseau', async () => {
    const { fetchMock, models } = await mountField({ modelValue: 'images/ancienne.png' })

    await pick(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(posts(fetchMock, '/images')).toHaveLength(0)
    expect(models).toEqual([])
    expect(alert()).toBe(
      'Ce format n’est pas accepté. Ton image actuelle n’a pas changé. Choisis un PNG, un WebP ou un SVG.',
    )
  })

  it('refuse un fichier de plus de 3 Mio tout de suite, sans appel réseau', async () => {
    const { fetchMock, models } = await mountField()
    const big = new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'grosse.png', { type: 'image/png' })

    await pick(big)

    expect(posts(fetchMock, '/images')).toHaveLength(0)
    expect(models).toEqual([])
    expect(alert()).toBe(
      'Cette image est trop lourde. Ton image actuelle n’a pas changé. Choisis-en une de 3 Mo au plus.',
    )
  })

  it('accepte un WebP et un SVG', async () => {
    const { fetchMock, models } = await mountField({
      handlers: { 'POST /api/v1/images': () => created('images/uploads/x.svg') },
    })

    await pick(new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }))
    await pick(new File(['x'], 'a.webp', { type: 'image/webp' }))

    expect(posts(fetchMock, '/images')).toHaveLength(2)
    expect(models).toEqual(['images/uploads/x.svg'])
  })

  it('un refus efface le message de réussite précédent et garde l’image actuelle', async () => {
    let answer: Handler = () => created()
    const { models } = await mountField({
      handlers: { 'POST /api/v1/images': (request) => answer(request) },
    })
    await pick(png())
    expect(text()).toContain('Image prête')

    answer = () => refused('IMAGE_NOT_AN_IMAGE', 422)
    await pick(png())

    expect(text()).not.toContain('Image prête')
    expect(models).toEqual([UPLOADED])
    expect(
      document.body.querySelector('[data-testid="image-preview"] img')?.getAttribute('src'),
    ).toBe(`/${UPLOADED}`)
  })
})

const FORMAT =
  'Ce format n’est pas accepté. Ton image actuelle n’a pas changé. Choisis un PNG, un WebP ou un SVG.'
const HEAVY =
  'Cette image est trop lourde. Ton image actuelle n’a pas changé. Choisis-en une de 3 Mo au plus.'
const REFUSED =
  'Ce lien n’est pas accepté. Ton image actuelle n’a pas changé. Colle le lien d’une image publique.'
const DOWNLOAD =
  'Je n’ai pas pu récupérer l’image. Ton image actuelle n’a pas changé. Vérifie le lien et réessaie.'
const LATER =
  'Trop d’envois pour le moment. Ton image actuelle n’a pas changé. Réessaie un peu plus tard.'
const FAILED =
  'L’envoi n’a pas marché. Ton image actuelle n’a pas changé. Réessaie dans un instant.'

describe('le bloc d’image : chaque refus du serveur a sa phrase, jamais son code', () => {
  it.each([
    ['IMAGE_TOO_LARGE', 413, HEAVY],
    ['IMAGE_TOO_LARGE', 422, HEAVY],
    ['IMAGE_NOT_AN_IMAGE', 422, FORMAT],
    ['IMAGE_UNSUPPORTED', 422, FORMAT],
    ['IMAGE_FILE_MISSING', 422, FAILED],
    ['IMAGE_PROCESSING_FAILED', 500, FAILED],
    ['IMAGE_STORAGE_FAILED', 500, FAILED],
    ['WRITE_RATE_LIMITED', 429, LATER],
  ])('envoi : %s (%d)', async (code, status, expected) => {
    const { models } = await mountField({
      modelValue: 'images/ancienne.png',
      handlers: { 'POST /api/v1/images': () => refused(code, status) },
    })

    await pick(png())

    expect(alert()).toBe(expected)
    expect(text()).not.toContain('IMAGE_')
    expect(models).toEqual([])
    expect(document.body.querySelector('[role="group"]')?.getAttribute('aria-busy')).toBeNull()
  })

  it('un 413 de la bordure, sans corps JSON, veut dire « trop lourde »', async () => {
    await mountField({
      handlers: {
        'POST /api/v1/images': () =>
          new Response('<html>Request Entity Too Large</html>', {
            status: 413,
            statusText: 'Payload Too Large',
          }),
      },
    })

    await pick(png())

    expect(alert()).toBe(HEAVY)
  })

  it('pas de réseau : la phrase du réseau, avec son icône', async () => {
    await mountField({
      handlers: {
        'POST /api/v1/images': () => {
          throw new TypeError('Failed to fetch')
        },
      },
    })

    await pick(png())

    expect(alert()).toBe(
      'Pas de connexion. Ton image actuelle n’a pas changé. Réessaie quand le réseau revient.',
    )
  })

  it('un refus de droits dit la phrase habituelle', async () => {
    await mountField({ handlers: { 'POST /api/v1/images': () => refused('Forbidden', 403) } })

    await pick(png())

    expect(alert()).not.toBeNull()
    expect(alert()).not.toContain('Forbidden')
  })
})

describe('le bloc d’image : coller un lien', () => {
  const open = async (handlers: Record<string, Handler> = {}, options: Options = {}) => {
    const mounted = await mountField({ ...options, handlers })
    button('Coller un lien')?.click()
    await flushPromises()

    return mounted
  }
  const linkField = () => document.body.querySelector<HTMLInputElement>('input[type="url"]')!
  const typeLink = async (value: string) => {
    linkField().value = value
    linkField().dispatchEvent(new Event('input'))
    await flushPromises()
  }

  it('ouvre le champ « Lien de l’image » et lui donne le focus', async () => {
    await open()

    expect(linkField()).not.toBeNull()
    expect(document.activeElement).toBe(linkField())
    expect(document.body.querySelector(`label[for="${linkField().id}"]`)?.textContent).toBe(
      'Lien de l’image',
    )
    expect(linkField().placeholder).toBe('https://…')
    expect(button('Utiliser ce lien')).toBeDefined()
    expect(button('Annuler')).toBeDefined()
  })

  it('envoie le lien au serveur, qui le télécharge, puis garde le chemin rendu', async () => {
    let sent: unknown = null
    const { models, busy } = await open({
      'POST /api/v1/images/from-url': async (request) => {
        sent = await request.clone().json()

        return created('images/uploads/lien.webp')
      },
    })
    await typeLink('  https://exemple.fr/pomme.png ')

    button('Utiliser ce lien')?.click()
    await flushPromises()

    expect(sent).toEqual({ url: 'https://exemple.fr/pomme.png' })
    expect(models).toEqual(['images/uploads/lien.webp'])
    expect(busy).toEqual([true, false])
    expect(text()).toContain('Image prête. Enregistre pour la garder.')
    expect(linkField()).toBeNull()
  })

  it('« Utiliser ce lien » attend un lien', async () => {
    const { fetchMock } = await open()

    expect((button('Utiliser ce lien') as HTMLButtonElement).disabled).toBe(true)
    linkField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    expect(posts(fetchMock, '/from-url')).toHaveLength(0)
  })

  it('pendant le téléchargement : « Je récupère l’image… » et le champ est figé', async () => {
    let release: (response: Response) => void = () => {}
    await open({
      'POST /api/v1/images/from-url': () => new Promise<Response>((resolve) => (release = resolve)),
    })
    await typeLink('https://exemple.fr/pomme.png')

    button('Utiliser ce lien')?.click()
    await flushPromises()

    expect(document.body.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe(
      'Je récupère l’image…',
    )
    expect(linkField().disabled).toBe(true)
    release(created())
    await flushPromises()
  })

  it('la touche Entrée dans le champ utilise le lien sans envoyer le formulaire autour', async () => {
    const submitted = vi.fn<(event: Event) => void>()
    document.body.addEventListener('submit', submitted)
    const { models } = await open({ 'POST /api/v1/images/from-url': () => created() })
    await typeLink('https://exemple.fr/pomme.png')

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    linkField().dispatchEvent(enter)
    await flushPromises()

    expect(enter.defaultPrevented).toBe(true)
    expect(models).toEqual([UPLOADED])
    expect(submitted).not.toHaveBeenCalled()
    document.body.removeEventListener('submit', submitted)
  })

  it.each([
    ['IMAGE_URL_REFUSED', 422, REFUSED],
    ['IMAGE_NOT_AN_IMAGE', 422, FORMAT],
    ['IMAGE_UNSUPPORTED', 422, FORMAT],
    ['IMAGE_TOO_LARGE', 413, HEAVY],
    ['IMAGE_DOWNLOAD_FAILED', 502, DOWNLOAD],
    ['IMAGE_DOWNLOAD_RATE_LIMITED', 429, LATER],
  ])('%s (%d)', async (code, status, expected) => {
    const { models } = await open(
      { 'POST /api/v1/images/from-url': () => refused(code, status, { 'Retry-After': '120' }) },
      { modelValue: 'images/ancienne.png' },
    )
    await typeLink('https://exemple.fr/pomme.png')

    button('Utiliser ce lien')?.click()
    await flushPromises()

    expect(alert()).toBe(expected)
    expect(text()).not.toContain('IMAGE_')
    expect(models).toEqual([])
    // Le champ reste ouvert avec le lien, pour le corriger ; le focus y revient
    expect(linkField().value).toBe('https://exemple.fr/pomme.png')
    expect(document.activeElement).toBe(linkField())
  })

  it('« Annuler » ferme le champ sans rien envoyer ni changer', async () => {
    const { fetchMock, models } = await open({}, { modelValue: 'images/ancienne.png' })
    await typeLink('https://exemple.fr/pomme.png')

    button('Annuler')?.click()
    await flushPromises()

    expect(linkField()).toBeNull()
    expect(posts(fetchMock, '/from-url')).toHaveLength(0)
    expect(models).toEqual([])

    button('Coller un lien')?.click()
    await flushPromises()
    expect(linkField().value).toBe('')
  })
})

describe('le bloc d’image : retirer', () => {
  it('ramène à l’état vide, et le formulaire peut alors répondre « Ajoute une image. »', async () => {
    const { models } = await mountField({ modelValue: 'images/ancienne.png' })

    button('Retirer l’image')?.click()
    await flushPromises()

    expect(models).toEqual([''])
    expect(button('Envoyer une image')).toBeDefined()
    expect(button('Retirer l’image')).toBeUndefined()
    expect(
      document.body.querySelector('[data-testid="image-preview"]')?.getAttribute('aria-label'),
    ).toBe('Pas d’image')
  })
})
