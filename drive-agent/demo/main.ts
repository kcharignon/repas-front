// Page de démonstration de l'interface (DRV-304), hors production : chaque écran avec des données inventées. Servie par le serveur de
// développement (`make start`, /drive-agent/demo/index.html?screen=summary) et éprouvée par `e2e/agent-ui.spec.ts` (accessibilité, 360×640).
import { ERROR_CODES } from '../protocol'
import {
  createUi,
  renderPicker,
  type ChooserProps,
  type DiagnosticRow,
  type PickerItem,
  type PickerProps,
} from '../src/ui'

// Les photos de la démonstration (DRV-633) : le test (`e2e/agent-ui.spec.ts`) répond lui-même à ces adresses (jamais une vraie image), 404 pour l'identifiant 9999.
const photo = (id: number) => `https://photos-test.leclercdrive.fr/image.ashx?id=${id}&use=l&cat=p`

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
    explain: '50 g par produit : 2 produits.',
    state: 'ok',
    photo: photo(1001),
  },
  {
    id: '1000002',
    name: HOSTILE,
    label2: HOSTILE,
    details: ['100 g', '3,99 €', '39,90 € / kg'],
    promo: 'En promotion : 3,50 €',
    explain: '100 g par produit : 1 produit.',
    state: 'ok',
    photo: photo(1002),
  },
  {
    id: '1000003',
    name: 'Poivre blanc de test',
    label2: '100 g',
    details: ['100 g', '4,20 €'],
    promo: null,
    explain: '',
    state: 'refused',
    // Une adresse d'un autre hôte : refusée, la fiche reste en texte.
    photo: 'https://images.autre-site.invalid/image.ashx?id=1003',
  },
  {
    id: '1000004',
    name: 'Poivre en grains de test',
    label2: '250 g',
    details: ['250 g', '6,10 €'],
    promo: null,
    explain: '',
    state: 'out',
    // Une photo qui répond 404 : la fiche reste en texte, sans icône d'image cassée.
    photo: photo(9999),
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

// DRV-643 : une recherche aux nombreux résultats (60 produits), affichés par lots en défilant ; chaque fiche a sa photo (identifiants 2001 à 2060).
const MANY: PickerItem[] = Array.from({ length: 60 }, (_unused, index) => ({
  id: String(1002000 + index),
  name: `Biscuit sablé de test n° ${index + 1}`,
  label2: `${150 + index} g`,
  details: [`${150 + index} g`, '1,90 €', '12,60 € / kg'],
  promo: null,
  explain: `${150 + index} g par produit : 1 produit.`,
  state: index === 20 ? 'out' : 'ok',
  photo: photo(2001 + index),
}))

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
      choose: (id, placement) => answer({ type: 'choose', id, placement }),
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

// DRV-647 : la rangée des rayons du site au-dessus des résultats (« Tous » puis les rayons présents, le rayon appris choisi d'avance), des libellés
// inventés, dont un très long, et le repli « Rayon 1 » d'un rayon sans libellé lisible.
const AISLE_OF = [41, 7, 41, 15, 7, 41, 60, 7]
const AISLE_ITEMS: PickerItem[] = Array.from({ length: 8 }, (_unused, index) => ({
  id: String(1003000 + index),
  name:
    AISLE_OF[index] === 41
      ? `Tomates de test n° ${index + 1}`
      : `Sauce tomate de test n° ${index + 1}`,
  label2: '500 g',
  details: ['500 g', '2,10 €', '4,20 € / kg'],
  promo: null,
  explain: '500 g par produit : 1 produit.',
  state: 'ok',
  photo: photo(3001 + index),
  aisle: AISLE_OF[index] ?? null,
}))
const CHOOSER_AISLES: ChooserProps = {
  ingredient: 'Tomate',
  position: 1,
  total: 4,
  mount: mounting({
    ...PICKER,
    need: '500 g',
    query: 'tomate',
    items: AISLE_ITEMS,
    aisles: {
      chips: [
        { id: 41, label: 'Fruits et légumes', count: 3 },
        { id: 7, label: 'Conserves', count: 3 },
        { id: 15, label: 'Épicerie salée, sauces et condiments', count: 1 },
        { id: 60, label: 'Rayon 1', count: 1 },
      ],
      selected: 41,
    },
  }),
}

// Un ingrédient dont le produit habituel n'est plus disponible : bandeau, cases « Ne plus proposer », message du site.
const CHOOSER_GONE: ChooserProps = {
  ingredient: 'Farine de blé',
  position: 1,
  total: 3,
  mount: mounting({
    ...PICKER,
    need: '800 g',
    replaces: 'Farine de blé T55 de test 1 kg',
    // Les trois raisons (DRV-635) : rupture, introuvable (recherche préremplie), refusé par le panier.
    gone: [
      { id: '2000001', label: 'Farine de blé T55 de test 1 kg', reason: 'OUT_OF_STOCK' },
      { id: '2000002', label: 'Farine de blé T45 de test 1 kg', reason: 'NOT_FOUND' },
      { id: '2000003', label: 'Farine de blé T65 de test 1 kg', reason: 'CART_REFUSED' },
    ],
    prefill: 'farine t45',
    checked: new Set(['2000002']),
    query: 'farine',
    items: CANDIDATES.slice(0, 2),
    notice:
      'Leclerc n’a pas pu mettre « Poivre noir moulu de test » au panier. Choisis-en un autre.',
  }),
}

const DIAGNOSTIC_ROWS: DiagnosticRow[] = [
  { label: 'Version de l’agent', badge: 'OK', detail: 'version 0.5.0', tone: 'ok' },
  { label: 'Page prise en charge', badge: 'OK', detail: 'hôte fd9, magasin …456', tone: 'ok' },
  {
    label: 'Origine de Repas dans l’agent',
    badge: 'NON TESTÉ',
    detail: 'pont de l’application : pas d’origine à vérifier',
    tone: 'skip',
  },
  {
    label: 'Stockage de session',
    badge: 'OK',
    detail: 'lecture et écriture possibles',
    tone: 'ok',
  },
  {
    label: 'Écran allumé (Wake Lock)',
    badge: 'KO',
    detail: 'absent (toléré : l’écran peut s’éteindre)',
    tone: 'ko',
  },
  { label: 'Recherche d’un mot courant', badge: 'KO BLOCKED', detail: null, tone: 'ko' },
  {
    label: 'Contenu net des produits',
    badge: 'NON TESTÉ',
    detail: 'recherche impossible, contenu non analysé',
    tone: 'skip',
  },
  { label: 'Cadre de même origine', badge: 'OK', detail: HOSTILE, tone: 'ok' },
]
const WAITING: DiagnosticRow = { label: 'En attente', badge: '…', detail: null, tone: 'wait' }

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
      lead: '8 articles : 5 sont déjà choisis, 2 sont à choisir sur Leclerc, 1 ne sera pas mis au panier.',
      total: 8,
      done: 3,
      current: 'Farine de blé',
      log: [
        'Sel : j’en ai toujours',
        'Huile : pas cette fois',
        'Beurre : ajouté',
        'Lait : ajouté, produit de remplacement',
      ],
    }),
  quantity: () =>
    ui.show('quantity', {
      ingredient: 'Farine',
      productLabel: 'Farine de blé T55 de test 1 kg',
      packs: 2,
      need: '800 g',
    }),
  packSize: () =>
    ui.show('packSize', {
      ingredient: 'Cheddar en tranche',
      productLabel: 'Fromage cheddar en tranches de test 20 Tranches - 340g',
      quantity: 15,
      unitName: 'tranche',
      prefill: 20,
    }),
  chooser: () => ui.show('chooser', CHOOSER),
  // Un article n'a encore aucun produit retenu : « Passer ces n articles » demande une confirmation d'une ligne, sans la liste de produits (DRV-624, DRV-626).
  'chooser-confirm': () => {
    const shown = ui.show('chooser', { ...CHOOSER, confirmRest: true })
    // Le premier bouton de ce nom est celui des réponses ; le second, caché, confirme.
    const buttons = [...(ui.host?.shadowRoot?.querySelectorAll('button') ?? [])]
    buttons.find((button) => button.textContent === 'Passer ces 4 articles')?.click()
    return shown
  },
  // Le dernier article à choisir : plus de « Passer ces n articles ».
  'chooser-last': () => ui.show('chooser', { ...CHOOSER, position: 5 }),
  // Un seul article à choisir : pas de compteur « (1 sur 1) » (DRV-626).
  'chooser-single': () => ui.show('chooser', { ...CHOOSER, position: 1, total: 1 }),
  'chooser-long': () =>
    ui.show('chooser', {
      ...CHOOSER,
      mount: mounting({ ...PICKER, query: 'biscuit', items: MANY }),
    }),
  'chooser-gone': () => ui.show('chooser', CHOOSER_GONE),
  'chooser-aisles': () => ui.show('chooser', CHOOSER_AISLES),
  diagnostic: () =>
    ui.show('diagnostic', {
      copy: () => Promise.resolve(true),
      start: (view) => {
        view.update(DIAGNOSTIC_ROWS)
        view.finish(
          'Contrôles terminés : 3 réussis, 3 en échec, 2 non testés.',
          'Repas Drive : diagnostic\nAgent : 0.5.0\nDate : 2026-10-18 14:03 UTC\nHôte : fd9\nMagasin : …456\n\n[OK] Version de l’agent : version 0.5.0\n[KO BLOCKED] Recherche d’un mot courant\n\nAucune écriture au panier.',
        )
      },
    }),
  'diagnostic-running': () =>
    ui.show('diagnostic', {
      copy: () => Promise.resolve(false),
      start: (view) =>
        view.update(DIAGNOSTIC_ROWS.map((row, index) => (index < 3 ? row : WAITING))),
    }),
  store: () => ui.show('store', { id: '123456', label: null }),
  'store-label': () => ui.show('store', { id: '123456', label: 'Magasin de test, Ville-Test' }),
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
  // Le contenu lu en direct n'est pas celui que Repas avait mémorisé : le nombre de produits a été recalculé (DRV-613).
  'end-changes': () =>
    ui.show('end', {
      outcome: 'completed',
      added: 3,
      chosen: 0,
      haveAtHome: 0,
      skipped: 0,
      unavailable: 0,
      failed: 0,
      changes: [
        { name: 'Farine de blé', planned: 1, live: 10 },
        { name: 'Lait demi-écrémé', planned: 6, live: 2 },
      ],
    }),
  // Le panier avait déjà plus que le plan (conservé), ou la recherche ne disait pas la quantité (illisible) : ticket M.
  'end-cart': () =>
    ui.show('end', {
      outcome: 'completed',
      added: 3,
      chosen: 0,
      haveAtHome: 0,
      skipped: 0,
      unavailable: 0,
      failed: 0,
      kept: [{ name: 'Farine de blé', wanted: 2, inCart: 5 }],
      unreadable: [
        { name: 'Lait demi-écrémé', atLeast: 4 },
        { name: 'Sucre en poudre', atLeast: null },
      ],
    }),
  // Leclerc a mis trop de temps à répondre pour un article (ticket K).
  'end-slow': () =>
    ui.show('end', {
      outcome: 'partial',
      added: 3,
      chosen: 0,
      haveAtHome: 0,
      skipped: 0,
      unavailable: 0,
      failed: 1,
      slow: true,
    }),
  // L'anti-robot demande une vérification : un bandeau, la page reste visible derrière (ticket K).
  challenge: () => ui.show('challenge', {}),
  // L'entrée dans le magasin (DRV-625) : deux bandeaux sans bouton, la page reste visible derrière.
  'entry-opening': () => ui.show('entry', { stage: 'opening' }),
  'entry-manual': () => ui.show('entry', { stage: 'manual' }),
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
  // Des articles sans produit, avec la raison de chacun dans « Détails » (DRV-635).
  'end-reasons': () =>
    ui.show('end', {
      outcome: 'partial',
      added: 2,
      chosen: 0,
      haveAtHome: 0,
      skipped: 0,
      unavailable: 3,
      failed: 0,
      reasons: [
        { name: 'Farine', reason: 'OUT_OF_STOCK', tried: 1 },
        { name: 'Œufs', reason: 'NOT_FOUND', tried: 5 },
        { name: 'Sucre', reason: 'CART_REFUSED', tried: 1 },
      ],
    }),
  // Des produits choisis que le panier n'a pas pris : le choix est enregistré, une phrase par produit et pourquoi (DRV-644).
  'end-unreached': () =>
    ui.show('end', {
      outcome: 'completed',
      added: 2,
      chosen: 3,
      haveAtHome: 0,
      skipped: 0,
      unavailable: 0,
      failed: 0,
      unreached: [
        { label: 'Sirop de test Fraise 60cl', reason: 'COMING_SOON' },
        { label: 'Farine de test', reason: 'OUT_OF_STOCK' },
        { label: 'Biscuit sablé de test', reason: 'CART_REFUSED' },
      ],
    }),
  // Arrêté avant que rien ne soit mis au panier ni choisi : « Le panier n'est pas rempli » (DRV-626).
  'end-none': () =>
    ui.show('end', {
      outcome: 'partial',
      error: 'BLOCKED',
      added: 0,
      chosen: 0,
      haveAtHome: 0,
      skipped: 0,
      unavailable: 0,
      failed: 6,
    }),
  // L'envoi s'est arrêté sur une erreur : trois phrases (ce qui s'est passé, ce qui est sauf, l'action), jamais un code (DRV-622).
  'end-error': () =>
    ui.show('end', {
      outcome: 'error',
      error: 'NOT_LOGGED_IN',
      added: 0,
      chosen: 0,
      haveAtHome: 0,
      skipped: 0,
      unavailable: 0,
      failed: 0,
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
