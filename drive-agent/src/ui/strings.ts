// Tous les textes de l'interface de l'agent, en français simple (tutoiement, phrases courtes, mots du glossaire de principes-produit.md § 5). Aucun texte n'est écrit ailleurs.
// Le diagnostic et le test automatique sont des outils du mainteneur : exemptés du glossaire, pas du tutoiement. Gardé par src/i18n/__tests__/voice-and-glossary.spec.ts.
import type { ErrorCode, LineStatus, Outcome } from '../../protocol'
import { own } from '../own'
import type { UnavailableReason } from './types'

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

/** Ce que la liste demande pour un article : « 800 g » (la quantité et son unité), `null` quand le plan ne le dit pas. */
export function formatNeeded(
  needed: { quantity: number; unitSymbol: string } | null | undefined,
): string | null {
  return needed ? `${formatNumber(needed.quantity)} ${needed.unitSymbol}` : null
}

/** Les articles de la liste rangés par ce qui leur arrive : ce qu'il faut pour écrire la phrase de synthèse. */
export interface SummaryCounts {
  known: number
  new: number
  haveAtHome: number
  skipped: number
}

/**
 * La phrase de synthèse de l'écran « Prêt à remplir ton panier » : « 6 articles : 2 sont déjà choisis, 4 sont à choisir sur Leclerc. » C'est
 * MOT POUR MOT celle de l'écran de l'envoi de Repas (`sendSummary`, `src/features/drive/sendSummary.ts`, textes `driveSend.summary` de `fr.ts`) :
 * `src/features/drive/__tests__/summarySentence.spec.ts` le prouve sur toutes les combinaisons. On n'écrit que ce qui existe (jamais « 0 »), et
 * « j'en ai toujours » et « pas cette fois » se disent ensemble : ni l'un ni l'autre n'ira au panier. Vide quand il n'y a aucun article.
 */
export function summarySentence(counts: SummaryCounts): string {
  const other = counts.haveAtHome + counts.skipped
  const total = counts.known + counts.new + other
  if (total === 0) return ''

  const part = (n: number, all: string, some: string): string[] =>
    n === 0 ? [] : [n === total ? all : `${n} ${some}`]
  const parts = [
    ...part(
      counts.known,
      total === 1 ? 'il est déjà choisi' : 'tous sont déjà choisis',
      counts.known === 1 ? 'est déjà choisi' : 'sont déjà choisis',
    ),
    ...part(
      counts.new,
      total === 1 ? 'il est à choisir sur Leclerc' : 'tous sont à choisir sur Leclerc',
      counts.new === 1 ? 'est à choisir sur Leclerc' : 'sont à choisir sur Leclerc',
    ),
    ...part(
      other,
      total === 1 ? 'il ne sera pas mis au panier' : 'aucun ne sera mis au panier',
      other === 1 ? 'ne sera pas mis au panier' : 'ne seront pas mis au panier',
    ),
  ]

  return `${count(total, 'article', 'articles')} : ${parts.join(', ')}.`
}

