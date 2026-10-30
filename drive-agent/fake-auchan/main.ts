// Lance le faux site d'Auchan à la main : `make agent-fake-auchan` (ou `npm run agent:fake-auchan`). Les tests, eux, le démarrent eux-mêmes (`server.ts`).
//   FAKE_AUCHAN_PORT   port d'écoute sur 127.0.0.1 (8098 par défaut)
//   FAKE_AUCHAN_HOSTS  noms d'hôte à accepter en plus de www.auchan.fr, séparés par des virgules
import process from 'node:process'

import { startFakeAuchan } from './server.ts'

const port = Number(process.env.FAKE_AUCHAN_PORT ?? 8098)
const hosts = (process.env.FAKE_AUCHAN_HOSTS ?? '').split(',').filter(Boolean)
const fake = await startFakeAuchan({ port, hosts })

console.log(
  `Faux site d'Auchan (données inventées) sur 127.0.0.1:${fake.port}, accès local seulement.`,
)
console.log(
  `  site : ${fake.site}/courses  (ce nom d'hôte doit pointer vers 127.0.0.1 chez le client)`,
)
console.log(
  `  état : ${fake.control}/__fake/state   comportement : POST ${fake.control}/__fake/behavior`,
)

const stop = () => void fake.close().then(() => process.exit(0))
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
