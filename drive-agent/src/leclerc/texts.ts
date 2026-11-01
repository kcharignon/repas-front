import { WALL_TEXT } from '../retailers/consent'
import type { GuideSub, GuideSubText } from '../retailers/guide'

// Ce que la carte « Connecte-toi » dit de plus pour Leclerc (DRV-754, voix de `repas-po` : tutoiement, quinze mots au plus par phrase, aucun jargon).
// Faits mesurés le 2026-11-01 sur la version mobile : « Connexion / Inscription » du menu de `m-courses` ouvre d'abord la CRÉATION de compte (la connexion y est un
// lien « Me connecter »), puis, après l'e-mail, le mot de passe et la vérification « Je suis un humain », Leclerc ouvre une fenêtre « Saisissez le code reçu par
// e-mail » (six chiffres). L'agent ne lit, ne saisit et ne devine jamais ce code, ne touche ni la vérification ni la case « plus de code sur cet appareil » : il
// prépare seulement la personne.
export const LOGIN_NOTES: readonly string[] = [
  'La page peut te proposer de créer un compte : cherche « Me connecter ».',
  'Leclerc peut t’envoyer un code par e-mail : tape-le dans la page.',
]

/**
 * Les mots de chaque sous-étape du guide pour Leclerc (DRV-757, voix de `repas-po` : tutoiement, quinze mots au plus par phrase, aucun jargon, des mots différents à chaque
 * étape). Chaque sous-étape se lit dans la page (`guide-look.ts`) ; `short` est la ligne de la barre réduite. « la flèche » : le bouton rond à flèche de chaque magasin (mesuré
 * le 2026-11-01). La carte garde sa phrase générale quand la page ne dit pas où en est la personne.
 */
export const GUIDE_TEXTS: Readonly<Partial<Record<GuideSub, GuideSubText>>> = {
  wall: WALL_TEXT,
  field: { text: 'Écris ton code postal dans la page.', short: 'Écris ton code postal' },
  city: { text: 'Touche ta ville dans la liste.', short: 'Touche ta ville' },
  shop: { text: 'Touche la flèche de ton magasin.', short: 'Touche ton magasin' },
  menu: { text: 'Ouvre le menu, en haut de la page.', short: 'Ouvre le menu' },
  connexion: { text: 'Touche « Connexion » dans le menu.', short: 'Touche « Connexion »' },
  signup: {
    text: 'Tu es sur la création de compte. Touche « Me connecter ».',
    short: 'Touche « Me connecter »',
  },
  form: {
    text: 'Écris ton e-mail, puis ton mot de passe. Tu les tapes toi-même.',
    short: 'Écris tes identifiants',
  },
  email: {
    text: 'Écris ton adresse e-mail, puis touche « Continuer ».',
    short: 'Écris ton e-mail',
  },
  password: {
    text: 'Écris ton mot de passe, puis coche « Je suis un humain ».',
    short: 'Écris ton mot de passe',
  },
  human: {
    text: 'Fais la vérification qui s’affiche.',
    short: 'Fais la vérification',
  },
  code: {
    text: 'Leclerc t’a envoyé un code par e-mail. Tape-le dans la page.',
    short: 'Tape ton code',
  },
}
