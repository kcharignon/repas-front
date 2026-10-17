// Page de démonstration de l'interface (DRV-304), hors production : chaque écran avec des données inventées. Servie par le serveur de
// développement (`make start`, /drive-agent/demo/index.html?screen=summary) et éprouvée par `e2e/agent-ui.spec.ts` (accessibilité, 360×640).
import { ERROR_CODES } from '../protocol'
import {
  createUi,
  renderPicker,
  type ChooserProps,
  type PickerItem,
  type PickerProps,
} from '../src/ui'

const HOSTILE = '<img src=x onerror="window.pwned=1"> <script>window.pwned=1</script>'

// Ouvert pour que les outils de test lisent l'interface ; l'agent, lui, la ferme.
const ui = createUi({ mode: 'open' })

const CANDIDATES: PickerItem[] = [
  {
    id: '1000001',
    name: 'Poivre noir moulu de test',
    label2: '50 g',
    details: ['50 g', '2,58 €', '51,60 € / kg'],
    promo: null,
    explain: '100 g demandés, 50 g par produit : 2',
    state: 'ok',
  },
  {
    id: '1000002',
    name: HOSTILE,
    label2: HOSTILE,
    details: ['100 g', '3,99 €', '39,90 € / kg'],
    promo: 'En promotion : 3,50 €',
    explain: '100 g demandés, 100 g par produit : 1',
    state: 'ok',
  },
  {
    id: '1000003',
    name: 'Poivre blanc de test',
    label2: '100 g',
    details: ['100 g', '4,20 €'],
    promo: null,
    explain: '',
    state: 'refused',
  },
  {
    id: '1000004',
    name: 'Poivre en grains de test',
    label2: '250 g',
    details: ['250 g', '6,10 €'],
    promo: null,
    explain: '',
    state: 'out',
  },
  {
    id: '1000005',
    name: 'Mélange baies de test',
    label2: null,
    details: [],
    promo: null,
    explain: 'Contenu inconnu : tu choisiras la quantité.',
    state: 'ok',
  },
]

const PICKER: PickerProps = {
  need: '100 g',
  replaces: null,
  gone: [],
  checked: new Set(),
  query: 'poivre',
  items: CANDIDATES,
  notice: null,
}

function mounting(props: PickerProps): ChooserProps['mount'] {
  return (zone, answer) => {
    renderPicker(zone, props, {
      choose: (id) => answer({ type: 'choose', id }),
      search: (query) => answer({ query }),
      never: () => undefined,
    })
  }
}

const CHOOSER: ChooserProps = {
  ingredient: 'Poivre',
  position: 2,
  total: 5,
  mount: mounting(PICKER),
}

// Un ingrédient dont le produit habituel n'est plus disponible : bandeau, cases « Ne plus jamais prendre », message du site.
const CHOOSER_GONE: ChooserProps = {
  ingredient: 'Farine de blé',
  position: 1,
  total: 3,
  mount: mounting({
    ...PICKER,
    need: '800 g',
    replaces: 'Farine de blé T55 de test 1 kg',
    gone: [
      { id: '2000001', label: 'Farine de blé T55 de test 1 kg' },
      { id: '2000002', label: 'Farine de blé T45 de test 1 kg' },
    ],
    checked: new Set(['2000002']),
    query: 'farine',
    items: CANDIDATES.slice(0, 2),
    notice: 'Leclerc n’a pas pu mettre ce produit au panier. Choisis-en un autre.',
  }),
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
  'chooser-gone': () => ui.show('chooser', CHOOSER_GONE),
  placement: () =>
    ui.show('placement', {
      ingredient: 'Farine de blé',
      productLabel: 'Farine de blé T45 de test 1 kg',
    }),
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
