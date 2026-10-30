// Le registre des enseignes de l'agent (DRV-704) : la SEULE liste, et, avec le dossier de chaque enseigne, le seul endroit qui la nomme. L'agent
// choisit l'adaptateur d'après l'hôte de la page (`retailerForHost`) et refuse un plan d'une autre enseigne que celle de la page (`STORE_MISMATCH`,
// sans une requête). Ajouter une enseigne : un dossier (son adaptateur), une entrée ci-dessous, et son motif d'hôte dans `protocol/check.ts`.
import { browserDeps, LeclercAdapter, type RetailerAdapter } from '../leclerc'
import { STORES } from '../../protocol'
import type { AdapterContext, RetailerEntry } from './entry'

export * from './causes'
export * from './contract'
export * from './entry'
export * from './errors'

const leclerc: RetailerEntry = {
  id: 'leclerc',
  name: 'Leclerc',
  nameDe: 'de Leclerc',
  matchesHost: (host) => STORES.leclerc.host.test(host),
  createAdapter: ({ win, primitives }: AdapterContext): RetailerAdapter =>
    new LeclercAdapter(browserDeps(win, primitives)),
}

/** Les enseignes que l'agent sait servir, dans l'ordre : la première est celle d'une page dont l'hôte n'est celui d'aucune (elle la refuse). */
export const RETAILERS: readonly RetailerEntry[] = [leclerc]

/** L'enseigne dont la page est un hôte, ou `undefined`. */
export function retailerForHost(
  host: string,
  retailers: readonly RetailerEntry[] = RETAILERS,
): RetailerEntry | undefined {
  const lower = host.toLowerCase()
  return retailers.find((entry) => entry.matchesHost(lower))
}
