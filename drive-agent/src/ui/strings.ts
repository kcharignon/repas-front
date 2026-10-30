// Tous les textes de l'interface de l'agent, en français simple (tutoiement, phrases courtes, mots du glossaire de principes-produit.md § 5). Aucun texte n'est écrit ailleurs.
// Le diagnostic et le test automatique sont des outils du mainteneur : exemptés du glossaire, pas du tutoiement. Gardé par src/i18n/__tests__/voice-and-glossary.spec.ts.
import type { ErrorCode, LineStatus, Outcome } from '../../protocol'
import { pluralOf, unitFor } from '../../protocol'
import { own } from '../own'
import type { RetailerNames } from '../retailers/names'
import type { UnavailableReason, UnreachedReason } from './types'

export { pluralOf, unitFor }

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
export const LIST_MAX = 40
export function listText(names: readonly string[]): string {
  if (names.length === 0) return 'aucun'
  const shown = names.slice(0, LIST_MAX).join(', ')
  return names.length > LIST_MAX ? `${shown} (et ${names.length - LIST_MAX} de plus)` : shown
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
export function summarySentence(counts: SummaryCounts, retailer: RetailerNames): string {
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
      total === 1
        ? `il est à choisir sur ${retailer.name}`
        : `tous sont à choisir sur ${retailer.name}`,
      counts.new === 1
        ? `est à choisir sur ${retailer.name}`
        : `sont à choisir sur ${retailer.name}`,
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
      shelves: 'Rayons vus',
      startButton: 'Bouton de démarrage trouvé',
      frame: 'Cadre de même origine',
    },
    detail: {
      version: (version: string) => `version ${version}`,
      page: (host: string, store: string) => `hôte ${host}, magasin ${store}`,
      hostOther: (domain: string) => `autre hôte ${domain}`,
      hostMobile: 'site mobile (pas la version ordinateur)',
      originOk: 'origine écrite dans l’agent',
      originMissing: 'origine non remplacée dans l’agent',
      originBridge: 'pont de l’application : pas d’origine à vérifier',
      sessionOk: 'lecture et écriture possibles',
      sessionKo: 'stockage de session inaccessible : pas de reprise possible',
      wakeLockOk: 'disponible',
      wakeLockKo: 'absent (toléré : l’écran peut s’éteindre)',
      pageSkipped: 'page non prise en charge',
      shelvesCommonFailed: (fault: string) => `la recherche « sel » a échoué : ${fault}`,
      shelvesStopped: (fault: string) => `le site s’est arrêté de répondre : ${fault}`,
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
      startButtonOk:
        'le bouton « Commencer mes courses » est dans la page, l’agent peut le toucher',
      startButtonLink: 'un lien « Commencer mes courses » est dans la page, l’agent peut le suivre',
      startButtonKo:
        'la page montre « Commencer mes courses », mais l’agent n’en trouve pas l’élément à toucher',
      startButtonNone: 'pas de fenêtre « Commencer mes courses » sur cette page',
    },
    /** Les lignes du rapport copiable. */
    text: {
      title: 'Repas Drive : diagnostic',
      agent: (version: string) => `Agent : ${version}`,
      date: (date: string) => `Date : ${date}`,
      site: (id: string, name: string) => `Site : ${id} (${name})`,
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
      where: (domain: string) =>
        ({
          RELATIVE: 'adresse sans site',
          SAME_HOST: 'même hôte que la page',
          RETAILER_HOST: `autre hôte ${domain}`,
          OTHER_SITE: 'autre site',
        }) as Record<string, string>,
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
      /** Comment le site a dit le magasin quand il ne se lit pas dans l'adresse (DRV-717) : réponse, contextes, magasin, forme de l'identifiant. */
      storeRead: (read: {
        status: string
        contexts: string
        others: number
        store: string
        idForm: string
        pickUp: string
        label: string
      }) =>
        `Magasin dit par le site : réponse ${read.status} ; contextes de courses : ${read.contexts} (${read.others} autre${read.others > 1 ? 's' : ''}) ; ${read.store} ; forme de l’identifiant : ${read.idForm} ; retrait au drive : ${read.pickUp} ; libellé lisible : ${read.label}`,
      storeReadRead: 'magasin lu',
      storeReadNone: 'contexte de courses vide (aucun magasin choisi)',
      storeReadAbsent: 'pas de contexte de courses (aucun magasin choisi)',
      none: 'aucun',
      other: 'autre',
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
      landing: (term: string, landing: 'AISLE' | 'PRODUCT') =>
        `Recherche « ${term} » : redirigée vers ${landing === 'AISLE' ? 'un rayon (lu comme des résultats)' : 'une fiche de produit (non lue)'}`,
      notDrive: (term: string, count: number) =>
        `Recherche « ${term} » : ${count} produit(s) hors drive écarté(s) (aucune offre du drive)`,
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
      /** DRV-646 : les rayons et familles vus par une recherche d'essai (« 12:5 14:2 » : identifiant, nombre de produits), des nombres seulement. */
      shelves: (
        title: string,
        kind: string,
        term: string,
        groups: string,
        products: number,
        missing: number,
      ) =>
        `${title} pour « ${term} » : ${groups} (${products} produit${products > 1 ? 's' : ''}${missing > 0 ? `, ${missing} sans ${kind}` : ''})`,
      shelvesNone: (term: string, fault?: string) =>
        `Rayons vus pour « ${term} » : recherche non faite${fault === undefined ? '' : ` (${fault})`}`,
      shelvesSkipped: (reason: string) => `Rayons : non lus (${reason})`,
      nextPage: (term: string, products: number, next: string) =>
        `Première réponse pour « ${term} » : ${products} produit${products > 1 ? 's' : ''} ; page suivante : ${next}`,
      /** Les raisons du dernier envoi, par produit habituel écarté, dans l'ordre du passage : un mot fixe et un nombre, jamais un libellé. */
      lastPass: (list: string) => `Dernier envoi, produits habituels écartés : ${list}`,
      /** Les raisons, pour le mainteneur (le diagnostic est exempté du glossaire) : les mots de DRV-635. */
      reason: {
        OUT_OF_STOCK: 'en rupture',
        NOT_FOUND: 'introuvable',
        CART_REFUSED: 'refusé par le panier',
      } satisfies Record<UnavailableReason, string>,
      /** DRV-644 : ce que la réponse du panier a dit des produits choisis qu'il n'a pas pris : des nombres lus tels quels (`iQteDisponible`, `eDisponibilite`), jamais un nom. */
      lastRefusals: (list: string) =>
        `Dernier envoi, produits choisis non pris par le panier : ${list}`,
      /** Les raisons d'un refus du panier, pour le mainteneur (le diagnostic est exempté du glossaire). */
      refusal: {
        OUT_OF_STOCK: 'en rupture',
        COMING_SOON: 'bientôt disponible',
        CART_REFUSED: 'refusé par le panier',
      } satisfies Record<UnreachedReason, string>,
      lastRefusalItem: (
        rank: number,
        reason: string,
        stock: number | null,
        availability: number | null,
      ) =>
        `${rank} : ${reason} (iQteDisponible : ${stock ?? 'absent'}, eDisponibilite : ${availability ?? 'absente'})`,
      lastPassItem: (rank: number, reason: string, tried: number) =>
        `${rank} : ${reason} (${tried} recherche${tried > 1 ? 's' : ''})`,
      /**
       * DRV-647 (étape 0) : d'où viennent les libellés de rayons. Le menu « Rayons » de la page (lu dans le DOM, sans clic) : des nombres, les formes
       * des adresses, l'identifiant lu dans l'adresse et le libellé du rayon, un texte du catalogue public.
       */
      menu: (m: {
        menu: boolean
        links: number
        menuLinks: number
        aisles: number
        families: number
      }) =>
        `Menu des rayons de la page : titre « Rayons » ${m.menu ? 'présent' : 'absent'} ; liens de la page : ${m.links}, dans le bloc du menu : ${m.menuLinks} ; liens de rayon : ${m.aisles} ; liens de famille : ${m.families}`,
      menuShapes: (list: string) => `Adresses des liens de rayon et de famille (motifs) : ${list}`,
      menuAisle: (kind: 'RAYON' | 'MENU', id: number | null, label: string | null) =>
        `${kind === 'RAYON' ? 'Lien de rayon' : 'Lien du menu'} ${id ?? '(sans numéro)'} : ${
          label === null ? '(libellé écarté)' : `« ${label} »`
        }`,
      menuMore: (hidden: number, max: number) =>
        `Liens de rayon non montrés : ${hidden} (${max} au plus)`,
      menuKeys: (list: string) => `Clés de rayon ou de filtre dans l’état de la page : ${list}`,
      replyPath: (term: string, path: string) =>
        `Réponse « ${term} », chemin des produits depuis le premier niveau : ${path}`,
      replyTop: (term: string, total: number, list: string) =>
        `Réponse « ${term} », clés du premier niveau (${total}, noms seulement) : ${list}`,
      replyProduct: (term: string, total: number, list: string) =>
        `Réponse « ${term} », clés d’un produit (${total}, noms seulement sauf rayon et famille) : ${list}`,
      replyNoProduct: (term: string) => `Réponse « ${term} » : état des produits non délimité`,
      replyKeys: (term: string, list: string) =>
        `Réponse « ${term} », clés de rayon ou de filtre : ${list}`,
      coverage: (
        kind: 'Rayons' | 'Familles',
        term: string,
        found: number,
        seen: number,
        missing: string,
      ) =>
        `${kind} de « ${term} » avec un lien dans le menu : ${found} sur ${seen}${missing === '' ? '' : ` (sans lien : ${missing})`}`,
      coverageNone: (kind: 'Rayons' | 'Familles', term: string) =>
        `${kind} de « ${term} » avec un lien dans le menu : aucun lien numéroté dans la page`,
      /** DRV-647 (étape 1) : le libellé que l'écran de choix montre pour un rayon, et d'où il vient. */
      aisleLevel: (term: string, level: string, rayon: number, famille: number, products: number) =>
        `Niveau du filtre pour « ${term} » : ${level} (produits nommés : ${rayon} au niveau rayon, ${famille} au niveau famille, sur ${products})`,
      aisleLabel: (one: string, id: number, count: number, label: string, source: string) =>
        `Libellé ${one} ${id} (${count} produit${count > 1 ? 's' : ''}) : « ${label} » (source : ${source})`,
      aisleLabelNone: (one: string, id: number, count: number, fallback: string) =>
        `Libellé ${one} ${id} (${count} produit${count > 1 ? 's' : ''}) : aucun texte lisible (repli : « ${fallback} »)`,
      sample: (
        term: string,
        aisle: number | null,
        family: number | null,
        filter: string,
        url: string,
        category: string,
      ) =>
        `Produit échantillon de « ${term} » : iIdRayon=${aisle ?? '?'} iIdFamille=${family ?? '?'} ; objFiltreBloc : ${filter} ; sUrlVoirRayon : ${url} ; sCategorie=${category}`,
      sampleFilter: (path: string, label: string, block: number | null, type: number | null) =>
        `(chemin ${path}) sLibelle=${label}, iIdBloc=${block ?? '?'}, neTypeBloc=${type ?? '?'}`,
      sampleUrl: (id: number | null, level: string | null, name: string) =>
        `id=${id ?? '?'} (${level ?? 'ni le rayon ni la famille du produit'}) nom=${name}`,
      inProduct: 'dans le produit',
      inElement: 'dans l’élément qui englobe le produit',
      facet: (
        term: string,
        rank: number,
        keys: string,
        ids: string,
        label: string,
        block: string,
      ) =>
        `Objet de filtre ${rank} de la réponse « ${term} » : ${keys} ; identifiants : ${ids} ; libellé : ${label} ; bloc : ${block}`,
      firstAisleText: (term: string, field: string, value: string) =>
        `Premier produit de « ${term} », ${field} : ${value}`,
      namedKeys: (where: string, name: string, keys: string) =>
        `Clés de ${name} (${where}, noms seulement) : ${keys}`,
      absent: 'absent',
      hidden: '(écarté : ressemble à une donnée personnelle)',
      object: 'objet',
      listOf: (size: number) => `liste de ${size}, premier élément`,
    },
    /**
     * DRV-647 (agent 0.35.0) : la facette « Rayons » de la réponse de recherche (libellés et nombres du catalogue public), la forme du paramètre `Filtres`,
     * la recherche filtrée sondée (une requête au plus), la pagination et les univers. Pour le mainteneur : le diagnostic est exempté du glossaire.
     */
    facet: {
      none: 'aucune',
      noLabel: '(sans libellé)',
      top: 'premier niveau',
      child: 'enfant',
      inPage: 'page',
      inReply: (term: string) => `réponse « ${term} »`,
      noBlocs: (term: string) => `Blocs de filtre de la réponse « ${term} » : aucun`,
      bloc: (term: string, id: number | null, label: string, values: number) =>
        `Bloc de filtre ${id ?? '?'} ${label} de la réponse « ${term} » : ${values} valeur${values > 1 ? 's' : ''} de premier niveau`,
      noAisleBloc: (term: string) => `Bloc « Rayons » de la réponse « ${term} » : absent`,
      value: (label: string, id: number, references: number | null, children: number) =>
        `Rayon du filtre ${label} : iIdValeur=${id}, niNbReferences=${references ?? '?'}, ${children} enfant${children > 1 ? 's' : ''}`,
      firstExtra: (urlId: string, hasId: string, children: string) =>
        ` ; sIdValeurUrl (forme)=${urlId}, contient iIdValeur : ${hasId} ; enfants : ${children}`,
      more: (hidden: number) => `Rayons du filtre non montrés : ${hidden} (40 au plus)`,
      noFresh: 'Valeur « fruits / légumes / marché frais » de la facette : aucune',
      fresh: (list: string) => `Valeur « fruits / légumes / marché frais » de la facette : ${list}`,
      freshItem: (label: string, id: number, references: number | null, depth: string) =>
        `${label} (iIdValeur=${id}, niNbReferences=${references ?? '?'}, ${depth})`,
      noMatch: 'aucune correspondance',
      match: (id: number, label: string, depth: string) =>
        `correspond à la valeur ${id} ${label} (${depth})`,
      sample: (term: string, aisle: string, family: string) =>
        `Correspondance avec la facette d’un produit de « ${term} » : iIdRayon=${aisle} ; iIdFamille=${family}`,
      links: (where: string, count: number) => `Liens à « Filtres » (${where}) : ${count}`,
      linkShape: (where: string, count: number, shape: string) =>
        `Forme d’un lien à « Filtres » (${where}, ×${count}) : ${shape}`,
      urlIds: (list: string) => `sIdValeurUrl du bloc « Rayons » (formes) : ${list}`,
      template: (shape: string, token: string) =>
        `Adresse d’une recherche filtrée : déduite du lien ${shape} (jeton remplacé : ${token})`,
      templateMiss: (why: string) => `Adresse d’une recherche filtrée : non déduite (${why})`,
      probeSkipped: (term: string, why: string) =>
        `Recherche « ${term} » filtrée : non faite (${why})`,
      probeHead: (term: string, label: string, id: number, form: string, value: string) =>
        `Recherche « ${term} » filtrée sur ${label} (iIdValeur=${id}), Filtres=<${form}> (forme ${value}) : `,
      probeFault: (fault: string) => `erreur ${fault}`,
      probeReply: (
        status: number,
        total: number | null,
        products: number | null,
        level: string,
        first: string,
        verdict: string,
      ) =>
        `HTTP ${status}, iNbTotalProduits=${total ?? '?'}, ${products ?? '?'} produits lus, groupes au niveau ${level} ; premier produit : ${first} ; verdict : ${verdict}`,
      address: (shape: string) => `Forme finale de l’adresse filtrée : ${shape}`,
      /** DRV-647 (0.37.0) : chaque forme de `Filtres` essayée, sa cohérence avec la valeur demandée, la forme retenue. */
      formRank: { URL_ID: 'i', BLOC_ID: 'ii', ID_BLOC: 'iii' } as Record<string, string>,
      formName: {
        URL_ID: 'sIdValeurUrl',
        BLOC_ID: 'iIdBloc-iIdValeur',
        ID_BLOC: 'iIdValeur-iIdBloc',
      } as Record<string, string>,
      formHead: (rank: string, name: string, value: string, target: string) =>
        `Forme essayée (${rank}) Filtres=<${name}> (forme ${value}) sur ${target} : `,
      formReply: (
        status: number,
        before: number | null,
        after: number | null,
        references: number | null,
        products: number | null,
        share: string,
        verdict: string,
        reason: string,
      ) =>
        `HTTP ${status}, iNbTotalProduits ${before ?? '?'} → ${after ?? '?'} (niNbReferences ${references ?? '?'}), ${products ?? '?'} produits, part dans les enfants attendus : ${share} ; verdict : ${verdict} (${reason})`,
      formGroup: (label: string, count: number) =>
        `Groupe de la forme essayée : ${label} (${count})`,
      formFirst: (label: string, fresh: string) =>
        `Premier produit de la forme essayée : ${label} (frais : ${fresh})`,
      noChildren: 'sans enfant lisible',
      valid: 'valide',
      invalid: 'invalide',
      reason: {
        TOTAL_MATCHES: 'le total change et s’approche du nombre de références',
        CHILDREN_MATCH: 'au moins 80 % des produits sont dans les enfants attendus',
        HTTP: 'réponse HTTP autre que 200',
        EMPTY: 'aucun produit',
        INCOHERENT: 'le total ne correspond pas et les groupes ne sont pas ceux des enfants',
        ERROR: 'erreur',
      } as Record<string, string>,
      formLists: (list: string) => `Produits par liste de la forme essayée : ${list}`,
      freshProbe: (label: string) =>
        `Sonde sur la valeur « fruits / légumes » ${label} avec la forme retenue :`,
      /** DRV-647 (0.38.0) : les listes de produits de premier niveau de la réponse (`objContenu`, `objContenuMDD`, variantes…). */
      listsHead: (term: string, total: number | null, sum: number, facet: string) =>
        `Listes de produits de la réponse « ${term} » : iNbTotalProduits=${total ?? '?'}, produits lus dans les listes : ${sum} ; ${facet}`,
      freshFacet: (label: string, references: number | null, children: string) =>
        `facette ${label} : ${references ?? '?'} références${children === '' ? '' : ` (${children})`}`,
      noFreshFacet: 'facette « fruits / légumes » : absente',
      list: (
        name: string,
        term: string,
        kind: string,
        keys: string,
        occurrences: number,
        products: number,
        span: number,
        noLabel: number,
        aisles: string,
        families: string,
        fresh: string,
      ) =>
        `Liste ${name} (« ${term} ») : ${kind}, clés : ${keys} ; iIdProduit vus : ${occurrences}, produits lus : ${products} (non lus : ${span} objet trop grand, ${noLabel} sans libellé) ; rayons : ${aisles} ; familles : ${families} ; légumes ou fruits : ${fresh}`,
      listLabels: (name: string, term: string, labels: string) =>
        `Libellés de la liste ${name} (« ${term} ») : ${labels}`,
      retained: (rank: string, name: string) => `Forme retenue : (${rank}) Filtres=<${name}>`,
      retainedNone: 'Forme retenue : aucune (la rangée de l’écran reste celle des familles)',
      noneHint:
        'Aucune forme valide : voir plus haut les formes des liens à « Filtres » (page et réponse) et les valeurs de eUnivers',
      verdict: {
        FILTERED: 'filtrée (moins de produits, pas les mêmes)',
        IDENTICAL: 'les mêmes produits que sans filtre',
        EMPTY: 'aucun produit',
        NOT_SMALLER: 'pas moins de produits que sans filtre',
        HTTP: 'réponse HTTP autre que 200',
        ERROR: 'erreur',
      } as Record<string, string>,
      probeGroup: (id: number, count: number, label: string) =>
        `Groupe de la recherche filtrée ${id} (${count} produit${count > 1 ? 's' : ''}) : ${label}`,
      pagination: (where: string, list: string) =>
        `Clés de pagination (${where}, nombres et oui/non seulement) : ${list}`,
      universes: (where: string, list: string) => `eUnivers (${where}) : ${list}`,
      miss: {
        NO_FILTER_LINK: 'aucun lien à « Filtres » dans la page ni dans la réponse',
        NO_SEARCH_LINK:
          'aucun lien à « Filtres » n’est une recherche (recherche.aspx avec TexteRecherche)',
        EMPTY_FILTER: 'les liens de recherche à « Filtres » ont une valeur vide',
        NO_KNOWN_VALUE:
          'aucune valeur de « Filtres » ne contient un sIdValeurUrl ni un iIdValeur de la facette',
        OTHER_STORE: 'les liens de recherche à « Filtres » visent un autre magasin',
        NO_TARGET: 'aucune valeur dans le bloc « Rayons »',
        NO_FACET: 'aucune facette dans la réponse',
        NO_PATH: 'adresse impossible à bâtir',
        NO_FILTER_KEY: 'le sIdValeurUrl de la valeur n’a pas la forme N-N',
      } as Record<string, string>,
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
  packSize: {
    title: 'Vérifie la quantité',
    /**
     * « Combien de tranches y a-t-il dans « Fromage… 20 Tranches - 340g » ? » : toujours au pluriel, la question demande un nombre. `ofUnits` est le nom de
     * l'unité avec son « de » élidé (« de tranches », « d'unités ») : jamais « Combien de unités ».
     */
    question: (ofUnits: string, product: string) =>
      `Combien ${ofUnits} y a-t-il dans «\u00a0${product}\u00a0»\u00a0?`,
    /** « Il te faut 15 tranches » : la quantité de la liste, dans son unité. */
    need: (quantity: number, units: string) => `Il te faut ${formatNumber(quantity)} ${units}`,
    /** L'aperçu en direct, une fois le nombre valide : « Il te faut 15 tranches : 1 produit ». */
    preview: (need: string, packs: number) => `${need} : ${count(packs, 'produit', 'produits')}`,
    invalid: 'Entre un nombre, par exemple 20 ou 12,5.',
    validate: 'Valider',
    skip: 'Pas cette fois',
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
    /** La rangée de filtres par rayon du site (DRV-647) : « Tous (40) », « Fruits et légumes (6) », et « Rayon 2 » pour un rayon sans libellé lisible. */
    aisles: 'Rayons',
    allAisles: (count: number) => `Tous (${count})`,
    aisleChip: (label: string, count: number) => `${label} (${count})`,
    aisleFallback: (rank: number) => `Rayon ${rank}`,
    /** DRV-647 (0.36.0) : la requête d'un rayon du site en cours, et la seconde rangée des enfants du rayon choisi. */
    searchingAisle: 'Je cherche…',
    /** Un rayon du site dont la recherche filtrée ne rend pas ses produits (DRV-647, 0.38.0) : la liste revient entière, rangée des familles. */
    aisleUnexpected: 'Ce rayon ne répond pas comme prévu.',
    subAisles: (label: string) => `Rayons de « ${label} »`,
    /**
     * Trier la liste (DRV-743), un ordre d'affichage : quatre boutons, le sens par une flèche sur le bouton actif, une phrase qui dit l'ordre. « Pertinence » est l'ordre
     * du site. Le « prix au kilo » devient « au litre » ou « à la pièce » quand la liste est mesurée ainsi (on ne compare pas des kilos et des litres).
     */
    sort: {
      title: 'Trier',
      relevance: 'Pertinence',
      price: 'Prix',
      unitPrice: (unit: 'kg' | 'l' | 'piece') =>
        unit === 'l' ? 'Prix au litre' : unit === 'piece' ? 'Prix à la pièce' : 'Prix au kilo',
      name: 'A → Z',
      /** Le bouton actif : son texte porte la flèche du sens, ↑ croissant et ↓ décroissant. */
      active: (label: string, direction: 'asc' | 'desc') =>
        `${label} ${direction === 'asc' ? '↑' : '↓'}`,
      /** Le nom accessible du bouton actif : le texte visible, puis le sens dit en mots. */
      activeNamed: (label: string, direction: 'asc' | 'desc', alphabetic: boolean) => {
        const way = alphabetic
          ? direction === 'asc'
            ? 'de A à Z'
            : 'de Z à A'
          : direction === 'asc'
            ? 'croissant'
            : 'décroissant'
        return `${label}, ${way}`
      },
      help: {
        relevance: 'Dans l’ordre du site.',
        price: (direction: 'asc' | 'desc') =>
          `${direction === 'asc' ? 'Du moins cher au plus cher.' : 'Du plus cher au moins cher.'} Touche encore pour inverser.`,
        unitPrice: (direction: 'asc' | 'desc', unit: 'kg' | 'l' | 'piece') => {
          const per = unit === 'l' ? 'au litre' : unit === 'piece' ? 'à la pièce' : 'au kilo'
          const order =
            direction === 'asc' ? 'Du moins cher au plus cher' : 'Du plus cher au moins cher'
          return `${order} ${per}. Touche encore pour inverser.`
        },
        name: (direction: 'asc' | 'desc') =>
          `${direction === 'asc' ? 'De A à Z.' : 'De Z à A.'} Touche encore pour inverser.`,
      },
    },
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
    slow: (retailer: RetailerNames) =>
      `${retailer.name} met trop de temps à répondre. Réessaie dans un instant.`,
    choose: 'Choisir',
    /** Le second geste de la fiche (0.41.0) : le produit est pris cette fois, il n'est pas l'habituel ; Repas redemandera. « Habituel » est le mot du glossaire (pas « préféré »). */
    notUsual: 'Pas mon habituel',
    chooseNamed: (product: string) => `Choisir : ${product}`,
    notUsualNamed: (product: string) => `Pas mon habituel : ${product}`,
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
    cartRefused: (retailer: RetailerNames, product: string) =>
      `${retailer.name} n’a pas pu mettre « ${product} » au panier. Choisis-en un autre.`,
    /** Aucune recherche n'a retrouvé ce produit habituel (DRV-635) : il n'est pas dit indisponible, la recherche est préremplie. */
    notFound: (product: string) =>
      `Je ne retrouve pas « ${product} » : cherche-le ou choisis-en un autre.`,
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
    completed: (retailer: RetailerNames) =>
      `Tes produits sont dans ton panier ${retailer.name}. Retourne dans Repas pour le finaliser.`,
    /** Des produits choisis n'ont pas été pris par le panier (DRV-644) : seule l'action, chaque produit a sa phrase. */
    completedSome: 'Retourne dans Repas pour le finaliser.',
    /** Ce qui est sauf : rien de ce qui est déjà au panier n'est retiré. */
    safe: 'Ce qui est déjà au panier y reste.',
    /** Ce qui est sauf et ce qu'il reste à ajouter, quand l'envoi s'est arrêté avant la fin. */
    safeLeft: (n: number) =>
      `Ce qui est déjà au panier y reste : il reste ${count(n, 'article', 'articles')} à ajouter.`,
    stopped: 'L’envoi s’est arrêté avant la fin.',
    notFinished: 'L’envoi n’a pas pu aller au bout.',
    resume: 'Retourne dans Repas pour reprendre l’envoi.',
    added: (n: number) => `Ajoutés au panier : ${n}`,
    chosen: (retailer: RetailerNames, n: number) => `Choisis sur ${retailer.name} : ${n}`,
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
    slow: (retailer: RetailerNames) => `${retailer.name} a mis trop de temps à répondre.`,
    /** Le panier avait déjà plus que le plan : ces articles restent tels quels (ticket M ; le fond est dans les conditions d'utilisation du drive). */
    kept: {
      title: 'Quantités déjà au panier',
      text: 'Ces articles sont restés tels quels.',
      item: (name: string, inCart: number) => `${name} — Déjà ${inCart} au panier : conservé`,
    },
    /** La recherche ne donnait pas la quantité déjà au panier : Repas n'a pas pu s'en assurer (ticket M). */
    unreadable: {
      title: 'Quantité au panier illisible',
      text: (retailer: RetailerNames) =>
        `${retailer.name} n’a pas donné la quantité déjà au panier. Vérifie ces articles dans ton panier.`,
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
    /** Un produit choisi que le panier n'a pas pris (DRV-644) : le choix est enregistré, une phrase par produit, et pourquoi. */
    unreached: {
      item: (product: string, why: string) =>
        `« ${product} » est enregistré, mais pas dans ton panier${why}`,
      /** La suite de la phrase : la raison, avec les mots de Leclerc quand c'est lui qui les dit. */
      why: (retailer: RetailerNames) =>
        ({
          OUT_OF_STOCK: ` : ${retailer.name} le dit en rupture dans ton magasin.`,
          COMING_SOON: `. ${retailer.name} indique « Bientôt disponible » : tu ne peux pas le commander pour l’instant.`,
          CART_REFUSED: ` : ${retailer.name} n’a pas voulu le mettre au panier, sans en donner la raison.`,
        }) satisfies Record<UnreachedReason, string>,
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
    acceptedAnyway: (retailer: RetailerNames, name: string) =>
      `${name} : ajouté, ${retailer.name} l’a accepté`,
    /** Le produit choisi n'est pas au panier, mais le choix est enregistré (DRV-644). */
    savedNotInCart: (name: string) => `${name} : enregistré, pas dans le panier`,
    slow: (retailer: RetailerNames, name: string) =>
      `${name} : ${retailer.name} met trop de temps à répondre`,
  },
  /** La demande de vérification de l'anti-robot (ticket K) : un bandeau en bas de l'écran, pour que la page reste visible. */
  challenge: {
    title: (retailer: RetailerNames) => `${retailer.name} demande une vérification`,
    text: 'Fais-la dans la page, puis touche Reprendre.',
    resume: 'Reprendre',
    stop: 'Arrêter',
  },
  /** L'entrée dans le magasin (DRV-625) : ce qui se passe, ou le seul geste à faire. Un bandeau, la page reste visible. */
  entry: {
    opening: 'Ouverture de ton magasin…',
    manual: 'Touche « Commencer mes courses ».',
  },
  /**
   * La première configuration quand le magasin se choisit sur le site (DRV-740) : un bandeau, la page reste utilisable. Une phrase, puis le geste ; au bout d'un
   * long moment, « Réessayer » ou revenir dans Repas.
   */
  storeWaiting: {
    waiting: (retailer: RetailerNames) =>
      `Choisis ton magasin sur ${retailer.name}. Repas le reprend ensuite.`,
    late: 'Je ne vois pas de magasin choisi.',
    back: 'Retourner dans Repas',
    retry: 'Réessayer',
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
export function causeTexts(
  retailer: RetailerNames,
): Readonly<Record<string, { title: string; text: string }>> {
  return {
    PAGE_MOBILE: {
      title: 'Ce n’est pas la version ordinateur du site',
      text: `${retailer.name} affiche son site mobile. Repas ne travaille que sur la version ordinateur. Ce qui est déjà au panier y reste. Ouvre « Ouvrir le drive ${retailer.name} » dans le menu de l’application, puis reprends l’envoi.`,
    },
    // Aucun magasin choisi (DRV-717) : chez une enseigne dont le magasin ne se lit pas dans l'adresse, la page dit « Choisir vos courses » ou le site n'a pas de drive
    // pour la session. Trois phrases : ce qui s'est passé, ce qui est sauf, le geste à faire.
    STORE_NOT_CHOSEN: {
      title: 'Choisis ton magasin',
      text: `Aucun magasin n’est choisi sur ${retailer.name}. ${S.end.safe} Choisis ton magasin dans la page, puis reprends l’envoi depuis Repas.`,
    },
    // Une adresse que le site ne connaît plus (un vrai 404).
    PAGE_NOT_FOUND: {
      title: 'Cette page n’existe pas',
      text: `Cette page ${retailer.nameDe} n’existe pas. ${S.end.safe} Ouvre la page de ton magasin, puis reprends l’envoi depuis Repas.`,
    },
  }
}

/**
 * Chaque erreur du protocole, en trois phrases (principes-produit.md § 4) : ce qui s'est passé (`happened`), ce qui est sauf (la même phrase
 * partout : rien de ce qui est déjà au panier n'est retiré) et une action (`action`). Le titre part aussi dans le message du résultat.
 */
function errorPartsTable(
  retailer: RetailerNames,
): Record<ErrorCode, { title: string; happened: string; action: string }> {
  return {
    NOT_LOGGED_IN: {
      title: 'Tu n’es pas connecté',
      happened: `Tu n’es pas connecté à ${retailer.name}.`,
      action: `Connecte-toi à ${retailer.name}, puis reprends l’envoi depuis Repas.`,
    },
    STORE_MISMATCH: {
      title: 'Ce n’est pas le bon magasin',
      happened: 'Repas a préparé ta liste pour un autre magasin.',
      action: `Ouvre ton magasin sur ${retailer.name}, puis reprends l’envoi depuis Repas.`,
    },
    BLOCKED: {
      title: `${retailer.name} a ralenti les demandes`,
      happened: `${retailer.name} a ralenti les demandes.`,
      action: 'Attends quelques minutes, recharge la page, puis reprends l’envoi depuis Repas.',
    },
    CONTRACT_CHANGED: {
      title: 'Le site a changé',
      happened: `${retailer.name} a changé son site, l’envoi automatique est arrêté.`,
      action: `Cherche tes produits à la main sur ${retailer.name}.`,
    },
    NETWORK: {
      title: 'Le site ne répond pas',
      happened: `Le site ${retailer.nameDe} ne répond pas.`,
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
      happened: `Repas ne peut pas travailler sur cette page ${retailer.nameDe}.`,
      action: 'Ouvre la page de ton magasin, puis reprends l’envoi depuis Repas.',
    },
  }
}

/** Le titre et le texte de chaque erreur du protocole : ce qui s'est passé, ce qui est sauf, une action. */
export function errorTexts(
  retailer: RetailerNames,
): Record<ErrorCode, { title: string; text: string }> {
  return Object.fromEntries(
    Object.entries(errorPartsTable(retailer)).map(([code, { title, happened, action }]) => [
      code,
      { title, text: `${happened} ${S.end.safe} ${action}` },
    ]),
  ) as Record<ErrorCode, { title: string; text: string }>
}

/** Ce qui s'est passé et l'action d'une erreur, pour l'écran de fin qui y ajoute ce qui reste à faire. */
export function errorParts(
  code: ErrorCode,
  retailer: RetailerNames,
): { happened: string; action: string } {
  return errorPartsTable(retailer)[code]
}
