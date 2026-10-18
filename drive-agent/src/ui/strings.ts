// Tous les textes de l'interface de l'agent, en français simple (tutoiement, phrases courtes). Aucun texte n'est écrit ailleurs.
import type { ErrorCode, LineStatus, Outcome } from '../../protocol'
import { own } from '../own'

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

/** La taille d'une réponse, jamais en six chiffres (un numéro de magasin y ressemblerait) : « 512 caractères », « 612,3 k caractères ». */
export function sizeText(length: number): string {
  return length < 1000
    ? `${length} caractère${length > 1 ? 's' : ''}`
    : `${(Math.round(length / 100) / 10).toFixed(1).replace('.', ',')} k caractères`
}

/** Ce que dit chaque forme de requête de recherche (`leclerc/search-request.ts`), pour le rapport du diagnostic. */
const VARIANT_LABELS: Record<string, string> = {
  a: 'requête courante',
  b: 'sans en-tête',
  c: 'Accept */*',
  g: 'ville tirée de la page',
  e1: 'sans ville',
  e2: 'adresse relative',
  f: 'sans Referer',
  h: 'sans cache',
}
export function variantLabel(variant: string): string {
  return own(VARIANT_LABELS, variant) ?? 'forme inconnue'
}

/** Une liste de noms séparés par des virgules, « aucun » si elle est vide. */
export function listText(names: readonly string[]): string {
  return names.length === 0 ? 'aucun' : names.join(', ')
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
      hostMobile: 'site mobile (pas la version ordinateur)',
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
      searchAttempts: (list: string) => `requêtes essayées (variante=code HTTP) : ${list}`,
      searchVariant: (variant: string) =>
        ` (passée par la requête ${variant} : ${variantLabel(variant)})`,
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
      /** Les compteurs de requêtes du diagnostic (ticket L) : des nombres seulement. */
      requests: (stats: {
        requests: number
        errors: number
        blocks: number
        timeouts: number
        slow: number
        peakPauseMs: number
      }) =>
        `Requêtes du diagnostic : ${stats.requests} (erreurs ${stats.errors}, blocages ${stats.blocks}, délais dépassés ${stats.timeouts}, réponses lentes ${stats.slow}), pause la plus longue ${stats.peakPauseMs} ms`,
    },
    /**
     * Les sondes du site réel (ticket B de l'audit du 2026-10-18) : des formes, des noms et des nombres, jamais une valeur du site. Elles disent
     * POURQUOI une recherche échoue (code HTTP, type, longueur, chemin demandé, variantes essayées) et ce que la page laisse voir.
     */
    probe: {
      title: 'Sondes du site (des formes, des noms et des nombres : aucune valeur du site) :',
      yes: 'oui',
      no: 'non',
      unknown: 'inconnu',
      notApplicable: 'sans objet',
      noReply: 'aucune réponse',
      inPage: 'page',
      inReply: (term: string) => `réponse « ${term} »`,
      address: (shape: string) => `Adresse d’arrivée : ${shape}`,
      city: (value: string) => `Suffixe de ville dans l’adresse de la page : ${value}`,
      cookies: (count: number, antiBot: string) =>
        `Cookies lisibles par la page : ${count} ; cookie de protection anti-robot : ${antiBot} (les cookies HttpOnly ne sont pas lisibles)`,
      arrival: (redirects: number | null, status: number | null) =>
        `Arrivée : ${
          redirects === null
            ? 'redirections non mesurables'
            : `${redirects} redirection${redirects > 1 ? 's' : ''} suivie${redirects > 1 ? 's' : ''} par le navigateur`
        }, ${status === null ? 'code HTTP non mesurable' : `HTTP ${status}`}`,
      delivery: (where: string, read: string, same: string) =>
        `Point de livraison (${where}) : lu ${read}, égal au numéro de l’adresse ${same}`,
      searchSkipped: (term: string) =>
        `Recherche « ${term} » : non faite (page non prise en charge, blocage ou recherche courante en échec)`,
      searchNoReply: (term: string, why: string | null) =>
        `Recherche « ${term} » : aucune réponse${why === null ? '' : ` (${why})`}`,
      searchReply: (
        term: string,
        reply: {
          status: number
          mime: string | null
          length: number
          redirected: boolean
          variant: string
        },
      ) =>
        `Recherche « ${term} » : HTTP ${reply.status}, contenu ${reply.mime ?? 'inconnu'}, ${sizeText(reply.length)}, ${
          reply.redirected ? 'redirigée' : 'non redirigée'
        }, requête ${reply.variant}`,
      requested: (requested: string, answered: string, variant: string) =>
        `Chemin demandé : ${requested} (requête ${variant} : ${variantLabel(variant)})${
          answered === requested ? '' : `, chemin de la réponse : ${answered}`
        }`,
      searchBase: (base: { shape: string; source: 'FORM' | 'LINK' } | null) =>
        `Chemin avec ville tiré de la page : ${
          base === null
            ? 'aucun'
            : `${base.shape} (${base.source === 'FORM' ? 'formulaire de recherche' : 'lien'})`
        }`,
      outcome: (term: string, result: string) => `Résultat « ${term} » : ${result}`,
      outcomeProducts: (n: number) => `${n} produit${n > 1 ? 's' : ''} lu${n > 1 ? 's' : ''}`,
      outcomeEmpty: 'aucun produit, liste vide reconnue',
      outcomeFailed: (error: string) => `erreur ${error}`,
      attempts: (term: string, list: string) =>
        `HTTP : ${list} (recherche « ${term} » ; d, le banc d’essai, envoie la même requête que a)`,
      attempt: (attempt: {
        variant: string
        status: number | null
        mime: string | null
        length: number | null
        address: string
      }) =>
        `Variante ${attempt.variant} (${variantLabel(attempt.variant)}) : ${
          attempt.status === null ? 'aucune réponse' : `HTTP ${attempt.status}`
        }, contenu ${attempt.mime ?? 'inconnu'}, ${attempt.length === null ? 'longueur inconnue' : sizeText(attempt.length)}, chemin ${attempt.address}`,
      phrases: (list: string) => `Mots de page d’erreur reconnus : ${list}`,
      session: (term: string, state: string) => `Connexion dans la réponse « ${term} » : ${state}`,
      keys: (
        term: string,
        keys: {
          total: number
          present: readonly string[]
          absent: readonly string[]
          session: readonly string[]
        },
      ) =>
        `Clés d’état de la réponse « ${term} » : ${keys.total} clés au total ; connues présentes (${keys.present.length}/${
          keys.present.length + keys.absent.length
        }) : ${listText(keys.present)} ; connues absentes : ${listText(keys.absent)} ; liées à la connexion : ${listText(keys.session)}`,
      headers: (term: string, names: readonly string[]) =>
        `En-têtes de la réponse « ${term} » (noms seulement) : ${listText(names)}`,
    },
  },
  /** Le test automatique de la variante de débogage (DRV-318) : l'écran de progression et le rapport texte copiable. */
  selftest: {
    title: 'Test automatique',
    starting: 'Démarrage…',
    /** Ce que l'écran de progression dit de l'étape en cours. */
    current: {
      check: 'Diagnostic de l’agent',
      search: (word: string) => `Recherche « ${word} »`,
      passage: (word: string) => `Essai au panier : ${word}`,
      cleanup: 'Retrait des produits d’essai',
      compare: 'Comparaison du panier',
    },
    reportReady: 'Rapport prêt, envoyé à l’application.',
    step: {
      check: 'Diagnostic de l’agent',
      store: 'Lecture du magasin',
      lot: (n: number) => `Lot de ${n} recherches`,
      passage: (n: number) => `Essai au panier (${n} produits au plus)`,
      compare: 'Panier avant et après',
    },
    text: {
      title: 'Repas Drive : test automatique',
      verdictOk: 'Verdict : OK',
      verdictKo: (n: number) => `Verdict : KO (${n} étape${n > 1 ? 's' : ''} en échec)`,
      verdictStopped: 'Verdict : INTERROMPU (arrêt demandé)',
      duration: (time: string) => `Durée totale : ${time}`,
      halt: (why: string) => `Arrêt : ${why}. Les étapes suivantes ne sont pas jouées.`,
      haltRepeated: 'trois recherches de suite sans résultat',
      wordOk: (found: number, content: number, price: number) =>
        `${found} produits, contenu net lu ${content}, prix lus ${price}`,
      wordNone: 'aucun produit lu',
      notTested: 'non testé',
      lotSummary: (planned: number, done: number, ok: number, average: string) =>
        `${planned} prévues, ${done} faites, ${ok} réussies, temps moyen ${average}`,
      storeRead: (host: string, store: string, label: string) =>
        `hôte ${host}, magasin ${store}, libellé ${label}`,
      labelKnown: 'présent',
      labelUnknown: 'absent',
      noEligible: 'aucun produit éligible (en stock, hors panier, prix lu)',
      add: 'ajout 1',
      set: (quantity: number) => `mise à ${quantity}`,
      remove: 'retrait',
      write: (what: string, http: number | null, obtained: number | null) =>
        `${what} : ${http === null ? 'sans réponse' : `HTTP ${http}`}, obtenu ${obtained ?? 'non lu'}`,
      otherFailure: 'erreur inattendue',
      items: (before: string, after: string, derived: boolean) =>
        `articles : ${before} avant${derived ? ' (déduit de la première réponse)' : ''}, ${after} après`,
      total: (before: string, after: string) => `total : ${before} avant, ${after} après`,
      unknown: 'non lu',
      noWrite: 'aucun produit ajouté : le panier n’a pas été touché',
      back: 'le panier est revenu à son état initial',
      differs: 'le panier n’est PAS revenu à son état initial',
      unreadable: 'le panier n’a pas pu être relu après le retrait',
      leftovers: (labels: string) => `à retirer à la main : ${labels}`,
      noOrder: 'Aucune commande, aucun paiement.',
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
    /** Le nom n'a rien donné : l'agent a essayé une autre forme (« oeuf » pour « œuf ») et dit laquelle a répondu. */
    resultsInstead: (query: string, asked: string) =>
      `Résultats pour « ${query} » (rien trouvé pour « ${asked} »)`,
    none: (query: string) => `Aucun produit trouvé pour « ${query} ». Essaie un autre mot.`,
    network: 'Le site ne répond pas. Réessaie dans un instant.',
    /** La requête a dépassé son délai d'attente (ticket K) : Leclerc répond, mais trop lentement. */
    slow: 'Leclerc met trop de temps à répondre. Réessaie dans un instant.',
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
    /** Le nombre de produits a été calculé sur le contenu lu sur le site, pas sur celui que Repas avait mémorisé (DRV-613). */
    changes: {
      title: 'Contenu différent de celui mémorisé',
      text: 'Le nombre de produits a été calculé sur le contenu lu sur le site. Vérifie ces lignes dans ton panier.',
      item: (name: string, planned: number, live: number) =>
        `${name} : ${live} au lieu de ${planned}`,
    },
    /** Une requête a dépassé son délai d'attente : l'envoi peut se relancer, ce qui est au panier n'est pas touché (ticket K). */
    slow: 'Leclerc a mis trop de temps à répondre. Relance l’envoi dans un moment : ce qui est déjà au panier n’est pas touché.',
    /** Le panier avait déjà plus que le plan : Repas ne réduit jamais une quantité déjà au panier (ticket M). */
    kept: {
      title: 'Quantités déjà au panier',
      text: 'Repas ne réduit jamais une quantité déjà au panier : ces lignes sont restées telles quelles.',
      item: (name: string, inCart: number) => `${name} — Déjà ${inCart} au panier : conservé`,
    },
    /** La recherche ne donnait pas la quantité déjà au panier : Repas n'a pas pu s'en assurer (ticket M). */
    unreadable: {
      title: 'Quantité au panier illisible',
      text: 'Leclerc n’a pas dit ce que ton panier contenait déjà pour ces lignes. Vérifie-les dans ton panier.',
      item: (name: string, atLeast: number | null) =>
        atLeast === null
          ? `${name} — vérifie dans ton panier`
          : `${name} — au moins ${atLeast} gardés, vérifie dans ton panier`,
    },
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
    slow: (name: string) => `${name} : Leclerc met trop de temps à répondre`,
  },
  /** La demande de vérification de l'anti-robot (ticket K) : un bandeau en bas de l'écran, pour que la page reste visible. */
  challenge: {
    title: 'Leclerc demande une vérification',
    text: 'Fais-la dans la page, puis touche Reprendre.',
    reload: 'Si rien ne s’affiche, recharge la page : ton avancement est gardé.',
    resume: 'Reprendre',
    stop: 'Arrêter',
  },
  error: {
    close: 'Fermer',
    back: 'Retourner dans Repas',
  },
} as const

/**
 * Le titre et le conseil d'une cause qui en a de plus précis que ceux de son code d'erreur (ticket J : le site mobile). Une table lue par `own` :
 * la cause vient d'un code fixe, mais ne l'indexe jamais en direct.
 */
export const CAUSE_TEXTS: Readonly<Record<string, { title: string; text: string }>> = {
  PAGE_MOBILE: {
    title: 'Ce n’est pas la version ordinateur du site',
    text: 'Leclerc affiche son site mobile, et Repas ne sait travailler que sur la version ordinateur. Dans l’application Repas, ouvre « Ouvrir le drive Leclerc » depuis le menu, puis relance l’envoi depuis Repas.',
  },
}

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
    text: 'Leclerc a modifié son site. Mets à jour l’application Repas, puis réessaie.',
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
