import type { WindowPrimitives } from '../primitives'
import type { RetailerAdapter } from './contract'
import type { RetailerInfo } from './names'

/** Ce dont un adaptateur a besoin pour naître dans une page : la fenêtre et ses primitives prises au démarrage de l'agent. */
export interface AdapterContext {
  win: Window & typeof globalThis
  primitives: WindowPrimitives
}

/** Le site mobile ou ordinateur d'une enseigne (`siteMode` du contrat des enseignes) : `AS_IS` : un seul site adaptatif, l'application ne change rien. */
export type SiteMode = 'DESKTOP' | 'MOBILE' | 'AS_IS'

/** L'anti-robot d'une enseigne (`antiBot`), une information pour l'exploitation. */
export type AntiBot = 'DATADOME' | 'OTHER' | 'UNKNOWN'

/**
 * La cadence de départ d'une enseigne : la pause entre deux requêtes, la gigue ajoutée (de 0 à `jitterMs`) et le plafond de la pause (gigue comprise)
 * quand le site ralentit. `measured` : vrai quand les chiffres ont été réglés sur le vrai site, faux tant qu'ils ne sont que prudents.
 */
export interface Pacing {
  readonly pauseMs: number
  readonly jitterMs: number
  readonly maxPauseMs: number
  readonly measured: boolean
}

/**
 * Une enseigne du registre (`index.ts`, la seule liste). `id` : l'identifiant du protocole (`plan.retailer`), `name` et `nameDe` : le nom que les
 * proches disent (« Leclerc », « de Leclerc »), comme dans le contrat du back (`retailers.sample.json`).
 */
export interface RetailerEntry extends RetailerInfo {
  readonly siteMode: SiteMode
  readonly antiBot: AntiBot
  readonly pacing: Pacing
  createAdapter(context: AdapterContext): RetailerAdapter
}
