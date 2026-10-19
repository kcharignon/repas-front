// @vitest-environment node
// Une seule voix et un seul vocabulaire (DRV-621) : le vouvoiement et le glossaire du produit, gardés sur les TROIS sources de textes que
// l'utilisateur lit : le front web (`src/i18n/fr.ts`), l'interface de l'agent (`drive-agent/src/ui/strings.ts`) et l'application Android
// (`android/app/src/main/res/values/strings.xml`).
//
// La référence est `docs/drive/principes-produit.md` (§ 3 règles de texte, § 5 glossaire) du dépôt back `kcharignon/repas`. Un mot
// interdit qui réapparaît, un « tu » ou un verbe à l'impératif du tutoiement fait échouer ce test. Une décision de vocabulaire se prend
// d'abord dans le glossaire, puis ici : jamais écran par écran.
//
// Exemptions, nommées plus bas : le diagnostic, le test automatique et les entrées de débogage sont des outils du mainteneur. Ils
// échappent au GLOSSAIRE (ils parlent de « plan », de « requête », de « résultat »), mais pas au vouvoiement de leurs phrases adressées à
// l'utilisateur.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import fr from '@/i18n/fr'
import { WARNING_WORDS } from './warningWords'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// ---------------------------------------------------------------------------------------------------------------------------------
// Les règles

/** Un mot entier, accents compris (`\b` ne sait pas lire « é »), sans tenir compte de la casse. */
const word = (alternatives: string) =>
  new RegExp(`(?<![\\p{L}\\d_])(?:${alternatives})(?![\\p{L}\\d_])`, 'iu')

interface Rule {
  readonly pattern: RegExp
  /** Le mot ou la forme du glossaire à employer à la place. */
  readonly use: string
}

/** Les mots interdits à l'écran (`principes-produit.md` § 5, colonne de droite), avec le mot à employer. */
export const FORBIDDEN: readonly Rule[] = [
  // L'opération complète s'appelle un envoi.
  { pattern: word('passages?|plans?|runs?|remplissages?'), use: 'envoi' },
  // La ligne de la liste s'appelle un article (« ingrédient » reste permis dans les recettes, qui ne sont pas balayées ici).
  { pattern: /(?<![\p{L}\d_])(?<!hors )(?<!en )lignes?(?![\p{L}\d_])/iu, use: 'article' },
  { pattern: word('ingrédients?'), use: 'article' },
  // Ce qu'on achète chez Leclerc s'appelle un produit.
  { pattern: word('références?|fiches?|SKU'), use: 'produit' },
  { pattern: word('caddies?|carts?'), use: 'panier' },
  // Déjà chez soi, toujours.
  {
    pattern: word('déjà à la maison|vous en avez (déjà|toujours)|vous avez toujours|HAVE_AT_HOME'),
    use: 'J’en ai toujours',
  },
  // Pas pour cet envoi seulement.
  {
    // « passés » reste permis comme adjectif (« vos achats passés ») : seuls l'étiquette et la formule du glossaire sont interdites.
    pattern:
      /(?<![\p{L}\d_])(?:passer cette fois|passée?s? cette fois)(?![\p{L}\d_])|^\s*passée?s?\s*(?:[:.]|$)|[:—]\s*passée?s?\s*$|(?<![\p{L}\d_])ignorée?s?(?![\p{L}\d_])/iu,
    use: 'Pas cette fois',
  },
  { pattern: /^\s*passer\s*$/i, use: 'Pas cette fois' },
  // Le produit retenu pour un article et son remplaçant. « Préférence » aussi (DRV-626) : Repas ne montre pas un ordre de préférence, il dit
  // « produit habituel » ou « produits retenus » ; « enregistré dans les préférences » reste interdit par la règle de « Repas s'en souvient ».
  {
    pattern: word('préférée?s?|préférences?|primaires?|secours|fallbacks?'),
    use: 'produit habituel / produit de remplacement',
  },
  // Un produit exclu.
  { pattern: word('refusée?s?|rejetée?s?'), use: 'Ne plus proposer' },
  // Le fait que Repas se souvient.
  {
    pattern: word('mémoris\\p{L}*|persist\\p{L}*|enregistré dans les préférences'),
    use: 'Repas s’en souvient',
  },
  // L'écran de fin d'un envoi (« résultats » au pluriel reste permis : ce sont ceux d'une recherche de produits).
  { pattern: word('résumés?|retour du drive|résultat'), use: 'Récapitulatif' },
  { pattern: word('points? de retrait'), use: 'votre magasin' },
  // L'écran du profil et des réglages s'appelle « Moi » (« Créer mon compte » est le bouton d'inscription, un autre sujet).
  { pattern: /(?<!créer )mon compte/iu, use: 'Moi' },
  { pattern: word('modes? assistés?'), use: 'Chercher à la main' },
  {
    pattern: word('contrat modifié|CONTRACT_CHANGED'),
    use: 'Leclerc a changé son site, l’envoi automatique est arrêté',
  },
]

