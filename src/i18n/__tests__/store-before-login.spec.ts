// @vitest-environment node
// Le magasin d'abord, la connexion ensuite. Recette réelle (2026-10-19) : l'application disait « Connecte-toi à Leclerc si besoin, puis choisis ton
// magasin » ; l'utilisatrice touchait « Se connecter » en premier, et Leclerc répondait « Avant de vous authentifier, veuillez sélectionner un
// Drive. » : le site exige un magasin choisi AVANT la connexion. Ce test échoue si un texte qui fait lire ou choisir le magasin (le bandeau de
// l'application, les réglages du drive, l'interface de l'agent) parle de connexion avant le magasin, ou si les messages qui ne servent qu'à choisir
// le magasin parlent de connexion tout court : la connexion n'est demandée que par l'agent, quand elle manque (erreur « Tu n'es pas connecté »).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import fr from '@/i18n/fr'
import { S } from '../../../drive-agent/src/ui/strings'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** Un mot de la connexion : « connecte-toi », « connecter », « identifiant », « authentifier », « mot de passe ». */
const CONNECTION =
  /(?<![\p{L}\d_])(?:(?:re)?connect\p{L}*|identifi\p{L}*|authentifi\p{L}*|mot de passe)(?![\p{L}\d_])/iu
const STORE = /(?<![\p{L}\d_])magasin(?![\p{L}\d_])/iu

/** Le texte parle de connexion avant d'avoir parlé du magasin (ou parle de connexion sans parler du magasin). */
export function connectionBeforeStore(text: string): boolean {
  const connection = CONNECTION.exec(text)
  if (connection === null) return false
  const store = STORE.exec(text)
  return store === null || connection.index < store.index
}

/** Le texte parle de connexion, où que ce soit. */
export function mentionsConnection(text: string): boolean {
  return CONNECTION.test(text)
}

interface Entry {
  readonly where: string
  readonly text: string
}

function strings(prefix: string, value: unknown): Entry[] {
  if (typeof value === 'string') return [{ where: prefix, text: value }]
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, child]) => strings(`${prefix}.${key}`, child))
}

