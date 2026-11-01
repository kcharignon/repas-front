// La fenêtre au premier plan (DRV-757, A2) : des sondes de FORME pour lire, sur le téléphone, ce qui est devant la carte quand l'enseigne ouvre son panneau. Jamais un texte ni une
// valeur de la page ; seulement des noms de balise, d'identifiant et de classe nettoyés et un z-index.
import { afterEach, describe, expect, it } from 'vitest'

import { foregroundFacts } from '../src/diagnostic/foreground'
import { probeLines } from '../src/diagnostic/probes'

afterEach(() => {
  document.body.innerHTML = ''
  Reflect.deleteProperty(document, 'elementsFromPoint')
})

describe('les sondes de la fenêtre au premier plan', () => {
  it('compte les boîtes modales et les fenêtres flottantes, dit le plein écran et donne les cinq premiers éléments, ceux de l’agent marqués au point où se pose la carte', () => {
    document.body.innerHTML =
      '<div id="panel" class="modal open" aria-modal="true" style="z-index:111">Renseignez un code postal</div><div id="autre"></div><section></section><p id="quatre"></p><p id="cinq"></p><p id="six"></p>'
    const [panel, autre, section, quatre, cinq, six] = [...document.body.children] as HTMLElement[]
    // Les deux conteneurs de l'agent, à la racine du document, au z-index le plus haut : le vrai panneau vient derrière
    const mine = document.createElement('div')
    mine.setAttribute('style', 'z-index:2147483647')
    document.documentElement.appendChild(mine)
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [mine, panel, autre, section, quatre, cinq, six],
    })

    const facts = foregroundFacts(window)

    expect(facts.fullscreen).toBe(false)
    expect(facts.modal === null || facts.modal === 0).toBe(true)
    expect(facts.point).toEqual({
      x: Math.round(window.innerWidth / 2),
      y: Math.round(window.innerHeight * 0.8),
    })
    expect(facts.stack).toEqual([
      { tag: 'div', id: '', className: '', zIndex: '2147483647', agent: true },
      { tag: 'div', id: 'panel', className: 'modal_open', zIndex: '111', agent: false },
      { tag: 'div', id: 'autre', className: '', zIndex: 'auto', agent: false },
      { tag: 'section', id: '', className: '', zIndex: 'auto', agent: false },
      { tag: 'p', id: 'quatre', className: '', zIndex: 'auto', agent: false },
    ])
    mine.remove()
    // Aucun texte de la page n'est repris
    expect(JSON.stringify(facts)).not.toContain('code postal')
  })

  it('assainit et borne les noms de la page : jamais une phrase ni plus de 30 caractères', () => {
    document.body.innerHTML =
      '<div id="un identifiant très long avec des espaces et des accents é"></div>'
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [document.body.firstElementChild],
    })

    const [one] = foregroundFacts(window).stack

    expect(one?.id).toMatch(/^[\w-]{1,30}$/)
  })

  it('une ligne du rapport : « Fenêtre au premier plan », formes seulement ; absente quand la sonde n’a pas eu lieu', () => {
    const lines = probeLines({
      arrival: null,
      common: null,
      nonsense: null,
      foreground: {
        modal: 1,
        popovers: 0,
        fullscreen: false,
        point: { x: 205, y: 610 },
        stack: [
          { tag: 'div', id: '', className: '', zIndex: '2147483647', agent: true },
          { tag: 'div', id: 'panel', className: 'modal', zIndex: '111', agent: false },
        ],
      },
    })

    expect(lines.join('\n')).toContain(
      'Fenêtre au premier plan : boîtes modales 1, fenêtres flottantes ouvertes 0, plein écran non ; au point (205, 610) : div z=2147483647 [agent] > div#panel.modal z=111',
    )
    expect(probeLines({ arrival: null, common: null, nonsense: null }).join('\n')).not.toContain(
      'premier plan',
    )
  })
})