/** Les pronoms et les élisions du tutoiement : « tu », « ton », « ta », « tes », « toi », « te », « t’étais ». */
const SECOND_PERSON = /(?<![\p{L}\d_])(?:tu|ton|ta|tes|toi|te)(?![\p{L}\d_])|(?<![\p{L}\d_])t[’']/iu

/**
 * Les verbes de l'impératif à la 2e personne du singulier (« ouvre », « choisis », « touche »…). Un impératif du tutoiement n'a pas de
 * marque que l'on puisse lire sans dictionnaire : la liste dit ceux que l'on emploie ou emploierait dans ces écrans. Un nouveau verbe
 * s'ajoute ici le jour où le tutoiement le ramène ; la relecture reste la barrière pour tous les autres.
 */
const IMPERATIVE_VERBS = [
  'abandonne',
  'active',
  'appuie',
  'arrête',
  'attends',
  'clique',
  'colle',
  'confirme',
  'connecte',
  'contacte',
  'continue',
  'cherche',
  'donne',
  'efface',
  'enregistre',
  'entre',
  'envoie',
  'essaie',
  'évite',
  'fais',
  'ferme',
  'garde',
  'installe',
  'laisse',
  'lance',
  'lis',
  'mets',
  'ouvre',
  'patiente',
  'prends',
  'recharge',
  'recommence',
  'regarde',
  'reprends',
  'reviens',
  'relance',
  'retire',
  'retourne',
  'réessaie',
  'réinstalle',
  'rouvre',
  'saisis',
  'sélectionne',
  'supprime',
  'tape',
  'télécharge',
  'termine',
  'touche',
  'utilise',
  'valide',
  'vérifie',
]

/**
 * Un impératif en début de phrase ou de proposition : « Ouvre … », « …, puis touche … », « … : vérifie … », « … — vérifie … ».
 * « Choisis » est aussi le participe de « choisi » (« Choisis sur Leclerc », « Choisis : 3 ») : seul « Choisis » suivi d'un complément est un ordre.
 */
const IMPERATIVE_AT_START = new RegExp(
  `(?:^|[.!?:;»«…,(]\\s*|\\s[—–-]\\s|\\spuis\\s)(?:${IMPERATIVE_VERBS.join('|')}|choisis(?!\\s*:|\\s+sur\\b|\\s*$))(?![\\p{L}\\d_])`,
  'iu',
)

/** Un impératif suivi de son pronom : « Connecte-toi », « Colle-le », « Fais-la » (« -ez » est le vouvoiement : permis, comme « faites » et « dites »). */
const IMPERATIVE_WITH_PRONOUN =
  /(?<![\p{L}\d_])\p{L}+(?<!ez)(?<!ites)-(?:toi|moi|le|la|les|y|en)(?![\p{L}\d_])/iu

/** Ce que la ligne `text` de la source `where` enfreint, en phrases lisibles. */
export function violations(where: string, text: string, options: { glossary: boolean }): string[] {
  const found: string[] = []
  if (options.glossary) {
    for (const rule of FORBIDDEN) {
      const match = rule.pattern.exec(text)
      if (match !== null)
        found.push(
          `${where} : « ${match[0]} » est interdit (employer « ${rule.use} ») dans « ${text} »`,
        )
    }
  }
  for (const [name, pattern] of [
    ['un pronom du tutoiement', SECOND_PERSON],
    ['un impératif du tutoiement', IMPERATIVE_AT_START],
    ['un impératif du tutoiement', IMPERATIVE_WITH_PRONOUN],
  ] as const) {
    const match = pattern.exec(text)
    if (match !== null)
      found.push(
        `${where} : « ${match[0].trim()} » est ${name} (le vouvoiement partout) dans « ${text} »`,
      )
  }
  return found
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Les trois sources de textes

interface Entry {
  readonly where: string
  readonly text: string
  /** Faux pour un outil du mainteneur : exempté du glossaire, jamais du vouvoiement. */
  readonly glossary: boolean
}

/**
 * Le front web : les groupes du drive (ticket DRV-621, portée 2). Dans ces groupes aucune exemption : tout y est lu par l'utilisateur.
 * Les groupes des recettes, des rayons et de l'administration ne parlent pas du drive : « ingrédient » y est le bon mot.
 */
const WEB_GROUPS = [
  'shoppingList',
  'driveProducts',
  'errors',
  'driveSend',
  'driveReturn',
  'driveSettings',
  'driveAccount',
  'driveHelp',
  'driveTerms',
  'driveEstimate',
] as const

/**
 * La seule page où l'on parle des risques et des engagements (DRV-628) : les conditions d'utilisation du drive. Elle s'ouvre si l'on veut
 * (jamais imposée), et elle est lue par le glossaire et le vouvoiement comme le reste.
 */
const TERMS_GROUP = 'driveTerms'

function flatten(value: unknown, path: string, out: { where: string; text: string }[]): void {
  if (typeof value === 'string') out.push({ where: path, text: value })
  else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) flatten(child, `${path}.${key}`, out)
  }
}

