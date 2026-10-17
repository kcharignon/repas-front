// Tous les textes de l'interface de l'agent, en français simple (tutoiement, phrases courtes). Aucun texte n'est écrit ailleurs.
import type { ErrorCode, LineStatus, Outcome } from '../../protocol'

/** « 1 produit », « 3 produits » : le nombre suivi du bon mot. */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Un nombre à la française : virgule décimale, deux décimales au plus (« 1,5 »). */
export function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',')
}

/** Un prix en centimes : « 2,58 € ». */
export function formatPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

/** Un contenu net en unités de base : « 500 g », « 1,5 kg », « 1 L », « 6 pièces ». */
export function formatContent(value: number, unit: 'g' | 'ml' | 'piece'): string {
  if (unit === 'piece') return `${formatNumber(value)} ${value < 2 ? 'pièce' : 'pièces'}`
  if (value >= 1000) return `${formatNumber(value / 1000)} ${unit === 'g' ? 'kg' : 'L'}`
  return `${formatNumber(value)} ${unit}`
}

/** Le prix à l'unité de mesure : « 5,16 € / kg ». */
export function formatMeasure(cents: number, unit: 'kg' | 'l' | 'piece'): string {
  return `${formatPrice(cents)} / ${unit === 'l' ? 'L' : unit === 'piece' ? 'pièce' : 'kg'}`
}

