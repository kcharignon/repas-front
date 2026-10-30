// Les enseignes des tests : Leclerc, celle du registre (ses textes doivent rester mot pour mot ceux d'avant), et une enseigne fictive à l'élision
// différente (« d’Exemple ») qui prouve que le nom vient du paramètre, jamais du texte (DRV-705).
import { RETAILERS, type RetailerInfo } from '../src/retailers'

const found = RETAILERS.find((entry) => entry.id === 'leclerc')
if (found === undefined) throw new Error('le registre de l’agent n’a plus l’enseigne « leclerc »')

/** L'enseigne du registre : ses textes sont ceux de l'agent publié. */
export const LECLERC: RetailerInfo = found

/** Une enseigne fictive : un nom qui commence par une voyelle, donc une forme avec « de » élidée. */
export const EXEMPLE: RetailerInfo = {
  id: 'exemple',
  name: 'Exemple',
  nameDe: 'd’Exemple',
  siteDomain: 'exemple.invalid',
  matchesHost: (host) => host.endsWith('.exemple.invalid'),
  hostFamily: (host) => /^(zz\d{1,3})-courses\.exemple\.invalid$/.exec(host)?.[1] ?? null,
  isMobileHost: (host) => host.startsWith('m-'),
}
