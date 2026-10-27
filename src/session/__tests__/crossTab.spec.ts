import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { appContext, me } from '@/__tests__/helpers'
import { useDriveReturnStore } from '@/features/drive/returnStore'
import { followSessionAcrossTabs } from '@/session/crossTab'
import { useSessionStore } from '@/session/session'

const HINT = 'repas.session'

/** L'événement que le navigateur envoie aux AUTRES fenêtres quand une fenêtre change le stockage durable. */
const storageEvent = (key: string | null, area: Storage = localStorage) =>
  window.dispatchEvent(new StorageEvent('storage', { key, storageArea: area }))

describe('session suivie d’une fenêtre à l’autre', () => {
  let stop: (() => void) | null = null

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
  })
  afterEach(() => stop?.())

  /** Une fenêtre connectée, ouverte sur `path`, qui suit la session. */
  async function signedInWindow(path = '/liste') {
    const context = appContext()
    await context.router.push(path)
    localStorage.setItem(HINT, '1')
    localStorage.setItem('repas.user', JSON.stringify(me))
    const session = useSessionStore()
    session.user = { ...me }
    stop = followSessionAcrossTabs(context.router)

    return { session, router: context.router }
  }

  /** Ce que fait la fenêtre qui se déconnecte : l'indice, la copie de l'utilisateur et le brouillon du drive partent. */
  const otherWindowSignsOut = () => {
    localStorage.removeItem(HINT)
    localStorage.removeItem('repas.user')
    localStorage.removeItem('repas.drive.run')
  }

  it('met fin à la session quand une autre fenêtre se déconnecte, puis mène à la connexion', async () => {
    const { session, router } = await signedInWindow()
    otherWindowSignsOut()

    storageEvent(HINT)

    expect(session.isAuthenticated).toBe(false)
    // La page de connexion se charge à la demande
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'), { timeout: 5000 })
    // L'adresse de la page ouverte n'est pas gardée pour la personne qui se connectera ensuite
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('oublie aussi le résultat du dernier envoi au drive', async () => {
    await signedInWindow()
    const driveReturn = useDriveReturnStore()
    driveReturn.receive({ kind: 'invalid', detail: 'champ' })
    otherWindowSignsOut()

    storageEvent(HINT)

    expect(driveReturn.event).toBeNull()
  })

  it('réagit aussi quand tout le stockage est vidé (clé nulle)', async () => {
    const { session } = await signedInWindow()
    localStorage.clear()

    storageEvent(null)

    expect(session.isAuthenticated).toBe(false)
  })

  it('reste sur place sur une page ouverte à tous', async () => {
    const { session, router } = await signedInWindow('/confidentialite')
    otherWindowSignsOut()

    storageEvent(HINT)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(session.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.name).toBe('privacy')
  })

  it('ne fait rien tant que l’indice est là (connexion ou renouvellement dans une autre fenêtre)', async () => {
    const { session, router } = await signedInWindow()

    storageEvent(HINT)

    expect(session.isAuthenticated).toBe(true)
    expect(router.currentRoute.value.name).toBe('shopping-list')
  })

  it('ignore les autres clés et le stockage de la fenêtre', async () => {
    const { session } = await signedInWindow()
    otherWindowSignsOut()

    storageEvent('repas.theme')
    storageEvent(HINT, sessionStorage)

    expect(session.isAuthenticated).toBe(true)
  })

  it('ne touche pas à un visiteur', async () => {
    const context = appContext()
    await context.router.push('/connexion')
    const session = useSessionStore()
    stop = followSessionAcrossTabs(context.router)

    storageEvent(HINT)

    expect(session.isAuthenticated).toBe(false)
    expect(context.router.currentRoute.value.name).toBe('login')
  })

  it('cesse d’écouter quand on l’arrête', async () => {
    const { session } = await signedInWindow()
    stop?.()
    otherWindowSignsOut()

    storageEvent(HINT)

    expect(session.isAuthenticated).toBe(true)
  })
})
