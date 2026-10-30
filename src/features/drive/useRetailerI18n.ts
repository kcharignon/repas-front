import { useI18n } from 'vue-i18n'

import { useRetailer } from './queries'
import { retailerParams } from './retailers'

/**
 * `t` de vue-i18n, qui connaît déjà l'enseigne du drive de l'utilisateur : `{retailer}` (« Leclerc »), `{retailerDe}` (« de Leclerc »), `{appName}` et
 * `{storeExample}` sont posés pour chaque texte (DRV-708), les valeurs nommées de l'appel les complètent. Un écran du drive l'emploie à la place de
 * `useI18n()` : aucun texte ne nomme une enseigne. `retailer` rend l'enseigne elle-même (règles, accueil du drive).
 */
export function useRetailerI18n() {
  const { t: translate } = useI18n()
  const retailer = useRetailer()
  const t = (key: string, named: Record<string, unknown> = {}, plural?: number): string =>
    plural === undefined
      ? translate(key, { ...retailerParams(retailer.value), ...named })
      : translate(key, { ...retailerParams(retailer.value), ...named }, plural)

  return { t, retailer }
}
