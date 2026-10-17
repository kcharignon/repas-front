import { afterEach, describe, expect, it, vi } from 'vitest'

import { REPAS_ORIGIN } from '../config'
import { makeFragment, verifyFragment } from '../fragment'
import type { WakeLockLike } from '../wakelock'
import { button, click, mount, openEssai, output, setPath, unmount, untilOutput } from './harness'

afterEach(() => {
  unmount()
  delete (navigator as unknown as Record<string, unknown>).wakeLock
})

describe('essai 7 : fragments d’adresse', () => {
  it.each([6, 16, 64])(
    'envoie un fragment de %s Ko vers Repas seulement après confirmation',
    (ko) => {
      // Given
      const harness = mount()
      openEssai(harness, 7)

      // When : il touche le bouton
      click(harness.root, `${ko} Ko vers Repas`)

      // Then : une confirmation, pas de navigation
      expect(harness.navigated).toEqual([])
      expect(harness.root.querySelector('[role="alertdialog"]')?.textContent).toContain(
        REPAS_ORIGIN,
      )

      // When : il confirme
      click(harness.root, 'Oui, y aller')

      // Then
      expect(harness.navigated).toHaveLength(1)
      const url = harness.navigated[0] as string
      expect(url.startsWith(`${REPAS_ORIGIN}/#lab=`)).toBe(true)
      const fragment = url.slice(`${REPAS_ORIGIN}/#lab=`.length)
      expect(fragment).toHaveLength(ko * 1024)
      expect(verifyFragment(fragment).kind).toBe('intact')
    },
  )

  it('envoie un fragment vers une page du magasin, sur l’hôte courant', () => {
    const harness = mount()
    openEssai(harness, 7)

    click(harness.root, '16 Ko vers Leclerc')
    click(harness.root, 'Oui, y aller')

    const url = harness.navigated[0] as string
    expect(
      url.startsWith(
        `${window.location.origin}/magasin-999111-999111/recherche.aspx?TexteRecherche=farine#lab=`,
      ),
    ).toBe(true)
    expect(url.endsWith(makeFragment(16 * 1024))).toBe(true)
  })

  it('refuse d’aller vers Leclerc depuis une page qui n’est pas un magasin', () => {
    const harness = mount({ path: '/liste' })
    openEssai(harness, 7)

    click(harness.root, '6 Ko vers Leclerc')

    expect(output(harness.root)).toContain("Cette page n'est pas une page de magasin")
    expect(harness.navigated).toEqual([])
  })

  it('annuler ne navigue pas', () => {
    const harness = mount()
    openEssai(harness, 7)

    click(harness.root, '6 Ko vers Repas')
    click(harness.root, 'Annuler')

    expect(harness.navigated).toEqual([])
  })

  it('vérifie la taille reçue quand la page d’arrivée porte un fragment du banc', () => {
    // Given : la page de Repas où l’on arrive, avec 16 Ko de fragment
    const harness = mount({ path: `/#lab=${makeFragment(16 * 1024)}` })

    // When
    openEssai(harness, 7)

    // Then
    expect(output(harness.root)).toBe(
      'Fragment reçu sur cette page : 16384 caractères reçus, contenu intact',
    )
  })

  it('dit qu’un fragment est arrivé tronqué', () => {
    const harness = mount({ path: `/#lab=${makeFragment(16 * 1024).slice(0, 9000)}` })

    openEssai(harness, 7)

    expect(output(harness.root)).toContain('annoncée 16384, reçue 9000')
  })

  it('dit quand il n’y a pas de fragment', () => {
    const harness = mount()

    openEssai(harness, 7)

    expect(output(harness.root)).toContain('Fragment reçu sur cette page : aucun')
  })

  it('ne fait aucune requête', () => {
    const harness = mount()
    openEssai(harness, 7)
    click(harness.root, '64 Ko vers Repas')
    click(harness.root, 'Oui, y aller')

    expect(harness.fetch).not.toHaveBeenCalled()
  })
})

