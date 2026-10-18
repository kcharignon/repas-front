// L'échelle d'affichage de l'interface : la fonction pure (plusieurs tailles de fenêtre et d'écran, dont celles mesurées dans la WebView d'un
// Pixel 9) et la mesure d'une fenêtre. Aucun réseau, aucun navigateur.
import { describe, expect, it } from 'vitest'

import {
  displayLayout,
  displayScale,
  MAX_SCALE,
  MIN_SCALE,
  measureDisplay,
  type DisplayMeasures,
} from '../src/ui/scale'

type Visible = NonNullable<DisplayMeasures['visible']>

/** Une page vue sur un écran : fenêtre de la page en px CSS, écran en dp, et ce que dit `visualViewport` s'il existe. */
function measures(
  inner: [number, number],
  screenWidth: number,
  visible?: Partial<Visible>,
): DisplayMeasures {
  return {
    innerWidth: inner[0],
    innerHeight: inner[1],
    screenWidth,
    visible: visible && {
      width: inner[0],
      height: inner[1],
      offsetLeft: 0,
      offsetTop: 0,
      scale: 1,
      ...visible,
    },
  }
}

describe('le facteur', () => {
  it.each([
    // [description, mesures, facteur attendu]
    [
      'Pixel 9 en mode ordinateur (mesuré dans la WebView : fenêtre de 980 px, échelle 0,4207)',
      measures([980, 2016], 412, { scale: 0.4207 }),
      1 / 0.4207,
    ],
    [
      'Pixel 9 en paysage (mesuré : la WebView n’occupe que 872 dp, échelle 0,89, alors que l’écran en fait 924)',
      measures([980, 409], 924, { scale: 0.89 }),
      1 / 0.89,
    ],
    [
      'petit téléphone en mode ordinateur (980 px sur 360 dp)',
      measures([980, 2000], 360, { scale: 360 / 980 }),
      980 / 360,
    ],
    [
      'tablette en mode ordinateur (980 px sur 800 dp)',
      measures([980, 1200], 800, { scale: 800 / 980 }),
      980 / 800,
    ],
    ['page adaptée au téléphone (échelle 1)', measures([412, 860], 412, { scale: 1 }), 1],
    ['écran d’ordinateur (échelle 1)', measures([1280, 720], 1920, { scale: 1 }), 1],
    [
      'page agrandie au pincement au-delà d’un dp par pixel CSS',
      measures([980, 2016], 412, { scale: 2 }),
      1,
    ],
  ])('%s', (_name, input, expected) => {
    expect(displayScale(input)).toBeCloseTo(expected, 10)
  })

  it('un pixel CSS agrandi par le facteur mesure un dp : le texte de 16 px fait 16 dp, la cible de 48 px 48 dp', () => {
    const scale = 0.4207 // dp par pixel CSS, mesuré
    const factor = displayScale(measures([980, 2016], 412, { scale }))

    expect(16 * factor * scale).toBeCloseTo(16, 8)
    expect(48 * factor * scale).toBeCloseTo(48, 8)
  })

  it('sans visualViewport (WebView ancienne), part de la largeur de la fenêtre et de celle de l’écran', () => {
    expect(displayScale(measures([980, 2016], 412))).toBeCloseTo(980 / 412, 10)
    expect(displayScale(measures([412, 860], 412))).toBe(1)
    expect(displayScale(measures([1280, 720], 1920))).toBe(1)
  })

  it('ne dépasse jamais 3 ni ne descend sous 1', () => {
    expect(displayScale(measures([980, 2016], 412, { scale: 0.1 }))).toBe(MAX_SCALE)
    expect(displayScale(measures([5000, 2016], 400))).toBe(MAX_SCALE)
    expect(displayScale(measures([100, 400], 400))).toBe(MIN_SCALE)
    expect(displayScale(measures([980, 2016], 412, { scale: 5 }))).toBe(MIN_SCALE)
    expect([MIN_SCALE, MAX_SCALE]).toEqual([1, 3])
  })

  it.each([
    ['écran et échelle inconnus (jsdom)', measures([1024, 768], 0)],
    ['écran négatif', measures([980, 2016], -1)],
    ['écran absurde', measures([980, 2016], Number.NaN)],
    ['fenêtre inconnue', measures([0, 0], 412)],
    ['fenêtre infinie', measures([Number.POSITIVE_INFINITY, 2016], 412)],
    ['échelle nulle et écran inconnu', measures([980, 2016], 0, { scale: 0 })],
    ['échelle absurde et écran inconnu', measures([980, 2016], 0, { scale: Number.NaN })],
  ])('reste à 1 quand aucune mesure ne permet de dire : %s', (_name, input) => {
    expect(displayScale(input)).toBe(1)
  })

  it('une échelle absurde laisse la largeur de l’écran décider', () => {
    expect(displayScale(measures([980, 2016], 412, { scale: Number.NaN }))).toBeCloseTo(
      980 / 412,
      10,
    )
  })
})

