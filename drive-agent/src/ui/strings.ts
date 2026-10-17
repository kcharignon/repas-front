// Tous les textes de l'interface de l'agent, en français simple (tutoiement, phrases courtes). Aucun texte n'est écrit ailleurs.
import type { ErrorCode, LineStatus, Outcome } from '../../protocol'

/** « 1 produit », « 3 produits » : le nombre suivi du bon mot. */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export const S = {
  dialog: 'Repas : envoi de ta liste au drive',
  welcome: {
    title: 'Ouvre d’abord Repas',
    text: 'Pour remplir ton panier, commence dans Repas : choisis ta liste de courses, puis envoie-la au drive.',
    diagnostic: 'Diagnostic',
    close: 'Fermer',
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