function webEntries(): Entry[] {
  const groups = Object.entries(fr as Record<string, unknown>)
  const all: { where: string; text: string }[] = []
  for (const [key, value] of groups) flatten(value, key, all)
  // Les textes de vue-i18n séparent le singulier du pluriel par « | » : chaque forme est une phrase.
  const inGroups = (where: string) =>
    WEB_GROUPS.some((group) => where === group || where.startsWith(`${group}.`))
  return all.flatMap(({ where, text }) =>
    text
      .split(' | ')
      .map((part) => ({ where: `src/i18n/fr.ts ${where}`, text: part, glossary: inGroups(where) })),
  )
}

/**
 * Les parties de `strings.ts` qui sont des outils du mainteneur : le diagnostic et le test automatique (exemptés du glossaire). Les messages
 * de `leclerc/errors.ts` partent dans le résultat envoyé à Repas (jamais affichés tels quels) : exemptés du glossaire aussi, pas du vouvoiement.
 */
const AGENT_EXEMPT_PATHS = [
  ['MESSAGES'],
  ['TIMEOUT_MESSAGE'],
  ['S', 'diagnostic'],
  ['S', 'selftest'],
  ['VARIANT_LABELS'],
  ['variantLabel'],
  ['listText'],
  ['sizeText'],
] as const

const startsWith = (path: readonly string[], prefix: readonly string[]) =>
  prefix.every((part, index) => path[index] === part)

function propertyName(name: ts.PropertyName): string {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : name.getText()
}

/** Tous les morceaux de texte d'un fichier de l'agent : chaînes et parties fixes des gabarits, avec leur chemin dans le fichier. */
function agentEntries(file: string): Entry[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(join(root, file), 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
  )
  const out: Entry[] = []
  const visit = (node: ts.Node, path: readonly string[]): void => {
    if (ts.isImportDeclaration(node) || ts.isLiteralTypeNode(node) || ts.isTypeNode(node)) return
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      out.push({
        where: `${file} ${path.join('.')}`,
        text: node.text,
        glossary: !AGENT_EXEMPT_PATHS.some((prefix) => startsWith(path, prefix)),
      })
      return
    }
    let next = path
    if (
      (ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) &&
      node.name !== undefined &&
      ts.isIdentifier(node.name)
    ) {
      next = [...path, node.name.text]
    } else if (ts.isPropertyAssignment(node)) {
      next = [...path, propertyName(node.name)]
    }
    ts.forEachChild(node, (child) => visit(child, next))
  }
  visit(source, [])
  return out
}

/** Les entrées de `strings.xml` qui sont des outils du mainteneur ou des entrées de débogage : exemptées du glossaire. */
const XML_EXEMPT_NAMES = [
  'menu_diagnostic',
  'menu_debug_plan',
  'menu_selftest',
  'agent_ready',
  'result_title',
  'selftest_title',
  'selftest_started',
  'selftest_no_store',
  'report_copied',
] as const

