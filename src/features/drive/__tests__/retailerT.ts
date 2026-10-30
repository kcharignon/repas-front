import { i18n } from '@/i18n'

import { DEFAULT_RETAILER, retailerParams } from '../retailers'
import type { Retailer } from '../retailers'
import type { sendSummary } from '../sendSummary'

/** Le `t` d'un écran du drive pour une enseigne (Leclerc par défaut) : le nom vient du registre, comme à l'écran (`useRetailerI18n`). */
export const translateFor =
  (retailer: Retailer = DEFAULT_RETAILER) =>
  (key: string, named: Record<string, unknown> = {}, plural?: number): string =>
    plural === undefined
      ? i18n.global.t(key, { ...retailerParams(retailer), ...named })
      : i18n.global.t(key, { ...retailerParams(retailer), ...named }, plural)

export const t = translateFor() as unknown as Parameters<typeof sendSummary>[0]
