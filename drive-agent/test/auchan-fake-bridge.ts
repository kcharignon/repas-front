// Un `fetch` qui parle au VRAI faux site d'Auchan (`fake-auchan/`, sur 127.0.0.1) par `node:http` : l'adaptateur réel et le faux site se rencontrent sans navigateur
// (DRV-725). `fetch` ne laisse pas choisir l'en-tête `Host`, que le faux site exige : d'où `node:http`. Aucune requête ne sort du poste.
import { request as httpRequest } from 'node:http'

import type { FakeAuchan } from '../fake-auchan/server'
import type { FetchFn } from '../src/retailers'

/** Le `fetch` de la page : les chemins relatifs vont au faux site, sous le nom d'hôte de l'enseigne, avec les en-têtes que l'adaptateur donne. */
export function bridgeTo(fake: FakeAuchan): FetchFn {
  return (path, init = {}) =>
    new Promise((resolve, reject) => {
      const headers: Record<string, string> = { host: `www.auchan.fr:${fake.port}` }
      for (const [name, value] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
        headers[name] = value
      }
      const request = httpRequest(
        { host: '127.0.0.1', port: fake.port, path, method: init.method ?? 'GET', headers },
        (response) => {
          const chunks: Buffer[] = []
          response.on('data', (chunk: Buffer) => chunks.push(chunk))
          response.on('end', () => {
            const out = new Headers()
            for (const [name, value] of Object.entries(response.headers)) {
              if (typeof value === 'string') out.set(name, value)
            }
            const text = Buffer.concat(chunks).toString('utf8')
            resolve({
              status: response.statusCode ?? 0,
              url: `https://www.auchan.fr${path}`,
              redirected: false,
              headers: out,
              text: () => Promise.resolve(text),
            } as unknown as Response)
          })
        },
      )
      request.on('error', reject)
      request.end(typeof init.body === 'string' ? init.body : undefined)
    })
}