export const S = {
  dialog: 'Repas : envoi de ta liste au drive',
  welcome: {
    title: 'Ouvre d’abord Repas',
    text: 'Pour remplir ton panier, choisis ta liste dans Repas, puis envoie-la.',
    diagnostic: 'Diagnostic',
    close: 'Fermer',
  },
  /** Le diagnostic (DRV-308) : l'écran et le rapport texte copiable. Le rapport ne contient jamais de donnée personnelle. */
  diagnostic: {
    title: 'Diagnostic',
    intro: 'Je vérifie que le site répond comme prévu.',
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
      /** Un lien de la page (DRV-625) : présent ou non, la forme de son adresse et où il mène. Jamais l'adresse. */
      link: (
        name: string,
        link: { present: boolean; shape: string | null; where: string | null },
      ) =>
        `${name} : ${link.present ? 'oui' : 'non'}${
          link.present
            ? `, adresse ${link.shape ?? 'sans adresse (bouton)'}${link.where === null ? '' : `, ${link.where}`}`
            : ''
        }`,
      startLink: 'Lien « Commencer mes courses » dans la page',
      /** « Commencer mes courses » : absent, ou un bouton sans adresse que l'agent sait cliquer (oui / non). Jamais d'adresse. */
      start: (present: boolean, clickable: boolean) =>
        present
          ? `« Commencer mes courses » : bouton cliquable : ${clickable ? 'oui' : 'non'}`
          : '« Commencer mes courses » : absent de la page',
      /** La page du panier (`detail-panier.aspx` sous le chemin du magasin) : connue quand la page montre le chemin du magasin avec la ville. */
      basketPage: (known: string) =>
        `Page du panier (detail-panier.aspx sous le chemin du magasin) : ${known}`,
      where: {
        RELATIVE: 'adresse sans site',
        SAME_HOST: 'même hôte que la page',
        LECLERC_HOST: 'autre hôte leclercdrive.fr',
        OTHER_SITE: 'autre site',
      } as Record<string, string>,
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
      attempts: (term: string, list: string) => `HTTP : ${list} (recherche « ${term} »)`,
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
      /** DRV-635 : le stock et l'étiquette de disponibilité d'un échantillon de résultats (12 au plus), des nombres seulement, jamais un libellé. */
      availability: (a: {
        sampled: number
        zeroStock: number
        stocked: number
        unreadable: number
      }) =>
        `Disponibilité de l’échantillon (${a.sampled} produits) : iQteDisponible à 0 : ${a.zeroStock}, positif : ${a.stocked}, illisible : ${a.unreadable}`,
      availabilityLabels: (values: string, unread: number, soon: number) =>
        `eDisponibilite (valeur : produits) : ${values} ; absente ou illisible : ${unread} ; « Bientôt disponible » : ${soon}`,
      /** Les raisons du dernier envoi, par produit habituel écarté, dans l'ordre du passage : un mot fixe et un nombre, jamais un libellé. */
      lastPass: (list: string) => `Dernier envoi, produits habituels écartés : ${list}`,
      /** Les raisons, pour le mainteneur (le diagnostic est exempté du glossaire) : les mots de DRV-635. */
      reason: {
        OUT_OF_STOCK: 'en rupture',
        NOT_FOUND: 'introuvable',
        CART_REFUSED: 'refusé par le panier',
      } satisfies Record<UnavailableReason, string>,
      lastPassItem: (rank: number, reason: string, tried: number) =>
        `${rank} : ${reason} (${tried} recherche${tried > 1 ? 's' : ''})`,
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
    title: 'Utiliser ce magasin ?',
    unnamed: (id: string) => `Magasin n° ${id}`,
    save: 'Utiliser ce magasin',
    cancel: 'Annuler',
  },
  summary: {
    title: 'Prêt à remplir ton panier',
    /** La phrase de l'écran de l'envoi de Repas, mot pour mot : voir `summarySentence`. L'écran n'écrit jamais un compteur à zéro. */
    sentence: summarySentence,
    list: 'Voir la liste',
    status: {
      KNOWN: 'connu',
      NEW: 'à choisir',
      HAVE_AT_HOME: 'j’en ai toujours',
      SKIP: 'pas cette fois',
    } satisfies Record<LineStatus, string>,
    start: 'Commencer',
    cancel: 'Annuler',
  },
  resume: {
    title: 'Reprendre là où tu en étais ?',
    text: (done: number, total: number) =>
      `${done} article${done > 1 ? 's' : ''} sur ${total} ${done > 1 ? 'sont déjà faits' : 'est déjà fait'}.`,
    resume: 'Reprendre',
    restart: 'Recommencer',
    cancel: 'Annuler',
  },
  progress: {
    title: 'Ton panier se remplit',
    bar: 'Avancement',
    count: (done: number, total: number) => `${done} sur ${total}`,
    current: (name: string) => `En cours : ${name}`,
    log: 'Dernières actions',
    keepOpen: 'Garde l’application ouverte.',
    stop: 'Arrêter',
    stopping: 'J’arrête après l’article en cours…',
  },
  quantity: {
    title: 'Vérifie la quantité',
    text: (product: string, ingredient: string) => `Combien de « ${product} » pour ${ingredient} ?`,
    label: 'Nombre de produits (de 1 à 99)',
    invalid: 'Entre un nombre entier de 1 à 99.',
    validate: 'Valider',
    skip: 'Pas cette fois',
  },
  chooser: {
    group: 'Choix de produit',
    counter: (position: number, total: number) => `${position} sur ${total}`,
    skip: 'Pas cette fois',
    haveAtHome: 'J’en ai toujours',
    /**
     * « Pas cette fois » pour cet article et tous ceux qui restent à choisir (DRV-624) : `n` les compte tous, celui-ci compris, et le bouton le dit
     * (« Passer ces 4 articles » à « Poivre (1 sur 4) » : le poivre est passé aussi, DRV-626). Le bouton de la confirmation porte le même texte.
     */
    rest: (n: number) => `Passer ces ${n} articles`,
    /** La confirmation d'une ligne, quand un des articles passés n'a encore aucun produit retenu : la même chose que le bouton, au futur. */
    restSure: (n: number) => `Ces ${n} articles ne seront pas mis au panier.`,
    restBack: 'Revenir au choix',
    cancel: 'Annuler l’envoi',
  },
  /** La liste de produits que l'agent affiche dans l'écran de choix (DRV-306). */
  picker: {
    list: 'Produits proposés',
    need: (asked: string) => `Il te faut : ${asked}.`,
    replaces: (product: string) => `Tu remplaces : ${product}.`,
    gone: (labels: string) => `Ces produits ne sont plus disponibles : ${labels}.`,
    never: (product: string) => `Ne plus proposer ${product}`,
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
    refused: 'Ne plus proposer',
    refusedHint: 'Déjà écarté de tes choix.',
    outHint: 'Plus en stock.',
    promo: (price: string) => `En promotion : ${price}`,
    unknownContent: 'Contenu inconnu : tu choisiras la quantité.',
    noLabel: (id: string) => `Produit ${id}`,
    /** Le nombre à mettre au panier : « 500 g par produit : 2 produits. » (la quantité demandée est dite plus haut : « Il te faut : 800 g. »). */
    pack: (per: string | null, packs: number) =>
      per === null
        ? `À mettre au panier : ${count(packs, 'produit', 'produits')}.`
        : `${per} par produit : ${count(packs, 'produit', 'produits')}.`,
    /** Le panier n'a rien pris de ce produit (DRV-635) : on le nomme, la liste reste affichée. */
    cartRefused: (product: string) =>
      `Leclerc n’a pas pu mettre « ${product} » au panier. Choisis-en un autre.`,
    /** Aucune recherche n'a retrouvé ce produit habituel (DRV-635) : il n'est pas dit indisponible, la recherche est préremplie. */
    notFound: (product: string) =>
      `Je ne retrouve pas « ${product} » : cherche-le ou choisis-en un autre.`,
  },
  /** Le produit choisi n'est pas celui que Repas retenait (DRV-624) : une question, deux réponses. L'ordre des produits reste l'affaire de Repas. */
  placement: {
    title: 'Toujours prendre ce produit ?',
    text: (product: string, ingredient: string) =>
      `Tu as choisi « ${product} » pour ${ingredient}.`,
    always: 'Toujours prendre celui-ci',
    once: 'Cette fois seulement',
    back: 'Revenir à la liste',
  },
  /**
   * L'écran de fin (DRV-622) : les mêmes titres que le récapitulatif de Repas, et la même règle : on n'écrit que ce qui existe (jamais un compteur à
   * zéro, ni « Échecs » ni « Prix lus »). Le titre dit le résultat ; le texte dit, en trois phrases au plus, ce qui s'est passé, ce qui est sauf et
   * l'action. La seule action de l'écran est de retourner dans Repas.
   */
  end: {
    title: {
      completed: 'Le panier est rempli',
      partial: 'Le panier est rempli en partie',
      aborted: 'Tu as arrêté l’envoi',
      error: 'L’envoi s’est arrêté',
    } satisfies Record<Outcome, string>,
    /** Un envoi arrêté avant que rien ne soit mis au panier ni choisi : « en partie » serait faux (DRV-626). Le même mot que le récapitulatif de Repas. */
    notFilled: 'Le panier n’est pas rempli',
    completed: 'Tes produits sont dans ton panier Leclerc. Retourne dans Repas pour le finaliser.',
    /** Ce qui est sauf : rien de ce qui est déjà au panier n'est retiré. */
    safe: 'Ce qui est déjà au panier y reste.',
    /** Ce qui est sauf et ce qu'il reste à ajouter, quand l'envoi s'est arrêté avant la fin. */
    safeLeft: (n: number) =>
      `Ce qui est déjà au panier y reste : il reste ${count(n, 'article', 'articles')} à ajouter.`,
    stopped: 'L’envoi s’est arrêté avant la fin.',
    notFinished: 'L’envoi n’a pas pu aller au bout.',
    resume: 'Retourne dans Repas pour reprendre l’envoi.',
    added: (n: number) => `Ajoutés au panier : ${n}`,
    chosen: (n: number) => `Choisis sur Leclerc : ${n}`,
    haveAtHome: (n: number) => `J’en ai toujours : ${n}`,
    skipped: (n: number) => `Pas cette fois : ${n}`,
    unavailable: (n: number) => `Indisponibles : ${n}`,
    /** Le nombre de produits a été calculé sur le contenu lu sur le site, pas sur celui dont Repas se souvenait (DRV-613) : l'écran dit seulement quoi vérifier. */
    changes: {
      title: 'Quantités changées',
      text: 'Vérifie ces articles dans ton panier.',
      item: (name: string, planned: number, live: number) =>
        `${name} : ${live} au lieu de ${planned}`,
    },
    /** Une requête a dépassé son délai d'attente (ticket K) : ce qui s'est passé. Ce qui est sauf et l'action sont dans le texte de l'écran, juste au-dessus. */
    slow: 'Leclerc a mis trop de temps à répondre.',
    /** Le panier avait déjà plus que le plan : ces articles restent tels quels (ticket M ; le fond est dans les conditions d'utilisation du drive). */
    kept: {
      title: 'Quantités déjà au panier',
      text: 'Ces articles sont restés tels quels.',
      item: (name: string, inCart: number) => `${name} — Déjà ${inCart} au panier : conservé`,
    },
    /** La recherche ne donnait pas la quantité déjà au panier : Repas n'a pas pu s'en assurer (ticket M). */
    unreadable: {
      title: 'Quantité au panier illisible',
      text: 'Leclerc n’a pas donné la quantité déjà au panier. Vérifie ces articles dans ton panier.',
      item: (name: string, atLeast: number | null) =>
        atLeast === null ? name : `${name} — au moins ${atLeast} gardés`,
    },
    /** Pourquoi des articles n'ont pas de produit (DRV-635), dans un bloc « Détails » replié : la raison et le nombre de recherches faites. */
    reasons: {
      title: 'Détails',
      reason: {
        OUT_OF_STOCK: 'en rupture',
        NOT_FOUND: 'introuvable',
        CART_REFUSED: 'pas pris par le panier',
      } satisfies Record<UnavailableReason, string>,
      item: (name: string, reason: string, tried: number) =>
        `${name} — ${reason}, ${count(tried, 'recherche', 'recherches')}`,
    },
    back: 'Retourner dans Repas',
  },
  /** Les lignes du journal de progression (une par article traité). */
  log: {
    added: (name: string) => `${name} : ajouté`,
    addedBackup: (name: string) => `${name} : ajouté, produit de remplacement`,
    haveAtHome: (name: string) => `${name} : j’en ai toujours`,
    skipped: (name: string) => `${name} : pas cette fois`,
    toChoose: (name: string) => `${name} : à choisir ensuite`,
    unavailable: (name: string) => `${name} : plus disponible, à choisir ensuite`,
    failed: (name: string) => `${name} : échec`,
    notFound: (name: string) => `${name} : produit introuvable, à choisir ensuite`,
    cartRefused: (name: string) => `${name} : pas pris par le panier, à choisir ensuite`,
    /** Le site disait ce produit en rupture et le panier l'a pourtant pris (DRV-635). */
    acceptedAnyway: (name: string) => `${name} : ajouté, Leclerc l’a accepté`,
    slow: (name: string) => `${name} : Leclerc met trop de temps à répondre`,
  },
  /** La demande de vérification de l'anti-robot (ticket K) : un bandeau en bas de l'écran, pour que la page reste visible. */
  challenge: {
    title: 'Leclerc demande une vérification',
    text: 'Fais-la dans la page, puis touche Reprendre.',
    resume: 'Reprendre',
    stop: 'Arrêter',
  },
  /** L'entrée dans le magasin (DRV-625) : ce qui se passe, ou le seul geste à faire. Un bandeau, la page reste visible. */
  entry: {
    opening: 'Ouverture de ton magasin…',
    manual: 'Touche « Commencer mes courses ».',
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
    text: 'Leclerc affiche son site mobile. Repas ne travaille que sur la version ordinateur. Ce qui est déjà au panier y reste. Ouvre « Ouvrir le drive Leclerc » dans le menu de l’application, puis reprends l’envoi.',
  },
}