describe('la mise en page', () => {
  it('prend toute la zone visible, agrandie du facteur, quand la page n’est pas agrandie au pincement', () => {
    const layout = displayLayout(
      measures([980, 2016], 412, { scale: 0.4207, width: 979.8, height: 2015.7 }),
    )

    expect(layout).toEqual({ scale: 1 / 0.4207, left: 0, top: 0, width: 979.8, height: 2015.7 })
  })

  it('le cadre agrandi tient exactement dans la zone visible : sa largeur est celle que l’on voit, en dp, jamais plus (pas de défilement horizontal)', () => {
    for (const [screenDp, scale] of [
      [412, 0.4207],
      [360, 360 / 980],
      [872, 0.89],
      [800, 800 / 980],
    ] as const) {
      const layout = displayLayout(measures([980, 2000], screenDp, { scale }))

      // Largeur du cadre avant son agrandissement, en px CSS, fois les dp d'un pixel CSS : ce qu'il occupe à l'écran, en dp.
      expect(layout.width / layout.scale).toBeCloseTo(980 * scale, 8)
    }
  })

  it('reste sans effet sur un écran d’ordinateur et sur une page adaptée au téléphone', () => {
    expect(displayLayout(measures([1280, 720], 1920, { scale: 1 })).scale).toBe(1)
    expect(displayLayout(measures([412, 860], 412, { scale: 1 })).scale).toBe(1)
  })

  it('suit la partie visible quand la page est agrandie au pincement : le cadre garde la taille d’un écran de téléphone', () => {
    // La page, agrandie jusqu'à 0,7 dp par pixel CSS : on voit 412 / 0,7 = 589 px de large, décalés dans la fenêtre.
    const layout = displayLayout(
      measures([980, 2016], 412, {
        width: 589,
        height: 1230,
        offsetLeft: 120,
        offsetTop: 640,
        scale: 0.7,
      }),
    )

    expect(layout.left).toBe(120)
    expect(layout.top).toBe(640)
    expect(layout.scale).toBeCloseTo(1 / 0.7, 10)
    expect(layout.width / layout.scale).toBeCloseTo(412.3, 5)
  })

  it('sans visualViewport, prend toute la fenêtre', () => {
    expect(displayLayout(measures([980, 2016], 412))).toEqual({
      scale: 980 / 412,
      left: 0,
      top: 0,
      width: 980,
      height: 2016,
    })
  })

  it.each([
    ['largeur nulle', { width: 0, height: 900, offsetLeft: 5, offsetTop: 5 }],
    ['hauteur absente', { width: 411, height: Number.NaN, offsetLeft: 5, offsetTop: 5 }],
  ])('ignore une partie visible inutilisable : %s', (_name, visible) => {
    const layout = displayLayout(measures([980, 2016], 412, { scale: 0.4207, ...visible }))

    expect(layout).toEqual({ scale: 1 / 0.4207, left: 0, top: 0, width: 980, height: 2016 })
  })

  it('une position de la partie visible fausse devient 0', () => {
    const layout = displayLayout(
      measures([980, 2016], 412, { offsetLeft: Number.NaN, offsetTop: Number.POSITIVE_INFINITY }),
    )

    expect(layout.left).toBe(0)
    expect(layout.top).toBe(0)
  })

  it('une fenêtre inconnue donne une zone vide et le facteur 1 (rien à poser)', () => {
    expect(displayLayout(measures([Number.NaN, Number.NaN], 412))).toEqual({
      scale: 1,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    })
  })
})

describe('la mesure de la fenêtre', () => {
  /** Une fenêtre de test : seuls les champs que la mesure lit. */
  function windowOf(parts: Partial<Window>): Window {
    return parts as Window
  }

  it('lit la fenêtre, l’écran et la partie visible, échelle comprise', () => {
    const win = windowOf({
      innerWidth: 980,
      innerHeight: 2016,
      screen: { width: 412 } as Screen,
      visualViewport: {
        width: 980,
        height: 2016,
        offsetLeft: 10,
        offsetTop: 20,
        scale: 0.4207,
      } as VisualViewport,
    })

    expect(measureDisplay(win)).toEqual({
      innerWidth: 980,
      innerHeight: 2016,
      screenWidth: 412,
      visible: { width: 980, height: 2016, offsetLeft: 10, offsetTop: 20, scale: 0.4207 },
    })
  })

  it('sans partie visible ni écran (jsdom, navigateur ancien), rend de quoi ne rien changer', () => {
    const measured = measureDisplay(windowOf({ innerWidth: 1024, innerHeight: 768 }))

    expect(measured.visible).toBeUndefined()
    expect(measured.screenWidth).toBe(0)
    expect(displayLayout(measured).scale).toBe(1)
  })

  it('la fenêtre de jsdom donne le facteur 1', () => {
    expect(displayLayout(measureDisplay(window)).scale).toBe(1)
  })
})