function xmlEntries(): Entry[] {
  const file = 'android/app/src/main/res/values/strings.xml'
  const xml = readFileSync(join(root, file), 'utf8')
  return [...xml.matchAll(/<string name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)].map((match) => ({
    where: `${file} ${match[1]}`,
    text: (match[2] ?? '').replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/&amp;/g, '&'),
    glossary: !XML_EXEMPT_NAMES.includes(match[1] as (typeof XML_EXEMPT_NAMES)[number]),
  }))
}

const sources = {
  web: webEntries(),
  agent: [
    ...agentEntries('drive-agent/src/ui/strings.ts'),
    ...agentEntries('drive-agent/src/leclerc/errors.ts'),
  ],
  android: xmlEntries(),
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Les preuves

describe('le détecteur lui-même (il ne doit pas devenir aveugle)', () => {
  const found = (text: string, glossary = true) => violations('essai', text, { glossary })

  it.each([
    'Passer cette fois',
    'Passés : 2',
    '3 ignorés',
    'Déjà à la maison',
    'Vous en avez déjà',
    'Mon nouveau produit préféré',
    'Produit de secours',
    'Produits retenus, par ordre de préférence',
    'Vos préférences de produits',
    'Une préférence enregistrée',
    'Produits refusés',
    'Produit mémorisé',
    'Résumé de l’envoi',
    'Retour du drive',
    'Résultat de l’essai',
    'Le plan d’envoi n’est pas valide',
    'Passage arrêté',
    'Remplissage du panier',
    '2 lignes sur 5',
    'Pour chaque ingrédient',
    'Un point de retrait',
    'Le mode assisté',
    'Mon compte',
    'Code : CONTRACT_CHANGED',
    'Passer',
  ])('interdit « %s »', (text) => {
    expect(found(text)).not.toEqual([])
  })

  it.each([
    'Pas cette fois',
    'J’en ai toujours',
    'Mon nouveau produit habituel',
    'Produit de remplacement',
    'Produit habituel :',
    'Produits retenus :',
    'Ne plus proposer',
    'Repas s’en souvient',
    'Récapitulatif',
    'Résultats pour « farine »',
    'Moi',
    'Créer mon compte',
    'Chercher à la main',
    'Hors ligne',
    'Votre magasin',
  ])('laisse passer « %s »', (text) => {
    expect(found(text)).toEqual([])
  })

  it.each([
    'Ouvre d’abord Repas',
    'Choisis ce produit',
    'Pour remplir ton panier, commence dans Repas',
    'Rien ne part tant que tu n’as pas touché « Commencer ».',
    'Connecte-toi à Leclerc',
    'sélectionne le texte du rapport et copie-le.',
    'Fais-la dans la page, puis touche Reprendre.',
    'Reprendre où tu t’étais arrêté ?',
    'Garde cet écran ouvert',
    'Farine — vérifie dans le panier',
    'Entre un nombre entier de 1 à 99.',
    'Réessaie dans un instant.',
  ])('refuse le tutoiement de « %s »', (text) => {
    expect(found(text, false)).not.toEqual([])
  })

  it.each([
    'Ouvrez d’abord Repas',
    'Pour remplir votre panier, commencez dans Repas',
    'Connectez-vous à Leclerc',
    'sélectionnez le texte du rapport et copiez-le.',
    'Faites-la dans la page, puis touchez Reprendre.',
    'Choisissez-en un autre.',
    'Choisis sur Leclerc',
    'Choisis : 3',
    'Copie impossible',
    'Il entre dans le magasin',
    'Une liste de courses',
    'Les têtes et les en-têtes',
  ])('laisse passer le vouvoiement de « %s »', (text) => {
    expect(found(text, false)).toEqual([])
  })
})

describe('les trois sources de textes sont lues en entier', () => {
  it('trouvent de quoi vérifier', () => {
    expect(sources.web.filter((entry) => entry.glossary).length).toBeGreaterThan(300)
    expect(sources.agent.length).toBeGreaterThan(150)
    expect(sources.android.length).toBeGreaterThan(40)
    // Les groupes du front que le glossaire balaie existent tous (un groupe renommé ne doit pas sortir du balayage sans que cela se voie).
    expect(Object.keys(fr)).toEqual(expect.arrayContaining([...WEB_GROUPS]))
  })

  it('nomment des exemptions qui existent encore (aucune exemption périmée)', () => {
    const where = sources.agent.map((entry) => entry.where)
    for (const prefix of AGENT_EXEMPT_PATHS) {
      expect(
        where.some(
          (path) => path.endsWith(` ${prefix.join('.')}`) || path.includes(` ${prefix.join('.')}.`),
        ),
      ).toBe(true)
    }
    const names = sources.android.map((entry) => entry.where.split(' ')[1])
    for (const name of XML_EXEMPT_NAMES) expect(names).toContain(name)
  })
})

describe.each([
  ['le front web (src/i18n/fr.ts)', sources.web],
  ['l’interface de l’agent (drive-agent/src/ui/strings.ts)', sources.agent],
  ['l’application Android (strings.xml)', sources.android],
])('%s', (_name, entries) => {
  it('vouvoie partout, sans pronom ni impératif du tutoiement', () => {
    const found = entries.flatMap((entry) =>
      violations(entry.where, entry.text, { glossary: false }),
    )
    expect(found).toEqual([])
  })

  it('n’emploie aucun mot interdit du glossaire (principes-produit.md § 5), hors outils du mainteneur', () => {
    const found = entries
      .filter((entry) => entry.glossary)
      .flatMap((entry) =>
        violations(entry.where, entry.text, { glossary: true }).filter((line) =>
          line.includes('est interdit'),
        ),
      )
    expect(found).toEqual([])
  })
})

describe('le nom de l’écran « Moi »', () => {
  it('est le même pour l’onglet et le titre de la page', () => {
    expect(fr.nav.account).toBe('Moi')
    expect(fr.account.title).toBe('Moi')
    expect(fr.driveSettings.back).toBe('Moi')
  })

  it('ne se dit « Mon compte » nulle part, dans aucune des trois sources', () => {
    const found = [...sources.web, ...sources.agent, ...sources.android].filter((entry) =>
      /(?<!créer )mon compte/iu.test(entry.text),
    )
    expect(found.map((entry) => entry.where)).toEqual([])
  })
})

describe('le menu de l’application', () => {
  const xml = sources.android
  const label = (name: string) => xml.find((entry) => entry.where.endsWith(` ${name}`))?.text

  it('dit « Se déconnecter de Leclerc » : la fenêtre de confirmation détaille ce qui est effacé', () => {
    expect(label('menu_logout_drive')).toBe('Se déconnecter de Leclerc')
    expect(label('clear_message')).toContain('seront effacés')
    expect(label('clear_message_shared')).toContain('seront effacés')
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Aucun avertissement hors des conditions d'utilisation (DRV-628)
//
// Décision de l'utilisateur (2026-10-19) : « Les messages qui font peur, je ne les veux que dans des CGU, nulle part ailleurs. » L'écran sert
// l'action en cours : une phrase y reste seulement si elle dit ce qui se passe ou ce qu'il faut faire maintenant. Les risques, les
// rassurances en série, les réserves sur l'estimation et les notes de vie privée vivent dans UNE page, « Conditions d'utilisation du drive »
// (`driveTerms` de `fr.ts`), que l'on ouvre si on le veut. Ce test échoue si l'un de ces mots réapparaît ailleurs : dans le front web, dans
// l'interface de l'agent ou dans l'application Android.

// Les mots d'un avertissement, d'une rassurance ou d'une réserve : `warningWords.ts` (DRV-628, portée 5, et les formes voisines trouvées à l'inventaire).

/**
 * Les parties de `strings.ts` qui ne sont pas un écran de l'utilisateur : le rapport texte copiable du diagnostic et le test automatique de la
 * variante de débogage. Ce sont des outils du mainteneur (ils parlent de requêtes, de cookies, de panier d'essai) ; leur écran, lui, est lu.
 */
const WARNING_EXEMPT_AGENT_PATHS = [
  ['S', 'diagnostic', 'text'],
  ['S', 'diagnostic', 'probe'],
  ['S', 'selftest'],
] as const

/** Ce que le texte `text` de `where` dit de trop : le mot d'avertissement trouvé, en phrase lisible. */
export function warnings(where: string, text: string): string[] {
  const match = WARNING_WORDS.exec(text)
  return match === null
    ? []
    : [
        `${where} : « ${match[0]} » est un avertissement ou une rassurance : à l'écran, seules comptent les phrases qui disent ce qui se passe ou ce qu'il faut faire ; le reste va dans les conditions d'utilisation du drive (« ${text} »)`,
      ]
}

describe('aucun avertissement hors des conditions d’utilisation du drive (DRV-628)', () => {
  it.each([
    'Rien n’est commandé ni payé.',
    'Repas ne vide pas votre panier Leclerc.',
    'Le panier Leclerc n’est pas vidé par Repas.',
    'Repas ne voit jamais votre mot de passe.',
    'Estimation peu fiable : moins de la moitié des articles ont un prix.',
    'Repas ne devine jamais un prix.',
    'D’après les prix vus le 3 mars.',
    'Leclerc peut suspendre un compte.',
    'Le risque existe.',
    'Faites attention à votre compte.',
    'Ne relancez pas l’envoi en boucle.',
    'La cagnotte de Tickets E.Leclerc.',
    'Une vérification anti-robot.',
  ])('repère « %s »', (text) => {
    expect(warnings('essai', text)).not.toEqual([])
  })

  it.each([
    'Le panier est rempli',
    'Leclerc a ralenti les demandes.',
    'La liste ne sera plus modifiable. Vous pourrez la rouvrir.',
    'Gardez l’application ouverte.',
    'Ce qui est déjà au panier y reste.',
    '6 articles : 2 sont déjà choisis, 4 sont à choisir sur Leclerc.',
  ])('laisse passer « %s »', (text) => {
    expect(warnings('essai', text)).toEqual([])
  })

  it('lit les groupes du drive du front web, hors de la page des conditions', () => {
    // Les groupes qui ne parlent pas du drive (l'administration des comptes : « comme s'il n'avait jamais existé ») ne sont pas du parcours.
    const lues = sources.web.filter(
      (entry) =>
        WEB_GROUPS.some((group) => entry.where.includes(` ${group}.`)) &&
        !entry.where.includes(` ${TERMS_GROUP}.`),
    )
    expect(lues.length).toBeGreaterThan(300)
    expect(lues.flatMap((entry) => warnings(entry.where, entry.text))).toEqual([])
  })

  it('lit l’interface de l’agent (strings.ts), hors rapports du mainteneur', () => {
    const lues = sources.agent
      .filter((entry) => entry.where.startsWith('drive-agent/src/ui/strings.ts'))
      .filter(
        (entry) =>
          !WARNING_EXEMPT_AGENT_PATHS.some((prefix) =>
            entry.where.includes(` ${prefix.join('.')}`),
          ),
      )
    expect(lues.length).toBeGreaterThan(100)
    expect(lues.flatMap((entry) => warnings(entry.where, entry.text))).toEqual([])
  })

  it('lit l’application Android (strings.xml) en entier', () => {
    expect(sources.android.flatMap((entry) => warnings(entry.where, entry.text))).toEqual([])
  })

  it('nomme des exemptions qui existent encore (aucune exemption périmée)', () => {
    const where = sources.agent.map((entry) => entry.where)
    for (const prefix of WARNING_EXEMPT_AGENT_PATHS) {
      expect(where.some((path) => path.includes(` ${prefix.join('.')}`))).toBe(true)
    }
  })

  it('garde tout ce qui a quitté l’écran dans la page des conditions', () => {
    const terms = sources.web
      .filter((entry) => entry.where.includes(` ${TERMS_GROUP}.`))
      .map((entry) => entry.text)
      .join('\n')
      .toLowerCase()
    // Un fait de fond par ligne : la page des conditions doit encore le dire, puisque l'écran ne le dit plus.
    for (const fact of [
      'suspendre un compte',
      'cagnotte',
      'ne valide jamais de commande',
      'ne vide jamais votre panier',
      'ne réduit jamais une quantité',
      'ne voit jamais',
      'ne devine jamais un prix',
      'l’estimation est indicative',
      'touché « commencer »',
      'ne sont pas refaits',
      'attendez plusieurs heures',
    ]) {
      expect(terms.includes(fact), `la page des conditions ne dit plus « ${fact} »`).toBe(true)
    }
  })
})
