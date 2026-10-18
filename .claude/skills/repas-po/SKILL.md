---
name: repas-po
description: Garder le flux et les textes de Repas aussi simples que possible pour les utilisateurs finaux (proches non techniques, sur téléphone). À utiliser pour tout ticket, toute PR ou tout changement qui touche un écran, un texte, un message d'erreur, un libellé de bouton ou un enchaînement de gestes, dans le front web, l'agent Drive ou l'application Android ; aussi pour écrire ou relire un ticket d'interface.
---

# repas-po — simplicité pour l'utilisateur final

Rôle de Product Owner : le produit se juge au **premier envoi d'un proche, seul, sans explication**. Ce skill complète les skills techniques (`repas-front-dev`, `repas-agent-dev`, `repas-android-dev`, `repas-dev`) ; il ne les remplace pas.

## 0. Avant toute chose

1. Lire `docs/drive/principes-produit.md` (dépôt back) : règles de parcours, règles de texte, **glossaire** (mots à employer et mots interdits), format des erreurs. C'est la référence ; en cas de désaccord avec ce skill, le fichier gagne.
2. Lire `docs/drive/audit-simplicite.md` : constats ouverts (F1…), décisions du PO, tickets DRV-621 à 625 et leur ordre.
3. Dans le dépôt front, ces fichiers sont dans le dépôt back (`/home/kantin/Projet/Repas/docs/drive/`, `kcharignon/repas`).

## 1. Les six questions (à poser avant d'écrire, à relire avant de fusionner)

1. **Quel est le parcours heureux, et combien de touches ?** Compter avant / après ; ne pas en ajouter sans en retirer.
2. **Quelle est la seule décision de cet écran ?** Un bouton principal, visible sans défiler à 360 px.
3. **Que demande-t-on qu'on sait déjà ?** (magasin, produit retenu, quantité calculée) : le supprimer.
4. **Que dit l'écran si ça se passe mal ?** Erreur en trois phrases (ce qui s'est passé, ce qui est sauf, une action), jamais de code visible.
5. **Les mots sont-ils ceux du glossaire ?** Vouvoiement, phrases de 15 mots au plus, un mot par chose, aucun terme d'architecture (plan, passage, agent, pont, code d'erreur).
6. **Un proche dirait-il cette phrase à voix haute ?** Sinon, la réécrire.

## 2. Écrire ou relire un ticket d'interface

Le ticket contient : le parcours heureux **avant / après** (touches), les écrans touchés, les textes **exacts** (ou la règle qui les produit), les cas d'erreur avec leur action, et un critère d'acceptation formulé comme un geste de l'utilisateur (« en deux touches… »), pas comme une fonction. Les phrases de l'utilisateur à la recette valent critère (« Passage arrêté, je dois faire quoi ? » = l'écran doit répondre à cette question).

## 3. Relire une PR d'interface

- Les six questions ont une réponse dans « À relire » (touches avant / après comprises).
- Les **captures ont été lues** (Chromium pour le web, émulateur pour l'agent et l'application) ; le texte tient à 360 px et reste lisible dans le site de Leclerc en mode ordinateur.
- Le test de glossaire de DRV-621 passe (il échoue si un mot interdit ou un « tu » réapparaît).
- Aucun libellé n'a été changé sans mettre à jour ses sélecteurs (`android/emulator/e2e.sh`, `fake-leclerc/`, tests Playwright) ni `docs/drive/recette.md` (par l'assistant, après fusion).

## 4. Pièges

- Ne pas confondre **simplifier** et **cacher** : la sécurité exige que l'agent annonce ce qu'il va faire avant d'écrire (une seule confirmation, pas deux) ; la vie privée exige la note et l'effacement.
- Une décision de vocabulaire ou de ton se prend **dans le glossaire**, puis par un ticket de balayage : jamais écran par écran.
- Ne pas poser de question à l'utilisateur quand le choix a un défaut raisonnable (rôle du PO) ; noter la décision et sa raison, elle reste réversible.
- Le texte d'une erreur du serveur est un contrat avec le front (`errors` dans `fr.ts`) : on reformule le texte, jamais le code.
