// Le registre des enseignes de l'agent (DRV-704) : la SEULE liste, et, avec le dossier de chaque enseigne, le seul endroit qui la nomme. L'agent
// choisit l'adaptateur d'après l'hôte de la page (`retailerForHost`) et refuse un plan d'une autre enseigne que celle de la page (`STORE_MISMATCH`,
// sans une requête). Ajouter une enseigne : un dossier (son adaptateur), une entrée ci-dessous, et son motif d'hôte dans `protocol/check.ts`.
import {
  AuchanAdapter,
  browserDeps as auchanBrowserDeps,
  hostFamily as auchanHostFamily,
  isMobileHost as auchanIsMobileHost,
  PACING as AUCHAN_PACING,
  PHOTO_RULE as AUCHAN_PHOTOS,
} from '../auchan'
import {
  browserDeps,
  hostFamily,
  isMobileHost,
  JITTER_MS,
  LeclercAdapter,
  MAX_PAUSE_MS,
  PAUSE_MS,
  PHOTO_RULE as LECLERC_PHOTOS,
  type RetailerAdapter,
} from '../leclerc'
import { STORES } from '../../protocol'
import type { AdapterContext, RetailerEntry } from './entry'

export * from './cart-facts'
export * from './causes'
export * from './contract'
export * from './entry'
export * from './guide'
export * from './names'
export * from './errors'
export * from './store-facts'

const leclerc: RetailerEntry = {
  id: 'leclerc',
  name: 'Leclerc',
  nameDe: 'de Leclerc',
  siteDomain: 'leclercdrive.fr',
  photos: LECLERC_PHOTOS,
  matchesHost: (host) => STORES.leclerc.host.test(host),
  hostFamily,
  isMobileHost,
  siteMode: 'DESKTOP',
  antiBot: 'DATADOME',
  pacing: { pauseMs: PAUSE_MS, jitterMs: JITTER_MS, maxPauseMs: MAX_PAUSE_MS, measured: true },
  createAdapter: ({ win, primitives }: AdapterContext): RetailerAdapter =>
    new LeclercAdapter(browserDeps(win, primitives)),
}

// Auchan (DRV-727, DRV-717) : déclarée, adaptateur écrit pour le magasin, la connexion et l'entrée (la recherche et le panier : DRV-724, DRV-725). Elle ne répond
// que sur `www.auchan.fr`, jamais sur la page du mot de passe.
const auchan: RetailerEntry = {
  id: 'auchan',
  name: 'Auchan',
  nameDe: 'd’Auchan',
  siteDomain: 'auchan.fr',
  photos: AUCHAN_PHOTOS,
  matchesHost: (host) => STORES.auchan.host.test(host),
  hostFamily: auchanHostFamily,
  isMobileHost: auchanIsMobileHost,
  siteMode: 'AS_IS',
  antiBot: 'DATADOME',
  pacing: AUCHAN_PACING,
  createAdapter: ({ win, primitives }: AdapterContext): RetailerAdapter =>
    new AuchanAdapter(auchanBrowserDeps(win, primitives)),
}

/** Les enseignes que l'agent sait servir, dans l'ordre : la première est celle d'une page dont l'hôte n'est celui d'aucune (elle la refuse). */
export const RETAILERS: readonly RetailerEntry[] = [leclerc, auchan]

/** L'enseigne dont la page est un hôte, ou `undefined`. */
export function retailerForHost(
  host: string,
  retailers: readonly RetailerEntry[] = RETAILERS,
): RetailerEntry | undefined {
  const lower = host.toLowerCase()
  return retailers.find((entry) => entry.matchesHost(lower))
}
