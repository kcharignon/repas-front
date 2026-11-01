// Le repère du guide (DRV-751, DRV-759) : il entoure le contrôle que la lecture de la page désigne MAINTENANT. Mesuré (DRV-759, résultats de magasins) : le repère était posé
// bien plus bas que la première carte de magasin ; le contrôle gardé était resté dans la page (connecté) alors que la lecture en désignait un autre.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPointer } from '../src/ui/pointer'

const rect = (top: number): DOMRect =>
  ({
    top,
    bottom: top + 60,
    left: 40,
    right: 340,
    width: 300,
    height: 60,
    x: 40,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect

function control(top: number): HTMLElement {
  const el = document.createElement('button')
  el.getBoundingClientRect = () => rect(top)
  document.body.appendChild(el)
  return el
}

describe('le repère suit la lecture de la page', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
    document.documentElement.querySelectorAll('div').forEach((div) => div.remove())
  })

  it('un contrôle encore dans la page mais que la lecture ne désigne plus n’est plus entouré : le repère passe au bon contrôle dans la seconde', () => {
    const stale = control(1000)
    const first = control(200)
    let designated = stale
    const pointer = createPointer({
      win: window as Window & typeof globalThis,
      attachShadow: (host, init) => host.attachShadow(init),
      mode: 'open',
    })

    pointer.point(
      () => ({ element: designated }),
      () => null,
    )
    designated = first
    vi.advanceTimersByTime(2_600)

    const ring = [...document.documentElement.children]
      .map((host) => host.shadowRoot?.querySelector<HTMLElement>('.ring'))
      .find((one) => one !== undefined && one !== null)
    expect(ring?.style.getPropertyValue('top')).toBe(`${200 - 6}px`)
    pointer.clear()
  })

  it('une lecture qui alterne entre deux contrôles chaque seconde ne fait pas sauter le repère : il ne change que si le même autre contrôle est lu deux fois de suite', () => {
    const a = control(200)
    const b = control(400)
    let turn = 0
    const pointer = createPointer({
      win: window as Window & typeof globalThis,
      attachShadow: (host, init) => host.attachShadow(init),
      mode: 'open',
    })

    pointer.point(
      () => ({ element: turn++ === 0 || turn % 2 === 1 ? a : b }),
      () => null,
    )
    vi.advanceTimersByTime(6_000)

    const ring = [...document.documentElement.children]
      .map((host) => host.shadowRoot?.querySelector<HTMLElement>('.ring'))
      .find((one) => one !== undefined && one !== null)
    expect(ring?.style.getPropertyValue('top')).toBe(`${200 - 6}px`)
    pointer.clear()
  })

  it('plus de contrôle à entourer (un mur de cookies apparaît) : le repère se retire tout de suite, sans attendre une seconde lecture', () => {
    const only = control(200)
    let designated: HTMLElement | null = only
    const pointer = createPointer({
      win: window as Window & typeof globalThis,
      attachShadow: (host, init) => host.attachShadow(init),
      mode: 'open',
    })
    pointer.point(
      () => (designated === null ? null : { element: designated }),
      () => null,
    )
    designated = null
    vi.advanceTimersByTime(1_100)

    const ring = [...document.documentElement.children]
      .map((host) => host.shadowRoot?.querySelector<HTMLElement>('.ring'))
      .find((one) => one !== undefined && one !== null)
    expect(ring?.hidden).toBe(true)
    pointer.clear()
  })
})
