import type { WindowPrimitives } from '../primitives'
import type { RetailerAdapter } from './contract'
import type { RetailerInfo } from './names'

/** Ce dont un adaptateur a besoin pour naître dans une page : la fenêtre et ses primitives prises au démarrage de l'agent. */
export interface AdapterContext {
  win: Window & typeof globalThis
  primitives: WindowPrimitives
}

/**
 * Une enseigne du registre (`index.ts`, la seule liste). `id` : l'identifiant du protocole (`plan.retailer`), `name` et `nameDe` : le nom que les
 * proches disent (« Leclerc », « de Leclerc »), comme dans le contrat du back (`retailers.sample.json`).
 */
export interface RetailerEntry extends RetailerInfo {
  createAdapter(context: AdapterContext): RetailerAdapter
}
