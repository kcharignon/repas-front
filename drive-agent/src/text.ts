// Le texte lu sur la page de l'enseigne est une donnée non fiable : un libellé qui porte un caractère invisible ou de contrôle (trait d'union
// conditionnel, largeur nulle, sens de lecture inversé, saut de ligne, marque d'ordre des octets…) est refusé par le back, qui rejette alors
// EN BLOC les choix de tout le passage (`422 DRIVE_CHOICE_INVALID` sur `PUT /drive/choices`, revue de sécurité du back, défaut D2). L'agent
// les retire donc à la lecture. La fonction et la liste des caractères refusés sont dans le protocole (`../protocol/clean-text.ts`), que le
// front partage : il les retire aussi avant d'écrire, pour un agent plus ancien.
export { cleanText } from '../protocol/clean-text'