export const S = {
  dialog: 'Repas : envoi de ta liste au drive',
  welcome: {
    title: 'Ouvre d’abord Repas',
    text: 'Pour remplir ton panier, commence dans Repas : choisis ta liste de courses, puis envoie-la au drive.',
    diagnostic: 'Diagnostic',
    close: 'Fermer',
  },
  /** Le diagnostic (DRV-308) : l'écran et le rapport texte copiable. Le rapport ne contient jamais de donnée personnelle. */
  diagnostic: {
    title: 'Diagnostic',
    intro: 'Je vérifie que le site répond comme prévu. Rien n’est écrit dans ton panier.',
    running: 'Contrôles en cours…',
    finished: (ok: number, ko: number, skipped: number) =>
      `Contrôles terminés : ${ok} réussi${ok > 1 ? 's' : ''}, ${ko} en échec, ${skipped} non testé${skipped > 1 ? 's' : ''}.`,
    list: 'Contrôles',
    report: 'Rapport à copier',
    privacy:
      'Ce rapport ne contient ni cookie, ni identifiant de compte, ni adresse, ni nom, ni numéro de magasin complet.',
    copy: 'Copier le rapport',
    copied: 'Rapport copié.',
    copyFailed: 'Copie impossible : sélectionne le texte du rapport et copie-le.',
    close: 'Fermer',
    badge: { OK: 'OK', KO: 'KO', NOT_TESTED: 'NON TESTÉ', wait: '…' },
    check: {
      agent: 'Version de l’agent',
      page: 'Page prise en charge',
      origin: 'Origine de Repas dans l’agent',
      session: 'Stockage de session',
      wakeLock: 'Écran allumé (Wake Lock)',
      search: 'Recherche d’un mot courant',
      content: 'Contenu net des produits',
      frame: 'Cadre de même origine',
    },
    detail: {
      version: (version: string) => `version ${version}`,
      page: (host: string, store: string) => `hôte ${host}, magasin ${store}`,
      hostOther: 'autre hôte leclercdrive.fr',
      originOk: 'origine écrite dans l’agent',
      originMissing: 'origine non remplacée dans l’agent',
      originBridge: 'pont de l’application : pas d’origine à vérifier',
      sessionOk: 'lecture et écriture possibles',
      sessionKo: 'stockage de session inaccessible : pas de reprise possible',
      wakeLockOk: 'disponible',
      wakeLockKo: 'absent (toléré : l’écran peut s’éteindre)',
      pageSkipped: 'page non prise en charge',
      searchOk: (term: string, read: number, complete: number) =>
        `« ${term} » : ${read} produits lus, ${complete} avec tous les champs attendus (identifiant, libellé, prix, stock)`,
      searchEmpty: (term: string) => `« ${term} » : aucun produit lu`,
      searchIncomplete: (term: string, read: number, complete: number) =>
        `« ${term} » : ${read} produits lus, seulement ${complete} avec tous les champs attendus`,
      searchFailed: 'recherche impossible, contenu non analysé',
      contentOk: (known: number, read: number) => `${known} produits sur ${read}`,
      contentKo: (known: number, read: number) => `seulement ${known} produits sur ${read}`,
      frameSkipped: 'non utilisé : l’agent affiche lui-même la liste de produits',
    },
    /** Les lignes du rapport copiable. */
    text: {
      title: 'Repas Drive : diagnostic',
      agent: (version: string) => `Agent : ${version}`,
      date: (date: string) => `Date : ${date}`,
      host: (host: string) => `Hôte : ${host}`,
      store: (store: string) => `Magasin : ${store}`,
      noWrite: 'Aucune écriture au panier.',
    },
  },
  /** Le mode configuration (DRV-307) : lire le magasin de la page et le donner à Repas. */
  store: {
    title: 'Enregistrer ce magasin dans Repas ?',
    text: (name: string) => `Repas retiendra ce magasin pour préparer tes envois : ${name}.`,
    unnamed: (id: string) => `magasin n° ${id}`,
    notice:
      'Seul le magasin est transmis. Aucune donnée de ton compte Leclerc ne quitte cette page.',
    save: 'Enregistrer',
    cancel: 'Annuler',
  },
  summary: {
    title: 'Prêt à remplir ton panier',
    intro:
      'Voici ce que Repas va faire sur le drive. Rien ne part tant que tu n’as pas touché « Commencer ».',
    known: (n: number) => `${count(n, 'produit connu', 'produits connus')} à mettre au panier`,
    new: (n: number) => `${count(n, 'nouveau produit', 'nouveaux produits')} à choisir`,
    haveAtHome: (n: number) => `${n} « j’en ai toujours »`,
    skipped: (n: number) => count(n, 'ignoré', 'ignorés'),
    list: 'Voir la liste',
    status: {
      KNOWN: 'connu',
      NEW: 'à choisir',
      HAVE_AT_HOME: 'j’en ai toujours',
      SKIP: 'ignoré',
    } satisfies Record<LineStatus, string>,
    keepCart: 'Repas ne vide pas ton panier Leclerc.',
    noOrder: 'Rien n’est commandé ni payé.',
    start: 'Commencer',
    cancel: 'Annuler',
  },
  resume: {
    title: 'Reprendre où tu t’étais arrêté ?',
    text: (done: number, total: number) =>
      `${done} lignes sur ${total} sont déjà faites. Reprendre ne les refait pas.`,
    resume: 'Reprendre',
    restart: 'Recommencer',
    cancel: 'Annuler',
  },
  progress: {
    title: 'Remplissage du panier',
    bar: 'Avancement',
    count: (done: number, total: number) => `${done} sur ${total}`,
    current: (name: string) => `En cours : ${name}`,
    log: 'Dernières actions',
    keepOpen: 'Garde cet écran ouvert jusqu’à la fin.',
    stop: 'Arrêter',
    stopping: 'J’arrête après la ligne en cours…',
  },
  quantity: {
    title: 'Vérifie la quantité',
    text: (product: string, ingredient: string) => `Combien de « ${product} » pour ${ingredient} ?`,
    label: 'Nombre de produits (de 1 à 99)',
    invalid: 'Entre un nombre entier de 1 à 99.',
    validate: 'Valider',
    skip: 'Passer',
  },
  chooser: {
    group: 'Choix de produit',
    counter: (position: number, total: number) => `${position} sur ${total}`,
    skip: 'Passer cette fois',
    haveAtHome: 'J’en ai toujours',
    cancel: 'Annuler le passage',
  },
  /** La liste de produits que l'agent affiche dans l'écran de choix (DRV-306). */
  picker: {
    list: 'Produits proposés',
    need: (asked: string) => `Il te faut : ${asked}.`,
    replaces: (product: string) => `Tu remplaces : ${product}.`,
    gone: (labels: string) => `Ces produits ne sont plus disponibles : ${labels}.`,
    never: (product: string) => `Ne plus jamais prendre ${product}`,
    searchLabel: 'Chercher autre chose',
    searchButton: 'Chercher',
    searching: 'Recherche en cours…',
    adding: 'Ajout au panier…',
    results: (query: string) => `Résultats pour « ${query} »`,
    none: (query: string) => `Aucun produit trouvé pour « ${query} ». Essaie un autre mot.`,
    network: 'Le site ne répond pas. Réessaie dans un instant.',
    choose: 'Choisir',
    out: 'Indisponible',
    refused: 'Produit refusé',
    refusedHint: 'Tu as refusé ce produit : Repas ne le prend jamais.',
    outHint: 'Plus en stock.',
    promo: (price: string) => `En promotion : ${price}`,
    unknownContent: 'Contenu inconnu : tu choisiras la quantité.',
    noLabel: (id: string) => `Produit ${id}`,
    /** « 800 g demandés, 500 g par produit : 2 » pour un poids ou un volume ; sinon « Demandé : 2 paquet. À mettre au panier : 2. » */
    pack: (asked: string, measure: boolean, plural: boolean, per: string | null, packs: number) =>
      measure
        ? `${asked} ${plural ? 'demandés' : 'demandé'}, ${per ?? '?'} par produit : ${packs}`
        : `Demandé : ${asked}${per === null ? '' : `, ${per} par produit`}. À mettre au panier : ${packs}.`,
    cartRefused: 'Leclerc n’a pas pu mettre ce produit au panier. Choisis-en un autre.',
  },
  placement: {
    title: (product: string) => `Que fais-tu de « ${product} » ?`,
    text: (ingredient: string) => `C’est un autre produit pour ${ingredient}.`,
    primary: 'Mon nouveau produit préféré',
    primaryHint: 'Repas le prendra en premier ; les autres restent en secours.',
    fallback: 'Produit de secours',
    fallbackHint: 'Repas le prendra après les autres, s’ils ne sont pas disponibles.',
    once: 'Seulement cette fois',
    onceHint: 'Repas ne le retient pas.',
    back: 'Revenir à la liste',
  },
  end: {
    title: {
      completed: 'Panier rempli',
      partial: 'Panier rempli en partie',
      aborted: 'Envoi arrêté',
      error: 'Envoi interrompu',
    } satisfies Record<Outcome, string>,
    completedHint: 'Vérifie ton panier sur Leclerc avant de commander.',
    added: (n: number) => `Ajoutés : ${n}`,
    chosen: (n: number) => `Choisis : ${n}`,
    haveAtHome: (n: number) => `J’en ai toujours : ${n}`,
    skipped: (n: number) => `Passés : ${n}`,
    unavailable: (n: number) => `Indisponibles : ${n}`,
    failed: (n: number) => `Échecs : ${n}`,
    back: 'Retourner dans Repas',
  },
  /** Les lignes du journal de progression (une par ingrédient traité). */
  log: {
    added: (name: string) => `${name} : ajouté`,
    addedBackup: (name: string) => `${name} : ajouté, produit de secours`,
    haveAtHome: (name: string) => `${name} : tu en as toujours`,
    skipped: (name: string) => `${name} : passé`,
    toChoose: (name: string) => `${name} : à choisir ensuite`,
    unavailable: (name: string) => `${name} : plus disponible, à choisir ensuite`,
    failed: (name: string) => `${name} : échec`,
  },
  error: {
    close: 'Fermer',
    back: 'Retourner dans Repas',
  },
} as const

