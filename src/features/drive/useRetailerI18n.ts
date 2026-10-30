import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useRetailer } from './queries'
import { retailerOf, retailerParams } from './retailers'
import type { RetailerId } from './retailers'

/**
 * `t` de vue-i18n, qui connaît déjà l'enseigne du drive de l'utilisateur : `{retailer}` (« Leclerc »), `{retailerDe}` (« de Leclerc »), `{appName}` et
 * `{storeExample}` sont posés pour chaque texte (DRV-708), les valeurs nommées de l'appel les complètent. Un écran du drive l'emploie à la place de
 * `useI18n()` : aucun texte ne nomme une enseigne. `retailer` rend l'enseigne elle-même (règles, accueil du drive).
 *
 * `override` (DRV-710) : l'enseigne de CET envoi quand elle n'est pas celle des réglages (la tuile touchée, le drive du brouillon) ; `undefined` : celle des
 * réglages, comme avant.
 */
export function useRetailerI18n(override: () => RetailerId | undefined = () => undefined) {
  const { t: translate } = useI18n()
  const settingsRetailer = useRetailer()
  const retailer = computed(() => {
    const id = override()

    return id === undefined ? settingsRetailer.value : retailerOf(id)
  })
  const t = (key: string, named: Record<string, unknown> = {}, plural?: number): string =>
    plural === undefined
      ? translate(key, { ...retailerParams(retailer.value), ...named })
      : translate(key, { ...retailerParams(retailer.value), ...named }, plural)

  return { t, retailer }
}
