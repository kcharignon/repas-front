import type { WindowPrimitives } from '../primitives'
import type { RetailerAdapter } from './contract'

/** Ce dont un adaptateur a besoin pour naître dans une page : la fenêtre et ses primitives prises au démarrage de l'agent. */
export interface AdapterContext {
  win: Window & typeof globalThis
  primitives: WindowPrimitives
}

/**
 * Une enseigne du registre (`index.ts`, la seule liste). `id` : l'identifiant du protocole (`plan.retailer`), `name` et `nameDe` : le nom que les
 * proches disent (« Leclerc », « de Leclerc »), comme dans le contrat du back (`retailers.sample.json`).
 */
export interface RetailerEntry {
  readonly id: string
  readonly name: string
  readonly nameDe: string
  /** Vrai : cet hôte de page est un hôte de cette enseigne (en minuscules). */
  matchesHost(host: string): boolean
  createAdapter(context: AdapterContext): RetailerAdapter
}
