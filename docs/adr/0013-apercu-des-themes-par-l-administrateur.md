# 0013 — Aperçu des thèmes par l'administrateur

- **Statut** : Accepted
- **Date** : 2026-10-28
- **Liens** : [0010](0010-theme-saisonnier-halloween.md), [0011](0011-theme-saisonnier-noel.md), [0012](0012-illustrations-de-saison.md)

## Contexte

Un thème saisonnier ne s'allume que dans ses dates. Pour le relire, le tester ou le montrer hors saison, l'administrateur n'avait pour
seul moyen que de changer la date de son appareil. Il veut en choisir un depuis « Moi », sans rien enregistrer : quand il quitte l'onglet,
le thème du moment (ou celui de base hors événement) revient.

## Décision

1. **Un aperçu en mémoire** : `useSeasonStore()` gagne `preview` (`Season | 'none' | null`), `setPreview()` et `clearPreview()`. Posé, il
   passe avant le calendrier et avant l'interrupteur « Décor de … » : `activeSeason`, donc `<html data-season>`, la couleur de
   `<meta name="theme-color">` et toutes les illustrations, le suivent. `'none'` force le thème de base ; `null` rend la main au thème du
   moment. Le calendrier (`season`) continue de se mettre à jour derrière.
2. **Jamais écrit** : ni `localStorage`, ni `sessionStorage`, ni IndexedDB, ni cookie, ni adresse, ni plugin Pinia persistant. Un
   rechargement revient donc toujours au thème du moment ; `public/theme-init.js` n'est pas touché.
3. **Effacé en quittant** : quand la page devient cachée (`visibilitychange`, `hidden`) et sur `pagehide` (`followSeason`) ; à la
   déconnexion et si le compte cesse d'être administrateur (le store suit `session.isAdmin`). Redevenir visible ou minuit ne touche
   jamais un aperçu posé.
4. **Réservé à l'administrateur, dans le store** : `setPreview()` ignore l'appel d'un utilisateur qui n'est pas administrateur (masquer
   la vue ne suffirait pas). La section de « Moi » (`AccountView`) n'existe que pour `session.isAdmin`, sous le choix clair/sombre.
5. **Piloté par `SEASONS`** : les pastilles sont « Thème du moment », « Sans décor », puis une par saison de `SEASONS` (`season.name.<saison>`
   pour le nom). Une saison nouvelle ajoute son entrée de données et sa clé de libellé, aucune vue ne change ; un test énumère `SEASONS`
   et exige le libellé et le pack d'illustrations.
6. **Cosmétique côté client** : aucune requête, aucun changement du contrat d'API, rien dans le back.

## Conséquences

- Positives : toutes les saisons se revoient à tout moment de l'année, sur l'appareil réel, sans bricoler l'horloge ; rien ne persiste,
  donc aucun risque de rester coincé dans un thème hors saison.
- Négatives / limites connues : un utilisateur ordinaire ne peut pas l'obtenir (voulu) ; passer sur une autre application ou verrouiller
  l'écran efface l'aperçu (voulu) ; l'interrupteur « Décor de … » reste celui de la saison du calendrier, sans effet pendant un aperçu.

## Alternatives écartées

- Un stockage de session ou local : l'aperçu survivrait à un rechargement ou à une réouverture, contre la demande, et un thème hors
  saison resterait collé.
- Un paramètre d'URL (`?season=noel`) : il se partage et s'ouvre sans compte administrateur, et obligerait à l'écrire dans l'adresse.
- Ne masquer que la vue : le store resterait pilotable par un non-administrateur.