/**
 * Chaque erreur du protocole, en trois phrases (principes-produit.md § 4) : ce qui s'est passé (`happened`), ce qui est sauf (la même phrase
 * partout : rien de ce qui est déjà au panier n'est retiré) et une action (`action`). Le titre part aussi dans le message du résultat.
 */
const ERROR_PARTS: Record<ErrorCode, { title: string; happened: string; action: string }> = {
  NOT_LOGGED_IN: {
    title: 'Tu n’es pas connecté',
    happened: 'Tu n’es pas connecté à Leclerc.',
    action: 'Connecte-toi à Leclerc, puis reprends l’envoi depuis Repas.',
  },
  STORE_MISMATCH: {
    title: 'Ce n’est pas le bon magasin',
    happened: 'Repas a préparé ta liste pour un autre magasin.',
    action: 'Ouvre ton magasin sur Leclerc, puis reprends l’envoi depuis Repas.',
  },
  BLOCKED: {
    title: 'Leclerc a ralenti les demandes',
    happened: 'Leclerc a ralenti les demandes.',
    action: 'Attends quelques minutes, recharge la page, puis reprends l’envoi depuis Repas.',
  },
  CONTRACT_CHANGED: {
    title: 'Le site a changé',
    happened: 'Leclerc a changé son site, l’envoi automatique est arrêté.',
    action: 'Cherche tes produits à la main sur Leclerc.',
  },
  NETWORK: {
    title: 'Le site ne répond pas',
    happened: 'Le site de Leclerc ne répond pas.',
    action: 'Vérifie ta connexion, puis reprends l’envoi depuis Repas.',
  },
  CANCELLED: {
    title: 'Envoi annulé',
    happened: 'Tu as annulé l’envoi.',
    action: 'Reprends l’envoi depuis Repas quand tu veux.',
  },
  INVALID_MESSAGE: {
    title: 'Liste illisible',
    happened: 'L’application ne comprend pas la liste envoyée par Repas.',
    action: 'Mets à jour l’application, puis reprends l’envoi depuis Repas.',
  },
  UNSUPPORTED_PAGE: {
    title: 'Page non prise en charge',
    happened: 'Repas ne peut pas travailler sur cette page de Leclerc.',
    action: 'Ouvre la page de ton magasin, puis reprends l’envoi depuis Repas.',
  },
}

/** Le titre et le texte de chaque erreur du protocole : ce qui s'est passé, ce qui est sauf, une action. */
export const ERROR_TEXTS: Record<ErrorCode, { title: string; text: string }> = Object.fromEntries(
  Object.entries(ERROR_PARTS).map(([code, { title, happened, action }]) => [
    code,
    { title, text: `${happened} ${S.end.safe} ${action}` },
  ]),
) as Record<ErrorCode, { title: string; text: string }>

/** Ce qui s'est passé et l'action d'une erreur, pour l'écran de fin qui y ajoute ce qui reste à faire. */
export function errorParts(code: ErrorCode): { happened: string; action: string } {
  return ERROR_PARTS[code]
}
