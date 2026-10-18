// Lance le faux site Leclerc à la main : `make agent-fake` (ou `npm run agent:fake`). Les tests, eux, le démarrent eux-mêmes (`server.ts`).
//   FAKE_LECLERC_PORT   port d'écoute sur 127.0.0.1 (8099 par défaut)
//   FAKE_LECLERC_HOSTS  noms d'hôte à accepter en plus de courses-test.leclercdrive.fr, séparés par des virgules : d'autres faux magasins, et
//                       www.leclercdrive.fr (l'accueil de l'enseigne, où l'application Android ouvre un plan)
import process from 'node:process'

import { HOME_HOST, PAGE_PATH, startFakeLeclerc } from './server.ts'

const port = Number(process.env.FAKE_LECLERC_PORT ?? 8099)
const hosts = (process.env.FAKE_LECLERC_HOSTS ?? '').split(',').filter(Boolean)
const fake = await startFakeLeclerc({ port, hosts })

console.log(
  `Faux site Leclerc (données inventées) sur 127.0.0.1:${fake.port}, accès local seulement.`,
)
console.log(
  `  magasin : ${fake.leclerc}${PAGE_PATH}/  (ce nom d'hôte doit pointer vers 127.0.0.1 chez le client)`,
)
console.log(
  `  accueil de l'enseigne : http://${HOME_HOST}:${fake.port}/  (avec FAKE_LECLERC_HOSTS=${HOME_HOST} ; la racine de l'hôte du magasin est une page 404, comme sur le vrai site)`,
)
console.log(`  faux Repas (retour) : ${fake.repas}/drive/retour`)
console.log(
  `  état : ${fake.repas}/__fake/state   comportement : POST ${fake.repas}/__fake/behavior`,
)

const stop = () => void fake.close().then(() => process.exit(0))
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
