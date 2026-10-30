/**
 * La cadence de départ d'Auchan (DRV-715 § 2 point 7) : **NON MESURÉE au-delà de ce qui a été essayé** (huit recherches espacées de 2 s, des écritures
 * espacées de 2,5 s, toutes en `200`). Les chiffres de départ sont prudents ; ils se règlent à la recette réelle (DRV-726), pas avant.
 */
export const PACING = {
  pauseMs: 2_000,
  jitterMs: 1_000,
  maxPauseMs: 4_000,
  measured: false,
} as const
