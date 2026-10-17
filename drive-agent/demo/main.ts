// Page de démonstration de l'interface (DRV-304), hors production : chaque écran avec des données inventées. Servie par le serveur de
// développement (`make start`, /drive-agent/demo/index.html?screen=summary) et éprouvée par `e2e/agent-ui.spec.ts` (accessibilité, 360×640).
import { ERROR_CODES } from '../protocol'
import { createUi, h, type ChooserProps } from '../src/ui'

const HOSTILE = '<img src=x onerror="window.pwned=1"> <script>window.pwned=1</script>'

// Ouvert pour que les outils de test lisent l'interface ; l'agent, lui, la ferme.
const ui = createUi({ mode: 'open' })

function mountCandidates(zone: HTMLElement, answer: (value: unknown) => void): void {
  const items = ['Poivre noir moulu de test 50 g', HOSTILE, 'Poivre blanc de test 100 g'].map(
    (label) =>
      h(
        'li',
        {},
        h('button', { text: label, attrs: { type: 'button' }, on: { click: () => answer(label) } }),
      ),
  )
  zone.appendChild(h('ul', { attrs: { 'aria-label': 'Produits proposés' } }, ...items))
}

const CHOOSER: ChooserProps = {
  ingredient: 'Poivre',
  position: 2,
  total: 5,
  mount: mountCandidates,
}

const SCREENS: Record<string, () => unknown> = {
  welcome: () => ui.show('welcome', {}),
  summary: () =>
    ui.show('summary', {
      known: 2,
      new: 2,
      haveAtHome: 1,
      skipped: 1,
      lines: [
        {
          name: 'Farine',
          status: 'KNOWN',
          detail: 'Farine de blé T55 de test, marque de test, 1 kg',
        },
        { name: HOSTILE, status: 'KNOWN', detail: HOSTILE },
        { name: 'Poivre', status: 'NEW' },
        { name: 'Lait', status: 'NEW' },
        { name: 'Sel', status: 'HAVE_AT_HOME' },
        { name: 'Huile', status: 'SKIP' },
      ],
    }),
  resume: () => ui.show('resume', { done: 3, total: 8 }),
  progress: () =>
    ui.show('progress', {
      total: 8,
      done: 3,
      current: 'Farine de blé',
      log: [
        'Sel : à la maison',
        'Huile : passée',
        'Beurre : ajouté',
        'Lait : ajouté, produit de secours',
      ],
    }),
  quantity: () =>
    ui.show('quantity', {
      ingredient: 'Farine',
      productLabel: 'Farine de blé T55 de test 1 kg',
      packs: 2,
    }),
  chooser: () => ui.show('chooser', CHOOSER),
  hostile: () => ui.show('quantity', { ingredient: HOSTILE, productLabel: HOSTILE, packs: 1 }),
  'end-completed': () =>
    ui.show('end', {
      outcome: 'completed',
      added: 4,
      chosen: 2,
      haveAtHome: 1,
      skipped: 1,
      unavailable: 0,
      failed: 0,
    }),
  'end-partial': () =>
    ui.show('end', {
      outcome: 'partial',
      error: 'BLOCKED',
      added: 3,
      chosen: 0,
      haveAtHome: 1,
      skipped: 0,
      unavailable: 1,
      failed: 3,
    }),
  'end-aborted': () =>
    ui.show('end', {
      outcome: 'aborted',
      added: 1,
      chosen: 0,
      haveAtHome: 0,
      skipped: 0,
      unavailable: 0,
      failed: 0,
    }),
  ...Object.fromEntries(
    ERROR_CODES.map((code) => [
      `error-${code}`,
      () => ui.show('error', { code, canReturn: code !== 'INVALID_MESSAGE' }),
    ]),
  ),
}

const demo = {
  names: Object.keys(SCREENS),
  show(name: string): void {
    void SCREENS[name]?.()
  },
}

declare global {
  interface Window {
    demo: typeof demo
  }
}
window.demo = demo

const wanted = new URLSearchParams(window.location.search).get('screen')
if (wanted) demo.show(wanted)