/** Les entrées de `strings.xml`, par nom. */
function androidTexts(): Map<string, string> {
  const xml = readFileSync(
    join(root, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml'),
    'utf8',
  )
  return new Map(
    [...xml.matchAll(/<string name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)].map((match) => [
      match[1] ?? '',
      (match[2] ?? '').replace(/\\'/g, "'").replace(/&amp;/g, '&'),
    ]),
  )
}

const android = androidTexts()
const androidText = (name: string): string => {
  const text = android.get(name)
  if (text === undefined) throw new Error(`strings.xml n’a plus d’entrée « ${name} »`)
  return text
}

/**
 * Les messages qui ne servent qu'à choisir ou à ouvrir son magasin : ils ne parlent pas de connexion du tout. Le bandeau de la lecture du magasin,
 * celui de l'envoi, celui de la page de connexion trop tôt, l'aide des réglages et les textes de l'agent qui lisent ou ouvrent le magasin.
 */
const STORE_ONLY: readonly Entry[] = [
  { where: 'strings.xml setup_banner', text: androidText('setup_banner') },
  { where: 'strings.xml store_first_banner', text: androidText('store_first_banner') },
  { where: 'strings.xml plan_banner_open', text: androidText('plan_banner_open') },
  { where: 'fr.ts driveSettings.chooseTitle', text: fr.driveSettings.chooseTitle },
  { where: 'fr.ts driveSettings.chooseHelp', text: fr.driveSettings.chooseHelp },
  { where: 'fr.ts driveSettings.choose', text: fr.driveSettings.choose },
  { where: 'fr.ts driveSettings.read', text: fr.driveSettings.read },
  { where: 'fr.ts driveSettings.change', text: fr.driveSettings.change },
  { where: 'fr.ts driveSettings.readHelp', text: fr.driveSettings.readHelp },
  ...strings('agent S.store', S.store),
  ...strings('agent S.entry', S.entry),
]

/** Tous les textes qui touchent au magasin et peuvent parler de connexion, à condition de ne le faire qu'après le magasin. */
const STORE_THEN_LOGIN: readonly Entry[] = [
  ...STORE_ONLY,
  { where: 'strings.xml resume_setup_message', text: androidText('resume_setup_message') },
  { where: 'strings.xml abandon_setup_message', text: androidText('abandon_setup_message') },
  { where: 'fr.ts driveHelp.firstLogin.store', text: fr.driveHelp.firstLogin.store },
  { where: 'fr.ts driveHelp.firstLogin.login', text: fr.driveHelp.firstLogin.login },
  { where: 'fr.ts driveHelp.problems.login.a', text: fr.driveHelp.problems.login.a },
]

describe('le détecteur lui-même (il ne doit pas devenir aveugle)', () => {
  it.each([
    // L'ancien bandeau de la lecture du magasin, celui de la capture de l'utilisatrice
    'Connecte-toi à Leclerc si besoin, puis choisis ton magasin. Le bouton retour du téléphone annule.',
    'Connecte-toi à Leclerc, puis choisis ton magasin.',
    'Identifie-toi, puis choisis ton magasin.',
    'Saisis ton mot de passe, puis choisis ton magasin.',
    'Reconnecte-toi, puis choisis ton magasin.',
    // Parler de connexion sans parler du magasin
    'Connecte-toi si besoin, puis touche « Commencer mes courses ».',
  ])('trouve la connexion avant le magasin dans « %s »', (text) => {
    expect(connectionBeforeStore(text)).toBe(true)
  })

  it.each([
    'Choisis ton magasin, puis touche « Utiliser ce magasin ». Le bouton retour du téléphone annule.',
    'Choisis d’abord ton magasin : touche la flèche retour de la page, puis choisis-le.',
    'Touche « Commencer mes courses ».',
    'Choisis ton magasin, puis connecte-toi.',
    'Une fois ton magasin ouvert, connecte-toi à ton compte E.Leclerc.',
  ])('laisse passer « %s »', (text) => {
    expect(connectionBeforeStore(text)).toBe(false)
  })

  it('distingue « parler de connexion » de « parler de connexion avant le magasin »', () => {
    expect(mentionsConnection('Choisis ton magasin, puis connecte-toi.')).toBe(true)
    expect(mentionsConnection('Choisis ton magasin, puis touche « Utiliser ce magasin ».')).toBe(
      false,
    )
  })
})

describe('le magasin d’abord, la connexion ensuite (Leclerc refuse la connexion sans magasin)', () => {
  it('lit des textes en nombre : un renommage ne vide pas la garde', () => {
    expect(STORE_ONLY.length).toBeGreaterThan(10)
    expect(STORE_THEN_LOGIN.length).toBeGreaterThan(STORE_ONLY.length)
    expect(STORE_THEN_LOGIN.filter((entry) => entry.text.trim() === '')).toEqual([])
  })

  it('aucun texte du magasin ne parle de connexion avant le magasin', () => {
    expect(
      STORE_THEN_LOGIN.filter((entry) => connectionBeforeStore(entry.text)).map(
        (entry) => `${entry.where} : « ${entry.text} »`,
      ),
    ).toEqual([])
  })

  it('les messages qui font choisir le magasin ne parlent pas de connexion du tout', () => {
    expect(
      STORE_ONLY.filter((entry) => mentionsConnection(entry.text)).map(
        (entry) => `${entry.where} : « ${entry.text} »`,
      ),
    ).toEqual([])
  })

  it('le bandeau de la lecture du magasin dit de choisir le magasin, puis de toucher « Utiliser ce magasin »', () => {
    expect(androidText('setup_banner')).toMatch(/^Choisis ton magasin, puis touche/)
    expect(androidText('setup_banner')).toContain(`« ${S.store.save} »`)
    expect(fr.driveSettings.readHelp).toBe(`Choisis ton magasin, puis touche « ${S.store.save} ».`)
  })

  it('le bandeau de l’envoi dit seulement de toucher « Commencer mes courses »', () => {
    expect(androidText('plan_banner_open')).toBe('Touche « Commencer mes courses ».')
    expect(S.entry.manual).toBe(androidText('plan_banner_open'))
  })

  it('la page de connexion avant tout magasin ramène au choix du magasin', () => {
    const text = androidText('store_first_banner')
    expect(text).toMatch(/^Choisis d’abord ton magasin/)
    expect(text).toContain('flèche retour')
  })

  it('l’agent ne demande la connexion que lorsqu’elle manque', () => {
    // Le seul texte de l'agent qui demande de se connecter est l'erreur « Tu n'es pas connecté » (l'envoi s'arrête, rien n'est perdu).
    const asksLogin = strings('agent S', S)
      .filter((entry) => mentionsConnection(entry.text))
      .filter((entry) => !/\.(diagnostic|selftest)\./.test(entry.where))
    expect(asksLogin.map((entry) => entry.where)).toEqual([])
  })
})