describe('essai 8 : retour vers Repas', () => {
  it('navigue vers Repas avec #lab=ok après confirmation', () => {
    const harness = mount()
    openEssai(harness, 8)

    click(harness.root, 'Retourner vers Repas')
    expect(harness.navigated).toEqual([])
    click(harness.root, 'Oui, y aller')

    expect(harness.navigated).toEqual([`${REPAS_ORIGIN}/#lab=ok`])
  })

  it('reconnaît le fragment « ok » à l’arrivée', () => {
    setPath('/')
    const harness = mount({ path: '/#lab=ok' })

    openEssai(harness, 8)

    expect(output(harness.root)).toBe('Fragment reçu sur cette page : fragment « ok » reçu')
  })
})

describe('essai 9 : écran allumé', () => {
  function installWakeLock(options: { refuse?: boolean } = {}): void {
    const wakeLock: WakeLockLike = {
      request: async () => {
        if (options.refuse) throw Object.assign(new Error('refusé'), { name: 'NotAllowedError' })
        return { addEventListener: () => {}, release: async () => {} }
      },
    }
    Object.defineProperty(navigator, 'wakeLock', { value: wakeLock, configurable: true })
  }

  it('garde le verrou pendant 60 secondes puis le rend', async () => {
    // Given
    installWakeLock()
    const harness = mount()
    let clock = 0
    harness.env.now = () => clock
    harness.env.sleep = async (ms) => {
      clock += ms
    }
    openEssai(harness, 9)

    // When
    click(harness.root, 'Garder l’écran allumé 60 s')
    const text = await untilOutput(harness.root, 'Verrou obtenu')

    // Then
    expect(text).toContain('Wake Lock disponible : oui')
    expect(text).toContain('Verrou obtenu : oui')
    expect(text).toContain('Verrou conservé 60 s sur 60, puis rendu.')
    expect(harness.root.querySelector('.status')?.textContent).toBe('')
  })

  it('dit quand le verrou est refusé', async () => {
    installWakeLock({ refuse: true })
    const harness = mount()
    openEssai(harness, 9)

    click(harness.root, 'Garder l’écran allumé 60 s')
    const text = await untilOutput(harness.root, 'Verrou obtenu')

    expect(text).toContain('Verrou obtenu : non (NotAllowedError)')
    expect(text).toContain('Pas de verrou')
  })

  it('dit quand l’API manque', async () => {
    const harness = mount()
    openEssai(harness, 9)

    click(harness.root, 'Garder l’écran allumé 60 s')
    const text = await untilOutput(harness.root, 'Wake Lock disponible')

    expect(text).toContain('Wake Lock disponible : non')
    expect(text).toContain('Verrou obtenu : non')
  })

  it('s’arrête quand on touche « Arrêter »', async () => {
    installWakeLock()
    const harness = mount()
    let clock = 0
    harness.env.now = () => clock
    harness.env.sleep = async (ms) => {
      clock += ms
      if (clock === 3000) click(harness.root, 'Arrêter')
    }
    openEssai(harness, 9)

    click(harness.root, 'Garder l’écran allumé 60 s')
    const text = await untilOutput(harness.root, 'Arrêté par toi après 3 s.')

    expect(text).toContain('Verrou obtenu : oui')
  })

  it('dit quand le navigateur rend le verrou avant la fin', async () => {
    // Given : le navigateur rend le verrou après 23 s
    const listeners: (() => void)[] = []
    const wakeLock: WakeLockLike = {
      request: async () => ({
        addEventListener: (_t, listener) => void listeners.push(listener),
        release: async () => {},
      }),
    }
    Object.defineProperty(navigator, 'wakeLock', { value: wakeLock, configurable: true })
    const harness = mount()
    let clock = 0
    harness.env.now = () => clock
    harness.env.sleep = async (ms) => {
      clock += ms
      if (clock >= 23_000) listeners.forEach((listener) => listener())
    }
    openEssai(harness, 9)

    // When
    click(harness.root, 'Garder l’écran allumé 60 s')
    const text = await untilOutput(harness.root, 'Verrou rendu par le navigateur après 23 s')

    // Then
    expect(text).toContain('écran non garanti')
    await vi.waitFor(() =>
      expect(button(harness.root, 'Garder l’écran allumé 60 s').disabled).toBe(false),
    )
  })
})