/** Le titre et le conseil de chaque erreur du protocole. */
export const ERROR_TEXTS: Record<ErrorCode, { title: string; text: string }> = {
  NOT_LOGGED_IN: {
    title: 'Tu n’es pas connecté',
    text: 'Connecte-toi à Leclerc, puis relance l’envoi depuis Repas.',
  },
  STORE_MISMATCH: {
    title: 'Ce n’est pas le bon magasin',
    text: 'Repas a préparé ta liste pour un autre magasin. Ouvre le magasin choisi dans Repas, puis relance l’envoi.',
  },
  BLOCKED: {
    title: 'Leclerc a ralenti les requêtes',
    text: 'Attends quelques minutes, puis recharge la page et relance l’envoi.',
  },
  CONTRACT_CHANGED: {
    title: 'Le site a changé',
    text: 'Leclerc a modifié son site. Mets à jour l’application Repas Drive, puis réessaie.',
  },
  NETWORK: {
    title: 'Le site ne répond pas',
    text: 'Vérifie ta connexion, puis relance l’envoi depuis Repas.',
  },
  CANCELLED: {
    title: 'Envoi annulé',
    text: 'Tu as annulé l’envoi. Ton panier Leclerc n’a pas été touché.',
  },
  INVALID_MESSAGE: {
    title: 'Liste illisible',
    text: 'Repas a envoyé une liste que je ne comprends pas. Relance l’envoi depuis Repas.',
  },
  UNSUPPORTED_PAGE: {
    title: 'Page non prise en charge',
    text: 'Ouvre la page d’un magasin sur le drive, puis relance l’envoi depuis Repas.',
  },
}
