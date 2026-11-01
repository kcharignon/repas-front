// Ce que la carte « Connecte-toi » dit de plus pour Leclerc (DRV-754, voix de `repas-po` : tutoiement, quinze mots au plus par phrase, aucun jargon).
// Faits mesurés le 2026-11-01 sur la version mobile : « Connexion / Inscription » du menu de `m-courses` ouvre d'abord la CRÉATION de compte (la connexion y est un
// lien « Me connecter »), puis, après l'e-mail, le mot de passe et la vérification « Je suis un humain », Leclerc ouvre une fenêtre « Saisissez le code reçu par
// e-mail » (six chiffres). L'agent ne lit, ne saisit et ne devine jamais ce code, ne touche ni la vérification ni la case « plus de code sur cet appareil » : il
// prépare seulement la personne.
export const LOGIN_NOTES: readonly string[] = [
  'La page peut te proposer de créer un compte : cherche « Me connecter ».',
  'Leclerc peut t’envoyer un code par e-mail : tape-le dans la page.',
]
