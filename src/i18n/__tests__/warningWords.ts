// Les mots d'un avertissement, d'une rassurance ou d'une réserve (DRV-628). Partagé par `voice-and-glossary.spec.ts` (tous les textes du
// front, de l'agent et de l'application) et par `src/features/drive/__tests__/simpleScreens.spec.ts` (les écrans rendus).
//
// Décision de l'utilisateur (2026-10-19) : « Les messages qui font peur, je ne les veux que dans des CGU, nulle part ailleurs. » Ils vivent
// dans la page des conditions d'utilisation du drive (`driveTerms` de `fr.ts`) et nulle part ailleurs.
export const WARNING_WORDS =
  /risque|suspen|attention|jamais|ne voit|peu fiable|ni commandé|commandé ni payé|ni payé|n['’]est pas vidé|ne vide pas|rien ne part|cagnotte|anti-?robot|en boucle|ne devine|d['’]après les prix/iu
